import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  CodexFileContribution,
  CodexIndexIo,
  createEmptyCodexIndex,
  loadCodexIndex,
  saveCodexIndexAtomic,
  updateCodexIndex,
} from '../providers/codex/codexIndex';
import {
  CodexManifest,
  CodexRuntimeManifestEntry,
  scanCodexManifest,
} from '../providers/codex/codexManifest';

const SALT = 'test-machine-salt';

function sessionLine(id: string): string {
  return JSON.stringify({
    timestamp: '2026-07-20T00:00:00.000Z',
    type: 'session_meta',
    payload: {
      id,
      cwd: '/private/example-project',
      agent_nickname: 'Locke',
      git: {
        repository_url: 'https://github.com/example/ExampleProject.git',
      },
    },
  });
}

function childSessionLine(id: string, parentId: string): string {
  return JSON.stringify({
    timestamp: '2026-07-20T00:00:00.000Z',
    type: 'session_meta',
    payload: {
      id,
      cwd: '/private/example-project',
      source: {
        subagent: {
          thread_spawn: { parent_thread_id: parentId },
        },
      },
    },
  });
}

function contextLine(model = 'gpt-5.6-sol', effort = 'high'): string {
  return JSON.stringify({
    timestamp: '2026-07-20T00:00:01.000Z',
    type: 'turn_context',
    payload: { model, effort },
  });
}

function tokenLine(input: number, output: number, timestamp: string): string {
  return JSON.stringify({
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: input,
          cached_input_tokens: Math.floor(input / 2),
          output_tokens: output,
          reasoning_output_tokens: Math.floor(output / 2),
          total_tokens: input + output,
        },
      },
    },
  });
}

function structuralLine(
  timestamp: string,
  type: 'event_msg' | 'response_item',
  payload: Record<string, string>,
): string {
  return JSON.stringify({ timestamp, type, payload });
}

function completeSession(id: string, input: number, output: number): string {
  return [
    sessionLine(id),
    contextLine(),
    tokenLine(input, output, '2026-07-20T00:01:00.000Z'),
    '',
  ].join('\n');
}

interface TrackingIo extends CodexIndexIo {
  bodyReads: Map<string, number>;
  readOffsets: number[];
}

function trackingIo(): TrackingIo {
  const bodyReads = new Map<string, number>();
  const readOffsets: number[] = [];
  return {
    bodyReads,
    readOffsets,
    async *read(entry, start, endExclusive) {
      bodyReads.set(entry.fileKey, (bodyReads.get(entry.fileKey) ?? 0) + 1);
      readOffsets.push(start);
      const body = await readFile(entry.absolutePath);
      yield body.subarray(start, endExclusive);
    },
  };
}

function persistableManifest(files: CodexRuntimeManifestEntry[]): CodexManifest {
  return {
    files,
    persistable: Object.fromEntries(
      files.map((file) => [
        file.fileKey,
        {
          fileKey: file.fileKey,
          sourceArea: file.sourceArea,
          size: file.size,
          mtimeMs: file.mtimeMs,
          dev: file.dev,
          ino: file.ino,
        },
      ]),
    ),
  };
}

function dedupContribution(
  fileKey: string,
  sourceArea: CodexRuntimeManifestEntry['sourceArea'],
): CodexFileContribution {
  return {
    fileKey,
    sourceArea,
    size: 100,
    mtimeMs: 1,
    offset: 100,
    discardingOversizedLine: false,
    parserState: {
      schemaVersion: 1,
      fileKey,
      sessionKey: 'shared-anonymous-session',
      role: 'root',
      qualityFlags: [],
    },
    aggregate: {
      total: { inputTotal: 100, outputTotal: 20 },
      byDay: {},
      byModel: {},
      byEffort: {},
      session: {
        sessionKey: 'shared-anonymous-session',
        role: 'root',
        startedAt: 10,
        endedAt: 20,
      },
      structural: {
        patchCalls: 0,
        toolCalls: 0,
        postPatchToolCalls: 0,
        compactCount: 0,
        taskCompleteCount: 1,
      },
    },
    qualityFlags: [],
    identityChecked: true,
  };
}

