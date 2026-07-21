import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  CODEX_COPY_EN,
  CodexScopedInsights,
  getCodexDocumentIdentity,
  renderCodexView,
  renderProviderCompare,
} from '../codexView';
import { buildCodexInsights, buildScopedCodexInsights } from '../providers/codex/codexInsights';
import { buildCodexUsageView } from '../providers/codex/codexUsage';
import { I18n } from '../i18n';
import { createCodexLocalizedFormatters } from '../codexFormat';
import { pseudonymousIdentityKey } from '../providers/codex/codexIdentity';
import {
  rootlessCrossProjectCycleFixture,
  snapshotFixture,
} from './codexFixtures';
import { getCodexClientScript } from '../codexViewClient';
import { getCodexViewStyles } from '../codexViewStyles';
import { dailyTable } from '../codexViewComponents';

const NOW = Date.parse('2026-07-20T12:00:00.000Z');
const VIEW_SALT = 'codex-view-render-test';
const pseudo = (label: string) => pseudonymousIdentityKey(VIEW_SALT, label);

function htmlBetween(html: string, start: string, end?: string): string {
  const startAt = html.indexOf(start);
  assert.notEqual(startAt, -1, `missing ${start}`);
  const endAt = end ? html.indexOf(end, startAt + start.length) : -1;
  return html.slice(startAt, endAt < 0 ? undefined : endAt);
}

type CodexFixtureView = ReturnType<typeof buildCodexUsageView>;

function scopedInsights(
  view: CodexFixtureView,
): CodexScopedInsights {
  return buildScopedCodexInsights(view);
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

function htmlTags(fragment: string, name: 'th' | 'td'): string[] {
  return fragment.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) ?? [];
}

function hasHtmlClass(tag: string, className: string): boolean {
  const classes = tag.match(/class="([^"]*)"/)?.[1].split(/\s+/) ?? [];
  return classes.includes(className);
}

test('Codex styles are responsive accessible and scoped to semantic VS Code tokens', () => {
  const css = getCodexViewStyles();

  assert.match(css, /body\.codex-document[\s\S]*?min-width:\s*0[\s\S]*?max-width:\s*100%/);
  assert.match(css, /\.container[\s\S]*?min-width:\s*0[\s\S]*?max-width:\s*100%/);
  assert.match(css, /\[data-codex-root\][\s\S]*?\.number-cell/);
  assert.match(css, /\.codex-scroll-region\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(css, /\.codex-overview-metric\[hidden\]\s*\{[^}]*display:\s*none/);
  assert.match(css, /\.codex-mobile-details\s*\{/);
  assert.match(css, /button\.codex-disclosure\s*\{[^}]*appearance:\s*none/);
  assert.match(css, /\.codex-sort-button\s*\{[^}]*appearance:\s*none[^}]*font:\s*inherit/);
  assert.match(css, /:focus-visible[\s\S]*?var\(--vscode-focusBorder\)/);
  assert.match(css, /@media\s*\(max-width:\s*480px\)/);
  assert.match(css, /@media\s*\(max-width:\s*380px\)/);
  const mobile = htmlBetween(css, '@media (max-width: 480px)', '@media (max-width: 380px)');
  assert.match(mobile, /\.codex-task-identity \.model-details-stacked > span\s*\{[^}]*gap:\s*12px/);
  assert.match(mobile, /\.codex-task-identity \.model-stat-label\s*\{[^}]*flex:\s*0 0 104px/);
  assert.match(mobile, /\.codex-task-identity \.model-details-stacked > span > strong\s*\{[^}]*flex:\s*1 1 0[^}]*min-width:\s*0[^}]*text-align:\s*right[^}]*overflow-wrap:\s*anywhere/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient|#[0-9a-f]{3,8}|box-shadow|@font-face|url\s*\(/i);
  assert.doesNotMatch(css, /font-family:\s*(?!var\(--vscode-)/i);
});

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
  const partialInsights = buildCodexInsights(view.last7Days, '7d');

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
  assert.match(evidenced, /cache and context proxy/i);
  assert.doesNotMatch(evidenced, /full test|hardening/i);
});

test('recommendation cards contain scope observation evidence proxy note and conditional action', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);
  const html = renderCodexView(view, {
    recent: buildCodexInsights(view.lastTask!, 'recent'),
    last7Days: [],
    last30Days: [],
    allTime: [],
  }, CODEX_COPY_EN);
  const recommendations = htmlBetween(html, 'data-codex-page="recommendations"', 'data-codex-page="settings"');

  for (const marker of ['insight-observation', 'insight-evidence', 'insight-note', 'insight-tip']) {
    assert.match(recommendations, new RegExp(`class="[^"]*${marker}`));
  }
  assert.match(recommendations, /<p class="insight-evidence codex-evidence"><strong>Evidence:<\/strong>/);
  assert.match(recommendations, /Recent task/);
  assert.match(recommendations, /data-codex-action="set-recommendation-scope"/);
  assert.doesNotMatch(recommendations, /tax|overhead|files changed|commands per file|patchCalls|toolCalls/i);
});

test('Recommendations disables only partial daily scopes while recent and aggregate all-time remain available', () => {
  const snapshot = snapshotFixture();
  snapshot.coverage.period.last7Days.complete = false;
  snapshot.coverage.period.last30Days.complete = false;
  const view = buildCodexUsageView(snapshot, NOW);
  const insights = {
    recent: buildCodexInsights(view.lastTask!, 'recent'),
    last7Days: buildCodexInsights(view.last7Days, '7d'),
    last30Days: buildCodexInsights(view.last30Days, '30d'),
    allTime: buildCodexInsights(view.allTime, 'all'),
  };
  const html = renderCodexView(view, insights, CODEX_COPY_EN);
  const recommendations = htmlBetween(html, 'data-codex-page="recommendations"', 'data-codex-page="settings"');

  for (const period of ['7d', '30d']) {
    assert.match(recommendations, new RegExp(`data-codex-recommendation-scope="${period}"[^>]*disabled[^>]*aria-disabled="true"`));
    const panel = htmlBetween(recommendations, `data-codex-recommendation-panel="${period}"`, period === '7d' ? 'data-codex-recommendation-panel="30d"' : 'data-codex-recommendation-panel="all"');
    assert.doesNotMatch(panel, /class="[^"]*insight-card/);
  }
  assert.match(recommendations, /Some date ranges are unavailable while the daily index catches up\./);
  assert.doesNotMatch(recommendations, /this range/i);
  for (const period of ['recent', 'all']) {
    assert.match(recommendations, new RegExp(`data-codex-recommendation-scope="${period}"(?![^>]*disabled)`));
  }
});

test('every complete recommendation scope renders its own cards and localized constraint', () => {
  const snapshot = snapshotFixture();
  snapshot.coverage.period.last7Days.complete = true;
  snapshot.coverage.period.last30Days.complete = true;
  const view = buildCodexUsageView(snapshot, NOW);
  const html = renderCodexView(view, buildScopedCodexInsights(view), CODEX_COPY_EN);
  const recommendations = htmlBetween(html, 'data-codex-page="recommendations"', 'data-codex-page="settings"');
  const panels = [
    ['recent', '7d'], ['7d', '30d'], ['30d', 'all'], ['all', undefined],
  ] as const;

  for (const [scope, next] of panels) {
    const panel = htmlBetween(recommendations, `data-codex-recommendation-panel="${scope}"`, next ? `data-codex-recommendation-panel="${next}"` : undefined);
    assert.match(panel, /class="[^"]*insight-card/);
    assert.equal((panel.match(/<summary>Paste-ready constraint<\/summary>/g) ?? []).length, 1);
  }
});

