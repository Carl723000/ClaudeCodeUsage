import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  CODEX_COPY_EN,
  CodexScopedInsights,
  renderCodexView,
  renderProviderCompare,
} from '../codexView';
import { buildCodexInsights } from '../providers/codex/codexInsights';
import { buildCodexUsageView } from '../providers/codex/codexUsage';
import { I18n } from '../i18n';
import { createCodexLocalizedFormatters } from '../codexFormat';
import { snapshotFixture } from './codexFixtures';

const NOW = Date.parse('2026-07-20T12:00:00.000Z');

type CodexFixtureView = ReturnType<typeof buildCodexUsageView>;

function scopedInsights(
  view: CodexFixtureView,
): CodexScopedInsights {
  return {
    recent: view.lastTask ? buildCodexInsights(view.lastTask) : [],
    last7Days: buildCodexInsights(view.last7Days),
    last30Days: buildCodexInsights(view.last30Days),
    allTime: buildCodexInsights(view.allTime),
  };
}

function renderFixture(): string {
  const view = buildCodexUsageView(snapshotFixture(), NOW);
  return renderCodexView(view, scopedInsights(view), CODEX_COPY_EN, {
    formatNumber: (value) => `N:${value}`,
    settingsHtml: '<section data-test-settings>settings</section>',
  });
}

