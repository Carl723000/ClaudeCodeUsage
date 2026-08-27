import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { compareAdviceEffectiveness } from '../adviceEffectiveness/comparison';

import {
  ADVICE_LOCAL_STATE_KEY,
  ADVICE_LOCAL_STATE_VERSION,
  AdviceLocalStateStorage,
  StoredComparablePair,
  appendStoredComparablePair,
  createClosedAdviceLocalState,
  loadAndMigrateAdviceLocalState,
  saveAdviceLocalState,
  selectStoredComparablePairLineage,
  toComparableTaskPairs,
  upsertAdviceLocalFeedback,
} from '../adviceEffectiveness/versionedPersistence';

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
  assert.deepEqual(result.value.feedback, [
    {
      adviceId: 'advice-1',
      recommendationId: 'recommendation-1',
      rating: 'helpful',
      applied: 'applied',
      updatedAtEpochMs: 1_777_000_000_000,
    },
  ]);
  assert.deepEqual(storage.updates, [result.value]);
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
      updatedAtEpochMs: 1_777_000_000_003,
    },
  ]);
});

function comparablePair(): StoredComparablePair {
  return {
    pairId: 'pair-1',
    adviceId: 'advice-1',
    recommendationId: 'recommendation-1',
    context: {
      taskKind: 'small-change',
      complexityBand: 'low',
      provider: 'codex',
      modelFamily: 'other',
      effort: 'high',
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
