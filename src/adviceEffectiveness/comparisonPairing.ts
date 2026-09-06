import { createHash } from 'node:crypto';

import type { ComparableTaskPair } from './comparison';
import { isAdviceIdentifier } from './contract';

export type StoredAdviceScope = 'overall' | 'project' | 'task-cohort';
export type StoredProvider = 'claude' | 'codex';
export type StoredTaskKind = 'small-change' | 'feature' | 'bug-fix' | 'review' | 'other';
export type StoredComplexityBand = 'low' | 'medium' | 'high';
export type StoredModelFamily = 'opus' | 'sonnet' | 'haiku' | 'fable' | 'other';
export type StoredEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra' | 'unknown';
export type StoredMetricUnit = 'count' | 'tokens' | 'ratio' | 'multiple' | 'milliseconds';
export type StoredMetricDirection = 'lower-is-better' | 'higher-is-better';
export type StoredQualityPass = 'passed' | 'failed' | 'unknown';
export type StoredCoverage = 'complete' | 'partial' | 'unknown';
export type StoredConfidence = 'high' | 'medium' | 'low' | 'unknown';

export interface StoredComparableContext {
  scope: StoredAdviceScope;
  taskKind: StoredTaskKind;
  complexityBand: StoredComplexityBand;
  provider: StoredProvider;
  modelFamily: StoredModelFamily;
  effort: StoredEffort;
  measurementProfileVersion: string;
  metricDefinitionVersion: string;
  qualityRubricId: string;
}

export interface ComparableObservation {
  context: StoredComparableContext;
  metric: {
    name: string;
    unit: StoredMetricUnit;
    direction: StoredMetricDirection;
    value: number;
  };
  quality: {
    score: number;
    passed: StoredQualityPass;
    evidenceCount: number;
  };
  evidence: {
    coverage: StoredCoverage;
    confidence: StoredConfidence;
    qualityFlags: string[];
  };
  observedAtEpochMs: number;
}

export interface ComparablePairBuildInput {
  adviceId: string;
  recommendationId: string;
  recommendationVersion: string;
  before: ComparableObservation;
  after: ComparableObservation;
  recordedAtEpochMs: number;
}

export interface StoredComparablePair {
  pairId: string;
  adviceId: string;
  recommendationId: string;
  recommendationVersion: string;
  context: StoredComparableContext;
  metric: {
    name: string;
    unit: StoredMetricUnit;
    direction: StoredMetricDirection;
    beforeValue: number;
    afterValue: number;
  };
  quality: {
    beforeScore: number;
    afterScore: number;
    beforePassed: StoredQualityPass;
    afterPassed: StoredQualityPass;
    beforeEvidenceCount: number;
    afterEvidenceCount: number;
  };
  evidence: {
    beforeCoverage: StoredCoverage;
    afterCoverage: StoredCoverage;
    beforeConfidence: StoredConfidence;
    afterConfidence: StoredConfidence;
    beforeQualityFlags: string[];
    afterQualityFlags: string[];
  };
  recordedAtEpochMs: number;
}

export type ComparablePairEvidenceIssue =
  | 'scope-mismatch'
  | 'task-kind-mismatch'
  | 'complexity-mismatch'
  | 'provider-mismatch'
  | 'model-mismatch'
  | 'effort-mismatch'
  | 'measurement-profile-mismatch'
  | 'metric-definition-mismatch'
  | 'quality-rubric-mismatch'
  | 'metric-name-mismatch'
  | 'metric-unit-mismatch'
  | 'metric-direction-mismatch'
  | 'incomplete-coverage'
  | 'insufficient-confidence'
  | 'unresolved-quality-flags'
  | 'unknown-quality-result'
  | 'missing-quality-evidence'
  | 'failed-quality-baseline'
  | 'unknown-effort'
  | 'zero-metric-baseline'
  | 'invalid-observation-order';

export type ComparablePairBuildResult =
  | { ok: true; value: StoredComparablePair }
  | {
      ok: false;
      reason: 'invalid-input';
      issues: ['invalid-sanitized-observation'];
    }
  | {
      ok: false;
      reason: 'evidence-insufficient';
      issues: ComparablePairEvidenceIssue[];
    };

