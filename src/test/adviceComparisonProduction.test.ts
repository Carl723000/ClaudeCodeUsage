import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import Module = require('node:module');

import {
  CodexComparableTaskProjection,
  buildAppliedComparablePairs,
} from '../adviceEffectiveness/comparisonProduction';
import { adaptCodexLocalAdvice } from '../adviceEffectiveness/adapters';
import { createClosedAdviceLocalState } from '../adviceEffectiveness/versionedPersistence';

function projection(observedAtEpochMs: number, fresh: number): CodexComparableTaskProjection {
  return {
    observedAtEpochMs,
    total: { processed: fresh * 2, fresh },
    structural: {
      patchCalls: 1,
      toolCalls: 4,
      postPatchToolCalls: 2,
      taskCompleteCount: 1,
    },
    childFreshShare: 0,
    approvalReviewerFreshShare: 0,
    modelFamilies: ['other'],
    efforts: ['high'],
    coverage: { complete: true, identityComplete: true, qualityFlags: [] },
  };
}

test('pairs five real completed Codex task projections around the applied timestamp', () => {
  const input = {
    adviceId: 'advice-codex-30d-1',
    recommendationId: 'recommendation-codex-effort-comparison',
    recommendationVersion: 'codex-local-rule-v1',
    appliedAtEpochMs: 1_000,
    tasks: [
      ...Array.from({ length: 5 }, (_, index) => projection(100 + index, 100)),
      ...Array.from({ length: 5 }, (_, index) => projection(1_100 + index, 80)),
    ],
  };
  const before = JSON.stringify(input);
  const result = buildAppliedComparablePairs(input);
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(input), before, 'production must not mutate materialized projections');
  if (!result.ok) return;
  assert.equal(result.status, 'comparable');
  assert.equal(result.pairs.length, 5);
  assert.equal(result.pairs[0].context.scope, 'task-cohort');
  assert.equal(result.pairs[0].context.taskKind, 'small-change');
  assert.equal(result.pairs[0].context.measurementProfileVersion, 'codex-task-structural-v1');
  assert.equal(result.pairs[0].quality.beforePassed, 'passed');
  assert.equal(result.pairs[0].quality.afterPassed, 'passed');
  assert.doesNotMatch(JSON.stringify(result), /prompt|session|path|body/i);
});

test('fails closed to evidence-insufficient when tasks are incomplete, mixed, or unreliable', () => {
  const base = {
    adviceId: 'advice-codex-30d-1',
    recommendationId: 'recommendation-codex-effort-comparison',
    recommendationVersion: 'codex-local-rule-v1',
    appliedAtEpochMs: 1_000,
  };
  const unreliable = projection(1_100, 80);
  unreliable.coverage.qualityFlags = ['schema-drift'];
  const unknownEffort = projection(1_101, 80);
  unknownEffort.efforts = ['unknown'];
  const incomplete = projection(1_102, 80);
  incomplete.structural.taskCompleteCount = 0;
  const differentComplexity = projection(1_103, 500_000);

  const result = buildAppliedComparablePairs({
    ...base,
    tasks: [projection(100, 100), unreliable, unknownEffort, incomplete, differentComplexity],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.status, 'evidence-insufficient');
  assert.equal(result.pairs.length, 0);
});

test('rejects sensitive or unknown fields before creating observations', () => {
  const base = {
    adviceId: 'advice-codex-30d-1',
    recommendationId: 'recommendation-codex-effort-comparison',
    recommendationVersion: 'codex-local-rule-v1',
    appliedAtEpochMs: 1_000,
    tasks: [projection(100, 100), projection(1_100, 80)],
  };
  const hostile: unknown[] = [
    { ...base, prompt: 'PRIVATE_PROMPT' },
    { ...base, sessionId: 'PRIVATE_SESSION' },
    { ...base, projectPath: '/Users/private/project' },
    { ...base, body: 'PRIVATE_BODY' },
    (() => {
      const value = JSON.parse(JSON.stringify(base));
      value.tasks[0].title = 'PRIVATE_TITLE';
      return value;
    })(),
  ];
  for (const value of hostile) {
    const result = buildAppliedComparablePairs(value);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'invalid-input');
  }
});

