import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  AdviceEvidencePreparationRequest,
  planAdviceEvidencePreparation,
} from '../adviceEffectiveness/evidencePreparation';

function request(
  overrides: Partial<AdviceEvidencePreparationRequest> = {},
): AdviceEvidencePreparationRequest {
  return {
    featureMode: 'enabled',
    operation: 'preview',
    dataMode: 'aggregates-only',
    aggregateAvailable: true,
    aggregateConsent: 'explicit',
    promptPersonalizationConsent: 'not-granted',
    requestedWindowDays: 30,
    ...overrides,
  };
}

test('disabled advice preparation requests no aggregate or content work', () => {
  const plan = planAdviceEvidencePreparation(request({
    featureMode: 'disabled',
    dataMode: 'aggregates-with-prompt-samples',
    aggregateAvailable: false,
    aggregateConsent: 'not-granted',
    promptPersonalizationConsent: 'not-granted',
  }));

  assert.deepEqual(plan, {
    schemaVersion: 1,
    status: 'disabled',
    dataMode: 'local-only',
    reason: 'feature-disabled',
    requiredHostAction: 'none',
    allowAutomaticScan: false,
  });
});

test('local render and aggregates-only preview never require content analysis', () => {
  const local = planAdviceEvidencePreparation(request({
    operation: 'local-render',
    dataMode: 'local-only',
    aggregateConsent: 'not-granted',
  }));
  assert.equal(local.status, 'ready');
  assert.equal(local.reason, 'local-evidence-ready');
  assert.equal(local.requiredHostAction, 'none');
  assert.equal(local.allowAutomaticScan, false);

  const aggregate = planAdviceEvidencePreparation(request({
    contentSnapshot: {
      status: 'stale',
      windowDays: 7,
      promptSampleCount: 0,
    },
  }));
  assert.equal(aggregate.status, 'ready');
  assert.equal(aggregate.reason, 'aggregate-evidence-ready');
  assert.equal(aggregate.requiredHostAction, 'none');
  assert.equal(aggregate.allowAutomaticScan, false);
});

test('personalized preparation cannot request work before both consents', () => {
  const noAggregateConsent = planAdviceEvidencePreparation(request({
    dataMode: 'aggregates-with-prompt-samples',
    aggregateConsent: 'not-granted',
    promptPersonalizationConsent: 'explicit',
  }));
  assert.equal(noAggregateConsent.status, 'blocked');
  assert.equal(noAggregateConsent.reason, 'aggregate-consent-required');
  assert.equal(noAggregateConsent.requiredHostAction, 'none');

  const noPromptConsent = planAdviceEvidencePreparation(request({
    dataMode: 'aggregates-with-prompt-samples',
    promptPersonalizationConsent: 'not-granted',
  }));
  assert.equal(noPromptConsent.status, 'blocked');
  assert.equal(noPromptConsent.reason, 'prompt-personalization-consent-required');
  assert.equal(noPromptConsent.requiredHostAction, 'none');
  assert.equal(noPromptConsent.allowAutomaticScan, false);
});

test('personalized preparation asks the host for one explicit refresh only when needed', () => {
  const base = {
    dataMode: 'aggregates-with-prompt-samples' as const,
    promptPersonalizationConsent: 'explicit' as const,
  };
  for (const [contentSnapshot, reason] of [
    [undefined, 'content-snapshot-missing'],
    [{ status: 'stale', windowDays: 30, promptSampleCount: 3 }, 'content-snapshot-stale'],
    [{ status: 'ready', windowDays: 7, promptSampleCount: 3 }, 'content-window-mismatch'],
  ] as const) {
    const plan = planAdviceEvidencePreparation(request({ ...base, contentSnapshot }));
    assert.equal(plan.status, 'explicit-refresh-required');
    assert.equal(plan.reason, reason);
    assert.equal(plan.requiredHostAction, 'refresh-content-analysis');
    assert.equal(plan.allowAutomaticScan, false);
  }
});

test('personalized preparation is ready only for a matching materialized snapshot', () => {
  const ready = planAdviceEvidencePreparation(request({
    operation: 'send',
    dataMode: 'aggregates-with-prompt-samples',
    promptPersonalizationConsent: 'explicit',
    contentSnapshot: {
      status: 'ready',
      windowDays: 30,
      promptSampleCount: 4,
    },
  }));
  assert.equal(ready.status, 'ready');
  assert.equal(ready.reason, 'personalized-evidence-ready');
  assert.equal(ready.requiredHostAction, 'none');
  assert.equal(ready.allowAutomaticScan, false);

  const empty = planAdviceEvidencePreparation(request({
    dataMode: 'aggregates-with-prompt-samples',
    promptPersonalizationConsent: 'explicit',
    contentSnapshot: {
      status: 'ready',
      windowDays: 30,
      promptSampleCount: 0,
    },
  }));
  assert.equal(empty.status, 'blocked');
  assert.equal(empty.reason, 'prompt-samples-unavailable');
  assert.equal(empty.requiredHostAction, 'none');
});

test('invalid preparation combinations fail closed without work', () => {
  const invalid = planAdviceEvidencePreparation(request({
    operation: 'local-render',
    dataMode: 'aggregates-only',
  }));
  assert.equal(invalid.status, 'blocked');
  assert.equal(invalid.reason, 'invalid-request');
  assert.equal(invalid.requiredHostAction, 'none');
  assert.equal(invalid.allowAutomaticScan, false);
});
