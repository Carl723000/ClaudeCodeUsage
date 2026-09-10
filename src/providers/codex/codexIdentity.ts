import { createHash, createHmac } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import * as path from 'node:path';
import { createInterface } from 'node:readline';

const MAX_TITLE_LENGTH = 200;
const MAX_PROJECT_LABEL_LENGTH = 120;

interface SessionIndexFileStamp {
  size: number;
  mtimeMs: number;
  dev: number;
  ino: number;
}

interface SessionTitleCacheIo {
  stat(indexPath: string): Promise<SessionIndexFileStamp | undefined>;
  read(indexPath: string, salt: string): Promise<Map<string, string> | undefined>;
}

interface SessionTitleCacheEntry extends SessionIndexFileStamp {
  indexPath: string;
  saltFingerprint: string;
  titles: Map<string, string>;
}

interface SessionTitleCachePending extends SessionIndexFileStamp {
  indexPath: string;
  saltFingerprint: string;
  promise: Promise<Map<string, string>>;
}

export interface CodexProjectIdentity {
  keySource?: string;
  name?: string;
  directoryName?: string;
}

export interface NormalizedRepositoryIdentity {
  keySource: string;
  name: string;
}

declare const pseudonymousIdentityKeyBrand: unique symbol;
export type PseudonymousIdentityKey = string & {
  readonly [pseudonymousIdentityKeyBrand]: true;
};

export function parsePseudonymousIdentityKey(
  value: unknown,
): PseudonymousIdentityKey | undefined {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
    ? value as PseudonymousIdentityKey
    : undefined;
}

export function pseudonymousIdentityKey(
  salt: string,
  raw: string,
): PseudonymousIdentityKey {
  return createHmac('sha256', salt)
    .update('codex-identity\0')
    .update(raw)
    .digest('hex') as PseudonymousIdentityKey;
}

export const NEUTRAL_CODEX_SESSION_KEY = pseudonymousIdentityKey(
  'codex-internal-neutral-v1',
  'session',
);
export const NEUTRAL_CODEX_PROJECT_KEY = pseudonymousIdentityKey(
  'codex-internal-neutral-v1',
  'project',
);

/**
 * Converts a persisted pseudonymous identity key into the shorter key allowed
 * in webview DOM and client state. Callers must pass an existing local HMAC
 * identity, never a raw session ID, path, or repository URL.
 */
export function stableCodexViewKey(value: PseudonymousIdentityKey): string {
  const parsed = parsePseudonymousIdentityKey(value);
  if (!parsed) {
    throw new TypeError('Expected an existing pseudonymous identity key');
  }
  return createHash('sha256').update(parsed).digest('hex').slice(0, 16);
}

function cleanLabel(value: string, maxLength: number): string | undefined {
  const clean = value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
  return clean || undefined;
}

