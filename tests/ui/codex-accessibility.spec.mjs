import AxeBuilder from '@axe-core/playwright';
import { test, expect, openCodex } from './support/app.mjs';

async function openSessions(page) {
  await page.locator('[data-codex-page-button="explore"]').click();
  await page.locator('[data-codex-explore-view-button="sessions"]').click();
}

async function seriousOrCriticalViolations(page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map(({ id, impact, nodes }) => ({
      id,
      impact,
      targets: nodes.map((node) => node.target),
    }));
}

for (const destination of ['overview', 'explore', 'recommendations']) {
  test(`${destination} has no serious or critical Axe violations`, async ({ page }) => {
    await openCodex(page, { locale: 'en' });
    if (destination !== 'overview') {
      await page.locator(`[data-codex-page-button="${destination}"]`).click();
    }

    expect(await seriousOrCriticalViolations(page)).toEqual([]);
  });
}

test('primary tabs use roving focus and activate on ArrowLeft/Right/Home/End', async ({ page }) => {
  await openCodex(page, { locale: 'en' });
  const overview = page.locator('[data-codex-page-button="overview"]');
  const explore = page.locator('[data-codex-page-button="explore"]');
  const recommendations = page.locator('[data-codex-page-button="recommendations"]');

  await overview.focus();
  await overview.press('ArrowRight');
  await expect(explore).toBeFocused();
  await expect(explore).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-codex-page="explore"]')).toBeVisible();

  await explore.press('End');
  await expect(recommendations).toBeFocused();
  await expect(recommendations).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-codex-page="recommendations"]')).toBeVisible();

  await recommendations.press('Home');
  await expect(overview).toBeFocused();
  await expect(overview).toHaveAttribute('aria-selected', 'true');

  await overview.press('ArrowLeft');
  await expect(recommendations).toBeFocused();
  await expect(recommendations).toHaveAttribute('aria-selected', 'true');
});

test('provider tabs use roving focus and activate on ArrowLeft/Right/Home/End', async ({ page }) => {
  await openCodex(page, { locale: 'en' });
  const claude = page.locator('#provider-tab-claude');
  const codex = page.locator('#provider-tab-codex');
  const compare = page.locator('#provider-tab-compare');

  await codex.focus();
  await codex.press('ArrowRight');
  await expect(compare).toBeFocused();
  await expect(compare).toHaveAttribute('aria-selected', 'true');

  await compare.press('Home');
  await expect(claude).toBeFocused();
  await expect(claude).toHaveAttribute('aria-selected', 'true');

  await claude.press('End');
  await expect(compare).toBeFocused();
  await expect(compare).toHaveAttribute('aria-selected', 'true');

  await compare.press('ArrowRight');
  await expect(claude).toBeFocused();
  await expect(claude).toHaveAttribute('aria-selected', 'true');

  expect(await page.evaluate(() => window.__ccuPostedMessages.map((message) => message.provider)))
    .toEqual(['compare', 'claude', 'compare', 'claude']);
});

test('segmented chart metric activates with Space and updates chart ARIA', async ({ page }) => {
  await openCodex(page, { locale: 'en' });
  const metricGroup = page.locator('.codex-overview-metric');
  const output = metricGroup.locator('[data-codex-chart-metric="output"]');
  const processed = metricGroup.locator('[data-codex-chart-metric="processed"]');
  const bar = page.locator('[data-codex-overview-panel="recent"] [data-codex-chart-bar]').first();

  await output.focus();
  await output.press('Space');

  await expect(output).toHaveAttribute('aria-pressed', 'true');
  await expect(processed).toHaveAttribute('aria-pressed', 'false');
  await expect(bar).toHaveAttribute('aria-label', /Output tokens/);
  await expect(bar).toHaveAttribute('title', /Output tokens/);
});

