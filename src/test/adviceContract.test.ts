import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { AdviceContractInput, createAdviceContract } from '../adviceEffectiveness/contract';
import {
  evidenceFixture,
  observationFixture,
  recommendationFixture,
  sourceFixture,
} from './adviceTestFixtures';

function validInput(): AdviceContractInput {
  return {
    adviceId: 'advice-run-1',
    observations: [observationFixture],
    evidence: [evidenceFixture],
    recommendations: [recommendationFixture],
    privacy: {
      dataMode: 'aggregates-only',
      promptSampleConsent: 'not-granted',
      promptSampleCount: 0,
      feedbackStorage: 'local-only',
    },
    provenance: {
      generatedBy: { kind: 'remote-model', modelFamily: 'sonnet' },
      generatedAt: '2026-08-24T00:00:00.000Z',
      locale: 'en',
      sources: [sourceFixture],
    },
  };
}

test('creates one versioned contract with observation, evidence, action, criterion, source, and privacy', () => {
  const result = createAdviceContract(validInput());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.schemaVersion, 1);
  assert.equal(result.value.recommendations[0].conditionalActions.length, 1);
  assert.equal(result.value.recommendations[0].successCriteria[0].qualityGuardrail.minimumScore, 0.8);
  assert.equal(result.value.privacy.dataMode, 'aggregates-only');
  assert.equal(result.value.provenance.sources[0].kind, 'claude-usage-aggregate');
});

test('rejects invented evidence references and proxy explanations without limitations', () => {
  const input = validInput();
  input.recommendations = [
    {
      ...recommendationFixture,
      evidenceIds: ['evidence-invented'],
      explanation: {
        summary: 'Looks causal.',
        proxyMetricObservationIds: [observationFixture.id],
        limitations: [],
      },
    },
  ];
  const result = createAdviceContract(input);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((issue) => issue.includes('unknown evidence')));
  assert.ok(result.issues.some((issue) => issue.includes('proxy interpretation')));
});

test('rejects privacy metadata that claims aggregates-only while carrying prompt samples', () => {
  const input = validInput();
  input.privacy = {
    dataMode: 'aggregates-only',
    promptSampleConsent: 'explicit',
    promptSampleCount: 1,
    feedbackStorage: 'local-only',
  };
  const result = createAdviceContract(input);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((issue) => issue.includes('zero prompt samples')));
});

test('allows an empty recommendation list to represent no supported conclusion', () => {
  const input = validInput();
  input.recommendations = [];
  const result = createAdviceContract(input);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value.recommendations, []);
});
