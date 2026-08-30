import { isAdviceIdentifier } from './contract';
import {
  StoredComparablePair,
  parseStoredComparablePair,
  toComparableTaskPairs,
} from './comparisonPairing';
import {
  AdviceComparisonResultEnvelope,
  parseAdviceComparisonResultEnvelope,
} from './comparisonResult';

export type {
  StoredAdviceScope,
  StoredComparableContext,
  StoredComparablePair,
  StoredComplexityBand,
  StoredConfidence,
  StoredCoverage,
  StoredEffort,
  StoredMetricDirection,
  StoredMetricUnit,
  StoredModelFamily,
  StoredProvider,
  StoredQualityPass,
  StoredTaskKind,
} from './comparisonPairing';
export { toComparableTaskPairs } from './comparisonPairing';

/** Stable key: schema versions migrate in-place instead of changing the key. */
export const ADVICE_LOCAL_STATE_KEY = 'ccu.adviceEffectiveness.localState';
export const ADVICE_LOCAL_STATE_VERSION = 3 as const;
export const MAX_PERSISTED_ADVICE_FEEDBACK = 500;
export const MAX_PERSISTED_COMPARABLE_PAIRS = 200;
export const MAX_PERSISTED_ADVICE_COMPARISON_RESULTS = 200;
export const ADVICE_SNOOZE_DURATION_MS = 7 * 24 * 60 * 60 * 1_000;
export const MAX_ADVICE_SNOOZE_DURATION_MS = 30 * 24 * 60 * 60 * 1_000;

export type AdviceFeatureMode = 'disabled' | 'enabled';
export type AdviceConsentState = 'not-granted' | 'explicit';
export type PersistedAdviceRating = 'unrated' | 'helpful' | 'not-helpful';
export type PersistedAdviceApplied = 'not-applied' | 'applied';
export type AdviceFeedbackMutationKind = 'helpful' | 'not-helpful' | 'applied';

/** A separate, bounded suppression record; it never changes the feedback rating. */
export interface PersistedAdviceSuppression {
  adviceId: string;
  recommendationId: string;
  snoozedUntilEpochMs: number;
  updatedAtEpochMs: number;
}

export interface PersistedAdviceFeedback {
  adviceId: string;
  recommendationId: string;
  rating: PersistedAdviceRating;
  applied: PersistedAdviceApplied;
  /** Stable intervention boundary; later rating changes never move it. */
  appliedAtEpochMs: number | null;
  updatedAtEpochMs: number;
}

export interface AdviceLocalState {
  schemaVersion: typeof ADVICE_LOCAL_STATE_VERSION;
  featureMode: AdviceFeatureMode;
  aggregateConsent: AdviceConsentState;
  promptSampleConsent: AdviceConsentState;
  feedback: PersistedAdviceFeedback[];
  suppression: PersistedAdviceSuppression[];
  comparablePairs: StoredComparablePair[];
  comparisonResults: AdviceComparisonResultEnvelope[];
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
  'comparisonResults',
  'featureMode',
  'feedback',
  'promptSampleConsent',
  'suppression',
  'schemaVersion',
] as const;
const LEGACY_V2_STATE_KEYS = [
  'aggregateConsent',
  'comparablePairs',
  'featureMode',
  'feedback',
  'promptSampleConsent',
  'schemaVersion',
] as const;
const LEGACY_V2_COMPLETE_STATE_KEYS = [
  'aggregateConsent',
  'comparablePairs',
  'comparisonResults',
  'featureMode',
  'feedback',
  'promptSampleConsent',
  'schemaVersion',
] as const;
const FEEDBACK_KEYS = [
  'adviceId',
  'applied',
  'appliedAtEpochMs',
  'rating',
  'recommendationId',
  'updatedAtEpochMs',
] as const;
const LEGACY_FEEDBACK_KEYS = [
  'adviceId',
  'applied',
  'rating',
  'recommendationId',
  'updatedAtEpochMs',
] as const;
const SUPPRESSION_KEYS = [
  'adviceId',
  'recommendationId',
  'snoozedUntilEpochMs',
  'updatedAtEpochMs',
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

function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
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
    !(value.appliedAtEpochMs === null || isEpochMs(value.appliedAtEpochMs)) ||
    (value.applied === 'applied' && value.appliedAtEpochMs === null) ||
    (value.applied === 'not-applied' && value.appliedAtEpochMs !== null) ||
    !isEpochMs(value.updatedAtEpochMs)
  ) {
    return undefined;
  }
  return {
    adviceId: value.adviceId,
    recommendationId: value.recommendationId,
    rating: value.rating,
    applied: value.applied,
    appliedAtEpochMs: value.appliedAtEpochMs,
    updatedAtEpochMs: value.updatedAtEpochMs,
  };
}

