/**
 * Local-only display conversion for USD-denominated estimates.
 *
 * Pricing, aggregation, and persistence continue to use USD. This module is
 * deliberately pure and has no exchange-rate transport: callers supply the
 * display label and the number of display units per USD.
 */

export interface CurrencyDisplayPreference {
  label: string;
  unitsPerUsd: number;
}

export interface CurrencyDisplayFormat extends CurrencyDisplayPreference {
  decimalPlaces: number;
}

export interface NormalizedCurrencyDisplay extends CurrencyDisplayPreference {
  converted: boolean;
}

const DEFAULT_LABEL = '$';
const DEFAULT_RATE = 1;
const MAX_LABEL_CODE_POINTS = 8;
const MAX_RATE = 1_000_000;

function validLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (
    trimmed === '' ||
    Array.from(trimmed).length > MAX_LABEL_CODE_POINTS ||
    !/^[\p{L}\p{Sc}]+$/u.test(trimmed)
  ) {
    return null;
  }
  return /^[A-Za-z]{3}$/.test(trimmed) ? trimmed.toUpperCase() : trimmed;
}

/** Fail closed to the unchanged USD display if either user input is invalid. */
export function normalizeCurrencyDisplay(
  label: unknown,
  unitsPerUsd: unknown,
): NormalizedCurrencyDisplay {
  const normalizedLabel = validLabel(label);
  const normalizedRate = typeof unitsPerUsd === 'number'
    ? unitsPerUsd
    : Number(unitsPerUsd);
  if (
    normalizedLabel === null ||
    !Number.isFinite(normalizedRate) ||
    normalizedRate <= 0 ||
    normalizedRate > MAX_RATE
  ) {
    return {
      label: DEFAULT_LABEL,
      unitsPerUsd: DEFAULT_RATE,
      converted: false,
    };
  }
  return {
    label: normalizedLabel,
    unitsPerUsd: normalizedRate,
    converted: normalizedLabel !== DEFAULT_LABEL || normalizedRate !== DEFAULT_RATE,
  };
}

function normalizedDecimalPlaces(value: number): number {
  return Number.isFinite(value)
    ? Math.max(0, Math.min(4, Math.floor(value)))
    : 2;
}

/** The invariant source representation, unaffected by display preferences. */
export function formatUsdBaseline(amountUsd: number, decimalPlaces = 2): string {
  if (!Number.isFinite(amountUsd)) return '—';
  return `$${amountUsd.toFixed(normalizedDecimalPlaces(decimalPlaces))}`;
}

/**
 * Format one USD estimate using a user-supplied local display rate. Converted
 * values carry an approximation marker; three-letter codes use a separating
 * space while compact symbols remain attached to the number.
 */
export function formatUsdForDisplay(
  amountUsd: number,
  options: CurrencyDisplayFormat,
): string {
  if (!Number.isFinite(amountUsd)) return '—';
  const preference = normalizeCurrencyDisplay(options.label, options.unitsPerUsd);
  const amount = (amountUsd * preference.unitsPerUsd)
    .toFixed(normalizedDecimalPlaces(options.decimalPlaces));
  const separator = /^[A-Z]{3}$/.test(preference.label) ? ' ' : '';
  return `${preference.converted ? '≈' : ''}${preference.label}${separator}${amount}`;
}
