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
  let captured = '';
  const result = await sendPreparedAdvicePayload(first, async (body, contentType) => {
    captured = body;
    assert.equal(contentType, 'application/json');
    return 'sent';
  });
  assert.equal(result, 'sent');
  assert.equal(preview.body, first.serializedBody);
  assert.equal(captured, preview.body);
  assert.equal(first.serializedBody, second.serializedBody);
  assert.equal(JSON.stringify(input), before, 'payload preparation must not mutate input');
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
