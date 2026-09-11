import { rollingDayKeysFromDayKey } from './dateKeys';

export type ProjectMatrixCoverage = 'complete' | 'partial' | 'none';

export interface ProjectDayPoint {
  projectKey: string;
  projectName: string;
  day: string;
  tokens: number;
  coverage: ProjectMatrixCoverage;
}

export interface ProjectUsageMatrixSnapshot {
  provider: 'claude' | 'codex';
  timeZone: string;
  asOfDay: string;
  /** One bounded sparse source supports both the 30- and 90-day projections. */
  days: string[];
  points: ProjectDayPoint[];
  coverage: ProjectMatrixCoverage;
}

export interface ProjectHeatmapCell extends ProjectDayPoint {
  bucket: 0 | 1 | 2 | 3 | 4;
}

export interface ProjectHeatmapRow {
  projectKey: string;
  projectName: string;
  totalTokens: number;
  activeDays: number;
  cells: ProjectHeatmapCell[];
}

export interface ProjectTrendSeries {
  projectKey: string;
  projectName: string;
  totalTokens: number;
  other: boolean;
  values: Array<{
    day: string;
    tokens: number;
    coverage: ProjectMatrixCoverage;
  }>;
}

function safeTokenCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function safeProjectName(value: string): string {
  return typeof value === 'string' ? value.trim() : '';
}

function mergeCoverage(
  left: ProjectMatrixCoverage,
  right: ProjectMatrixCoverage,
): ProjectMatrixCoverage {
  if (left === right) return left;
  if (left === 'partial' || right === 'partial') return 'partial';
  return 'partial';
}

function normalizedRangeDays(value: number): 30 | 90 {
  return value === 90 ? 90 : 30;
}

function rangeDays(
  snapshot: ProjectUsageMatrixSnapshot,
  requestedDays: number,
): string[] {
  return snapshot.days.slice(-normalizedRangeDays(requestedDays));
}

/** Build the single bounded sparse source consumed by both visual projections. */
export function buildProjectUsageMatrixSnapshot(
  provider: 'claude' | 'codex',
  points: Iterable<ProjectDayPoint>,
  options: {
    asOfDay: string;
    timeZone: string;
    coverage?: ProjectMatrixCoverage;
  },
): ProjectUsageMatrixSnapshot {
  const days = rollingDayKeysFromDayKey(options.asOfDay, 90);
  const allowedDays = new Set(days);
  const combined = new Map<string, ProjectDayPoint>();

  for (const point of points) {
    const projectKey = typeof point.projectKey === 'string'
      ? point.projectKey.trim()
      : '';
    if (!projectKey || !allowedDays.has(point.day)) continue;
    const key = `${projectKey}\0${point.day}`;
    const previous = combined.get(key);
    const projectName = safeProjectName(point.projectName) || previous?.projectName || '';
    combined.set(key, {
      projectKey,
      projectName,
      day: point.day,
      tokens: safeTokenCount(point.tokens) + (previous?.tokens ?? 0),
      coverage: previous
        ? mergeCoverage(previous.coverage, point.coverage)
        : point.coverage,
    });
  }

  return {
    provider,
    timeZone: options.timeZone,
    asOfDay: options.asOfDay,
    days,
    points: [...combined.values()].sort(
      (left, right) =>
        left.day.localeCompare(right.day) ||
        left.projectName.localeCompare(right.projectName) ||
        left.projectKey.localeCompare(right.projectKey),
    ),
    coverage: options.coverage ?? 'complete',
  };
}

function bucketScale(positiveValues: readonly number[]): (value: number) => 0 | 1 | 2 | 3 | 4 {
  const unique = [...new Set(positiveValues)].sort((left, right) => left - right);
  return (value: number): 0 | 1 | 2 | 3 | 4 => {
    if (!(value > 0) || unique.length === 0) return 0;
    if (unique.length === 1) return 4;
    const rank = unique.findIndex((candidate) => candidate >= value);
    const position = rank >= 0 ? rank + 1 : unique.length;
    return (1 + Math.floor(((position - 1) * 3) / (unique.length - 1))) as 1 | 2 | 3 | 4;
  };
}