const BUILD_INPUT_KEYS = [
  'adviceId',
  'after',
  'before',
  'recommendationId',
  'recommendationVersion',
  'recordedAtEpochMs',
] as const;
const OBSERVATION_KEYS = ['context', 'evidence', 'metric', 'observedAtEpochMs', 'quality'] as const;
const CONTEXT_KEYS = [
  'complexityBand',
  'effort',
  'measurementProfileVersion',
  'metricDefinitionVersion',
  'modelFamily',
  'provider',
  'qualityRubricId',
  'scope',
  'taskKind',
] as const;
const OBSERVATION_METRIC_KEYS = ['direction', 'name', 'unit', 'value'] as const;
const OBSERVATION_QUALITY_KEYS = ['evidenceCount', 'passed', 'score'] as const;
const OBSERVATION_EVIDENCE_KEYS = ['confidence', 'coverage', 'qualityFlags'] as const;
const PAIR_KEYS = [
  'adviceId',
  'context',
  'evidence',
  'metric',
  'pairId',
  'quality',
  'recommendationId',
  'recommendationVersion',
  'recordedAtEpochMs',
] as const;
const PAIR_METRIC_KEYS = ['afterValue', 'beforeValue', 'direction', 'name', 'unit'] as const;
const PAIR_QUALITY_KEYS = [
  'afterEvidenceCount',
  'afterPassed',
  'afterScore',
  'beforeEvidenceCount',
  'beforePassed',
  'beforeScore',
] as const;
const PAIR_EVIDENCE_KEYS = [
  'afterConfidence',
  'afterCoverage',
  'afterQualityFlags',
  'beforeConfidence',
  'beforeCoverage',
  'beforeQualityFlags',
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

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isScore(value: unknown): value is number {
  return isFiniteNonNegative(value) && value <= 1;
}

function parseQualityFlags(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > 32) return undefined;
  const result: string[] = [];
  const seen = new Set<string>();
  for (const flag of value) {
    if (typeof flag !== 'string' || !isAdviceIdentifier(flag) || seen.has(flag)) return undefined;
    seen.add(flag);
    result.push(flag);
  }
  return result;
}