function parseSuppression(value: unknown): PersistedAdviceSuppression | undefined {
  if (!isObject(value) || !hasExactKeys(value, SUPPRESSION_KEYS)) return undefined;
  if (
    typeof value.adviceId !== 'string' ||
    typeof value.recommendationId !== 'string' ||
    !isAdviceIdentifier(value.adviceId) ||
    !isAdviceIdentifier(value.recommendationId) ||
    !isEpochMs(value.snoozedUntilEpochMs) ||
    !isEpochMs(value.updatedAtEpochMs) ||
    value.snoozedUntilEpochMs <= value.updatedAtEpochMs
  ) return undefined;
  return {
    adviceId: value.adviceId,
    recommendationId: value.recommendationId,
    snoozedUntilEpochMs: value.snoozedUntilEpochMs,
    updatedAtEpochMs: value.updatedAtEpochMs,
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
    !Array.isArray(value.suppression) ||
    value.suppression.length > MAX_PERSISTED_ADVICE_FEEDBACK ||
    !Array.isArray(value.comparablePairs) ||
    value.comparablePairs.length > MAX_PERSISTED_COMPARABLE_PAIRS ||
    !Array.isArray(value.comparisonResults) ||
    value.comparisonResults.length > MAX_PERSISTED_ADVICE_COMPARISON_RESULTS
  ) {
    return undefined;
  }
  const suppression: PersistedAdviceSuppression[] = [];
  const suppressionTargets = new Set<string>();
  for (const raw of value.suppression) {
    const item = parseSuppression(raw);
    if (!item) return undefined;
    const target = `${item.adviceId}\0${item.recommendationId}`;
    if (suppressionTargets.has(target)) return undefined;
    suppressionTargets.add(target);
    suppression.push(item);
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
    const item = parseStoredComparablePair(raw);
    if (!item || pairIds.has(item.pairId)) return undefined;
    pairIds.add(item.pairId);
    comparablePairs.push(item);
  }
  const comparisonResults: AdviceComparisonResultEnvelope[] = [];
  const comparisonIds = new Set<string>();
  for (const raw of value.comparisonResults) {
    const item = parseAdviceComparisonResultEnvelope(raw);
    if (!item || comparisonIds.has(item.comparisonId)) return undefined;
    comparisonIds.add(item.comparisonId);
    comparisonResults.push(item);
  }
  return {
    schemaVersion: ADVICE_LOCAL_STATE_VERSION,
    featureMode: value.featureMode,
    aggregateConsent: value.aggregateConsent,
    promptSampleConsent: value.promptSampleConsent,
    feedback,
    suppression,
    comparablePairs,
    comparisonResults,
  };
}

function migrateLegacyV2(value: Record<string, unknown>): AdviceLocalState | undefined {
  const oldRoot = hasExactKeys(value, LEGACY_V2_STATE_KEYS);
  const completeRoot = hasExactKeys(value, LEGACY_V2_COMPLETE_STATE_KEYS);
  if (
    (!oldRoot && !completeRoot) ||
    value.schemaVersion !== 2 ||
    !Array.isArray(value.feedback) ||
    (oldRoot && (!Array.isArray(value.comparablePairs) || value.comparablePairs.length !== 0))
  ) {
    return undefined;
  }
  const feedback: PersistedAdviceFeedback[] = [];
  for (const raw of value.feedback) {
    if (!isObject(raw) || !hasExactKeys(raw, LEGACY_FEEDBACK_KEYS)) return undefined;
    const parsed = parseFeedback({
      ...raw,
      appliedAtEpochMs: raw.applied === 'applied' ? raw.updatedAtEpochMs : null,
    });
    if (!parsed) return undefined;
    feedback.push(parsed);
  }
  return parseCurrentState({
    ...value,
    schemaVersion: ADVICE_LOCAL_STATE_VERSION,
    feedback,
    suppression: [],
    comparisonResults: completeRoot ? value.comparisonResults : [],
  });
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
      appliedAtEpochMs: legacy.applied ? legacy.updatedAtEpochMs : null,
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
    suppression: [],
    comparablePairs: [],
    comparisonResults: [],
  };
}

export function createClosedAdviceLocalState(): AdviceLocalState {
  return {
    schemaVersion: ADVICE_LOCAL_STATE_VERSION,
    featureMode: 'disabled',
    aggregateConsent: 'not-granted',
    promptSampleConsent: 'not-granted',
    feedback: [],
    suppression: [],
    comparablePairs: [],
    comparisonResults: [],
  };
}

