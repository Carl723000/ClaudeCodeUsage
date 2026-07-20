import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  buildCodexUsageView,
  tokenComposition,
} from '../providers/codex/codexUsage';
import { buildCodexInsights } from '../providers/codex/codexInsights';
import {
  identityLineageFixture,
  parentlessNonRootTitleFixture,
  snapshotFixture,
} from './codexFixtures';

const NOW = Date.parse('2026-07-20T12:00:00.000Z');

test('rolling scopes use only selected promoted day slices from active sessions', () => {
  const snapshot = snapshotFixture();
  const file = snapshot.files[0];
  file.session.role = 'subagent';
  file.session.startedAt = Date.parse('2026-06-01T09:00:00.000Z');
  file.session.endedAt = Date.parse('2026-07-20T11:05:00.000Z');
  file.total = {
    inputTotal: 800,
    cachedInput: 700,
    outputTotal: 200,
    reasoningOutput: 120,
  };
  file.byModel = { aggregate: { ...file.total } };
  file.byEffort = { ultra: { ...file.total } };
  file.structural = {
    patchCalls: 9,
    toolCalls: 18,
    postPatchToolCalls: 9,
    compactCount: 2,
    taskCompleteCount: 2,
  };
  file.period = {
    timeZone: 'UTC',
    indexedThrough: 1,
    days: {
      '2026-06-01': {
        total: { inputTotal: 720, cachedInput: 630, outputTotal: 180, reasoningOutput: 110 },
        byModel: { old: { inputTotal: 720, cachedInput: 630, outputTotal: 180, reasoningOutput: 110 } },
        byEffort: { ultra: { inputTotal: 720, cachedInput: 630, outputTotal: 180, reasoningOutput: 110 } },
        structural: {
          patchCalls: 8,
          toolCalls: 16,
          postPatchToolCalls: 8,
          compactCount: 2,
          taskCompleteCount: 1,
        },
        firstObservedAt: Date.parse('2026-06-01T09:00:00.000Z'),
        lastObservedAt: Date.parse('2026-06-01T09:10:00.000Z'),
      },
      '2026-07-20': {
        total: { inputTotal: 80, cachedInput: 70, outputTotal: 20, reasoningOutput: 10 },
        byModel: { current: { inputTotal: 80, cachedInput: 70, outputTotal: 20, reasoningOutput: 10 } },
        byEffort: { low: { inputTotal: 80, cachedInput: 70, outputTotal: 20, reasoningOutput: 10 } },
        structural: {
          patchCalls: 1,
          toolCalls: 2,
          postPatchToolCalls: 1,
          compactCount: 0,
          taskCompleteCount: 1,
        },
        firstObservedAt: Date.parse('2026-07-20T11:00:00.000Z'),
        lastObservedAt: Date.parse('2026-07-20T11:05:00.000Z'),
      },
    },
  };
  snapshot.files = [file];
  snapshot.total = { ...file.total };
  snapshot.coverage.period.allTime.complete = false;

  const view = buildCodexUsageView(snapshot, NOW);

  assert.equal(view.last7Days.total.processed, 100);
  assert.equal(view.last7Days.total.reasoning, 10);
  assert.equal(view.allTime.total.processed, 1_000);
  assert.equal(view.lastTask?.total.processed, 1_000);
  assert.equal(view.last7Days.structural.patchCalls, 1);
  assert.deepEqual(view.last7Days.models.map((row) => [row.key, row.totals.processed]), [['current', 100]]);
  assert.deepEqual(view.last7Days.efforts.map((row) => [row.key, row.totals.processed]), [['low', 100]]);
  assert.equal(view.last7Days.threads, 1);
  assert.equal(view.last7Days.childThreads, 1);
  assert.equal(view.last7Days.childProcessedShare, 1);
  assert.equal(view.last7Days.durationMs, 5 * 60_000);
  assert.equal(view.last7DaysDaily.length, 7);
  const lastDaily = view.last7DaysDaily[view.last7DaysDaily.length - 1];
  assert.equal(lastDaily?.day, '2026-07-20');
  assert.equal(lastDaily?.total.processed, 100);
  assert.equal(view.last7DaysDaily[0].total.processed, 0);
  assert.equal(view.monthly.find((row) => row.period === '2026-06')?.total.processed, 900);
  assert.equal(view.monthly.find((row) => row.period === '2026-07')?.total.processed, 100);
  assert.equal(view.lastTask?.periodCoverage, undefined);
  assert.equal(view.allTime.periodCoverage, undefined);
  assert.equal(view.last7Days.periodCoverage, view.periodCoverage.last7Days);
  assert.equal(view.last30Days.periodCoverage, view.periodCoverage.last30Days);
  assert.equal(view.periodCoverage, snapshot.coverage.period);
});

