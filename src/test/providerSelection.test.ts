import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { defaultDashboardProvider } from '../codexView';
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
    }
  } finally {
    I18n.setLanguage(previous);
  }
});
