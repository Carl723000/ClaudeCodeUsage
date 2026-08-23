import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  appendWeeklyQuotaObservations,
  buildWeeklyUsageHistory,
  buildWeeklyValueTrend,
  equivalentUsageFromProviderTokens,
  mergeWeeklyValuePoints,
  summarizeEquivalentUsage,
  WeeklyEquivalentUsage,
  WeeklyQuotaObservation,
} from '../weeklyValue';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const RESET = Date.parse('2026-08-21T12:00:00.000Z');

function observation(overrides: Partial<WeeklyQuotaObservation> = {}): WeeklyQuotaObservation {
  return {
    provider: 'codex',
    seriesKey: 'codex',
    observedAt: RESET - HOUR,
    resetAt: RESET,
    usedPercent: 75,
    ...overrides,
  };
}

function usage(
  equivalentUsd: number,
  timestamp: number,
  sourceKey?: string,
): WeeklyEquivalentUsage {
  return {
    timestamp,
    equivalentUsd,
    pricedTokens: 1_000,
    totalTokens: 1_000,
    sourceKey,
  };
}

test('completed reset window reports used, inferred full, and unused API-equivalent value', () => {
  const points = buildWeeklyValueTrend({
    observations: [observation()],
    usage: [
      usage(45, RESET - 2 * HOUR),
      usage(5, RESET - 30 * 60 * 1000),
    ],
  }, RESET + HOUR);

  assert.equal(points.length, 1);
  assert.equal(points[0].usedEquivalentUsd, 50);
  assert.equal(points[0].fullEquivalentUsd, 60);
  assert.equal(points[0].unusedEquivalentUsd, 10);
  assert.equal(points[0].utilizationPercent, 75);
  assert.equal(points[0].confidence, 'high');
});

test('current window is provisional and never presents unused allowance as final', () => {
  const points = buildWeeklyValueTrend({
    observations: [observation({ resetAt: RESET + DAY, observedAt: RESET, usedPercent: 50 })],
    usage: [usage(20, RESET - HOUR)],
  }, RESET + HOUR);

  assert.equal(points[0].current, true);
  assert.equal(points[0].fullEquivalentUsd, 40);
  assert.equal(points[0].unusedEquivalentUsd, null);
});

test('usage observed after a stale quota sample cannot exceed the displayed full allowance', () => {
  const points = buildWeeklyValueTrend({
    observations: [observation({ usedPercent: 50 })],
    usage: [
      usage(20, RESET - 2 * HOUR),
      usage(25, RESET - 30 * 60 * 1000),
    ],
  }, RESET + HOUR);

  assert.equal(points[0].usedEquivalentUsd, 45);
  assert.equal(points[0].fullEquivalentUsd, 45);
  assert.equal(points[0].unusedEquivalentUsd, 0);
  assert.equal(points[0].confidence, 'low');
});

test('tiny utilization and poor price coverage do not manufacture a full allowance value', () => {
  const lowUtilization = buildWeeklyValueTrend({
    observations: [observation({ usedPercent: 2 })],
    usage: [usage(20, RESET - 2 * HOUR)],
  }, RESET + HOUR);
  assert.equal(lowUtilization[0].fullEquivalentUsd, null);
  assert.equal(lowUtilization[0].confidence, 'usage-only');

  const partialPricing = buildWeeklyValueTrend({
    observations: [observation()],
    usage: [{
      timestamp: RESET - 2 * HOUR,
      equivalentUsd: 20,
      pricedTokens: 700,
      totalTokens: 1_000,
    }],
  }, RESET + HOUR);
  assert.equal(partialPricing[0].fullEquivalentUsd, null);
});

test('source keys keep overlapping Codex account windows from sharing usage', () => {
  const points = buildWeeklyValueTrend({
    observations: [
      observation({ resetAt: RESET, sourceKey: 'account-a-file', usedPercent: 50 }),
      observation({ resetAt: RESET + DAY, observedAt: RESET, sourceKey: 'account-b-file', usedPercent: 25 }),
    ],
    usage: [
      usage(40, RESET - 2 * HOUR, 'account-a-file'),
      usage(10, RESET - 2 * HOUR, 'account-b-file'),
    ],
  }, RESET + 2 * DAY);

  const accountA = points.find((point) => point.resetAt === RESET);
  const accountB = points.find((point) => point.resetAt === RESET + DAY);
  assert.equal(accountA?.usedEquivalentUsd, 40);
  assert.equal(accountB?.usedEquivalentUsd, 10);
});

