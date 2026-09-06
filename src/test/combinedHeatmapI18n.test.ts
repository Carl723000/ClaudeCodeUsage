import * as fs from 'fs';
import * as path from 'path';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { SupportedLanguage } from '../types';

// webview.ts imports vscode, so this repository-policy test inspects the source
// instead of loading the module under plain node:test. This mirrors the settings
// catalogue coverage guard in quotaI18n.test.ts.
const SOURCE = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'webview.ts'), 'utf8');
const LOCALES: SupportedLanguage[] = ['en', 'de-DE', 'zh-TW', 'zh-CN', 'ja', 'ko', 'pt-BR', 'id'];
const NON_ENGLISH = LOCALES.filter((locale) => locale !== 'en');

function copyFields(): string[] {
  const start = SOURCE.indexOf('interface CombinedHeatmapUiCopy {');
  const end = SOURCE.indexOf('\n}', start);
  assert.ok(start >= 0 && end > start, 'CombinedHeatmapUiCopy interface must exist');
  const fields = [...SOURCE.slice(start, end).matchAll(/^\s+(\w+): string;$/gm)]
    .map((match) => match[1]);
  assert.equal(fields.length, 38, 'the Share studio copy contract changed; update its locale coverage');
  return fields;
}

function copyFunction(): string {
  const start = SOURCE.indexOf('function combinedHeatmapUiCopy(');
  const end = SOURCE.indexOf('\nexport class UsageWebviewProvider', start);
  assert.ok(start >= 0 && end > start, 'combinedHeatmapUiCopy must exist');
  return SOURCE.slice(start, end);
}

function localeBranch(locale: SupportedLanguage): string | undefined {
  const source = copyFunction();
  const marker = `if (locale === '${locale}')`;
  const markerStart = source.indexOf(marker);
  if (markerStart < 0) {
    return undefined;
  }
  const objectStart = source.indexOf('return {', markerStart);
  const objectEnd = source.indexOf('\n    };', objectStart);
  assert.ok(objectStart >= 0 && objectEnd > objectStart, `${locale}: locale object must be parseable`);
  return source.slice(objectStart, objectEnd);
}

test('every non-English locale owns complete active Share studio copy', () => {
  const translatedFields = copyFields().filter((field) => !field.startsWith('intensity'));
  const missing: string[] = [];
  for (const locale of NON_ENGLISH) {
    const branch = localeBranch(locale);
    if (!branch) {
      missing.push(`${locale}:branch`);
      continue;
    }
    for (const field of translatedFields) {
      if (!new RegExp(`\\b${field}:`).test(branch)) {
        missing.push(`${locale}:${field}`);
      }
    }
  }
  assert.deepEqual(missing, [], `missing Share studio translations: ${missing.join(', ')}`);
});