test('partial rolling recommendation panels contain neither cards nor constraints', () => {
  const snapshot = snapshotFixture();
  snapshot.coverage.period.last7Days.complete = false;
  snapshot.coverage.period.last30Days.complete = false;
  const view = buildCodexUsageView(snapshot, NOW);
  const html = renderCodexView(view, buildScopedCodexInsights(view), CODEX_COPY_EN);
  const recommendations = htmlBetween(html, 'data-codex-page="recommendations"', 'data-codex-page="settings"');

  for (const [scope, next] of [['7d', '30d'], ['30d', 'all']] as const) {
    const panel = htmlBetween(recommendations, `data-codex-recommendation-panel="${scope}"`, `data-codex-recommendation-panel="${next}"`);
    assert.doesNotMatch(panel, /insight-card|Paste-ready constraint/);
  }
});

test('recommendation composition shows comparable fresh totals and shares for roles models and effort', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);
  const html = renderCodexView(view, buildScopedCodexInsights(view), CODEX_COPY_EN, {
    formatNumber: (value) => `N:${value}`,
  });
  const panel = htmlBetween(html, 'data-codex-recommendation-panel="recent"', 'data-codex-recommendation-panel="7d"');

  assert.match(panel, /Root \/ Unknown[^<]*N:200[^<]*50%/);
  assert.doesNotMatch(panel, /(?:>|·\s*)Root:\s*N:200[^<]*50%/);
  assert.match(panel, /Subagent[^<]*N:200[^<]*50%/);
  assert.match(panel, /gpt-5\.6-sol[^<]*N:400[^<]*100%/);
  assert.match(panel, /high[^<]*N:400[^<]*100%/);
  assert.doesNotMatch(panel, /\$/);
});

test('Codex renderer exposes three product destinations and auxiliary settings', () => {
  const html = renderFixture();
  const primaryNav = html.match(/<nav class="tabs codex-tabs"[\s\S]*?<\/nav>/)?.[0] ?? '';
  const root = html.match(/<section[^>]*data-codex-root(?:="")?[^>]*>[\s\S]*<\/section>/)?.[0] ?? '';

  assert.equal((html.match(/data-codex-root(?=[\s>])/g) ?? []).length, 1);
  assert.match(root, /<header class="codex-header">[\s\S]*?<h1>Codex usage<\/h1>[\s\S]*?class="codex-beta">Beta<\/span>/);
  assert.match(root, /data-codex-header-action="refresh"[^>]*data-codex-action="refresh"/);
  assert.match(root, /data-codex-header-action="settings"[^>]*data-codex-action="open-settings"/);
  assert.equal(primaryNav.match(/<nav\b[^>]*role="tablist"[^>]*>/g)?.length, 1);
  assert.equal(primaryNav.match(/\brole="tab"/g)?.length, 3);
  assert.equal(html.match(/id="codex-page-panel-[^"]+"/g)?.length, 4);
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
  assert.match(html, /<th class="sortable"[^>]*data-codex-sort-key="title"[^>]*aria-sort="none"[^>]*><button[^>]*class="codex-sort-button"/);
  assert.match(html, /data-codex-project-detail="[a-f0-9]{16}"/);
  for (const scope of ['recent', '7d', '30d', 'all']) {
    assert.match(html, new RegExp(`data-codex-recommendation-scope="${scope}"`));
    assert.match(html, new RegExp(`data-codex-recommendation-panel="${scope}"`));
  }
  assert.match(html, /<details class="model-item codex-coverage">/);
  assert.match(html, /data-test-settings/);
  assert.match(html, /N:1200/);
  assert.match(html, /data-label-processed="N:/);
  assert.match(html, /data-label-threads="N:/);
  assert.match(html, /data-codex-action="select-chart-metric"[^>]*data-codex-chart-id="codex-7d"[^>]*data-codex-chart-metric="processed"/);
  assert.match(html, /data-codex-action="toggle-thread-children"[^>]*data-codex-thread-key="[a-f0-9]{16}"/);
  assert.match(html, /data-codex-action="project-sessions"[^>]*data-codex-project-view-key="[a-f0-9]{16}"/);
  assert.match(html, /data-codex-action="view-project-sessions"[^>]*data-codex-project-view-key="[a-f0-9]{16}"/);
  assert.match(html, /data-codex-action="set-recommendation-scope"[^>]*data-codex-recommendation-scope="recent"/);
  assert.doesNotMatch(html, /\sonclick=/);
  assert.doesNotMatch(html, /codex-metric-card|project:a|session:|Thread 1|Project 1/);
  assert.equal((html.match(/class="codex-header"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /\$|raw-session|\/Users\/|https?:\/\//);
});

test('Explore renders Projects, Sessions, and Models & effort with private view keys', () => {
  const snapshot = snapshotFixture();
  const root = snapshot.files[0];
  snapshot.files = Array.from({ length: 27 }, (_, index) => ({
    ...root,
    session: {
      ...root.session,
      sessionKey: `session:explore-${index}`,
      sessionTitle: `Session ${index}`,
      endedAt: NOW - index * 1_000,
    },
  }));
  const view = buildCodexUsageView(snapshot, NOW);
  const html = renderCodexView(view, scopedInsights(view), CODEX_COPY_EN);

  assert.match(html, /data-codex-explore-view-button="projects"/);
  assert.match(html, /data-codex-explore-view-button="sessions"/);
  assert.match(html, /data-codex-explore-view-button="models-effort"/);
  assert.match(html, /20\/27 Sessions/);
  assert.match(html, /data-codex-action="project-sessions"/);
  assert.match(html, /View all sessions: ClaudeCodeUsage/);
  assert.match(html, /aria-label="Expand .*ClaudeCodeUsage"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /data-codex-action="clear-filters"/);
  assert.match(html, /class="[^"]*\bnumber-cell\b[^"]*"/);
  assert.match(html, /data-codex-session-layout="tree"/);
  assert.doesNotMatch(html, /project:a|session:explore-|Thread 1|Project 1/);
});

test('Explore filtered session contract is flat and retains a parent-task label', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);
  const unfiltered = renderCodexView(view, scopedInsights(view), CODEX_COPY_EN);
  const html = renderCodexView(view, scopedInsights(view), CODEX_COPY_EN, {
    exploreFilters: { query: 'locke' },
  });

  assert.match(unfiltered, /data-codex-filter-parent[^>]*hidden/);
  assert.match(html, /data-codex-session-layout="flat"/);
  assert.match(html, /Parent task/);
});

test('Explore and Models scope tabs are complete ARIA tabs with inactive panels hidden', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);
  const html = renderCodexView(view, scopedInsights(view), CODEX_COPY_EN);

  assert.match(html, /id="codex-explore-tablist"[^>]*role="tablist"/);
  for (const [key, selected] of [
    ['projects', true],
    ['sessions', false],
    ['models-effort', false],
  ] as const) {
    assert.match(html, new RegExp(
      `id="codex-explore-tab-${key}"[^>]*role="tab"[^>]*aria-controls="codex-explore-panel-${key}"[^>]*aria-selected="${selected}"[^>]*tabindex="${selected ? '0' : '-1'}"`,
    ));
    assert.match(html, new RegExp(
      `id="codex-explore-panel-${key}"[^>]*role="tabpanel"[^>]*aria-labelledby="codex-explore-tab-${key}"${selected ? '' : '[^>]*hidden'}`,
    ));
  }
  assert.match(html, /id="codex-model-effort-tablist"[^>]*role="tablist"/);
  for (const [key, selected] of [
    ['recent', true], ['7d', false], ['30d', false], ['all', false],
  ] as const) {
    assert.match(html, new RegExp(
      `id="codex-model-effort-tab-${key}"[^>]*role="tab"[^>]*aria-controls="codex-model-effort-panel-${key}"[^>]*aria-selected="${selected}"[^>]*tabindex="${selected ? '0' : '-1'}"`,
    ));
    assert.match(html, new RegExp(
      `id="codex-model-effort-panel-${key}"[^>]*role="tabpanel"[^>]*aria-labelledby="codex-model-effort-tab-${key}"${selected ? '' : '[^>]*hidden'}`,
    ));
  }
});

test('Sessions renderer echoes controlled filters as selected escaped values and active-only chips', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);
  const project = view.projects[0];
  const html = renderCodexView(view, scopedInsights(view), CODEX_COPY_EN, {
    exploreFilters: {
      query: 'Locke <needle>',
      role: 'subagent',
      projectViewKey: project.viewKey,
      model: 'gpt-5.6-sol',
      effort: 'high',
      period: '7d',
      date: '2026-07-20',
    },
  });
  const sessions = htmlBetween(
    html,
    'id="codex-explore-panel-sessions"',
    'id="codex-explore-panel-models-effort"',
  );

  assert.match(sessions, /id="codex-session-search"[^>]*value="Locke &lt;needle&gt;"/);
  assert.match(sessions, /option value="subagent" selected/);
  assert.match(sessions, new RegExp(`option value="${project.viewKey}" selected`));
  assert.match(sessions, /option value="gpt-5\.6-sol" selected/);
  assert.match(sessions, /option value="high" selected/);
  assert.match(sessions, /option value="7d" selected/);
  assert.equal((sessions.match(/data-codex-filter-chip=/g) ?? []).length, 7);
  assert.match(sessions, /data-codex-filter-chip="date"[^>]*>Date: 2026-07-20/);
  assert.match(sessions, /Locke &lt;needle&gt;/);
  assert.match(sessions, /data-codex-action="clear-filters"(?![^>]*hidden)/);
  assert.match(sessions, /aria-live="polite"/);
  assert.equal((sessions.match(/option value="all"/g) ?? []).length, 1);
  assert.doesNotMatch(sessions, /data-codex-filter-chip="[^"]+"><\/span>/);
});

