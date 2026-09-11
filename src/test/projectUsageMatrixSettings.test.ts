import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { I18n } from '../i18n';
import { SupportedLanguage } from '../types';

const TRANSLATED: SupportedLanguage[] = [
  'de-DE', 'zh-TW', 'zh-CN', 'ja', 'ko', 'pt-BR', 'id',
];

test('project matrix is one shared default-on capability setting', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'settings.ts'),
    'utf8',
  );
  const match = source.match(/\{\s*key: 'showProjectUsageMatrix',[\s\S]*?\n\s*\},/);
  assert.ok(match, 'showProjectUsageMatrix must be declared in the settings catalog');
  assert.match(match[0], /type: 'boolean'/);
  assert.match(match[0], /default: true/);
  assert.match(match[0], /storage: 'state'/);
  assert.match(match[0], /group: 'features'/);
  assert.match(match[0], /providers: \['claude', 'codex'\]/);
});

test('project matrix setting copy is complete in every translated locale', () => {
  const previous = I18n.getLocale() as SupportedLanguage;
  try {
    for (const locale of TRANSLATED) {
      I18n.setLanguage(locale);
      const copy = I18n.settingText('showProjectUsageMatrix');
      assert.ok(copy.label, `${locale}: setting label`);
      assert.ok(copy.help, `${locale}: setting help`);
    }
  } finally {
    I18n.setLanguage(previous);
  }
});

test('project matrix model owns no scanner, watcher, timer, filesystem, or network path', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'projectUsageMatrix.ts'),
    'utf8',
  );
  assert.doesNotMatch(source, /node:fs|watch\(|setInterval|setTimeout|fetch\(|https?:\/\//);
});
