import {
  AdviceEvidence,
  AdviceObservation,
  AdviceRecommendation,
  AdviceSourceInfo,
} from '../adviceEffectiveness/contract';
import { PrepareAdvicePayloadInput, buildAdviceAggregateSnapshot } from '../adviceEffectiveness/payload';
import { UsageData } from '../types';

export const usageFixture: UsageData = {
  totalInputTokens: 1_000,
  totalOutputTokens: 400,
  totalCacheCreationTokens: 200,
  totalCacheReadTokens: 2_000,
  totalCost: 1.25,
  costBreakdown: { input: 0.1, output: 0.4, cacheWrite: 0.25, cacheRead: 0.5 },
  messageCount: 10,
  modelBreakdown: {
    'claude-sonnet-4-20250514': {
      inputTokens: 700,
      outputTokens: 300,
      cacheCreationTokens: 100,
      cacheReadTokens: 1_500,
      cost: 1,
      count: 7,
    },
    'private-router-model-name': {
      inputTokens: 300,
      outputTokens: 100,
      cacheCreationTokens: 100,
      cacheReadTokens: 500,
      cost: 0.25,
      count: 3,
    },
  },
};

export const sourceFixture: AdviceSourceInfo = {
  id: 'source-usage-30d',
  kind: 'claude-usage-aggregate',
  scope: 'overall',
  window: { kind: 'rolling-days', days: 30 },
  confidence: 'high',
  qualityFlags: [],
};

export const observationFixture: AdviceObservation = {
  id: 'observation-cache-share',
  metric: 'cache-read-share',
  value: 0.625,
  unit: 'ratio',
  method: 'measured',
  sourceId: sourceFixture.id,
  summary: 'Cache reads are 62.5% of observed input-side tokens.',
};

export const proxyObservationFixture: AdviceObservation = {
  id: 'observation-tool-intensity',
  metric: 'post-patch-tool-intensity',
  value: 5,
  unit: 'count',
  method: 'structural-proxy',
  sourceId: sourceFixture.id,
  summary: 'Five tool calls were observed after a patch.',
};

export const evidenceFixture: AdviceEvidence = {
  id: 'evidence-cache-share',
  observationIds: [observationFixture.id],
  strength: 'correlational',
  summary: 'The aggregate has substantial cache-read reuse.',
  limitations: ['Cache share does not measure task quality.'],
};

export const proxyEvidenceFixture: AdviceEvidence = {
  id: 'evidence-tool-intensity',
  observationIds: [proxyObservationFixture.id],
  strength: 'proxy',
  summary: 'Post-patch tool-call count is elevated.',
  limitations: ['Tool names and command bodies are not inspected.'],
};

export const recommendationFixture: AdviceRecommendation = {
  id: 'recommendation-compare-boundaries',
  title: 'Compare task boundaries on representative work',
  evidenceIds: [evidenceFixture.id],
  explanation: {
    summary: 'A controlled comparison can test whether a smaller task boundary helps.',
    proxyMetricObservationIds: [],
    limitations: ['This aggregate alone does not establish causation.'],
  },
  conditionalActions: [
    {
      when: 'When the next task matches the same complexity and rubric',
      action: 'Compare the current boundary with one smaller boundary.',
      evidenceIds: [evidenceFixture.id],
      stopCondition: 'Stop if the quality rubric fails.',
    },
  ],
  successCriteria: [
    {
      metricObservationId: observationFixture.id,
      direction: 'increase',
      target: { kind: 'relative-change', value: 0.1 },
      minimumComparableTasks: 5,
      qualityGuardrail: {
        rubricId: 'acceptance-rubric-v1',
        minimumScore: 0.8,
        maximumRegression: 0.02,
      },
    },
  ],
};

export function payloadInputFixture(): PrepareAdvicePayloadInput {
  return {
    locale: 'en',
    aggregate: buildAdviceAggregateSnapshot(usageFixture, 'overall', 30),
    sources: [sourceFixture],
    observations: [observationFixture],
    evidence: [evidenceFixture],
  };
}

export function structuredOutputFixture(): unknown {
  return {
    schemaVersion: 1,
    recommendations: [recommendationFixture],
  };
}
