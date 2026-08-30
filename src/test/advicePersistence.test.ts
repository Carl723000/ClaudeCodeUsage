import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { compareAdviceEffectiveness } from '../adviceEffectiveness/comparison';

import {
  ADVICE_LOCAL_STATE_KEY,
  ADVICE_LOCAL_STATE_VERSION,
  ADVICE_SNOOZE_DURATION_MS,
  MAX_PERSISTED_ADVICE_COMPARISON_RESULTS,
  AdviceLocalStateStorage,
  StoredComparablePair,
  appendAdviceComparisonResult,
  appendStoredComparablePair,
  adviceRecommendationSnoozedUntil,
  createClearedAdviceLocalState,
  createClosedAdviceLocalState,
  loadAndMigrateAdviceLocalState,
  saveAdviceLocalState,
  snoozeAdviceRecommendation,
  resumeAdviceRecommendation,
  selectStoredComparablePairLineage,
  toComparableTaskPairs,
  upsertAdviceLocalFeedback,
} from '../adviceEffectiveness/versionedPersistence';
import {
  AdviceComparisonResultEnvelope,
  buildAdviceComparisonResultEnvelope,
} from '../adviceEffectiveness/comparisonResult';

class MemoryStorage implements AdviceLocalStateStorage {
  value: unknown;
  updates: unknown[] = [];
  failUpdate = false;

  get<T>(key: string): T | undefined {
    assert.equal(key, ADVICE_LOCAL_STATE_KEY);
    return this.value as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    assert.equal(key, ADVICE_LOCAL_STATE_KEY);
    if (this.failUpdate) throw new Error('PRIVATE_STORAGE_FAILURE');
    this.value = value;
    this.updates.push(value);
  }
}

test('missing local state defaults to a closed, non-consenting state without writing', async () => {
  const storage = new MemoryStorage();
  const result = await loadAndMigrateAdviceLocalState(storage);
  assert.deepEqual(result, {
    ok: true,
    migrated: false,
    value: createClosedAdviceLocalState(),
  });
  assert.equal(storage.updates.length, 0);
});

test('user privacy reset keeps the surface enabled while erasing consent and every local result', () => {
  assert.deepEqual(createClearedAdviceLocalState(), {
    ...createClosedAdviceLocalState(),
    featureMode: 'enabled',
  });
});

test('v1 migration preserves validated local feedback but conservatively closes feature and consent', async () => {
  const storage = new MemoryStorage();
  storage.value = {
    schemaVersion: 1,
    enabled: true,
    includePromptSamples: true,
    feedback: [
      {
        adviceId: 'advice-1',
        recommendationId: 'recommendation-1',
        rating: 'helpful',
        applied: true,
        updatedAtEpochMs: 1_777_000_000_000,
      },
    ],
  };

  const result = await loadAndMigrateAdviceLocalState(storage);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.migrated, true);
  assert.equal(result.value.schemaVersion, ADVICE_LOCAL_STATE_VERSION);
  assert.equal(result.value.featureMode, 'disabled');
  assert.equal(result.value.aggregateConsent, 'not-granted');
  assert.equal(result.value.promptSampleConsent, 'not-granted');
  assert.deepEqual(result.value.comparisonResults, []);
  assert.deepEqual(result.value.suppression, []);
  assert.deepEqual(result.value.feedback, [
    {
      adviceId: 'advice-1',
      recommendationId: 'recommendation-1',
      rating: 'helpful',
      applied: 'applied',
      appliedAtEpochMs: 1_777_000_000_000,
      updatedAtEpochMs: 1_777_000_000_000,
    },
  ]);
  assert.deepEqual(storage.updates, [result.value]);
});

