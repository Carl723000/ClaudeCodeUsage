import { createHash } from 'node:crypto';

import {
  AdviceComparisonStats,
  compareAdviceEffectiveness,
} from './comparison';
import { isAdviceIdentifier } from './contract';
import {
  StoredAdviceScope,
  StoredComparablePair,
  StoredComplexityBand,
  StoredEffort,
  StoredMetricDirection,
  StoredMetricUnit,
  StoredModelFamily,
  StoredProvider,
  StoredTaskKind,
  parseStoredComparablePair,
  toComparableTaskPairs,
} from './comparisonPairing';

export const ADVICE_COMPARISON_RESULT_VERSION = 1 as const;
export const MAX_COMPARISON_RESULT_SAMPLE_PAIRS = 200;

export interface AdviceComparisonGuardrail {
  minComparablePairs: number;
  minRelativeImprovement: number;
  minAfterQualityScore: number;
  maxMeanQualityRegression: number;
  allowedQualityFlags: string[];
  qualityRubricId: string;
}

export interface AdviceComparisonCohort {
  scope: StoredAdviceScope;
  taskKind: StoredTaskKind;
  complexityBand: StoredComplexityBand;
  modelFamily: StoredModelFamily;
  effort: StoredEffort;
  metricDefinitionVersion: string;
  qualityRubricId: string;
  metric: {
    name: string;
    unit: StoredMetricUnit;
    direction: StoredMetricDirection;
  };
}

export interface AdviceComparisonSample extends AdviceComparisonCohort {
  pairIds: string[];
  pairCount: number;
}

export type AdviceComparisonEvidenceReason =
  | 'minimum-sample-not-met'
  | 'incomparable-sample'
  | 'unreliable-sample'
  | 'comparison-inconclusive';

export type FrozenAdviceComparisonResult =
  | {
      status: 'evidence-insufficient';
      reasonCode: AdviceComparisonEvidenceReason;
      comparablePairs: number;
    }
  | {
      status: 'quality-guardrail-failed' | 'improved' | 'no-demonstrated-improvement';
      stats: AdviceComparisonStats;
    };

export type AdviceComparisonReplayEligibility =
  | { status: 'eligible'; reason: 'conclusive-result' }
  | { status: 'ineligible'; reason: 'evidence-insufficient' };

export interface AdviceComparisonResultEnvelope {
  schemaVersion: typeof ADVICE_COMPARISON_RESULT_VERSION;
  comparisonId: string;
  provider: StoredProvider;
  recommendationId: string;
  recommendationVersion: string;
  measurementProfileVersion: string;
  guardrail: AdviceComparisonGuardrail;
  replayEligibility: AdviceComparisonReplayEligibility;
  sample: AdviceComparisonSample;
  result: FrozenAdviceComparisonResult;
  recordedAtEpochMs: number;
}

export interface AdviceComparisonResultBuildInput {
  provider: StoredProvider;
  recommendationId: string;
  recommendationVersion: string;
  measurementProfileVersion: string;
  cohort: AdviceComparisonCohort;
  guardrail: AdviceComparisonGuardrail;
  pairs: readonly StoredComparablePair[];
  recordedAtEpochMs: number;
}

export type AdviceComparisonResultBuildIssue =
  | 'invalid-envelope-input'
  | 'invalid-comparable-pair'
  | 'duplicate-comparable-pair'
  | 'comparison-precedes-sample';

export type AdviceComparisonResultBuildResult =
  | { ok: true; value: AdviceComparisonResultEnvelope }
  | { ok: false; reason: 'invalid-input'; issues: AdviceComparisonResultBuildIssue[] };