test('rolling scopes stay anchored to snapshot coverage across Hong Kong midnight', () => {
  const snapshot = snapshotFixture();
  const coverage = snapshot.coverage.period;
  coverage.timeZone = 'Asia/Hong_Kong';
  coverage.asOfDay = '2026-07-20';
  coverage.last7Days.complete = false;
  coverage.last30Days.complete = true;
  const file = snapshot.files[0];
  file.total = { inputTotal: 800, cachedInput: 700, outputTotal: 200, reasoningOutput: 20 };
  file.byModel = { 'gpt-5.6-sol': { ...file.total } };
  file.byEffort = { high: { ...file.total } };
  file.period = {
    timeZone: 'Asia/Hong_Kong',
    indexedThrough: 1,
    days: {
      '2026-07-14': {
        total: { inputTotal: 30, cachedInput: 20, outputTotal: 10, reasoningOutput: 2 },
        byModel: { 'gpt-5.6-sol': { inputTotal: 30, cachedInput: 20, outputTotal: 10, reasoningOutput: 2 } },
        byEffort: { high: { inputTotal: 30, cachedInput: 20, outputTotal: 10, reasoningOutput: 2 } },
        structural: {
          patchCalls: 1,
          toolCalls: 2,
          postPatchToolCalls: 1,
          compactCount: 0,
          taskCompleteCount: 0,
        },
        firstObservedAt: Date.parse('2026-07-13T16:05:00.000Z'),
        lastObservedAt: Date.parse('2026-07-13T16:10:00.000Z'),
      },
      '2026-07-20': {
        total: { inputTotal: 50, cachedInput: 40, outputTotal: 10, reasoningOutput: 3 },
        byModel: { 'gpt-5.6-sol': { inputTotal: 50, cachedInput: 40, outputTotal: 10, reasoningOutput: 3 } },
        byEffort: { high: { inputTotal: 50, cachedInput: 40, outputTotal: 10, reasoningOutput: 3 } },
        structural: {
          patchCalls: 0,
          toolCalls: 0,
          postPatchToolCalls: 0,
          compactCount: 0,
          taskCompleteCount: 1,
        },
        firstObservedAt: Date.parse('2026-07-20T15:50:00.000Z'),
        lastObservedAt: Date.parse('2026-07-20T15:55:00.000Z'),
      },
      '2026-07-21': {
        total: { inputTotal: 720, cachedInput: 640, outputTotal: 180, reasoningOutput: 15 },
        byModel: { future: { inputTotal: 720, cachedInput: 640, outputTotal: 180, reasoningOutput: 15 } },
        byEffort: { ultra: { inputTotal: 720, cachedInput: 640, outputTotal: 180, reasoningOutput: 15 } },
        structural: {
          patchCalls: 8,
          toolCalls: 16,
          postPatchToolCalls: 8,
          compactCount: 2,
          taskCompleteCount: 1,
        },
        firstObservedAt: Date.parse('2026-07-20T16:01:00.000Z'),
        lastObservedAt: Date.parse('2026-07-20T16:04:00.000Z'),
      },
    },
  };
  snapshot.files = [file];
  snapshot.total = { ...file.total };

  const view = buildCodexUsageView(
    snapshot,
    Date.parse('2026-07-20T16:05:00.000Z'),
  );

  assert.equal(view.last7Days.total.processed, 100);
  assert.equal(view.last30Days.total.processed, 100);
  assert.equal(view.last7Days.threads, 1);
  assert.equal(view.last7Days.rootTasks, 1);
  assert.equal(view.last7DaysDaily[0].day, '2026-07-14');
  assert.equal(view.last7DaysDaily[6].day, '2026-07-20');
  assert.equal(view.last7DaysDaily.some((row) => row.day === '2026-07-21'), false);
  assert.deepEqual(buildCodexInsights(view.last7Days), []);
  assert.equal(
    buildCodexInsights(view.last30Days).some((insight) => insight.kind === 'effort-comparison'),
    true,
  );
});

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
  assert.equal(view.projects[0].directoryName, 'claude-code-usage-v221');
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
  assert.equal(view.last7DaysDaily.length, 7);
  assert.equal(view.last7DaysDaily[0].day, '2026-07-14');
  assert.equal(view.last7DaysDaily[6].day, '2026-07-20');
  assert.equal(view.last7DaysDaily[0].total.processed, 0);
  assert.equal(view.last30DaysDaily.length, 30);
  assert.equal(view.last30DaysDaily[0].day, '2026-06-21');
  assert.equal(
    view.last30DaysDaily.find((row) => row.day === '2026-07-10')?.total.processed,
    240,
  );
  assert.equal(view.last30DaysDaily[29].day, '2026-07-20');
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
      asOfDay: '2026-07-20',
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
  assert.equal(view.last7DaysDaily.length, 7);
  assert.equal(view.last7DaysDaily.every((row) => row.total.processed === 0), true);
  assert.equal(view.last30DaysDaily.length, 30);
  assert.equal(view.last30DaysDaily.every((row) => row.total.processed === 0), true);
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
  const periodDay = snapshot.files[0].period?.days['2026-07-20'];
  assert.ok(periodDay);
  periodDay.byModel = {};
  periodDay.byEffort = {};
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
  assert.equal(view.last7Days.durationMs, 1_200_000);
});

