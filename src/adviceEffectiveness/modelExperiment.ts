import { AdviceRecommendation } from './contract';
import {
  AdviceComparisonPolicy,
  AdviceComparisonResult,
  ComparableTaskPair,
  DEFAULT_ADVICE_COMPARISON_POLICY,
  compareAdviceEffectiveness,
} from './comparison';

export type ExperimentModelFamily = 'opus' | 'sonnet' | 'haiku';

export interface ModelRightsizingExperimentInput {
  recommendationId: string;
  baselineModelFamily: ExperimentModelFamily;
  candidateModelFamily: ExperimentModelFamily;
  evidenceId: string;
  metricObservationId: string;
}

const ONE_TIER_LOWER: Partial<Record<ExperimentModelFamily, ExperimentModelFamily>> = {
  opus: 'sonnet',
  sonnet: 'haiku',
};

/**
 * Typed seam for the dormant model-rightsizing signal. It never turns the
 * weak “small output” proxy into a directive or savings claim. A candidate is
 * valid only as a reversible, one-tier experiment on comparable tasks, using
 * the same local feedback and quality guardrails as every other recommendation.
 */
export function buildReversibleModelExperiment(
  input: ModelRightsizingExperimentInput,
): AdviceRecommendation | undefined {
  if (ONE_TIER_LOWER[input.baselineModelFamily] !== input.candidateModelFamily) {
    return undefined;
  }
  return {
    id: input.recommendationId,
    title: 'advice.recommendation.model-one-tier-experiment',
    evidenceIds: [input.evidenceId],
    explanation: {
      summary: 'advice.explanation.model-output-size-is-weak-proxy',
      proxyMetricObservationIds: [input.metricObservationId],
      limitations: [
        'advice.limitation.model-experiment-not-causal',
        'advice.limitation.model-experiment-no-savings-claim',
      ],
    },
    conditionalActions: [
      {
        when: 'advice.when.same-task-cohort-and-quality-rubric',
        action: 'advice.action.compare-one-tier-lower-model',
        evidenceIds: [input.evidenceId],
        stopCondition: 'advice.stop.restore-baseline-on-quality-regression',
      },
    ],
    successCriteria: [
      {
        metricObservationId: input.metricObservationId,
        direction: 'decrease',
        target: { kind: 'relative-change', value: 0.1 },
        minimumComparableTasks: 5,
        qualityGuardrail: {
          rubricId: 'task-quality-rubric-v1',
          minimumScore: 0.8,
          maximumRegression: 0.02,
        },
      },
    ],
  };
}

export interface ReversibleModelExperimentComparisonInput {
  baselineModelFamily: ExperimentModelFamily;
  candidateModelFamily: ExperimentModelFamily;
  applied: boolean;
  localRating: 'unrated' | 'helpful' | 'not-helpful';
  pairs: readonly ComparableTaskPair[];
  policy?: AdviceComparisonPolicy;
}

/**
 * Compare a one-tier intervention while keeping every other comparability
 * dimension strict. Model family is normalized only after each pair proves it
 * represents the declared baseline→candidate transition.
 */
export function compareReversibleModelExperiment(
  input: ReversibleModelExperimentComparisonInput,
): AdviceComparisonResult {
  const insufficient = (reason: string): AdviceComparisonResult => ({
    status: 'insufficient-evidence',
    reasons: [reason],
    comparablePairs: input.pairs.length,
  });
  if (ONE_TIER_LOWER[input.baselineModelFamily] !== input.candidateModelFamily) {
    return insufficient('model experiment is not an adjacent lower-tier transition');
  }
  if (!input.applied || input.localRating === 'unrated') {
    return insufficient('model experiment requires local applied and rating feedback');
  }
  for (const pair of input.pairs) {
    if (
      pair.before.context.modelFamily !== input.baselineModelFamily ||
      pair.after.context.modelFamily !== input.candidateModelFamily
    ) {
      return insufficient(`pair ${pair.pairId} does not match the declared model transition`);
    }
  }
  const interventionKey = `experiment-${input.baselineModelFamily}-to-${input.candidateModelFamily}`;
  const normalized = input.pairs.map((pair) => ({
    ...pair,
    before: {
      ...pair.before,
      context: { ...pair.before.context, modelFamily: interventionKey },
    },
    after: {
      ...pair.after,
      context: { ...pair.after.context, modelFamily: interventionKey },
    },
  }));
  return compareAdviceEffectiveness(
    normalized,
    input.policy ?? DEFAULT_ADVICE_COMPARISON_POLICY,
  );
}
