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
import {
  CodexIndexProgress,
  CodexIndexV1,
  createEmptyCodexIndex,
  loadCodexIndex,
} from '../providers/codex/codexIndex';
import { runCodexWorkerRefresh } from '../providers/codex/codexIndexWorker';
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
  indexPath: '/private/global-storage/codex-index-v1.json',
  salt: 'runtime-only-salt',
  timeZone: 'Asia/Hong_Kong',
};

function result(): CodexWorkerResult {
  return {
    index: createEmptyCodexIndex(request.timeZone),
    bodyReads: 0,
    failedFiles: 0,
    metadataMs: 1,
    parseMs: 2,
    migration: {
      filePasses: 0,
      bytesRead: 0,
      pending: false,
    },
  };
}

test('concurrent refreshes share one worker run and report progress', async () => {
  const worker = new FakeWorker();
  const seen: CodexIndexProgress[] = [];
  const client = new CodexIndexClient(() => worker);

  const first = client.refresh(request, (progress) => seen.push(progress));
  const second = client.refresh(request, (progress) => seen.push(progress));
  const refresh = worker.requests[0];
  assert.equal(refresh.type, 'refresh');
  if (refresh.type !== 'refresh') {
    throw new Error('expected refresh');
  }
  assert.equal(worker.requests.filter((item) => item.type === 'refresh').length, 1);
  assert.equal(refresh.timeZone, 'Asia/Hong_Kong');
  assert.match(refresh.indexPath, /codex-index-v1\.json$/);

  const expectedPeriodCoverage = createEmptyCodexIndex(
    'Asia/Hong_Kong',
  ).coverage.period;
  const progress: CodexIndexProgress = {
    scannedFiles: 1,
    totalFiles: 2,
    indexedBytes: 10,
    totalBytes: 20,
    period: expectedPeriodCoverage,
  };

  worker.emitMessage({
    type: 'progress',
    requestId: refresh.requestId,
    progress,
  });
  worker.emitMessage({
    type: 'result',
    requestId: refresh.requestId,
    result: result(),
  });

  assert.deepEqual(await first, result());
  assert.deepEqual(await second, result());
  assert.equal(seen.length, 2);
  assert.strictEqual(seen[0], seen[1]);
  assert.deepEqual(seen[0].period, expectedPeriodCoverage);
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

test('the compiled worker keeps a safe project basename without raw identifiers or paths', async () => {
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
      timeZone: 'Asia/Hong_Kong',
    });

    assert.equal(indexed.index.aggregate.total.inputTotal, 75);
    assert.equal(indexed.index.coverage.complete, true);
    assert.equal(indexed.index.coverage.period.timeZone, 'Asia/Hong_Kong');
    const returned = JSON.stringify(indexed);
    const persisted = await readFile(indexPath, 'utf8');
    assert.match(returned, /"projectName":"raw-project"/);
    assert.match(persisted, /"projectDirectoryName":"raw-project"/);
    assert.doesNotMatch(
      returned,
      /private-session-id|rollout-private-name|\.jsonl|\/private\/raw-project/,
    );
    assert.doesNotMatch(
      persisted,
      /private-session-id|rollout-private-name|\.jsonl|\/private\/raw-project/,
    );
  } finally {
    client.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('worker cancellation persists a resumable atomic checkpoint', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-worker-resume-'));
  const client = new CodexIndexClient();
  try {
    const sessions = path.join(root, 'sessions');
    const indexPath = path.join(root, 'cache', 'codex-index-v1.json');
    const sessionPath = path.join(sessions, 'large-session.jsonl');
    await mkdir(sessions, { recursive: true });
    const tokenLines = Array.from({ length: 12_000 }, (_, index) =>
      JSON.stringify({
        timestamp: '2026-07-20T00:01:00.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: index + 1,
              cached_input_tokens: 0,
              output_tokens: index + 1,
              reasoning_output_tokens: 0,
              total_tokens: (index + 1) * 2,
            },
          },
        },
      }),
    );
    await writeFile(
      sessionPath,
      [
        JSON.stringify({
          timestamp: '2026-07-20T00:00:00.000Z',
          type: 'session_meta',
          payload: { id: 'raw-resume-session' },
        }),
        ...tokenLines,
        '',
      ].join('\n'),
      'utf8',
    );
    const input = {
      codexHome: root,
      indexPath,
      salt: SALT,
      timeZone: 'Asia/Hong_Kong',
    };
    await client.refresh(input);

    const legacy = JSON.parse(await readFile(indexPath, 'utf8')) as {
      files: Record<string, {
        aggregate: { period?: unknown };
        periodMigration?: unknown;
      }>;
    };
    for (const contribution of Object.values(legacy.files)) {
      delete contribution.aggregate.period;
      delete contribution.periodMigration;
    }
    await writeFile(indexPath, JSON.stringify(legacy), 'utf8');

    let cancelSent = false;
    const cancelledRefresh = client.refresh(input, (progress) => {
      if (!cancelSent && progress.period.allTime.migratedBytes > 0) {
        cancelSent = true;
        client.cancel();
      }
    });
    await assert.rejects(cancelledRefresh, (error: unknown) =>
      error instanceof CodexWorkerError && error.code === 'cancelled',
    );

    const checkpoint = await loadCodexIndex(indexPath, input.timeZone);
    const saved = Object.values(checkpoint.files)[0];
    assert.ok((saved.periodMigration?.offset ?? 0) > 0);
    assert.equal(saved.aggregate.period, undefined);

    const resumed = await client.refresh(input);
    assert.equal(resumed.index.coverage.period.allTime.complete, true);
    assert.equal(resumed.migration.pending, false);
  } finally {
    client.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('cancel during the final atomic save returns cancelled after preserving the save', async () => {
  const savedIndex = createEmptyCodexIndex(request.timeZone);
  const messages: CodexWorkerMessage[] = [];
  let cancelled = false;
  let releaseSave!: () => void;
  let markSaveStarted!: () => void;
  const saveStarted = new Promise<void>((resolve) => {
    markSaveStarted = resolve;
  });
  const saveReleased = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  let persisted: CodexIndexV1 | undefined;

  const running = runCodexWorkerRefresh(
    { type: 'refresh', requestId: 'final-save-race', ...request },
    {
      isCancelled: () => cancelled,
      post: (message: CodexWorkerMessage) => messages.push(message),
      loadCodexIndex: async () => savedIndex,
      scanCodexManifest: async () => ({ files: [], persistable: {} }),
      updateCodexIndex: async () => ({
        index: savedIndex,
        bodyReads: 0,
        failedFiles: 0,
        migration: { filePasses: 0, bytesRead: 0, pending: false },
      }),
      saveCodexIndexAtomic: async (
        _indexPath: string,
        index: CodexIndexV1,
      ) => {
        persisted = index;
        markSaveStarted();
        await saveReleased;
      },
    },
  );

  await saveStarted;
  cancelled = true;
  releaseSave();
  await running;

  assert.deepEqual(persisted, savedIndex);
  assert.deepEqual(messages, [{
    type: 'error',
    requestId: 'final-save-race',
    error: {
      code: 'cancelled',
      message: 'Codex indexing was cancelled',
    },
  }]);
});
