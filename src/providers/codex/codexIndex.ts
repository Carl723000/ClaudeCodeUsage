import { createHmac } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  mkdir,
  open,
  readFile,
  rename,
  unlink,
} from 'node:fs/promises';
import * as path from 'node:path';

import {
  NormalizedUsageEvent,
  ProviderLimitSnapshot,
  ProviderThreadRole,
  ProviderTokenCounts,
} from '../providerTypes';
import {
  CodexParserState,
  CodexStructuralEvent,
  createCodexParserState,
  parseCodexLine,
} from './codexParser';
import { parseJsonObject, stringField } from './codexSchema';
import {
  CodexManifest,
  CodexPersistedManifest,
  CodexRuntimeManifestEntry,
  diffCodexManifest,
} from './codexManifest';

export interface CodexStructuralSummary {
  filesChanged: number;
  patchRounds: number;
  commands: number;
  postChangeCommands: number;
  compactCount: number;
  taskCompleteCount: number;
}

export interface CodexFileAggregate {
  total: ProviderTokenCounts;
  byDay: Record<string, ProviderTokenCounts>;
  byModel: Record<string, ProviderTokenCounts>;
  byEffort: Record<string, ProviderTokenCounts>;
  session: {
    sessionKey: string;
    parentSessionKey?: string;
    projectKey?: string;
    projectName?: string;
    projectDirectoryName?: string;
    agentNickname?: string;
    sessionTitle?: string;
    role: ProviderThreadRole;
    startedAt?: number;
    endedAt?: number;
  };
  structural: CodexStructuralSummary;
}

export interface CodexFileContribution {
  fileKey: string;
  size: number;
  mtimeMs: number;
  dev?: number;
  ino?: number;
  offset: number;
  carry: string;
  parserState: CodexParserState;
  aggregate: CodexFileAggregate;
  limit?: ProviderLimitSnapshot;
  qualityFlags: string[];
  identityChecked?: boolean;
}

export interface CodexIndexCoverage {
  indexedFiles: number;
  totalFiles: number;
  indexedBytes: number;
  totalBytes: number;
  complete: boolean;
}

export interface CodexProviderAggregate {
  total: ProviderTokenCounts;
  byDay: Record<string, ProviderTokenCounts>;
  byModel: Record<string, ProviderTokenCounts>;
  byEffort: Record<string, ProviderTokenCounts>;
}

export interface CodexIndexV1 {
  schemaVersion: 1;
  files: Record<string, CodexFileContribution>;
  aggregate: CodexProviderAggregate;
  coverage: CodexIndexCoverage;
}

export interface CodexIndexIo {
  read(
    entry: CodexRuntimeManifestEntry,
    start: number,
    endExclusive: number,
  ): AsyncIterable<string>;
}

export interface CodexIndexProgress {
  scannedFiles: number;
  totalFiles: number;
  indexedBytes: number;
  totalBytes: number;
}

export interface CodexIndexUpdateOptions {
  salt: string;
  io?: CodexIndexIo;
  shouldCancel?: () => boolean;
  onProgress?: (progress: CodexIndexProgress) => void;
}

export interface CodexIndexUpdateResult {
  index: CodexIndexV1;
  bodyReads: number;
  failedFiles: number;
}

export class CodexIndexCancelledError extends Error {
  readonly code = 'cancelled';

  constructor() {
    super('Codex indexing was cancelled');
    this.name = 'CodexIndexCancelledError';
  }
}

const MAX_IDENTITY_BYTES = 256 * 1024;

function zeroTokens(): ProviderTokenCounts {
  return {
    inputTotal: 0,
    cachedInput: 0,
    cacheWriteInput: 0,
    outputTotal: 0,
    reasoningOutput: 0,
    sourceTotal: 0,
  };
}

function emptyAggregate(): CodexProviderAggregate {
  return { total: zeroTokens(), byDay: {}, byModel: {}, byEffort: {} };
}

function emptyStructural(): CodexStructuralSummary {
  return {
    filesChanged: 0,
    patchRounds: 0,
    commands: 0,
    postChangeCommands: 0,
    compactCount: 0,
    taskCompleteCount: 0,
  };
}