test('cold scan, appended tail, and persisted reload agree', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-index-'));
  try {
    const sessions = path.join(root, 'sessions');
    const indexPath = path.join(root, 'cache', 'codex-index.json');
    const activePath = path.join(sessions, 'rollout-active.jsonl');
    await mkdir(sessions, { recursive: true });
    await writeFile(activePath, completeSession('raw-session', 100, 20), 'utf8');
    const io = trackingIo();

    const manifest1 = await scanCodexManifest(root, SALT);
    const cold = await updateCodexIndex(
      createEmptyCodexIndex(),
      manifest1,
      { salt: SALT, io },
    );
    const key = manifest1.files[0].fileKey;
    const coldOffset = cold.index.files[key].offset;
    await appendFile(
      activePath,
      `${tokenLine(200, 50, '2026-07-20T00:02:00.000Z')}\n`,
      'utf8',
    );

    const manifest2 = await scanCodexManifest(root, SALT);
    const warm = await updateCodexIndex(cold.index, manifest2, {
      salt: SALT,
      io,
    });
    await saveCodexIndexAtomic(indexPath, warm.index);
    const reloaded = await loadCodexIndex(indexPath);

    assert.deepEqual(reloaded.aggregate, warm.index.aggregate);
    assert.equal(warm.index.aggregate.total.inputTotal, 200);
    assert.equal(warm.index.aggregate.total.outputTotal, 50);
    assert.equal(
      warm.index.files[key].aggregate.session.projectName,
      'ExampleProject',
    );
    assert.equal(
      warm.index.files[key].aggregate.session.projectDirectoryName,
      'example-project',
    );
    assert.equal(warm.index.files[key].aggregate.session.agentNickname, 'Locke');
    assert.deepEqual(io.readOffsets, [0, coldOffset]);
    assert.equal(io.bodyReads.get(key), 2);
    const persisted = await readFile(indexPath, 'utf8');
    assert.doesNotMatch(
      persisted,
      /raw-session|private\/example-project|github\.com|rollout-active|\.jsonl/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('exact active and archive copies contribute usage only once', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-index-dedup-'));
  try {
    const sessions = path.join(root, 'sessions');
    const archive = path.join(root, 'archived_sessions');
    await mkdir(sessions, { recursive: true });
    await mkdir(archive, { recursive: true });
    const body = completeSession('shared-raw-session', 100, 20);
    await writeFile(path.join(sessions, 'active.jsonl'), body, 'utf8');
    await writeFile(path.join(archive, 'archive.jsonl'), body, 'utf8');

    const manifest = await scanCodexManifest(root, SALT);
    const result = await updateCodexIndex(
      createEmptyCodexIndex(),
      manifest,
      { salt: SALT },
    );

    assert.equal(result.index.aggregate.total.inputTotal, 100);
    assert.equal(result.index.aggregate.total.outputTotal, 20);
    assert.deepEqual(result.index.coverage.identity, {
      exactDuplicateFiles: 1,
      ambiguousSessionGroups: 0,
      complete: true,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('safe DTO normalization uses outer file keys for exact dedupe', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-index-key-normalize-'));
  try {
    const indexPath = path.join(root, 'codex-index.json');
    const index = createEmptyCodexIndex();
    const active = dedupContribution('active-outer', 'sessions');
    const archive = dedupContribution('archive-embedded', 'archive');
    Object.assign(archive, {
      rawSessionId: 'raw-session-must-not-survive',
      absolutePath: '/private/path-must-not-survive/archive.jsonl',
    });
    index.files = {
      'active-outer': active,
      'archive-outer': archive,
    };
    index.aggregate.total = { inputTotal: 200, outputTotal: 40 };
    await writeFile(indexPath, JSON.stringify(index), 'utf8');

    const loaded = await loadCodexIndex(indexPath);
    assert.equal(loaded.files['archive-outer'].fileKey, 'archive-outer');
    assert.equal(loaded.files['archive-outer'].parserState.fileKey, 'archive-outer');
    assert.doesNotMatch(
      JSON.stringify(loaded),
      /raw-session-must-not-survive|private\/path-must-not-survive/,
    );

    const entries: CodexRuntimeManifestEntry[] = [
      {
        fileKey: 'active-outer',
        sourceArea: 'sessions',
        size: 100,
        mtimeMs: 1,
        absolutePath: path.join(root, 'sessions', 'active.jsonl'),
        nonPersisted: true,
      },
      {
        fileKey: 'archive-outer',
        sourceArea: 'archive',
        size: 100,
        mtimeMs: 1,
        absolutePath: path.join(root, 'archived_sessions', 'archive.jsonl'),
        nonPersisted: true,
      },
    ];
    const updated = await updateCodexIndex(
      loaded,
      persistableManifest(entries),
      { salt: SALT },
    );

    assert.equal(updated.bodyReads, 0);
    assert.equal(updated.index.aggregate.total.inputTotal, 100);
    assert.deepEqual(updated.index.coverage.identity, {
      exactDuplicateFiles: 1,
      ambiguousSessionGroups: 0,
      complete: true,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('cold scan and append build target-timezone slices in the same body read', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-period-append-'));
  try {
    const sessions = path.join(root, 'sessions');
    const activePath = path.join(sessions, 'rollout-period.jsonl');
    await mkdir(sessions, { recursive: true });
    await writeFile(
      activePath,
      [
        sessionLine('period-append'),
        contextLine(),
        tokenLine(100, 20, '2026-07-20T15:55:00.000Z'),
        '',
      ].join('\n'),
      'utf8',
    );
    const io = trackingIo();
    const firstManifest = await scanCodexManifest(root, SALT);
    const cold = await updateCodexIndex(
      createEmptyCodexIndex('Asia/Hong_Kong'),
      firstManifest,
      { salt: SALT, timeZone: 'Asia/Hong_Kong', io },
    );
    const key = firstManifest.files[0].fileKey;
    const preAppendOffset = cold.index.files[key].offset;

    assert.equal(cold.bodyReads, 1);
    assert.equal(io.bodyReads.get(key), 1);
    assert.equal(
      cold.index.files[key].aggregate.period?.days['2026-07-20'].total.inputTotal,
      100,
    );
    assert.equal(
      cold.index.files[key].aggregate.period?.indexedThrough,
      preAppendOffset,
    );

    await appendFile(
      activePath,
      [
        tokenLine(150, 30, '2026-07-20T16:05:00.000Z'),
        structuralLine('2026-07-20T16:06:00.000Z', 'response_item', {
          type: 'function_call',
          name: 'apply_patch',
        }),
        '',
      ].join('\n'),
      'utf8',
    );
    const warm = await updateCodexIndex(
      cold.index,
      await scanCodexManifest(root, SALT),
      { salt: SALT, timeZone: 'Asia/Hong_Kong', io },
    );
    const period = warm.index.files[key].aggregate.period!;

    assert.equal(warm.bodyReads, 1);
    assert.equal(io.bodyReads.get(key), 2);
    assert.deepEqual(io.readOffsets, [0, preAppendOffset]);
    assert.equal(period.timeZone, 'Asia/Hong_Kong');
    assert.equal(period.indexedThrough, warm.index.files[key].offset);
    assert.equal(period.days['2026-07-20'].total.inputTotal, 100);
    assert.equal(period.days['2026-07-21'].total.inputTotal, 50);
    assert.equal(
      period.days['2026-07-21'].byModel['gpt-5.6-sol'].inputTotal,
      50,
    );
    assert.equal(period.days['2026-07-21'].byEffort.high.inputTotal, 50);
    assert.equal(period.days['2026-07-21'].structural.patchCalls, 1);
    assert.equal(
      period.days['2026-07-21'].firstObservedAt,
      Date.parse('2026-07-20T16:05:00.000Z'),
    );
    assert.equal(
      period.days['2026-07-21'].lastObservedAt,
      Date.parse('2026-07-20T16:06:00.000Z'),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('append leaves a mismatched period for later migration while all-time advances', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-period-mismatch-'));
  try {
    const sessions = path.join(root, 'sessions');
    const activePath = path.join(sessions, 'rollout-period-mismatch.jsonl');
    await mkdir(sessions, { recursive: true });
    await writeFile(
      activePath,
      `${tokenLine(100, 20, '2026-07-20T15:55:00.000Z')}\n`,
      'utf8',
    );
    const firstManifest = await scanCodexManifest(root, SALT);
    const cold = await updateCodexIndex(
      createEmptyCodexIndex('UTC'),
      firstManifest,
      { salt: SALT, timeZone: 'UTC' },
    );
    const key = firstManifest.files[0].fileKey;
    const priorPeriod = structuredClone(cold.index.files[key].aggregate.period!);
    await appendFile(
      activePath,
      `${tokenLine(150, 30, '2026-07-20T16:05:00.000Z')}\n`,
      'utf8',
    );

    const changedZone = await updateCodexIndex(
      cold.index,
      await scanCodexManifest(root, SALT),
      { salt: SALT, timeZone: 'Asia/Hong_Kong' },
    );

    assert.equal(changedZone.index.files[key].aggregate.total.inputTotal, 150);
    assert.deepEqual(changedZone.index.files[key].aggregate.period, priorPeriod);

    const staleCursor = structuredClone(cold.index);
    staleCursor.files[key].aggregate.period!.indexedThrough -= 1;
    const stalePeriod = structuredClone(staleCursor.files[key].aggregate.period!);
    const cursorMismatch = await updateCodexIndex(
      staleCursor,
      await scanCodexManifest(root, SALT),
      { salt: SALT, timeZone: 'UTC' },
    );

    assert.equal(cursorMismatch.index.files[key].aggregate.total.inputTotal, 150);
    assert.deepEqual(cursorMismatch.index.files[key].aggregate.period, stalePeriod);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('invalid timestamps add a quality flag without creating a period day', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-period-invalid-'));
  try {
    const sessions = path.join(root, 'sessions');
    await mkdir(sessions, { recursive: true });
    await writeFile(
      path.join(sessions, 'rollout-invalid-time.jsonl'),
      [tokenLine(10, 2, 'not-a-timestamp'), ''].join('\n'),
      'utf8',
    );

    const result = await updateCodexIndex(
      createEmptyCodexIndex('UTC'),
      await scanCodexManifest(root, SALT),
      { salt: SALT, timeZone: 'UTC' },
    );
    const contribution = Object.values(result.index.files)[0];

    assert.deepEqual(contribution.aggregate.period?.days, {});
    assert.ok(contribution.qualityFlags.includes('invalid-event-timestamp'));
    assert.equal('unknown' in (contribution.aggregate.period?.days ?? {}), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('child token counters start at their own zero and are not parent deltas', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-index-child-'));
  try {
    const sessions = path.join(root, 'sessions');
    await mkdir(sessions, { recursive: true });
    await writeFile(
      path.join(sessions, 'a-parent.jsonl'),
      completeSession('parent', 100, 20),
      'utf8',
    );
    await writeFile(
      path.join(sessions, 'b-child.jsonl'),
      [
        childSessionLine('child', 'parent'),
        contextLine(),
        tokenLine(50, 10, '2026-07-20T00:01:00.000Z'),
        '',
      ].join('\n'),
      'utf8',
    );

    const result = await updateCodexIndex(
      createEmptyCodexIndex(),
      await scanCodexManifest(root, SALT),
      { salt: SALT },
    );
    const child = Object.values(result.index.files).find(
      (file) => file.aggregate.session.role === 'subagent',
    );

    assert.equal(result.index.aggregate.total.inputTotal, 150);
    assert.equal(result.index.aggregate.total.outputTotal, 30);
    assert.equal(child?.aggregate.total.inputTotal, 50);
    assert.equal(child?.qualityFlags.includes('counter-regression'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('structural summaries count patch and tool calls without reading bodies', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-index-structural-'));
  try {
    const sessions = path.join(root, 'sessions');
    await mkdir(sessions, { recursive: true });
    await writeFile(
      path.join(sessions, 'rollout-structural.jsonl'),
      [
        structuralLine('2026-07-20T00:00:00.000Z', 'event_msg', {
          type: 'context_compacted',
        }),
        structuralLine('2026-07-20T00:01:00.000Z', 'response_item', {
          type: 'function_call',
          name: 'apply_patch',
        }),
        structuralLine('2026-07-20T00:02:00.000Z', 'response_item', {
          type: 'function_call',
          name: 'exec_command',
        }),
        structuralLine('2026-07-20T00:03:00.000Z', 'response_item', {
          type: 'function_call',
          name: 'write_stdin',
        }),
        structuralLine('2026-07-20T00:04:00.000Z', 'event_msg', {
          type: 'task_complete',
        }),
        '',
      ].join('\n'),
      'utf8',
    );

    const result = await updateCodexIndex(
      createEmptyCodexIndex(),
      await scanCodexManifest(root, SALT),
      { salt: SALT },
    );

    assert.deepEqual(Object.values(result.index.files)[0].aggregate.structural, {
      patchCalls: 1,
      toolCalls: 2,
      postPatchToolCalls: 2,
      compactCount: 1,
      taskCompleteCount: 1,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the persisted v1 loader migrates legacy structural proxy keys', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-index-legacy-'));
  try {
    const indexPath = path.join(root, 'codex-index.json');
    const carry = 'private unfinished x';
    assert.equal(Buffer.byteLength(carry, 'utf8'), 20);
    await writeFile(
      indexPath,
      JSON.stringify({
        schemaVersion: 1,
        files: {
          a: {
            fileKey: 'a',
            size: 120,
            mtimeMs: 1,
            offset: 120,
            carry,
            rawSessionId: 'raw-session-id-never-persist',
            absolutePath: '/private/raw/path-never-persist.jsonl',
            repositoryUrl: 'https://example.invalid/private-repository',
            parserState: {
              schemaVersion: 1,
              fileKey: 'a',
              sessionKey: 'pseudonymous-session-key',
              role: 'root',
              highWater: {
                inputTokens: 123,
                cachedInputTokens: 23,
                outputTokens: 45,
                reasoningOutputTokens: 5,
                totalTokens: 168,
              },
              qualityFlags: ['legacy-quality'],
            },
            aggregate: {
              total: {
                inputTotal: 123,
                cachedInput: 23,
                outputTotal: 45,
                reasoningOutput: 5,
                sourceTotal: 168,
              },
              byDay: {
                '2026-07-20': { inputTotal: 123, outputTotal: 45 },
              },
              byModel: {
                'gpt-5.6-sol': { inputTotal: 123, outputTotal: 45 },
              },
              byEffort: {
                high: { inputTotal: 123, outputTotal: 45 },
              },
              session: {
                sessionKey: 'pseudonymous-session-key',
                role: 'root',
              },
              structural: {
                filesChanged: 1,
                patchRounds: 1,
                commands: 2,
                postChangeCommands: 2,
                compactCount: 1,
                taskCompleteCount: 1,
              },
            },
            limits: {},
            qualityFlags: ['legacy-quality'],
          },
        },
        aggregate: {
          total: {
            inputTotal: 123,
            cachedInput: 23,
            outputTotal: 45,
            reasoningOutput: 5,
            sourceTotal: 168,
          },
          byDay: {
            '2026-07-20': { inputTotal: 123, outputTotal: 45 },
          },
          byModel: {
            'gpt-5.6-sol': { inputTotal: 123, outputTotal: 45 },
          },
          byEffort: {
            high: { inputTotal: 123, outputTotal: 45 },
          },
        },
        coverage: {
          indexedFiles: 0,
          totalFiles: 1,
          indexedBytes: 100,
          totalBytes: 120,
          complete: false,
        },
      }),
      'utf8',
    );

    const loaded = await loadCodexIndex(indexPath, 'Asia/Hong_Kong');

    assert.equal(loaded.schemaVersion, 2);
    assert.equal(loaded.files.a.offset, 100);
    assert.equal(loaded.files.a.discardingOversizedLine, false);
    assert.equal(loaded.aggregate.total.inputTotal, 123);
    assert.equal(loaded.files.a.aggregate.period, undefined);
    assert.deepEqual(loaded.files.a.aggregate.structural, {
      patchCalls: 1,
      toolCalls: 2,
      postPatchToolCalls: 2,
      compactCount: 1,
      taskCompleteCount: 1,
    });
    await saveCodexIndexAtomic(indexPath, loaded);
    const persisted = await readFile(indexPath, 'utf8');
    assert.doesNotMatch(persisted, /private unfinished/);
    assert.doesNotMatch(persisted, /raw-session-id-never-persist/);
    assert.doesNotMatch(persisted, /private\/raw\/path-never-persist/);
    assert.doesNotMatch(persisted, /example\.invalid/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('schema v2 load and save reconstruct only allowlisted anonymous DTO fields', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-index-v2-dto-'));
  try {
    const indexPath = path.join(root, 'codex-index.json');
    await writeFile(
      indexPath,
      JSON.stringify({
        schemaVersion: 2,
        rawIndexValue: 'v2-secret-index',
        files: {
          a: {
            fileKey: 'anonymous-file-key',
            sourceArea: 'sessions',
            size: 120,
            mtimeMs: 7,
            dev: 8,
            ino: 9,
            offset: 100,
            discardingOversizedLine: false,
            carry: 'v2-secret-carry',
            absolutePath: '/v2-secret-path/session.jsonl',
            repositoryUrl: 'https://v2-secret-url.invalid/repository',
            rawSessionId: 'v2-secret-contribution-session',
            parserState: {
              schemaVersion: 1,
              fileKey: 'anonymous-file-key',
              sessionKey: 'anonymous-session-key',
              parentSessionKey: 'anonymous-parent-key',
              projectKey: 'anonymous-project-key',
              projectName: 'SafeProject',
              projectDirectoryName: 'safe-directory',
              agentNickname: 'SafeAgent',
              model: 'gpt-5.6-sol',
              effort: 'high',
              role: 'subagent',
              highWater: {
                inputTokens: 123,
                cachedInputTokens: 23,
                outputTokens: 45,
                reasoningOutputTokens: 5,
                totalTokens: 168,
                responseBody: 'v2-secret-high-water',
              },
              qualityFlags: ['legacy-quality'],
              currentTurnId: 'v2-secret-turn-id',
              toolArguments: 'v2-secret-parser-tool-arguments',
            },
            aggregate: {
              total: {
                inputTotal: 123,
                cachedInput: 23,
                outputTotal: 45,
                reasoningOutput: 5,
                sourceTotal: 168,
                promptBody: 'v2-secret-file-total',
              },
              byDay: {
                '2026-07-20': {
                  inputTotal: 123,
                  outputTotal: 45,
                  commandBody: 'v2-secret-day-bucket',
                },
              },
              byModel: {
                'gpt-5.6-sol': { inputTotal: 123, outputTotal: 45 },
              },
              byEffort: {
                high: { inputTotal: 123, outputTotal: 45 },
              },
              session: {
                sessionKey: 'anonymous-session-key',
                parentSessionKey: 'anonymous-parent-key',
                projectKey: 'anonymous-project-key',
                projectName: 'SafeProject',
                projectDirectoryName: 'safe-directory',
                agentNickname: 'SafeAgent',
                role: 'subagent',
                startedAt: 10,
                endedAt: 20,
                sessionTitle: 'v2-secret-session-title',
                rawSessionId: 'v2-secret-session-id',
                cwd: '/v2-secret-session-path',
              },
              structural: {
                patchCalls: 1,
                toolCalls: 2,
                postPatchToolCalls: 2,
                compactCount: 3,
                taskCompleteCount: 4,
                responseBody: 'v2-secret-structural',
              },
              period: {
                timeZone: 'Asia/Hong_Kong',
                indexedThrough: 100,
                days: {
                  '2026-07-20': {
                    total: {
                      inputTotal: 123,
                      cachedInput: 23,
                      outputTotal: 45,
                      reasoningOutput: 5,
                      sourceTotal: 168,
                      promptBody: 'v2-secret-period-total',
                    },
                    byModel: {
                      'gpt-5.6-sol': { inputTotal: 123, outputTotal: 45 },
                    },
                    byEffort: {
                      high: { inputTotal: 123, outputTotal: 45 },
                    },
                    structural: {
                      patchCalls: 1,
                      toolCalls: 2,
                      postPatchToolCalls: 2,
                      compactCount: 3,
                      taskCompleteCount: 4,
                      commandBody: 'v2-secret-period-structural',
                    },
                    firstObservedAt: 10,
                    lastObservedAt: 20,
                    rawResponse: 'v2-secret-period-day',
                  },
                },
                rawPath: '/v2-secret-period-path',
              },
              rawResponse: 'v2-secret-file-aggregate',
            },
            limit: {
              provider: 'codex',
              limitId: 'safe-limit-id',
              limitName: 'Safe Limit',
              observedAt: 30,
              source: 'local-log',
              confidence: 'last-observed',
              windows: [{
                label: 'primary',
                usedPercent: 25,
                windowMinutes: 300,
                resetsAt: 40,
                commandBody: 'v2-secret-limit-window',
              }],
              credits: {
                hasCredits: true,
                unlimited: false,
                balance: '42',
                toolArguments: 'v2-secret-limit-credits',
              },
              rawUrl: 'https://v2-secret-limit.invalid',
            },
            limits: {
              primary: {
                provider: 'codex',
                observedAt: 31,
                source: 'local-log',
                confidence: 'last-observed',
                windows: [{ usedPercent: 26 }],
                promptBody: 'v2-secret-named-limit',
              },
            },
            qualityFlags: ['legacy-quality'],
            qualityDetails: { promptBody: 'v2-secret-quality-details' },
            identityChecked: true,
          },
        },
        aggregate: {
          total: {
            inputTotal: 123,
            cachedInput: 23,
            outputTotal: 45,
            reasoningOutput: 5,
            sourceTotal: 168,
            rawResponse: 'v2-secret-provider-total',
          },
          byDay: {
            '2026-07-20': { inputTotal: 123, outputTotal: 45 },
          },
          byModel: {
            'gpt-5.6-sol': { inputTotal: 123, outputTotal: 45 },
          },
          byEffort: {
            high: { inputTotal: 123, outputTotal: 45 },
          },
          rawPrompt: 'v2-secret-provider-aggregate',
        },
        coverage: {
          indexedFiles: 1,
          totalFiles: 1,
          indexedBytes: 100,
          totalBytes: 120,
          complete: false,
          identity: {
            exactDuplicateFiles: 2,
            ambiguousSessionGroups: 3,
            complete: false,
            rawSessionId: 'v2-secret-identity-session',
            absolutePath: '/v2-secret-identity-path',
          },
          absolutePath: '/v2-secret-coverage-path',
        },
      }),
      'utf8',
    );

    const loaded = await loadCodexIndex(indexPath, 'Asia/Hong_Kong');
    const loadedJson = JSON.stringify(loaded);
    assert.doesNotMatch(loadedJson, /v2-secret/);
    assert.equal(loaded.schemaVersion, 2);
    assert.equal(loaded.files.a.offset, 100);
    assert.equal(loaded.files.a.aggregate.total.inputTotal, 123);
    assert.equal(loaded.files.a.parserState.highWater?.inputTokens, 123);
    assert.equal(loaded.files.a.parserState.sessionKey, 'anonymous-session-key');
    assert.equal(loaded.files.a.aggregate.session.startedAt, 10);
    assert.equal(loaded.files.a.aggregate.session.endedAt, 20);
    assert.equal(loaded.files.a.aggregate.structural.patchCalls, 1);
    assert.equal(loaded.files.a.aggregate.period?.timeZone, 'Asia/Hong_Kong');
    assert.equal(loaded.files.a.aggregate.period?.indexedThrough, 100);
    assert.equal(
      loaded.files.a.aggregate.period?.days['2026-07-20'].total.inputTotal,
      123,
    );
    assert.equal(
      loaded.files.a.aggregate.period?.days['2026-07-20'].structural.patchCalls,
      1,
    );
    assert.equal(
      loaded.files.a.aggregate.period?.days['2026-07-20'].firstObservedAt,
      10,
    );
    assert.equal(
      loaded.files.a.aggregate.period?.days['2026-07-20'].lastObservedAt,
      20,
    );
    assert.equal(loaded.files.a.limit?.observedAt, 30);
    assert.equal(loaded.files.a.limit?.windows[0].usedPercent, 25);
    assert.equal(loaded.files.a.limit?.credits?.balance, '42');
    assert.equal(loaded.files.a.limits?.primary.observedAt, 31);
    assert.deepEqual(loaded.files.a.qualityFlags, ['legacy-quality']);
    assert.equal(loaded.aggregate.total.inputTotal, 123);
    assert.equal(loaded.coverage.indexedBytes, 100);
    assert.equal(loaded.files.a.sourceArea, 'sessions');
    assert.deepEqual(loaded.coverage.identity, {
      exactDuplicateFiles: 2,
      ambiguousSessionGroups: 3,
      complete: false,
    });

    const caller = structuredClone(loaded) as typeof loaded & {
      carry?: string;
      rawPath?: string;
    };
    caller.carry = 'v2-secret-caller-carry';
    caller.rawPath = '/v2-secret-caller-path';
    Object.assign(caller.files.a.parserState, {
      toolArguments: 'v2-secret-caller-parser',
    });
    Object.assign(caller.files.a.aggregate.session, {
      cwd: '/v2-secret-caller-session-path',
    });
    Object.assign(
      caller.files.a.aggregate.period!.days['2026-07-20'],
      { promptBody: 'v2-secret-caller-period-day' },
    );
    Object.assign(caller.files.a.limit!.windows[0], {
      commandBody: 'v2-secret-caller-limit-window',
    });
    await saveCodexIndexAtomic(indexPath, caller);

    const persisted = await readFile(indexPath, 'utf8');
    assert.doesNotMatch(persisted, /v2-secret/);
    assert.equal(caller.carry, 'v2-secret-caller-carry');
    assert.equal(caller.rawPath, '/v2-secret-caller-path');
    assert.match(JSON.stringify(caller), /v2-secret-caller-parser/);
    const saved = JSON.parse(persisted) as typeof loaded;
    assert.equal(saved.files.a.aggregate.total.inputTotal, 123);
    assert.equal(saved.files.a.parserState.sessionKey, 'anonymous-session-key');
    assert.equal(saved.files.a.limit?.windows[0].usedPercent, 25);
    assert.equal(saved.files.a.aggregate.period?.timeZone, 'Asia/Hong_Kong');
    assert.equal(
      saved.files.a.aggregate.period?.days['2026-07-20'].lastObservedAt,
      20,
    );
    assert.equal(saved.aggregate.total.inputTotal, 123);
    assert.equal(saved.files.a.sourceArea, 'sessions');
    assert.deepEqual(saved.coverage.identity, {
      exactDuplicateFiles: 2,
      ambiguousSessionGroups: 3,
      complete: false,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('schema v2 legacy contributions do not invent a missing sourceArea', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-index-source-area-'));
  try {
    const indexPath = path.join(root, 'codex-index.json');
    const legacy = createEmptyCodexIndex();
    const body = JSON.parse(JSON.stringify(legacy)) as Record<string, unknown>;
    body.files = {
      legacy: {
        fileKey: 'legacy-key',
        size: 0,
        mtimeMs: 0,
        offset: 0,
        discardingOversizedLine: false,
        parserState: {
          schemaVersion: 1,
          fileKey: 'legacy-key',
          sessionKey: 'legacy-session-key',
          role: 'root',
          qualityFlags: [],
        },
        aggregate: {
          total: { inputTotal: 0, outputTotal: 0 },
          byDay: {},
          byModel: {},
          byEffort: {},
          session: { sessionKey: 'legacy-session-key', role: 'root' },
          structural: {},
        },
        qualityFlags: [],
      },
    };
    await writeFile(indexPath, JSON.stringify(body), 'utf8');

    const loaded = await loadCodexIndex(indexPath);
    await saveCodexIndexAtomic(indexPath, loaded);
    const saved = JSON.parse(await readFile(indexPath, 'utf8')) as {
      files: Record<string, { sourceArea?: string }>;
    };

    assert.equal(loaded.files.legacy.sourceArea, undefined);
    assert.equal(saved.files.legacy.sourceArea, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('unchanged multi-gigabyte metadata performs zero body reads', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-index-large-'));
  try {
    const sessions = path.join(root, 'sessions');
    const activePath = path.join(sessions, 'rollout-large.jsonl');
    await mkdir(sessions, { recursive: true });
    await writeFile(activePath, completeSession('large', 100, 20), 'utf8');
    const coldManifest = await scanCodexManifest(root, SALT);
    const cold = await updateCodexIndex(
      createEmptyCodexIndex(),
      coldManifest,
      { salt: SALT },
    );
    const key = coldManifest.files[0].fileKey;
    const simulatedSize = 2_200_000_000;
    const file = {
      ...coldManifest.files[0],
      size: simulatedSize,
      mtimeMs: 99,
    };
    const previous = structuredClone(cold.index);
    previous.files[key].size = simulatedSize;
    previous.files[key].offset = simulatedSize;
    previous.files[key].mtimeMs = 99;
    const io = trackingIo();

    const result = await updateCodexIndex(
      previous,
      persistableManifest([file]),
      { salt: SALT, io },
    );

    assert.equal(result.index.coverage.totalBytes, simulatedSize);
    assert.equal(result.index.coverage.complete, true);
    assert.equal(io.bodyReads.size, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('an old unchanged index receives one bounded identity metadata pass', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-index-identity-'));
  try {
    const sessions = path.join(root, 'sessions');
    await mkdir(sessions, { recursive: true });
    await writeFile(
      path.join(sessions, 'rollout-identity.jsonl'),
      completeSession('identity', 100, 20),
      'utf8',
    );
    const manifest = await scanCodexManifest(root, SALT);
    const cold = await updateCodexIndex(
      createEmptyCodexIndex(),
      manifest,
      { salt: SALT },
    );
    const key = manifest.files[0].fileKey;
    const oldIndex = structuredClone(cold.index);
    delete oldIndex.files[key].aggregate.session.projectName;
    delete oldIndex.files[key].aggregate.session.projectDirectoryName;
    delete oldIndex.files[key].aggregate.session.agentNickname;
    delete oldIndex.files[key].identityChecked;
    const io = trackingIo();

    const enriched = await updateCodexIndex(oldIndex, manifest, {
      salt: SALT,
      io,
    });

    assert.equal(
      enriched.index.files[key].aggregate.session.projectName,
      'ExampleProject',
    );
    assert.equal(enriched.index.files[key].identityChecked, true);
    assert.deepEqual(io.readOffsets, [0]);
    assert.equal(enriched.index.aggregate.total.inputTotal, 100);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('an incomplete tail is re-read from its verified offset after newline', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-index-carry-'));
  try {
    const sessions = path.join(root, 'sessions');
    const activePath = path.join(sessions, 'rollout-carry.jsonl');
    await mkdir(sessions, { recursive: true });
    await writeFile(
      activePath,
      tokenLine(80, 10, '2026-07-20T00:01:00.000Z'),
      'utf8',
    );
    const firstManifest = await scanCodexManifest(root, SALT);
    const cold = await updateCodexIndex(
      createEmptyCodexIndex(),
      firstManifest,
      { salt: SALT },
    );
    const key = firstManifest.files[0].fileKey;

    assert.equal(cold.index.aggregate.total.inputTotal, 0);
    assert.equal(cold.index.files[key].offset, 0);
    assert.equal(cold.index.files[key].discardingOversizedLine, false);
    assert.equal(cold.index.files[key].qualityFlags.includes('invalid-json'), false);

    await appendFile(activePath, '\n', 'utf8');
    const warm = await updateCodexIndex(
      cold.index,
      await scanCodexManifest(root, SALT),
      { salt: SALT },
    );

    assert.equal(warm.index.aggregate.total.inputTotal, 80);
    assert.equal(warm.index.files[key].offset, Buffer.byteLength(
      `${tokenLine(80, 10, '2026-07-20T00:01:00.000Z')}\n`,
      'utf8',
    ));
    assert.equal(warm.index.files[key].discardingOversizedLine, false);
    assert.equal(warm.index.files[key].qualityFlags.includes('invalid-json'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('truncate rebuilds only the affected contribution', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-index-truncate-'));
  try {
    const sessions = path.join(root, 'sessions');
    const firstPath = path.join(sessions, 'rollout-first.jsonl');
    const secondPath = path.join(sessions, 'rollout-second.jsonl');
    await mkdir(sessions, { recursive: true });
    await writeFile(firstPath, completeSession('first', 100, 20), 'utf8');
    await writeFile(secondPath, completeSession('second', 300, 60), 'utf8');
    const manifest1 = await scanCodexManifest(root, SALT);
    const cold = await updateCodexIndex(
      createEmptyCodexIndex('Asia/Hong_Kong'),
      manifest1,
      { salt: SALT, timeZone: 'Asia/Hong_Kong' },
    );
    await writeFile(
      firstPath,
      `${tokenLine(10, 2, '2026-07-20T00:03:00.000Z')}\n`,
      'utf8',
    );
    const manifest2 = await scanCodexManifest(root, SALT);
    const firstKey = manifest2.files.find((file) => file.absolutePath === firstPath)!.fileKey;
    const secondKey = manifest2.files.find((file) => file.absolutePath === secondPath)!.fileKey;
    const io = trackingIo();

    const rebuilt = await updateCodexIndex(cold.index, manifest2, {
      salt: SALT,
      timeZone: 'Asia/Hong_Kong',
      io,
    });

    assert.equal(io.bodyReads.get(firstKey), 1);
    assert.equal(io.bodyReads.has(secondKey), false);
    assert.equal(rebuilt.index.aggregate.total.inputTotal, 310);
    assert.equal(
      rebuilt.index.files[firstKey].aggregate.period?.days['2026-07-20'].total
        .inputTotal,
      10,
    );
    assert.deepEqual(
      rebuilt.index.files[secondKey].aggregate.period,
      cold.index.files[secondKey].aggregate.period,
    );
    assert.ok(rebuilt.index.files[firstKey].qualityFlags.includes('truncated-jsonl'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('replacement rebuilds only the affected period contribution', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-index-replace-period-'));
  try {
    const sessions = path.join(root, 'sessions');
    const firstPath = path.join(sessions, 'rollout-replaced.jsonl');
    const secondPath = path.join(sessions, 'rollout-unchanged.jsonl');
    await mkdir(sessions, { recursive: true });
    await writeFile(firstPath, completeSession('replace-old', 100, 20), 'utf8');
    await writeFile(secondPath, completeSession('unchanged', 300, 60), 'utf8');
    const firstManifest = await scanCodexManifest(root, SALT);
    const cold = await updateCodexIndex(
      createEmptyCodexIndex('Asia/Hong_Kong'),
      firstManifest,
      { salt: SALT, timeZone: 'Asia/Hong_Kong' },
    );
    await writeFile(
      firstPath,
      `${tokenLine(25, 5, '2026-07-20T16:05:00.000Z')}\n`,
      'utf8',
    );
    const scanned = await scanCodexManifest(root, SALT);
    const replacedEntry = scanned.files.find(
      (file) => file.absolutePath === firstPath,
    )!;
    replacedEntry.ino = (replacedEntry.ino ?? 1) + 10_000;
    const manifest = persistableManifest(scanned.files);
    const firstKey = replacedEntry.fileKey;
    const secondKey = scanned.files.find(
      (file) => file.absolutePath === secondPath,
    )!.fileKey;
    const io = trackingIo();

    const rebuilt = await updateCodexIndex(cold.index, manifest, {
      salt: SALT,
      timeZone: 'Asia/Hong_Kong',
      io,
    });

    assert.equal(io.bodyReads.get(firstKey), 1);
    assert.equal(io.bodyReads.has(secondKey), false);
    assert.equal(
      rebuilt.index.files[firstKey].aggregate.period?.days['2026-07-21'].total
        .inputTotal,
      25,
    );
    assert.deepEqual(
      rebuilt.index.files[secondKey].aggregate.period,
      cold.index.files[secondKey].aggregate.period,
    );
    assert.ok(rebuilt.index.files[firstKey].qualityFlags.includes('replaced-jsonl'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('moving a session to the archive reuses its contribution', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-index-move-'));
  try {
    const sessions = path.join(root, 'sessions');
    const archive = path.join(root, 'archived_sessions');
    const livePath = path.join(sessions, 'rollout-move.jsonl');
    const archivedPath = path.join(archive, 'rollout-move.jsonl');
    await mkdir(sessions, { recursive: true });
    await mkdir(archive, { recursive: true });
    await writeFile(livePath, completeSession('move', 120, 30), 'utf8');
    const manifest1 = await scanCodexManifest(root, SALT);
    const cold = await updateCodexIndex(
      createEmptyCodexIndex(),
      manifest1,
      { salt: SALT },
    );
    const oldKey = manifest1.files[0].fileKey;
    await rename(livePath, archivedPath);
    const manifest2 = await scanCodexManifest(root, SALT);
    const newKey = manifest2.files[0].fileKey;
    const io = trackingIo();

    const moved = await updateCodexIndex(cold.index, manifest2, {
      salt: SALT,
      io,
    });

    assert.notEqual(oldKey, newKey);
    assert.equal(oldKey in moved.index.files, false);
    assert.equal(newKey in moved.index.files, true);
    assert.deepEqual(moved.index.aggregate, cold.index.aggregate);
    assert.equal(io.bodyReads.size, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a failed tail read preserves the last verified contribution', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-index-failure-'));
  try {
    const sessions = path.join(root, 'sessions');
    const activePath = path.join(sessions, 'rollout-failure.jsonl');
    await mkdir(sessions, { recursive: true });
    await writeFile(activePath, completeSession('failure', 100, 20), 'utf8');
    const manifest1 = await scanCodexManifest(root, SALT);
    const cold = await updateCodexIndex(
      createEmptyCodexIndex(),
      manifest1,
      { salt: SALT },
    );
    await appendFile(
      activePath,
      `${tokenLine(200, 40, '2026-07-20T00:02:00.000Z')}\n`,
      'utf8',
    );
    const manifest2 = await scanCodexManifest(root, SALT);
    const failingIo: CodexIndexIo = {
      async *read(entry, start, endExclusive) {
        const body = await readFile(entry.absolutePath);
        yield body.subarray(start, endExclusive);
        throw new Error('synthetic read failure');
      },
    };

    const failed = await updateCodexIndex(cold.index, manifest2, {
      salt: SALT,
      io: failingIo,
    });
    const key = manifest2.files[0].fileKey;

    assert.equal(failed.failedFiles, 1);
    assert.equal(failed.index.aggregate.total.inputTotal, 100);
    assert.ok(failed.index.files[key].qualityFlags.includes('stale-file'));
    assert.equal(failed.index.coverage.complete, false);

    const retried = await updateCodexIndex(failed.index, manifest2, {
      salt: SALT,
    });
    assert.equal(retried.index.aggregate.total.inputTotal, 200);
    assert.equal(retried.index.files[key].qualityFlags.includes('stale-file'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
