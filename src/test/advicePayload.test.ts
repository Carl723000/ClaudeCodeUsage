import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  buildAdviceAggregateSnapshot,
  prepareAdvicePayload,
  previewAdvicePayload,
  sendPreparedAdvicePayload,
} from '../adviceEffectiveness/payload';
import { payloadInputFixture, usageFixture } from './adviceTestFixtures';

test('builds a coarse aggregate without retaining full or custom model names', () => {
  const aggregate = buildAdviceAggregateSnapshot(usageFixture, 'overall', 30);
  assert.deepEqual(aggregate.modelFamilies.map((row) => row.family), ['other', 'sonnet']);
  assert.doesNotMatch(JSON.stringify(aggregate), /private-router|20250514/);
});

test('defaults to aggregates-only and omits the promptSamples field entirely', () => {
  const prepared = prepareAdvicePayload(payloadInputFixture());
  const parsed = JSON.parse(prepared.serializedBody) as Record<string, unknown>;
  assert.equal(prepared.dataMode, 'aggregates-only');
  assert.equal(prepared.promptSampleCount, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, 'promptSamples'), false);
});

test('preview and sender consume the exact same canonical serialization', async () => {
  const input = payloadInputFixture();
  const before = JSON.stringify(input);
  const first = prepareAdvicePayload(input);
  const second = prepareAdvicePayload(input);
  const preview = previewAdvicePayload(first);
  let captured: Uint8Array | undefined;
  const result = await sendPreparedAdvicePayload(first, async (canonicalBytes, contentType, sha256) => {
    captured = canonicalBytes;
    assert.equal(contentType, 'application/json');
    assert.equal(sha256, first.sha256);
    return 'sent';
  });
  assert.equal(result, 'sent');
  assert.equal(preview.body, first.serializedBody);
  assert.strictEqual(captured, first.canonicalBytes);
  assert.equal(Buffer.from(first.canonicalBytes).toString('utf8'), preview.body);
  assert.equal(preview.sha256, first.sha256);
  assert.equal(first.serializedBody, second.serializedBody);
  assert.deepEqual(first.canonicalBytes, second.canonicalBytes);
  assert.equal(first.sha256, second.sha256);
  assert.equal(JSON.stringify(input), before, 'payload preparation must not mutate input');
});

test('preview and sender reject any mutation of the sealed body, bytes, or digest', async () => {
  const bodyMutation = prepareAdvicePayload(payloadInputFixture());
  bodyMutation.serializedBody = '{"mutated":true}';
  assert.throws(() => previewAdvicePayload(bodyMutation), /integrity check failed/);
  await assert.rejects(
    () => sendPreparedAdvicePayload(bodyMutation, async () => 'sent'),
    /integrity check failed/,
  );

  const byteMutation = prepareAdvicePayload(payloadInputFixture());
  byteMutation.canonicalBytes[0] ^= 1;
  assert.throws(() => previewAdvicePayload(byteMutation), /integrity check failed/);

  const digestMutation = prepareAdvicePayload(payloadInputFixture());
  digestMutation.sha256 = '0'.repeat(64);
  assert.throws(() => previewAdvicePayload(digestMutation), /integrity check failed/);
});

test('prompt text appears only behind the separate explicit opt-in and is bounded', () => {
  const input = payloadInputFixture();
  input.promptSamples = {
    consent: 'explicit',
    samples: [{ text: `private prompt ${'x'.repeat(2_000)}` }],
  };
  const prepared = prepareAdvicePayload(input);
  const parsed = JSON.parse(prepared.serializedBody) as {
    promptSamples: { text: string }[];
    privacy: { promptSampleConsent: string };
  };
  assert.equal(prepared.dataMode, 'aggregates-with-prompt-samples');
  assert.equal(parsed.privacy.promptSampleConsent, 'explicit');
  assert.equal(parsed.promptSamples.length, 1);
  assert.equal(parsed.promptSamples[0].text.length, 1_000);
});

test('invalid aggregates and empty explicit prompt consent fail before a payload exists', () => {
  const invalid = payloadInputFixture();
  invalid.aggregate.totals.inputTokens = Number.NaN;
  assert.throws(() => prepareAdvicePayload(invalid), /finite non-negative/);

  const empty = payloadInputFixture();
  empty.promptSamples = { consent: 'explicit', samples: [{ text: '   ' }] };
  assert.throws(() => prepareAdvicePayload(empty), /at least one non-empty/);
});

test('remote observations require reviewed metrics and sufficiently clean source evidence', () => {
  const unknownMetric = payloadInputFixture();
  unknownMetric.observations = [{ ...unknownMetric.observations[0], metric: 'private-user-name' }];
  assert.throws(() => prepareAdvicePayload(unknownMetric), /invalid observation metric/);

  const degraded = payloadInputFixture();
  degraded.sources = [{ ...degraded.sources[0], qualityFlags: ['partial-coverage'] }];
  assert.throws(() => prepareAdvicePayload(degraded), /unresolved source quality flags/);

  const unknownConfidence = payloadInputFixture();
  unknownConfidence.sources = [{ ...unknownConfidence.sources[0], confidence: 'unknown' }];
  assert.throws(() => prepareAdvicePayload(unknownConfidence), /source confidence/);
});
