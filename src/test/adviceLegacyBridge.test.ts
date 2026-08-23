import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { AdviceOptions } from '../advisor';
import {
  LegacyByokModelCall,
  requestStructuredAdviceViaLegacyByok,
} from '../adviceEffectiveness/legacyBridge';
import { prepareAdvicePayload } from '../adviceEffectiveness/payload';
import { payloadInputFixture, structuredOutputFixture } from './adviceTestFixtures';

const byok = {
  apiFormat: 'openai' as const,
  apiKey: 'PRIVATE_API_KEY',
  apiUrl: 'https://example.invalid/chat/completions',
  model: 'private-model',
};

test('legacy BYOK bridge uses the sealed serialization as the exact user turn and strict-parses the result', async () => {
  const prepared = prepareAdvicePayload(payloadInputFixture());
  let capturedUser = '';
  let capturedOptions: AdviceOptions | undefined;
  const invoke: LegacyByokModelCall = async (_system, userContent, options) => {
    capturedUser = userContent;
    capturedOptions = options;
    return JSON.stringify(structuredOutputFixture());
  };

  const result = await requestStructuredAdviceViaLegacyByok(
    prepared,
    {
      observationIds: ['observation-cache-share'],
      evidenceIds: ['evidence-cache-share'],
    },
    byok,
    invoke,
  );

  assert.equal(result.ok, true);
  assert.equal(capturedUser, prepared.serializedBody);
  assert.equal(capturedOptions?.summary, '');
  assert.equal(capturedOptions?.userContext, undefined);
  assert.equal(capturedOptions?.backend, 'api');
});

test('legacy BYOK bridge rejects a Prepared object whose preview text no longer matches its bytes', async () => {
  const prepared = prepareAdvicePayload(payloadInputFixture());
  prepared.serializedBody = '{"tamperedPreview":true}';
  let invocations = 0;
  const result = await requestStructuredAdviceViaLegacyByok(
    prepared,
    { observationIds: ['observation-cache-share'], evidenceIds: ['evidence-cache-share'] },
    byok,
    async () => {
      invocations += 1;
      return JSON.stringify(structuredOutputFixture());
    },
  );
  assert.deepEqual(result, {
    ok: false,
    code: 'transport-error',
    issues: ['legacy BYOK transport failed'],
  });
  assert.equal(invocations, 0);
});

test('legacy BYOK bridge rejects fenced or malformed model output without a prose fallback', async () => {
  const prepared = prepareAdvicePayload(payloadInputFixture());
  const invoke: LegacyByokModelCall = async () =>
    `\`\`\`json\n${JSON.stringify(structuredOutputFixture())}\n\`\`\``;
  const result = await requestStructuredAdviceViaLegacyByok(
    prepared,
    { observationIds: ['observation-cache-share'], evidenceIds: ['evidence-cache-share'] },
    byok,
    invoke,
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'invalid-json');
});

test('legacy BYOK bridge fails closed on transport errors and does not echo secrets', async () => {
  const prepared = prepareAdvicePayload(payloadInputFixture());
  const invoke: LegacyByokModelCall = async () => {
    throw new Error('PRIVATE_API_KEY endpoint failure');
  };
  const result = await requestStructuredAdviceViaLegacyByok(
    prepared,
    { observationIds: ['observation-cache-share'], evidenceIds: ['evidence-cache-share'] },
    byok,
    invoke,
  );
  assert.deepEqual(result, {
    ok: false,
    code: 'transport-error',
    issues: ['legacy BYOK transport failed'],
  });
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_API_KEY/);
});

test('legacy BYOK bridge rejects subscription or hostile transport fields before invocation', async () => {
  const prepared = prepareAdvicePayload(payloadInputFixture());
  let invocations = 0;
  const invoke: LegacyByokModelCall = async () => {
    invocations += 1;
    return JSON.stringify(structuredOutputFixture());
  };
  for (const hostile of [
    { ...byok, backend: 'subscription' },
    { ...byok, getSubscriptionToken: async () => 'PRIVATE_TOKEN' },
    { ...byok, subscriptionModel: 'private-subscription-model' },
    { ...byok, apiKey: '' },
    { ...byok, apiUrl: '' },
    { ...byok, model: '' },
  ]) {
    const result = await requestStructuredAdviceViaLegacyByok(
      prepared,
      { observationIds: ['observation-cache-share'], evidenceIds: ['evidence-cache-share'] },
      hostile as typeof byok,
      invoke,
    );
    assert.deepEqual(result, {
      ok: false,
      code: 'invalid-config',
      issues: ['legacy BYOK configuration was rejected'],
    });
  }
  assert.equal(invocations, 0);
});