function productionCodexSettingsHtml(): string {
  return `<div class="settings-panel">
    <div class="settings-toolbar"><button class="btn-secondary btn-small" onclick="resetAllSettings([&quot;language&quot;,&quot;compactNumbers&quot;])">Reset all</button></div>
    <div class="set-row"><label class="set-switch"><input type="checkbox" id="set_compactNumbers" checked onchange="setSetting('compactNumbers', this.checked, 'boolean')"><span class="set-slider"></span></label></div>
    <div class="set-row"><select id="set_language" onchange="setSetting('language', this.value, 'string')"><option value="en">English</option></select></div>
    <div class="set-row"><input type="number" id="set_tokenDecimalPlaces" value="1" onchange="setSetting('tokenDecimalPlaces', this.value, 'number')"></div>
  </div>`;
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

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

test('empty or partial insights render no paste-ready constraint fallback', () => {
  const snapshot = snapshotFixture();
  snapshot.coverage.period.last7Days.complete = false;
  const view = buildCodexUsageView(snapshot, NOW);
  const partialInsights = buildCodexInsights(view.last7Days);

  for (const insights of [[], partialInsights]) {
    const html = renderCodexView(view, insights, CODEX_COPY_EN);
    assert.doesNotMatch(html, /Paste-ready constraint/);
    assert.doesNotMatch(html, /Run one focused test tied to the change/);
    assert.doesNotMatch(html, /Stop when the acceptance criteria pass/);
  }

  const evidenced = renderCodexView(
    view,
    buildCodexInsights(view.lastTask!),
    CODEX_COPY_EN,
  );
  assert.match(evidenced, /Paste-ready constraint/);
  assert.match(evidenced, /Run one focused test tied to the change/);
  assert.match(evidenced, /Stop when the acceptance criteria pass/);
});

test('Codex renderer exposes three product destinations and auxiliary settings', () => {
  const html = renderFixture();

  assert.match(html, /<section[^>]*data-codex-root(?:="")?[^>]*>/);
  assert.equal(html.match(/<nav\b[^>]*role="tablist"[^>]*>/g)?.length, 1);
  assert.equal(html.match(/\brole="tab"/g)?.length, 3);
  assert.equal(html.match(/\brole="tabpanel"/g)?.length, 4);
  for (const page of ['overview', 'explore', 'recommendations']) {
    assert.match(html, new RegExp(`data-codex-page-button="${page}"`));
    assert.match(html, new RegExp(`data-codex-page="${page}"`));
    assert.match(html, new RegExp(`id="codex-page-tab-${page}"`));
    assert.match(html, new RegExp(`aria-controls="codex-page-panel-${page}"`));
    assert.match(html, new RegExp(`id="codex-page-panel-${page}"`));
    assert.match(html, new RegExp(`aria-labelledby="codex-page-tab-${page}"`));
  }
  assert.match(html, /data-codex-page-button="overview"[^>]*aria-selected="true"[^>]*tabindex="0"/);
  assert.match(html, /data-codex-page-button="explore"[^>]*aria-selected="false"[^>]*tabindex="-1"/);
  assert.match(html, /data-codex-page-button="recommendations"[^>]*aria-selected="false"[^>]*tabindex="-1"/);
  assert.match(html, /data-codex-action="open-settings"/);
  assert.match(html, /data-codex-page="settings"/);
  assert.match(html, /id="codex-page-panel-settings"/);
  assert.match(html, /aria-labelledby="codex-open-settings"/);
  assert.match(html, /data-codex-action="close-settings"/);
  assert.doesNotMatch(html, /data-codex-tab-button="(?:recent|7d|30d|all|threads|projects|behavior|settings)"/);

  // Existing truthful modules remain available inside the reorganized pages.
  assert.match(html, /class="summary-grid"/);
  assert.match(html, /class="chart-tabs"/);
  assert.match(html, /class="hc-bars chart-bars"/);
  assert.match(html, /class="hc-yaxis"/);
  assert.match(html, /class="hc-grid hc-grid-top"/);
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
  for (const scope of ['recent', '7d', '30d', 'all']) {
    assert.match(html, new RegExp(`data-codex-behavior-button="${scope}"`));
    assert.match(html, new RegExp(`data-codex-behavior-panel="${scope}"`));
  }
  assert.match(html, /<details class="model-item codex-coverage">/);
  assert.match(html, /data-test-settings/);
  assert.match(html, /N:1200/);
  assert.match(html, /data-label-processed="N:/);
  assert.match(html, /data-label-threads="N:/);
  assert.match(html, /data-codex-action="select-chart-metric"[^>]*data-codex-chart-id="codex-7d"[^>]*data-codex-chart-metric="processed"/);
  assert.match(html, /data-codex-action="toggle-thread-children"[^>]*data-codex-thread-key="t1"/);
  assert.match(html, /data-codex-action="toggle-project"[^>]*data-codex-project-key="p0"/);
  assert.match(html, /data-codex-action="select-behavior-scope"[^>]*data-codex-behavior-scope="recent"/);
  assert.doesNotMatch(html, /\sonclick=/);
  assert.doesNotMatch(html, /codex-metric-card|project:a|session:|Thread 1|Project 1/);
  assert.doesNotMatch(html, /class="codex-header"/);
  assert.doesNotMatch(html, /\$|raw-session|\/Users\/|https?:\/\//);
});

test('Codex renderer scopes period coverage and keeps verified all-time aggregates available', () => {
  const snapshot = snapshotFixture();
  snapshot.coverage.complete = false;
  snapshot.coverage.period.last7Days = {
    migratedFiles: 7,
    totalFiles: 7,
    migratedBytes: 700,
    totalBytes: 700,
    complete: true,
  };
  snapshot.coverage.period.last30Days = {
    migratedFiles: 20,
    totalFiles: 30,
    migratedBytes: 2_000,
    totalBytes: 3_000,
    complete: false,
  };
  snapshot.coverage.period.allTime = {
    migratedFiles: 40,
    totalFiles: 50,
    migratedBytes: 4_000,
    totalBytes: 5_000,
    complete: false,
  };
  const view = buildCodexUsageView(snapshot, NOW);
  const html = renderCodexView(view, scopedInsights(view), CODEX_COPY_EN);

  assert.match(html, /data-codex-coverage-range="7d"[^>]*data-codex-coverage-status="complete"[^>]*data-codex-migrated-files="7"[^>]*data-codex-total-files="7"/);
  assert.match(html, /data-codex-coverage-range="30d"[^>]*data-codex-coverage-status="partial"[^>]*data-codex-migrated-files="20"[^>]*data-codex-total-files="30"/);
  assert.match(html, /data-codex-scope-summary="all"/);
  assert.match(html, /data-codex-chart-root="codex-all"[^>]*data-codex-coverage-range="all"[^>]*data-codex-coverage-status="partial"/);
  assert.doesNotMatch(html, /data-codex-scope-summary="all"[^>]*data-codex-coverage-status="partial"/);
  assert.match(html, /data-codex-page="recommendations"/);
  assert.match(html, /data-codex-behavior-panel="all"/);
});

test('Codex renderer adapts production-shaped settings to declarative actions', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);
  const html = renderCodexView(view, scopedInsights(view), CODEX_COPY_EN, {
    settingsHtml: productionCodexSettingsHtml(),
  });
  const root = html.match(/<section[^>]*data-codex-root[\s\S]*<\/section>/)?.[0] ?? '';

  assert.match(root, /class="settings-panel"/);
  const resetPayload = root.match(
    /data-codex-action="reset-settings"[^>]*data-codex-setting-keys="([^"]+)"/,
  );
  assert.ok(resetPayload);
  assert.deepEqual(
    JSON.parse(decodeHtmlAttribute(resetPayload[1])),
    ['language', 'compactNumbers'],
  );
  assert.match(root, /data-codex-action="set-setting"[^>]*data-codex-setting-key="compactNumbers"[^>]*data-codex-setting-value-source="checked"[^>]*data-codex-setting-type="boolean"/);
  assert.match(root, /data-codex-action="set-setting"[^>]*data-codex-setting-key="language"[^>]*data-codex-setting-value-source="value"[^>]*data-codex-setting-type="string"/);
  assert.match(root, /data-codex-action="set-setting"[^>]*data-codex-setting-key="tokenDecimalPlaces"[^>]*data-codex-setting-value-source="value"[^>]*data-codex-setting-type="number"/);
  assert.doesNotMatch(root, /\sonclick\s*=/i);
  assert.doesNotMatch(root, /\sonchange\s*=/i);
  assert.doesNotMatch(root, /\soninput\s*=/i);
});

