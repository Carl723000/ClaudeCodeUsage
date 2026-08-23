import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

import { I18n } from '../i18n';
import { SupportedLanguage } from '../types';

const LOCALES: SupportedLanguage[] = [
  'en',
  'de-DE',
  'zh-TW',
  'zh-CN',
  'ja',
  'ko',
  'pt-BR',
  'id',
];

function withLanguage<T>(language: SupportedLanguage, run: () => T): T {
  const previous = I18n.getCurrentLanguage();
  I18n.setLanguage(language);
  try {
    return run();
  } finally {
    I18n.setLanguage(previous);
  }
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{[a-z][a-zA-Z0-9]*\}/g)].map((match) => match[0]).sort();
}

test('AI advice effectiveness copy is complete and preserves placeholders in all eight locales', () => {
  const english = withLanguage('en', () => I18n.t.popup.adviceEffectiveness);
  const expectedKeys = Object.keys(english).sort();
  assert.ok(expectedKeys.length >= 40, 'expected the complete advice-effectiveness copy contract');

  for (const language of LOCALES) {
    withLanguage(language, () => {
      const copy = I18n.t.popup.adviceEffectiveness;
      assert.deepEqual(Object.keys(copy).sort(), expectedKeys, `${language}: copy keys differ from English`);
      for (const key of expectedKeys as (keyof typeof copy)[]) {
        assert.equal(typeof copy[key], 'string', `${language}: ${key} must be a string`);
        assert.ok(copy[key].trim().length > 0, `${language}: ${key} must not be empty`);
        assert.deepEqual(
          placeholders(copy[key]),
          placeholders(english[key]),
          `${language}: ${key} placeholders differ from English`,
        );
      }
    });
  }
});

test('privacy, separate consent, local feedback, and inconclusive states have dedicated localized copy', () => {
  const english = withLanguage('en', () => I18n.t.popup.adviceEffectiveness);
  assert.match(english.aggregateConsentHelp, /no prompts, paths, session IDs, or individual records/i);
  assert.match(english.promptConsentHelp, /off by default[\s\S]*separate explicit consent/i);
  assert.match(english.feedbackLocalOnly, /only on this device[\s\S]*never[\s\S]*remote payload/i);
  assert.match(english.insufficientEvidence, /not enough evidence[\s\S]*conclusion/i);
  assert.match(english.noEvidenceAdvice, /no evidence-backed advice/i);
  assert.match(english.qualityGuardrailPending, /pending[\s\S]*no effectiveness conclusion/i);
  assert.match(
    english.frameworkOverheadSignal,
    /separately estimated framework injection[\s\S]*does not evaluate[\s\S]*quality[\s\S]*user's writing/i,
  );
  assert.notEqual(english.aggregateConsentLabel, english.promptConsentLabel);

  const criticalKeys: (keyof typeof english)[] = [
    'title',
    'aggregateConsentLabel',
    'aggregateConsentHelp',
    'promptConsentLabel',
    'promptConsentHelp',
    'feedbackLocalOnly',
    'insufficientEvidence',
    'noEvidenceAdvice',
    'qualityGuardrailPending',
    'frameworkOverheadSignal',
    'strictOutputRejected',
  ];
  for (const language of LOCALES.filter((locale) => locale !== 'en')) {
    withLanguage(language, () => {
      const copy = I18n.t.popup.adviceEffectiveness;
      for (const key of criticalKeys) {
        assert.notEqual(copy[key], english[key], `${language}: ${key} still uses English copy`);
      }
      const setting = I18n.settingText('advice.effectiveness.enabled');
      assert.ok(setting.label?.trim(), `${language}: experiment setting needs a label`);
      assert.ok(setting.help?.trim(), `${language}: experiment setting needs privacy-safe help`);
    });
  }
});

test('the experiment setting is local-state, provider-shared, and off by default', () => {
  const source = readFileSync(path.resolve(process.cwd(), 'src', 'settings.ts'), 'utf8');
  const start = source.indexOf("key: 'advice.effectiveness.enabled'");
  assert.ok(start >= 0, 'missing advice.effectiveness.enabled setting');
  const block = source.slice(start, source.indexOf('\n  },', start));
  assert.match(block, /type:\s*'boolean'/);
  assert.match(block, /default:\s*false/);
  assert.match(block, /storage:\s*'state'/);
  assert.match(block, /group:\s*'advice'/);
  assert.match(block, /providers:\s*\['claude', 'codex'\]/);
});