test('v2 migration preserves feedback, application time, pairs, and results while adding empty suppression', async () => {
  const storage = new MemoryStorage();
  const legacy = {
    schemaVersion: 2,
    featureMode: 'disabled',
    aggregateConsent: 'not-granted',
    promptSampleConsent: 'not-granted',
    feedback: [{
      adviceId: 'advice-1',
      recommendationId: 'recommendation-1',
      rating: 'not-helpful',
      applied: 'applied',
      updatedAtEpochMs: 1_777_000_000_001,
    }],
    comparablePairs: [],
    comparisonResults: [],
  } as Record<string, unknown>;
  storage.value = legacy;

  const result = await loadAndMigrateAdviceLocalState(storage);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.migrated, true);
  assert.equal(result.value.schemaVersion, ADVICE_LOCAL_STATE_VERSION);
  assert.deepEqual(result.value.feedback, [{
    adviceId: 'advice-1',
    recommendationId: 'recommendation-1',
    rating: 'not-helpful',
    applied: 'applied',
    appliedAtEpochMs: 1_777_000_000_001,
    updatedAtEpochMs: 1_777_000_000_001,
  }]);
  assert.deepEqual(result.value.suppression, []);
});

test('unknown, corrupt, or identifying local data fails closed and is never overwritten', async () => {
  for (const value of [
    { schemaVersion: 99, prompt: 'PRIVATE_PROMPT' },
    {
      schemaVersion: ADVICE_LOCAL_STATE_VERSION,
      featureMode: 'enabled',
      aggregateConsent: 'explicit',
      promptSampleConsent: 'explicit',
      feedback: [],
      comparablePairs: [],
      projectPath: '/Users/private/project',
    },
  ]) {
    const storage = new MemoryStorage();
    storage.value = value;
    const result = await loadAndMigrateAdviceLocalState(storage);
    assert.equal(result.ok, false);
    assert.deepEqual(result.value, createClosedAdviceLocalState());
    assert.equal(storage.updates.length, 0);
  }
});

test('current local state rejects prompt consent without aggregate consent', async () => {
  const inconsistent = {
    ...createClosedAdviceLocalState(),
    featureMode: 'enabled' as const,
    aggregateConsent: 'not-granted' as const,
    promptSampleConsent: 'explicit' as const,
  };
  const storage = new MemoryStorage();
  storage.value = inconsistent;

  const loaded = await loadAndMigrateAdviceLocalState(storage);
  assert.deepEqual(loaded, {
    ok: false,
    reason: 'invalid-local-data',
    value: createClosedAdviceLocalState(),
  });
  assert.equal(storage.updates.length, 0);

  const saved = await saveAdviceLocalState(storage, inconsistent);
  assert.deepEqual(saved, { ok: false, reason: 'invalid-local-data' });
  assert.equal(storage.updates.length, 0);
});

test('migration write failure returns a closed state without exposing the storage error', async () => {
  const storage = new MemoryStorage();
  storage.value = {
    schemaVersion: 1,
    enabled: false,
    includePromptSamples: false,
    feedback: [],
  };
  storage.failUpdate = true;
  const result = await loadAndMigrateAdviceLocalState(storage);
  assert.deepEqual(result, {
    ok: false,
    reason: 'storage-error',
    value: createClosedAdviceLocalState(),
  });
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_STORAGE_FAILURE/);
});

test('save accepts only the exact enum, numeric, and opaque-id state shape', async () => {
  const storage = new MemoryStorage();
  const state = createClosedAdviceLocalState();
  state.featureMode = 'enabled';
  state.aggregateConsent = 'explicit';
  state.feedback.push({
    adviceId: 'advice-1',
    recommendationId: 'recommendation-1',
    rating: 'not-helpful',
    applied: 'not-applied',
    appliedAtEpochMs: null,
    updatedAtEpochMs: 1_777_000_000_000,
  });
  const saved = await saveAdviceLocalState(storage, state);
  assert.deepEqual(saved, { ok: true, value: state });

  const hostile = { ...state, sessionId: 'PRIVATE_SESSION' };
  const rejected = await saveAdviceLocalState(storage, hostile);
  assert.equal(rejected.ok, false);
  assert.equal(storage.updates.length, 1);
});