test('Codex settings adapter rejects invalid reset payloads without evaluating them', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);
  for (const handler of [
    'resetAllSettings(window.settings)',
    'resetAllSettings([&quot;language&quot;,42])',
    'resetAllSettings([&quot;language&quot;,&quot;&lt;img&gt;&quot;])',
  ]) {
    const html = renderCodexView(view, scopedInsights(view), CODEX_COPY_EN, {
      settingsHtml: `<button onclick="${handler}">Reset</button>`,
    });
    assert.doesNotMatch(html, /data-codex-action="reset-settings"/);
    assert.doesNotMatch(html, /\sonclick\s*=/i);
  }
});

test('all-time partial coverage stays visible when trend rows are empty', () => {
  const snapshot = snapshotFixture();
  snapshot.coverage.period.allTime = {
    migratedFiles: 3,
    totalFiles: 5,
    migratedBytes: 300,
    totalBytes: 500,
    complete: false,
  };
  const view = buildCodexUsageView(snapshot, NOW);
  view.monthly = [];
  const html = renderCodexView(view, scopedInsights(view), CODEX_COPY_EN, {
    formatBytes: (bytes) => String(bytes),
  });

  assert.match(html, /data-codex-trend="all"[^>]*data-codex-coverage-status="partial"/);
  assert.match(html, /data-codex-coverage-range="all"[^>]*>Coverage: 3\/5 files · 300\/500 bytes · Partial<\/p>/);
  assert.match(html, /data-codex-chart-root="codex-all"/);
  assert.match(html, /data-codex-scope-summary="all"/);
  assert.match(html, /<h3>Monthly<\/h3>/);
  assert.match(html, /No monthly Codex usage is indexed yet\./);
  assert.doesNotMatch(html, /No daily Codex usage is indexed yet\./);
});

