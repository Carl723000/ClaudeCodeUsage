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
      createEmptyCodexIndex(),
      manifest1,
      { salt: SALT },
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
      io,
    });

    assert.equal(io.bodyReads.get(firstKey), 1);
    assert.equal(io.bodyReads.has(secondKey), false);
    assert.equal(rebuilt.index.aggregate.total.inputTotal, 310);
    assert.ok(rebuilt.index.files[firstKey].qualityFlags.includes('truncated-jsonl'));
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
