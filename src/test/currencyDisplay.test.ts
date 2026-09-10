import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

import {
  CURRENCY_REFERENCE_DATE,
  DISPLAY_CURRENCY_CODES,
  DISPLAY_CURRENCY_LABELS,
  formatUsdBaseline,
  formatUsdForDisplay,
  normalizeDisplayCurrencyCode,
  resolveCurrencyDisplay,
} from '../currencyDisplay';

test('USD is the default and preserves the existing format', () => {
  assert.equal(normalizeDisplayCurrencyCode(undefined), 'USD');
  assert.equal(formatUsdForDisplay(12.345, 'USD', 2), '$12.35');
  assert.equal(DISPLAY_CURRENCY_CODES[0], 'USD');
  assert.equal(DISPLAY_CURRENCY_LABELS[0], 'USD ($)');
});

test('curated dropdown currencies resolve to fixed bundled reference rates', () => {
  assert.equal(CURRENCY_REFERENCE_DATE, '2026-09-09');
  assert.deepEqual(resolveCurrencyDisplay('EUR'), {
    code: 'EUR',
    label: 'EUR',
    unitsPerUsd: 0.85822176,
    converted: true,
    referenceDate: '2026-09-09',
  });
  assert.equal(formatUsdForDisplay(10, 'EUR', 2), '≈EUR 8.58');
  assert.equal(formatUsdForDisplay(123.456, 'CNY', 2), '≈CNY 828.12');
});

test('legacy test-build codes and unambiguous symbols migrate into presets', () => {
  assert.equal(normalizeDisplayCurrencyCode(' eur '), 'EUR');
  assert.equal(normalizeDisplayCurrencyCode('$'), 'USD');
  assert.equal(normalizeDisplayCurrencyCode('€'), 'EUR');
  assert.equal(normalizeDisplayCurrencyCode('HK$'), 'HKD');
});

test('unsupported or markup-shaped values fail closed to USD', () => {
  assert.equal(normalizeDisplayCurrencyCode('<img onerror=x>'), 'USD');
  assert.equal(normalizeDisplayCurrencyCode('XYZ'), 'USD');
  assert.equal(formatUsdForDisplay(10, 'XYZ', 2), '$10.00');
});

test('conversion is display-only and the auditable USD baseline stays available', () => {
  const usd = 123.456;
  assert.equal(formatUsdForDisplay(usd, 'CNY', 2), '≈CNY 828.12');
  assert.equal(usd, 123.456);
  assert.equal(formatUsdBaseline(usd, 2), '$123.46');
});

test('the display converter has no exchange-rate transport dependency', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'currencyDisplay.ts'),
    'utf8',
  );
  assert.doesNotMatch(source, /^\s*import\s/m);
  assert.doesNotMatch(source, /\bfetch\s*\(|\bhttps?:\/\//);
});
