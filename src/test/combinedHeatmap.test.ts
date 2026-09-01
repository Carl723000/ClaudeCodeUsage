import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  claudeDailyPointsFromUsage,
  codexDailyPointsFromUsage,
  combinedHeatmapFilename,
  combinedHeatmapMarkdown,
  mergeCombinedDailyUsage,
  sanitizeCombinedHeatmapTitle,
  selectCombinedHeatmapWindow,
} from '../combinedHeatmap';
import { renderCombinedHeatmapSvg } from '../combinedHeatmapSvg';

test('provider mappings preserve the processed-token formulas without double counting', () => {
  const claude = claudeDailyPointsFromUsage({
    '2026-07-20': { tokens: 100, cost: 2, sessions: 1 },
  });
  const codex = codexDailyPointsFromUsage([{
    day: '2026-07-20',
    total: {
      input: 200,
      output: 50,
      cachedInput: 190,
      reasoning: 40,
      processed: 99_999,
    },
  }]);
  assert.deepEqual(claude, [{ dateISO: '2026-07-20', processed: 100 }]);
  assert.deepEqual(codex, [{ dateISO: '2026-07-20', processed: 250 }]);
});

test('merge de-duplicates identical provider days and zero-fills the missing provider', () => {
  const daily = mergeCombinedDailyUsage(
    [
      { dateISO: '2026-07-19', processed: 30 },
      { dateISO: '2026-07-19', processed: 30 },
    ],
    [
      { dateISO: '2026-07-19', processed: 5 },
      { dateISO: '2026-07-20', processed: 7 },
    ],
  );
  assert.deepEqual(daily, {
    '2026-07-19': {
      dateISO: '2026-07-19',
      claudeProcessed: 30,
      codexProcessed: 5,
      combinedProcessed: 35,
    },
    '2026-07-20': {
      dateISO: '2026-07-20',
      claudeProcessed: 0,
      codexProcessed: 7,
      combinedProcessed: 7,
    },
  });
});

test('conflicting duplicate provider days fail closed instead of inflating output', () => {
  assert.throws(
    () => mergeCombinedDailyUsage([
      { dateISO: '2026-07-19', processed: 10 },
      { dateISO: '2026-07-19', processed: 20 },
    ], []),
    /Conflicting duplicate daily aggregate/,
  );
});

test('single-provider and empty inputs remain valid instead of producing a blank compare contract', () => {
  assert.deepEqual(
    mergeCombinedDailyUsage([{ dateISO: '2026-07-20', processed: 9 }], []),
    {
      '2026-07-20': {
        dateISO: '2026-07-20',
        claudeProcessed: 9,
        codexProcessed: 0,
        combinedProcessed: 9,
      },
    },
  );
  assert.deepEqual(mergeCombinedDailyUsage([], []), {});
});

test('range boundaries use inclusive configured-timezone date keys', () => {
  const daily = mergeCombinedDailyUsage([
    { dateISO: '2026-06-20', processed: 1 },
    { dateISO: '2026-06-21', processed: 2 },
    { dateISO: '2026-07-20', processed: 3 },
    { dateISO: '2026-07-21', processed: 4 },
  ], []);
  const window = selectCombinedHeatmapWindow(daily, '30d', '2026-07-20');
  assert.equal(window.startDateISO, '2026-06-21');
  assert.deepEqual(Object.keys(window.daily), ['2026-06-21', '2026-07-20']);
  assert.equal(window.totals.combinedProcessed, 5);
});

test('SVG is deterministic and tooltips disclose both provider totals and the combined total', () => {
  const daily = mergeCombinedDailyUsage(
    [{ dateISO: '2026-07-20', processed: 1_200_000 }],
    [{ dateISO: '2026-07-20', processed: 300_000 }],
  );
  const options = { range: '30d' as const, endDateISO: '2026-07-20', title: 'Local AI activity' };
  const first = renderCombinedHeatmapSvg(daily, options);
  const second = renderCombinedHeatmapSvg(daily, options);
  assert.equal(first, second);
  assert.match(first, /2026-07-20 · Claude: 1\.2M · Codex: 300K · Combined: 1\.5M processed tokens/);
  assert.match(first, /not productivity, billing, or provider equivalence/);
  assert.match(first, /role="img"/);
});

test('share artifact cannot serialize privacy canaries from extra source fields', () => {
  const source = {
    '2026-07-20': {
      dateISO: '2026-07-20',
      claudeProcessed: 10,
      codexProcessed: 20,
      combinedProcessed: 30,
      accountFingerprint: 'PRIVACY_CANARY_ACCOUNT',
      projectName: 'PRIVACY_CANARY_PROJECT',
      threadTitle: 'PRIVACY_CANARY_THREAD',
      localPath: '/PRIVACY_CANARY_PATH',
      logContent: 'PRIVACY_CANARY_LOG',
    },
  } as unknown as Record<string, import('../combinedHeatmap').CombinedDayUsage>;
  const svg = renderCombinedHeatmapSvg(source, {
    range: '30d',
    endDateISO: '2026-07-20',
    title: 'Safe aggregate',
  });
  assert.doesNotMatch(svg, /PRIVACY_CANARY/);
});

test('title, filename, and Markdown are bounded and deterministic', () => {
  assert.equal(sanitizeCombinedHeatmapTitle('  Team\nactivity  ', 'Fallback'), 'Team activity');
  assert.equal(sanitizeCombinedHeatmapTitle('', 'Fallback'), 'Fallback');
  const filename = combinedHeatmapFilename('90d', '2026-07-20');
  assert.equal(filename, 'claude-codex-activity-90d-2026-07-20.svg');
  assert.equal(
    combinedHeatmapMarkdown(filename, 'Claude + Codex [activity]'),
    '![Claude + Codex activity](claude-codex-activity-90d-2026-07-20.svg)',
  );
});
