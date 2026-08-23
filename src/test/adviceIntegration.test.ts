import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { createAdviceContract } from '../adviceEffectiveness/contract';
import {
  AdviceEffectivenessProviderState,
  prepareAdviceSnapshot,
} from '../adviceEffectiveness/integration';
import {
  buildAdviceAggregateSnapshot,
  sendPreparedAdvicePayload,
} from '../adviceEffectiveness/payload';
import {
  evidenceFixture,
  observationFixture,
  sourceFixture,
  usageFixture,
} from './adviceTestFixtures';

function state(provider: 'claude' | 'codex' = 'claude'): AdviceEffectivenessProviderState {
  const built = createAdviceContract({
    adviceId: `advice-${provider}-integration`,
    observations: [observationFixture],
    evidence: [evidenceFixture],
    recommendations: [],
    privacy: {
      dataMode: 'local-only',
      promptSampleConsent: 'not-applicable',
      promptSampleCount: 0,
      feedbackStorage: 'local-only',
    },
    provenance: {
      generatedBy: { kind: 'local-rules' },
      generatedAt: '2026-08-24T08:00:00.000Z',
      locale: 'zh-CN',
      sources: [sourceFixture],
    },
  });
  if (!built.ok) throw new Error(built.issues.join(', '));
  assert.equal(built.ok, true);
  return {
    provider,
    contract: built.value,
    remotePreviewEligible: provider === 'claude',
    aggregate:
      provider === 'claude' ? buildAdviceAggregateSnapshot(usageFixture, 'overall', 30) : undefined,
    promptSamples: [{ text: '请核对这个非 ASCII 样本' }],
  };
}

test('sealed snapshot requires separate aggregate consent and defaults to no prompts', () => {
  const denied = prepareAdviceSnapshot(state(), {
    aggregate: 'not-granted',
    promptSamples: 'explicit',
  });
  assert.deepEqual(denied, { ok: false, reason: 'aggregate-consent-required' });

  const result = prepareAdviceSnapshot(state(), {
    aggregate: 'explicit',
    promptSamples: 'not-granted',
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.preview.body, result.value.prepared.serializedBody);
  assert.equal(result.value.preview.dataMode, 'aggregates-only');
  assert.equal(result.value.preview.body.includes('promptSamples'), false);
});

test('prompt text enters only the explicitly opted-in sealed body and UTF-8 bytes are exact', () => {
  const result = prepareAdviceSnapshot(state(), {
    aggregate: 'explicit',
    promptSamples: 'explicit',
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.preview.body, result.value.prepared.serializedBody);
  assert.equal(result.value.preview.dataMode, 'aggregates-with-prompt-samples');
  assert.equal(result.value.preview.promptSampleCount, 1);
  assert.equal(
    result.value.preview.utf8Bytes,
    Buffer.byteLength(result.value.prepared.serializedBody, 'utf8'),
  );
  assert.ok(result.value.preview.utf8Bytes > result.value.preview.body.length);
});

test('sealed snapshot preview, digest, and future sender share one canonical UTF-8 byte sequence', async () => {
  const result = prepareAdviceSnapshot(state(), {
    aggregate: 'explicit',
    promptSamples: 'explicit',
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const { prepared, preview } = result.value;
  const expectedDigest = createHash('sha256')
    .update(prepared.canonicalBytes)
    .digest('hex');
  assert.equal(preview.body, Buffer.from(prepared.canonicalBytes).toString('utf8'));
  assert.equal(preview.utf8Bytes, prepared.canonicalBytes.byteLength);
  assert.equal(preview.sha256, expectedDigest);
  assert.equal(prepared.sha256, expectedDigest);

  let sentBytes: Uint8Array | undefined;
  const response = await sendPreparedAdvicePayload(
    prepared,
    async (canonicalBytes, contentType, sha256) => {
      sentBytes = canonicalBytes;
      assert.equal(contentType, 'application/json');
      assert.equal(sha256, expectedDigest);
      return 'ok';
    },
  );
  assert.equal(response, 'ok');
  assert.strictEqual(sentBytes, prepared.canonicalBytes);
});

test('Codex evidence stays local until a provider-discriminated remote aggregate exists', () => {
  const result = prepareAdviceSnapshot(state('codex'), {
    aggregate: 'explicit',
    promptSamples: 'not-granted',
  });
  assert.deepEqual(result, { ok: false, reason: 'provider-not-eligible' });
});
