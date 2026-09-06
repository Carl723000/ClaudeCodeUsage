import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  prepareAiInvocation,
  previewAiInvocation,
  sendPreparedAiInvocation,
} from '../adviceEffectiveness/preparedRequest';

test('Anthropic preview and sender consume the exact same canonical HTTP bytes', async () => {
  const prepared = prepareAiInvocation({
    kind: 'advice',
    apiFormat: 'anthropic',
    apiUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    systemPrompt: 'Return strict JSON only.',
    userContent: '{"evidence":"aggregate-only"}',
    dataMode: 'aggregates-only',
    sourceRevision: 'rev-42',
    consentGeneration: 3,
    createdAtEpochMs: 1_000,
  });
  const preview = previewAiInvocation(prepared);
  let networkCalls = 0;
  let sentBytes: Uint8Array | undefined;

  assert.equal(networkCalls, 0, 'preparing and previewing must not send');
  const result = await sendPreparedAiInvocation(
    prepared,
    { backend: 'api', apiKey: 'byok-secret' },
    async (request) => {
      networkCalls += 1;
      sentBytes = request.canonicalBytes;
      assert.equal(request.headers['x-api-key'], 'byok-secret');
      assert.equal(Object.values(request.headers).some((value) => preview.body.includes(value)), false);
      return 'ok';
    },
  );

  assert.equal(result, 'ok');
  assert.equal(networkCalls, 1);
  assert.strictEqual(sentBytes, prepared.canonicalBytes);
  assert.equal(Buffer.from(sentBytes!).toString('utf8'), preview.body);
  assert.equal(preview.utf8Bytes, prepared.canonicalBytes.byteLength);
  assert.match(preview.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(JSON.parse(preview.body), {
    max_tokens: 16_000,
    messages: [{ content: '{"evidence":"aggregate-only"}', role: 'user' }],
    model: 'claude-sonnet-4-5',
    system: 'Return strict JSON only.',
  });
});

test('OpenAI-compatible optimizer uses the same boundary without advice parser fallback', async () => {
  const prepared = prepareAiInvocation({
    kind: 'optimizer',
    apiFormat: 'openai',
    apiUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    reasoningEffort: 'high',
    systemPrompt: 'Use the optimizer markers exactly.',
    userContent: 'User pasted draft only',
    dataMode: 'user-draft-only',
    sourceRevision: 'optimizer-draft-1',
    consentGeneration: 1,
    createdAtEpochMs: 2_000,
  });
  const preview = previewAiInvocation(prepared);
  const body = JSON.parse(preview.body);

  assert.equal(prepared.endpoint, 'https://api.deepseek.com/chat/completions');
  assert.equal(body.messages[1].content, 'User pasted draft only');
  assert.equal(body.reasoning_effort, 'high');
  assert.equal(body.thinking, undefined);
  assert.equal(JSON.stringify(body).includes('byok-secret'), false);
});

test('OpenAI reasoning effort never emits the unsupported top-level thinking parameter', () => {
  const prepared = prepareAiInvocation({
    kind: 'optimizer',
    apiFormat: 'openai',
    apiUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.6-sol',
    reasoningEffort: 'max',
    systemPrompt: 'Return the requested optimizer payload.',
    userContent: 'Draft request',
    dataMode: 'user-draft-only',
    sourceRevision: 'issue-94',
    consentGeneration: 1,
    createdAtEpochMs: 2_500,
  });
  const body = JSON.parse(previewAiInvocation(prepared).body);

  assert.equal(prepared.endpoint, 'https://api.openai.com/v1/chat/completions');
  assert.equal(body.reasoning_effort, 'max');
  assert.equal(body.thinking, undefined);
});

test('prepared request fails closed for subscription OAuth, missing BYOK, stale state, or tampering', async () => {
  const prepared = prepareAiInvocation({
    kind: 'advice',
    apiFormat: 'openai',
    apiUrl: 'https://example.invalid/v1',
    model: 'safe-model',
    systemPrompt: 'strict',
    userContent: '{}',
    dataMode: 'aggregates-only',
    sourceRevision: 'rev-safe',
    consentGeneration: 7,
    createdAtEpochMs: 10_000,
  });
  let calls = 0;
  const sender = async (): Promise<string> => {
    calls += 1;
    return 'unexpected';
  };

  await assert.rejects(
    sendPreparedAiInvocation(prepared, { backend: 'subscription', apiKey: 'x' } as never, sender),
    /BYOK API/,
  );
  await assert.rejects(
    sendPreparedAiInvocation(prepared, { backend: 'api', apiKey: '  ' }, sender),
    /API key/,
  );
  await assert.rejects(
    sendPreparedAiInvocation(
      prepared,
      { backend: 'api', apiKey: 'x', expectedSourceRevision: 'different' },
      sender,
    ),
    /stale/,
  );
  await assert.rejects(
    sendPreparedAiInvocation(
      prepared,
      { backend: 'api', apiKey: 'x', expectedConsentGeneration: 8 },
      sender,
    ),
    /stale/,
  );

  const mutated = prepared as unknown as { serializedBody: string };
  mutated.serializedBody = '{"changed":true}';
  await assert.rejects(
    sendPreparedAiInvocation(prepared, { backend: 'api', apiKey: 'x' }, sender),
    /integrity/,
  );
  assert.equal(calls, 0);
});
