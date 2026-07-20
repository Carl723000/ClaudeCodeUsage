import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  buildCodexUsageView,
  tokenComposition,
} from '../providers/codex/codexUsage';
import { snapshotFixture } from './codexFixtures';

const NOW = Date.parse('2026-07-20T12:00:00.000Z');

test('view builds recent task, 7d, 30d, and projects without double counting subsets', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);

  assert.equal(view.lastTask?.total.processed, 1_200);
  assert.equal(view.lastTask?.total.fresh, 400);
  assert.equal(view.lastTask?.total.reasoning, 120);
  assert.equal(view.last7Days.childFreshShare, 0.5);
  assert.equal(view.last7Days.rootTasks, 1);
  assert.equal(view.last30Days.approvalReviewerThreads, 1);
  assert.equal(view.projects[0].projectKey.startsWith('project:'), true);
  assert.equal(view.projects[0].name, 'ClaudeCodeUsage');
  assert.equal(view.projects[0].directoryName, 'ClaudeCodeUsage-MyFix');
  assert.equal(view.lastTaskIdentity?.title, '完成 Codex v2.3.0 仪表板');
});

test('model and effort buckets preserve provider-specific dimensions', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);

  assert.deepEqual(view.last7Days.models, [
    {
      key: 'gpt-5.6-sol',
      totals: {
        processed: 1_200,
        fresh: 400,
        input: 1_000,
        cachedInput: 800,
        output: 200,
        reasoning: 120,
      },
    },
  ]);
  assert.equal(view.last30Days.efforts.find((row) => row.key === 'medium')?.totals.fresh, 140);
});

test('daily and recent-thread details explain where Codex usage came from', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);

  assert.deepEqual(view.daily[0], {
    day: '2026-07-20',
    total: {
      processed: 1_200,
      fresh: 400,
      input: 1_000,
      cachedInput: 800,
      output: 200,
      reasoning: 120,
    },
    threads: 2,
    childThreads: 1,
    approvalReviewerThreads: 0,
  });
  assert.equal(view.daily[1].day, '2026-07-10');
  assert.equal(view.recentThreads.length, 4);
  assert.deepEqual(view.recentThreads[0], {
    sessionKey: 'session:child-a',
    parentSessionKey: 'session:root-a',
    title: undefined,
    parentTitle: '完成 Codex v2.3.0 仪表板',
    agentNickname: 'Locke',
    observedAt: Date.parse('2026-07-20T11:30:00.000Z'),
    role: 'subagent',
    projectKey: 'project:a',
    projectName: 'ClaudeCodeUsage',
    projectDirectoryName: 'claude-code-usage-v221',
    models: ['gpt-5.6-sol'],
    efforts: ['high'],
    total: {
      processed: 600,
      fresh: 200,
      input: 500,
      cachedInput: 400,
      output: 100,
      reasoning: 60,
    },
    durationMs: 600_000,
    structural: { ...snapshotFixture().files[1].structural },
  });
  assert.equal(view.totalThreadCount, 4);
});

test('all-time, monthly, and behavior views stay provider-native', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);

  assert.equal(view.allTime.total.processed, 1_560);
  assert.equal(view.allTime.total.fresh, 640);
  assert.equal(view.monthly[0].period, '2026-07');
  assert.equal(view.monthly[0].total.processed, 1_440);
  assert.equal(view.monthly[0].threads, 3);
  assert.deepEqual(view.last7DaysDaily.map((row) => row.day), ['2026-07-20']);
  assert.deepEqual(view.last30DaysDaily.map((row) => row.day), [
    '2026-07-20',
    '2026-07-10',
  ]);
  assert.equal(view.behavior.childThreadsPerRootTask, 0.5);
  assert.equal(view.behavior.childFreshShare, 0.3125);
  assert.equal(view.behavior.approvalReviewerFreshShare, 0.21875);
  assert.equal(view.behavior.highEffortFreshShare, 0.625);
  assert.equal(view.behavior.reasoningOutputShare, 0.5);
  assert.equal(view.behaviorScopes.recent?.childFreshShare, 0.5);
  assert.equal(view.behaviorScopes.last7Days.childFreshShare, 0.5);
  assert.equal(view.behaviorScopes.last30Days.approvalReviewerFreshShare, 140 / 540);
  assert.equal(view.behaviorScopes.allTime.childFreshShare, view.behavior.childFreshShare);
});

