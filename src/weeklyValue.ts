import { calculateCostFromPricing, getExactModelPricing } from './pricing';
import { ClaudeApiUsageResponse, ClaudeUsageRecord } from './types';
import { normalizeQuotaWindows } from './quotaWindows';
import { ProviderTokenCounts, UsageProvider } from './providers/providerTypes';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_CLUSTER_MS = 5 * 60 * 1000;
const MIN_EXTRAPOLATION_PERCENT = 5;
const MIN_PRICED_SHARE = 0.8;

export type WeeklyValueConfidence = 'high' | 'medium' | 'low' | 'usage-only';
export type WeeklyValueBasis =
  | 'quota-observation'
  | 'reset-aligned-usage'
  | 'calendar-usage';

export interface WeeklyQuotaObservation {
  provider: UsageProvider;
  seriesKey: string;
  seriesLabel?: string;
  observedAt: number;
  resetAt: number;
  usedPercent: number;
  sourceKey?: string;
}

export interface WeeklyEquivalentUsage {
  timestamp: number;
  equivalentUsd: number;
  pricedTokens: number;
  totalTokens: number;
  sourceKey?: string;
}

export interface WeeklyValueInputs {
  observations: WeeklyQuotaObservation[];
  usage: WeeklyEquivalentUsage[];
}

export interface WeeklyValuePoint {
  provider: UsageProvider;
  seriesKey: string;
  seriesLabel?: string;
  windowStart: number;
  resetAt: number;
  current: boolean;
  usedEquivalentUsd: number;
  fullEquivalentUsd: number | null;
  unusedEquivalentUsd: number | null;
  utilizationPercent: number | null;
  pricingCoverage: number;
  observationGapMs: number | null;
  confidence: WeeklyValueConfidence;
  basis: WeeklyValueBasis;
}

