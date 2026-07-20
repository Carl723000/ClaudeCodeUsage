import { dayKeyInZone } from '../../dateKeys';
import {
  NormalizedUsageEvent,
  ProviderTokenCounts,
} from '../providerTypes';
import { CodexStructuralEvent } from './codexParser';

export interface CodexStructuralSummary {
  patchCalls: number;
  toolCalls: number;
  postPatchToolCalls: number;
  compactCount: number;
  taskCompleteCount: number;
}

export interface CodexDailySlice {
  total: ProviderTokenCounts;
  byModel: Record<string, ProviderTokenCounts>;
  byEffort: Record<string, ProviderTokenCounts>;
  structural: CodexStructuralSummary;
  firstObservedAt?: number;
  lastObservedAt?: number;
}

export interface CodexFilePeriodIndex {
  timeZone: string;
  indexedThrough: number;
  days: Record<string, CodexDailySlice>;
}

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

function emptyStructural(): CodexStructuralSummary {
  return {
    patchCalls: 0,
    toolCalls: 0,
    postPatchToolCalls: 0,
    compactCount: 0,
    taskCompleteCount: 0,
  };
}

function emptySlice(): CodexDailySlice {
  return {
    total: zeroTokens(),
    byModel: {},
    byEffort: {},
    structural: emptyStructural(),
  };
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

function tokenBucket(
  buckets: Record<string, ProviderTokenCounts>,
  key: string,
): ProviderTokenCounts {
  return (buckets[key] ??= zeroTokens());
}

function sliceFor(
  days: Record<string, CodexDailySlice>,
  timestamp: number,
  timeZone: string,
): CodexDailySlice | undefined {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return undefined;
  }
  const key = dayKeyInZone(new Date(timestamp), timeZone);
  return key ? (days[key] ??= emptySlice()) : undefined;
}

function observe(slice: CodexDailySlice, timestamp: number): void {
  slice.firstObservedAt = Math.min(slice.firstObservedAt ?? timestamp, timestamp);
  slice.lastObservedAt = Math.max(slice.lastObservedAt ?? timestamp, timestamp);
}

export function reduceCodexUsageSlice(
  days: Record<string, CodexDailySlice>,
  event: NormalizedUsageEvent,
  timeZone: string,
): void {
  const slice = sliceFor(days, event.timestamp, timeZone);
  if (!slice) {
    return;
  }
  addTokens(slice.total, event.tokens);
  addTokens(tokenBucket(slice.byModel, event.model ?? 'unknown'), event.tokens);
  addTokens(tokenBucket(slice.byEffort, event.effort ?? 'unknown'), event.tokens);
  observe(slice, event.timestamp);
}

export function reduceCodexStructuralSlice(
  days: Record<string, CodexDailySlice>,
  event: CodexStructuralEvent,
  timeZone: string,
): void {
  const slice = sliceFor(days, event.timestamp, timeZone);
  if (!slice) {
    return;
  }
  const count = Math.max(0, event.count ?? 1);
  if (event.kind === 'patch') {
    slice.structural.patchCalls += count;
  } else if (event.kind === 'tool') {
    slice.structural.toolCalls += count;
    if (Object.values(days).some((day) => day.structural.patchCalls > 0)) {
      slice.structural.postPatchToolCalls += count;
    }
  } else if (event.kind === 'compaction') {
    slice.structural.compactCount += count;
  } else if (event.kind === 'task-complete') {
    slice.structural.taskCompleteCount += count;
  }
  observe(slice, event.timestamp);
}