test('Codex renderer consumes every injected temporal and byte formatter', () => {
  const snapshot = snapshotFixture();
  snapshot.coverage.indexedBytes = 1_301;
  snapshot.coverage.totalBytes = 1_501;
  snapshot.coverage.period.last7Days.migratedBytes = 701;
  snapshot.coverage.period.last7Days.totalBytes = 702;
  snapshot.coverage.period.last30Days.migratedBytes = 3_001;
  snapshot.coverage.period.last30Days.totalBytes = 3_002;
  snapshot.coverage.period.allTime.migratedBytes = 5_001;
  snapshot.coverage.period.allTime.totalBytes = 5_002;
  const view = buildCodexUsageView(snapshot, NOW);
  const sentinelNow = 42_424_242;
  const observedAt = view.lastTaskIdentity!.observedAt;
  const html = renderCodexView(view, scopedInsights(view), CODEX_COPY_EN, {
    now: sentinelNow,
    formatDateTime: (timestamp) => `DATE(${timestamp})`,
    formatDuration: (milliseconds) => `DURATION(${milliseconds})`,
    formatRelativeTime: (targetTimestamp, now) => `RELATIVE(${targetTimestamp},${now})`,
    formatBytes: (bytes) => `BYTES(${bytes})`,
  });

  assert.match(html, new RegExp(`DATE\\(${observedAt}\\)`));
  assert.match(html, new RegExp(`RELATIVE\\(${observedAt},${sentinelNow}\\)`));
  assert.match(html, new RegExp(`DURATION\\(${view.lastTask!.durationMs}\\)`));
  const formattedBytes = [...html.matchAll(/BYTES\((\d+)\)/g)]
    .map((match) => Number(match[1]))
    .sort((left, right) => left - right);
  assert.deepEqual(formattedBytes, [
    701,
    702,
    1_301,
    1_301,
    1_501,
    1_501,
    3_001,
    3_002,
    5_001,
    5_002,
  ]);
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

test('Codex renderer shows every current named last-observed limit with human window labels', () => {
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
  assert.match(html, /5-hour window/);
  assert.match(html, /Weekly window/);
  assert.match(html, /31%/);
  assert.match(html, /47%/);
  assert.match(html, /Last observed/);
  assert.match(html, /Local log.*not live/);
  assert.doesNotMatch(html, />primary<|>secondary<|300m/);
});

test('Overview renders all limit states distinctly and keeps reasoning inside the three-part composition', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);
  view.limits = [
    { state: 'current', windowMinutes: 300, usedPercent: 0, remainingPercent: 100, observedAt: NOW, resetsAt: NOW + 60_000, source: 'local-log' },
    { state: 'expired', windowMinutes: 300, usedPercent: 20, remainingPercent: 80, observedAt: NOW - 60_000, source: 'local-log' },
    { state: 'missing' },
    { state: 'unlimited', observedAt: NOW, source: 'local-log' },
  ];
  const html = renderCodexView(view, scopedInsights(view), CODEX_COPY_EN, { now: NOW });

  for (const state of ['current', 'expired', 'missing', 'unlimited']) {
    assert.match(html, new RegExp(`data-codex-limit-state="${state}"`));
  }
  assert.match(html, /0% used.*100% remaining/s);
  assert.match(html, /Expired \/ stale last-observed limit/);
  assert.match(html, /No locally observed usage limit/);
  assert.match(html, /Unlimited/);
  assert.equal((html.match(/cost-comp-seg seg-(?:input|cache-read|output)/g) ?? []).length >= 3, true);
  assert.doesNotMatch(html, /cost-comp-seg[^>]*reasoning/);
});

test('Overview labels an unknown limit window with a localized duration instead of a provider alias', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);
  view.limits = [{
    state: 'current',
    windowMinutes: 90,
    usedPercent: 20,
    remainingPercent: 80,
    observedAt: NOW,
    resetsAt: NOW + 60_000,
    source: 'local-log',
  }];
  const html = renderCodexView(view, scopedInsights(view), CODEX_COPY_EN, { now: NOW });

  assert.match(html, /1 hour 30 minutes/);
  assert.doesNotMatch(html, />primary<|>secondary<|90m/);
});

test('production-shaped Codex render localizes time duration countdown and bytes together', () => {
  const snapshot = snapshotFixture();
  snapshot.coverage.indexedBytes = 1_300;
  snapshot.coverage.totalBytes = 1_500;
  snapshot.limit = {
    provider: 'codex',
    observedAt: Date.parse('2026-07-20T11:59:00.000Z'),
    source: 'local-log',
    confidence: 'last-observed',
    windows: [{
      usedPercent: 31,
      windowMinutes: 90,
      resetsAt: Date.parse('2026-07-20T23:30:00.000Z'),
    }],
  };
  const view = buildCodexUsageView(snapshot, NOW);
  const previous = I18n.getCurrentLanguage();
  try {
    I18n.setLanguage('de-DE');
    const html = renderCodexView(
      view,
      scopedInsights(view),
      I18n.t.providers.codex,
      {
        now: NOW,
        formatNumber: (value) => I18n.formatNumber(value),
        ...createCodexLocalizedFormatters('de-DE', 'Asia/Hong_Kong'),
      },
    );

    assert.match(html, /1 Stunde.*30 Minuten/);
    assert.match(html, /20 Minuten/);
    assert.match(html, /21\.07\.2026.*07:30/);
    assert.match(html, /12 Stunden/);
    assert.match(html, /1,3 KB.*1,5 KB/s);
  } finally {
    I18n.setLanguage(previous);
  }
});

test('Overview labels local-log and OAuth limit sources truthfully', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);
  view.limits = [
    { state: 'current', usedPercent: 1, remainingPercent: 99, observedAt: NOW, resetsAt: NOW + 60_000, source: 'local-log' },
    { state: 'current', usedPercent: 2, remainingPercent: 98, observedAt: NOW, resetsAt: NOW + 60_000, source: 'oauth' },
  ];
  const html = renderCodexView(view, [], CODEX_COPY_EN, { now: NOW });

  assert.match(html, /Local log · not live/);
  assert.match(html, /Account snapshot · last observed/);
  assert.equal((html.match(/Local log · not live/g) ?? []).length, 1);
});

