import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { defaultDashboardProvider } from '../codexView';
import { CODEX_COPY_EN } from '../codexView';
import { I18n } from '../i18n';
import { SupportedLanguage } from '../types';

function webviewSourceFixture(): string {
  return readFileSync(
    path.resolve(__dirname, '..', '..', 'src', 'webview.ts'),
    'utf8',
  );
}

function codexStylesSourceFixture(): string {
  return readFileSync(
    path.resolve(__dirname, '..', '..', 'src', 'codexViewStyles.ts'),
    'utf8',
  );
}

test('dashboard provider defaults preserve Claude and support Codex-only installs', () => {
  assert.equal(defaultDashboardProvider(true, false), 'claude');
  assert.equal(defaultDashboardProvider(false, true), 'codex');
  assert.equal(defaultDashboardProvider(true, true), 'claude');
  assert.equal(defaultDashboardProvider(false, false), 'claude');
});

test('webview provider changes are allowlisted and kept outside time tabs', () => {
  const source = readFileSync(
    path.resolve(__dirname, '..', '..', 'src', 'webview.ts'),
    'utf8',
  );

  assert.match(source, /case 'providerChanged'/);
  assert.match(source, /requested === 'claude'/);
  assert.match(source, /requested === 'codex'/);
  assert.match(source, /requested === 'compare'/);
  assert.match(source, /updateProviderData\(/);
  assert.match(source, /renderProviderTabs\(\)[\s\S]*renderQuotaBanner\(\)/);
});

test('Codex settings and charts stay inside the provider view', () => {
  const webview = webviewSourceFixture();
  const codexStyles = codexStylesSourceFixture();
  const settings = readFileSync(
    path.resolve(__dirname, '..', '..', 'src', 'settings.ts'),
    'utf8',
  );
  const extension = readFileSync(
    path.resolve(__dirname, '..', '..', 'src', 'extension.ts'),
    'utf8',
  );

  assert.match(
    settings,
    /key:\s*'codex\.optimization\.enabled'[\s\S]*?default:\s*true/,
  );
  assert.match(webview, /settingsHtml:\s*this\.renderSettingsPanel\('codex'\)/);
  assert.match(webview, /this\.renderSettingsPanel\('claude'\)/);
  assert.match(
    webview,
    /snap\.filter\(\(setting\)\s*=>\s*settingAppliesToProvider\(setting, provider\)\)/,
  );
  assert.match(
    settings,
    /export function settingAppliesToProvider[\s\S]*?def\.providers\?\.includes\(provider\)/,
  );
  assert.match(
    webview,
    /formatNumber:\s*\(value\)[\s\S]*?I18n\.formatNumber\(value\)/,
  );
  assert.match(
    webview,
    /createCodexLocalizedFormatters\(\s*I18n\.getLocale\(\),\s*I18n\.getTimezone\(\)/,
  );
  assert.match(webview, /getCodexClientScript\(\)/);
  assert.match(webview, /getProviderNavClientScript\(\)/);
  assert.doesNotMatch(webview, /showCodexTab\('settings'\)/);
  assert.doesNotMatch(webview, /function showCodexChartMetric/);
  assert.doesNotMatch(webview, /function filterCodexThreads/);
  assert.doesNotMatch(webview, /function toggleCodexProject/);
  assert.doesNotMatch(webview, /function toggleCodexThreadChildren/);
  assert.doesNotMatch(webview, /function showCodexBehaviorScope/);
  assert.doesNotMatch(webview, /ccu\.codex/);
  assert.match(codexStyles, /\.codex-chart-value\s*\{/);
  assert.match(codexStyles, /\.codex-period-chart \.hc-wrap/);
  assert.doesNotMatch(webview, /^\s*\.codex-chart-value\s*\{/m);
  assert.match(extension, /codexOptimizationEnabled:/);
  assert.match(extension, /private codexInsights: CodexScopedInsights/);
  assert.match(extension, /buildScopedCodexInsights\(this\.codexView\)/);
  assert.match(extension, /catch \{\s+this\.codexView = null;\s+this\.codexInsights = emptyCodexScopedInsights\(\);\s+this\.codexHasData = false;/);
  assert.match(webview, /private codexInsights: CodexScopedInsights/);
  assert.match(webview, /insights: CodexScopedInsights/);
  assert.match(webview, /this\.codexInsights = codexView \? insights : emptyCodexScopedInsights\(\);/);
});

test('Claude chart delegation rejects Codex controls and missing metrics', () => {
  const source = webviewSourceFixture();
  assert.match(source, /if \(event\.target\.closest && event\.target\.closest\('\[data-codex-root\]'\)\) \{? return;? \}?/);
  assert.match(source, /closest\('\.chart-tab\[data-metric\]'\)/);
  assert.doesNotMatch(source, /document\.querySelectorAll\('\.daily-breakdown'\)/);
});

test('provider-aware document shell localizes navigation and keeps Codex actions inside its root', () => {
  const source = webviewSourceFixture();

  assert.match(source, /getCodexDocumentIdentity\(\s*alternateProvider,\s*codexCopy,\s*I18n\.getLocale\(\),?\s*\)/);
  assert.match(source, /<html lang="\$\{this\.escapeHtml\(documentIdentity\.lang\)\}">/);
  assert.match(source, /<title>\$\{this\.escapeHtml\(documentIdentity\.title\)\}<\/title>/);
  assert.match(source, /<body class="codex-document/);
  assert.match(source, /getStyles\(\)[\s\S]*getCodexViewStyles\(\)/);
  assert.doesNotMatch(source, /<header><h1>\$\{this\.escapeHtml\(I18n\.t\.popup\.title\)\}/);
  assert.doesNotMatch(source, /showProvider\('claude', 'settings'\)/);

  assert.match(source, /<nav class="provider-tabs" role="tablist" aria-label="\$\{this\.escapeHtml\(I18n\.t\.popup\.settingsGroupProviders\)\}">/);
  assert.match(source, /id="provider-tab-\$\{provider\}"[^\n]+role="tab"[^\n]+data-provider-target="\$\{provider\}"[^\n]+aria-controls="provider-panel"[^\n]+aria-selected="\$\{selected\}"[^\n]+tabindex="\$\{selected \? '0' : '-1'\}"/);
  assert.match(source, /id="provider-panel" role="tabpanel" aria-labelledby="provider-tab-\$\{this\.currentProvider\}"/);
  assert.doesNotMatch(source, /class="provider-tab[^\n]+onclick="showProvider/);
});

test('Claude dashboard shell markers and provider switching behavior remain intact', () => {
  const source = webviewSourceFixture();

  assert.match(source, /id="refreshNowBtn" class="btn-secondary btn-refresh-now"/);
  assert.match(source, /onclick="showTab\('content'\)" class="btn-secondary">✨/);
  assert.match(source, /onclick="showTab\('settings'\)" class="btn-secondary">⚙/);
  assert.match(source, /function showProvider\(provider, tab\) \{\s*vscode\.postMessage\(\{ command: 'providerChanged', provider: provider, tab: tab \|\| '' \}\);\s*\}/);
  assert.match(source, /renderProviderTabs\(\)[\s\S]*renderQuotaBanner\(\)/);
});

test('provider and Codex view copy is complete in every UI locale', () => {
  const languages: SupportedLanguage[] = [
    'en',
    'de-DE',
    'zh-TW',
    'zh-CN',
    'ja',
    'ko',
    'pt-BR',
    'id',
  ];
  const previous = I18n.getCurrentLanguage();
  try {
    for (const language of languages) {
      I18n.setLanguage(language);
      const providers = I18n.t.providers;
      assert.ok(providers.claude);
      assert.ok(providers.codexBeta);
      assert.ok(providers.compare);
      for (const value of Object.values(providers.codex)) {
        if (typeof value === 'string') {
          assert.notEqual(value.trim(), '', `${language} has empty Codex copy`);
        } else {
          assert.ok([5, 15].includes(Object.keys(value).length));
        }
      }
      if (language !== 'en') {
        for (const key of [
          'allTime',
          'behavior',
          'settings',
          'monthly',
          'tokenComposition',
          'freshInput',
          'reasoningSubset',
          'threadRoleComposition',
          'childThreadsPerRootTask',
          'childFreshShare',
          'approvalFreshShare',
          'highEffortFreshShare',
          'processedToFreshRatio',
          'reasoningOutputShare',
          'postPatchToolCallsPerPatchCall',
          'patchCalls',
          'compactions',
          'unnamedSession',
          'unidentifiedProject',
          'parentThread',
          'searchThreads',
          'all',
          'localDirectory',
          'lastActive',
          'expand',
          'usageLimits',
          'resets',
          'credits',
          'unlimited',
          'accountSnapshotLastObserved',
          'sessions',
          'modelsEffort',
          'clearFilters',
          'activeFilters',
        ] as const) {
          assert.notEqual(
            providers.codex[key],
            CODEX_COPY_EN[key],
            `${language} still falls back to English for ${key}`,
          );
        }
        const setting = I18n.settingText('codex.optimization.enabled');
        assert.ok(setting.label?.trim(), `${language} has no optimization setting label`);
        assert.ok(setting.help?.trim(), `${language} has no optimization setting help`);
      }
    }
  } finally {
    I18n.setLanguage(previous);
  }
});
