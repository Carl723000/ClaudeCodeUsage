import { CodexUsageScopeView } from './providers/codex/codexUsage';
import { ProviderLimitSnapshot } from './providers/providerTypes';

export type CodexStatusMetric = 'fresh' | 'processed' | 'output';

export interface CodexStatusOptions {
  /** Keep the existing opt-in preference meaningful for the Codex bar. */
  quotaFiveHourOnly?: boolean;
}

export interface CodexStatusLimit {
  label: string;
  windowMinutes?: number;
  usedPercent: number;
  remainingPercent: number;
  observedAt?: number;
  resetsAt?: number;
}

export interface CodexStatusText {
  text: string;
  limitText?: string;
  limit?: CodexStatusLimit;
  stale: boolean;
}

const FIVE_HOUR_MINUTES = 5 * 60;
const WEEK_MINUTES = 7 * 24 * 60;

function compact(value: number): string {
  const safe = Math.max(0, value);
  if (safe >= 1_000_000_000) {
    return `${Number((safe / 1_000_000_000).toFixed(1))}B`;
  }
  if (safe >= 1_000_000) {
    return `${Number((safe / 1_000_000).toFixed(1))}M`;
  }
  if (safe >= 1_000) {
    return `${Number((safe / 1_000).toFixed(1))}k`;
  }
  return String(Math.round(safe));
}

function windowLabel(minutes: number | undefined, fallback: string | undefined): string {
  if (minutes === FIVE_HOUR_MINUTES) {
    return '5h';
  }
  if (minutes === WEEK_MINUTES) {
    return 'wk';
  }
  if (minutes !== undefined && minutes > 0) {
    if (minutes % (24 * 60) === 0) {
      return `${minutes / (24 * 60)}d`;
    }
    if (minutes % 60 === 0) {
      return `${minutes / 60}h`;
    }
    return `${minutes}m`;
  }
  return fallback && fallback !== 'primary' ? fallback : 'limit';
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function selectQuotaWindow(
  windows: ProviderLimitSnapshot['windows'],
  options: CodexStatusOptions,
): ProviderLimitSnapshot['windows'][number] | undefined {
  if (options.quotaFiveHourOnly) {
    return windows.find((window) => window.windowMinutes === FIVE_HOUR_MINUTES);
  }
  // The weekly allowance is the useful default after a reset: it answers how
  // much room remains for the week, rather than how much has already gone.
  return windows.find((window) => window.windowMinutes === WEEK_MINUTES)
    ?? windows.find((window) => window.windowMinutes === FIVE_HOUR_MINUTES)
    ?? windows[0];
}

export function formatCodexStatus(
  scope: CodexUsageScopeView,
  metric: CodexStatusMetric,
  limit: ProviderLimitSnapshot | null,
  now: number = Date.now(),
  options: CodexStatusOptions = {},
): CodexStatusText {
  const value =
    metric === 'processed'
      ? scope.total.processed
      : metric === 'output'
        ? scope.total.output
        : scope.total.fresh;
  const liveWindows = limit?.windows.filter(
    (window) => window.resetsAt === undefined || window.resetsAt > now,
  ) ?? [];
  const liveWindow = selectQuotaWindow(liveWindows, options);
  const selectedLimit = liveWindow
    ? {
        label: windowLabel(liveWindow.windowMinutes, liveWindow.label),
        ...(liveWindow.windowMinutes !== undefined
          ? { windowMinutes: liveWindow.windowMinutes }
          : {}),
        usedPercent: clampPercent(liveWindow.usedPercent),
        remainingPercent: 100 - clampPercent(liveWindow.usedPercent),
        ...(limit?.observedAt !== undefined ? { observedAt: limit.observedAt } : {}),
        ...(liveWindow.resetsAt !== undefined ? { resetsAt: liveWindow.resetsAt } : {}),
      }
    : undefined;
  const limitText = selectedLimit
    ? `${selectedLimit.label} ${Math.round(selectedLimit.remainingPercent)}%`
    : undefined;
  return {
    text: `CX ${compact(value)}${scope.indexedSubtotal ? '*' : ''}`,
    limitText,
    ...(selectedLimit ? { limit: selectedLimit } : {}),
    stale: Boolean(limit && liveWindows.length === 0),
  };
}