/** User-visible privacy reset: keep the enabled surface, close consent, and erase its local ledger. */
export function createClearedAdviceLocalState(): AdviceLocalState {
  return {
    ...createClosedAdviceLocalState(),
    featureMode: 'enabled',
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
  if (!isObject(raw)) {
    return { ok: false, reason: 'invalid-local-data', value: closed };
  }
  const migrated = raw.schemaVersion === 2
    ? migrateLegacyV2(raw)
    : raw.schemaVersion === 1
      ? migrateV1(raw)
      : undefined;
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
  let rating = existing?.rating ?? 'unrated';
  let applied = existing?.applied ?? 'not-applied';
  let appliedAtEpochMs = existing?.appliedAtEpochMs ?? null;
  if (input.kind === 'helpful') {
    rating = rating === 'helpful' ? 'unrated' : 'helpful';
  } else if (input.kind === 'not-helpful') {
    rating = rating === 'not-helpful' ? 'unrated' : 'not-helpful';
  } else if (applied === 'applied') {
    applied = 'not-applied';
    appliedAtEpochMs = null;
  } else {
    applied = 'applied';
    appliedAtEpochMs = input.updatedAtEpochMs;
  }
  const next: PersistedAdviceFeedback = {
    adviceId: input.adviceId,
    recommendationId: input.recommendationId,
    rating,
    applied,
    appliedAtEpochMs,
    updatedAtEpochMs: input.updatedAtEpochMs,
  };
  const withoutTarget = current.feedback.filter(
    (item) => item.adviceId !== input.adviceId || item.recommendationId !== input.recommendationId,
  );
  const feedback = (rating === 'unrated' && applied === 'not-applied'
    ? withoutTarget
    : withoutTarget.concat(next))
    .slice(-MAX_PERSISTED_ADVICE_FEEDBACK);
  return { ok: true, value: { ...current, feedback } };
}

export function snoozeAdviceRecommendation(
  state: AdviceLocalState,
  input: {
    adviceId: string;
    recommendationId: string;
    snoozedUntilEpochMs: number;
    updatedAtEpochMs: number;
  },
): AdviceLocalStateMutationResult {
  const current = parseCurrentState(state);
  if (!current) return { ok: false, reason: 'invalid-local-data' };
  if (
    !isObject(input) ||
    !hasExactKeys(input, [
      'adviceId',
      'recommendationId',
      'snoozedUntilEpochMs',
      'updatedAtEpochMs',
    ]) ||
    !isAdviceIdentifier(input.adviceId) ||
    !isAdviceIdentifier(input.recommendationId) ||
    !isEpochMs(input.snoozedUntilEpochMs) ||
    !isEpochMs(input.updatedAtEpochMs) ||
    input.snoozedUntilEpochMs <= input.updatedAtEpochMs ||
    input.snoozedUntilEpochMs - input.updatedAtEpochMs > MAX_ADVICE_SNOOZE_DURATION_MS
  ) return { ok: false, reason: 'invalid-input' };
  const suppression = current.suppression
    .filter(
      (item) =>
        item.snoozedUntilEpochMs > input.updatedAtEpochMs &&
        (item.adviceId !== input.adviceId || item.recommendationId !== input.recommendationId),
    )
    .concat({
      adviceId: input.adviceId,
      recommendationId: input.recommendationId,
      snoozedUntilEpochMs: input.snoozedUntilEpochMs,
      updatedAtEpochMs: input.updatedAtEpochMs,
    })
    .slice(-MAX_PERSISTED_ADVICE_FEEDBACK);
  return { ok: true, value: { ...current, suppression } };
}

export function resumeAdviceRecommendation(
  state: AdviceLocalState,
  input: { adviceId: string; recommendationId: string },
): AdviceLocalStateMutationResult {
  const current = parseCurrentState(state);
  if (!current) return { ok: false, reason: 'invalid-local-data' };
  if (
    !isObject(input) ||
    !hasExactKeys(input, ['adviceId', 'recommendationId']) ||
    !isAdviceIdentifier(input.adviceId) ||
    !isAdviceIdentifier(input.recommendationId)
  ) return { ok: false, reason: 'invalid-input' };
  return {
    ok: true,
    value: {
      ...current,
      suppression: current.suppression.filter(
        (item) =>
          item.adviceId !== input.adviceId || item.recommendationId !== input.recommendationId,
      ),
    },
  };
}

export function adviceRecommendationSnoozedUntil(
  state: AdviceLocalState,
  input: { adviceId: string; recommendationId: string; nowEpochMs: number },
): number | null {
  if (!parseCurrentState(state) || !isEpochMs(input.nowEpochMs)) return null;
  const record = state.suppression.find(
    (item) =>
      item.adviceId === input.adviceId &&
      item.recommendationId === input.recommendationId &&
      item.snoozedUntilEpochMs > input.nowEpochMs,
  );
  return record?.snoozedUntilEpochMs ?? null;
}

export function appendStoredComparablePair(
  state: AdviceLocalState,
  input: unknown,
): AdviceLocalStateMutationResult {
  const current = parseCurrentState(state);
  if (!current) return { ok: false, reason: 'invalid-local-data' };
  const pair = parseStoredComparablePair(input);
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

export function appendAdviceComparisonResult(
  state: AdviceLocalState,
  input: unknown,
): AdviceLocalStateMutationResult {
  const current = parseCurrentState(state);
  if (!current) return { ok: false, reason: 'invalid-local-data' };
  const result = parseAdviceComparisonResultEnvelope(input);
  if (
    !result ||
    current.comparisonResults.some((item) => item.comparisonId === result.comparisonId)
  ) {
    return { ok: false, reason: 'invalid-input' };
  }
  return {
    ok: true,
    value: {
      ...current,
      comparisonResults: current.comparisonResults
        .concat(result)
        .slice(-MAX_PERSISTED_ADVICE_COMPARISON_RESULTS),
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