test('feedback upsert keeps rating mutually exclusive while applied remains independent', () => {
  const initial = createClosedAdviceLocalState();
  const helpful = upsertAdviceLocalFeedback(initial, {
    adviceId: 'advice-1',
    recommendationId: 'recommendation-1',
    kind: 'helpful',
    updatedAtEpochMs: 1_777_000_000_001,
  });
  assert.equal(helpful.ok, true);
  if (!helpful.ok) return;
  const applied = upsertAdviceLocalFeedback(helpful.value, {
    adviceId: 'advice-1',
    recommendationId: 'recommendation-1',
    kind: 'applied',
    updatedAtEpochMs: 1_777_000_000_002,
  });
  assert.equal(applied.ok, true);
  if (!applied.ok) return;
  const notHelpful = upsertAdviceLocalFeedback(applied.value, {
    adviceId: 'advice-1',
    recommendationId: 'recommendation-1',
    kind: 'not-helpful',
    updatedAtEpochMs: 1_777_000_000_003,
  });
  assert.equal(notHelpful.ok, true);
  if (!notHelpful.ok) return;
  assert.deepEqual(notHelpful.value.feedback, [
    {
      adviceId: 'advice-1',
      recommendationId: 'recommendation-1',
      rating: 'not-helpful',
      applied: 'applied',
      appliedAtEpochMs: 1_777_000_000_002,
      updatedAtEpochMs: 1_777_000_000_003,
    },
  ]);

  const ratingRetracted = upsertAdviceLocalFeedback(notHelpful.value, {
    adviceId: 'advice-1',
    recommendationId: 'recommendation-1',
    kind: 'not-helpful',
    updatedAtEpochMs: 1_777_000_000_004,
  });
  assert.equal(ratingRetracted.ok, true);
  if (!ratingRetracted.ok) return;
  assert.equal(ratingRetracted.value.feedback[0].rating, 'unrated');
  assert.equal(ratingRetracted.value.feedback[0].applied, 'applied');

  const applicationRetracted = upsertAdviceLocalFeedback(ratingRetracted.value, {
    adviceId: 'advice-1',
    recommendationId: 'recommendation-1',
    kind: 'applied',
    updatedAtEpochMs: 1_777_000_000_005,
  });
  assert.equal(applicationRetracted.ok, true);
  if (!applicationRetracted.ok) return;
  assert.deepEqual(applicationRetracted.value.feedback, []);
});

test('explicit snooze is bounded, expires, resumes, and never overwrites feedback', () => {
  const now = 1_777_000_000_000;
  const rated = upsertAdviceLocalFeedback(createClosedAdviceLocalState(), {
    adviceId: 'advice-1',
    recommendationId: 'recommendation-1',
    kind: 'helpful',
    updatedAtEpochMs: now,
  });
  assert.equal(rated.ok, true);
  if (!rated.ok) return;
  const snoozed = snoozeAdviceRecommendation(rated.value, {
    adviceId: 'advice-1',
    recommendationId: 'recommendation-1',
    updatedAtEpochMs: now + 1,
    snoozedUntilEpochMs: now + 1 + ADVICE_SNOOZE_DURATION_MS,
  });
  assert.equal(snoozed.ok, true);
  if (!snoozed.ok) return;
  assert.equal(snoozed.value.feedback[0].rating, 'helpful');
  assert.equal(
    adviceRecommendationSnoozedUntil(snoozed.value, {
      adviceId: 'advice-1',
      recommendationId: 'recommendation-1',
      nowEpochMs: now + 2,
    }),
    now + 1 + ADVICE_SNOOZE_DURATION_MS,
  );
  assert.equal(
    adviceRecommendationSnoozedUntil(snoozed.value, {
      adviceId: 'advice-1',
      recommendationId: 'recommendation-1',
      nowEpochMs: now + 1 + ADVICE_SNOOZE_DURATION_MS,
    }),
    null,
  );
  assert.equal(
    adviceRecommendationSnoozedUntil(snoozed.value, {
      adviceId: 'advice-2',
      recommendationId: 'recommendation-1',
      nowEpochMs: now + 2,
    }),
    null,
    'a new evidence/advice revision must reappear immediately',
  );
  const resumed = resumeAdviceRecommendation(snoozed.value, {
    adviceId: 'advice-1',
    recommendationId: 'recommendation-1',
  });
  assert.equal(resumed.ok, true);
  if (!resumed.ok) return;
  assert.deepEqual(resumed.value.suppression, []);
  assert.equal(resumed.value.feedback[0].rating, 'helpful');
});

