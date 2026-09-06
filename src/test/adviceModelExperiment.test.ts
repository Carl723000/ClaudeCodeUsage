import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { ComparableTaskPair } from '../adviceEffectiveness/comparison';
import {
  buildReversibleModelExperiment,
  compareReversibleModelExperiment,
} from '../adviceEffectiveness/modelExperiment';

const input = {
  recommendationId: 'recommendation-model-experiment',
  baselineModelFamily: 'opus' as const,
  candidateModelFamily: 'sonnet' as const,
  evidenceId: 'evidence-model-proxy',
  metricObservationId: 'observation-task-primary-metric',
};

test('model rightsizing seam allows only a reversible adjacent-tier experiment with guardrails', () => {
  const recommendation = buildReversibleModelExperiment(input);
  assert.ok(recommendation);
  assert.equal(recommendation!.conditionalActions.length, 1);
  assert.equal(recommendation!.successCriteria[0].minimumComparableTasks, 5);
  assert.deepEqual(recommendation!.successCriteria[0].qualityGuardrail, {
    rubricId: 'task-quality-rubric-v1',
    minimumScore: 0.8,
    maximumRegression: 0.02,
  });
  const serialized = JSON.stringify(recommendation);
  assert.doesNotMatch(serialized, /should switch|cheaper model|smaller model|guaranteed savings/i);
});

test('model rightsizing seam rejects multi-tier and upward switches', () => {
  assert.equal(
    buildReversibleModelExperiment({ ...input, candidateModelFamily: 'haiku' }),
    undefined,
  );
  assert.equal(
    buildReversibleModelExperiment({
      ...input,
      baselineModelFamily: 'sonnet',
      candidateModelFamily: 'opus',
    }),
    undefined,
  );
});

function pair(index: number, afterQuality = 0.91): ComparableTaskPair {
  const context = {
    taskKind: 'small-change',
    complexityBand: 'low' as const,
    provider: 'claude',
    effort: 'high',
    metricDefinitionVersion: 'task-tokens-v1',
    qualityRubricId: 'task-quality-rubric-v1',
  };
  const outcome = (
    modelFamily: 'opus' | 'sonnet',
    value: number,
    quality: number,
  ) => ({
    context: { ...context, modelFamily },
    primaryMetric: {
      name: 'task-primary-metric',
      unit: 'tokens',
      direction: 'lower-is-better' as const,
      value,
    },
    quality: { score: quality, passed: quality >= 0.8, evidenceCount: 2 },
    evidence: { coverage: 'complete' as const, confidence: 'high' as const, qualityFlags: [] },
  });
  return {
    pairId: `pair-model-${index}`,
    before: outcome('opus', 100, 0.9),
    after: outcome('sonnet', 80, afterQuality),
  };
}

test('adjacent model experiment compares five matched pairs only after local feedback', () => {
  const pairs = Array.from({ length: 5 }, (_, index) => pair(index));
  const missingFeedback = compareReversibleModelExperiment({
    baselineModelFamily: 'opus',
    candidateModelFamily: 'sonnet',
    applied: true,
    localRating: 'unrated',
    pairs,
  });
  assert.equal(missingFeedback.status, 'insufficient-evidence');

  const result = compareReversibleModelExperiment({
    baselineModelFamily: 'opus',
    candidateModelFamily: 'sonnet',
    applied: true,
    localRating: 'helpful',
    pairs,
  });
  assert.equal(result.status, 'improved');
});

test('adjacent model experiment preserves the quality guardrail and minimum sample', () => {
  const tooFew = compareReversibleModelExperiment({
    baselineModelFamily: 'opus',
    candidateModelFamily: 'sonnet',
    applied: true,
    localRating: 'not-helpful',
    pairs: Array.from({ length: 4 }, (_, index) => pair(index)),
  });
  assert.equal(tooFew.status, 'insufficient-evidence');

  const qualityFailure = compareReversibleModelExperiment({
    baselineModelFamily: 'opus',
    candidateModelFamily: 'sonnet',
    applied: true,
    localRating: 'helpful',
    pairs: Array.from({ length: 5 }, (_, index) => pair(index, 0.7)),
  });
  assert.equal(qualityFailure.status, 'quality-guardrail-failed');
});
