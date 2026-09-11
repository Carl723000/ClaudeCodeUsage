import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  buildProjectUsageMatrixSnapshot,
  projectHeatmap,
  projectTrend,
} from '../projectUsageMatrix';

test('project matrix keeps one sparse 90-day source and combines duplicate project days', () => {
  const snapshot = buildProjectUsageMatrixSnapshot('codex', [
    { projectKey: 'a', projectName: 'Alpha', day: '2026-09-09', tokens: 10, coverage: 'complete' },
    { projectKey: 'a', projectName: 'Alpha', day: '2026-09-09', tokens: 5, coverage: 'partial' },
    { projectKey: 'old', projectName: 'Old', day: '2026-01-01', tokens: 999, coverage: 'complete' },
  ], {
    asOfDay: '2026-09-10',
    timeZone: 'Asia/Shanghai',
    coverage: 'partial',
  });

  assert.equal(snapshot.days.length, 90);
  assert.equal(snapshot.days[snapshot.days.length - 1], '2026-09-10');
  assert.deepEqual(snapshot.points, [{
    projectKey: 'a',
    projectName: 'Alpha',
    day: '2026-09-09',
    tokens: 15,
    coverage: 'partial',
  }]);
});

test('30-day and 90-day heatmaps are projections of the same source snapshot', () => {
  const snapshot = buildProjectUsageMatrixSnapshot('claude', [
    { projectKey: 'a', projectName: 'Alpha', day: '2026-09-09', tokens: 100, coverage: 'complete' },
    { projectKey: 'b', projectName: 'Beta', day: '2026-09-09', tokens: 25, coverage: 'complete' },
    { projectKey: 'a', projectName: 'Alpha', day: '2026-07-01', tokens: 50, coverage: 'complete' },
  ], { asOfDay: '2026-09-10', timeZone: 'UTC' });

  const recent = projectHeatmap(snapshot, 30);
  const extended = projectHeatmap(snapshot, 90);
  assert.equal(recent[0].cells.length, 30);
  assert.equal(extended[0].cells.length, 90);
  assert.equal(recent.find((row) => row.projectKey === 'a')?.totalTokens, 100);
  assert.equal(extended.find((row) => row.projectKey === 'a')?.totalTokens, 150);
});

test('heatmap uses one global 0-4 scale and ranks rows by range total', () => {
  const snapshot = buildProjectUsageMatrixSnapshot('codex', [
    { projectKey: 'a', projectName: 'Alpha', day: '2026-09-09', tokens: 100, coverage: 'complete' },
    { projectKey: 'b', projectName: 'Beta', day: '2026-09-09', tokens: 25, coverage: 'complete' },
    { projectKey: 'c', projectName: 'Gamma', day: '2026-09-09', tokens: 1, coverage: 'complete' },
  ], { asOfDay: '2026-09-10', timeZone: 'UTC' });

  const rows = projectHeatmap(snapshot, 30);
  const dayIndex = rows[0].cells.findIndex((cell) => cell.day === '2026-09-09');
  assert.deepEqual(rows.map((row) => row.projectKey), ['a', 'b', 'c']);
  assert.equal(rows[0].cells[dayIndex].bucket, 4);
  assert.equal(rows[1].cells[dayIndex].bucket > rows[2].cells[dayIndex].bucket, true);
  assert.equal(rows[2].cells[dayIndex].bucket, 1);
});

test('missing zero-usage cells retain range coverage instead of inventing missing data', () => {
  const snapshot = buildProjectUsageMatrixSnapshot('claude', [
    { projectKey: 'a', projectName: 'Alpha', day: '2026-09-10', tokens: 8, coverage: 'complete' },
  ], {
    asOfDay: '2026-09-10',
    timeZone: 'UTC',
    coverage: 'complete',
  });

  const row = projectHeatmap(snapshot, 30)[0];
  const empty = row.cells.find((cell) => cell.day === '2026-09-09');
  assert.deepEqual(empty, {
    projectKey: 'a',
    projectName: 'Alpha',
    day: '2026-09-09',
    tokens: 0,
    coverage: 'complete',
    bucket: 0,
  });
});

test('stacked trend is bounded, folds the long tail into Other, and preserves every day total', () => {
  const points = Array.from({ length: 8 }, (_, projectIndex) => ({
    projectKey: `p${projectIndex}`,
    projectName: `Project ${projectIndex}`,
    day: projectIndex % 2 === 0 ? '2026-09-09' : '2026-09-10',
    tokens: projectIndex + 1,
    coverage: 'complete' as const,
  }));
  const snapshot = buildProjectUsageMatrixSnapshot('codex', points, {
    asOfDay: '2026-09-10',
    timeZone: 'UTC',
  });

  const series = projectTrend(snapshot, 30, 6);
  assert.equal(series.length, 6);
  assert.equal(series[series.length - 1]?.other, true);
  assert.equal(series[series.length - 1]?.projectKey, '__other__');
  for (const day of ['2026-09-09', '2026-09-10']) {
    const expected = points.filter((point) => point.day === day)
      .reduce((sum, point) => sum + point.tokens, 0);
    const actual = series.reduce(
      (sum, row) => sum + (row.values.find((value) => value.day === day)?.tokens ?? 0),
      0,
    );
    assert.equal(actual, expected);
  }
});

test('matrix projections cap visible rows without changing the sparse source', () => {
  const snapshot = buildProjectUsageMatrixSnapshot('claude',
    Array.from({ length: 50 }, (_, index) => ({
      projectKey: `p${index}`,
      projectName: `Project ${index}`,
      day: '2026-09-10',
      tokens: 50 - index,
      coverage: 'complete' as const,
    })),
    { asOfDay: '2026-09-10', timeZone: 'UTC' },
  );

  assert.equal(snapshot.points.length, 50);
  assert.equal(projectHeatmap(snapshot, 30, 12).length, 12);
  assert.equal(projectHeatmap(snapshot, 30, 40).length, 40);
});

test('heatmap intensity stays global even when lower-ranked rows are not rendered', () => {
  const snapshot = buildProjectUsageMatrixSnapshot('codex', [
    { projectKey: 'total-leader', projectName: 'Total leader', day: '2026-09-09', tokens: 50, coverage: 'complete' },
    { projectKey: 'total-leader', projectName: 'Total leader', day: '2026-09-10', tokens: 50, coverage: 'complete' },
    { projectKey: 'hidden-peak', projectName: 'Hidden peak', day: '2026-09-10', tokens: 80, coverage: 'complete' },
  ], { asOfDay: '2026-09-10', timeZone: 'UTC' });

  const visible = projectHeatmap(snapshot, 30, 1);
  const latest = visible[0].cells[visible[0].cells.length - 1];
  assert.equal(visible[0].projectKey, 'total-leader');
  assert.equal(latest.bucket < 4, true);
});