test('Overview orders limits, recent task, and one cohesive trend without internal limit names', () => {
  const snapshot = snapshotFixture();
  snapshot.limit = {
    provider: 'codex',
    observedAt: NOW - 60_000,
    source: 'local-log',
    confidence: 'last-observed',
    windows: [{ label: 'primary', usedPercent: 31, windowMinutes: 300, resetsAt: NOW + 60_000 }],
  };
  const view = buildCodexUsageView(snapshot, NOW);
  const html = renderCodexView(view, scopedInsights(view), CODEX_COPY_EN, {
    now: NOW,
  });

  assert.ok(html.indexOf('data-codex-section="limits"') < html.indexOf('data-codex-section="recent-task"'));
  assert.ok(html.indexOf('data-codex-section="recent-task"') < html.indexOf('data-codex-section="trend"'));
  assert.match(html, /5-hour window/);
  assert.match(html, /31% used.*69% remaining/s);
  assert.match(html, /Local log.*not live/s);
  assert.match(html, /data-codex-action="view-task"/);
  assert.match(html, /Reasoning is included within output/);
  assert.match(html, /Observed session duration total \(proxy\)/);
  assert.match(html, /data-codex-action="set-overview-scope"/);
  assert.match(html, /data-codex-action="set-chart-metric"/);
  assert.match(html, /data-codex-action="drilldown-date"/);
  assert.equal((html.match(/class="daily-breakdown codex-overview-trend/g) ?? []).length, 1);
  assert.doesNotMatch(html, />primary<|>secondary<|300m|Task-reported duration|session:|project:/);
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

test('every Codex locale labels structural data as patch and tool-call proxies', () => {
  const languages = [
    'en',
    'de-DE',
    'zh-TW',
    'zh-CN',
    'ja',
    'ko',
    'pt-BR',
    'id',
  ] as const;
  const expected = {
    en: ['Patch calls', 'Post-patch tool-call proxy / patch call'],
    'de-DE': ['Patch-Aufrufe', 'Tool-Call-Proxy nach Patch / Patch-Aufruf'],
    'zh-TW': ['修補呼叫次數', '每次修補呼叫的修補後工具呼叫代理量'],
    'zh-CN': ['补丁调用次数', '每次补丁调用的补丁后工具调用代理量'],
    ja: ['パッチ呼び出し', 'パッチ呼び出しあたりのパッチ後ツール呼び出しプロキシ'],
    ko: ['패치 호출', '패치 호출당 패치 후 도구 호출 프록시'],
    'pt-BR': ['Chamadas de patch', 'Proxy de chamadas de ferramenta pós-patch / chamada de patch'],
    id: ['Panggilan patch', 'Proksi panggilan alat pasca-patch / panggilan patch'],
  };
  const prohibited = /files changed|commands per file|post-change commands \/ file|patch rounds|command intensity|Befehle nach Änderung \/ Datei|Patch-Runden|Befehlsintensität|每個檔案的修改後命令數|修補輪次|修改後命令密度|每个文件的修改后命令数|补丁轮次|修改后命令密度|ファイルあたり変更後コマンド|パッチ回数|変更後のコマンド密度|파일당 변경 후 명령|패치 라운드|변경 후 명령 밀도|Comandos após mudança \/ arquivo|Rodadas de patch|Intensidade de comandos após mudanças|Perintah setelah perubahan \/ file|Putaran patch|Intensitas perintah setelah perubahan/i;
  const previous = I18n.getCurrentLanguage();
  try {
    const view = buildCodexUsageView(snapshotFixture(), NOW);
    for (const language of languages) {
      I18n.setLanguage(language);
      const copy = I18n.t.providers.codex as unknown as Record<string, unknown>;
      const html = renderCodexView(view, [], I18n.t.providers.codex);

      assert.equal('postChangeCommandsPerFile' in copy, false, `${language} retains the legacy copy key`);
      assert.equal('patchRounds' in copy, false, `${language} retains the legacy copy key`);
      assert.match(html, new RegExp(expected[language][0]));
      assert.match(html, new RegExp(expected[language][1]));
      assert.doesNotMatch(html, prohibited);
    }
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