test('Sessions date filters use exact indexed period-day membership', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);
  const sessionsFor = (date: string) => htmlBetween(
    renderCodexView(view, scopedInsights(view), CODEX_COPY_EN, { exploreFilters: { date } }),
    'id="codex-explore-panel-sessions"',
    'id="codex-explore-panel-models-effort"',
  );

  const matching = sessionsFor('2026-07-20');
  assert.match(matching, /data-codex-filter-chip="date"[^>]*>Date: 2026-07-20/);
  assert.match(matching, /data-codex-days="2026-07-20"/);
  assert.doesNotMatch(matching, /data-codex-days="2026-07-10"/);

  const absent = sessionsFor('2099-12-31');
  assert.match(absent, /data-codex-filter-chip="date"[^>]*>Date: 2099-12-31/);
  assert.match(absent, /data-codex-thread-visible[^>]*>0<\/span>/);
  assert.doesNotMatch(absent, /data-codex-thread-row(?:\s|>)/);
});

test('Sessions period filters produce different sets from verified slices', () => {
  const snapshot = snapshotFixture();
  const projectKey = pseudo('period-project');
  const makeFile = (
    source: (typeof snapshot.files)[number],
    label: string,
    title: string,
    day: string,
  ) => ({
    ...source,
    session: {
      ...source.session,
      sessionKey: pseudo(`period-${label}`),
      parentSessionKey: undefined,
      projectKey,
      sessionTitle: title,
    },
    period: {
      ...source.period!,
      days: { [day]: source.period!.days[Object.keys(source.period!.days)[0]] },
    },
  });
  snapshot.files = [
    makeFile(snapshot.files[0], 'recent', 'Recent slice', '2026-07-20'),
    makeFile(snapshot.files[2], 'month', 'Month slice', '2026-07-10'),
    makeFile(snapshot.files[3], 'old', 'Old slice', '2026-06-01'),
  ];
  snapshot.coverage.period.last7Days.complete = true;
  snapshot.coverage.period.last30Days.complete = true;
  snapshot.coverage.period.allTime.complete = true;
  const view = buildCodexUsageView(snapshot, NOW);
  const sessionsFor = (period: '7d' | '30d' | 'all') => htmlBetween(
    renderCodexView(view, [], CODEX_COPY_EN, { exploreFilters: { period } }),
    'id="codex-explore-panel-sessions"',
    'id="codex-explore-panel-models-effort"',
  );

  const seven = sessionsFor('7d');
  assert.match(seven, /Recent slice/);
  assert.doesNotMatch(seven, /Month slice|Old slice/);
  const thirty = sessionsFor('30d');
  assert.match(thirty, /Recent slice/);
  assert.match(thirty, /Month slice/);
  assert.doesNotMatch(thirty, /Old slice/);
  const all = sessionsFor('all');
  assert.match(all, /Recent slice/);
  assert.match(all, /Month slice/);
  assert.match(all, /Old slice/);
});

test('Sessions disables incomplete period filters and explains their unavailable coverage', () => {
  const snapshot = snapshotFixture();
  snapshot.coverage.period.last7Days.complete = false;
  snapshot.coverage.period.last30Days.complete = false;
  snapshot.coverage.period.allTime.complete = false;
  const view = buildCodexUsageView(snapshot, NOW);
  const html = renderCodexView(view, [], CODEX_COPY_EN);
  const sessions = htmlBetween(
    html,
    'id="codex-explore-panel-sessions"',
    'id="codex-explore-panel-models-effort"',
  );

  for (const period of ['7d', '30d', 'all']) {
    assert.match(sessions, new RegExp(`option value="${period}"[^>]*disabled[^>]*aria-disabled="true"`));
  }
  assert.match(sessions, /data-codex-period-availability-note/);
  assert.match(sessions, /Coverage.*Partial/);
});

