import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  ComparableObservation,
  ComparablePairBuildInput,
  buildComparableTaskPair,
} from '../adviceEffectiveness/comparisonPairing';

function observation(value: number, observedAtEpochMs: number): ComparableObservation {
  return {
    context: {
      scope: 'task-cohort',
      taskKind: 'small-change',
      complexityBand: 'medium',
      provider: 'codex',
      modelFamily: 'other',
      effort: 'high',
      measurementProfileVersion: 'codex-aggregate-v1',
      metricDefinitionVersion: 'fresh-tokens-v1',
      qualityRubricId: 'task-quality-v1',
    },
    metric: {
      name: 'fresh-tokens',
      unit: 'tokens',
      direction: 'lower-is-better',
      value,
    },
    quality: { score: 0.9, passed: 'passed', evidenceCount: 2 },
    evidence: { coverage: 'complete', confidence: 'high', qualityFlags: [] },
    observedAtEpochMs,
  };
}

function input(): ComparablePairBuildInput {
  return {
    adviceId: 'advice-day-2',
    recommendationId: 'reduce-fresh-tokens',
    recommendationVersion: 'recommendation-v1',
    before: observation(1_000, 1_777_000_000_000),
    after: observation(800, 1_777_086_400_000),
    recordedAtEpochMs: 1_777_086_400_001,
  };
}

test('builds a deterministic comparable pair from matching sanitized observations only', () => {
  const candidate = input();
  const before = JSON.stringify(candidate);
  const first = buildComparableTaskPair(candidate);
  const second = buildComparableTaskPair(candidate);
  assert.equal(first.ok, true);
  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(candidate), before, 'pairing must not mutate observations');
  if (!first.ok) return;
  assert.match(first.value.pairId, /^pair-[a-f0-9]{32}$/);
  assert.equal(first.value.context.scope, 'task-cohort');
  assert.equal(first.value.context.measurementProfileVersion, 'codex-aggregate-v1');
  assert.equal(first.value.recommendationVersion, 'recommendation-v1');
  assert.equal(first.value.metric.beforeValue, 1_000);
  assert.equal(first.value.metric.afterValue, 800);
  assert.doesNotMatch(
    JSON.stringify(first.value),
    /prompt|session|path|body/i,
    'the persisted pair is aggregate-only and content-free',
  );
});

test('returns evidence-insufficient for every mismatched comparison dimension', () => {
  const mismatches: Array<(candidate: ComparablePairBuildInput) => void> = [
    (candidate) => { candidate.after.context.scope = 'project'; },
    (candidate) => { candidate.after.context.taskKind = 'feature'; },
    (candidate) => { candidate.after.context.complexityBand = 'high'; },
    (candidate) => { candidate.after.context.provider = 'claude'; },
    (candidate) => { candidate.after.context.modelFamily = 'sonnet'; },
    (candidate) => { candidate.after.context.effort = 'medium'; },
    (candidate) => { candidate.after.context.measurementProfileVersion = 'codex-aggregate-v2'; },
    (candidate) => { candidate.after.context.metricDefinitionVersion = 'fresh-tokens-v2'; },
    (candidate) => { candidate.after.context.qualityRubricId = 'task-quality-v2'; },
    (candidate) => { candidate.after.metric.name = 'processed-tokens'; },
    (candidate) => { candidate.after.metric.unit = 'count'; },
    (candidate) => { candidate.after.metric.direction = 'higher-is-better'; },
  ];

  for (const change of mismatches) {
    const candidate = input();
    change(candidate);
    const result = buildComparableTaskPair(candidate);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'evidence-insufficient');
  }
});

test('returns explicit evidence-insufficient issues for unreliable observations', () => {
  const cases: Array<{
    issue: string;
    change: (candidate: ComparablePairBuildInput) => void;
  }> = [
    { issue: 'incomplete-coverage', change: (candidate) => { candidate.before.evidence.coverage = 'partial'; } },
    { issue: 'insufficient-confidence', change: (candidate) => { candidate.after.evidence.confidence = 'low'; } },
    { issue: 'unresolved-quality-flags', change: (candidate) => { candidate.after.evidence.qualityFlags = ['schema-drift']; } },
    { issue: 'unknown-quality-result', change: (candidate) => { candidate.after.quality.passed = 'unknown'; } },
    { issue: 'missing-quality-evidence', change: (candidate) => { candidate.before.quality.evidenceCount = 0; } },
    { issue: 'failed-quality-baseline', change: (candidate) => { candidate.before.quality.passed = 'failed'; } },
    { issue: 'unknown-effort', change: (candidate) => {
      candidate.before.context.effort = 'unknown';
      candidate.after.context.effort = 'unknown';
    } },
    { issue: 'zero-metric-baseline', change: (candidate) => { candidate.before.metric.value = 0; } },
    { issue: 'invalid-observation-order', change: (candidate) => { candidate.after.observedAtEpochMs = candidate.before.observedAtEpochMs; } },
  ];

  for (const { issue, change } of cases) {
    const candidate = input();
    change(candidate);
    const result = buildComparableTaskPair(candidate);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'evidence-insufficient');
      assert.ok(result.issues.includes(issue as never), `${issue} should be explicit`);
    }
  }
});

test('rejects prompt, session, path, body, and any other unknown field at every boundary', () => {
  const hostileValues: unknown[] = [
    { ...input(), prompt: 'PRIVATE_PROMPT' },
    { ...input(), sessionId: 'PRIVATE_SESSION' },
    { ...input(), body: 'PRIVATE_BODY' },
    (() => {
      const candidate = input() as ComparablePairBuildInput & { before: ComparableObservation & { projectPath: string } };
      candidate.before.projectPath = '/Users/private/project';
      return candidate;
    })(),
    (() => {
      const candidate = input() as ComparablePairBuildInput & {
        after: ComparableObservation & { context: ComparableObservation['context'] & { unknown: string } };
      };
      candidate.after.context.unknown = 'not-allowed';
      return candidate;
    })(),
  ];

  for (const hostile of hostileValues) {
    const result = buildComparableTaskPair(hostile);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'invalid-input');
  }
});