test('project and task identities use named representatives and the whole lineage', () => {
  const childEndedAt = Date.parse('2026-07-20T11:50:00.000Z');
  const view = buildCodexUsageView(identityLineageFixture(), NOW);

  assert.equal(view.projects[0].name, 'RealChildProject');
  assert.equal(view.projects[0].directoryName, 'LatestDirectory');
  assert.equal(view.lastTaskIdentity?.projectName, 'RealChildProject');
  assert.equal(view.lastTaskIdentity?.projectDirectoryName, 'LatestDirectory');
  assert.equal(view.lastTaskIdentity?.title, undefined);
  assert.equal(view.lastTaskIdentity?.observedAt, childEndedAt);
  assert.equal(view.lastTask?.threads, 3);
});

test('lineage traversal groups a parent cycle once without borrowing a child title', () => {
  const snapshot = snapshotFixture();
  snapshot.files = snapshot.files.slice(0, 2);
  snapshot.files[0].session.role = 'subagent';
  snapshot.files[0].session.parentSessionKey = snapshot.files[1].session.sessionKey;
  snapshot.files[0].session.sessionTitle = 'cycle title a';
  snapshot.files[1].session.parentSessionKey = snapshot.files[0].session.sessionKey;
  snapshot.files[1].session.sessionTitle = 'cycle title b';
  snapshot.files[1].session.endedAt = Date.parse('2026-07-20T11:55:00.000Z');

  const view = buildCodexUsageView(snapshot, NOW);

  assert.equal(view.lastTask?.threads, 2);
  assert.equal(view.lastTaskIdentity?.title, undefined);
  assert.equal(
    view.lastTaskIdentity?.observedAt,
    Date.parse('2026-07-20T11:55:00.000Z'),
  );
});

test('a parentless non-root cannot supply the task title', () => {
  const view = buildCodexUsageView(parentlessNonRootTitleFixture(), NOW);

  assert.equal(view.lastTask?.threads, 1);
  assert.equal(view.recentThreads[0].role, 'approval-reviewer');
  assert.equal(
    view.recentThreads[0].title,
    'parentless reviewer title must not become a task title',
  );
  assert.equal(view.lastTaskIdentity?.title, undefined);
});