test('suppression rejects unbounded duration and identifying payload fields', () => {
  const now = 1_777_000_000_000;
  const state = createClosedAdviceLocalState();
  const tooLong = snoozeAdviceRecommendation(state, {
    adviceId: 'advice-1',
    recommendationId: 'recommendation-1',
    updatedAtEpochMs: now,
    snoozedUntilEpochMs: now + 31 * 24 * 60 * 60 * 1_000,
  });
  assert.deepEqual(tooLong, { ok: false, reason: 'invalid-input' });
  const rawPayload = snoozeAdviceRecommendation(state, {
    adviceId: 'advice-1',
    recommendationId: 'recommendation-1',
    updatedAtEpochMs: now,
    snoozedUntilEpochMs: now + ADVICE_SNOOZE_DURATION_MS,
    prompt: 'PRIVATE_PROMPT',
  } as never);
  assert.deepEqual(rawPayload, { ok: false, reason: 'invalid-input' });
});

function comparablePair(): StoredComparablePair {
  return {
    pairId: 'pair-1',
    adviceId: 'advice-1',
    recommendationId: 'recommendation-1',
    recommendationVersion: 'recommendation-v1',
    context: {
      scope: 'task-cohort',
      taskKind: 'small-change',
      complexityBand: 'low',
      provider: 'codex',
      modelFamily: 'other',
      effort: 'high',
      measurementProfileVersion: 'codex-aggregate-v1',
      metricDefinitionVersion: 'fresh-tokens-v1',
      qualityRubricId: 'task-quality-rubric-v1',
    },
    metric: {
      name: 'fresh-tokens',
      unit: 'tokens',
      direction: 'lower-is-better',
      beforeValue: 1_000,
      afterValue: 800,
    },
    quality: {
      beforeScore: 0.9,
      afterScore: 0.91,
      beforePassed: 'passed',
      afterPassed: 'passed',
      beforeEvidenceCount: 2,
      afterEvidenceCount: 2,
    },
    evidence: {
      beforeCoverage: 'complete',
      afterCoverage: 'complete',
      beforeConfidence: 'high',
      afterConfidence: 'high',
      beforeQualityFlags: [],
      afterQualityFlags: [],
    },
    recordedAtEpochMs: 1_777_000_000_000,
  };
}

