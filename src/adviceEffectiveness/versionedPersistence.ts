import type { ComparableTaskPair } from './comparison';
import { isAdviceIdentifier } from './contract';

/** Stable key: schema versions migrate in-place instead of changing the key. */
export const ADVICE_LOCAL_STATE_KEY = 'ccu.adviceEffectiveness.localState';
export const ADVICE_LOCAL_STATE_VERSION = 2 as const;
export const MAX_PERSISTED_ADVICE_FEEDBACK = 500;
export const MAX_PERSISTED_COMPARABLE_PAIRS = 200;

export type AdviceFeatureMode = 'disabled' | 'enabled';
export type AdviceConsentState = 'not-granted' | 'explicit';
export type PersistedAdviceRating = 'unrated' | 'helpful' | 'not-helpful';
export type PersistedAdviceApplied = 'not-applied' | 'applied';
export type AdviceFeedbackMutationKind = 'helpful' | 'not-helpful' | 'applied';

export interface PersistedAdviceFeedback {
  adviceId: string;
  recommendationId: string;
  rating: PersistedAdviceRating;
  applied: PersistedAdviceApplied;
  updatedAtEpochMs: number;
}

export type StoredTaskKind =
  | 'small-change'
  | 'feature'
  | 'bug-fix'
  | 'review'
  | 'other';
export type StoredModelFamily = 'opus' | 'sonnet' | 'haiku' | 'fable' | 'other';
export type StoredEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra' | 'unknown';
export type StoredMetricUnit = 'count' | 'tokens' | 'ratio' | 'multiple' | 'milliseconds';
export type StoredQualityPass = 'passed' | 'failed' | 'unknown';

export interface StoredComparablePair {
  pairId: string;
  adviceId: string;
  recommendationId: string;
  context: {
    taskKind: StoredTaskKind;
    complexityBand: 'low' | 'medium' | 'high';
    provider: 'claude' | 'codex';
    modelFamily: StoredModelFamily;
    effort: StoredEffort;
    metricDefinitionVersion: string;
    qualityRubricId: string;
  };
  metric: {
    name: string;
    unit: StoredMetricUnit;
    direction: 'lower-is-better' | 'higher-is-better';
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
    beforeCoverage: 'complete' | 'partial' | 'unknown';
    afterCoverage: 'complete' | 'partial' | 'unknown';
    beforeConfidence: 'high' | 'medium' | 'low' | 'unknown';
    afterConfidence: 'high' | 'medium' | 'low' | 'unknown';
    beforeQualityFlags: string[];
    afterQualityFlags: string[];
  };
  recordedAtEpochMs: number;
}

export interface AdviceLocalState {
  schemaVersion: typeof ADVICE_LOCAL_STATE_VERSION;
  featureMode: AdviceFeatureMode;
  aggregateConsent: AdviceConsentState;
  promptSampleConsent: AdviceConsentState;
  feedback: PersistedAdviceFeedback[];
  comparablePairs: StoredComparablePair[];
}

