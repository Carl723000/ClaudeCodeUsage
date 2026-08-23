import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  CLAUDE_CLEAR_MIN_AFFECTED_SESSIONS,
  CLAUDE_CLEAR_MIN_AFFECTED_SHARE,
  adaptClaudeAdvice,
  adaptCodexLocalAdvice,
} from '../adviceEffectiveness/adapters';
import { prepareAdvicePayload } from '../adviceEffectiveness/payload';
import { payloadInputFixture } from './adviceTestFixtures';

function claudeInput() {
  const payload = payloadInputFixture();
  return {
    adviceId: 'advice-claude-window-1',
    generatedAt: '2026-08-24T08:00:00.000Z',
    locale: 'en',
    aggregate: payload.aggregate,
    sessionSummary: {
      scope: payload.aggregate.scope,
      windowDays: payload.aggregate.windowDays,
      totalSessions: 8,
      longSessionCount: 0,
      largeContextSessionCount: 0,
    },
  } as const;
}

test('Claude adapter creates guarded /clear advice only after the declared session threshold', () => {
  const input = claudeInput();
  const affected = Math.max(
    CLAUDE_CLEAR_MIN_AFFECTED_SESSIONS,
    Math.ceil(input.sessionSummary.totalSessions * CLAUDE_CLEAR_MIN_AFFECTED_SHARE),
  );
  const result = adaptClaudeAdvice({
    ...input,
    sessionSummary: { ...input.sessionSummary, longSessionCount: affected },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.remoteEvidenceEligible, true);
  assert.equal(result.value.contract.privacy.dataMode, 'local-only');
  assert.equal(result.value.contract.recommendations.length, 1);
  const recommendation = result.value.contract.recommendations[0];
  assert.deepEqual(recommendation.conditionalActions.map((action) => action.action), ['/clear']);
  assert.equal(recommendation.successCriteria.length, 1);
  assert.equal(recommendation.successCriteria[0].qualityGuardrail.rubricId, 'task-quality-rubric-v1');
  const prepared = prepareAdvicePayload({
    locale: result.value.contract.provenance.locale,
    aggregate: result.value.aggregate,
    sources: result.value.contract.provenance.sources,
    observations: result.value.contract.observations,
    evidence: result.value.contract.evidence,
  });
  assert.equal(prepared.dataMode, 'aggregates-only');

  const below = adaptClaudeAdvice({
    ...input,
    sessionSummary: {
      ...input.sessionSummary,
      longSessionCount: Math.max(0, affected - 1),
      largeContextSessionCount: Math.max(0, affected - 1),
    },
  });
  assert.equal(below.ok, true);
  if (below.ok) assert.deepEqual(below.value.contract.recommendations, []);

  const countOnly = adaptClaudeAdvice({
    ...input,
    sessionSummary: {
      ...input.sessionSummary,
      totalSessions: 20,
      longSessionCount: CLAUDE_CLEAR_MIN_AFFECTED_SESSIONS,
    },
  });
  assert.equal(countOnly.ok, true);
  if (countOnly.ok) assert.deepEqual(countOnly.value.contract.recommendations, []);

  const shareOnly = adaptClaudeAdvice({
    ...input,
    sessionSummary: {
      ...input.sessionSummary,
      totalSessions: 1,
      largeContextSessionCount: 1,
    },
  });
  assert.equal(shareOnly.ok, true);
  if (shareOnly.ok) assert.deepEqual(shareOnly.value.contract.recommendations, []);

  const contextTriggered = adaptClaudeAdvice({
    ...input,
    sessionSummary: { ...input.sessionSummary, largeContextSessionCount: affected },
  });
  assert.equal(contextTriggered.ok, true);
  if (contextTriggered.ok) {
    assert.equal(
      contextTriggered.value.contract.recommendations[0].successCriteria[0].metricObservationId,
      'observation-claude-large-context-share',
    );
  }
});

test('Claude adapter rejects a session summary from a different window or scope', () => {
  const input = claudeInput();
  const wrongWindow = adaptClaudeAdvice({
    ...input,
    sessionSummary: { ...input.sessionSummary, windowDays: input.aggregate.windowDays - 1 },
  });
  assert.equal(wrongWindow.ok, false);
  if (!wrongWindow.ok) {
    assert.deepEqual(wrongWindow.issues, ['claude-session-summary-scope-window-mismatch']);
  }

  const wrongScope = adaptClaudeAdvice({
    ...input,
    sessionSummary: { ...input.sessionSummary, scope: 'project' },
  });
  assert.equal(wrongScope.ok, false);
});

test('Claude adapter rebuilds its DTO and cannot retain injected paths, sessions, prompts, or raw model fields', () => {
  const privateSentinel = '/Users/private/project/PRIVATE_SESSION prompt';
  const input = claudeInput() as ReturnType<typeof claudeInput> & Record<string, unknown>;
  input.sessionId = privateSentinel;
  (input.aggregate as unknown as Record<string, unknown>).projectPath = privateSentinel;
  (input.aggregate.modelFamilies[0] as unknown as Record<string, unknown>).rawModel = privateSentinel;
  (input.sessionSummary as unknown as Record<string, unknown>).prompt = privateSentinel;

  const result = adaptClaudeAdvice(input);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(JSON.stringify(result.value).includes(privateSentinel), false);
});

test('Claude framework-overhead seam emits only a numeric proxy and never creates writing advice', () => {
  const input = claudeInput();
  const result = adaptClaudeAdvice({
    ...input,
    frameworkOverhead: {
      frameworkEstimatedTokens: 300,
      observedInputEstimatedTokens: 2_000,
      classifiedEvents: 5,
      prompt: 'PRIVATE_FRAMEWORK_PROMPT',
      toolResultText: 'PRIVATE_TOOL_RESULT_BODY',
    } as {
      frameworkEstimatedTokens: number;
      observedInputEstimatedTokens: number;
      classifiedEvents: number;
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const observation = result.value.contract.observations.find(
    (item) => item.metric === 'framework-overhead-share',
  );
  assert.deepEqual(
    observation && { value: observation.value, unit: observation.unit, method: observation.method },
    { value: 0.15, unit: 'ratio', method: 'structural-proxy' },
  );
  assert.deepEqual(result.value.contract.recommendations, []);
  assert.equal(JSON.stringify(result.value).includes('PRIVATE_FRAMEWORK_PROMPT'), false);
  assert.equal(JSON.stringify(result.value).includes('PRIVATE_TOOL_RESULT_BODY'), false);
  const prepared = prepareAdvicePayload({
    locale: result.value.contract.provenance.locale,
    aggregate: result.value.aggregate,
    sources: result.value.contract.provenance.sources,
    observations: result.value.contract.observations,
    evidence: result.value.contract.evidence,
  });
  assert.match(prepared.serializedBody, /framework-overhead-share/);
  assert.doesNotMatch(prepared.serializedBody, /PRIVATE_FRAMEWORK_PROMPT|PRIVATE_TOOL_RESULT_BODY/);

  const invalid = adaptClaudeAdvice({
    ...input,
    frameworkOverhead: {
      frameworkEstimatedTokens: -1,
      observedInputEstimatedTokens: 1,
      classifiedEvents: 1,
    },
  });
  assert.equal(invalid.ok, false);

  const fractionalEvents = adaptClaudeAdvice({
    ...input,
    frameworkOverhead: {
      frameworkEstimatedTokens: 1,
      observedInputEstimatedTokens: 2,
      classifiedEvents: 1.5,
    },
  });
  assert.equal(fractionalEvents.ok, false);

  const impossibleShare = adaptClaudeAdvice({
    ...input,
    frameworkOverhead: {
      frameworkEstimatedTokens: 2,
      observedInputEstimatedTokens: 1,
      classifiedEvents: 1,
    },
  });
  assert.equal(impossibleShare.ok, false);
});

function codexInput() {
  return {
    adviceId: 'advice-codex-window-1',
    generatedAt: '2026-08-24T08:00:00.000Z',
    locale: 'en',
    scope: '30d' as const,
    insights: [
      {
        kind: 'effort-comparison' as const,
        severity: 'normal' as const,
        scope: '30d' as const,
        evidence: {
          observedEffort: 'PRIVATE_EFFORT_SENTINEL',
          highEffortFresh: 700,
          lowMediumEffortFresh: 300,
        },
        proxy: true as const,
      },
      {
        kind: 'cache-context' as const,
        severity: 'info' as const,
        scope: '30d' as const,
        evidence: { processedToFreshRatio: 3, cachedInputShare: 0.7 },
        proxy: true as const,
      },
    ],
    behavior: {
      childFreshShare: 0.2,
      approvalReviewerFreshShare: 0.1,
      highEffortFreshShare: 0.7,
      processedToFreshRatio: 3,
      cacheShare: 0.7,
      postPatchToolCallsPerPatchCall: 4,
    },
    quality: {
      indexComplete: true,
      identityComplete: true,
      periodComplete: true,
      qualityFlags: [] as string[],
    },
  };
}

test('Codex adapter is local-only, maps reviewed behavior numbers, and drops observedEffort text', () => {
  const result = adaptCodexLocalAdvice(codexInput());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.remoteEvidenceEligible, false);
  assert.equal(result.value.contract.privacy.dataMode, 'local-only');
  const serialized = JSON.stringify(result.value);
  assert.equal(serialized.includes('PRIVATE_EFFORT_SENTINEL'), false);
  assert.deepEqual(
    result.value.contract.observations.map((item) => [item.metric, item.unit, item.value]),
    [
      ['high-effort-share', 'ratio', 0.7],
      ['processed-to-fresh-ratio', 'multiple', 3],
      ['cache-read-share', 'ratio', 0.7],
    ],
  );
  assert.equal(result.value.contract.recommendations.length, 2);
});

test('Codex adapter preserves incomplete evidence locally but blocks scope mismatches and unsafe quality flags', () => {
  const partial = codexInput();
  partial.quality.indexComplete = false;
  const partialResult = adaptCodexLocalAdvice(partial);
  assert.equal(partialResult.ok, true);
  if (partialResult.ok) {
    assert.equal(partialResult.value.contract.provenance.sources[0].confidence, 'unknown');
    assert.deepEqual(partialResult.value.contract.provenance.sources[0].qualityFlags, ['incomplete-index']);
  }

  const mismatched = codexInput();
  (mismatched.insights[0] as { scope: string }).scope = '7d';
  const mismatchResult = adaptCodexLocalAdvice(mismatched);
  assert.equal(mismatchResult.ok, false);

  const unsafe = codexInput();
  unsafe.quality.qualityFlags = ['/Users/private/project'];
  const unsafeResult = adaptCodexLocalAdvice(unsafe);
  assert.equal(unsafeResult.ok, false);
});

test('prepared payload accepts a reviewed ratio expressed as an unbounded multiple', () => {
  const input = payloadInputFixture();
  input.observations = [
    {
      ...input.observations[0],
      id: 'observation-processed-fresh',
      metric: 'processed-to-fresh-ratio',
      value: 3,
      unit: 'multiple',
      method: 'structural-proxy',
    },
  ];
  input.evidence = [
    {
      ...input.evidence[0],
      observationIds: ['observation-processed-fresh'],
      strength: 'proxy',
      limitations: ['advice.limitation.codex.structural-proxy'],
    },
  ];
  const prepared = prepareAdvicePayload(input);
  assert.match(prepared.serializedBody, /"unit":"multiple"/);
  assert.match(prepared.serializedBody, /"value":3/);
});