function parseContext(value: unknown): StoredComparableContext | undefined {
  if (!isObject(value) || !hasExactKeys(value, CONTEXT_KEYS)) return undefined;
  if (
    !oneOf(value.scope, ['overall', 'project', 'task-cohort'] as const) ||
    !oneOf(value.taskKind, ['small-change', 'feature', 'bug-fix', 'review', 'other'] as const) ||
    !oneOf(value.complexityBand, ['low', 'medium', 'high'] as const) ||
    !oneOf(value.provider, ['claude', 'codex'] as const) ||
    !oneOf(value.modelFamily, ['opus', 'sonnet', 'haiku', 'fable', 'other'] as const) ||
    !oneOf(value.effort, ['low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'unknown'] as const) ||
    typeof value.measurementProfileVersion !== 'string' ||
    typeof value.metricDefinitionVersion !== 'string' ||
    typeof value.qualityRubricId !== 'string' ||
    !isAdviceIdentifier(value.measurementProfileVersion) ||
    !isAdviceIdentifier(value.metricDefinitionVersion) ||
    !isAdviceIdentifier(value.qualityRubricId)
  ) {
    return undefined;
  }
  return {
    scope: value.scope,
    taskKind: value.taskKind,
    complexityBand: value.complexityBand,
    provider: value.provider,
    modelFamily: value.modelFamily,
    effort: value.effort,
    measurementProfileVersion: value.measurementProfileVersion,
    metricDefinitionVersion: value.metricDefinitionVersion,
    qualityRubricId: value.qualityRubricId,
  };
}

function parseObservation(value: unknown): ComparableObservation | undefined {
  if (!isObject(value) || !hasExactKeys(value, OBSERVATION_KEYS)) return undefined;
  const context = parseContext(value.context);
  if (
    !context ||
    !isObject(value.metric) ||
    !hasExactKeys(value.metric, OBSERVATION_METRIC_KEYS) ||
    !isObject(value.quality) ||
    !hasExactKeys(value.quality, OBSERVATION_QUALITY_KEYS) ||
    !isObject(value.evidence) ||
    !hasExactKeys(value.evidence, OBSERVATION_EVIDENCE_KEYS) ||
    !isEpochMs(value.observedAtEpochMs)
  ) {
    return undefined;
  }
  const metric = value.metric;
  const quality = value.quality;
  const evidence = value.evidence;
  if (
    typeof metric.name !== 'string' ||
    !isAdviceIdentifier(metric.name) ||
    !oneOf(metric.unit, ['count', 'tokens', 'ratio', 'multiple', 'milliseconds'] as const) ||
    !oneOf(metric.direction, ['lower-is-better', 'higher-is-better'] as const) ||
    !isFiniteNonNegative(metric.value) ||
    !isScore(quality.score) ||
    !oneOf(quality.passed, ['passed', 'failed', 'unknown'] as const) ||
    !isEpochMs(quality.evidenceCount) ||
    !oneOf(evidence.coverage, ['complete', 'partial', 'unknown'] as const) ||
    !oneOf(evidence.confidence, ['high', 'medium', 'low', 'unknown'] as const)
  ) {
    return undefined;
  }
  const qualityFlags = parseQualityFlags(evidence.qualityFlags);
  if (!qualityFlags) return undefined;
  return {
    context,
    metric: {
      name: metric.name,
      unit: metric.unit,
      direction: metric.direction,
      value: metric.value,
    },
    quality: {
      score: quality.score,
      passed: quality.passed,
      evidenceCount: quality.evidenceCount,
    },
    evidence: {
      coverage: evidence.coverage,
      confidence: evidence.confidence,
      qualityFlags,
    },
    observedAtEpochMs: value.observedAtEpochMs,
  };
}

/** Strictly parse the content-free persisted representation and clone its arrays. */
export function parseStoredComparablePair(value: unknown): StoredComparablePair | undefined {
  if (!isObject(value) || !hasExactKeys(value, PAIR_KEYS)) return undefined;
  if (
    typeof value.pairId !== 'string' ||
    typeof value.adviceId !== 'string' ||
    typeof value.recommendationId !== 'string' ||
    typeof value.recommendationVersion !== 'string' ||
    !isAdviceIdentifier(value.pairId) ||
    !isAdviceIdentifier(value.adviceId) ||
    !isAdviceIdentifier(value.recommendationId) ||
    !isAdviceIdentifier(value.recommendationVersion) ||
    !isEpochMs(value.recordedAtEpochMs)
  ) {
    return undefined;
  }
  const context = parseContext(value.context);
  if (
    !context ||
    !isObject(value.metric) ||
    !hasExactKeys(value.metric, PAIR_METRIC_KEYS) ||
    !isObject(value.quality) ||
    !hasExactKeys(value.quality, PAIR_QUALITY_KEYS) ||
    !isObject(value.evidence) ||
    !hasExactKeys(value.evidence, PAIR_EVIDENCE_KEYS)
  ) {
    return undefined;
  }
  const metric = value.metric;
  const quality = value.quality;
  const evidence = value.evidence;
  if (
    typeof metric.name !== 'string' ||
    !isAdviceIdentifier(metric.name) ||
    !oneOf(metric.unit, ['count', 'tokens', 'ratio', 'multiple', 'milliseconds'] as const) ||
    !oneOf(metric.direction, ['lower-is-better', 'higher-is-better'] as const) ||
    !isFiniteNonNegative(metric.beforeValue) ||
    !isFiniteNonNegative(metric.afterValue) ||
    !isScore(quality.beforeScore) ||
    !isScore(quality.afterScore) ||
    !oneOf(quality.beforePassed, ['passed', 'failed', 'unknown'] as const) ||
    !oneOf(quality.afterPassed, ['passed', 'failed', 'unknown'] as const) ||
    !isEpochMs(quality.beforeEvidenceCount) ||
    !isEpochMs(quality.afterEvidenceCount) ||
    !oneOf(evidence.beforeCoverage, ['complete', 'partial', 'unknown'] as const) ||
    !oneOf(evidence.afterCoverage, ['complete', 'partial', 'unknown'] as const) ||
    !oneOf(evidence.beforeConfidence, ['high', 'medium', 'low', 'unknown'] as const) ||
    !oneOf(evidence.afterConfidence, ['high', 'medium', 'low', 'unknown'] as const)
  ) {
    return undefined;
  }
  const beforeQualityFlags = parseQualityFlags(evidence.beforeQualityFlags);
  const afterQualityFlags = parseQualityFlags(evidence.afterQualityFlags);
  if (!beforeQualityFlags || !afterQualityFlags) return undefined;
  return {
    pairId: value.pairId,
    adviceId: value.adviceId,
    recommendationId: value.recommendationId,
    recommendationVersion: value.recommendationVersion,
    context,
    metric: {
      name: metric.name,
      unit: metric.unit,
      direction: metric.direction,
      beforeValue: metric.beforeValue,
      afterValue: metric.afterValue,
    },
    quality: {
      beforeScore: quality.beforeScore,
      afterScore: quality.afterScore,
      beforePassed: quality.beforePassed,
      afterPassed: quality.afterPassed,
      beforeEvidenceCount: quality.beforeEvidenceCount,
      afterEvidenceCount: quality.afterEvidenceCount,
    },
    evidence: {
      beforeCoverage: evidence.beforeCoverage,
      afterCoverage: evidence.afterCoverage,
      beforeConfidence: evidence.beforeConfidence,
      afterConfidence: evidence.afterConfidence,
      beforeQualityFlags,
      afterQualityFlags,
    },
    recordedAtEpochMs: value.recordedAtEpochMs,
  };
}

function mismatchIssues(before: ComparableObservation, after: ComparableObservation): ComparablePairEvidenceIssue[] {
  const issues: ComparablePairEvidenceIssue[] = [];
  const compare = <T>(left: T, right: T, issue: ComparablePairEvidenceIssue): void => {
    if (left !== right) issues.push(issue);
  };
  compare(before.context.scope, after.context.scope, 'scope-mismatch');
  compare(before.context.taskKind, after.context.taskKind, 'task-kind-mismatch');
  compare(before.context.complexityBand, after.context.complexityBand, 'complexity-mismatch');
  compare(before.context.provider, after.context.provider, 'provider-mismatch');
  compare(before.context.modelFamily, after.context.modelFamily, 'model-mismatch');
  compare(before.context.effort, after.context.effort, 'effort-mismatch');
  compare(
    before.context.measurementProfileVersion,
    after.context.measurementProfileVersion,
    'measurement-profile-mismatch',
  );
  compare(
    before.context.metricDefinitionVersion,
    after.context.metricDefinitionVersion,
    'metric-definition-mismatch',
  );
  compare(before.context.qualityRubricId, after.context.qualityRubricId, 'quality-rubric-mismatch');
  compare(before.metric.name, after.metric.name, 'metric-name-mismatch');
  compare(before.metric.unit, after.metric.unit, 'metric-unit-mismatch');
  compare(before.metric.direction, after.metric.direction, 'metric-direction-mismatch');
  return issues;
}

function reliabilityIssues(
  before: ComparableObservation,
  after: ComparableObservation,
  recordedAtEpochMs: number,
): ComparablePairEvidenceIssue[] {
  const issues: ComparablePairEvidenceIssue[] = [];
  const add = (issue: ComparablePairEvidenceIssue): void => {
    if (!issues.includes(issue)) issues.push(issue);
  };
  for (const observation of [before, after]) {
    if (observation.evidence.coverage !== 'complete') add('incomplete-coverage');
    if (observation.evidence.confidence === 'low' || observation.evidence.confidence === 'unknown') {
      add('insufficient-confidence');
    }
    if (observation.evidence.qualityFlags.length > 0) add('unresolved-quality-flags');
    if (observation.quality.passed === 'unknown') add('unknown-quality-result');
    if (observation.quality.evidenceCount < 1) add('missing-quality-evidence');
  }
  if (before.quality.passed === 'failed') add('failed-quality-baseline');
  if (before.context.effort === 'unknown') add('unknown-effort');
  if (before.metric.value === 0) add('zero-metric-baseline');
  if (
    before.observedAtEpochMs >= after.observedAtEpochMs ||
    recordedAtEpochMs < after.observedAtEpochMs
  ) {
    add('invalid-observation-order');
  }
  return issues;
}

function pairDigest(value: Omit<StoredComparablePair, 'pairId'>): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex').slice(0, 32);
}

/**
 * Pair two already-sanitized observations. Comparability and reliability are
 * proven from coarse machine fields; free text, paths, and session identifiers
 * are not part of this boundary and make the exact parser fail.
 */
export function buildComparableTaskPair(input: unknown): ComparablePairBuildResult {
  if (!isObject(input) || !hasExactKeys(input, BUILD_INPUT_KEYS)) {
    return { ok: false, reason: 'invalid-input', issues: ['invalid-sanitized-observation'] };
  }
  const before = parseObservation(input.before);
  const after = parseObservation(input.after);
  if (
    typeof input.adviceId !== 'string' ||
    typeof input.recommendationId !== 'string' ||
    typeof input.recommendationVersion !== 'string' ||
    !isAdviceIdentifier(input.adviceId) ||
    !isAdviceIdentifier(input.recommendationId) ||
    !isAdviceIdentifier(input.recommendationVersion) ||
    !isEpochMs(input.recordedAtEpochMs) ||
    !before ||
    !after
  ) {
    return { ok: false, reason: 'invalid-input', issues: ['invalid-sanitized-observation'] };
  }
  const issues = [
    ...mismatchIssues(before, after),
    ...reliabilityIssues(before, after, input.recordedAtEpochMs),
  ];
  if (issues.length > 0) return { ok: false, reason: 'evidence-insufficient', issues };

  const pairWithoutId: Omit<StoredComparablePair, 'pairId'> = {
    adviceId: input.adviceId,
    recommendationId: input.recommendationId,
    recommendationVersion: input.recommendationVersion,
    context: { ...before.context },
    metric: {
      name: before.metric.name,
      unit: before.metric.unit,
      direction: before.metric.direction,
      beforeValue: before.metric.value,
      afterValue: after.metric.value,
    },
    quality: {
      beforeScore: before.quality.score,
      afterScore: after.quality.score,
      beforePassed: before.quality.passed,
      afterPassed: after.quality.passed,
      beforeEvidenceCount: before.quality.evidenceCount,
      afterEvidenceCount: after.quality.evidenceCount,
    },
    evidence: {
      beforeCoverage: before.evidence.coverage,
      afterCoverage: after.evidence.coverage,
      beforeConfidence: before.evidence.confidence,
      afterConfidence: after.evidence.confidence,
      beforeQualityFlags: [...before.evidence.qualityFlags],
      afterQualityFlags: [...after.evidence.qualityFlags],
    },
    recordedAtEpochMs: input.recordedAtEpochMs,
  };
  return {
    ok: true,
    value: { pairId: `pair-${pairDigest(pairWithoutId)}`, ...pairWithoutId },
  };
}

/** Convert only state that has already passed the exact persistence parser. */
export function toComparableTaskPairs(pairs: readonly StoredComparablePair[]): ComparableTaskPair[] {
  return pairs.map((pair) => {
    const context = {
      taskKind: pair.context.taskKind,
      complexityBand: pair.context.complexityBand,
      provider: pair.context.provider,
      modelFamily: pair.context.modelFamily,
      effort: pair.context.effort,
      metricDefinitionVersion: pair.context.metricDefinitionVersion,
      qualityRubricId: pair.context.qualityRubricId,
    };
    const outcome = (period: 'before' | 'after'): ComparableTaskPair['before'] => ({
      context: { ...context },
      primaryMetric: {
        name: pair.metric.name,
        unit: pair.metric.unit,
        direction: pair.metric.direction,
        value: period === 'before' ? pair.metric.beforeValue : pair.metric.afterValue,
      },
      quality: {
        score: period === 'before' ? pair.quality.beforeScore : pair.quality.afterScore,
        passed: (() => {
          const value = period === 'before' ? pair.quality.beforePassed : pair.quality.afterPassed;
          return value === 'unknown' ? null : value === 'passed';
        })(),
        evidenceCount:
          period === 'before' ? pair.quality.beforeEvidenceCount : pair.quality.afterEvidenceCount,
      },
      evidence: {
        coverage: period === 'before' ? pair.evidence.beforeCoverage : pair.evidence.afterCoverage,
        confidence:
          period === 'before' ? pair.evidence.beforeConfidence : pair.evidence.afterConfidence,
        qualityFlags: [
          ...(period === 'before'
            ? pair.evidence.beforeQualityFlags
            : pair.evidence.afterQualityFlags),
        ],
      },
    });
    return { pairId: pair.pairId, before: outcome('before'), after: outcome('after') };
  });
}
