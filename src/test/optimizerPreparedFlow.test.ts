import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  prepareOptimizerInvocation,
  requestPreparedOptimizer,
} from '../optimizerRequest';
import { previewAiInvocation } from '../adviceEffectiveness/preparedRequest';

const base = {
  apiFormat: 'openai' as const,
  apiUrl: 'https://example.invalid/v1',
  model: 'private-model',
  reasoningEffort: 'high',
  systemPrompt: 'Return the exact optimizer markers.',
  draft: 'Fix the cache bug without changing public APIs.',
  sourceRevision: 'optimizer-draft-42',
  consentGeneration: 2,
  createdAtEpochMs: 1_000,
};

test('optimizer preview and explicit sender share the complete provider bytes', async () => {
  const prepared = prepareOptimizerInvocation(base);
  const preview = previewAiInvocation(prepared);
  let calls = 0;
  let sent: Uint8Array | undefined;
  const result = await requestPreparedOptimizer(prepared, {
    apiKey: 'PRIVATE_API_KEY',
    expectedSourceRevision: base.sourceRevision,
    expectedConsentGeneration: base.consentGeneration,
    transport: async (request) => {
      calls += 1;
      sent = request.canonicalBytes;
      return {
        status: 200,
        body: JSON.stringify({
          choices: [{ message: { content:
            '===PROMPT===\nFix the cache bug. Keep public APIs unchanged.\n' +
            '===SETTINGS===\n' +
            'Effort: high — Requires tracing state.\n' +
            'Thinking: on — Verify the invariant.\n' +
            'Model: opus — Ambiguous debugging task.' } }],
        }),
      };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(calls, 1);
  assert.strictEqual(sent, prepared.canonicalBytes);
  assert.equal(Buffer.from(sent!).toString('utf8'), preview.body);
  assert.doesNotMatch(preview.body, /PRIVATE_API_KEY/);
});

test('optimizer rejects malformed model output without a marker-free fallback', async () => {
  const prepared = prepareOptimizerInvocation(base);
  const result = await requestPreparedOptimizer(prepared, {
    apiKey: 'PRIVATE_API_KEY',
    transport: async () => ({
      status: 200,
      body: JSON.stringify({ choices: [{ message: { content: 'Just use a clearer prompt.' } }] }),
    }),
  });
  assert.deepEqual(result, {
    ok: false,
    code: 'invalid-output',
    issues: ['optimizer output did not match the strict response contract'],
  });
});

test('optimizer stale consent fails before transport', async () => {
  const prepared = prepareOptimizerInvocation(base);
  let calls = 0;
  const result = await requestPreparedOptimizer(prepared, {
    apiKey: 'PRIVATE_API_KEY',
    expectedConsentGeneration: 3,
    transport: async () => {
      calls += 1;
      return { status: 200, body: '{}' };
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'transport-error');
  assert.equal(calls, 0);
});
