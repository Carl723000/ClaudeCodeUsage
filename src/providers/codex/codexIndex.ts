import { createHmac } from 'node:crypto';
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
  CodexSourceArea,
  diffCodexManifest,
} from './codexManifest';
import {
  CodexJsonlReader,
  defaultCodexJsonlReader,
  scanCodexJsonlLines,
} from './codexJsonlScanner';

export interface CodexStructuralSummary {
  patchCalls: number;
  toolCalls: number;
  postPatchToolCalls: number;
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
  period?: undefined;
}

export interface CodexFileContribution {
  fileKey: string;
  sourceArea?: CodexSourceArea;
  size: number;
  mtimeMs: number;
  dev?: number;
  ino?: number;
  offset: number;
  discardingOversizedLine: boolean;
  parserState: CodexParserState;
  aggregate: CodexFileAggregate;
  limit?: ProviderLimitSnapshot;
  limits?: Record<string, ProviderLimitSnapshot>;
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

export interface CodexIndexV2 {
  schemaVersion: 2;
  files: Record<string, CodexFileContribution>;
  aggregate: CodexProviderAggregate;
  coverage: CodexIndexCoverage;
}

/** @deprecated Compatibility name until the remaining v2 consumers are rewired. */
export type CodexIndexV1 = CodexIndexV2;

export interface CodexIndexIo extends CodexJsonlReader {}

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
  index: CodexIndexV2;
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
    patchCalls: 0,
    toolCalls: 0,
    postPatchToolCalls: 0,
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

export function createEmptyCodexIndex(_timeZone = 'UTC'): CodexIndexV2 {
  return {
    schemaVersion: 2,
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

function cloneIndex(index: CodexIndexV2): CodexIndexV2 {
  return JSON.parse(JSON.stringify(index)) as CodexIndexV2;
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
    structural.patchCalls += event.count ?? 1;
  } else if (event.kind === 'tool') {
    structural.toolCalls += event.count ?? 1;
    if (structural.patchCalls > 0) {
      structural.postPatchToolCalls += event.count ?? 1;
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
  return defaultCodexJsonlReader;
}

function previousManifest(index: CodexIndexV2): CodexPersistedManifest {
  return Object.fromEntries(
    Object.values(index.files).map((file) => [
      file.fileKey,
      {
        fileKey: file.fileKey,
        sourceArea: file.sourceArea ?? 'sessions',
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
    sourceArea: entry.sourceArea,
    size: 0,
    mtimeMs: 0,
    dev: entry.dev,
    ino: entry.ino,
    offset: 0,
    discardingOversizedLine: false,
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
  let parserState = contribution.parserState;
  const aggregate = contribution.aggregate;
  const pseudonymize = pseudonymizer(options.salt);
  let limit = contribution.limit;
  const limits = { ...(contribution.limits ?? {}) };

  const scan = await scanCodexJsonlLines(
    entry,
    io,
    {
      offset: contribution.offset,
      discardingOversizedLine: contribution.discardingOversizedLine,
    },
    entry.size,
    (line) => {
      assertNotCancelled(options);
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
        if (parsed.limit) {
          const limitKey =
            parsed.limit.limitId ?? parsed.limit.limitName ?? 'default';
          const previousLimit = limits[limitKey];
          if (
            !previousLimit ||
            parsed.limit.observedAt >= previousLimit.observedAt
          ) {
            limits[limitKey] = parsed.limit;
          }
        }
      }
    },
  );

  if (!scan.reachedEnd || contribution.offset + scan.bytesRead !== entry.size) {
    throw new Error('Codex log changed during indexing');
  }

  syncSession(aggregate, parserState);
  return {
    ...contribution,
    fileKey: entry.fileKey,
    sourceArea: entry.sourceArea,
    size: entry.size,
    mtimeMs: entry.mtimeMs,
    dev: entry.dev,
    ino: entry.ino,
    offset: scan.cursor.offset,
    discardingOversizedLine: scan.cursor.discardingOversizedLine,
    parserState,
    aggregate,
    limit,
    limits,
    qualityFlags: uniqueFlags(
      contribution.qualityFlags,
      parserState.qualityFlags,
      scan.oversizedLines > 0 ? ['oversized-jsonl-line'] : [],
    ),
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
  const end = Math.min(entry.size, MAX_IDENTITY_BYTES);
  const pseudonymize = pseudonymizer(options.salt);
  let parserState = contribution.parserState;
  let result: CodexFileContribution | undefined;
  await scanCodexJsonlLines(
    entry,
    io,
    { offset: 0, discardingOversizedLine: false },
    end,
    (line) => {
      assertNotCancelled(options);
      const entryObject = parseJsonObject(line);
      if (
        result === undefined &&
        entryObject &&
        stringField(entryObject, 'type') === 'session_meta'
      ) {
        parserState = parseCodexLine(
          line,
          parserState,
          pseudonymize,
        ).state;
        const aggregate = cloneContribution(contribution).aggregate;
        syncSession(aggregate, parserState);
        result = {
          ...contribution,
          parserState,
          aggregate,
          identityChecked: true,
        };
      }
    },
  );
  return result ?? { ...contribution, identityChecked: true };
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
      : Math.max(0, Math.min(contribution.offset, entry.size));
    indexedBytes += parsedBytes;
    if (
      !flags.has('stale-file') &&
      contribution.offset >= entry.size &&
      !contribution.discardingOversizedLine
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

function progressFor(index: CodexIndexV2, scannedFiles: number): CodexIndexProgress {
  return {
    scannedFiles,
    totalFiles: index.coverage.totalFiles,
    indexedBytes: index.coverage.indexedBytes,
    totalBytes: index.coverage.totalBytes,
  };
}

export async function updateCodexIndex(
  previous: CodexIndexV2,
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
    contribution.sourceArea = entry.sourceArea;
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

interface LegacyCodexIndexV1 {
  readonly schemaVersion: 1;
  readonly files: Readonly<Record<string, LegacyCodexFileContribution>>;
  readonly aggregate?: unknown;
  readonly coverage?: unknown;
}

interface LegacyCodexFileContribution {
  readonly fileKey?: unknown;
  readonly sourceArea?: unknown;
  readonly size?: unknown;
  readonly mtimeMs?: unknown;
  readonly dev?: unknown;
  readonly ino?: unknown;
  readonly offset?: unknown;
  readonly carry?: unknown;
  readonly parserState?: unknown;
  readonly aggregate?: unknown;
  readonly limit?: unknown;
  readonly limits?: unknown;
  readonly qualityFlags?: unknown;
  readonly identityChecked?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIndexV1(value: unknown): value is LegacyCodexIndexV1 {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    isRecord(value.files)
  );
}

function isIndexV2(value: unknown): value is CodexIndexV2 {
  return (
    isRecord(value) &&
    value.schemaVersion === 2 &&
    isRecord(value.files) &&
    isRecord(value.aggregate) &&
    isRecord(value.coverage)
  );
}

interface LegacyCodexStructuralSummary {
  filesChanged?: number;
  patchRounds?: number;
  commands?: number;
  postChangeCommands?: number;
  compactCount?: number;
  taskCompleteCount?: number;
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function sanitizeTokens(value: unknown): ProviderTokenCounts {
  const record = isRecord(value) ? value : {};
  return {
    inputTotal: finiteNumber(record.inputTotal),
    ...(optionalNumber(record.cachedInput) !== undefined
      ? { cachedInput: optionalNumber(record.cachedInput) }
      : {}),
    ...(optionalNumber(record.cacheWriteInput) !== undefined
      ? { cacheWriteInput: optionalNumber(record.cacheWriteInput) }
      : {}),
    outputTotal: finiteNumber(record.outputTotal),
    ...(optionalNumber(record.reasoningOutput) !== undefined
      ? { reasoningOutput: optionalNumber(record.reasoningOutput) }
      : {}),
    ...(optionalNumber(record.sourceTotal) !== undefined
      ? { sourceTotal: optionalNumber(record.sourceTotal) }
      : {}),
  };
}

function sanitizeBuckets(value: unknown): Record<string, ProviderTokenCounts> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, tokens]) => [key, sanitizeTokens(tokens)]),
  );
}

function sanitizeProviderAggregate(value: unknown): CodexProviderAggregate {
  const record = isRecord(value) ? value : {};
  return {
    total: sanitizeTokens(record.total),
    byDay: sanitizeBuckets(record.byDay),
    byModel: sanitizeBuckets(record.byModel),
    byEffort: sanitizeBuckets(record.byEffort),
  };
}

function sanitizeRole(value: unknown): ProviderThreadRole {
  return value === 'root' ||
    value === 'subagent' ||
    value === 'approval-reviewer' ||
    value === 'unknown'
    ? value
    : 'unknown';
}

function sanitizeQualityFlags(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter(
        (flag): flag is string =>
          typeof flag === 'string' && /^[a-z0-9-]{1,80}$/.test(flag),
      ))].sort()
    : [];
}

function sanitizeParserState(value: unknown, fileKey: string): CodexParserState {
  const record = isRecord(value) ? value : {};
  const highWater = isRecord(record.highWater)
    ? {
        inputTokens: finiteNumber(record.highWater.inputTokens),
        cachedInputTokens: finiteNumber(record.highWater.cachedInputTokens),
        outputTokens: finiteNumber(record.highWater.outputTokens),
        reasoningOutputTokens: finiteNumber(record.highWater.reasoningOutputTokens),
        totalTokens: finiteNumber(record.highWater.totalTokens),
      }
    : undefined;
  return {
    schemaVersion: 1,
    fileKey,
    sessionKey: optionalString(record.sessionKey) ?? fileKey,
    ...(optionalString(record.parentSessionKey)
      ? { parentSessionKey: optionalString(record.parentSessionKey) }
      : {}),
    ...(optionalString(record.projectKey)
      ? { projectKey: optionalString(record.projectKey) }
      : {}),
    ...(optionalString(record.projectName)
      ? { projectName: optionalString(record.projectName) }
      : {}),
    ...(optionalString(record.projectDirectoryName)
      ? { projectDirectoryName: optionalString(record.projectDirectoryName) }
      : {}),
    ...(optionalString(record.agentNickname)
      ? { agentNickname: optionalString(record.agentNickname) }
      : {}),
    ...(optionalString(record.model) ? { model: optionalString(record.model) } : {}),
    ...(optionalString(record.effort) ? { effort: optionalString(record.effort) } : {}),
    role: sanitizeRole(record.role),
    ...(highWater ? { highWater } : {}),
    qualityFlags: sanitizeQualityFlags(record.qualityFlags),
  };
}

function legacyCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function sanitizeStructural(value: unknown): CodexStructuralSummary {
  const structural = isRecord(value) ? value : {};
  if ('patchCalls' in structural) {
    return {
      patchCalls: legacyCount(structural.patchCalls),
      toolCalls: legacyCount(structural.toolCalls),
      postPatchToolCalls: legacyCount(structural.postPatchToolCalls),
      compactCount: legacyCount(structural.compactCount),
      taskCompleteCount: legacyCount(structural.taskCompleteCount),
    };
  }
  const legacy = structural as LegacyCodexStructuralSummary;
  return {
    patchCalls: legacyCount(legacy.patchRounds),
    toolCalls: legacyCount(legacy.commands),
    postPatchToolCalls: legacyCount(legacy.postChangeCommands),
    compactCount: legacyCount(legacy.compactCount),
    taskCompleteCount: legacyCount(legacy.taskCompleteCount),
  };
}

function sanitizeLimit(value: unknown): ProviderLimitSnapshot | undefined {
  if (!isRecord(value) || !Array.isArray(value.windows)) {
    return undefined;
  }
  const windows = value.windows.flatMap((window) => {
    if (!isRecord(window) || optionalNumber(window.usedPercent) === undefined) {
      return [];
    }
    return [{
      ...(optionalString(window.label) ? { label: optionalString(window.label) } : {}),
      usedPercent: finiteNumber(window.usedPercent),
      ...(optionalNumber(window.windowMinutes) !== undefined
        ? { windowMinutes: optionalNumber(window.windowMinutes) }
        : {}),
      ...(optionalNumber(window.resetsAt) !== undefined
        ? { resetsAt: optionalNumber(window.resetsAt) }
        : {}),
    }];
  });
  const credits = isRecord(value.credits) ? value.credits : undefined;
  return {
    provider: value.provider === 'claude' ? 'claude' : 'codex',
    ...(optionalString(value.limitId) ? { limitId: optionalString(value.limitId) } : {}),
    ...(optionalString(value.limitName)
      ? { limitName: optionalString(value.limitName) }
      : {}),
    observedAt: finiteNumber(value.observedAt),
    source: value.source === 'oauth' ? 'oauth' : 'local-log',
    windows,
    confidence: value.confidence === 'exact' || value.confidence === 'unknown'
      ? value.confidence
      : 'last-observed',
    ...(credits
      ? {
          credits: {
            ...(typeof credits.hasCredits === 'boolean'
              ? { hasCredits: credits.hasCredits }
              : {}),
            ...(typeof credits.unlimited === 'boolean'
              ? { unlimited: credits.unlimited }
              : {}),
            ...(optionalString(credits.balance)
              ? { balance: optionalString(credits.balance) }
              : {}),
          },
        }
      : {}),
  };
}

function sanitizeLimits(value: unknown): Record<string, ProviderLimitSnapshot> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const limits = Object.entries(value).flatMap(([key, raw]) => {
    const limit = sanitizeLimit(raw);
    return limit ? [[key, limit] as const] : [];
  });
  return limits.length > 0 ? Object.fromEntries(limits) : undefined;
}

function sanitizeSession(
  value: unknown,
  parserState: CodexParserState,
): CodexFileAggregate['session'] {
  const session = isRecord(value) ? value : {};
  return {
    sessionKey: optionalString(session.sessionKey) ?? parserState.sessionKey,
    ...(optionalString(session.parentSessionKey)
      ? { parentSessionKey: optionalString(session.parentSessionKey) }
      : {}),
    ...(optionalString(session.projectKey)
      ? { projectKey: optionalString(session.projectKey) }
      : {}),
    ...(optionalString(session.projectName)
      ? { projectName: optionalString(session.projectName) }
      : {}),
    ...(optionalString(session.projectDirectoryName)
      ? { projectDirectoryName: optionalString(session.projectDirectoryName) }
      : {}),
    ...(optionalString(session.agentNickname)
      ? { agentNickname: optionalString(session.agentNickname) }
      : {}),
    role: sanitizeRole(session.role),
    ...(optionalNumber(session.startedAt) !== undefined
      ? { startedAt: optionalNumber(session.startedAt) }
      : {}),
    ...(optionalNumber(session.endedAt) !== undefined
      ? { endedAt: optionalNumber(session.endedAt) }
      : {}),
  };
}

function sanitizeFileAggregate(
  value: unknown,
  parserState: CodexParserState,
): CodexFileAggregate {
  const aggregate = isRecord(value) ? value : {};
  return {
    total: sanitizeTokens(aggregate.total),
    byDay: sanitizeBuckets(aggregate.byDay),
    byModel: sanitizeBuckets(aggregate.byModel),
    byEffort: sanitizeBuckets(aggregate.byEffort),
    session: sanitizeSession(aggregate.session, parserState),
    structural: sanitizeStructural(aggregate.structural),
  };
}

function sanitizeCoverage(value: unknown): CodexIndexCoverage {
  const coverage = isRecord(value) ? value : {};
  return {
    indexedFiles: finiteNumber(coverage.indexedFiles),
    totalFiles: finiteNumber(coverage.totalFiles),
    indexedBytes: finiteNumber(coverage.indexedBytes),
    totalBytes: finiteNumber(coverage.totalBytes),
    complete: coverage.complete === true,
  };
}

function migrateIndexV1(index: LegacyCodexIndexV1): CodexIndexV2 {
  const files: Record<string, CodexFileContribution> = {};
  for (const [key, old] of Object.entries(index.files)) {
    const fileKey = optionalString(old.fileKey) ?? key;
    const parserState = sanitizeParserState(old.parserState, fileKey);
    const offset = Math.max(0, finiteNumber(old.offset));
    const carryBytes = typeof old.carry === 'string'
      ? Buffer.byteLength(old.carry, 'utf8')
      : 0;
    const limit = sanitizeLimit(old.limit);
    const limits = sanitizeLimits(old.limits);
    files[key] = {
      fileKey,
      ...(old.sourceArea === 'sessions' || old.sourceArea === 'archive'
        ? { sourceArea: old.sourceArea }
        : {}),
      size: finiteNumber(old.size),
      mtimeMs: finiteNumber(old.mtimeMs),
      ...(optionalNumber(old.dev) !== undefined ? { dev: optionalNumber(old.dev) } : {}),
      ...(optionalNumber(old.ino) !== undefined ? { ino: optionalNumber(old.ino) } : {}),
      offset: Math.max(0, offset - carryBytes),
      discardingOversizedLine: false,
      parserState,
      aggregate: sanitizeFileAggregate(old.aggregate, parserState),
      ...(limit ? { limit } : {}),
      ...(limits ? { limits } : {}),
      qualityFlags: sanitizeQualityFlags(old.qualityFlags),
      ...(typeof old.identityChecked === 'boolean'
        ? { identityChecked: old.identityChecked }
        : {}),
    };
  }
  return {
    schemaVersion: 2,
    files,
    aggregate: sanitizeProviderAggregate(index.aggregate),
    coverage: sanitizeCoverage(index.coverage),
  };
}

export async function loadCodexIndex(
  indexPath: string,
  timeZone = 'UTC',
): Promise<CodexIndexV2> {
  try {
    const parsed: unknown = JSON.parse(await readFile(indexPath, 'utf8'));
    if (isIndexV1(parsed)) {
      return migrateIndexV1(parsed);
    }
    if (isIndexV2(parsed)) {
      return parsed;
    }
    throw new Error('Unsupported Codex index schema');
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return createEmptyCodexIndex(timeZone);
    }
    throw error;
  }
}

export async function saveCodexIndexAtomic(
  indexPath: string,
  index: CodexIndexV2,
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