test('Sessions canonicalizes a stale unavailable period to the unfiltered UI state', () => {
  const snapshot = snapshotFixture();
  snapshot.coverage.period.last7Days.complete = false;
  snapshot.coverage.period.last30Days.complete = false;
  snapshot.coverage.period.allTime.complete = false;
  const view = buildCodexUsageView(snapshot, NOW);
  const html = renderCodexView(view, [], CODEX_COPY_EN, {
    exploreFilters: { period: '7d' },
  });
  const sessions = htmlBetween(
    html,
    'id="codex-explore-panel-sessions"',
    'id="codex-explore-panel-models-effort"',
  );

  assert.match(sessions, /option value="" selected/);
  assert.match(sessions, /option value="7d"(?![^>]*selected)[^>]*disabled/);
  assert.doesNotMatch(sessions, /data-codex-filter-chip="period"/);
  assert.match(sessions, /data-codex-session-layout="tree"/);
  assert.match(
    sessions,
    new RegExp(`<span data-codex-thread-visible[^>]*>${view.recentThreads.length}<\\/span>/${view.totalThreadCount}`),
  );
  assert.equal(
    (sessions.match(/data-codex-thread-row(?:\s|>)/g) ?? []).length,
    view.recentThreads.length,
  );
  assert.match(sessions, /data-codex-action="clear-filters"[^>]*hidden/);
});

test('flat orphan and cycle rows retain distinct neutral parent status without identifiers', () => {
  const snapshot = snapshotFixture();
  const root = snapshot.files[0];
  const projectKey = pseudo('parent-status-project');
  const orphan = {
    ...root,
    session: {
      ...root.session,
      sessionKey: pseudo('parent-status-orphan'),
      parentSessionKey: pseudo('parent-status-missing'),
      projectKey,
      sessionTitle: 'Orphan display',
    },
  };
  const cycleKey = pseudo('parent-status-cycle');
  const cycle = {
    ...root,
    session: {
      ...root.session,
      sessionKey: cycleKey,
      parentSessionKey: cycleKey,
      projectKey,
      sessionTitle: 'Cycle display',
    },
  };
  snapshot.files = [orphan, cycle];
  const view = buildCodexUsageView(snapshot, NOW);
  const html = renderCodexView(view, [], CODEX_COPY_EN, {
    exploreFilters: { role: 'root' },
  });
  const sessions = htmlBetween(
    html,
    'id="codex-explore-panel-sessions"',
    'id="codex-explore-panel-models-effort"',
  );

  assert.match(sessions, /data-parent-status="missing"/);
  assert.match(sessions, /data-parent-status="cycle"/);
  assert.equal((sessions.match(/Parent task: Unavailable/g) ?? []).length >= 2, true);
  assert.doesNotMatch(sessions, /parent-status-missing|parent-status-cycle/);
});

test('mobile session details preserve every desktop fact with injected formatters', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);
  const html = renderCodexView(view, [], CODEX_COPY_EN, {
    formatNumber: (value) => `N(${value})`,
    formatDateTime: (value) => `DATE(${value})`,
    formatDuration: (value) => `DURATION(${value})`,
  });
  const mobile = html.match(/<details class="codex-mobile-details">[\s\S]*?<\/details>/)?.[0] ?? '';

  assert.match(mobile, /<summary[^>]*aria-label=/);
  for (const label of [
    'Date', 'Role', 'Project', 'Parent task', 'Models', 'Effort',
    'Processed tokens', 'Fresh input \\+ output', 'Input cache share',
    'Output tokens', 'Reasoning output', 'Observed session duration total \\(proxy\\)',
  ]) {
    assert.match(mobile, new RegExp(`<dt>${label}<\\/dt>`));
  }
  assert.match(mobile, /DATE\(/);
  assert.match(mobile, /N\(/);
  assert.match(mobile, /DURATION\(/);
});

test('desktop and mobile sessions include an escaped distinct local directory', () => {
  const snapshot = snapshotFixture();
  snapshot.files[0].session.projectDirectoryName = '<img src=x onerror="alert(1)">';
  const view = buildCodexUsageView(snapshot, NOW);
  const html = renderCodexView(view, [], CODEX_COPY_EN);
  const sessions = htmlBetween(
    html,
    'id="codex-explore-panel-sessions"',
    'id="codex-explore-panel-models-effort"',
  );
  const mobile = sessions.match(/<details class="codex-mobile-details">[\s\S]*?<\/details>/)?.[0] ?? '';
  const escapedDirectory = '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;';

  assert.ok(sessions.includes(
    `<div class="model-details">Local folder: ${escapedDirectory}</div>`,
  ));
  assert.ok(mobile.includes(
    `<dt>Local folder</dt><dd>${escapedDirectory}</dd>`,
  ));
  assert.doesNotMatch(sessions, /<img\s/i);
});

test('Models recent scope renders an accurate empty state instead of seven-day data', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);
  view.lastTask = null;
  const html = renderCodexView(view, [], CODEX_COPY_EN);
  const recent = htmlBetween(
    html,
    'id="codex-model-effort-panel-recent"',
    'id="codex-model-effort-panel-7d"',
  );

  assert.match(recent, /No recent Codex task is indexed yet\./);
  assert.doesNotMatch(recent, /Processed tokens|gpt-5\.6-sol/);
});

test('non-English Explore fallbacks never expose internal project or session identifiers', () => {
  const previous = I18n.getCurrentLanguage();
  try {
    I18n.setLanguage('zh-CN');
    const view = buildCodexUsageView(snapshotFixture(), NOW);
    const html = renderCodexView(view, scopedInsights(view), I18n.t.providers.codex);
    assert.doesNotMatch(html, /project:a|session:root-a|Project 1|Thread 1/);
  } finally {
    I18n.setLanguage(previous);
  }
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
  assert.match(html, /data-codex-recommendation-panel="all"/);
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
  assert.match(html, /data-codex-coverage-range="all"[^>]*>Coverage: Indexed log entries 3\/5 · Indexed storage 300\/500 · Partial<\/p>/);
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
      updatedAt: NOW,
    },
    CODEX_COPY_EN,
    {
      formatNumber: (value) => `N(${value})`,
      formatDateTime: (value) => `DATE(${value})`,
    },
  );

  assert.match(html, /Claude/);
  assert.match(html, /Codex/);
  assert.match(html, /provider-compare-grid/);
  assert.match(html, /Indexed all time/);
  assert.match(html, new RegExp(`Updated at.*DATE\\(${NOW}\\)`, 's'));
  assert.match(html, /Claude tokens/);
  assert.match(html, /Codex tokens/);
  assert.match(html, /N\(100\)/);
  assert.doesNotMatch(html, /combined|quota|\$/i);
});

