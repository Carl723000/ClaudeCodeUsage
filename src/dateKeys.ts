// Calendar-date keys for usage bucketing, in a chosen IANA timezone
// (empty string = the system zone).
//
// Day and month bucketing MUST agree on ONE zone. The old loader mixed a UTC
// day key (toISOString()) with a *local* month boundary, so a record just after
// local midnight on the 1st (UTC still on the 30th) landed under a "30th" row
// inside the new month's view. Deriving both the day and the month key from the
// same zone here removes that split.

/** Returns a usable IANA zone, falling back to the system zone when necessary. */
export function resolveTimeZone(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', timeZone ? { timeZone } : undefined)
      .resolvedOptions()
      .timeZone || 'UTC';
  } catch {
    return new Intl.DateTimeFormat('en-CA').resolvedOptions().timeZone || 'UTC';
  }
}

function partsInZone(date: Date, timeZone: string): { y: string; m: string; d: string } {
  const base: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };
  const fmt = new Intl.DateTimeFormat('en-CA', { ...base, timeZone: resolveTimeZone(timeZone) });
  const parts = fmt.formatToParts(date);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
  return { y: get('year'), m: get('month'), d: get('day') };
}

/** "YYYY-MM-DD" for a timestamp in `timeZone`; '' when the date is invalid. */
export function dayKeyInZone(date: Date, timeZone: string): string {
  if (isNaN(date.getTime())) {
    return '';
  }
  const { y, m, d } = partsInZone(date, timeZone);
  return y && m && d ? `${y}-${m}-${d}` : '';
}

/** "YYYY-MM" for a timestamp in `timeZone`; '' when the date is invalid. */
export function monthKeyInZone(date: Date, timeZone: string): string {
  const key = dayKeyInZone(date, timeZone);
  return key ? key.slice(0, 7) : '';
}

/**
 * Calendar-day keys ending on `now` in `timeZone`, ordered from oldest to newest.
 * The range walks civil dates rather than subtracting fixed-duration milliseconds.
 */
export function rollingDayKeys(now: number, timeZone: string, count: number): string[] {
  const endKey = dayKeyInZone(new Date(now), resolveTimeZone(timeZone));
  if (!endKey || count <= 0) {
    return [];
  }

  const [year, month, day] = endKey.split('-').map(Number);
  const keys: string[] = [];
  for (let offset = count - 1; offset >= 0; offset--) {
    keys.push(new Date(Date.UTC(year, month - 1, day - offset)).toISOString().slice(0, 10));
  }
  return keys;
}