function comparisonResult(recordedAtEpochMs: number): AdviceComparisonResultEnvelope {
  const pairs = Array.from({ length: 5 }, (_, index) => {
    const value = comparablePair();
    value.pairId = `pair-${recordedAtEpochMs}-${index}`;
    return value;
  });
  const result = buildAdviceComparisonResultEnvelope({
    provider: 'codex',
    recommendationId: 'recommendation-1',
    recommendationVersion: 'recommendation-v1',
    measurementProfileVersion: 'codex-aggregate-v1',
    cohort: {
      scope: 'task-cohort',
      taskKind: 'small-change',
      complexityBand: 'low',
      modelFamily: 'other',
      effort: 'high',
      metricDefinitionVersion: 'fresh-tokens-v1',
      qualityRubricId: 'task-quality-rubric-v1',
      metric: { name: 'fresh-tokens', unit: 'tokens', direction: 'lower-is-better' },
    },
    guardrail: {
      minComparablePairs: 5,
      minRelativeImprovement: 0.1,
      minAfterQualityScore: 0.8,
      maxMeanQualityRegression: 0.02,
      allowedQualityFlags: [],
      qualityRubricId: 'task-quality-rubric-v1',
    },
    pairs,
    recordedAtEpochMs,
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('comparison result fixture failed validation');
  return result.value;
}

test('comparable-pair persistence accepts only coarse enums, finite numbers, and opaque IDs', async () => {
  const state = createClosedAdviceLocalState();
  const appended = appendStoredComparablePair(state, comparablePair());
  assert.equal(appended.ok, true);
  if (!appended.ok) return;
  assert.equal(appended.value.comparablePairs.length, 1);
  const converted = toComparableTaskPairs(appended.value.comparablePairs);
  assert.equal(converted.length, 1);
  assert.equal(converted[0].before.primaryMetric.value, 1_000);
  assert.equal(converted[0].after.primaryMetric.value, 800);
  const storage = new MemoryStorage();
  storage.value = appended.value;
  const loaded = await loadAndMigrateAdviceLocalState(storage);
  assert.equal(loaded.ok, true);
  if (loaded.ok) assert.deepEqual(loaded.value.comparablePairs, [comparablePair()]);

  const hostile = {
    ...comparablePair(),
    sessionId: 'PRIVATE_SESSION',
  };
  const rejected = appendStoredComparablePair(state, hostile);
  assert.equal(rejected.ok, false);

  const nestedHostile = comparablePair() as StoredComparablePair & {
    context: StoredComparablePair['context'] & { projectPath: string };
  };
  nestedHostile.context.projectPath = '/Users/private/project';
  assert.equal(appendStoredComparablePair(state, nestedHostile).ok, false);

  const invalidNumber = comparablePair();
  invalidNumber.metric.afterValue = Number.NaN;
  assert.equal(appendStoredComparablePair(state, invalidNumber).ok, false);
});

test('comparison lineage spans rotating advice instances while preserving strict cohort checks', () => {
  const acrossDays = Array.from({ length: 5 }, (_, index) => {
    const pair = comparablePair();
    pair.pairId = `pair-day-${index + 1}`;
    pair.adviceId = `advice-codex-30d-day-${index + 1}`;
    return pair;
  });
  const otherRecommendation = comparablePair();
  otherRecommendation.pairId = 'pair-other-recommendation';
  otherRecommendation.recommendationId = 'recommendation-other';
  const otherProvider = comparablePair();
  otherProvider.pairId = 'pair-other-provider';
  otherProvider.context.provider = 'claude';

  const selected = selectStoredComparablePairLineage(
    [...acrossDays, otherRecommendation, otherProvider],
    { provider: 'codex', recommendationId: 'recommendation-1' },
  );
  assert.deepEqual(selected.map((pair) => pair.adviceId), acrossDays.map((pair) => pair.adviceId));
  assert.equal(compareAdviceEffectiveness(toComparableTaskPairs(selected)).status, 'improved');

  const mixedTask = comparablePair();
  mixedTask.pairId = 'pair-mixed-task';
  mixedTask.adviceId = 'advice-codex-30d-later-day';
  mixedTask.context.taskKind = 'feature';
  const withMixedCohort = selectStoredComparablePairLineage(
    [...acrossDays, mixedTask],
    { provider: 'codex', recommendationId: 'recommendation-1' },
  );
  assert.equal(
    compareAdviceEffectiveness(toComparableTaskPairs(withMixedCohort)).status,
    'insufficient-evidence',
    'lineage selection must not silently drop an incomparable task cohort',
  );
});

test('legacy exact v2 state migrates in-place to the same ledger with empty comparison results', async () => {
  const storage = new MemoryStorage();
  storage.value = {
    schemaVersion: 2,
    featureMode: 'disabled',
    aggregateConsent: 'not-granted',
    promptSampleConsent: 'not-granted',
    feedback: [],
    comparablePairs: [],
  };
  const result = await loadAndMigrateAdviceLocalState(storage);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.migrated, true);
  assert.deepEqual(result.value.comparisonResults, []);
  assert.deepEqual(storage.updates, [result.value]);
});

test('comparison results share v2 state, remain bounded, and reject duplicate or hostile envelopes', () => {
  let state = createClosedAdviceLocalState();
  const first = comparisonResult(1_778_000_000_000);
  const appended = appendAdviceComparisonResult(state, first);
  assert.equal(appended.ok, true);
  if (!appended.ok) return;
  state = appended.value;
  assert.deepEqual(state.comparisonResults, [first]);
  assert.equal(appendAdviceComparisonResult(state, first).ok, false, 'duplicate IDs fail closed');

  const hostile = { ...comparisonResult(1_778_000_000_001), prompt: 'PRIVATE_PROMPT' };
  assert.equal(appendAdviceComparisonResult(state, hostile).ok, false);

  for (let index = 1; index <= MAX_PERSISTED_ADVICE_COMPARISON_RESULTS; index += 1) {
    const result = appendAdviceComparisonResult(state, comparisonResult(1_778_000_000_001 + index));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    state = result.value;
  }
  assert.equal(state.comparisonResults.length, MAX_PERSISTED_ADVICE_COMPARISON_RESULTS);
  assert.notEqual(state.comparisonResults[0].comparisonId, first.comparisonId);
});
