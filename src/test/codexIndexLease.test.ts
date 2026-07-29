import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  CodexIndexLeaseBusyError,
  CodexIndexLeaseCancelledError,
  acquireCodexIndexLease,
} from '../providers/codex/codexIndexLease';

test('a second Codex index lease waits until the first lease releases', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-lease-serial-'));
  try {
    const indexPath = path.join(root, 'cache', 'index.json');
    const first = await acquireCodexIndexLease(indexPath);
    let secondAcquired = false;
    const secondPending = acquireCodexIndexLease(indexPath, {
      retryDelayMs: 1,
      timeoutMs: 1_000,
    }).then((lease) => {
      secondAcquired = true;
      return lease;
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(secondAcquired, false);
    await first.release();
    const second = await secondPending;
    assert.equal(secondAcquired, true);
    await second.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a dead lease owner is reclaimed without waiting for the timeout', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-lease-dead-'));
  try {
    const indexPath = path.join(root, 'cache', 'index.json');
    const lockPath = `${indexPath}.lock`;
    await mkdir(path.dirname(indexPath), { recursive: true });
    await writeFile(
      lockPath,
      JSON.stringify({ pid: 424242, token: 'dead-owner', createdAt: 1_000 }),
      'utf8',
    );

    const lease = await acquireCodexIndexLease(indexPath, {
      now: () => 1_001,
      isProcessAlive: () => false,
      timeoutMs: 0,
    });

    assert.doesNotMatch(await readFile(lockPath, 'utf8'), /dead-owner/);
    await lease.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a fresh incomplete owner file is protected while an abandoned one is reclaimed', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-lease-incomplete-'));
  try {
    const indexPath = path.join(root, 'cache', 'index.json');
    const lockPath = `${indexPath}.lock`;
    const now = Date.now();
    await mkdir(path.dirname(indexPath), { recursive: true });
    await writeFile(lockPath, '', 'utf8');

    await assert.rejects(
      acquireCodexIndexLease(indexPath, {
        now: () => now,
        timeoutMs: 0,
      }),
      CodexIndexLeaseBusyError,
    );
    assert.equal(await readFile(lockPath, 'utf8'), '');

    const abandonedAt = new Date(now - 10_000);
    await utimes(lockPath, abandonedAt, abandonedAt);
    const recovered = await acquireCodexIndexLease(indexPath, {
      now: () => now,
      timeoutMs: 0,
    });
    assert.doesNotMatch(await readFile(lockPath, 'utf8'), /^$/);
    await recovered.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a live lease times out with a safe busy error', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-lease-busy-'));
  try {
    const indexPath = path.join(root, 'cache', 'index.json');
    const first = await acquireCodexIndexLease(indexPath);
    let now = 0;

    await assert.rejects(
      acquireCodexIndexLease(indexPath, {
        now: () => {
          now += 100;
          return now;
        },
        isProcessAlive: () => true,
        retryDelayMs: 0,
        timeoutMs: 150,
        sleep: async () => undefined,
      }),
      CodexIndexLeaseBusyError,
    );
    await first.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('waiting for a Codex index lease honours cancellation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-lease-cancel-'));
  try {
    const indexPath = path.join(root, 'cache', 'index.json');
    const first = await acquireCodexIndexLease(indexPath);
    let cancelled = false;

    await assert.rejects(
      acquireCodexIndexLease(indexPath, {
        shouldCancel: () => cancelled,
        isProcessAlive: () => true,
        retryDelayMs: 0,
        sleep: async () => { cancelled = true; },
      }),
      CodexIndexLeaseCancelledError,
    );
    await first.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('release never removes a lock whose ownership token changed', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-lease-token-'));
  try {
    const indexPath = path.join(root, 'cache', 'index.json');
    const lockPath = `${indexPath}.lock`;
    const lease = await acquireCodexIndexLease(indexPath);
    await writeFile(
      lockPath,
      JSON.stringify({ pid: process.pid, token: 'new-owner', createdAt: Date.now() }),
      'utf8',
    );

    await lease.release();

    assert.match(await readFile(lockPath, 'utf8'), /new-owner/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('release can be retried after a transient lock read failure', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-codex-lease-release-retry-'));
  try {
    const indexPath = path.join(root, 'cache', 'index.json');
    const lockPath = `${indexPath}.lock`;
    const heldOwnerPath = `${lockPath}.held-owner`;
    const lease = await acquireCodexIndexLease(indexPath);
    await rename(lockPath, heldOwnerPath);
    await mkdir(lockPath);

    await assert.rejects(lease.release());

    await rm(lockPath, { recursive: true, force: true });
    await rename(heldOwnerPath, lockPath);
    await lease.release();
    await assert.rejects(readFile(lockPath, 'utf8'), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
