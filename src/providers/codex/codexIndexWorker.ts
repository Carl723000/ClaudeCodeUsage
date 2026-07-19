import { parentPort } from 'node:worker_threads';

import {
  CodexIndexCancelledError,
  loadCodexIndex,
  saveCodexIndexAtomic,
  updateCodexIndex,
} from './codexIndex';
import { scanCodexManifest } from './codexManifest';
import {
  CodexWorkerMessage,
  CodexWorkerRequest,
} from './codexWorkerProtocol';

const cancelled = new Set<string>();
let activeRequestId: string | null = null;

function post(message: CodexWorkerMessage): void {
  parentPort?.postMessage(message);
}

function safeError(
  requestId: string,
  error: unknown,
): Extract<CodexWorkerMessage, { type: 'error' }> {
  if (error instanceof CodexIndexCancelledError) {
    return {
      type: 'error',
      requestId,
      error: { code: 'cancelled', message: 'Codex indexing was cancelled' },
    };
  }
  return {
    type: 'error',
    requestId,
    error: {
      code: 'refresh-failed',
      message: 'Codex usage refresh could not be completed',
    },
  };
}

async function runRefresh(
  request: Extract<CodexWorkerRequest, { type: 'refresh' }>,
): Promise<void> {
  if (activeRequestId) {
    post({
      type: 'error',
      requestId: request.requestId,
      error: {
        code: 'busy',
        message: 'A Codex usage refresh is already running',
      },
    });
    return;
  }
  activeRequestId = request.requestId;
  try {
    const metadataStarted = Date.now();
    const [previous, manifest] = await Promise.all([
      loadCodexIndex(request.indexPath),
      scanCodexManifest(request.codexHome, request.salt),
    ]);
    const metadataMs = Date.now() - metadataStarted;
    const parseStarted = Date.now();
    const updated = await updateCodexIndex(previous, manifest, {
      salt: request.salt,
      shouldCancel: () => cancelled.has(request.requestId),
      onProgress: (progress) =>
        post({
          type: 'progress',
          requestId: request.requestId,
          progress,
        }),
    });
    if (cancelled.has(request.requestId)) {
      throw new CodexIndexCancelledError();
    }
    await saveCodexIndexAtomic(request.indexPath, updated.index);
    post({
      type: 'result',
      requestId: request.requestId,
      result: {
        ...updated,
        metadataMs,
        parseMs: Date.now() - parseStarted,
      },
    });
  } catch (error) {
    post(safeError(request.requestId, error));
  } finally {
    cancelled.delete(request.requestId);
    activeRequestId = null;
  }
}

parentPort?.on('message', (request: CodexWorkerRequest) => {
  if (request.type === 'cancel') {
    cancelled.add(request.requestId);
    return;
  }
  void runRefresh(request);
});
