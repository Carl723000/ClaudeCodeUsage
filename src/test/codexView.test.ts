import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  CODEX_COPY_EN,
  renderCodexView,
  renderProviderCompare,
} from '../codexView';
import { buildCodexInsights } from '../providers/codex/codexInsights';
import { buildCodexUsageView } from '../providers/codex/codexUsage';
import { I18n } from '../i18n';
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
  assert.match(html, /完成 Codex v2\.3\.0 仪表板/);
  assert.match(html, /ClaudeCodeUsage/);
  assert.match(html, /ClaudeCodeUsage-MyFix/);
  assert.match(html, /Locke/);
  assert.match(html, /data-codex-thread-search/);
  assert.match(html, /data-codex-thread-filter="role"/);
  assert.match(html, /class="sortable" data-sortkey="title"/);
  assert.match(html, /data-codex-project-detail="p0"/);
  assert.match(html, /data-test-settings/);
  assert.match(html, /N:1200/);
  assert.match(html, /data-label-processed="N:/);
  assert.match(html, /data-label-threads="N:/);
  assert.doesNotMatch(html, /codex-metric-card|project:a|session:|Thread 1|Project 1/);
  assert.doesNotMatch(html, /class="codex-header"/);
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

test('Codex renderer shows every unexpired named last-observed limit', () => {
  const snapshot = snapshotFixture();
  snapshot.limit = {
    provider: 'codex',
    limitId: 'main',
    limitName: 'Codex main',
    observedAt: NOW - 60_000,
    source: 'local-log',
    confidence: 'last-observed',
    windows: [
      { label: 'primary', usedPercent: 31, windowMinutes: 300, resetsAt: NOW + 3_600_000 },
      { label: 'secondary', usedPercent: 47, windowMinutes: 10080, resetsAt: NOW + 86_400_000 },
    ],
    credits: { hasCredits: true, unlimited: false, balance: '12.5' },
  };
  snapshot.limits = [
    snapshot.limit,
    {
      provider: 'codex',
      limitId: 'spark',
      limitName: 'GPT-5.3-Codex-Spark',
      observedAt: NOW - 30_000,
      source: 'local-log',
      confidence: 'last-observed',
      windows: [
        { label: 'primary', usedPercent: 4, windowMinutes: 10080, resetsAt: NOW + 172_800_000 },
      ],
    },
  ];
  const view = buildCodexUsageView(snapshot, NOW);
  const html = renderCodexView(view, [], CODEX_COPY_EN);

  assert.match(html, /Codex main/);
  assert.match(html, /GPT-5\.3-Codex-Spark/);
  assert.match(html, /primary/);
  assert.match(html, /secondary/);
  assert.match(html, /31%/);
  assert.match(html, /47%/);
  assert.match(html, /12\.5/);
  assert.match(html, /Last observed/);
});

test('Simplified Chinese Codex dashboard localizes the new Claude-style modules', () => {
  const previous = I18n.getCurrentLanguage();
  try {
    I18n.setLanguage('zh-CN');
    const view = buildCodexUsageView(snapshotFixture(), NOW);
    const html = renderCodexView(
      view,
      buildCodexInsights(view.lastTask!),
      I18n.t.providers.codex,
      { settingsHtml: '<section>设置内容</section>' },
    );

    for (const label of ['最近任务', '最近 7 天', '最近 30 天', '全部时间', '线程', '项目', '行为', '设置']) {
      assert.match(html, new RegExp(label));
    }
    assert.match(html, /Token 构成/);
    assert.match(html, /推理已包含在输出中/);
  } finally {
    I18n.setLanguage(previous);
  }
});

test('all dynamic renderer values are escaped', () => {
  const snapshot = snapshotFixture();
  snapshot.files[0].byModel = {
    '<img src=x onerror=alert(1)>': snapshot.files[0].total,
  };
  snapshot.files[0].session.sessionTitle = '<script>private title</script>';
  snapshot.files[0].session.projectName = '<b>private project</b>';
  const view = buildCodexUsageView(snapshot, NOW);
  const html = renderCodexView(view, [], CODEX_COPY_EN);

  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<script>private title|<b>private project/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;script&gt;private title&lt;\/script&gt;/);
  assert.doesNotMatch(html, /https?:\/\//);
});
