import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { defaultDashboardProvider } from '../codexView';
import { CODEX_COPY_EN } from '../codexView';
import { I18n } from '../i18n';
import { SupportedLanguage } from '../types';

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
  const webview = readFileSync(
    path.resolve(__dirname, '..', '..', 'src', 'webview.ts'),
    'utf8',
  );
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
  assert.match(webview, /showCodexTab\('settings'\)/);
  assert.match(webview, /function showCodexChartMetric/);
  assert.match(webview, /function filterCodexThreads/);
  assert.match(webview, /function toggleCodexProject/);
  assert.match(webview, /function toggleCodexThreadChildren/);
  assert.match(webview, /function showCodexBehaviorScope/);
  assert.match(webview, /\.codex-chart-value\s*\{/);
  assert.match(webview, /\.codex-period-chart \.chart-container/);
  assert.match(extension, /codexOptimizationEnabled:/);
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
          assert.equal(Object.keys(value).length, 5);
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
          'postChangeCommandsPerFile',
          'patchRounds',
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
