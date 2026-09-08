import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

import {
  formatUsdBaseline,
  formatUsdForDisplay,
  normalizeCurrencyDisplay,
} from '../currencyDisplay';

test('default currency display preserves the existing USD format', () => {
  assert.equal(formatUsdForDisplay(12.345, {
    label: '$',
    unitsPerUsd: 1,
    decimalPlaces: 2,
  }), '$12.35');
});

test('manual conversion accepts either a compact code or a safe symbol', () => {
  assert.equal(formatUsdForDisplay(10, {
    label: 'eur',
    unitsPerUsd: 0.92,
    decimalPlaces: 2,
  }), '≈EUR 9.20');
  assert.equal(formatUsdForDisplay(10, {
    label: '€',
    unitsPerUsd: 0.92,
    decimalPlaces: 2,
  }), '≈€9.20');
});

test('conversion is display-only and the auditable USD baseline stays available', () => {
  const usd = 123.456;
  const display = formatUsdForDisplay(usd, {
    label: 'CNY',
    unitsPerUsd: 7.2,
    decimalPlaces: 2,
  });

  assert.equal(display, '≈CNY 888.88');
  assert.equal(usd, 123.456);
  assert.equal(formatUsdBaseline(usd, 2), '$123.46');
});

test('invalid rates and markup-shaped labels fail closed to the USD baseline', () => {
  assert.deepEqual(normalizeCurrencyDisplay('<img onerror=x>', 0), {
    label: '$',
    unitsPerUsd: 1,
    converted: false,
  });
  assert.deepEqual(normalizeCurrencyDisplay('TOO-LONG-CODE', Number.POSITIVE_INFINITY), {
    label: '$',
    unitsPerUsd: 1,
    converted: false,
  });
});

test('custom labels are bounded to letters and currency symbols only', () => {
  assert.deepEqual(normalizeCurrencyDisplay('  HK$  ', 7.8), {
    label: 'HK$',
    unitsPerUsd: 7.8,
    converted: true,
  });
  assert.equal(normalizeCurrencyDisplay('USD<script>', 1).label, '$');
  assert.equal(normalizeCurrencyDisplay('A'.repeat(9), 1).label, '$');
});

test('the display converter has no exchange-rate transport dependency', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'currencyDisplay.ts'),
    'utf8',
  );
  assert.doesNotMatch(source, /^\s*import\s/m);
  assert.doesNotMatch(source, /\bfetch\s*\(|\bhttps?:\/\//);
});
