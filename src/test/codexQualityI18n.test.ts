import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { CODEX_QUALITY_FLAGS } from '../codexViewComponents';
import { I18n } from '../i18n';
import type { SupportedLanguage } from '../types';

const LANGUAGES: SupportedLanguage[] = [
  'en',
  'de-DE',
  'zh-TW',
  'zh-CN',
  'ja',
  'ko',
  'pt-BR',
  'id',
];

test('every Codex quality flag has a specific label in every supported locale', () => {
  const previous = I18n.getCurrentLanguage();
  try {
    for (const language of LANGUAGES) {
      I18n.setLanguage(language);
      const copy = I18n.t.providers.codex;
      assert.deepEqual(
        Object.keys(copy.qualityFlagLabels).sort(),
        [...CODEX_QUALITY_FLAGS].sort(),
        language,
      );
      for (const flag of CODEX_QUALITY_FLAGS) {
        assert.ok(copy.qualityFlagLabels[flag].trim().length > 0, `${language}: ${flag}`);
        assert.notEqual(
          copy.qualityFlagLabels[flag],
          copy.qualityFlagUnknown,
          `${language}: ${flag}`,
        );
      }
    }
  } finally {
    I18n.setLanguage(previous);
  }
});
