import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { parseStructuredAdviceOutput } from '../adviceEffectiveness/structuredOutput';
import {
  evidenceFixture,
  observationFixture,
  recommendationFixture,
  structuredOutputFixture,
} from './adviceTestFixtures';

const references = {
  observationIds: [observationFixture.id],
  evidenceIds: [evidenceFixture.id],
};

test('parses one exact JSON response whose recommendations reference host evidence', () => {
  const result = parseStructuredAdviceOutput(JSON.stringify(structuredOutputFixture()), references);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value.recommendations, [recommendationFixture]);
});

test('accepts an empty recommendation list as an explicit no-conclusion result', () => {
  const result = parseStructuredAdviceOutput(JSON.stringify({ schemaVersion: 1, recommendations: [] }), references);
  assert.deepEqual(result, { ok: true, value: { schemaVersion: 1, recommendations: [] } });
});

test('fails closed for prose, markdown fences, trailing text, and extra host-owned fields', () => {
  const valid = JSON.stringify(structuredOutputFixture());
  for (const raw of [
    'This looks useful.',
    `\`\`\`json\n${valid}\n\`\`\``,
    `${valid}\nextra prose`,
    JSON.stringify({ ...structuredOutputFixture() as object, privacy: { dataMode: 'local-only' } }),
  ]) {
    const result = parseStructuredAdviceOutput(raw, references);
    assert.equal(result.ok, false);
  }
});

test('rejects unknown evidence references and never echoes raw model output in the error', () => {
  const secret = 'PRIVATE_MODEL_OUTPUT_SENTINEL';
  const output = structuredOutputFixture() as { schemaVersion: number; recommendations: typeof recommendationFixture[] };
  output.recommendations = [
    {
      ...recommendationFixture,
      evidenceIds: ['evidence-invented'],
      title: secret,
    },
  ];
  const result = parseStructuredAdviceOutput(JSON.stringify(output), references);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'unknown-reference');
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test('rejects the entire batch when one recommendation is malformed or duplicated', () => {
  const malformed = {
    ...recommendationFixture,
    successCriteria: [{ ...recommendationFixture.successCriteria[0], qualityGuardrail: undefined }],
  };
  const result = parseStructuredAdviceOutput(
    JSON.stringify({ schemaVersion: 1, recommendations: [recommendationFixture, malformed] }),
    references
  );
  assert.equal(result.ok, false);

  const duplicate = parseStructuredAdviceOutput(
    JSON.stringify({ schemaVersion: 1, recommendations: [recommendationFixture, recommendationFixture] }),
    references
  );
  assert.equal(duplicate.ok, false);
});