function emptyFileAggregate(
  fileKey: string,
  role: ProviderThreadRole,
): CodexFileAggregate {
  return {
    total: zeroTokens(),
    byDay: {},
    byModel: {},
    byEffort: {},
    session: { sessionKey: fileKey, role },
    structural: emptyStructural(),
  };
}

export function createEmptyCodexIndex(): CodexIndexV1 {
  return {
    schemaVersion: 1,
    files: {},
    aggregate: emptyAggregate(),
    coverage: {
      indexedFiles: 0,
      totalFiles: 0,
      indexedBytes: 0,
      totalBytes: 0,
      complete: true,
    },
  };
}

function cloneIndex(index: CodexIndexV1): CodexIndexV1 {
  return JSON.parse(JSON.stringify(index)) as CodexIndexV1;
}

function cloneContribution(
  contribution: CodexFileContribution,
): CodexFileContribution {
  return JSON.parse(JSON.stringify(contribution)) as CodexFileContribution;
}

function addTokens(
  target: ProviderTokenCounts,
  source: ProviderTokenCounts,
): void {
  target.inputTotal += Math.max(0, source.inputTotal);
  target.cachedInput =
    (target.cachedInput ?? 0) + Math.max(0, source.cachedInput ?? 0);
  target.cacheWriteInput =
    (target.cacheWriteInput ?? 0) + Math.max(0, source.cacheWriteInput ?? 0);
  target.outputTotal += Math.max(0, source.outputTotal);
  target.reasoningOutput =
    (target.reasoningOutput ?? 0) + Math.max(0, source.reasoningOutput ?? 0);
  target.sourceTotal =
    (target.sourceTotal ?? 0) + Math.max(0, source.sourceTotal ?? 0);
}

function bucket(
  buckets: Record<string, ProviderTokenCounts>,
  key: string,
): ProviderTokenCounts {
  return (buckets[key] ??= zeroTokens());
}

function dayKey(timestamp: number): string {
  return timestamp > 0
    ? new Date(timestamp).toISOString().slice(0, 10)
    : 'unknown';
}

function observeTimestamp(aggregate: CodexFileAggregate, timestamp: number): void {
  if (timestamp <= 0) {
    return;
  }
  aggregate.session.startedAt = Math.min(
    aggregate.session.startedAt ?? timestamp,
    timestamp,
  );
  aggregate.session.endedAt = Math.max(
    aggregate.session.endedAt ?? timestamp,
    timestamp,
  );
}

function reduceUsage(
  aggregate: CodexFileAggregate,
  event: NormalizedUsageEvent,
): void {
  addTokens(aggregate.total, event.tokens);
  addTokens(bucket(aggregate.byDay, dayKey(event.timestamp)), event.tokens);
  addTokens(bucket(aggregate.byModel, event.model ?? 'unknown'), event.tokens);
  addTokens(bucket(aggregate.byEffort, event.effort ?? 'unknown'), event.tokens);
  observeTimestamp(aggregate, event.timestamp);
}

function reduceStructural(
  aggregate: CodexFileAggregate,
  event: CodexStructuralEvent,
): void {
  const structural = aggregate.structural;
  if (event.kind === 'patch') {
    structural.patchRounds += event.count ?? 1;
    // Patch arguments are intentionally never read. This is a privacy-safe
    // lower bound, not a claimed exact count of paths in the patch body.
    structural.filesChanged += event.count ?? 1;
  } else if (event.kind === 'tool') {
    structural.commands += event.count ?? 1;
    if (structural.patchRounds > 0) {
      structural.postChangeCommands += event.count ?? 1;
    }
  } else if (event.kind === 'compaction') {
    structural.compactCount += event.count ?? 1;
  } else if (event.kind === 'task-complete') {
    structural.taskCompleteCount += event.count ?? 1;
  }
  observeTimestamp(aggregate, event.timestamp);
}