export interface WeeklyUsageHistoryOptions {
  now?: number;
  /** A real observed weekly reset used only to align seven-day buckets. */
  anchorResetAt?: number;
  seriesKey?: string;
  limit?: number;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function observationIdentity(observation: WeeklyQuotaObservation): string {
  return [
    observation.provider,
    observation.seriesKey,
    observation.resetAt,
    observation.usedPercent,
    observation.sourceKey ?? '',
  ].join('|');
}

/**
 * Keep one latest sample for each percentage step in a reset window. This
 * preserves the observation closest to reset without writing one item per
 * quota poll. The bounded history contains no credentials or account names.
 */
export function appendWeeklyQuotaObservations(
  history: WeeklyQuotaObservation[],
  additions: WeeklyQuotaObservation[],
  limit = 512,
): WeeklyQuotaObservation[] {
  const compacted = new Map<string, WeeklyQuotaObservation>();
  for (const item of [...history, ...additions]) {
    if (
      !Number.isFinite(item.observedAt) ||
      !Number.isFinite(item.resetAt) ||
      !Number.isFinite(item.usedPercent) ||
      item.resetAt <= 0
    ) {
      continue;
    }
    const normalized: WeeklyQuotaObservation = {
      ...item,
      usedPercent: Math.min(100, Math.max(0, item.usedPercent)),
    };
    const key = observationIdentity(normalized);
    const previous = compacted.get(key);
    if (!previous || normalized.observedAt > previous.observedAt) {
      compacted.set(key, normalized);
    }
  }
  return [...compacted.values()]
    .sort((left, right) => left.observedAt - right.observedAt)
    .slice(-Math.max(1, Math.floor(limit)));
}

export function claudeWeeklyQuotaObservations(
  usage: ClaudeApiUsageResponse | null,
  profileKey: string,
  observedAt: number,
): WeeklyQuotaObservation[] {
  return normalizeQuotaWindows(usage)
    .filter((window) => window.kind === 'weekly_all')
    .flatMap((window) => {
      const resetAt = Date.parse(window.resetsAt);
      if (!Number.isFinite(resetAt) || resetAt <= 0) {
        return [];
      }
      return [{
        provider: 'claude' as const,
        seriesKey: profileKey,
        observedAt,
        resetAt,
        usedPercent: window.utilization,
      }];
    });
}

function tokenTotal(tokens: ProviderTokenCounts): number {
  return finiteNonNegative(tokens.inputTotal) + finiteNonNegative(tokens.outputTotal);
}

/** Current official API-equivalent value for a known model. Unknown models are
 * deliberately left unpriced instead of inheriting a family fallback. */
export function equivalentUsageFromProviderTokens(
  timestamp: number,
  model: string,
  tokens: ProviderTokenCounts,
  sourceKey?: string,
): WeeklyEquivalentUsage {
  const totalTokens = tokenTotal(tokens);
  const pricing = getExactModelPricing(model);
  if (!pricing) {
    return { timestamp, equivalentUsd: 0, pricedTokens: 0, totalTokens, sourceKey };
  }
  const inputTotal = finiteNonNegative(tokens.inputTotal);
  const cachedInput = Math.min(inputTotal, finiteNonNegative(tokens.cachedInput ?? 0));
  const equivalentUsd =
    (inputTotal - cachedInput) * finiteNonNegative(pricing.input_cost_per_token ?? 0) +
    cachedInput * finiteNonNegative(pricing.cache_read_input_token_cost ?? 0) +
    finiteNonNegative(tokens.outputTotal) * finiteNonNegative(pricing.output_cost_per_token ?? 0);
  return { timestamp, equivalentUsd, pricedTokens: totalTokens, totalTokens, sourceKey };
}

export function claudeWeeklyEquivalentUsage(
  records: ClaudeUsageRecord[],
): WeeklyEquivalentUsage[] {
  const rows: WeeklyEquivalentUsage[] = [];
  for (const record of records) {
    if (record._isUserPrompt || record.isApiErrorMessage) {
      continue;
    }
    const model = record.message.model;
    const usage = record.message.usage;
    const timestamp = Date.parse(record.timestamp);
    if (!model || model === '<synthetic>' || !usage || !Number.isFinite(timestamp)) {
      continue;
    }
    const totalTokens =
      finiteNonNegative(usage.input_tokens) +
      finiteNonNegative(usage.output_tokens) +
      finiteNonNegative(usage.cache_creation_input_tokens ?? 0) +
      finiteNonNegative(usage.cache_read_input_tokens ?? 0);
    const pricing = getExactModelPricing(model);
    // Non-Claude proxy models do not consume an Anthropic subscription window.
    if (!pricing || !model.toLowerCase().includes('claude')) {
      rows.push({ timestamp, equivalentUsd: 0, pricedTokens: 0, totalTokens });
      continue;
    }
    rows.push({
      timestamp,
      equivalentUsd: calculateCostFromPricing(usage, pricing),
      pricedTokens: totalTokens,
      totalTokens,
    });
  }
  return rows;
}

interface ObservationCluster {
  provider: UsageProvider;
  seriesKey: string;
  seriesLabel?: string;
  resetAt: number;
  observations: WeeklyQuotaObservation[];
}

function clusterObservations(observations: WeeklyQuotaObservation[]): ObservationCluster[] {
  const clusters: ObservationCluster[] = [];
  const ordered = observations
    .filter((item) => Number.isFinite(item.resetAt) && item.resetAt > 0)
    .sort((left, right) =>
      left.provider.localeCompare(right.provider) ||
      left.seriesKey.localeCompare(right.seriesKey) ||
      left.resetAt - right.resetAt ||
      left.observedAt - right.observedAt,
    );
  for (const observation of ordered) {
    const previous = clusters[clusters.length - 1];
    if (
      previous &&
      previous.provider === observation.provider &&
      previous.seriesKey === observation.seriesKey &&
      Math.abs(previous.resetAt - observation.resetAt) <= RESET_CLUSTER_MS
    ) {
      previous.observations.push(observation);
      // Prefer the reset timestamp carried by the newest observation.
      if (
        observation.observedAt >=
        Math.max(...previous.observations.map((item) => item.observedAt))
      ) {
        previous.resetAt = observation.resetAt;
      }
      previous.seriesLabel ??= observation.seriesLabel;
      continue;
    }
    clusters.push({
      provider: observation.provider,
      seriesKey: observation.seriesKey,
      seriesLabel: observation.seriesLabel,
      resetAt: observation.resetAt,
      observations: [observation],
    });
  }
  return clusters;
}

function totals(rows: WeeklyEquivalentUsage[]): {
  equivalentUsd: number;
  pricedTokens: number;
  totalTokens: number;
} {
  return rows.reduce(
    (sum, row) => ({
      equivalentUsd: sum.equivalentUsd + finiteNonNegative(row.equivalentUsd),
      pricedTokens: sum.pricedTokens + finiteNonNegative(row.pricedTokens),
      totalTokens: sum.totalTokens + finiteNonNegative(row.totalTokens),
    }),
    { equivalentUsd: 0, pricedTokens: 0, totalTokens: 0 },
  );
}

export interface EquivalentUsageSummary {
  equivalentUsd: number;
  pricedTokens: number;
  totalTokens: number;
  pricingCoverage: number;
}

/** Aggregate exact-model API-equivalent rows without pricing unknown models. */
export function summarizeEquivalentUsage(
  rows: WeeklyEquivalentUsage[],
  expectedTotalTokens?: number,
): EquivalentUsageSummary {
  const summary = totals(rows);
  const totalTokens = Math.max(
    summary.totalTokens,
    finiteNonNegative(expectedTotalTokens ?? summary.totalTokens),
  );
  return {
    ...summary,
    totalTokens,
    pricingCoverage: totalTokens > 0
      ? Math.min(1, summary.pricedTokens / totalTokens)
      : 0,
  };
}

function nextCalendarWeekReset(timestamp: number): number {
  const date = new Date(timestamp);
  const dayStart = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return dayStart - daysSinceMonday * 24 * 60 * 60 * 1000 + WEEK_MS;
}

function resetForTimestamp(timestamp: number, anchorResetAt?: number): {
  resetAt: number;
  basis: Extract<WeeklyValueBasis, 'reset-aligned-usage' | 'calendar-usage'>;
} {
  if (anchorResetAt !== undefined && Number.isFinite(anchorResetAt) && anchorResetAt > 0) {
    // Windows are [reset - 7d, reset). An event exactly on a reset therefore
    // belongs to the following window instead of being counted twice.
    const periods = Math.floor((timestamp - anchorResetAt) / WEEK_MS) + 1;
    return {
      resetAt: anchorResetAt + periods * WEEK_MS,
      basis: 'reset-aligned-usage',
    };
  }
  return { resetAt: nextCalendarWeekReset(timestamp), basis: 'calendar-usage' };
}

/**
 * Builds auditable history from token logs even when historical quota samples
 * do not exist. These rows intentionally expose only the API-equivalent value
 * already observed; total and unused allowance remain unknown.
 */
export function buildWeeklyUsageHistory(
  provider: UsageProvider,
  usage: WeeklyEquivalentUsage[],
  options: WeeklyUsageHistoryOptions = {},
): WeeklyValuePoint[] {
  const now = options.now ?? Date.now();
  const grouped = new Map<number, WeeklyEquivalentUsage[]>();
  let basis: Extract<WeeklyValueBasis, 'reset-aligned-usage' | 'calendar-usage'> =
    options.anchorResetAt !== undefined ? 'reset-aligned-usage' : 'calendar-usage';
  for (const row of usage) {
    if (!Number.isFinite(row.timestamp) || row.timestamp > now) {
      continue;
    }
    const bucket = resetForTimestamp(row.timestamp, options.anchorResetAt);
    basis = bucket.basis;
    const rows = grouped.get(bucket.resetAt) ?? [];
    rows.push(row);
    grouped.set(bucket.resetAt, rows);
  }
  const points = [...grouped.entries()].map(([resetAt, rows]): WeeklyValuePoint => {
    const used = totals(rows);
    return {
      provider,
      seriesKey: options.seriesKey ?? 'local-usage-history',
      windowStart: resetAt - WEEK_MS,
      resetAt,
      current: resetAt > now,
      usedEquivalentUsd: used.equivalentUsd,
      fullEquivalentUsd: null,
      unusedEquivalentUsd: null,
      utilizationPercent: null,
      pricingCoverage: used.totalTokens > 0
        ? Math.min(1, used.pricedTokens / used.totalTokens)
        : 0,
      observationGapMs: null,
      confidence: 'usage-only',
      basis,
    };
  });
  return points
    .sort((left, right) => right.resetAt - left.resetAt)
    .slice(0, Math.max(1, Math.floor(options.limit ?? 12)));
}

/** Keep observed quota rows authoritative while filling older gaps from logs. */
export function mergeWeeklyValuePoints(
  observed: WeeklyValuePoint[],
  history: WeeklyValuePoint[],
  limit = 12,
): WeeklyValuePoint[] {
  const fallback = history.filter((candidate) => !observed.some((point) =>
    point.provider === candidate.provider &&
    Math.abs(point.resetAt - candidate.resetAt) <= RESET_CLUSTER_MS,
  ));
  return [...observed, ...fallback]
    .sort((left, right) => right.resetAt - left.resetAt)
    .slice(0, Math.max(1, Math.floor(limit)));
}

function confidenceFor(
  current: boolean,
  observationGapMs: number,
  pricingCoverage: number,
): WeeklyValueConfidence {
  if (pricingCoverage < MIN_PRICED_SHARE) {
    return 'low';
  }
  if (current) {
    return observationGapMs <= 6 * 60 * 60 * 1000 ? 'medium' : 'low';
  }
  if (observationGapMs <= 6 * 60 * 60 * 1000) {
    return 'high';
  }
  return observationGapMs <= 24 * 60 * 60 * 1000 ? 'medium' : 'low';
}

/**
 * Builds reset-aligned weekly points. The full-window figure is an audited
 * extrapolation: API-equivalent value accumulated by the last quota sample,
 * divided by that sample's utilization. It is omitted when utilization or
 * model-price coverage is too small to support the inference.
 */
export function buildWeeklyValueTrend(
  inputs: WeeklyValueInputs,
  now: number = Date.now(),
): WeeklyValuePoint[] {
  const points: WeeklyValuePoint[] = [];
  for (const cluster of clusterObservations(inputs.observations)) {
    const windowStart = cluster.resetAt - WEEK_MS;
    const periodEnd = Math.min(now, cluster.resetAt);
    const eligibleObservations = cluster.observations
      .filter((item) => item.observedAt >= windowStart && item.observedAt <= periodEnd)
      .sort((left, right) => left.observedAt - right.observedAt);
    const latest = eligibleObservations[eligibleObservations.length - 1];
    if (!latest) {
      continue;
    }
    const sourceKeys = new Set(
      cluster.observations.flatMap((item) => item.sourceKey ? [item.sourceKey] : []),
    );
    const matchedUsage = inputs.usage.filter((row) =>
      row.timestamp >= windowStart &&
      row.timestamp <= periodEnd &&
      (sourceKeys.size === 0 || (row.sourceKey !== undefined && sourceKeys.has(row.sourceKey))),
    );
    const used = totals(matchedUsage);
    if (used.totalTokens <= 0 && latest.usedPercent <= 0) {
      continue;
    }
    const observed = totals(matchedUsage.filter((row) => row.timestamp <= latest.observedAt));
    const pricingCoverage = used.totalTokens > 0
      ? Math.min(1, used.pricedTokens / used.totalTokens)
      : 0;
    const current = cluster.resetAt > now;
    const observationGapMs = Math.max(
      0,
      (current ? now : cluster.resetAt) - latest.observedAt,
    );
    let fullEquivalentUsd: number | null = null;
    let observationOverrun = false;
    if (
      latest.usedPercent >= MIN_EXTRAPOLATION_PERCENT &&
      observed.equivalentUsd > 0 &&
      pricingCoverage >= MIN_PRICED_SHARE
    ) {
      fullEquivalentUsd = observed.equivalentUsd / (latest.usedPercent / 100);
      if (!Number.isFinite(fullEquivalentUsd) || fullEquivalentUsd <= 0) {
        fullEquivalentUsd = null;
      } else if (used.equivalentUsd > fullEquivalentUsd) {
        // A quota sample can be older than the newest local usage. Never show a
        // total allowance below usage already observed, and surface the stale
        // inference through low confidence instead of implying false precision.
        fullEquivalentUsd = used.equivalentUsd;
        observationOverrun = true;
      }
    }
    points.push({
      provider: cluster.provider,
      seriesKey: cluster.seriesKey,
      seriesLabel: cluster.seriesLabel,
      windowStart,
      resetAt: cluster.resetAt,
      current,
      usedEquivalentUsd: used.equivalentUsd,
      fullEquivalentUsd,
      unusedEquivalentUsd:
        !current && fullEquivalentUsd !== null
          ? Math.max(0, fullEquivalentUsd - used.equivalentUsd)
          : null,
      utilizationPercent: latest.usedPercent,
      pricingCoverage,
      observationGapMs,
      confidence: fullEquivalentUsd === null
        ? 'usage-only'
        : observationOverrun
          ? 'low'
          : confidenceFor(current, observationGapMs, pricingCoverage),
      basis: 'quota-observation',
    });
  }
  return points.sort((left, right) => right.resetAt - left.resetAt).slice(0, 12);
}
