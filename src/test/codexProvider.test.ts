import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  CodexIndexClientLike,
  CodexProvider,
} from '../providers/codex/codexProvider';
import {
  CodexFileContribution,
  CodexIndexV1,
  createEmptyCodexIndex,
} from '../providers/codex/codexIndex';
import { CodexWorkerResult } from '../providers/codex/codexWorkerProtocol';
import { pseudonymousIdentityKey } from '../providers/codex/codexIdentity';

function contribution(
  fileKey = 'anonymous-file-key',
  sourceArea?: 'sessions' | 'archive',
): CodexFileContribution {
  return {
    fileKey,
    ...(sourceArea ? { sourceArea } : {}),
    size: 100,
    mtimeMs: 1,
    offset: 100,
    discardingOversizedLine: false,
    parserState: {
      schemaVersion: 1,
      fileKey,
      sessionKey: 'anonymous-session-key',
      role: 'root',
      qualityFlags: ['unknown-event'],
    },
    aggregate: {
      total: { inputTotal: 80, cachedInput: 50, outputTotal: 20 },
      byDay: {
        '2026-07-20': { inputTotal: 80, cachedInput: 50, outputTotal: 20 },
      },
      byModel: {
        'gpt-5.6-sol': { inputTotal: 80, cachedInput: 50, outputTotal: 20 },
      },
      byEffort: {
        high: { inputTotal: 80, cachedInput: 50, outputTotal: 20 },
      },
      session: {
        sessionKey: 'anonymous-session-key',
        role: 'root',
        startedAt: Date.parse('2026-07-20T00:00:00.000Z'),
        endedAt: Date.parse('2026-07-20T00:05:00.000Z'),
      },
      structural: {
        patchCalls: 1,
        toolCalls: 2,
        postPatchToolCalls: 1,
        compactCount: 0,
        taskCompleteCount: 1,
      },
    },
    limit: {
      provider: 'codex',
      observedAt: Date.parse('2026-07-20T00:05:00.000Z'),
      source: 'local-log',
      confidence: 'last-observed',
      windows: [{ label: 'primary', usedPercent: 42 }],
    },
    qualityFlags: ['unknown-event'],
  };
}

function duplicateIndex(ambiguous: boolean): CodexIndexV1 {
  const index = createEmptyCodexIndex();
  const active = contribution('active-key', 'sessions');
  const archive = contribution('archive-key', 'archive');
  active.qualityFlags = ['active-only'];
  archive.qualityFlags = ['archive-only'];
  if (ambiguous) {
    archive.aggregate.total.outputTotal = 21;
  }
  index.files = {
    [active.fileKey]: active,
    [archive.fileKey]: archive,
  };
  index.aggregate = {
    total: {
      inputTotal: 160,
      cachedInput: 100,
      outputTotal: ambiguous ? 41 : 40,
    },
    byDay: {},
    byModel: {},
    byEffort: {},
  };
  index.coverage = {
    indexedFiles: 2,
    totalFiles: 2,
    indexedBytes: 200,
    totalBytes: 200,
    complete: true,
    identity: {
      exactDuplicateFiles: ambiguous ? 0 : 1,
      ambiguousSessionGroups: ambiguous ? 1 : 0,
      complete: !ambiguous,
    },
    period: createEmptyCodexIndex('UTC').coverage.period,
  };
  return index;
}

function partialIndex(): CodexIndexV1 {
  const index = createEmptyCodexIndex();
  const file = contribution();
  index.files[file.fileKey] = file;
  index.aggregate = {
    total: { ...file.aggregate.total },
    byDay: { ...file.aggregate.byDay },
    byModel: { ...file.aggregate.byModel },
    byEffort: { ...file.aggregate.byEffort },
  };
  index.coverage = {
    indexedFiles: 1,
    totalFiles: 2,
    indexedBytes: 100,
    totalBytes: 150,
    complete: false,
    identity: {
      exactDuplicateFiles: 0,
      ambiguousSessionGroups: 0,
      complete: true,
    },
    period: createEmptyCodexIndex('UTC').coverage.period,
  };
  return index;
}

class FakeClient implements CodexIndexClientLike {
  disposed = 0;
  calls = 0;
  constructor(private readonly responses: Array<CodexWorkerResult | Error>) {}

  async refresh(): Promise<CodexWorkerResult> {
    this.calls += 1;
    const next = this.responses.shift();
    if (next instanceof Error) {
      throw next;
    }
    if (!next) {
      throw new Error('missing fake response');
    }
    return next;
  }

  dispose(): void {
    this.disposed += 1;
  }
}

function workerResult(index = partialIndex()): CodexWorkerResult {
  return {
    index,
    bodyReads: 1,
    failedFiles: 1,
    metadataMs: 2,
    parseMs: 3,
  };
}

