import { createHmac } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import * as path from 'node:path';
import { createInterface } from 'node:readline';

const MAX_TITLE_LENGTH = 200;
const MAX_PROJECT_LABEL_LENGTH = 120;

export interface CodexProjectIdentity {
  keySource?: string;
  name?: string;
  directoryName?: string;
}

export function pseudonymousIdentityKey(
  salt: string,
  raw: string,
): string {
  return createHmac('sha256', salt)
    .update('codex-identity\0')
    .update(raw)
    .digest('hex');
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
      /(^|[^:/])\/(?:[^\s/"'`<>]+\/)+[^\s"'`<>]+/g,
      '$1[path]',
    )
    .replace(/(^|[\s("'`])\/[^\s"'`<>]+/g, '$1[path]')
    .replace(/(^|[\s("'`])\\\\[^\s"'`<>]+/g, '$1[path]');
}

function basename(value: string): string | undefined {
  const normalized = value.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized) {
    return undefined;
  }
  return cleanLabel(normalized.split('/').pop() ?? '', MAX_PROJECT_LABEL_LENGTH);
}

function repositoryName(value: string): string | undefined {
  const normalized = value.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized) {
    return undefined;
  }
  const candidate = normalized.split(/[/:]/).pop()?.replace(/\.git$/i, '') ?? '';
  let decoded = candidate;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    // A malformed escape is still safe as a plain label after sanitization.
  }
  return cleanLabel(decoded, MAX_PROJECT_LABEL_LENGTH);
}

export function safeProjectIdentity(
  cwd?: string,
  repositoryUrl?: string,
): CodexProjectIdentity {
  const directoryName = cwd ? basename(cwd) : undefined;
  const repository = repositoryUrl
    ? repositoryName(repositoryUrl)
    : undefined;
  const keySource = repository && repositoryUrl
    ? repositoryUrl.trim()
    : cwd?.trim() || undefined;
  const name = repository ?? directoryName;
  return {
    ...(keySource ? { keySource } : {}),
    ...(name ? { name } : {}),
    ...(directoryName ? { directoryName } : {}),
  };
}

function sessionTitleRecord(
  line: string,
): { id: string; title: string } | undefined {
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
    return id && title ? { id, title } : undefined;
  } catch {
    return undefined;
  }
}

export async function loadCodexSessionTitles(
  codexHome: string,
  salt: string,
): Promise<Map<string, string>> {
  const indexPath = path.join(codexHome, 'session_index.jsonl');
  try {
    const info = await lstat(indexPath);
    if (!info.isFile() || info.isSymbolicLink()) {
      return new Map();
    }
  } catch {
    return new Map();
  }

  const titles = new Map<string, string>();
  const lines = createInterface({
    input: createReadStream(indexPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  try {
    for await (const line of lines) {
      const record = sessionTitleRecord(line);
      if (record) {
        titles.set(
          pseudonymousIdentityKey(salt, record.id),
          record.title,
        );
      }
    }
    return titles;
  } catch {
    return new Map();
  } finally {
    lines.close();
  }
}