function syncSession(
  aggregate: CodexFileAggregate,
  state: CodexParserState,
): void {
  aggregate.session = {
    ...aggregate.session,
    sessionKey: state.sessionKey,
    parentSessionKey: state.parentSessionKey,
    projectKey: state.projectKey,
    projectName: state.projectName,
    projectDirectoryName: state.projectDirectoryName,
    agentNickname: state.agentNickname,
    role: state.role,
  };
}

function uniqueFlags(...groups: string[][]): string[] {
  return [...new Set(groups.flat())].sort();
}

function pseudonymizer(salt: string): (raw: string) => string {
  return (raw) =>
    createHmac('sha256', salt)
      .update('codex-identity\0')
      .update(raw)
      .digest('hex');
}

function defaultIo(): CodexIndexIo {
  return {
    async *read(entry, start, endExclusive) {
      if (endExclusive <= start) {
        return;
      }
      const stream = createReadStream(entry.absolutePath, {
        start,
        end: endExclusive - 1,
        encoding: 'utf8',
      });
      for await (const chunk of stream) {
        yield chunk as string;
      }
    },
  };
}

function previousManifest(index: CodexIndexV1): CodexPersistedManifest {
  return Object.fromEntries(
    Object.values(index.files).map((file) => [
      file.fileKey,
      {
        fileKey: file.fileKey,
        sourceArea: 'sessions' as const,
        size: file.size,
        mtimeMs: file.mtimeMs,
        dev: file.dev,
        ino: file.ino,
      },
    ]),
  );
}

function contributionFor(
  entry: CodexRuntimeManifestEntry,
  flags: string[] = [],
): CodexFileContribution {
  const parserState = createCodexParserState(entry.fileKey);
  return {
    fileKey: entry.fileKey,
    size: 0,
    mtimeMs: 0,
    dev: entry.dev,
    ino: entry.ino,
    offset: 0,
    carry: '',
    parserState,
    aggregate: emptyFileAggregate(entry.fileKey, parserState.role),
    qualityFlags: [...flags],
  };
}

function assertNotCancelled(options: CodexIndexUpdateOptions): void {
  if (options.shouldCancel?.()) {
    throw new CodexIndexCancelledError();
  }
}

async function updateContribution(
  contribution: CodexFileContribution,
  entry: CodexRuntimeManifestEntry,
  options: CodexIndexUpdateOptions,
  io: CodexIndexIo,
): Promise<CodexFileContribution> {
  let pending = contribution.carry;
  let bytesRead = 0;
  let parserState = contribution.parserState;
  const aggregate = contribution.aggregate;
  const pseudonymize = pseudonymizer(options.salt);
  let limit = contribution.limit;

  for await (const chunk of io.read(entry, contribution.offset, entry.size)) {
    assertNotCancelled(options);
    bytesRead += Buffer.byteLength(chunk, 'utf8');
    pending += chunk;
    let newline = pending.indexOf('\n');
    while (newline >= 0) {
      const line = pending.slice(0, newline).replace(/\r$/, '');
      pending = pending.slice(newline + 1);
      if (line.trim() !== '') {
        const parsed = parseCodexLine(line, parserState, pseudonymize);
        parserState = parsed.state;
        for (const event of parsed.events) {
          reduceUsage(aggregate, event);
        }
        if (parsed.structural) {
          reduceStructural(aggregate, parsed.structural);
        }
        if (!limit || (parsed.limit?.observedAt ?? 0) >= limit.observedAt) {
          limit = parsed.limit ?? limit;
        }
      }
      newline = pending.indexOf('\n');
    }
  }

  if (contribution.offset + bytesRead !== entry.size) {
    throw new Error('Codex log changed during indexing');
  }

  syncSession(aggregate, parserState);
  return {
    ...contribution,
    fileKey: entry.fileKey,
    size: entry.size,
    mtimeMs: entry.mtimeMs,
    dev: entry.dev,
    ino: entry.ino,
    offset: contribution.offset + bytesRead,
    carry: pending,
    parserState,
    aggregate,
    limit,
    qualityFlags: uniqueFlags(contribution.qualityFlags, parserState.qualityFlags),
    identityChecked: true,
  };
}