export interface AdviceLocalStateStorage {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

export type AdviceLocalStateLoadResult =
  | { ok: true; migrated: boolean; value: AdviceLocalState }
  | { ok: false; reason: 'invalid-local-data' | 'storage-error'; value: AdviceLocalState };

export type AdviceLocalStateWriteResult =
  | { ok: true; value: AdviceLocalState }
  | { ok: false; reason: 'invalid-local-data' | 'storage-error' };

export type AdviceLocalStateMutationResult =
  | { ok: true; value: AdviceLocalState }
  | { ok: false; reason: 'invalid-local-data' | 'invalid-input' };

const STATE_KEYS = [
  'aggregateConsent',
  'comparablePairs',
  'featureMode',
  'feedback',
  'promptSampleConsent',
  'schemaVersion',
] as const;
const FEEDBACK_KEYS = [
  'adviceId',
  'applied',
  'rating',
  'recommendationId',
  'updatedAtEpochMs',
] as const;
const PAIR_KEYS = [
  'adviceId',
  'context',
  'evidence',
  'metric',
  'pairId',
  'quality',
  'recommendationId',
  'recordedAtEpochMs',
] as const;
const CONTEXT_KEYS = [
  'complexityBand',
  'effort',
  'metricDefinitionVersion',
  'modelFamily',
  'provider',
  'qualityRubricId',
  'taskKind',
] as const;
const METRIC_KEYS = ['afterValue', 'beforeValue', 'direction', 'name', 'unit'] as const;
const QUALITY_KEYS = [
  'afterEvidenceCount',
  'afterPassed',
  'afterScore',
  'beforeEvidenceCount',
  'beforePassed',
  'beforeScore',
] as const;
const EVIDENCE_KEYS = [
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

function isEpochMs(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isScore(value: unknown): value is number {
  return isFiniteNonNegative(value) && value <= 1;
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function parseOpaqueFlags(value: unknown): string[] | undefined {
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

function parseFeedback(value: unknown): PersistedAdviceFeedback | undefined {
  if (!isObject(value) || !hasExactKeys(value, FEEDBACK_KEYS)) return undefined;
  if (
    typeof value.adviceId !== 'string' ||
    typeof value.recommendationId !== 'string' ||
    !isAdviceIdentifier(value.adviceId) ||
    !isAdviceIdentifier(value.recommendationId) ||
    !oneOf(value.rating, ['unrated', 'helpful', 'not-helpful'] as const) ||
    !oneOf(value.applied, ['not-applied', 'applied'] as const) ||
    !isEpochMs(value.updatedAtEpochMs)
  ) {
    return undefined;
  }
  return {
    adviceId: value.adviceId,
    recommendationId: value.recommendationId,
    rating: value.rating,
    applied: value.applied,
    updatedAtEpochMs: value.updatedAtEpochMs,
  };
}

function parseComparablePair(value: unknown): StoredComparablePair | undefined {
  if (!isObject(value) || !hasExactKeys(value, PAIR_KEYS)) return undefined;
  if (
    typeof value.pairId !== 'string' ||
    typeof value.adviceId !== 'string' ||
    typeof value.recommendationId !== 'string' ||
    !isAdviceIdentifier(value.pairId) ||
    !isAdviceIdentifier(value.adviceId) ||
    !isAdviceIdentifier(value.recommendationId) ||
    !isEpochMs(value.recordedAtEpochMs) ||
    !isObject(value.context) ||
    !hasExactKeys(value.context, CONTEXT_KEYS) ||
    !isObject(value.metric) ||
    !hasExactKeys(value.metric, METRIC_KEYS) ||
    !isObject(value.quality) ||
    !hasExactKeys(value.quality, QUALITY_KEYS) ||
    !isObject(value.evidence) ||
    !hasExactKeys(value.evidence, EVIDENCE_KEYS)
  ) {
    return undefined;
  }
  const context = value.context;
  const metric = value.metric;
  const quality = value.quality;
  const evidence = value.evidence;
  if (
    !oneOf(context.taskKind, ['small-change', 'feature', 'bug-fix', 'review', 'other'] as const) ||
    !oneOf(context.complexityBand, ['low', 'medium', 'high'] as const) ||
    !oneOf(context.provider, ['claude', 'codex'] as const) ||
    !oneOf(context.modelFamily, ['opus', 'sonnet', 'haiku', 'fable', 'other'] as const) ||
    !oneOf(context.effort, ['low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'unknown'] as const) ||
    typeof context.metricDefinitionVersion !== 'string' ||
    typeof context.qualityRubricId !== 'string' ||
    !isAdviceIdentifier(context.metricDefinitionVersion) ||
    !isAdviceIdentifier(context.qualityRubricId) ||
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
  const beforeQualityFlags = parseOpaqueFlags(evidence.beforeQualityFlags);
  const afterQualityFlags = parseOpaqueFlags(evidence.afterQualityFlags);
  if (!beforeQualityFlags || !afterQualityFlags) return undefined;
  return {
    pairId: value.pairId,
    adviceId: value.adviceId,
    recommendationId: value.recommendationId,
    context: {
      taskKind: context.taskKind,
      complexityBand: context.complexityBand,
      provider: context.provider,
      modelFamily: context.modelFamily,
      effort: context.effort,
      metricDefinitionVersion: context.metricDefinitionVersion,
      qualityRubricId: context.qualityRubricId,
    },
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

function parseCurrentState(value: unknown): AdviceLocalState | undefined {
  if (!isObject(value) || !hasExactKeys(value, STATE_KEYS)) return undefined;
  if (
    value.schemaVersion !== ADVICE_LOCAL_STATE_VERSION ||
    !oneOf(value.featureMode, ['disabled', 'enabled'] as const) ||
    !oneOf(value.aggregateConsent, ['not-granted', 'explicit'] as const) ||
    !oneOf(value.promptSampleConsent, ['not-granted', 'explicit'] as const) ||
    (value.promptSampleConsent === 'explicit' && value.aggregateConsent !== 'explicit') ||
    !Array.isArray(value.feedback) ||
    value.feedback.length > MAX_PERSISTED_ADVICE_FEEDBACK ||
    !Array.isArray(value.comparablePairs) ||
    value.comparablePairs.length > MAX_PERSISTED_COMPARABLE_PAIRS
  ) {
    return undefined;
  }
  const feedback: PersistedAdviceFeedback[] = [];
  const feedbackTargets = new Set<string>();
  for (const raw of value.feedback) {
    const item = parseFeedback(raw);
    if (!item) return undefined;
    const target = `${item.adviceId}\0${item.recommendationId}`;
    if (feedbackTargets.has(target)) return undefined;
    feedbackTargets.add(target);
    feedback.push(item);
  }
  const comparablePairs: StoredComparablePair[] = [];
  const pairIds = new Set<string>();
  for (const raw of value.comparablePairs) {
    const item = parseComparablePair(raw);
    if (!item || pairIds.has(item.pairId)) return undefined;
    pairIds.add(item.pairId);
    comparablePairs.push(item);
  }
  return {
    schemaVersion: ADVICE_LOCAL_STATE_VERSION,
    featureMode: value.featureMode,
    aggregateConsent: value.aggregateConsent,
    promptSampleConsent: value.promptSampleConsent,
    feedback,
    comparablePairs,
  };
}

interface LegacyFeedbackV1 {
  adviceId: string;
  recommendationId: string;
  rating: PersistedAdviceRating;
  applied: boolean;
  updatedAtEpochMs: number;
}

function migrateV1(value: Record<string, unknown>): AdviceLocalState | undefined {
  if (!hasExactKeys(value, ['enabled', 'feedback', 'includePromptSamples', 'schemaVersion'])) {
    return undefined;
  }
  if (
    value.schemaVersion !== 1 ||
    typeof value.enabled !== 'boolean' ||
    typeof value.includePromptSamples !== 'boolean' ||
    !Array.isArray(value.feedback) ||
    value.feedback.length > MAX_PERSISTED_ADVICE_FEEDBACK
  ) {
    return undefined;
  }
  const feedback: PersistedAdviceFeedback[] = [];
  const targets = new Set<string>();
  for (const raw of value.feedback) {
    if (
      !isObject(raw) ||
      !hasExactKeys(raw, ['adviceId', 'applied', 'rating', 'recommendationId', 'updatedAtEpochMs']) ||
      typeof raw.adviceId !== 'string' ||
      typeof raw.recommendationId !== 'string' ||
      !isAdviceIdentifier(raw.adviceId) ||
      !isAdviceIdentifier(raw.recommendationId) ||
      !oneOf(raw.rating, ['unrated', 'helpful', 'not-helpful'] as const) ||
      typeof raw.applied !== 'boolean' ||
      !isEpochMs(raw.updatedAtEpochMs)
    ) {
      return undefined;
    }
    const legacy: LegacyFeedbackV1 = {
      adviceId: raw.adviceId,
      recommendationId: raw.recommendationId,
      rating: raw.rating,
      applied: raw.applied,
      updatedAtEpochMs: raw.updatedAtEpochMs,
    };
    const target = `${legacy.adviceId}\0${legacy.recommendationId}`;
    if (targets.has(target)) return undefined;
    targets.add(target);
    feedback.push({
      adviceId: legacy.adviceId,
      recommendationId: legacy.recommendationId,
      rating: legacy.rating,
      applied: legacy.applied ? 'applied' : 'not-applied',
      updatedAtEpochMs: legacy.updatedAtEpochMs,
    });
  }
  // Old booleans did not encode the new separate consent, so both close.
  return {
    schemaVersion: ADVICE_LOCAL_STATE_VERSION,
    featureMode: 'disabled',
    aggregateConsent: 'not-granted',
    promptSampleConsent: 'not-granted',
    feedback,
    comparablePairs: [],
  };
}

export function createClosedAdviceLocalState(): AdviceLocalState {
  return {
    schemaVersion: ADVICE_LOCAL_STATE_VERSION,
    featureMode: 'disabled',
    aggregateConsent: 'not-granted',
    promptSampleConsent: 'not-granted',
    feedback: [],
    comparablePairs: [],
  };
}

/** Load/migrate without ever overwriting unknown or corrupt future data. */
export async function loadAndMigrateAdviceLocalState(
  storage: AdviceLocalStateStorage,
): Promise<AdviceLocalStateLoadResult> {
  const closed = createClosedAdviceLocalState();
  let raw: unknown;
  try {
    raw = storage.get<unknown>(ADVICE_LOCAL_STATE_KEY);
  } catch {
    return { ok: false, reason: 'storage-error', value: closed };
  }
  if (raw === undefined) return { ok: true, migrated: false, value: closed };
  const current = parseCurrentState(raw);
  if (current) return { ok: true, migrated: false, value: current };
  if (!isObject(raw) || raw.schemaVersion !== 1) {
    return { ok: false, reason: 'invalid-local-data', value: closed };
  }
  const migrated = migrateV1(raw);
  if (!migrated) return { ok: false, reason: 'invalid-local-data', value: closed };
  try {
    await storage.update(ADVICE_LOCAL_STATE_KEY, migrated);
  } catch {
    return { ok: false, reason: 'storage-error', value: closed };
  }
  return { ok: true, migrated: true, value: migrated };
}

export async function saveAdviceLocalState(
  storage: AdviceLocalStateStorage,
  value: unknown,
): Promise<AdviceLocalStateWriteResult> {
  const parsed = parseCurrentState(value);
  if (!parsed) return { ok: false, reason: 'invalid-local-data' };
  try {
    await storage.update(ADVICE_LOCAL_STATE_KEY, parsed);
  } catch {
    return { ok: false, reason: 'storage-error' };
  }
  return { ok: true, value: parsed };
}

export function upsertAdviceLocalFeedback(
  state: AdviceLocalState,
  input: {
    adviceId: string;
    recommendationId: string;
    kind: AdviceFeedbackMutationKind;
    updatedAtEpochMs: number;
  },
): AdviceLocalStateMutationResult {
  const current = parseCurrentState(state);
  if (!current) return { ok: false, reason: 'invalid-local-data' };
  if (
    !isObject(input) ||
    !hasExactKeys(input, ['adviceId', 'kind', 'recommendationId', 'updatedAtEpochMs']) ||
    !isAdviceIdentifier(input.adviceId) ||
    !isAdviceIdentifier(input.recommendationId) ||
    !oneOf(input.kind, ['helpful', 'not-helpful', 'applied'] as const) ||
    !isEpochMs(input.updatedAtEpochMs)
  ) {
    return { ok: false, reason: 'invalid-input' };
  }
  const existing = current.feedback.find(
    (item) => item.adviceId === input.adviceId && item.recommendationId === input.recommendationId,
  );
  const next: PersistedAdviceFeedback = {
    adviceId: input.adviceId,
    recommendationId: input.recommendationId,
    rating: input.kind === 'applied' ? existing?.rating ?? 'unrated' : input.kind,
    applied: input.kind === 'applied' ? 'applied' : existing?.applied ?? 'not-applied',
    updatedAtEpochMs: input.updatedAtEpochMs,
  };
  const feedback = current.feedback
    .filter(
      (item) => item.adviceId !== input.adviceId || item.recommendationId !== input.recommendationId,
    )
    .concat(next)
    .slice(-MAX_PERSISTED_ADVICE_FEEDBACK);
  return { ok: true, value: { ...current, feedback } };
}

export function appendStoredComparablePair(
  state: AdviceLocalState,
  input: unknown,
): AdviceLocalStateMutationResult {
  const current = parseCurrentState(state);
  if (!current) return { ok: false, reason: 'invalid-local-data' };
  const pair = parseComparablePair(input);
  if (!pair || current.comparablePairs.some((item) => item.pairId === pair.pairId)) {
    return { ok: false, reason: 'invalid-input' };
  }
  return {
    ok: true,
    value: {
      ...current,
      comparablePairs: current.comparablePairs
        .concat(pair)
        .slice(-MAX_PERSISTED_COMPARABLE_PAIRS),
    },
  };
}

export interface AdviceRecommendationLineage {
  provider: 'claude' | 'codex';
  recommendationId: string;
}

/**
 * Select a stable recommendation lineage across advice instances. adviceId is
 * deliberately retained on every pair as an audit field, but is not part of
 * lineage identity because advice instances rotate with their observation day.
 * The downstream comparator remains responsible for rejecting mixed task,
 * model, effort, metric-version, rubric, or primary-metric cohorts.
 */
export function selectStoredComparablePairLineage(
  pairs: readonly StoredComparablePair[],
  lineage: AdviceRecommendationLineage,
): StoredComparablePair[] {
  if (
    (lineage.provider !== 'claude' && lineage.provider !== 'codex') ||
    !isAdviceIdentifier(lineage.recommendationId)
  ) {
    return [];
  }
  return pairs.filter(
    (pair) =>
      pair.context.provider === lineage.provider &&
      pair.recommendationId === lineage.recommendationId,
  );
}

/** Convert only state that has already passed the exact persistence parser. */
export function toComparableTaskPairs(
  pairs: readonly StoredComparablePair[],
): ComparableTaskPair[] {
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
    const outcome = (
      period: 'before' | 'after',
    ): ComparableTaskPair['before'] => ({
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
          period === 'before'
            ? pair.quality.beforeEvidenceCount
            : pair.quality.afterEvidenceCount,
      },
      evidence: {
        coverage:
          period === 'before'
            ? pair.evidence.beforeCoverage
            : pair.evidence.afterCoverage,
        confidence:
          period === 'before'
            ? pair.evidence.beforeConfidence
            : pair.evidence.afterConfidence,
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
