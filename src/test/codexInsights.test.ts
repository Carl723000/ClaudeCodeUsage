import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  buildCodexInsights,
  pasteReadyConstraint,
} from '../providers/codex/codexInsights';
import { CodexUsageScopeView } from '../providers/codex/codexUsage';

function scope(
  overrides: Partial<CodexUsageScopeView> = {},
): CodexUsageScopeView {
  return {
    total: {
      processed: 1_200,
      fresh: 400,
      input: 1_000,
      cachedInput: 800,
      output: 200,
      reasoning: 120,
    },
    rootTasks: 1,
    threads: 1,
    childThreads: 0,
    childProcessedShare: 0,
    childFreshShare: 0,
    approvalReviewerThreads: 0,
    approvalReviewerFreshShare: 0,
    cacheShare: 0.8,
    durationMs: 600_000,
    structural: {
      patchCalls: 1,
      toolCalls: 2,
      postPatchToolCalls: 1,
      compactCount: 0,
      taskCompleteCount: 1,
    },
    models: [],
    efforts: [{ key: 'high', totals: { processed: 1_200, fresh: 400, input: 1_000, cachedInput: 800, output: 200, reasoning: 120 } }],
    ...overrides,
  };
}

test('multi-agent tax uses fresh share and evidence', () => {
  const insights = buildCodexInsights(
    scope({
      childThreads: 5,
      childProcessedShare: 0.8,
      childFreshShare: 0.72,
    }),
  );
  assert.deepEqual(insights[0], {
    kind: 'multi-agent-tax',
    severity: 'strong',
    evidence: {
      childThreads: 5,
      childProcessedShare: 0.8,
      childFreshShare: 0.72,
      durationMs: 600_000,
    },
  });
});

test('auto-review is never labelled independent code review', () => {
  const text = JSON.stringify(
    buildCodexInsights(
      scope({
        approvalReviewerThreads: 2,
        approvalReviewerFreshShare: 0.35,
      }),
    ),
  );
  assert.doesNotMatch(text, /independent code review/i);
  assert.match(text, /approval-reviewer/);
});

test('post-patch tool calls are explicitly a structural proxy', () => {
  const base = scope();
  const insight = buildCodexInsights({
    ...base,
    structural: {
      ...base.structural,
      postPatchToolCalls: 6,
      patchCalls: 2,
    },
  }).find((item) => item.kind === 'post-patch-tool-call-intensity');

  assert.equal(insight?.proxy, true);
  assert.equal(insight?.evidence.postPatchToolCalls, 6);
});

test('small high-effort changes recommend comparison without claiming causality', () => {
  const insight = buildCodexInsights(scope()).find(
    (item) => item.kind === 'effort-comparison',
  );

  assert.equal(insight?.evidence.effort, 'high');
  assert.equal(insight?.evidence.compareOneLevelLower, 1);
});

test('high processed-to-fresh ratio explains cache without premature split advice', () => {
  const insight = buildCodexInsights(scope()).find(
    (item) => item.kind === 'cache-context',
  );

  assert.equal(insight?.severity, 'info');
  assert.equal(insight?.evidence.splitCandidate, 0);
});

test('paste-ready constraints are fixed local text derived only from insight kinds', () => {
  const text = pasteReadyConstraint(
    buildCodexInsights(
      scope({ childThreads: 4, childFreshShare: 0.6, childProcessedShare: 0.7 }),
    ),
  );

  assert.match(text, /Do not start unnecessary subagents/);
  assert.match(text, /one focused test.*one full test pass/i);
  assert.match(text, /Stop when the acceptance criteria pass/i);
  assert.match(text, /production-grade hardening/i);
});