test('disabled or unavailable providers do not create a worker client', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-provider-off-'));
  try {
    let factoryCalls = 0;
    const factory = (): CodexIndexClientLike => {
      factoryCalls += 1;
      return new FakeClient([]);
    };
    const disabled = new CodexProvider(
      { enabled: false, codexHome: root, indexPath: 'unused', salt: 'salt' },
      factory,
    );
    const unavailable = new CodexProvider(
      { enabled: true, codexHome: root, indexPath: 'unused', salt: 'salt' },
      factory,
    );

    assert.equal(await disabled.isAvailable(), false);
    assert.equal((await disabled.refresh()).outcome, 'unavailable');
    assert.equal(await unavailable.isAvailable(), false);
    assert.equal((await unavailable.refresh()).outcome, 'unavailable');
    assert.equal(factoryCalls, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a partial refresh exposes aggregates, quality, and last observed limit', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-provider-on-'));
  try {
    await mkdir(path.join(root, 'sessions'), { recursive: true });
    const result = workerResult();
    const sessionKey = pseudonymousIdentityKey('salt', 'raw-session-title');
    const file = Object.values(result.index.files)[0];
    file.parserState.sessionKey = sessionKey;
    file.aggregate.session.sessionKey = sessionKey;
    await writeFile(
      path.join(root, 'session_index.jsonl'),
      `${JSON.stringify({ id: 'raw-session-title', thread_name: '真实 Session 标题' })}\n`,
      'utf8',
    );
    const client = new FakeClient([result]);
    const provider = new CodexProvider(
      { enabled: true, codexHome: root, indexPath: 'index', salt: 'salt' },
      () => client,
    );

    const refreshed = await provider.refresh();

    assert.equal(refreshed.outcome, 'partial');
    assert.equal(refreshed.snapshot.total.inputTotal, 80);
    assert.deepEqual(refreshed.snapshot.qualityFlags, { 'unknown-event': 1 });
    assert.equal(refreshed.snapshot.files.length, 1);
    assert.equal(
      refreshed.snapshot.files[0].session.sessionTitle,
      '真实 Session 标题',
    );
    assert.equal(refreshed.snapshot.limit?.windows[0].usedPercent, 42);
    assert.equal(refreshed.snapshot.limits.length, 1);
    assert.deepEqual(provider.snapshot(), refreshed.snapshot);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a worker failure retains the last verified provider snapshot', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-provider-stale-'));
  try {
    await mkdir(path.join(root, 'sessions'), { recursive: true });
    const client = new FakeClient([
      { ...workerResult(), failedFiles: 0 },
      new Error('/private/path must not be returned'),
    ]);
    const provider = new CodexProvider(
      { enabled: true, codexHome: root, indexPath: 'index', salt: 'salt' },
      () => client,
    );
    const verified = await provider.refresh();
    const failed = await provider.refresh();

    assert.equal(verified.snapshot.total.inputTotal, 80);
    assert.equal(failed.outcome, 'error');
    assert.equal(failed.snapshot.total.inputTotal, 80);
    assert.doesNotMatch(JSON.stringify(failed), /private\/path/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('an exact archive copy is absent from a successful provider snapshot', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-provider-dedup-'));
  try {
    await mkdir(path.join(root, 'sessions'), { recursive: true });
    const client = new FakeClient([
      { ...workerResult(duplicateIndex(false)), failedFiles: 0 },
    ]);
    const provider = new CodexProvider(
      { enabled: true, codexHome: root, indexPath: 'index', salt: 'salt' },
      () => client,
    );

    const refreshed = await provider.refresh();

    assert.equal(refreshed.outcome, 'success');
    assert.equal(refreshed.snapshot.files.length, 1);
    assert.deepEqual(refreshed.snapshot.qualityFlags, { 'active-only': 1 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('an ambiguous active/archive group remains visible and makes outcome partial', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-provider-ambiguous-'));
  try {
    await mkdir(path.join(root, 'sessions'), { recursive: true });
    const client = new FakeClient([
      { ...workerResult(duplicateIndex(true)), failedFiles: 0 },
    ]);
    const provider = new CodexProvider(
      { enabled: true, codexHome: root, indexPath: 'index', salt: 'salt' },
      () => client,
    );

    const refreshed = await provider.refresh();

    assert.equal(refreshed.outcome, 'partial');
    assert.equal(refreshed.snapshot.files.length, 2);
    assert.equal(refreshed.snapshot.total.outputTotal, 41);
    assert.deepEqual(refreshed.snapshot.qualityFlags, {
      'active-only': 1,
      'archive-only': 1,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
