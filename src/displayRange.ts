/** A presentation row completed against an exact, ordered range. */
export interface CompletedDisplayRow<T> {
  key: string;
  value: T;
  /** True when the row came from the source rather than the zero-row factory. */
  observed: boolean;
}

/** Canonical 24-hour clock keys, ordered from 00 through 23. */
export function clockHourKeys(): string[] {
  return Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));
}

/**
 * Complete sparse source rows against an exact presentation range without
 * mutating or widening the underlying aggregate. Invalid, duplicate, and
 * out-of-range source keys are ignored; the first valid row wins so output is
 * deterministic even when a caller supplies malformed data.
 */
export function completeDisplayRange<T>(
  keys: readonly string[],
  rows: readonly T[],
  keyOf: (row: T) => string,
  makeEmpty: (key: string) => T,
): CompletedDisplayRow<T>[] {
  const expected = new Set(keys);
  const observed = new Map<string, T>();
  for (const row of rows) {
    const key = keyOf(row);
    if (expected.has(key) && !observed.has(key)) {
      observed.set(key, row);
    }
  }
  return keys.map((key) => {
    const value = observed.get(key);
    return value === undefined
      ? { key, value: makeEmpty(key), observed: false }
      : { key, value, observed: true };
  });
}
