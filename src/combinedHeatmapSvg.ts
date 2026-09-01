import {
  CombinedDayUsage,
  CombinedHeatmapRange,
  combinedDailyAsHeatmapUsage,
  selectCombinedHeatmapWindow,
} from './combinedHeatmap';
import { renderHeatmapSvg } from './heatmapSvg';

export const COMBINED_ACTIVITY_SCALE = [
  '#ebedf0',
  '#dbeafe',
  '#93c5fd',
  '#3b82f6',
  '#1d4ed8',
];

export interface CombinedHeatmapSvgOptions {
  range?: CombinedHeatmapRange;
  endDateISO: string;
  title?: string;
  watermark?: string;
  labels?: {
    combined: string;
    processedTokens: string;
    footerNote: string;
  };
}

function compactNumber(value: number): string {
  const absolute = Math.abs(value);
  const format = (scaled: number): string => scaled.toFixed(1).replace(/\.0$/, '');
  if (absolute >= 1_000_000_000) return `${format(value / 1_000_000_000)}B`;
  if (absolute >= 1_000_000) return `${format(value / 1_000_000)}M`;
  if (absolute >= 1_000) return `${format(value / 1_000)}K`;
  return String(Math.round(value));
}

/**
 * Deterministic, privacy-bounded share card. Its input carries date keys and
 * aggregate provider totals only; it has no account, project, thread, path, or
 * log-content fields that could accidentally be serialized.
 */
export function renderCombinedHeatmapSvg(
  daily: Readonly<Record<string, CombinedDayUsage>>,
  options: CombinedHeatmapSvgOptions,
): string {
  const window = selectCombinedHeatmapWindow(
    daily,
    options.range ?? 'year',
    options.endDateISO,
  );
  const title = options.title ?? 'Claude + Codex local activity';
  const labels = options.labels ?? {
    combined: 'Combined',
    processedTokens: 'processed tokens',
    footerNote: 'Local activity volume · not productivity, billing, or provider equivalence',
  };
  const subtitle = [
    `Claude ${compactNumber(window.totals.claudeProcessed)}`,
    `Codex ${compactNumber(window.totals.codexProcessed)}`,
    `${labels.combined} ${compactNumber(window.totals.combinedProcessed)} ${labels.processedTokens}`,
  ].join(' · ');
  return renderHeatmapSvg(combinedDailyAsHeatmapUsage(window.daily), {
    metric: 'tokens',
    startDateISO: window.startDateISO,
    endDateISO: window.endDateISO,
    title,
    subtitle,
    footerNote: labels.footerNote,
    watermark: options.watermark ?? 'Made with Claude Code Usage',
    scale: COMBINED_ACTIVITY_SCALE,
    minWidth: 720,
    ariaLabel: `${title}. ${subtitle}`,
    tooltip: (dateISO) => {
      const usage = window.daily[dateISO] ?? {
        claudeProcessed: 0,
        codexProcessed: 0,
        combinedProcessed: 0,
      };
      return `${dateISO} · Claude: ${compactNumber(usage.claudeProcessed)} · ` +
        `Codex: ${compactNumber(usage.codexProcessed)} · ` +
        `${labels.combined}: ${compactNumber(usage.combinedProcessed)} ${labels.processedTokens}`;
    },
  });
}
