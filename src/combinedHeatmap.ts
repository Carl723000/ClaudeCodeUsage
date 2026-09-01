import { DayUsage } from './heatmap';

export type CombinedHeatmapRange = '30d' | '90d' | 'year';

export interface ProviderDailyPoint {
  dateISO: string;
  processed: number;
}

export interface CodexDailyProcessedLike {
  day: string;
  total: {
    input: number;
    output: number;
    cachedInput?: number;
    reasoning?: number;
    processed?: number;
  };
}

export interface CombinedDayUsage {
  dateISO: string;
  claudeProcessed: number;
  codexProcessed: number;
  combinedProcessed: number;
}

export interface CombinedHeatmapTotals {
  claudeProcessed: number;
  codexProcessed: number;
  combinedProcessed: number;
  activeDays: number;
}

export interface CombinedHeatmapWindow {
  range: CombinedHeatmapRange;
  startDateISO: string;
  endDateISO: string;
  daily: Record<string, CombinedDayUsage>;
  totals: CombinedHeatmapTotals;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function finiteNonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function isCalendarDateKey(value: string): boolean {
  if (!DATE_KEY.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** UTC date-key arithmetic keeps an already timezone-bucketed day stable. */
export function addCalendarDays(dateISO: string, days: number): string {
  if (!isCalendarDateKey(dateISO)) {
    throw new Error(`Invalid calendar date: ${dateISO}`);
  }
  const date = new Date(`${dateISO}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function normalizeCombinedHeatmapRange(value: unknown): CombinedHeatmapRange {
  return value === '30d' || value === '90d' || value === 'year' ? value : 'year';
}

export function combinedHeatmapRangeDays(range: CombinedHeatmapRange): number {
  return range === '30d' ? 30 : range === '90d' ? 90 : 366;
}

/** Claude daily aggregates already implement the four-bucket processed formula. */
export function claudeDailyPointsFromUsage(
  daily: Readonly<Record<string, DayUsage>>,
): ProviderDailyPoint[] {
  return Object.entries(daily)
    .filter(([dateISO]) => isCalendarDateKey(dateISO))
    .map(([dateISO, usage]) => ({
      dateISO,
      processed: finiteNonNegative(usage.tokens),
    }));
}

/**
 * Codex processed activity is input total + output total. Cached input is
 * already included in input and reasoning is already included in output, so
 * neither field is added again. Deliberately recomputing this from the two
 * source totals protects the combined view from a malformed `processed` field.
 */
export function codexDailyPointsFromUsage(
  rows: readonly CodexDailyProcessedLike[],
): ProviderDailyPoint[] {
  return rows
    .filter((row) => isCalendarDateKey(row.day))
    .map((row) => ({
      dateISO: row.day,
      processed:
        finiteNonNegative(row.total.input) +
        finiteNonNegative(row.total.output),
    }));
}

function deduplicatePoints(points: readonly ProviderDailyPoint[]): Map<string, number> {
  const deduplicated = new Map<string, number>();
  for (const point of points) {
    if (!isCalendarDateKey(point.dateISO)) {
      continue;
    }
    const processed = finiteNonNegative(point.processed);
    const previous = deduplicated.get(point.dateISO);
    if (previous === undefined) {
      deduplicated.set(point.dateISO, processed);
      continue;
    }
    if (previous !== processed) {
      throw new Error(`Conflicting duplicate daily aggregate: ${point.dateISO}`);
    }
  }
  return deduplicated;
}

/**
 * Merge by configured-timezone date key. Byte-equivalent duplicate provider
 * rows are idempotent; conflicting duplicates fail closed instead of silently
 * inflating the share artifact.
 */
export function mergeCombinedDailyUsage(
  claude: readonly ProviderDailyPoint[],
  codex: readonly ProviderDailyPoint[],
): Record<string, CombinedDayUsage> {
  const claudeByDay = deduplicatePoints(claude);
  const codexByDay = deduplicatePoints(codex);
  const days = new Set([...claudeByDay.keys(), ...codexByDay.keys()]);
  return Object.fromEntries(
    [...days]
      .sort((left, right) => left.localeCompare(right))
      .map((dateISO) => {
        const claudeProcessed = claudeByDay.get(dateISO) ?? 0;
        const codexProcessed = codexByDay.get(dateISO) ?? 0;
        return [dateISO, {
          dateISO,
          claudeProcessed,
          codexProcessed,
          combinedProcessed: claudeProcessed + codexProcessed,
        } satisfies CombinedDayUsage];
      }),
  );
}

export function selectCombinedHeatmapWindow(
  daily: Readonly<Record<string, CombinedDayUsage>>,
  rangeInput: unknown,
  endDateISO: string,
): CombinedHeatmapWindow {
  if (!isCalendarDateKey(endDateISO)) {
    throw new Error(`Invalid heatmap end date: ${endDateISO}`);
  }
  const range = normalizeCombinedHeatmapRange(rangeInput);
  const startDateISO = addCalendarDays(
    endDateISO,
    -(combinedHeatmapRangeDays(range) - 1),
  );
  const selected: Record<string, CombinedDayUsage> = {};
  let claudeProcessed = 0;
  let codexProcessed = 0;
  let activeDays = 0;
  for (const dateISO of Object.keys(daily).sort((left, right) => left.localeCompare(right))) {
    if (dateISO < startDateISO || dateISO > endDateISO) {
      continue;
    }
    const source = daily[dateISO];
    const claudeValue = finiteNonNegative(source.claudeProcessed);
    const codexValue = finiteNonNegative(source.codexProcessed);
    const combinedProcessed = claudeValue + codexValue;
    selected[dateISO] = {
      dateISO,
      claudeProcessed: claudeValue,
      codexProcessed: codexValue,
      combinedProcessed,
    };
    claudeProcessed += claudeValue;
    codexProcessed += codexValue;
    if (combinedProcessed > 0) {
      activeDays += 1;
    }
  }
  return {
    range,
    startDateISO,
    endDateISO,
    daily: selected,
    totals: {
      claudeProcessed,
      codexProcessed,
      combinedProcessed: claudeProcessed + codexProcessed,
      activeDays,
    },
  };
}

export function combinedDailyAsHeatmapUsage(
  daily: Readonly<Record<string, CombinedDayUsage>>,
): Record<string, DayUsage> {
  return Object.fromEntries(
    Object.entries(daily).map(([dateISO, usage]) => [dateISO, {
      tokens: finiteNonNegative(usage.combinedProcessed),
      cost: 0,
      sessions: 0,
    }]),
  );
}

export function sanitizeCombinedHeatmapTitle(value: unknown, fallback: string): string {
  const cleaned = typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
    : '';
  return cleaned || fallback;
}

export function combinedHeatmapFilename(
  range: CombinedHeatmapRange,
  endDateISO: string,
): string {
  if (!isCalendarDateKey(endDateISO)) {
    throw new Error(`Invalid heatmap end date: ${endDateISO}`);
  }
  return `claude-codex-activity-${range}-${endDateISO}.svg`;
}

export function combinedHeatmapMarkdown(filename: string, title: string): string {
  const safeFilename = filename
    .replace(/[\r\n<>]/g, '')
    .replace(/\\/g, '/')
    .replace(/\s/g, '%20');
  const safeTitle = title.replace(/[\r\n\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  return `![${safeTitle || 'Claude and Codex activity'}](${safeFilename})`;
}