const BUILD_KEYS = [
  'cohort',
  'guardrail',
  'measurementProfileVersion',
  'pairs',
  'provider',
  'recommendationId',
  'recommendationVersion',
  'recordedAtEpochMs',
] as const;
const ENVELOPE_KEYS = [
  'comparisonId',
  'guardrail',
  'measurementProfileVersion',
  'provider',
  'recommendationId',
  'recommendationVersion',
  'recordedAtEpochMs',
  'replayEligibility',
  'result',
  'sample',
  'schemaVersion',
] as const;
const GUARDRAIL_KEYS = [
  'allowedQualityFlags',
  'maxMeanQualityRegression',
  'minAfterQualityScore',
  'minComparablePairs',
  'minRelativeImprovement',
  'qualityRubricId',
] as const;
const COHORT_KEYS = [
  'complexityBand',
  'effort',
  'metric',
  'metricDefinitionVersion',
  'modelFamily',
  'qualityRubricId',
  'scope',
  'taskKind',
] as const;
const SAMPLE_KEYS = [...COHORT_KEYS, 'pairCount', 'pairIds'] as const;
const METRIC_KEYS = ['direction', 'name', 'unit'] as const;
const REPLAY_KEYS = ['reason', 'status'] as const;
const INSUFFICIENT_RESULT_KEYS = ['comparablePairs', 'reasonCode', 'status'] as const;
const CONCLUSIVE_RESULT_KEYS = ['stats', 'status'] as const;
const STATS_KEYS = [
  'comparablePairs',
  'meanAfterQuality',
  'meanAfterValue',
  'meanBeforeQuality',
  'meanBeforeValue',
  'meanQualityChange',
  'meanRelativeImprovement',
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function isEpochMs(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isFiniteNonNegative(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isScore(value: unknown): value is number {
  return isFiniteNonNegative(value) && value <= 1;
}

function parseIdentifierList(value: unknown, maximum: number): string[] | undefined {
  if (!Array.isArray(value) || value.length > maximum) return undefined;
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !isAdviceIdentifier(item) || seen.has(item)) return undefined;
    seen.add(item);
    result.push(item);
  }
  return result;
}

function parseGuardrail(value: unknown): AdviceComparisonGuardrail | undefined {
  if (!isObject(value) || !hasExactKeys(value, GUARDRAIL_KEYS)) return undefined;
  if (
    !Number.isInteger(value.minComparablePairs) ||
    (value.minComparablePairs as number) < 2 ||
    !isFiniteNonNegative(value.minRelativeImprovement) ||
    !isScore(value.minAfterQualityScore) ||
    !isScore(value.maxMeanQualityRegression) ||
    typeof value.qualityRubricId !== 'string' ||
    !isAdviceIdentifier(value.qualityRubricId)
  ) {
    return undefined;
  }
  const allowedQualityFlags = parseIdentifierList(value.allowedQualityFlags, 32);
  if (!allowedQualityFlags) return undefined;
  return {
    minComparablePairs: value.minComparablePairs as number,
    minRelativeImprovement: value.minRelativeImprovement,
    minAfterQualityScore: value.minAfterQualityScore,
    maxMeanQualityRegression: value.maxMeanQualityRegression,
    allowedQualityFlags,
    qualityRubricId: value.qualityRubricId,
  };
}

function parseMetric(value: unknown): AdviceComparisonCohort['metric'] | undefined {
  if (!isObject(value) || !hasExactKeys(value, METRIC_KEYS)) return undefined;
  if (
    typeof value.name !== 'string' ||
    !isAdviceIdentifier(value.name) ||
    !oneOf(value.unit, ['count', 'tokens', 'ratio', 'multiple', 'milliseconds'] as const) ||
    !oneOf(value.direction, ['lower-is-better', 'higher-is-better'] as const)
  ) {
    return undefined;
  }
  return { name: value.name, unit: value.unit, direction: value.direction };
}

function parseCohort(value: unknown): AdviceComparisonCohort | undefined {
  if (!isObject(value) || !hasExactKeys(value, COHORT_KEYS)) return undefined;
  const metric = parseMetric(value.metric);
  if (
    !metric ||
    !oneOf(value.scope, ['overall', 'project', 'task-cohort'] as const) ||
    !oneOf(value.taskKind, ['small-change', 'feature', 'bug-fix', 'review', 'other'] as const) ||
    !oneOf(value.complexityBand, ['low', 'medium', 'high'] as const) ||
    !oneOf(value.modelFamily, ['opus', 'sonnet', 'haiku', 'fable', 'other'] as const) ||
    !oneOf(value.effort, ['low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'unknown'] as const) ||
    typeof value.metricDefinitionVersion !== 'string' ||
    typeof value.qualityRubricId !== 'string' ||
    !isAdviceIdentifier(value.metricDefinitionVersion) ||
    !isAdviceIdentifier(value.qualityRubricId)
  ) {
    return undefined;
  }
  return {
    scope: value.scope,
    taskKind: value.taskKind,
    complexityBand: value.complexityBand,
    modelFamily: value.modelFamily,
    effort: value.effort,
    metricDefinitionVersion: value.metricDefinitionVersion,
    qualityRubricId: value.qualityRubricId,
    metric,
  };
}

function parseSample(value: unknown): AdviceComparisonSample | undefined {
  if (!isObject(value) || !hasExactKeys(value, SAMPLE_KEYS)) return undefined;
  const cohortCandidate: Record<string, unknown> = {};
  for (const key of COHORT_KEYS) cohortCandidate[key] = value[key];
  const cohort = parseCohort(cohortCandidate);
  const pairIds = parseIdentifierList(value.pairIds, MAX_COMPARISON_RESULT_SAMPLE_PAIRS);
  if (
    !cohort ||
    !pairIds ||
    !Number.isInteger(value.pairCount) ||
    (value.pairCount as number) < 0 ||
    value.pairCount !== pairIds.length
  ) {
    return undefined;
  }
  return { ...cohort, pairIds, pairCount: value.pairCount as number };
}

function parseStats(value: unknown): AdviceComparisonStats | undefined {
  if (!isObject(value) || !hasExactKeys(value, STATS_KEYS)) return undefined;
  if (
    !Number.isInteger(value.comparablePairs) ||
    (value.comparablePairs as number) < 0 ||
    !isFiniteNonNegative(value.meanBeforeValue) ||
    !isFiniteNonNegative(value.meanAfterValue) ||
    !isFiniteNumber(value.meanRelativeImprovement) ||
    !isScore(value.meanBeforeQuality) ||
    !isScore(value.meanAfterQuality) ||
    !isFiniteNumber(value.meanQualityChange) ||
    value.meanQualityChange < -1 ||
    value.meanQualityChange > 1
  ) {
    return undefined;
  }
  return {
    comparablePairs: value.comparablePairs as number,
    meanBeforeValue: value.meanBeforeValue,
    meanAfterValue: value.meanAfterValue,
    meanRelativeImprovement: value.meanRelativeImprovement,
    meanBeforeQuality: value.meanBeforeQuality,
    meanAfterQuality: value.meanAfterQuality,
    meanQualityChange: value.meanQualityChange,
  };
}

function parseResult(value: unknown): FrozenAdviceComparisonResult | undefined {
  if (!isObject(value) || typeof value.status !== 'string') return undefined;
  if (value.status === 'evidence-insufficient') {
    if (
      !hasExactKeys(value, INSUFFICIENT_RESULT_KEYS) ||
      !oneOf(value.reasonCode, [
        'minimum-sample-not-met',
        'incomparable-sample',
        'unreliable-sample',
        'comparison-inconclusive',
      ] as const) ||
      !Number.isInteger(value.comparablePairs) ||
      (value.comparablePairs as number) < 0
    ) {
      return undefined;
    }
    return {
      status: value.status,
      reasonCode: value.reasonCode,
      comparablePairs: value.comparablePairs as number,
    };
  }
  if (
    !oneOf(value.status, [
      'quality-guardrail-failed',
      'improved',
      'no-demonstrated-improvement',
    ] as const) ||
    !hasExactKeys(value, CONCLUSIVE_RESULT_KEYS)
  ) {
    return undefined;
  }
  const stats = parseStats(value.stats);
  if (!stats) return undefined;
  return { status: value.status, stats };
}

function parseReplayEligibility(value: unknown): AdviceComparisonReplayEligibility | undefined {
  if (!isObject(value) || !hasExactKeys(value, REPLAY_KEYS)) return undefined;
  if (value.status === 'eligible' && value.reason === 'conclusive-result') {
    return { status: value.status, reason: value.reason };
  }
  if (value.status === 'ineligible' && value.reason === 'evidence-insufficient') {
    return { status: value.status, reason: value.reason };
  }
  return undefined;
}

function canonicalJson(value: unknown): string {
  const canonicalize = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map(canonicalize);
    if (isObject(current)) {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(current).sort()) result[key] = canonicalize(current[key]);
      return result;
    }
    return current;
  };
  return JSON.stringify(canonicalize(value));
}

function comparisonId(value: Omit<AdviceComparisonResultEnvelope, 'comparisonId'>): string {
  const digest = createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex').slice(0, 32);
  return `comparison-${digest}`;
}

/** Parse, clone, and verify the entire frozen envelope, including its digest. */
export function parseAdviceComparisonResultEnvelope(
  value: unknown,
): AdviceComparisonResultEnvelope | undefined {
  if (!isObject(value) || !hasExactKeys(value, ENVELOPE_KEYS)) return undefined;
  if (
    value.schemaVersion !== ADVICE_COMPARISON_RESULT_VERSION ||
    typeof value.comparisonId !== 'string' ||
    typeof value.recommendationId !== 'string' ||
    typeof value.recommendationVersion !== 'string' ||
    typeof value.measurementProfileVersion !== 'string' ||
    !isAdviceIdentifier(value.comparisonId) ||
    !oneOf(value.provider, ['claude', 'codex'] as const) ||
    !isAdviceIdentifier(value.recommendationId) ||
    !isAdviceIdentifier(value.recommendationVersion) ||
    !isAdviceIdentifier(value.measurementProfileVersion) ||
    !isEpochMs(value.recordedAtEpochMs)
  ) {
    return undefined;
  }
  const guardrail = parseGuardrail(value.guardrail);
  const sample = parseSample(value.sample);
  const result = parseResult(value.result);
  const replayEligibility = parseReplayEligibility(value.replayEligibility);
  if (
    !guardrail ||
    !sample ||
    !result ||
    !replayEligibility ||
    guardrail.qualityRubricId !== sample.qualityRubricId ||
    (result.status === 'evidence-insufficient'
      ? replayEligibility.status !== 'ineligible' || result.comparablePairs !== sample.pairCount
      : replayEligibility.status !== 'eligible' || result.stats.comparablePairs !== sample.pairCount)
  ) {
    return undefined;
  }
  const withoutId: Omit<AdviceComparisonResultEnvelope, 'comparisonId'> = {
    schemaVersion: ADVICE_COMPARISON_RESULT_VERSION,
    provider: value.provider,
    recommendationId: value.recommendationId,
    recommendationVersion: value.recommendationVersion,
    measurementProfileVersion: value.measurementProfileVersion,
    guardrail,
    replayEligibility,
    sample,
    result,
    recordedAtEpochMs: value.recordedAtEpochMs,
  };
  if (value.comparisonId !== comparisonId(withoutId)) return undefined;
  return { comparisonId: value.comparisonId, ...withoutId };
}

function pairMatchesCohort(
  pair: StoredComparablePair,
  input: {
    provider: StoredProvider;
    recommendationId: string;
    recommendationVersion: string;
    measurementProfileVersion: string;
    cohort: AdviceComparisonCohort;
  },
): boolean {
  return (
    pair.context.provider === input.provider &&
    pair.recommendationId === input.recommendationId &&
    pair.recommendationVersion === input.recommendationVersion &&
    pair.context.measurementProfileVersion === input.measurementProfileVersion &&
    pair.context.scope === input.cohort.scope &&
    pair.context.taskKind === input.cohort.taskKind &&
    pair.context.complexityBand === input.cohort.complexityBand &&
    pair.context.modelFamily === input.cohort.modelFamily &&
    pair.context.effort === input.cohort.effort &&
    pair.context.metricDefinitionVersion === input.cohort.metricDefinitionVersion &&
    pair.context.qualityRubricId === input.cohort.qualityRubricId &&
    pair.metric.name === input.cohort.metric.name &&
    pair.metric.unit === input.cohort.metric.unit &&
    pair.metric.direction === input.cohort.metric.direction
  );
}

function pairIsReliable(pair: StoredComparablePair, allowedFlags: ReadonlySet<string>): boolean {
  return (
    pair.evidence.beforeCoverage === 'complete' &&
    pair.evidence.afterCoverage === 'complete' &&
    pair.evidence.beforeConfidence !== 'low' &&
    pair.evidence.beforeConfidence !== 'unknown' &&
    pair.evidence.afterConfidence !== 'low' &&
    pair.evidence.afterConfidence !== 'unknown' &&
    pair.evidence.beforeQualityFlags.every((flag) => allowedFlags.has(flag)) &&
    pair.evidence.afterQualityFlags.every((flag) => allowedFlags.has(flag)) &&
    pair.quality.beforePassed === 'passed' &&
    pair.quality.afterPassed !== 'unknown' &&
    pair.quality.beforeEvidenceCount > 0 &&
    pair.quality.afterEvidenceCount > 0 &&
    pair.context.effort !== 'unknown' &&
    pair.metric.beforeValue > 0
  );
}

/**
 * Freeze a comparison result from one strict recommendation/cohort lineage.
 * The envelope stores only coarse cohort fields, aggregate statistics, and
 * opaque pair IDs; comparator prose is deliberately not persisted.
 */
export function buildAdviceComparisonResultEnvelope(
  input: unknown,
): AdviceComparisonResultBuildResult {
  if (!isObject(input) || !hasExactKeys(input, BUILD_KEYS)) {
    return { ok: false, reason: 'invalid-input', issues: ['invalid-envelope-input'] };
  }
  const cohort = parseCohort(input.cohort);
  const guardrail = parseGuardrail(input.guardrail);
  if (
    !oneOf(input.provider, ['claude', 'codex'] as const) ||
    typeof input.recommendationId !== 'string' ||
    typeof input.recommendationVersion !== 'string' ||
    typeof input.measurementProfileVersion !== 'string' ||
    !isAdviceIdentifier(input.recommendationId) ||
    !isAdviceIdentifier(input.recommendationVersion) ||
    !isAdviceIdentifier(input.measurementProfileVersion) ||
    !cohort ||
    !guardrail ||
    cohort.qualityRubricId !== guardrail.qualityRubricId ||
    !Array.isArray(input.pairs) ||
    input.pairs.length > MAX_COMPARISON_RESULT_SAMPLE_PAIRS ||
    !isEpochMs(input.recordedAtEpochMs)
  ) {
    return { ok: false, reason: 'invalid-input', issues: ['invalid-envelope-input'] };
  }
  const provider = input.provider;
  const recommendationId = input.recommendationId;
  const recommendationVersion = input.recommendationVersion;
  const measurementProfileVersion = input.measurementProfileVersion;
  const recordedAtEpochMs = input.recordedAtEpochMs;

  const pairs: StoredComparablePair[] = [];
  const pairIds = new Set<string>();
  for (const raw of input.pairs) {
    const parsed = parseStoredComparablePair(raw);
    if (!parsed) {
      return { ok: false, reason: 'invalid-input', issues: ['invalid-comparable-pair'] };
    }
    if (pairIds.has(parsed.pairId)) {
      return { ok: false, reason: 'invalid-input', issues: ['duplicate-comparable-pair'] };
    }
    if (parsed.recordedAtEpochMs > recordedAtEpochMs) {
      return { ok: false, reason: 'invalid-input', issues: ['comparison-precedes-sample'] };
    }
    pairIds.add(parsed.pairId);
    pairs.push(parsed);
  }
  pairs.sort((left, right) => left.pairId.localeCompare(right.pairId));

  const sample: AdviceComparisonSample = {
    ...cohort,
    pairIds: pairs.map((pair) => pair.pairId),
    pairCount: pairs.length,
  };
  let result: FrozenAdviceComparisonResult;
  if (pairs.length < guardrail.minComparablePairs) {
    result = {
      status: 'evidence-insufficient',
      reasonCode: 'minimum-sample-not-met',
      comparablePairs: pairs.length,
    };
  } else if (
    pairs.some((pair) =>
      !pairMatchesCohort(pair, {
        provider,
        recommendationId,
        recommendationVersion,
        measurementProfileVersion,
        cohort,
      }),
    )
  ) {
    result = {
      status: 'evidence-insufficient',
      reasonCode: 'incomparable-sample',
      comparablePairs: pairs.length,
    };
  } else if (
    pairs.some((pair) => !pairIsReliable(pair, new Set(guardrail.allowedQualityFlags)))
  ) {
    result = {
      status: 'evidence-insufficient',
      reasonCode: 'unreliable-sample',
      comparablePairs: pairs.length,
    };
  } else {
    const compared = compareAdviceEffectiveness(toComparableTaskPairs(pairs), {
      minComparablePairs: guardrail.minComparablePairs,
      minRelativeImprovement: guardrail.minRelativeImprovement,
      minAfterQualityScore: guardrail.minAfterQualityScore,
      maxMeanQualityRegression: guardrail.maxMeanQualityRegression,
      allowedQualityFlags: [...guardrail.allowedQualityFlags],
    });
    result = compared.status === 'insufficient-evidence'
      ? {
          status: 'evidence-insufficient',
          reasonCode: 'comparison-inconclusive',
          comparablePairs: pairs.length,
        }
      : { status: compared.status, stats: { ...compared.stats } };
  }
  const replayEligibility: AdviceComparisonReplayEligibility =
    result.status === 'evidence-insufficient'
      ? { status: 'ineligible', reason: 'evidence-insufficient' }
      : { status: 'eligible', reason: 'conclusive-result' };
  const withoutId: Omit<AdviceComparisonResultEnvelope, 'comparisonId'> = {
    schemaVersion: ADVICE_COMPARISON_RESULT_VERSION,
    provider,
    recommendationId,
    recommendationVersion,
    measurementProfileVersion,
    guardrail,
    replayEligibility,
    sample,
    result,
    recordedAtEpochMs,
  };
  const envelope: AdviceComparisonResultEnvelope = {
    comparisonId: comparisonId(withoutId),
    ...withoutId,
  };
  const parsed = parseAdviceComparisonResultEnvelope(envelope);
  return parsed
    ? { ok: true, value: parsed }
    : { ok: false, reason: 'invalid-input', issues: ['invalid-envelope-input'] };
}
