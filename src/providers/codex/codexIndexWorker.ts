import { parentPort } from 'node:worker_threads';

import {
  CODEX_REFRESH_MAX_BYTES,
  CODEX_REFRESH_MAX_FILE_PASSES,
  CodexIndexCancelledError,
  CodexIndexRecovery,
  loadCodexIndex,
  saveCodexIndexAtomic,
  updateCodexIndex,
} from './codexIndex';
import { scanCodexManifest } from './codexManifest';
import {
  CodexWorkerMessage,
  CodexWorkerRequest,
  CodexWorkerResult,
} from './codexWorkerProtocol';
import {
  CodexIndexLeaseBusyError,
  CodexIndexLeaseCancelledError,
  acquireCodexIndexLease,
} from './codexIndexLease';

const cancelled = new Set<string>();
let activeRequestId: string | null = null;

function post(message: CodexWorkerMessage): void {
  parentPort?.postMessage(message);
}

function safeError(
  requestId: string,
  error: unknown,
): Extract<CodexWorkerMessage, { type: 'error' }> {
  if (
    error instanceof CodexIndexCancelledError ||
    error instanceof CodexIndexLeaseCancelledError
  ) {
    return {
      type: 'error',
      requestId,
      error: { code: 'cancelled', message: 'Codex indexing was cancelled' },
    };
  }
  if (error instanceof CodexIndexLeaseBusyError) {
    return {
      type: 'error',
      requestId,
      error: {
        code: 'busy',
        message: 'Another Codex usage refresh is already running',
      },
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

export interface CodexWorkerRefreshRuntime {
  isCancelled(): boolean;
  post(message: CodexWorkerMessage): void;
  acquireCodexIndexLease: typeof acquireCodexIndexLease;
  loadCodexIndex: typeof loadCodexIndex;
  scanCodexManifest: typeof scanCodexManifest;
  updateCodexIndex: typeof updateCodexIndex;
  saveCodexIndexAtomic: typeof saveCodexIndexAtomic;
  now?: () => number;
}

export async function runCodexWorkerRefresh(
  request: Extract<CodexWorkerRequest, { type: 'refresh' }>,
  runtime: CodexWorkerRefreshRuntime,
): Promise<void> {
  const now = runtime.now ?? Date.now;
  try {
    const lease = await runtime.acquireCodexIndexLease(request.indexPath, {
      shouldCancel: runtime.isCancelled,
    });
    let result: CodexWorkerResult;
    try {
      let indexRecovery: CodexIndexRecovery | undefined;
      const metadataStarted = now();
      const [previous, manifest] = await Promise.all([
        runtime.loadCodexIndex(request.indexPath, request.timeZone, (event) => {
          indexRecovery = event;
        }),
        runtime.scanCodexManifest(request.codexHome, request.salt),
      ]);
      const metadataMs = now() - metadataStarted;
      const parseStarted = now();
      const updated = await runtime.updateCodexIndex(previous, manifest, {
        salt: request.salt,
        timeZone: request.timeZone,
        now,
        budget: {
          maxFilePasses: CODEX_REFRESH_MAX_FILE_PASSES,
          maxBytes: CODEX_REFRESH_MAX_BYTES,
        },
        shouldCancel: runtime.isCancelled,
        onCheckpoint: (index) =>
          runtime.saveCodexIndexAtomic(request.indexPath, index),
        onProgress: (progress) =>
          runtime.post({
            type: 'progress',
            requestId: request.requestId,
            progress,
          }),
      });
      if (runtime.isCancelled()) {
        throw new CodexIndexCancelledError();
      }
      if (updated.indexChanged || indexRecovery) {
        await runtime.saveCodexIndexAtomic(request.indexPath, updated.index);
      }
      if (runtime.isCancelled()) {
        throw new CodexIndexCancelledError();
      }
      result = {
        ...updated,
        ...(indexRecovery ? { indexRecovery } : {}),
        metadataMs,
        parseMs: now() - parseStarted,
      };
    } finally {
      await lease.release();
    }
    runtime.post({
      type: 'result',
      requestId: request.requestId,
      result,
    });
  } catch (error) {
    runtime.post(safeError(request.requestId, error));
  }
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
    await runCodexWorkerRefresh(request, {
      isCancelled: () => cancelled.has(request.requestId),
      post,
      acquireCodexIndexLease,
      loadCodexIndex,
      scanCodexManifest,
      updateCodexIndex,
      saveCodexIndexAtomic,
    });
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
