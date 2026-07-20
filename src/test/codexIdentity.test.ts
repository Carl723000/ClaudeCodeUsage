import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  loadCodexSessionTitles,
  pseudonymousIdentityKey,
  safeProjectIdentity,
} from '../providers/codex/codexIdentity';

const SALT = 'identity-test-salt';

test('session index keeps the latest clean title behind an anonymous key', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-title-'));
  try {
    await writeFile(
      path.join(root, 'session_index.jsonl'),
      [
        JSON.stringify({
          id: 'raw-session-a',
          thread_name: '  First\n title  ',
          updated_at: '2026-07-20T01:00:00.000Z',
        }),
        '{not-json}',
        JSON.stringify({
          id: 'raw-session-a',
          thread_name: '真实的最新标题',
          updated_at: '2026-07-20T02:00:00.000Z',
        }),
        JSON.stringify({ id: 'raw-session-b', thread_name: 'Second title' }),
        '',
      ].join('\n'),
      'utf8',
    );

    const titles = await loadCodexSessionTitles(root, SALT);

    assert.equal(
      titles.get(pseudonymousIdentityKey(SALT, 'raw-session-a')),
      '真实的最新标题',
    );
    assert.equal(
      titles.get(pseudonymousIdentityKey(SALT, 'raw-session-b')),
      'Second title',
    );
    assert.doesNotMatch(JSON.stringify([...titles]), /raw-session/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('session title loading rejects a symlinked metadata file', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-title-link-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-title-out-'));
  try {
    const target = path.join(outside, 'session_index.jsonl');
    await writeFile(
      target,
      `${JSON.stringify({ id: 'raw-session', thread_name: 'must not load' })}\n`,
      'utf8',
    );
    await mkdir(root, { recursive: true });
    await symlink(target, path.join(root, 'session_index.jsonl'));

    assert.deepEqual(
      [...(await loadCodexSessionTitles(root, SALT)).entries()],
      [],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('project identity prefers a repository name and keeps only a cwd basename', () => {
  assert.deepEqual(
    safeProjectIdentity(
      '/private/tmp/claude-code-usage-v221',
      'https://github.com/Carl723000/ClaudeCodeUsage.git',
    ),
    {
      keySource: 'https://github.com/Carl723000/ClaudeCodeUsage.git',
      name: 'ClaudeCodeUsage',
      directoryName: 'claude-code-usage-v221',
    },
  );
  assert.deepEqual(safeProjectIdentity('C:\\Users\\Carl\\TianGong'), {
    keySource: 'C:\\Users\\Carl\\TianGong',
    name: 'TianGong',
    directoryName: 'TianGong',
  });
  assert.deepEqual(safeProjectIdentity('/Users/carl/Jiaming/PolyU_research'), {
    keySource: '/Users/carl/Jiaming/PolyU_research',
    name: 'PolyU_research',
    directoryName: 'PolyU_research',
  });
});