test('native sort button activates once with Enter and exposes aria-sort', async ({ page }) => {
  await openCodex(page, { locale: 'en' });
  await openSessions(page);
  const header = page.locator('[data-codex-sort-table="sessions"] th[data-codex-sort-key="fresh"]');
  const button = header.locator('button[data-codex-action="sort-sessions"]');

  await expect(button).toHaveAttribute('type', 'button');
  await button.focus();
  await button.press('Enter');
  await expect(header).toHaveAttribute('aria-sort', 'ascending');
});

test('recursive session disclosure activates with Space and hides all descendants', async ({ page }) => {
  await openCodex(page, { locale: 'en' });
  await openSessions(page);
  const lineage = await page.locator('[data-codex-thread-row]').evaluateAll((rows) => {
    const entries = rows.map((row) => ({
      key: row.getAttribute('data-codex-view-key'),
      parent: row.getAttribute('data-codex-parent-view-key'),
    }));
    const direct = entries.find((entry) => entry.parent && entries.some((item) => item.parent === entry.key));
    const root = direct && entries.find((entry) => entry.key === direct.parent);
    const grandchild = direct && entries.find((entry) => entry.parent === direct.key);
    return { root: root?.key, direct: direct?.key, grandchild: grandchild?.key };
  });
  expect(lineage).toMatchObject({
    root: expect.any(String),
    direct: expect.any(String),
    grandchild: expect.any(String),
  });
  const toggle = page.locator(`[data-codex-thread-row][data-codex-view-key="${lineage.root}"] [data-codex-action="toggle-thread-children"]`);

  await toggle.focus();
  await toggle.press('Space');

  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator(`[data-codex-thread-row][data-codex-view-key="${lineage.direct}"]`)).toBeHidden();
  await expect(page.locator(`[data-codex-thread-row][data-codex-view-key="${lineage.grandchild}"]`)).toBeHidden();
});

for (const key of ['Enter', 'Space']) {
  test(`chart date activates with ${key} and exposes the selected date through ARIA`, async ({ page }) => {
    await openCodex(page, { locale: 'en' });
    await page.locator('[data-codex-overview-scope="7d"]').click();
    const chartDate = page.locator('[data-codex-overview-panel="7d"] [data-codex-date="2026-07-20"]');

    await expect(chartDate).toHaveAttribute('type', 'button');
    await expect(chartDate).toHaveAttribute('aria-label', /2026-07-20/);
    await chartDate.focus();
    await chartDate.press(key);

    await expect(page.locator('[data-codex-page-button="explore"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-codex-explore-view-button="sessions"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-codex-filter-chips]')).toContainText('2026-07-20');
  });
}

test('session search is labelled and its result count is an atomic live region', async ({ page }) => {
  await openCodex(page, { locale: 'en' });
  await openSessions(page);
  const search = page.getByRole('searchbox', { name: 'Search sessions' });
  const count = page.locator('[data-codex-result-count]');

  await expect(search).toBeVisible();
  await expect(search).toHaveAttribute('id', 'codex-session-search');
  await expect(page.locator('label[for="codex-session-search"]')).toBeVisible();
  await expect(count).toHaveAttribute('aria-live', 'polite');
  await expect(count).toHaveAttribute('aria-atomic', 'true');

  await search.fill('__definitely_no_codex_session__');
  await expect(count).toHaveText('0');
});

test('chart has a textual screen-reader summary that follows the active metric', async ({ page }) => {
  await openCodex(page, { locale: 'en' });
  await page.locator('[data-codex-overview-scope="7d"]').click();
  const panel = page.locator('[data-codex-overview-panel="7d"]');
  const summary = panel.locator('[data-codex-chart-summary]');

  await expect(summary).toBeAttached();
  await expect(summary).toContainText('Processed tokens');
  await page.locator('.codex-overview-metric [data-codex-chart-metric="output"]').click();
  await expect(summary).toContainText('Output tokens');
  await expect(summary).toContainText('2026-07-20');
});
