import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  CodexIndexClient,
  CodexWorkerError,
  CodexWorkerLike,
} from '../providers/codex/codexIndexClient';
import { createEmptyCodexIndex } from '../providers/codex/codexIndex';
import {
  CodexWorkerMessage,
  CodexWorkerRequest,
  CodexWorkerResult,
} from '../providers/codex/codexWorkerProtocol';

const SALT = 'test-machine-salt';

class FakeWorker extends EventEmitter implements CodexWorkerLike {
  readonly requests: CodexWorkerRequest[] = [];
  terminated = 0;

  postMessage(request: CodexWorkerRequest): void {
    this.requests.push(request);
  }

  terminate(): Promise<number> {
    this.terminated += 1;
    return Promise.resolve(0);
  }

  emitMessage(message: CodexWorkerMessage): void {
    this.emit('message', message);
  }
}

const request = {
  codexHome: '/private/runtime-only-codex-home',
  indexPath: '/private/runtime-only-index.json',
  salt: 'runtime-only-salt',
};

function result(): CodexWorkerResult {
  return {
    index: createEmptyCodexIndex(),
    bodyReads: 0,
    failedFiles: 0,
    metadataMs: 1,
    parseMs: 2,
  };
}

test('concurrent refreshes share one worker run and report progress', async () => {
  const worker = new FakeWorker();
  const seen: number[] = [];
  const client = new CodexIndexClient(() => worker);

  const first = client.refresh(request, (progress) => seen.push(progress.scannedFiles));
  const second = client.refresh(request, (progress) => seen.push(progress.scannedFiles));
  const refresh = worker.requests[0];
  assert.equal(refresh.type, 'refresh');
  if (refresh.type !== 'refresh') {
    throw new Error('expected refresh');
  }
  assert.equal(worker.requests.filter((item) => item.type === 'refresh').length, 1);

  worker.emitMessage({
    type: 'progress',
    requestId: refresh.requestId,
    progress: {
      scannedFiles: 1,
      totalFiles: 2,
      indexedBytes: 10,
      totalBytes: 20,
    },
  });
  worker.emitMessage({
    type: 'result',
    requestId: refresh.requestId,
    result: result(),
  });

  assert.deepEqual(await first, result());
  assert.deepEqual(await second, result());
  assert.deepEqual(seen, [1, 1]);
});

test('cancel sends exactly one message for the active request', async () => {
  const worker = new FakeWorker();
  const client = new CodexIndexClient(() => worker);
  const pending = client.refresh(request);
  const refresh = worker.requests[0];
  if (refresh.type !== 'refresh') {
    throw new Error('expected refresh');
  }

  client.cancel();
  client.cancel();

  assert.deepEqual(worker.requests.slice(1), [
    { type: 'cancel', requestId: refresh.requestId },
  ]);
  worker.emitMessage({
    type: 'error',
    requestId: refresh.requestId,
    error: { code: 'cancelled', message: 'Codex indexing was cancelled' },
  });
  await assert.rejects(pending, (error: unknown) => {
    return error instanceof CodexWorkerError && error.code === 'cancelled';
  });
});

test('a worker error rejects all shared callers with a typed safe error', async () => {
  const worker = new FakeWorker();
  const client = new CodexIndexClient(() => worker);
  const first = client.refresh(request);
  const second = client.refresh(request);
  const refresh = worker.requests[0];
  if (refresh.type !== 'refresh') {
    throw new Error('expected refresh');
  }

  worker.emitMessage({
    type: 'error',
    requestId: refresh.requestId,
    error: { code: 'index-read-failed', message: 'Codex index is unavailable' },
  });

  for (const pending of [first, second]) {
    await assert.rejects(pending, (error: unknown) => {
      return (
        error instanceof CodexWorkerError &&
        error.code === 'index-read-failed' &&
        !error.message.includes('/private/')
      );
    });
  }
});

test('dispose terminates the worker and rejects later refreshes', async () => {
  const worker = new FakeWorker();
  const client = new CodexIndexClient(() => worker);
  const pending = client.refresh(request);

  client.dispose();

  assert.equal(worker.terminated, 1);
  await assert.rejects(pending, { code: 'disposed' });
  await assert.rejects(client.refresh(request), { code: 'disposed' });
});

test('the compiled worker indexes synthetic logs without returning raw identifiers', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-worker-'));
  const client = new CodexIndexClient();
  try {
    const sessions = path.join(root, 'sessions');
    const indexPath = path.join(root, 'cache', 'index.json');
    await mkdir(sessions, { recursive: true });
    await writeFile(
      path.join(sessions, 'rollout-private-name.jsonl'),
      [
        JSON.stringify({
          timestamp: '2026-07-20T00:00:00.000Z',
          type: 'session_meta',
          payload: { id: 'private-session-id', cwd: '/private/raw-project' },
        }),
        JSON.stringify({
          timestamp: '2026-07-20T00:01:00.000Z',
          type: 'event_msg',
          payload: {
            type: 'token_count',
            info: {
              total_token_usage: {
                input_tokens: 75,
                cached_input_tokens: 50,
                output_tokens: 25,
                reasoning_output_tokens: 10,
                total_tokens: 100,
              },
            },
          },
        }),
        '',
      ].join('\n'),
      'utf8',
    );

    const indexed = await client.refresh({
      codexHome: root,
      indexPath,
      salt: SALT,
    });

    assert.equal(indexed.index.aggregate.total.inputTotal, 75);
    assert.equal(indexed.index.coverage.complete, true);
    assert.doesNotMatch(
      JSON.stringify(indexed),
      /private-session-id|raw-project|rollout-private-name|\.jsonl/,
    );
    assert.doesNotMatch(
      await readFile(indexPath, 'utf8'),
      /private-session-id|raw-project|rollout-private-name|\.jsonl/,
    );
  } finally {
    client.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
