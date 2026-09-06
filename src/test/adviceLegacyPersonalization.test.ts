import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  buildLegacyPersonalizationDraft,
  LegacyPersonalizationDraft,
  projectLegacyPersonalization,
} from '../adviceEffectiveness/legacyPersonalization';

const NOW = Date.parse('2026-08-27T12:00:00.000Z');

test('legacy user context and prompt samples remain host-only without separate consent', () => {
  const draft = buildLegacyPersonalizationDraft({
    promptWindowDays: 30,
    userContext: '  PRIVATE_CONTEXT  ',
    promptSamples: [{
      text: 'PRIVATE_PROMPT',
      observedAtEpochMs: NOW - 2 * 86_400_000,
      cwd: '/private/workspace',
      sessionId: 'private-session',
    }],
    nowEpochMs: NOW,
  });
  assert.equal(draft.ok, true);
  if (!draft.ok) return;

  assert.equal(projectLegacyPersonalization(draft.value, 'not-granted'), undefined);
  assert.equal(draft.value.migration.requiresExplicitPromptPersonalizationConsent, true);
  assert.equal(draft.value.migration.userContextChars, 'PRIVATE_CONTEXT'.length);
  assert.equal(draft.value.migration.promptSampleCount, 1);
  assert.deepEqual(draft.value.migration.sampleAge, {
    withinWindow: 1,
    olderThanWindow: 0,
    unknown: 0,
  });
  assert.doesNotMatch(JSON.stringify(draft.value.migration), /PRIVATE_|workspace|session/);
});

test('explicit projection rebuilds an exact allowlisted personalization object', () => {
  const draft = buildLegacyPersonalizationDraft({
    promptWindowDays: 30,
    userContext: '  Project uses a strict review rubric.  ',
    promptSamples: [
      { text: '  Please review this change.  ', observedAtEpochMs: NOW - 5 * 86_400_000 },
      { text: 'Older sample', observedAtEpochMs: NOW - 40 * 86_400_000 },
      { text: 'Unknown age' },
    ],
    nowEpochMs: NOW,
  });
  assert.equal(draft.ok, true);
  if (!draft.ok) return;

  const projected = projectLegacyPersonalization(draft.value, 'explicit');
  assert.deepEqual(projected, {
    schemaVersion: 1,
    consent: 'explicit',
    windowDays: 30,
    userContext: 'Project uses a strict review rubric.',
    promptSamples: [
      { text: 'Please review this change.', age: 'within-window' },
      { text: 'Older sample', age: 'older-than-window' },
      { text: 'Unknown age', age: 'unknown' },
    ],
  });
});

test('legacy personalization uses payload bounds and exposes truncation in migration metadata', () => {
  const draft = buildLegacyPersonalizationDraft({
    promptWindowDays: 30,
    userContext: `context-${'x'.repeat(2_000)}`,
    promptSamples: Array.from({ length: 25 }, (_value, index) => ({
      text: `sample-${index}-${'y'.repeat(2_000)}`,
      observedAtEpochMs: NOW,
    })),
    nowEpochMs: NOW,
  });
  assert.equal(draft.ok, true);
  if (!draft.ok) return;

  const projected = projectLegacyPersonalization(draft.value, 'explicit');
  assert.ok(projected);
  assert.equal(projected.userContext?.length, 1_000);
  assert.equal(projected.promptSamples.length, 12);
  assert.equal(
    projected.promptSamples.reduce((sum, sample) => sum + sample.text.length, 0),
    12_000,
  );
  assert.equal(draft.value.migration.userContextTruncated, true);
  assert.equal(draft.value.migration.promptSamplesTruncated, true);
});

test('legacy personalization rejects invalid windows and timestamps without retaining content', () => {
  for (const input of [
    {
      promptWindowDays: 0,
      userContext: 'PRIVATE_CONTEXT',
      promptSamples: [],
      nowEpochMs: NOW,
    },
    {
      promptWindowDays: 30,
      userContext: '',
      promptSamples: [{ text: 'PRIVATE_PROMPT', observedAtEpochMs: Number.NaN }],
      nowEpochMs: NOW,
    },
  ]) {
    const result = buildLegacyPersonalizationDraft(input);
    assert.deepEqual(result, { ok: false, reason: 'invalid-legacy-personalization' });
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_/);
  }
});

test('legacy personalization projection revalidates a hostile in-memory draft', () => {
  const hostile = {
    schemaVersion: 1,
    windowDays: 30,
    userContext: 'PRIVATE_CONTEXT',
    promptSamples: [{
      text: 'PRIVATE_PROMPT',
      age: 'within-window',
      cwd: '/private/workspace',
    }],
    migration: {
      requiresExplicitPromptPersonalizationConsent: true,
      userContextChars: 15,
      userContextTruncated: false,
      promptSampleCount: 1,
      promptSamplesTruncated: false,
      sampleAge: { withinWindow: 1, olderThanWindow: 0, unknown: 0 },
    },
  } as unknown as LegacyPersonalizationDraft;

  assert.equal(projectLegacyPersonalization(hostile, 'explicit'), undefined);
});
