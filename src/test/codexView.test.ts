import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  CODEX_COPY_EN,
  renderCodexView,
  renderProviderCompare,
} from '../codexView';
import { buildCodexInsights } from '../providers/codex/codexInsights';
import { buildCodexUsageView } from '../providers/codex/codexUsage';
import { snapshotFixture } from './codexFixtures';

const NOW = Date.parse('2026-07-20T12:00:00.000Z');

test('Codex renderer labels provider semantics and never renders subscription cost', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);
  const html = renderCodexView(
    view,
    buildCodexInsights(view.lastTask!),
    CODEX_COPY_EN,
  );

  assert.match(html, /Processed tokens/);
  assert.match(html, /Fresh input \+ output/);
  assert.match(html, /Last observed/);
  assert.match(html, /Coverage/);
  assert.doesNotMatch(html, /\$|subscription cost|raw-session|\/Users\//);
});

test('Codex renderer reuses Claude visuals for eight truthful modules', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);
  const html = renderCodexView(
    view,
    buildCodexInsights(view.lastTask!),
    CODEX_COPY_EN,
    {
      formatNumber: (value) => `N:${value}`,
      settingsHtml: '<section data-test-settings>settings</section>',
    },
  );

  assert.match(html, /class="tabs codex-tabs"/);
  for (const tab of [
    'recent',
    '7d',
    '30d',
    'all',
    'threads',
    'projects',
    'behavior',
    'settings',
  ]) {
    assert.match(html, new RegExp(`data-codex-tab-button="${tab}"`));
  }
  assert.match(html, /class="summary-grid"/);
  assert.match(html, /class="chart-tabs"/);
  assert.match(html, /class="chart-bars"/);
  assert.match(html, /class="cost-composition codex-token-composition"/);
  assert.match(html, /class="daily-table"/);
  assert.match(html, /2026-07-20/);
  assert.match(html, /Subagent/);
  assert.match(html, /data-test-settings/);
  assert.match(html, /N:1200/);
  assert.match(html, /data-label-processed="N:/);
  assert.match(html, /data-label-threads="N:/);
  assert.doesNotMatch(html, /codex-metric-card|project:a|session:/);
  assert.doesNotMatch(html, /\$/);
});

test('Compare is side-by-side and contains no summed total, cost, or quota', () => {
  const html = renderProviderCompare(
    {
      claude: { label: 'Claude', input: 100, output: 20, cache: 300 },
      codex: { label: 'Codex', input: 500, output: 100, cache: 400 },
    },
    CODEX_COPY_EN,
  );

  assert.match(html, /Claude/);
  assert.match(html, /Codex/);
  assert.match(html, /provider-compare-grid/);
  assert.doesNotMatch(html, /combined|quota|\$/i);
});

test('all dynamic renderer values are escaped', () => {
  const snapshot = snapshotFixture();
  snapshot.files[0].byModel = {
    '<img src=x onerror=alert(1)>': snapshot.files[0].total,
  };
  const view = buildCodexUsageView(snapshot, NOW);
  const html = renderCodexView(view, [], CODEX_COPY_EN);

  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /https?:\/\//);
});