async function backfillIdentity(
  contribution: CodexFileContribution,
  entry: CodexRuntimeManifestEntry,
  options: CodexIndexUpdateOptions,
  io: CodexIndexIo,
): Promise<CodexFileContribution> {
  if (contribution.identityChecked === true) {
    return contribution;
  }
  let pending = '';
  const end = Math.min(entry.size, MAX_IDENTITY_BYTES);
  const pseudonymize = pseudonymizer(options.salt);
  let parserState = contribution.parserState;
  for await (const chunk of io.read(entry, 0, end)) {
    assertNotCancelled(options);
    pending += chunk;
    let newline = pending.indexOf('\n');
    while (newline >= 0) {
      const line = pending.slice(0, newline).replace(/\r$/, '');
      pending = pending.slice(newline + 1);
      const entryObject = parseJsonObject(line);
      if (entryObject && stringField(entryObject, 'type') === 'session_meta') {
        parserState = parseCodexLine(
          line,
          parserState,
          pseudonymize,
        ).state;
        const aggregate = cloneContribution(contribution).aggregate;
        syncSession(aggregate, parserState);
        return {
          ...contribution,
          parserState,
          aggregate,
          identityChecked: true,
        };
      }
      newline = pending.indexOf('\n');
    }
  }
  return { ...contribution, identityChecked: true };
}

function recomputeAggregate(
  files: Record<string, CodexFileContribution>,
): CodexProviderAggregate {
  const aggregate = emptyAggregate();
  for (const file of Object.values(files)) {
    addTokens(aggregate.total, file.aggregate.total);
    for (const [key, value] of Object.entries(file.aggregate.byDay)) {
      addTokens(bucket(aggregate.byDay, key), value);
    }
    for (const [key, value] of Object.entries(file.aggregate.byModel)) {
      addTokens(bucket(aggregate.byModel, key), value);
    }
    for (const [key, value] of Object.entries(file.aggregate.byEffort)) {
      addTokens(bucket(aggregate.byEffort, key), value);
    }
  }
  return aggregate;
}

function coverageFor(
  files: Record<string, CodexFileContribution>,
  manifest: CodexManifest,
): CodexIndexCoverage {
  let indexedFiles = 0;
  let indexedBytes = 0;
  const totalBytes = manifest.files.reduce((sum, file) => sum + file.size, 0);
  for (const entry of manifest.files) {
    const contribution = files[entry.fileKey];
    if (!contribution) {
      continue;
    }
    const flags = new Set(contribution.qualityFlags);
    const resetIsStale = flags.has('stale-reset-required');
    const parsedBytes = resetIsStale
      ? 0
      : Math.max(
          0,
          Math.min(contribution.offset, entry.size) -
            Buffer.byteLength(contribution.carry, 'utf8'),
        );
    indexedBytes += parsedBytes;
    if (
      !flags.has('stale-file') &&
      contribution.offset >= entry.size &&
      contribution.carry === ''
    ) {
      indexedFiles += 1;
    }
  }
  const totalFiles = manifest.files.length;
  return {
    indexedFiles,
    totalFiles,
    indexedBytes,
    totalBytes,
    complete: indexedFiles === totalFiles,
  };
}

function progressFor(index: CodexIndexV1, scannedFiles: number): CodexIndexProgress {
  return {
    scannedFiles,
    totalFiles: index.coverage.totalFiles,
    indexedBytes: index.coverage.indexedBytes,
    totalBytes: index.coverage.totalBytes,
  };
}