function groupedRows(
  snapshot: ProjectUsageMatrixSnapshot,
  requestedDays: number,
): Array<{
  projectKey: string;
  projectName: string;
  totalTokens: number;
  activeDays: number;
  byDay: Map<string, ProjectDayPoint>;
}> {
  const days = new Set(rangeDays(snapshot, requestedDays));
  const projects = new Map<string, {
    projectName: string;
    totalTokens: number;
    activeDays: number;
    byDay: Map<string, ProjectDayPoint>;
  }>();
  for (const point of snapshot.points) {
    if (!days.has(point.day)) continue;
    const row = projects.get(point.projectKey) ?? {
      projectName: point.projectName,
      totalTokens: 0,
      activeDays: 0,
      byDay: new Map<string, ProjectDayPoint>(),
    };
    row.projectName ||= point.projectName;
    row.totalTokens += point.tokens;
    if (point.tokens > 0) row.activeDays += 1;
    row.byDay.set(point.day, point);
    projects.set(point.projectKey, row);
  }
  return [...projects.entries()]
    .map(([projectKey, row]) => ({ projectKey, ...row }))
    .filter((row) => row.totalTokens > 0)
    .sort(
      (left, right) =>
        right.totalTokens - left.totalTokens ||
        right.activeDays - left.activeDays ||
        left.projectName.localeCompare(right.projectName) ||
        left.projectKey.localeCompare(right.projectKey),
    );
}

/** Project rows with one shared quantile scale across every visible cell. */
export function projectHeatmap(
  snapshot: ProjectUsageMatrixSnapshot,
  requestedDays: number = 30,
  maxRows: number = 40,
): ProjectHeatmapRow[] {
  const days = rangeDays(snapshot, requestedDays);
  const daySet = new Set(days);
  const rows = groupedRows(snapshot, requestedDays)
    .slice(0, Math.max(1, Math.min(40, Math.floor(maxRows))));
  const bucketForValue = bucketScale(snapshot.points
    .filter((point) => daySet.has(point.day) && point.tokens > 0)
    .map((point) => point.tokens));
  return rows.map((row) => ({
    projectKey: row.projectKey,
    projectName: row.projectName,
    totalTokens: row.totalTokens,
    activeDays: row.activeDays,
    cells: days.map((day): ProjectHeatmapCell => {
      const point = row.byDay.get(day) ?? {
        projectKey: row.projectKey,
        projectName: row.projectName,
        day,
        tokens: 0,
        coverage: snapshot.coverage,
      };
      return { ...point, bucket: bucketForValue(point.tokens) };
    }),
  }));
}

/** Daily stacked series. The final series is a lossless Other tail when needed. */
export function projectTrend(
  snapshot: ProjectUsageMatrixSnapshot,
  requestedDays: number = 30,
  maxSeries: number = 6,
): ProjectTrendSeries[] {
  const days = rangeDays(snapshot, requestedDays);
  const daySet = new Set(days);
  const rows = groupedRows(snapshot, requestedDays);
  const seriesLimit = Math.max(2, Math.min(12, Math.floor(maxSeries)));
  const hasTail = rows.length > seriesLimit;
  const visibleCount = hasTail ? seriesLimit - 1 : rows.length;
  const visibleRows = rows.slice(0, visibleCount);
  const visibleKeys = new Set(visibleRows.map((row) => row.projectKey));
  const result = visibleRows.map((row): ProjectTrendSeries => ({
    projectKey: row.projectKey,
    projectName: row.projectName,
    totalTokens: row.totalTokens,
    other: false,
    values: days.map((day) => {
      const point = row.byDay.get(day);
      return {
        day,
        tokens: point?.tokens ?? 0,
        coverage: point?.coverage ?? snapshot.coverage,
      };
    }),
  }));

  if (hasTail) {
    const tailByDay = new Map<string, { tokens: number; coverage: ProjectMatrixCoverage }>();
    let tailTotal = 0;
    for (const point of snapshot.points) {
      if (!daySet.has(point.day) || visibleKeys.has(point.projectKey)) continue;
      const previous = tailByDay.get(point.day);
      tailByDay.set(point.day, {
        tokens: (previous?.tokens ?? 0) + point.tokens,
        coverage: previous
          ? mergeCoverage(previous.coverage, point.coverage)
          : point.coverage,
      });
      tailTotal += point.tokens;
    }
    result.push({
      projectKey: '__other__',
      projectName: '',
      totalTokens: tailTotal,
      other: true,
      values: days.map((day) => ({
        day,
        tokens: tailByDay.get(day)?.tokens ?? 0,
        coverage: tailByDay.get(day)?.coverage ?? snapshot.coverage,
      })),
    });
  }

  return result;
}
