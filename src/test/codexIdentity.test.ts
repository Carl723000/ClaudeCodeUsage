import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  loadCodexSessionTitles,
  normalizeRepositoryIdentity,
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
          thread_name: '  newest valid\n title  ',
          updated_at: '2026-07-20T03:00:00.000Z',
        }),
        '{not-json}',
        JSON.stringify({
          id: 'raw-session-a',
          thread_name: 'older title written later',
          updated_at: '2026-07-20T02:00:00.000Z',
        }),
        JSON.stringify({ id: 'raw-session-b', thread_name: 'missing timestamp' }),
        JSON.stringify({
          id: 'raw-session-b',
          thread_name: 'valid timestamp wins',
          updated_at: '2026-07-20T01:00:00.000Z',
        }),
        JSON.stringify({
          id: 'raw-session-b',
          thread_name: 'invalid timestamp written last',
          updated_at: 'not-a-date',
        }),
        JSON.stringify({
          id: 'raw-session-e',
          thread_name: 'same timestamp first',
          updated_at: '2026-07-20T04:00:00.000Z',
        }),
        JSON.stringify({
          id: 'raw-session-e',
          thread_name: 'same timestamp later ordinal',
          updated_at: '2026-07-20T04:00:00.000Z',
        }),
        JSON.stringify({
          id: 'raw-session-f',
          thread_name: 'invalid first',
          updated_at: 'invalid',
        }),
        JSON.stringify({ id: 'raw-session-f', thread_name: 'missing later ordinal' }),
        JSON.stringify({
          id: 'raw-session-c',
          thread_name:
            'Inspect /Users/carl/Jiaming/private.ts and C:\\Users\\Carl\\secret.ts',
        }),
        JSON.stringify({
          id: 'raw-session-d',
          thread_name: '检查路径：/Users/bob/private.ts',
        }),
        '',
      ].join('\n'),
      'utf8',
    );

    const titles = await loadCodexSessionTitles(root, SALT);

    assert.equal(
      titles.get(pseudonymousIdentityKey(SALT, 'raw-session-a')),
      'newest valid title',
    );
    assert.equal(
      titles.get(pseudonymousIdentityKey(SALT, 'raw-session-b')),
      'valid timestamp wins',
    );
    assert.equal(
      titles.get(pseudonymousIdentityKey(SALT, 'raw-session-e')),
      'same timestamp later ordinal',
    );
    assert.equal(
      titles.get(pseudonymousIdentityKey(SALT, 'raw-session-f')),
      'missing later ordinal',
    );
    const redacted = titles.get(
      pseudonymousIdentityKey(SALT, 'raw-session-c'),
    ) ?? '';
    assert.match(redacted, /\[path\]/);
    assert.doesNotMatch(redacted, /\/Users\/|C:\\Users\\Carl/);
    assert.doesNotMatch(
      titles.get(pseudonymousIdentityKey(SALT, 'raw-session-d')) ?? '',
      /\/Users\//,
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
      keySource: 'repo:github.com/carl723000/claudecodeusage',
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

test('SSH HTTPS and dot-git variants share one repository identity', () => {
  const variants = [
    'git@github.com:Owner/Repo.git',
    'ssh://git@github.com:22/Owner/Repo',
    'https://github.com/owner/repo.git/',
    'git://github.com/OWNER/REPO.git',
  ];
  assert.deepEqual(
    variants.map((value) => normalizeRepositoryIdentity(value)?.keySource),
    [
      'repo:github.com/owner/repo',
      'repo:github.com/owner/repo',
      'repo:github.com/owner/repo',
      'repo:github.com/owner/repo',
    ],
  );
  assert.deepEqual(
    variants.map((value) => normalizeRepositoryIdentity(value)?.name),
    ['Repo', 'Repo', 'repo', 'REPO'],
  );
});

test('repository canonicalization strips secrets and URL-only decorations', () => {
  const raw = 'https://user:token@example.com:443/Owner/PrivateRepo.git?access_token=secret#fragment';
  const identity = normalizeRepositoryIdentity(raw);

  assert.deepEqual(identity, {
    keySource: 'repo:example.com/Owner/PrivateRepo',
    name: 'PrivateRepo',
  });
  assert.doesNotMatch(
    JSON.stringify(identity),
    /user|token|access_token|secret|fragment|https:/,
  );
});

test('repository display name remains a sanitized basename after decoding', () => {
  const identity = normalizeRepositoryIdentity(
    'https://example.com/Owner/%2FUsers%2Falice%2FSecretRepo.git',
  );

  assert.equal(identity?.name, 'SecretRepo');
  assert.doesNotMatch(JSON.stringify(identity?.name), /Users|alice|[\\/]/);
});

test('host and hosted-service path case rules are stable', () => {
  assert.equal(
    normalizeRepositoryIdentity('https://GITLAB.com/Group/SubGroup/Repo.git')?.keySource,
    'repo:gitlab.com/group/subgroup/repo',
  );
  assert.equal(
    normalizeRepositoryIdentity('https://BITBUCKET.org/Owner/Repo.git')?.keySource,
    'repo:bitbucket.org/owner/repo',
  );
  assert.equal(
    normalizeRepositoryIdentity('ssh://git@Code.Example.com:22/Owner/Repo.git')?.keySource,
    'repo:code.example.com/Owner/Repo',
  );
  assert.equal(
    normalizeRepositoryIdentity('https://Code.Example.com:8443/Owner/Repo.git')?.keySource,
    'repo:code.example.com:8443/Owner/Repo',
  );
});

test('same repository basename under different owners stays distinct', () => {
  assert.notEqual(
    normalizeRepositoryIdentity('https://github.com/one/repo.git')?.keySource,
    normalizeRepositoryIdentity('https://github.com/two/repo.git')?.keySource,
  );
});
