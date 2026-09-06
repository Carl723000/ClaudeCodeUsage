import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  AdviceComparisonPolicy,
  ComparableTaskPair,
  compareAdviceEffectiveness,
} from '../adviceEffectiveness/comparison';

const policy: AdviceComparisonPolicy = {
  minComparablePairs: 5,
  minRelativeImprovement: 0.1,
  minAfterQualityScore: 0.8,
  maxMeanQualityRegression: 0.02,
  allowedQualityFlags: [],
};

function pairs(afterValue: number = 80, afterQuality: number = 0.9): ComparableTaskPair[] {
  return Array.from({ length: 5 }, (_, index) => ({
    pairId: `pair-${index + 1}`,
    before: {
      context: {
        taskKind: 'focused-code-change',
        complexityBand: 'medium' as const,
        provider: 'claude',
        modelFamily: 'sonnet',
        effort: 'high',
        metricDefinitionVersion: 'tokens-v1',
        qualityRubricId: 'acceptance-v1',
      },
      primaryMetric: {
        name: 'total-tokens',
        unit: 'tokens',
        direction: 'lower-is-better' as const,
        value: 100,
      },
      quality: { score: 0.9, passed: true, evidenceCount: 2 },
      evidence: { coverage: 'complete' as const, confidence: 'high' as const, qualityFlags: [] },
    },
    after: {
      context: {
        taskKind: 'focused-code-change',
        complexityBand: 'medium' as const,
        provider: 'claude',
        modelFamily: 'sonnet',
        effort: 'high',
        metricDefinitionVersion: 'tokens-v1',
        qualityRubricId: 'acceptance-v1',
      },
      primaryMetric: {
        name: 'total-tokens',
        unit: 'tokens',
        direction: 'lower-is-better' as const,
        value: afterValue,
      },
      quality: { score: afterQuality, passed: true, evidenceCount: 2 },
      evidence: { coverage: 'complete' as const, confidence: 'high' as const, qualityFlags: [] },
    },
  }));
}

test('concludes improved only after the metric threshold and quality guardrail both hold', () => {
  const input = pairs();
  const before = JSON.stringify(input);
  const result = compareAdviceEffectiveness(input, policy);
  assert.equal(result.status, 'improved');
  if (result.status === 'improved') assert.equal(result.stats.meanRelativeImprovement, 0.2);
  assert.equal(JSON.stringify(input), before, 'comparison must not mutate measurements');
});

test('returns insufficient evidence for small, incomparable, partial, or unknown-quality cohorts', () => {
  assert.equal(compareAdviceEffectiveness(pairs().slice(0, 4), policy).status, 'insufficient-evidence');

  const incomparable = pairs();
  incomparable[1].after.context.modelFamily = 'opus';
  assert.equal(compareAdviceEffectiveness(incomparable, policy).status, 'insufficient-evidence');

  const partial = pairs();
  partial[2].before.evidence.coverage = 'partial';
  assert.equal(compareAdviceEffectiveness(partial, policy).status, 'insufficient-evidence');

  const unknownQuality = pairs();
  unknownQuality[3].after.quality.score = null;
  assert.equal(compareAdviceEffectiveness(unknownQuality, policy).status, 'insufficient-evidence');
});

test('does not claim effectiveness when the primary metric improves but quality regresses', () => {
  const result = compareAdviceEffectiveness(pairs(70, 0.75), policy);
  assert.equal(result.status, 'quality-guardrail-failed');
});

test('reports no demonstrated improvement without turning it into a causal harm claim', () => {
  const result = compareAdviceEffectiveness(pairs(95, 0.9), policy);
  assert.equal(result.status, 'no-demonstrated-improvement');
  assert.ok(result.reasons[0].includes('pre-declared'));
});

test('zero baselines and non-finite measurements are inconclusive', () => {
  const zero = pairs();
  zero[0].before.primaryMetric.value = 0;
  assert.equal(compareAdviceEffectiveness(zero, policy).status, 'insufficient-evidence');

  const invalid = pairs();
  invalid[0].after.primaryMetric.value = Number.NaN;
  assert.equal(compareAdviceEffectiveness(invalid, policy).status, 'insufficient-evidence');
});
