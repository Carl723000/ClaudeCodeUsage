/** Pure, paired before/after comparison for genuinely comparable tasks. */

export interface ComparableTaskContext {
  taskKind: string;
  complexityBand: 'low' | 'medium' | 'high';
  provider: string;
  modelFamily: string;
  effort: string;
  metricDefinitionVersion: string;
  qualityRubricId: string;
}

export interface ComparableTaskOutcome {
  context: ComparableTaskContext;
  primaryMetric: {
    name: string;
    unit: string;
    direction: 'lower-is-better' | 'higher-is-better';
    value: number;
  };
  quality: {
    score: number | null;
    passed: boolean | null;
    evidenceCount: number;
  };
  evidence: {
    coverage: 'complete' | 'partial' | 'unknown';
    confidence: 'high' | 'medium' | 'low' | 'unknown';
    qualityFlags: string[];
  };
}

export interface ComparableTaskPair {
  pairId: string;
  before: ComparableTaskOutcome;
  after: ComparableTaskOutcome;
}

export interface AdviceComparisonPolicy {
  minComparablePairs: number;
  minRelativeImprovement: number;
  minAfterQualityScore: number;
  maxMeanQualityRegression: number;
  allowedQualityFlags: string[];
}

export const DEFAULT_ADVICE_COMPARISON_POLICY: AdviceComparisonPolicy = {
  minComparablePairs: 5,
  minRelativeImprovement: 0.1,
  minAfterQualityScore: 0.8,
  maxMeanQualityRegression: 0.02,
  allowedQualityFlags: [],
};

export interface AdviceComparisonStats {
  comparablePairs: number;
  meanBeforeValue: number;
  meanAfterValue: number;
  meanRelativeImprovement: number;
  meanBeforeQuality: number;
  meanAfterQuality: number;
  meanQualityChange: number;
}

export type AdviceComparisonResult =
  | {
      status: 'insufficient-evidence';
      reasons: string[];
      comparablePairs: number;
    }
  | {
      status: 'quality-guardrail-failed';
      reasons: string[];
      stats: AdviceComparisonStats;
    }
  | {
      status: 'improved' | 'no-demonstrated-improvement';
      reasons: string[];
      stats: AdviceComparisonStats;
    };

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sameContext(a: ComparableTaskOutcome, b: ComparableTaskOutcome): boolean {
  return (
    a.context.taskKind === b.context.taskKind &&
    a.context.complexityBand === b.context.complexityBand &&
    a.context.provider === b.context.provider &&
    a.context.modelFamily === b.context.modelFamily &&
    a.context.effort === b.context.effort &&
    a.context.metricDefinitionVersion === b.context.metricDefinitionVersion &&
    a.context.qualityRubricId === b.context.qualityRubricId &&
    a.primaryMetric.name === b.primaryMetric.name &&
    a.primaryMetric.unit === b.primaryMetric.unit &&
    a.primaryMetric.direction === b.primaryMetric.direction
  );
}

function validScore(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= 1;
}

function policyIssues(policy: AdviceComparisonPolicy): string[] {
  const issues: string[] = [];
  if (!Number.isInteger(policy.minComparablePairs) || policy.minComparablePairs < 2) {
    issues.push('comparison policy requires at least two pairs');
  }
  if (!Number.isFinite(policy.minRelativeImprovement) || policy.minRelativeImprovement < 0) {
    issues.push('comparison policy has an invalid improvement threshold');
  }
  if (
    !Number.isFinite(policy.minAfterQualityScore) ||
    policy.minAfterQualityScore < 0 ||
    policy.minAfterQualityScore > 1 ||
    !Number.isFinite(policy.maxMeanQualityRegression) ||
    policy.maxMeanQualityRegression < 0 ||
    policy.maxMeanQualityRegression > 1
  ) {
    issues.push('comparison policy has an invalid quality guardrail');
  }
  return issues;
}

/**
 * Compare paired tasks without inferring causation. Any ambiguity in task
 * comparability, coverage, confidence, metric values, or quality evidence
 * returns insufficient-evidence rather than silently dropping the bad pair.
 */