function codexAdvice(insightKinds: Array<'effort-comparison' | 'post-patch-tool-intensity'>) {
  const result = adaptCodexLocalAdvice({
    adviceId: 'advice-codex-30d-1',
    generatedAt: '2026-08-30T00:00:00.000Z',
    locale: 'en',
    scope: '30d',
    insights: insightKinds.map((kind) => ({
      kind,
      severity: 'normal' as const,
      scope: '30d' as const,
      evidence: {},
      proxy: true as const,
    })),
    behavior: {
      childFreshShare: 0,
      approvalReviewerFreshShare: 0,
      highEffortFreshShare: 1,
      processedToFreshRatio: 2,
      cacheShare: 0.5,
      postPatchToolCallsPerPatchCall: 2,
    },
    quality: {
      indexComplete: true,
      identityComplete: true,
      periodComplete: true,
      qualityFlags: [],
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('advice fixture failed');
  return result.value.contract;
}

function withWebview<T>(run: (provider: any) => T): T {
  const originalLoad = (Module as any)._load;
  (Module as any)._load = function(request: string, parent: unknown, isMain: boolean) {
    if (request === 'vscode') {
      return { workspace: { workspaceFolders: [] } };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const { UsageWebviewProvider } = require('../webview') as typeof import('../webview');
    const provider = new UsageWebviewProvider({} as any) as any;
    provider.settings = { get: (key: string) => key === 'advice.effectiveness.enabled' };
    provider.adviceLocalStateStatus = 'ready';
    return run(provider);
  } finally {
    (Module as any)._load = originalLoad;
  }
}

test('webview materializes bounded pairs and a frozen result from the existing Codex view only', () => {
  withWebview((provider) => {
    const contract = codexAdvice(['effort-comparison']);
    provider.adviceEffectivenessStates = {
      codex: {
        provider: 'codex',
        contract,
        remotePreviewEligible: false,
        promptSamples: [],
      },
    };
    const local = createClosedAdviceLocalState();
    local.featureMode = 'enabled';
    local.feedback.push({
      adviceId: contract.adviceId,
      recommendationId: contract.recommendations[0].id,
      rating: 'helpful',
      applied: 'applied',
      appliedAtEpochMs: 1_000,
      updatedAtEpochMs: 1_000,
    });
    provider.adviceLocalState = local;
    provider.codexView = {
      recentThreads: [
        ...Array.from({ length: 5 }, (_, index) => ({
          rootTaskViewKey: `before-${index}`,
          role: 'root',
          observedAt: 100 + index,
          total: { processed: 200, fresh: 100, input: 100, cachedInput: 0, output: 0, reasoning: 0 },
          structural: { patchCalls: 1, toolCalls: 4, postPatchToolCalls: 2, compactCount: 0, taskCompleteCount: 1 },
          models: ['gpt-5'],
          efforts: ['high'],
        })),
        ...Array.from({ length: 5 }, (_, index) => ({
          rootTaskViewKey: `after-${index}`,
          role: 'root',
          observedAt: 1_100 + index,
          total: { processed: 160, fresh: 80, input: 80, cachedInput: 0, output: 0, reasoning: 0 },
          structural: { patchCalls: 1, toolCalls: 4, postPatchToolCalls: 2, compactCount: 0, taskCompleteCount: 1 },
          models: ['gpt-5'],
          efforts: ['high'],
        })),
      ],
      coverage: { complete: true, identity: { complete: true } },
      qualityFlags: [],
    };

    const next = provider.materializeAdviceComparisonState(2_000);
    assert.equal(next.comparablePairs.length, 5);
    assert.equal(next.comparisonResults.length, 1);
    assert.equal(next.comparisonResults[0].result.status, 'improved');
    assert.doesNotMatch(JSON.stringify(next.comparablePairs), /before-|after-|gpt-5|prompt|session|path|body/i);
  });
});

test('advice rendering gives every recommendation its own feedback and comparison boundary', () => {
  withWebview((provider) => {
    const contract = codexAdvice(['effort-comparison', 'post-patch-tool-intensity']);
    provider.adviceEffectivenessStates = {
      codex: {
        provider: 'codex',
        contract,
        remotePreviewEligible: false,
        promptSamples: [],
      },
    };
    provider.adviceLocalState = createClosedAdviceLocalState();
    const html = provider.renderAdviceEffectivenessBody('codex');
    for (const recommendation of contract.recommendations) {
      const matches = html.match(
        new RegExp(`<button[^>]+data-recommendation-id="${recommendation.id}"`, 'g'),
      ) ?? [];
      assert.equal(matches.length, 3, `${recommendation.id} needs three independent feedback buttons`);
    }
    assert.doesNotMatch(
      provider.renderAdviceEffectivenessBody.toString(),
      /recommendations\[0\]/,
      'the rendering boundary must not collapse the contract to its first recommendation',
    );
  });
});