function redactAbsolutePaths(value: string): string {
  return value
    .replace(/file:\/\/\/[^\s"'`<>]+/gi, '[path]')
    .replace(/[a-z]:[\\/][^\s"'`<>]+/gi, '[path]')
    .replace(
      /(^|[^/])\/(?:[^\s/"'`<>]+\/)+[^\s"'`<>]+/g,
      '$1[path]',
    )
    .replace(/(^|[\s("'`:])\/[^\s"'`<>]+/g, '$1[path]')
    .replace(/(^|[\s("'`])\\\\[^\s"'`<>]+/g, '$1[path]');
}

function basename(value: string): string | undefined {
  const normalized = value.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized) {
    return undefined;
  }
  return cleanLabel(normalized.split('/').pop() ?? '', MAX_PROJECT_LABEL_LENGTH);
}

function safeDecodedRepositorySegment(value: string): boolean {
  return Boolean(value.trim()) &&
    value !== '.' &&
    value !== '..' &&
    !/%[0-9a-f]{2}/i.test(value) &&
    !/[\\/]/.test(value) &&
    !/[\p{Cc}\p{Cf}]/u.test(value);
}

function decodeRepositorySegment(value: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return undefined;
  }
  return safeDecodedRepositorySegment(decoded) ? decoded : undefined;
}

const LOWERCASE_REPOSITORY_PATH_HOSTS = new Set([
  'github.com',
  'gitlab.com',
  'bitbucket.org',
]);

const DEFAULT_REPOSITORY_PORTS: Readonly<Record<string, string>> = {
  'http:': '80',
  'https:': '443',
  'ssh:': '22',
  'git:': '9418',
};

function repositoryPathIdentity(
  hostValue: string,
  port: string,
  pathValue: string,
): NormalizedRepositoryIdentity | undefined {
  const host = hostValue.trim().toLowerCase();
  const trimmedPath = pathValue
    .replace(/\\/g, '/')
    .replace(/[?#].*$/, '')
    .replace(/^\/+|\/+$/g, '');
  const rawSegments = trimmedPath.split('/').filter(Boolean);
  if (!host || rawSegments.length === 0) {
    return undefined;
  }
  const segments: string[] = [];
  for (const rawSegment of rawSegments) {
    const decoded = decodeRepositorySegment(rawSegment);
    if (decoded === undefined) {
      return undefined;
    }
    segments.push(decoded);
  }
  const lastIndex = segments.length - 1;
  segments[lastIndex] = segments[lastIndex].replace(/\.git$/i, '');
  if (!safeDecodedRepositorySegment(segments[lastIndex])) {
    return undefined;
  }
  const name = cleanLabel(segments[lastIndex], MAX_PROJECT_LABEL_LENGTH);
  if (!name) {
    return undefined;
  }
  const canonicalPath = LOWERCASE_REPOSITORY_PATH_HOSTS.has(host)
    ? segments.join('/').toLowerCase()
    : segments.join('/');
  const authority = port ? `${host}:${port}` : host;
  return {
    keySource: `repo:${authority}/${canonicalPath}`,
    name,
  };
}

export function normalizeRepositoryIdentity(
  repositoryUrl: string,
): NormalizedRepositoryIdentity | undefined {
  const value = repositoryUrl.trim();
  const scp = /^[^@\s/:]+@([^:\s/]+):(.+)$/.exec(value);
  if (scp) {
    return repositoryPathIdentity(scp[1], '', scp[2]);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }
  if (!(parsed.protocol in DEFAULT_REPOSITORY_PORTS)) {
    return undefined;
  }
  const rawUrl = /^[a-z][a-z0-9+.-]*:\/\/[^/?#\\]*((?:[\\/])[^?#]*)?/i
    .exec(value);
  if (!rawUrl) {
    return undefined;
  }
  const port = parsed.port === DEFAULT_REPOSITORY_PORTS[parsed.protocol]
    ? ''
    : parsed.port;
  return repositoryPathIdentity(parsed.hostname, port, rawUrl[1] ?? '');
}

export function safeProjectIdentity(
  cwd?: string,
  repositoryUrl?: string,
): CodexProjectIdentity {
  const directoryName = cwd ? basename(cwd) : undefined;
  const repository = repositoryUrl
    ? normalizeRepositoryIdentity(repositoryUrl)
    : undefined;
  const keySource = repository
    ? repository.keySource
    : cwd?.trim() || undefined;
  const name = repository?.name ?? directoryName;
  return {
    ...(keySource ? { keySource } : {}),
    ...(name ? { name } : {}),
    ...(directoryName ? { directoryName } : {}),
  };
}

function sessionTitleRecord(
  line: string,
): { id: string; title: string; updatedAt?: number } | undefined {
  try {
    const parsed: unknown = JSON.parse(line);
    if (typeof parsed !== 'object' || parsed === null) {
      return undefined;
    }
    const record = parsed as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.thread_name !== 'string') {
      return undefined;
    }
    const id = record.id.trim();
    const title = cleanLabel(
      redactAbsolutePaths(record.thread_name),
      MAX_TITLE_LENGTH,
    );
    const parsedUpdatedAt = typeof record.updated_at === 'string'
      ? Date.parse(record.updated_at)
      : Number.NaN;
    const updatedAt = Number.isFinite(parsedUpdatedAt)
      ? parsedUpdatedAt
      : undefined;
    return id && title
      ? { id, title, ...(updatedAt === undefined ? {} : { updatedAt }) }
      : undefined;
  } catch {
    return undefined;
  }
}

async function sessionIndexFileStamp(
  indexPath: string,
): Promise<SessionIndexFileStamp | undefined> {
  try {
    const info = await lstat(indexPath);
    if (!info.isFile() || info.isSymbolicLink()) {
      return undefined;
    }
    if (
      !Number.isFinite(info.size) ||
      info.size < 0 ||
      !Number.isFinite(info.mtimeMs)
    ) {
      return undefined;
    }
    return {
      size: info.size,
      mtimeMs: info.mtimeMs,
      dev: Number.isFinite(info.dev) ? info.dev : 0,
      ino: Number.isFinite(info.ino) ? info.ino : 0,
    };
  } catch {
    return undefined;
  }
}

function sameSessionIndexFile(
  left: SessionIndexFileStamp,
  right: SessionIndexFileStamp,
): boolean {
  return left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.dev === right.dev &&
    left.ino === right.ino;
}

async function readCodexSessionTitles(
  indexPath: string,
  salt: string,
): Promise<Map<string, string> | undefined> {
  const titleRecords = new Map<
    string,
    { title: string; updatedAt?: number; ordinal: number }
  >();
  const lines = createInterface({
    input: createReadStream(indexPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  try {
    let ordinal = 0;
    for await (const line of lines) {
      const record = sessionTitleRecord(line);
      if (record) {
        const key = pseudonymousIdentityKey(salt, record.id);
        const candidate = { ...record, ordinal };
        const current = titleRecords.get(key);
        const candidateHasTime = candidate.updatedAt !== undefined;
        const currentHasTime = current?.updatedAt !== undefined;
        if (
          !current ||
          (candidateHasTime && !currentHasTime) ||
          (candidateHasTime && currentHasTime &&
            candidate.updatedAt! > current.updatedAt!) ||
          (candidateHasTime === currentHasTime &&
            candidate.updatedAt === current.updatedAt &&
            candidate.ordinal > current.ordinal)
        ) {
          titleRecords.set(key, candidate);
        }
      }
      ordinal += 1;
    }
    return new Map(
      [...titleRecords.entries()].map(([key, record]) => [key, record.title]),
    );
  } catch {
    return undefined;
  } finally {
    lines.close();
  }
}

const SESSION_TITLE_CACHE_IO: SessionTitleCacheIo = {
  stat: sessionIndexFileStamp,
  read: readCodexSessionTitles,
};

function sessionTitleSaltFingerprint(salt: string): string {
  return createHash('sha256')
    .update('codex-session-title-cache\0')
    .update(salt)
    .digest('hex');
}

function sameSessionTitleCacheInput(
  left: SessionTitleCacheEntry | SessionTitleCachePending,
  indexPath: string,
  saltFingerprint: string,
  stamp: SessionIndexFileStamp,
): boolean {
  return left.indexPath === indexPath &&
    left.saltFingerprint === saltFingerprint &&
    sameSessionIndexFile(left, stamp);
}

/** Runtime-only cache for the allowlisted Codex title index. The cache key is
 * accepted only after a regular-file lstat before and after the streaming read;
 * titles and the derived salt fingerprint are never persisted. */
export class CodexSessionTitleCache {
  private cached: SessionTitleCacheEntry | undefined;
  private pending: SessionTitleCachePending | undefined;

  constructor(private readonly io: SessionTitleCacheIo = SESSION_TITLE_CACHE_IO) {}

  async load(codexHome: string, salt: string): Promise<Map<string, string>> {
    const indexPath = path.join(codexHome, 'session_index.jsonl');
    const saltFingerprint = sessionTitleSaltFingerprint(salt);
    const before = await this.io.stat(indexPath);
    if (!before) {
      this.clear();
      return new Map();
    }
    if (
      this.cached &&
      sameSessionTitleCacheInput(this.cached, indexPath, saltFingerprint, before)
    ) {
      return this.cached.titles;
    }
    if (
      this.pending &&
      sameSessionTitleCacheInput(this.pending, indexPath, saltFingerprint, before)
    ) {
      return this.pending.promise;
    }

    let promise!: Promise<Map<string, string>>;
    promise = (async () => {
      const titles = await this.io.read(indexPath, salt);
      if (!titles) {
        this.cached = undefined;
        return new Map();
      }
      const after = await this.io.stat(indexPath);
      if (after && sameSessionIndexFile(before, after)) {
        this.cached = {
          indexPath,
          saltFingerprint,
          ...after,
          titles,
        };
        return titles;
      }
      // A writer or path replacement raced this stream. Fail closed for this
      // snapshot and require the next refresh to read one stable regular file.
      this.cached = undefined;
      return new Map();
    })();
    this.pending = {
      indexPath,
      saltFingerprint,
      ...before,
      promise,
    };
    try {
      return await promise;
    } finally {
      if (this.pending?.promise === promise) {
        this.pending = undefined;
      }
    }
  }

  clear(): void {
    this.cached = undefined;
    this.pending = undefined;
  }
}

export async function loadCodexSessionTitles(
  codexHome: string,
  salt: string,
): Promise<Map<string, string>> {
  return new CodexSessionTitleCache().load(codexHome, salt);
}