export function compareAdviceEffectiveness(
  pairs: readonly ComparableTaskPair[],
  policy: AdviceComparisonPolicy = DEFAULT_ADVICE_COMPARISON_POLICY
): AdviceComparisonResult {
  const reasons = policyIssues(policy);
  const pairIds = new Set<string>();
  const allowedFlags = new Set(policy.allowedQualityFlags);
  const cohort = pairs.length > 0 ? pairs[0].before : undefined;

  for (const pair of pairs) {
    if (pairIds.has(pair.pairId)) reasons.push(`duplicate pair id: ${pair.pairId}`);
    pairIds.add(pair.pairId);
    if (!sameContext(pair.before, pair.after)) {
      reasons.push(`pair ${pair.pairId} is not comparable`);
      continue;
    }
    if (cohort && !sameContext(cohort, pair.before)) {
      reasons.push(`pair ${pair.pairId} is outside the comparison cohort`);
      continue;
    }
    for (const [period, outcome] of [
      ['before', pair.before],
      ['after', pair.after],
    ] as const) {
      if (outcome.evidence.coverage !== 'complete') {
        reasons.push(`pair ${pair.pairId} ${period} coverage is incomplete`);
      }
      if (outcome.evidence.confidence === 'unknown' || outcome.evidence.confidence === 'low') {
        reasons.push(`pair ${pair.pairId} ${period} confidence is insufficient`);
      }
      const disallowedFlags = outcome.evidence.qualityFlags.filter((flag) => !allowedFlags.has(flag));
      if (disallowedFlags.length > 0) {
        reasons.push(`pair ${pair.pairId} ${period} has unresolved quality flags`);
      }
      if (!Number.isFinite(outcome.primaryMetric.value) || outcome.primaryMetric.value < 0) {
        reasons.push(`pair ${pair.pairId} ${period} metric is invalid`);
      }
      if (period === 'before' && outcome.primaryMetric.value === 0) {
        reasons.push(`pair ${pair.pairId} has a zero baseline`);
      }
      if (!validScore(outcome.quality.score) || outcome.quality.passed === null) {
        reasons.push(`pair ${pair.pairId} ${period} quality evidence is unknown`);
      }
      if (!Number.isInteger(outcome.quality.evidenceCount) || outcome.quality.evidenceCount < 1) {
        reasons.push(`pair ${pair.pairId} ${period} has no quality evidence`);
      }
      if (period === 'before' && outcome.quality.passed === false) {
        reasons.push(`pair ${pair.pairId} baseline did not pass its quality rubric`);
      }
    }
  }

  if (pairs.length < policy.minComparablePairs) {
    reasons.push(`need at least ${policy.minComparablePairs} comparable pairs`);
  }
  if (reasons.length > 0) {
    return { status: 'insufficient-evidence', reasons, comparablePairs: pairs.length };
  }

  const beforeValues = pairs.map((pair) => pair.before.primaryMetric.value);
  const afterValues = pairs.map((pair) => pair.after.primaryMetric.value);
  const beforeQuality = pairs.map((pair) => pair.before.quality.score as number);
  const afterQuality = pairs.map((pair) => pair.after.quality.score as number);
  const relativeImprovements = pairs.map((pair) => {
    const before = pair.before.primaryMetric.value;
    const after = pair.after.primaryMetric.value;
    return pair.before.primaryMetric.direction === 'lower-is-better'
      ? (before - after) / before
      : (after - before) / before;
  });
  const meanBeforeQuality = mean(beforeQuality);
  const meanAfterQuality = mean(afterQuality);
  const stats: AdviceComparisonStats = {
    comparablePairs: pairs.length,
    meanBeforeValue: mean(beforeValues),
    meanAfterValue: mean(afterValues),
    meanRelativeImprovement: mean(relativeImprovements),
    meanBeforeQuality,
    meanAfterQuality,
    meanQualityChange: meanAfterQuality - meanBeforeQuality,
  };

  const guardrailReasons: string[] = [];
  if (pairs.some((pair) => pair.after.quality.passed !== true)) {
    guardrailReasons.push('at least one after task failed its quality rubric');
  }
  if (meanAfterQuality < policy.minAfterQualityScore) {
    guardrailReasons.push('mean after quality is below the required score');
  }
  if (stats.meanQualityChange < -policy.maxMeanQualityRegression) {
    guardrailReasons.push('mean quality regressed beyond the allowed guardrail');
  }
  if (guardrailReasons.length > 0) {
    return { status: 'quality-guardrail-failed', reasons: guardrailReasons, stats };
  }

  if (stats.meanRelativeImprovement >= policy.minRelativeImprovement) {
    return {
      status: 'improved',
      reasons: ['primary metric met the threshold while the quality guardrail held'],
      stats,
    };
  }
  return {
    status: 'no-demonstrated-improvement',
    reasons: ['primary metric did not meet the pre-declared improvement threshold'],
    stats,
  };
}
