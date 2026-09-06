import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  prepareStructuredAdviceInvocation,
  requestStructuredAdvice,
} from '../adviceEffectiveness/remoteAdvice';
import { prepareAdvicePayload } from '../adviceEffectiveness/payload';
import { previewAiInvocation } from '../adviceEffectiveness/preparedRequest';
import { payloadInputFixture, structuredOutputFixture } from './adviceTestFixtures';

const config = {
  apiFormat: 'openai' as const,
  apiUrl: 'https://example.invalid/v1',
  model: 'private-model',
};

test('structured advice preview is the complete provider body later sent byte-for-byte', async () => {
  const evidence = prepareAdvicePayload(payloadInputFixture());
  const prepared = prepareStructuredAdviceInvocation(evidence, {
    ...config,
    sourceRevision: 'claude-index-42',
    consentGeneration: 3,
    createdAtEpochMs: 1_000,
  });
  const preview = previewAiInvocation(prepared);
  const parsedBody = JSON.parse(preview.body);
  let sentBytes: Uint8Array | undefined;

  assert.equal(parsedBody.messages[1].content, evidence.serializedBody);
  assert.equal(parsedBody.messages[0].role, 'system');
  assert.equal(prepared.dataMode, 'aggregates-only');

  const result = await requestStructuredAdvice(
    prepared,
    {
      observationIds: ['observation-cache-share'],
      evidenceIds: ['evidence-cache-share'],
    },
    {
      apiKey: 'PRIVATE_API_KEY',
      expectedSourceRevision: 'claude-index-42',
      expectedConsentGeneration: 3,
      transport: async (request) => {
        sentBytes = request.canonicalBytes;
        return {
          status: 200,
          body: JSON.stringify({
            choices: [{ message: { content: JSON.stringify(structuredOutputFixture()) } }],
          }),
        };
      },
    },
  );

  assert.equal(result.ok, true);
  assert.strictEqual(sentBytes, prepared.canonicalBytes);
  assert.equal(Buffer.from(sentBytes!).toString('utf8'), preview.body);
  assert.doesNotMatch(preview.body, /PRIVATE_API_KEY/);
});

test('structured advice fails closed on stale consent or malformed strict output', async () => {
  const prepared = prepareStructuredAdviceInvocation(
    prepareAdvicePayload(payloadInputFixture()),
    {
      ...config,
      sourceRevision: 'claude-index-42',
      consentGeneration: 3,
      createdAtEpochMs: 1_000,
    },
  );
  let calls = 0;
  const stale = await requestStructuredAdvice(
    prepared,
    { observationIds: ['observation-cache-share'], evidenceIds: ['evidence-cache-share'] },
    {
      apiKey: 'PRIVATE_API_KEY',
      expectedConsentGeneration: 4,
      transport: async () => {
        calls += 1;
        return { status: 200, body: '{}' };
      },
    },
  );
  assert.deepEqual(stale, {
    ok: false,
    code: 'transport-error',
    issues: ['configured BYOK transport failed'],
  });
  assert.equal(calls, 0);

  const malformed = await requestStructuredAdvice(
    prepared,
    { observationIds: ['observation-cache-share'], evidenceIds: ['evidence-cache-share'] },
    {
      apiKey: 'PRIVATE_API_KEY',
      expectedConsentGeneration: 3,
      transport: async () => ({
        status: 200,
        body: JSON.stringify({ choices: [{ message: { content: '```json\n{}\n```' } }] }),
      }),
    },
  );
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.code, 'invalid-json');
});
