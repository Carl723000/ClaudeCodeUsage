import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  AdviceComparisonResultBuildInput,
  AdviceComparisonResultEnvelope,
  buildAdviceComparisonResultEnvelope,
  parseAdviceComparisonResultEnvelope,
} from '../adviceEffectiveness/comparisonResult';
import {
  ComparablePairBuildInput,
  StoredComparablePair,
  buildComparableTaskPair,
} from '../adviceEffectiveness/comparisonPairing';

function pair(index: number, afterValue = 80, afterScore = 0.9, afterPassed: 'passed' | 'failed' = 'passed'): StoredComparablePair {
  const base = 1_777_000_000_000 + index * 10_000;
  const input: ComparablePairBuildInput = {
    adviceId: `advice-${index}`,
    recommendationId: 'reduce-token-use',
    recommendationVersion: 'recommendation-v1',
    before: {
      context: {
        scope: 'task-cohort',
        taskKind: 'small-change',
        complexityBand: 'medium',
        provider: 'claude',
        modelFamily: 'sonnet',
        effort: 'high',
        measurementProfileVersion: 'claude-aggregate-v1',
        metricDefinitionVersion: 'processed-tokens-v1',
        qualityRubricId: 'acceptance-v1',
      },
      metric: { name: 'processed-tokens', unit: 'tokens', direction: 'lower-is-better', value: 100 },
      quality: { score: 0.9, passed: 'passed', evidenceCount: 2 },
      evidence: { coverage: 'complete', confidence: 'high', qualityFlags: [] },
      observedAtEpochMs: base,
    },
    after: {
      context: {
        scope: 'task-cohort',
        taskKind: 'small-change',
        complexityBand: 'medium',
        provider: 'claude',
        modelFamily: 'sonnet',
        effort: 'high',
        measurementProfileVersion: 'claude-aggregate-v1',
        metricDefinitionVersion: 'processed-tokens-v1',
        qualityRubricId: 'acceptance-v1',
      },
      metric: { name: 'processed-tokens', unit: 'tokens', direction: 'lower-is-better', value: afterValue },
      quality: { score: afterScore, passed: afterPassed, evidenceCount: 2 },
      evidence: { coverage: 'complete', confidence: 'high', qualityFlags: [] },
      observedAtEpochMs: base + 1,
    },
    recordedAtEpochMs: base + 2,
  };
  const result = buildComparableTaskPair(input);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('fixture pair failed validation');
  return result.value;
}

function buildInput(pairs: StoredComparablePair[]): AdviceComparisonResultBuildInput {
  return {
    provider: 'claude',
    recommendationId: 'reduce-token-use',
    recommendationVersion: 'recommendation-v1',
    measurementProfileVersion: 'claude-aggregate-v1',
    cohort: {
      scope: 'task-cohort',
      taskKind: 'small-change',
      complexityBand: 'medium',
      modelFamily: 'sonnet',
      effort: 'high',
      metricDefinitionVersion: 'processed-tokens-v1',
      qualityRubricId: 'acceptance-v1',
      metric: { name: 'processed-tokens', unit: 'tokens', direction: 'lower-is-better' },
    },
    guardrail: {
      minComparablePairs: 5,
      minRelativeImprovement: 0.1,
      minAfterQualityScore: 0.8,
      maxMeanQualityRegression: 0.02,
      allowedQualityFlags: [],
      qualityRubricId: 'acceptance-v1',
    },
    pairs,
    recordedAtEpochMs: 1_778_000_000_000,
  };
}

test('freezes an improved comparison in a strict versioned, replayable envelope', () => {
  const input = buildInput(Array.from({ length: 5 }, (_, index) => pair(index + 1)));
  const before = JSON.stringify(input);
  const built = buildAdviceComparisonResultEnvelope(input);
  assert.equal(built.ok, true);
  assert.equal(JSON.stringify(input), before, 'comparison result creation must be pure');
  if (!built.ok) return;
  assert.equal(built.value.schemaVersion, 1);
  assert.equal(built.value.provider, 'claude');
  assert.equal(built.value.measurementProfileVersion, 'claude-aggregate-v1');
  assert.equal(built.value.recommendationVersion, 'recommendation-v1');
  assert.equal(built.value.sample.pairIds.length, 5);
  assert.equal(built.value.result.status, 'improved');
  assert.deepEqual(built.value.replayEligibility, {
    status: 'eligible',
    reason: 'conclusive-result',
  });
  assert.match(built.value.comparisonId, /^comparison-[a-f0-9]{32}$/);
  assert.deepEqual(parseAdviceComparisonResultEnvelope(built.value), built.value);
  assert.doesNotMatch(JSON.stringify(built.value), /prompt|session|path|body/i);
});

test('freezes too-small and incomparable samples as explicit evidence-insufficient results', () => {
  const tooSmall = buildAdviceComparisonResultEnvelope(
    buildInput(Array.from({ length: 4 }, (_, index) => pair(index + 1))),
  );
  assert.equal(tooSmall.ok, true);
  if (tooSmall.ok) {
    assert.deepEqual(tooSmall.value.replayEligibility, {
      status: 'ineligible',
      reason: 'evidence-insufficient',
    });
    assert.deepEqual(tooSmall.value.result, {
      status: 'evidence-insufficient',
      reasonCode: 'minimum-sample-not-met',
      comparablePairs: 4,
    });
  }

  const mixed = Array.from({ length: 5 }, (_, index) => pair(index + 1));
  mixed[4].context.scope = 'project';
  const incomparable = buildAdviceComparisonResultEnvelope(buildInput(mixed));
  assert.equal(incomparable.ok, true);
  if (incomparable.ok) {
    assert.equal(incomparable.value.result.status, 'evidence-insufficient');
    if (incomparable.value.result.status === 'evidence-insufficient') {
      assert.equal(incomparable.value.result.reasonCode, 'incomparable-sample');
    }
  }
});

test('records a measured quality guardrail failure without claiming improvement', () => {
  const pairs = Array.from({ length: 5 }, (_, index) => pair(index + 1, 70, 0.75, 'failed'));
  const result = buildAdviceComparisonResultEnvelope(buildInput(pairs));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.result.status, 'quality-guardrail-failed');
  assert.equal(result.value.replayEligibility.status, 'eligible');
});

test('strict envelope parsing rejects sensitive, nested, unknown, and inconsistent fields', () => {
  const built = buildAdviceComparisonResultEnvelope(
    buildInput(Array.from({ length: 5 }, (_, index) => pair(index + 1))),
  );
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const value = built.value;
  const hostileValues: unknown[] = [
    { ...value, prompt: 'PRIVATE_PROMPT' },
    { ...value, sessionId: 'PRIVATE_SESSION' },
    { ...value, body: 'PRIVATE_BODY' },
    { ...value, projectPath: '/Users/private/project' },
    {
      ...value,
      guardrail: { ...value.guardrail, unknown: true },
    },
    {
      ...value,
      sample: { ...value.sample, qualityRubricId: 'different-rubric' },
    },
    {
      ...value,
      replayEligibility: { status: 'ineligible', reason: 'evidence-insufficient' },
    },
  ];
  for (const hostile of hostileValues) {
    assert.equal(parseAdviceComparisonResultEnvelope(hostile), undefined);
  }

  const cloned: AdviceComparisonResultEnvelope = JSON.parse(JSON.stringify(value));
  cloned.sample.pairIds.reverse();
  assert.equal(
    parseAdviceComparisonResultEnvelope(cloned),
    undefined,
    'comparisonId protects the frozen envelope from silent mutation',
  );
});