test('behavior exposes patch and tool call proxies without file or command claims', () => {
  const snapshot = snapshotFixture();
  snapshot.files[0].structural = {
    patchCalls: 2,
    toolCalls: 6,
    postPatchToolCalls: 4,
    compactCount: 1,
    taskCompleteCount: 1,
  };

  const view = buildCodexUsageView(snapshot, NOW);

  assert.equal(view.behavior.patchCalls, 2);
  assert.equal(view.behavior.postPatchToolCallsPerPatchCall, 2);
});

test('token composition partitions processed tokens without counting reasoning twice', () => {
  assert.deepEqual(
    tokenComposition({
      processed: 600,
      fresh: 200,
      input: 500,
      cachedInput: 400,
      output: 100,
      reasoning: 60,
    }),
    {
      freshInput: 100,
      cachedInput: 400,
      output: 100,
      reasoningWithinOutput: 60,
    },
  );
});

test('expired limits are omitted while coverage and quality remain explicit', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);

  assert.equal(view.limit, null);
  assert.deepEqual(view.limits, []);
  assert.deepEqual(view.coverage, {
    indexedFiles: 4,
    totalFiles: 5,
    indexedBytes: 1_300,
    totalBytes: 1_500,
    complete: false,
    identity: {
      exactDuplicateFiles: 0,
      ambiguousSessionGroups: 0,
      complete: true,
    },
    period: {
      timeZone: 'UTC',
      last7Days: {
        migratedFiles: 0,
        totalFiles: 0,
        migratedBytes: 0,
        totalBytes: 0,
        complete: true,
      },
      last30Days: {
        migratedFiles: 0,
        totalFiles: 0,
        migratedBytes: 0,
        totalBytes: 0,
        complete: true,
      },
      allTime: {
        migratedFiles: 0,
        totalFiles: 0,
        migratedBytes: 0,
        totalBytes: 0,
        complete: true,
      },
    },
  });
  assert.deepEqual(view.qualityFlags, [{ flag: 'unknown-event', count: 1 }]);
});

test('an empty snapshot has no recent task and safe zero scopes', () => {
  const snapshot = snapshotFixture();
  snapshot.files = [];
  snapshot.total = { inputTotal: 0, outputTotal: 0 };
  const view = buildCodexUsageView(snapshot, NOW);

  assert.equal(view.lastTask, null);
  assert.equal(view.last7Days.total.processed, 0);
  assert.deepEqual(view.projects, []);
  assert.deepEqual(view.daily, []);
  assert.deepEqual(view.last7DaysDaily, []);
  assert.deepEqual(view.last30DaysDaily, []);
  assert.deepEqual(view.monthly, []);
  assert.deepEqual(view.recentThreads, []);
  assert.equal(view.totalThreadCount, 0);
  assert.equal(view.allTime.total.processed, 0);
  assert.equal(view.behavior.processedToFreshRatio, 0);
  assert.equal(view.behaviorScopes.recent, null);
  assert.equal(view.behaviorScopes.last7Days.processedToFreshRatio, 0);
});

test('missing model and effort values are grouped as unknown', () => {
  const snapshot = snapshotFixture();
  snapshot.files[0].byModel = {};
  snapshot.files[0].byEffort = {};
  const view = buildCodexUsageView(snapshot, NOW);

  assert.equal(view.last7Days.models.find((row) => row.key === 'unknown')?.totals.processed, 600);
  assert.equal(view.last7Days.efforts.find((row) => row.key === 'unknown')?.totals.processed, 600);
});

test('incomplete session timestamps never invent a multi-year duration', () => {
  const snapshot = snapshotFixture();
  snapshot.files[0].session.startedAt = undefined;
  const view = buildCodexUsageView(snapshot, NOW);

  assert.equal(view.recentThreads[1].role, 'root');
  assert.equal(view.recentThreads[1].durationMs, 0);
  assert.equal(view.last7Days.durationMs, 600_000);
});
