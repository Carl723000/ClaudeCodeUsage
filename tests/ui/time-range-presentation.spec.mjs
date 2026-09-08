import { test, expect, openClaude, openCodex } from './support/app.mjs';

const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));
const hourLabels = hours.map((hour) => `${hour}:00`);
const rolling30Start = '2026-06-21';
const rolling30End = '2026-07-20';

test('Claude presents exact Today and rolling-30 ranges without dead zero-day drilldowns', async ({ page }) => {
  await openClaude(page);

  const today = page.locator('#today [data-hourly-overview]');
  await expect(today.locator('.hc-col[data-hour]')).toHaveCount(24);
  await expect(today.locator('.daily-table tbody tr[data-hour]')).toHaveCount(24);
  expect(await today.locator('.hc-col[data-hour]').evaluateAll((columns) =>
    columns.map((column) => column.getAttribute('data-hour')),
  )).toEqual(hourLabels);
  await expect(today.locator('.daily-table tbody tr[data-hour="00:00"] .cost-cell'))
    .toHaveText('$0.00');
  await expect(today.locator('.daily-table tbody tr[data-hour="18:00"] .cost-cell'))
    .not.toHaveText('$0.00');

  await page.locator('#tab-month').click();
  const month = page.locator('#month [data-claude-last30-daily]');
  await expect(month.locator('#dailyChart .hc-col[data-date]')).toHaveCount(30);
  await expect(month.locator(':scope > .daily-table-container > .daily-table > tbody > tr.daily-row'))
    .toHaveCount(30);
  const dates = await month.locator('#dailyChart .hc-col[data-date]').evaluateAll((columns) =>
    columns.map((column) => column.getAttribute('data-date')),
  );
  expect(dates[0]).toBe(rolling30Start);
  expect(dates[29]).toBe(rolling30End);

  const zeroBar = month.locator(`#dailyChart .hc-col[data-date="${rolling30Start}"] .chart-bar`);
  await expect(zeroBar).not.toHaveClass(/clickable/);
  await expect(month.locator(`tr.daily-row[data-date="${rolling30Start}"] .detail-button`))
    .toHaveCount(0);
  await expect(month.locator(`tr.hourly-detail-row[data-date="${rolling30Start}"]`))
    .toHaveCount(0);
  await expect(month.locator('tr.daily-row[data-date="2026-07-19"] .detail-button'))
    .toHaveCount(1);
});

test('Codex presents 24 complete Today hours and distinguishes zero usage from unpriced usage', async ({ page }) => {
  await openCodex(page);

  const today = page.locator('#today [data-codex-today-hourly]');
  await expect(today.locator('.hc-col[data-hour]')).toHaveCount(24);
  await expect(today.locator('.daily-table tbody tr[data-hour]')).toHaveCount(24);
  expect(await today.locator('.hc-col[data-hour]').evaluateAll((columns) =>
    columns.map((column) => column.getAttribute('data-hour')),
  )).toEqual(hours);
  await expect(today.locator('.daily-table tbody tr[data-hour="00"] .cost-cell'))
    .toHaveText('$0.00');
  await expect(today.locator('.hc-col[data-hour="00"] .hc-barval')).toHaveText('$0.00');

  await page.locator('#tab-month').click();
  const month = page.locator('#month [data-codex-last30-daily]');
  await expect(month.locator(':scope > .chart-content .hc-col[data-date]')).toHaveCount(30);
  await expect(month.locator(':scope > .daily-table-container > .daily-table > tbody > tr.daily-row'))
    .toHaveCount(30);
  await expect(month.locator(`tr.daily-row[data-date="${rolling30Start}"] .cost-cell`))
    .toHaveText('$0.00');
  await expect(month.locator(':scope > .chart-content .hc-col').first())
    .toHaveAttribute('data-date', rolling30Start);
  await expect(month.locator(':scope > .chart-content .hc-col').last())
    .toHaveAttribute('data-date', rolling30End);
});