test('quota history keeps the latest observation for each percentage step', () => {
  const compacted = appendWeeklyQuotaObservations([
    observation({ observedAt: RESET - 3 * HOUR }),
  ], [
    observation({ observedAt: RESET - HOUR }),
    observation({ observedAt: RESET - 30 * 60 * 1000, usedPercent: 80 }),
  ]);
  assert.equal(compacted.length, 2);
  assert.equal(compacted[0].observedAt, RESET - HOUR);
  assert.equal(compacted[1].usedPercent, 80);
});

test('known Codex models use exact current API prices and unknown models stay unpriced', () => {
  const tokens = {
    inputTotal: 2_000_000,
    cachedInput: 1_000_000,
    outputTotal: 1_000_000,
  };
  const sol = equivalentUsageFromProviderTokens(RESET, 'gpt-5.6-sol', tokens);
  // 1M uncached * $5 + 1M cached * $0.50 + 1M output * $30.
  assert.equal(sol.equivalentUsd, 35.5);
  assert.equal(sol.pricedTokens, 3_000_000);

  const unknown = equivalentUsageFromProviderTokens(RESET, 'codex-auto-review', tokens);
  assert.equal(unknown.equivalentUsd, 0);
  assert.equal(unknown.pricedTokens, 0);
  assert.equal(unknown.totalTokens, 3_000_000);

  const summary = summarizeEquivalentUsage([sol, unknown]);
  assert.equal(summary.equivalentUsd, 35.5);
  assert.equal(summary.pricedTokens, 3_000_000);
  assert.equal(summary.totalTokens, 6_000_000);
  assert.equal(summary.pricingCoverage, 0.5);

  const unattributedRemainder = summarizeEquivalentUsage([sol], 6_000_000);
  assert.equal(unattributedRemainder.equivalentUsd, 35.5);
  assert.equal(unattributedRemainder.totalTokens, 6_000_000);
  assert.equal(unattributedRemainder.pricingCoverage, 0.5);
});

test('historical token logs still produce usage-only weekly values without quota observations', () => {
  const points = buildWeeklyUsageHistory('claude', [
    usage(12, Date.parse('2026-08-03T12:00:00.000Z')),
    usage(8, Date.parse('2026-08-04T12:00:00.000Z')),
    usage(30, Date.parse('2026-08-11T12:00:00.000Z')),
  ], {
    now: Date.parse('2026-08-22T12:00:00.000Z'),
  });

  assert.equal(points.length, 2);
  assert.deepEqual(
    points.map((point) => point.usedEquivalentUsd).sort((left, right) => left - right),
    [20, 30],
  );
  assert.ok(points.every((point) => point.fullEquivalentUsd === null));
  assert.ok(points.every((point) => point.unusedEquivalentUsd === null));
  assert.ok(points.every((point) => point.utilizationPercent === null));
  assert.ok(points.every((point) => point.confidence === 'usage-only'));
  assert.ok(points.every((point) => point.basis === 'calendar-usage'));
});

test('quota observations replace the matching fallback week without hiding older usage history', () => {
  const rows = [
    usage(10, RESET - 8 * DAY),
    usage(40, RESET - 2 * HOUR),
  ];
  const observed = buildWeeklyValueTrend({
    observations: [observation({ usedPercent: 50 })],
    usage: rows,
  }, RESET + HOUR);
  const history = buildWeeklyUsageHistory('codex', rows, {
    now: RESET + HOUR,
    anchorResetAt: RESET,
  });
  const merged = mergeWeeklyValuePoints(observed, history);

  assert.equal(merged.length, 2);
  assert.equal(merged[0].resetAt, RESET);
  assert.equal(merged[0].basis, 'quota-observation');
  assert.equal(merged[0].fullEquivalentUsd, 80);
  assert.equal(merged[1].resetAt, RESET - 7 * DAY);
  assert.equal(merged[1].basis, 'reset-aligned-usage');
  assert.equal(merged[1].fullEquivalentUsd, null);
});