test('Compare localizes its all-time scope and timestamp without merging provider accounting', () => {
  const previous = I18n.getCurrentLanguage();
  try {
    I18n.setLanguage('zh-CN');
    const copy = I18n.t.providers.codex;
    const html = renderProviderCompare(
      {
        claude: { label: 'Claude', input: 100, output: 20, cache: 300 },
        codex: { label: 'Codex Beta', input: 500, output: 100, cache: 400 },
        updatedAt: NOW,
      },
      copy,
      {
        formatNumber: (value) => `数字(${value})`,
        formatDateTime: (value) => `时间(${value})`,
      },
    );

    assert.match(html, /已索引的全部时间/);
    assert.match(html, new RegExp(`更新时间.*时间\\(${NOW}\\)`, 's'));
    assert.match(html, /Claude Token 口径/);
    assert.match(html, /Codex Token 口径/);
    assert.doesNotMatch(html, /Indexed all time|Updated at|combined|总计|\$/i);
  } finally {
    I18n.setLanguage(previous);
  }
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

  assert.match(html, /<h3>Codex main · 5-hour window<\/h3>/);
  assert.match(html, /<h3>Codex main · Weekly window<\/h3>/);
  assert.match(html, /<h3>GPT-5\.3-Codex-Spark · Weekly window<\/h3>/);
  assert.match(html, /<div class="cost-comp-head"><strong>31% used · 69% remaining<\/strong><\/div>/);
  assert.match(html, /<div class="cost-comp-head"><strong>47% used · 53% remaining<\/strong><\/div>/);
  assert.match(html, /<div class="cost-comp-head"><strong>4% used · 96% remaining<\/strong><\/div>/);
  assert.doesNotMatch(html, /<div class="cost-comp-head"><span>(?:5-hour window|Weekly window)<\/span>/);
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
    const formatters = createCodexLocalizedFormatters('de-DE', 'Asia/Hong_Kong');
    const html = renderCodexView(
      view,
      scopedInsights(view),
      I18n.t.providers.codex,
      {
        now: NOW,
        formatNumber: (value) => I18n.formatNumber(value),
        ...formatters,
      },
    );

    assert.match(html, /1 Stunde.*30 Minuten/);
    assert.match(html, /20 Minuten/);
    assert.match(html, /21\.07\.2026.*07:30/);
    assert.match(html, /12 Stunden/);
    assert.ok(html.includes(formatters.formatBytes(1_300)));
    assert.ok(html.includes(formatters.formatBytes(1_500)));
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

test('rootless task card targets its same-project representative cycle row', () => {
  const view = buildCodexUsageView(rootlessCrossProjectCycleFixture(), NOW);
  const identity = view.lastTaskIdentity!;
  const html = renderCodexView(view, scopedInsights(view), CODEX_COPY_EN);
  const row = view.recentThreads.find((thread) =>
    thread.viewKey === identity.taskKey &&
    thread.projectViewKey === identity.projectKey
  );

  assert.ok(row);
  assert.equal(row.parentStatus, 'cycle');
  assert.match(
    html,
    new RegExp(
      `data-codex-action="view-task" data-codex-task-key="${identity.taskKey}" data-codex-project-key="${identity.projectKey}"`,
    ),
  );
  const rowHtml = htmlBetween(
    html,
    `data-codex-view-key="${identity.taskKey}"`,
    '</tr>',
  );
  assert.match(rowHtml, new RegExp(`data-project="${identity.projectKey}"`));
  assert.match(rowHtml, /data-parent-status="cycle"/);
  assert.doesNotMatch(rowHtml, /data-codex-parent-view-key/);
  assert.match(
    html,
    new RegExp(`<option value="${identity.projectKey}"[^>]*>Representative Project</option>`),
  );
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

    for (const label of ['最近任务', '最近 7 天', '最近 30 天', '全部时间', '线程', '项目', '优化建议', '设置']) {
      assert.match(html, new RegExp(label));
    }
    assert.match(html, /Token 构成/);
    assert.match(html, /推理已包含在输出中/);
  } finally {
    I18n.setLanguage(previous);
  }
});

test('every locale renderer localizes coverage labels and never leaks internal units or limit aliases', () => {
  const languages = ['en', 'de-DE', 'zh-TW', 'zh-CN', 'ja', 'ko', 'pt-BR', 'id'] as const;
  const previous = I18n.getCurrentLanguage();
  try {
    const view = buildCodexUsageView(snapshotFixture(), NOW);
    for (const language of languages) {
      I18n.setLanguage(language);
      const html = renderCodexView(view, scopedInsights(view), I18n.t.providers.codex, {
        now: NOW,
        locale: I18n.getLocale(),
        timeZone: 'Asia/Hong_Kong',
      });
      const userFacingText = [
        html.replace(/<[^>]+>/g, ' '),
        ...[...html.matchAll(/\b(?:aria-label|title)="([^"]*)"/g)].map((match) => match[1]),
      ].join(' ');
      const leaked = userFacingText.match(
        /\b(?:files|bytes|primary|secondary|commands per file|tax|overhead)\b/i,
      );
      const context = leaked?.index === undefined
        ? ''
        : userFacingText.slice(Math.max(0, leaked.index - 80), leaked.index + 80);
      assert.equal(leaked, null, `${language}: ${leaked?.[0] ?? ''} in ${context}`);
    }
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
    en: ['Patch calls', 'Post-patch tool-call proxy / patch call', 'Parent task'],
    'de-DE': ['Patch-Aufrufe', 'Tool-Call-Proxy nach Patch / Patch-Aufruf', 'Übergeordnete Aufgabe'],
    'zh-TW': ['修補呼叫次數', '每次修補呼叫的修補後工具呼叫代理量', '父任務'],
    'zh-CN': ['补丁调用次数', '每次补丁调用的补丁后工具调用代理量', '父任务'],
    ja: ['パッチ呼び出し', 'パッチ呼び出しあたりのパッチ後ツール呼び出しプロキシ', '親タスク'],
    ko: ['패치 호출', '패치 호출당 패치 후 도구 호출 프록시', '상위 작업'],
    'pt-BR': ['Chamadas de patch', 'Proxy de chamadas de ferramenta pós-patch / chamada de patch', 'Tarefa pai'],
    id: ['Panggilan patch', 'Proksi panggilan alat pasca-patch / panggilan patch', 'Tugas induk'],
  };
  const prohibited = /files changed|commands per file|post-change commands \/ file|patch rounds|command intensity|Befehle nach Änderung \/ Datei|Patch-Runden|Befehlsintensität|每個檔案的修改後命令數|修補輪次|修改後命令密度|每个文件的修改后命令数|补丁轮次|修改后命令密度|ファイルあたり変更後コマンド|パッチ回数|変更後のコマンド密度|파일당 변경 후 명령|패치 라운드|변경 후 명령 밀도|Comandos após mudança \/ arquivo|Rodadas de patch|Intensidade de comandos após mudanças|Perintah setelah perubahan \/ file|Putaran patch|Intensitas perintah setelah perubahan/i;
  const previous = I18n.getCurrentLanguage();
  try {
    const view = buildCodexUsageView(snapshotFixture(), NOW);
    for (const language of languages) {
      I18n.setLanguage(language);
      const copy = I18n.t.providers.codex as unknown as Record<string, unknown>;
      const html = renderCodexView(view, [], I18n.t.providers.codex, {
        exploreFilters: { query: 'locke' },
      });

      assert.equal('postChangeCommandsPerFile' in copy, false, `${language} retains the legacy copy key`);
      assert.equal('patchRounds' in copy, false, `${language} retains the legacy copy key`);
      assert.match(html, new RegExp(expected[language][0]));
      assert.match(html, new RegExp(expected[language][1]));
      assert.match(html, new RegExp(expected[language][2]));
      assert.doesNotMatch(html, prohibited);
    }
  } finally {
    I18n.setLanguage(previous);
  }
});

test('all eight locales deeply translate every evidence-driven recommendation copy key', () => {
  const languages = ['en', 'de-DE', 'zh-TW', 'zh-CN', 'ja', 'ko', 'pt-BR', 'id'] as const;
  const kinds = ['multi-agent-share', 'effort-comparison', 'post-patch-tool-intensity', 'cache-context', 'approval-reviewer-share'] as const;
  const evidence = ['taskCount', 'rootSessionFresh', 'subagentFresh', 'approvalReviewerFresh', 'observedEffort', 'highEffortFresh', 'lowMediumEffortFresh', 'patchCalls', 'toolCalls', 'postPatchToolCalls', 'compactCount', 'taskCompleteCount', 'processedToFreshRatio', 'cachedInputShare', 'reasoningOutputShare'] as const;
  const scalarKeys = ['recommendations', 'constraintNoAgents', 'constraintLowerEffort', 'constraintPostPatch', 'constraintCacheContext', 'constraintApprovalReviewer', 'recommendationComposition', 'recommendationProxyKpi', 'recommendationEmpty', 'recommendationPartial', 'insightObservation', 'insightEvidence', 'insightConditionalAction'] as const;
  const english = CODEX_COPY_EN;
  const previous = I18n.getCurrentLanguage();
  try {
    for (const language of languages) {
      I18n.setLanguage(language);
      const copy = I18n.t.providers.codex;
      assert.equal('constraintTests' in copy, false, `${language} retained a generic test constraint`);
      assert.equal('constraintStop' in copy, false, `${language} retained a generic stop constraint`);
      for (const key of scalarKeys) {
        assert.ok(copy[key], `${language}.${key} is missing`);
        if (language !== 'en') assert.notEqual(copy[key], english[key], `${language}.${key} fell back to English`);
      }
      for (const key of kinds) {
        assert.ok(copy.insightTitles[key]);
        assert.ok(copy.insightObservations[key]);
        assert.ok(copy.insightTips[key]);
        if (language !== 'en') {
          assert.notEqual(copy.insightTitles[key], english.insightTitles[key], `${language}.title.${key} fell back to English`);
          assert.notEqual(copy.insightObservations[key], english.insightObservations[key], `${language}.observation.${key} fell back to English`);
          assert.notEqual(copy.insightTips[key], english.insightTips[key], `${language}.tip.${key} fell back to English`);
        }
      }
      for (const key of evidence) {
        assert.ok(copy.insightEvidenceLabels[key], `${language}.evidence.${key} is missing`);
        if (language !== 'en') assert.notEqual(copy.insightEvidenceLabels[key], english.insightEvidenceLabels[key], `${language}.evidence.${key} fell back to English`);
      }
      assert.doesNotMatch(`${copy.constraintNoAgents} ${copy.constraintLowerEffort}`, /small change|kleine Änderung|小改動|小改动|작은 변경|mudança pequena|perubahan kecil/i);
    }
  } finally {
    I18n.setLanguage(previous);
  }
});

test('all eight locales label unclassified root-or-unknown insight evidence truthfully', () => {
  const expected = {
    en: 'Root / unknown-role fresh usage',
    'de-DE': 'Frische Nutzung durch Haupt- oder unbekannte Rollen',
    'zh-TW': '根角色或未知角色的新鮮用量',
    'zh-CN': '根角色或未知角色的新鲜用量',
    ja: 'ルート／役割不明の新規使用量',
    ko: '루트 역할 또는 알 수 없는 역할의 새 사용량',
    'pt-BR': 'Uso novo da função raiz ou de função desconhecida',
    id: 'Penggunaan baru oleh peran utama atau peran yang tidak diketahui',
  } as const;
  const previous = I18n.getCurrentLanguage();
  try {
    for (const [language, label] of Object.entries(expected)) {
      I18n.setLanguage(language as keyof typeof expected);
      assert.equal(
        I18n.t.providers.codex.insightEvidenceLabels.rootSessionFresh,
        label,
        language,
      );
    }
  } finally {
    I18n.setLanguage(previous);
  }
});

test('all eight locales localize usage trend separately from the daily-data label', () => {
  const expected = {
    en: 'Usage trend',
    'de-DE': 'Nutzungstrend',
    'zh-TW': '用量趨勢',
    'zh-CN': '用量趋势',
    ja: '使用量の推移',
    ko: '사용량 추이',
    'pt-BR': 'Tendência de uso',
    id: 'Tren penggunaan',
  } as const;
  const previous = I18n.getCurrentLanguage();
  try {
    for (const language of Object.keys(expected) as Array<keyof typeof expected>) {
      I18n.setLanguage(language);
      const copy = I18n.t.providers.codex as unknown as Record<string, string>;
      assert.equal(copy.usageTrend, expected[language], `${language}.usageTrend is missing or fell back`);
      assert.ok(copy.daily, `${language}.daily is missing`);
      assert.notEqual(copy.usageTrend, copy.daily, `${language}.usageTrend reused the daily-data label`);
    }
  } finally {
    I18n.setLanguage(previous);
  }
});

test('all eight locales describe only partial date-range recommendation unavailability', () => {
  const expected = {
    en: 'Some date ranges are unavailable while the daily index catches up.',
    'de-DE': 'Einige Datumsbereiche sind nicht verfügbar, während der tägliche Index vervollständigt wird.',
    'zh-TW': '每日索引補齊期間，部分日期範圍暫不可用。',
    'zh-CN': '每日索引补齐期间，部分日期范围暂不可用。',
    ja: '日別インデックスの更新中は、一部の日付範囲を利用できません。',
    ko: '일별 인덱스를 보완하는 동안 일부 날짜 범위를 사용할 수 없습니다.',
    'pt-BR': 'Alguns intervalos de datas ficam indisponíveis enquanto o índice diário é atualizado.',
    id: 'Beberapa rentang tanggal tidak tersedia selama indeks harian dilengkapi.',
  } as const;
  const previous = I18n.getCurrentLanguage();
  try {
    for (const language of Object.keys(expected) as Array<keyof typeof expected>) {
      I18n.setLanguage(language);
      assert.equal(I18n.t.providers.codex.recommendationPartial, expected[language]);
    }
  } finally {
    I18n.setLanguage(previous);
  }
});

test('all eight Codex locales name every current data-quality flag and provide a neutral fallback', () => {
  const languages = ['en', 'de-DE', 'zh-TW', 'zh-CN', 'ja', 'ko', 'pt-BR', 'id'] as const;
  const flags = [
    'invalid-turn-context',
    'invalid-session-meta',
    'missing-pseudonymizer',
    'missing-token-info',
    'invalid-token-count',
    'counter-regression',
    'invalid-json',
    'invalid-event-payload',
    'unknown-event',
    'invalid-event-timestamp',
    'oversized-jsonl-line',
    'truncated-jsonl',
    'replaced-jsonl',
    'stale-file',
    'stale-reset-required',
  ].sort();
  const previous = I18n.getCurrentLanguage();
  try {
    for (const language of languages) {
      I18n.setLanguage(language);
      const copy = I18n.t.providers.codex as unknown as {
        qualityFlagLabels: Record<string, string>;
        qualityFlagUnknown: string;
      };
      assert.deepEqual(
        Object.keys(copy.qualityFlagLabels).sort(),
        flags,
        `${language} quality flag inventory drifted`,
      );
      for (const flag of flags) {
        assert.ok(copy.qualityFlagLabels[flag]?.trim(), `${language}.${flag} is missing`);
      }
      assert.ok(copy.qualityFlagUnknown?.trim(), `${language} neutral fallback is missing`);
    }
  } finally {
    I18n.setLanguage(previous);
  }
});

test('localized quality summaries never expose known or forward-compatible machine keys', () => {
  const previous = I18n.getCurrentLanguage();
  try {
    for (const [language, knownLabel, fallbackLabel] of [
      ['zh-CN', '无法识别的日志事件', '其他数据质量问题'],
      ['de-DE', 'Nicht erkanntes Protokollereignis', 'Anderes Datenqualitätsproblem'],
    ] as const) {
      I18n.setLanguage(language);
      const snapshot = snapshotFixture();
      snapshot.qualityFlags = {
        'unknown-event': 2,
        'future-machine-key': 3,
      };
      const view = buildCodexUsageView(snapshot, NOW);
      const html = renderCodexView(view, scopedInsights(view), I18n.t.providers.codex);

      assert.match(html, new RegExp(`${knownLabel}: 2`));
      assert.match(html, new RegExp(`${fallbackLabel}: 3`));
      assert.doesNotMatch(html, /unknown-event|future-machine-key/);
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

test('production Codex action inventory is explicit and controller-ready', () => {
  const base = renderCodexView(
    buildCodexUsageView(snapshotFixture(), NOW),
    [],
    CODEX_COPY_EN,
    { settingsHtml: productionCodexSettingsHtml() },
  );
  const html = base + renderCodexView(
    buildCodexUsageView(snapshotFixture(), NOW),
    [],
    CODEX_COPY_EN,
    { exploreFilters: { query: 'Locke' } },
  );
  const actions = new Set(
    [...html.matchAll(/data-codex-action="([^"]+)"/g)].map((match) => match[1]),
  );
  assert.deepEqual([...actions].sort(), [
    'clear-filters', 'close-settings', 'drilldown-date', 'filter-sessions',
    'open-settings', 'project-sessions', 'refresh', 'remove-filter',
    'reset-settings',
    'select-chart-metric', 'select-explore-view', 'select-page',
    'set-chart-metric', 'set-model-effort-scope', 'set-overview-scope',
    'set-recommendation-scope', 'set-setting',
    'sort-projects', 'sort-sessions', 'toggle-thread-children', 'view-project-sessions', 'view-task',
  ]);
  const controller = getCodexClientScript();
  for (const action of actions) {
    assert.match(controller, new RegExp(`action === '${action}'`), `unhandled production action: ${action}`);
  }
  assert.match(controller, /if \(action === 'refresh'\) \{ vscode\.postMessage\(\{ command: 'refresh' \}\); return true; \}/);
  assert.doesNotMatch(html, /data-codex-action="settings-(?:click|change|input)"/);
  assert.doesNotMatch(html, /\son(?:click|change|input)=/);
});

test('Codex charts tables disclosures and mobile details expose the accessible UI contract', () => {
  const html = renderFixture();
  const chartBars = html.match(/<button\b[^>]*class="[^"]*codex-chart-bar[^"]*"[^>]*>/g) ?? [];
  const metricButtons = html.match(/<button\b[^>]*data-codex-chart-metric="[^"]+"[^>]*>/g) ?? [];
  const tablists = html.match(/<(?:nav|div)\b[^>]*role="tablist"[^>]*>/g) ?? [];

  assert.ok(chartBars.length > 0);
  for (const bar of chartBars) {
    assert.match(bar, /aria-label="[^"]+"/);
  }
  assert.doesNotMatch(html, /<div\b[^>]*class="[^"]*codex-chart-bar/);
  assert.ok(metricButtons.length > 0);
  for (const button of metricButtons) {
    assert.match(button, /aria-pressed="(?:true|false)"/);
  }
  assert.match(html, /data-codex-chart-metric="processed"[^>]*aria-pressed="true"/);
  assert.doesNotMatch(html, /data-codex-chart-metric="fresh"[^>]*aria-pressed="true"/);
  assert.ok(tablists.length > 0);
  for (const tablist of tablists) {
    assert.match(tablist, /aria-label="[^"]+"/);
  }
  assert.match(html, /<th[^>]*data-codex-sort-key="title"[^>]*aria-sort="none"(?![^>]*tabindex)(?![^>]*data-codex-action)/);
  assert.match(html, /<button[^>]*class="codex-sort-button"[^>]*data-codex-action="sort-sessions"[^>]*data-codex-sort-key="title"/);
  assert.match(html, /class="[^"]*codex-disclosure[^"]*"[^>]*aria-expanded="true"/);
  assert.match(html, /data-codex-thread-visible[^>]*aria-live="polite"/);
  assert.match(html, /data-codex-thread-visible[^>]*data-codex-result-count/);
  assert.match(html, /data-codex-chart-summary[^>]*aria-live="polite"/);
  assert.match(html, /class="daily-table-container codex-scroll-region"/);
  assert.match(html, /class="hc-scroll codex-scroll-region"/);
  assert.doesNotMatch(html, /class="(?:daily-table-container|hc-scroll)"/);
  assert.match(html, /class="codex-mobile-details"/);
  assert.match(html, /class="[^"]*codex-wide-only/);
  assert.match(html, /class="sortable codex-wide-only"[^>]*aria-sort="none"[^>]*><button[^>]*class="codex-sort-button"[^>]*data-codex-action="sort-projects"/);
  assert.doesNotMatch(html, /codex-session-mobile/);

  const controller = getCodexClientScript();
  assert.match(controller, /bar\.setAttribute\('aria-label',/);
  assert.match(controller, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
});

test('every Codex numeric table header and cell uses number-cell without marking labels or dates', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);
  const html = renderFixture() + dailyTable(
    view.last7DaysDaily,
    CODEX_COPY_EN,
    (value) => `N:${value}`,
  );
  const tables = html.match(/<table\b[^>]*class="[^"]*\bdaily-table\b[^"]*"[^>]*>[\s\S]*?<\/table>/g) ?? [];
  const seen = new Set<string>();
  assert.ok(tables.length > 0);

  for (const table of tables) {
    const header = table.match(/<thead><tr>([\s\S]*?)<\/tr><\/thead>/)?.[1];
    const firstRow = table.match(/<tbody><tr\b[^>]*>([\s\S]*?)<\/tr>/)?.[1];
    assert.ok(header, 'table has a header row');
    assert.ok(firstRow, 'table fixture has a data row');
    const headers = htmlTags(header, 'th');
    const cells = htmlTags(firstRow, 'td');
    assert.equal(cells.length, headers.length, 'header and data column counts agree');

    let kind = '';
    let firstNumeric = 1;
    if (/data-codex-sort-table="projects"/.test(table)) {
      kind = 'projects';
      firstNumeric = 2;
    } else if (/data-codex-sort-table="sessions"/.test(table)) {
      kind = 'sessions';
      firstNumeric = 6;
    } else {
      kind = ({ 4: 'dimension', 5: 'overview', 8: 'monthly', 10: 'daily' } as Record<number, string>)[headers.length] ?? '';
    }
    assert.ok(kind, `recognized ${headers.length}-column Codex table`);
    seen.add(kind);

    for (let index = 0; index < headers.length; index += 1) {
      const numeric = index >= firstNumeric;
      assert.equal(hasHtmlClass(headers[index], 'number-cell'), numeric, `${kind} header ${index}`);
      assert.equal(hasHtmlClass(cells[index], 'number-cell'), numeric, `${kind} cell ${index}`);
    }
  }

  assert.deepEqual([...seen].sort(), ['daily', 'dimension', 'monthly', 'overview', 'projects', 'sessions']);
});

test('all eight locales provide provider-aware Codex and Compare document identity', () => {
  const languages = ['en', 'de-DE', 'zh-TW', 'zh-CN', 'ja', 'ko', 'pt-BR', 'id'] as const;
  const previous = I18n.getCurrentLanguage();
  try {
    for (const language of languages) {
      I18n.setLanguage(language);
      assert.deepEqual(
        getCodexDocumentIdentity('codex', I18n.t.providers.codex, I18n.getLocale()),
        { lang: I18n.getLocale(), title: I18n.t.providers.codex.title },
      );
      assert.deepEqual(
        getCodexDocumentIdentity('compare', I18n.t.providers.codex, I18n.getLocale()),
        { lang: I18n.getLocale(), title: I18n.t.providers.codex.compareTitle },
      );
    }
  } finally {
    I18n.setLanguage(previous);
  }
});

test('all eight locales translate project drilldown and sortable-button copy', () => {
  const languages = ['en', 'de-DE', 'zh-TW', 'zh-CN', 'ja', 'ko', 'pt-BR', 'id'] as const;
  const previous = I18n.getCurrentLanguage();
  try {
    for (const language of languages) {
      I18n.setLanguage(language);
      const copy = I18n.t.providers.codex;
      assert.ok(copy.viewAllSessions, `${language}.viewAllSessions is missing`);
      assert.ok(copy.sortBy, `${language}.sortBy is missing`);
      if (language !== 'en') {
        assert.notEqual(copy.viewAllSessions, CODEX_COPY_EN.viewAllSessions, `${language}.viewAllSessions fell back to English`);
        assert.notEqual(copy.sortBy, CODEX_COPY_EN.sortBy, `${language}.sortBy fell back to English`);
      }
    }
  } finally {
    I18n.setLanguage(previous);
  }
});

test('Overview renders four truthful scope panels and drilldown row contracts', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);
  const html = renderCodexView(view, scopedInsights(view), CODEX_COPY_EN);
  const overview = htmlBetween(
    html,
    'id="codex-page-panel-overview"',
    'id="codex-page-panel-explore"',
  );
  for (const [scope, hidden] of [
    ['recent', false], ['7d', true], ['30d', true], ['all', true],
  ] as const) {
    assert.match(overview, new RegExp(
      `data-codex-overview-panel="${scope}"[^>]*data-codex-overview-dataset="${scope}"${hidden ? '[^>]*hidden' : ''}`,
    ));
  }
  assert.equal((overview.match(/class="daily-breakdown codex-overview-trend"/g) ?? []).length, 1);
  assert.match(overview, /data-codex-overview-panel="7d"[\s\S]*data-codex-date-row="2026-07-/);
  assert.match(overview, /data-codex-overview-panel="all"[\s\S]*data-codex-month-row="2026-/);
  assert.match(overview, /data-codex-action="drilldown-date"/);
  const panelBodies = ['recent', '7d', '30d', 'all'].map((scope) =>
    htmlBetween(
      overview,
      `data-codex-overview-panel="${scope}"`,
      scope === 'all' ? undefined : `data-codex-overview-panel="${scope === 'recent' ? '7d' : scope === '7d' ? '30d' : 'all'}"`,
    ),
  );
  assert.equal(new Set(panelBodies).size, 4);
});

test('Recent overview keeps its scope summary and composition without a one-bar time series', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);
  const html = renderCodexView(view, scopedInsights(view), CODEX_COPY_EN);
  const overview = htmlBetween(
    html,
    'id="codex-page-panel-overview"',
    'id="codex-page-panel-explore"',
  );
  const recent = htmlBetween(
    overview,
    'data-codex-overview-panel="recent"',
    'data-codex-overview-panel="7d"',
  );
  const last7Days = htmlBetween(
    overview,
    'data-codex-overview-panel="7d"',
    'data-codex-overview-panel="30d"',
  );

  assert.match(overview, /<h3>Usage trend<\/h3>/);
  assert.match(overview, /class="chart-tabs codex-overview-metric"[^>]*hidden/);
  assert.match(recent, /class="codex-scope-panel"/);
  assert.match(recent, /class="summary-grid"/);
  assert.match(recent, /class="cost-comp-bar"/);
  assert.doesNotMatch(recent, /data-codex-chart-bar/);
  assert.doesNotMatch(recent, /data-codex-chart-summary/);
  assert.doesNotMatch(recent, /class="date-cell"/);
  assert.match(last7Days, /data-codex-chart-bar/);
  assert.match(last7Days, /data-codex-chart-summary/);
  assert.match(last7Days, /class="date-cell"/);
});

test('Overview and Recommendation scope controls are complete restorable tabs', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);
  const html = renderCodexView(view, scopedInsights(view), CODEX_COPY_EN);
  for (const scope of ['recent', '7d', '30d', 'all']) {
    assert.match(html, new RegExp(`id="codex-overview-tab-${scope}"[^>]*role="tab"[^>]*aria-controls="codex-overview-panel-${scope}"`));
    assert.match(html, new RegExp(`id="codex-overview-panel-${scope}"[^>]*role="tabpanel"[^>]*aria-labelledby="codex-overview-tab-${scope}"`));
    assert.match(html, new RegExp(`id="codex-recommendation-tab-${scope}"[^>]*role="tab"[^>]*aria-controls="codex-recommendation-panel-${scope}"`));
    assert.match(html, new RegExp(`id="codex-recommendation-panel-${scope}"[^>]*role="tabpanel"[^>]*aria-labelledby="codex-recommendation-tab-${scope}"`));
  }
  assert.match(html, /class="chart-tabs codex-recommendation-tabs"[^>]*role="tablist"/);
  assert.match(html, /data-codex-recommendation-panel="7d"[^>]*hidden/);
});

test('Sessions rows expose period and rooted lineage while chips and sorts are actions', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);
  const html = renderCodexView(view, scopedInsights(view), CODEX_COPY_EN, {
    exploreFilters: { query: 'Locke', role: 'subagent' },
  });
  const sessions = htmlBetween(
    html,
    'id="codex-explore-panel-sessions"',
    'id="codex-explore-panel-models-effort"',
  );
  assert.match(sessions, /data-codex-periods="(?:recent\|)?7d\|30d\|all"/);
  assert.match(sessions, /data-codex-days="2026-07-20"/);
  assert.match(sessions, /data-codex-root-task-view-key="[a-f0-9]{16}"/);
  assert.match(sessions, /<button[^>]*data-codex-action="remove-filter"[^>]*data-codex-filter-key="query"/);
  assert.match(sessions, /<th[^>]*data-codex-sort-key="title"[^>]*aria-sort="none"[^>]*><button[^>]*data-codex-action="sort-sessions"[^>]*data-codex-sort-key="title"/);
  assert.match(html, /<th[^>]*data-codex-sort-key="name"[^>]*aria-sort="none"[^>]*><button[^>]*data-codex-action="sort-projects"[^>]*data-codex-sort-key="name"/);
});
