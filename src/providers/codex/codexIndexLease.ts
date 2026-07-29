import { randomUUID } from 'node:crypto';
import {
  mkdir,
  open,
  readFile,
  stat,
  unlink,
} from 'node:fs/promises';
import * as path from 'node:path';

const DEFAULT_RETRY_DELAY_MS = 50;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_STALE_MS = 30 * 60_000;
const INCOMPLETE_OWNER_GRACE_MS = 5_000;

interface CodexIndexLeaseOwner {
  pid: number;
  token: string;
  createdAt: number;
}

export interface CodexIndexLease {
  release(): Promise<void>;
}

export interface CodexIndexLeaseOptions {
  now?: () => number;
  shouldCancel?: () => boolean;
  retryDelayMs?: number;
  timeoutMs?: number;
  staleMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  isProcessAlive?: (pid: number) => boolean;
}

export class CodexIndexLeaseBusyError extends Error {
  readonly code = 'busy';

  constructor() {
    super('Another Codex usage refresh is already running');
    this.name = 'CodexIndexLeaseBusyError';
  }
}

export class CodexIndexLeaseCancelledError extends Error {
  readonly code = 'cancelled';

  constructor() {
    super('Codex indexing was cancelled');
    this.name = 'CodexIndexLeaseCancelledError';
  }
}

function isErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}

function parseOwner(value: string): CodexIndexLeaseOwner | undefined {
  try {
    const parsed = JSON.parse(value) as Partial<CodexIndexLeaseOwner>;
    if (
      Number.isInteger(parsed.pid) &&
      (parsed.pid ?? 0) > 0 &&
      typeof parsed.token === 'string' &&
      parsed.token.length > 0 &&
      typeof parsed.createdAt === 'number' &&
      Number.isFinite(parsed.createdAt)
    ) {
      return parsed as CodexIndexLeaseOwner;
    }
  } catch {
    // An interrupted creator left an invalid lock, so the next owner may recover it.
  }
  return undefined;
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !isErrorCode(error, 'ESRCH');
  }
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function staleLock(
  lockPath: string,
  now: number,
  staleMs: number,
  isProcessAlive: (pid: number) => boolean,
): Promise<boolean> {
  try {
    const [contents, info] = await Promise.all([
      readFile(lockPath, 'utf8'),
      stat(lockPath),
    ]);
    const owner = parseOwner(contents);
    if (!owner) {
      // A contender can observe the file after open('wx') but before the
      // creator finishes writing its owner record. Protect that acquisition
      // window while still recovering a creator that died mid-write.
      return now - info.mtimeMs >= INCOMPLETE_OWNER_GRACE_MS;
    }
    return (
      now - owner.createdAt >= staleMs ||
      !isProcessAlive(owner.pid)
    );
  } catch (error) {
    if (isErrorCode(error, 'ENOENT')) {
      return false;
    }
    throw error;
  }
}

export async function acquireCodexIndexLease(
  indexPath: string,
  options: CodexIndexLeaseOptions = {},
): Promise<CodexIndexLease> {
  const lockPath = `${indexPath}.lock`;
  const now = options.now ?? Date.now;
  const shouldCancel = options.shouldCancel ?? (() => false);
  const retryDelayMs = Math.max(
    0,
    Math.floor(options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS),
  );
  const timeoutMs = Math.max(
    0,
    Math.floor(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  );
  const staleMs = Math.max(
    1,
    Math.floor(options.staleMs ?? DEFAULT_STALE_MS),
  );
  const sleep = options.sleep ?? delay;
  const isProcessAlive = options.isProcessAlive ?? processIsAlive;
  const startedAt = now();
  await mkdir(path.dirname(indexPath), { recursive: true });

  while (true) {
    if (shouldCancel()) {
      throw new CodexIndexLeaseCancelledError();
    }
    const owner: CodexIndexLeaseOwner = {
      pid: process.pid,
      token: randomUUID(),
      createdAt: now(),
    };
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(lockPath, 'wx', 0o600);
      await handle.writeFile(JSON.stringify(owner), 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;
      let released = false;
      return {
        async release(): Promise<void> {
          if (released) {
            return;
          }
          let current: CodexIndexLeaseOwner | undefined;
          try {
            current = parseOwner(await readFile(lockPath, 'utf8'));
          } catch (error) {
            if (isErrorCode(error, 'ENOENT')) {
              released = true;
              return;
            }
            throw error;
          }
          if (current?.token === owner.token) {
            await unlink(lockPath).catch((error: unknown) => {
              if (!isErrorCode(error, 'ENOENT')) {
                throw error;
              }
            });
          }
          released = true;
        },
      };
    } catch (error) {
      await handle?.close().catch(() => undefined);
      if (!isErrorCode(error, 'EEXIST')) {
        throw error;
      }
      if (await staleLock(lockPath, now(), staleMs, isProcessAlive)) {
        await unlink(lockPath).catch((unlinkError: unknown) => {
          if (!isErrorCode(unlinkError, 'ENOENT')) {
            throw unlinkError;
          }
        });
        continue;
      }
      if (now() - startedAt >= timeoutMs) {
        throw new CodexIndexLeaseBusyError();
      }
      await sleep(retryDelayMs);
    }
  }
}