export async function updateCodexIndex(
  previous: CodexIndexV1,
  manifest: CodexManifest,
  options: CodexIndexUpdateOptions,
): Promise<CodexIndexUpdateResult> {
  assertNotCancelled(options);
  const index = cloneIndex(previous);
  const io = options.io ?? defaultIo();
  const diff = diffCodexManifest(previousManifest(index), manifest.persistable);
  const entries = new Map(manifest.files.map((entry) => [entry.fileKey, entry]));
  let bodyReads = 0;
  let failedFiles = 0;

  for (const move of diff.moved) {
    const contribution = index.files[move.fromKey];
    const entry = entries.get(move.toKey);
    if (!contribution || !entry) {
      continue;
    }
    delete index.files[move.fromKey];
    contribution.fileKey = move.toKey;
    contribution.size = entry.size;
    contribution.mtimeMs = entry.mtimeMs;
    contribution.dev = entry.dev;
    contribution.ino = entry.ino;
    contribution.parserState.fileKey = move.toKey;
    index.files[move.toKey] = contribution;
  }
  for (const key of diff.removed) {
    delete index.files[key];
  }

  const resetFlags = new Map<string, string>();
  for (const key of diff.truncated) {
    resetFlags.set(key, 'truncated-jsonl');
  }
  for (const key of diff.replaced) {
    resetFlags.set(key, 'replaced-jsonl');
  }
  const work = [...diff.added, ...diff.appended, ...diff.truncated, ...diff.replaced]
    .map((key) => entries.get(key))
    .filter((entry): entry is CodexRuntimeManifestEntry => entry !== undefined)
    .sort((left, right) => left.mtimeMs - right.mtimeMs);

  let scannedFiles = manifest.files.length - work.length;
  for (const entry of work) {
    assertNotCancelled(options);
    const resetFlag = resetFlags.get(entry.fileKey);
    const prior = index.files[entry.fileKey];
    const base = resetFlag || !prior
      ? contributionFor(entry, resetFlag ? [resetFlag] : [])
      : {
          ...cloneContribution(prior),
          qualityFlags: prior.qualityFlags.filter(
            (flag) => flag !== 'stale-file' && flag !== 'stale-reset-required',
          ),
        };
    bodyReads += 1;
    try {
      const contribution = await updateContribution(
        base,
        entry,
        options,
        io,
      );
      index.files[entry.fileKey] = contribution;
    } catch (error) {
      if (error instanceof CodexIndexCancelledError) {
        throw error;
      }
      failedFiles += 1;
      if (prior) {
        index.files[entry.fileKey] = {
          ...prior,
          qualityFlags: uniqueFlags(
            prior.qualityFlags,
            ['stale-file'],
            resetFlag ? ['stale-reset-required'] : [],
          ),
        };
      }
    }
    scannedFiles += 1;
    index.aggregate = recomputeAggregate(index.files);
    index.coverage = coverageFor(index.files, manifest);
    options.onProgress?.(progressFor(index, scannedFiles));
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  for (const entry of manifest.files) {
    const contribution = index.files[entry.fileKey];
    if (!contribution || contribution.identityChecked === true) {
      continue;
    }
    bodyReads += 1;
    try {
      index.files[entry.fileKey] = await backfillIdentity(
        contribution,
        entry,
        options,
        io,
      );
    } catch (error) {
      if (error instanceof CodexIndexCancelledError) {
        throw error;
      }
      failedFiles += 1;
    }
  }

  index.aggregate = recomputeAggregate(index.files);
  index.coverage = coverageFor(index.files, manifest);
  if (work.length === 0) {
    options.onProgress?.(progressFor(index, manifest.files.length));
  }
  return { index, bodyReads, failedFiles };
}

function isIndexV1(value: unknown): value is CodexIndexV1 {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { schemaVersion?: unknown }).schemaVersion === 1 &&
    typeof (value as { files?: unknown }).files === 'object' &&
    (value as { files?: unknown }).files !== null
  );
}

export async function loadCodexIndex(indexPath: string): Promise<CodexIndexV1> {
  try {
    const parsed: unknown = JSON.parse(await readFile(indexPath, 'utf8'));
    if (!isIndexV1(parsed)) {
      throw new Error('Unsupported Codex index schema');
    }
    return parsed;
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return createEmptyCodexIndex();
    }
    throw error;
  }
}

export async function saveCodexIndexAtomic(
  indexPath: string,
  index: CodexIndexV1,
): Promise<void> {
  await mkdir(path.dirname(indexPath), { recursive: true });
  const temporaryPath = `${indexPath}.tmp`;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporaryPath, 'w', 0o600);
    await handle.writeFile(JSON.stringify(index), 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, indexPath);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}
