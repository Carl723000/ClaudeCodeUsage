import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { buildCodexUsageView } from '../providers/codex/codexUsage';
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

test('expired limits are omitted while coverage and quality remain explicit', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);

  assert.equal(view.limit, null);
  assert.deepEqual(view.coverage, {
    indexedFiles: 4,
    totalFiles: 5,
    indexedBytes: 1_300,
    totalBytes: 1_500,
    complete: false,
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
});

test('missing model and effort values are grouped as unknown', () => {
  const snapshot = snapshotFixture();
  snapshot.files[0].byModel = {};
  snapshot.files[0].byEffort = {};
  const view = buildCodexUsageView(snapshot, NOW);

  assert.equal(view.last7Days.models.find((row) => row.key === 'unknown')?.totals.processed, 600);
  assert.equal(view.last7Days.efforts.find((row) => row.key === 'unknown')?.totals.processed, 600);
});
