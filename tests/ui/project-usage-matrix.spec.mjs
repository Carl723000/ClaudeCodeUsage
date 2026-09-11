import { test, expect, openClaude, openCodex } from './support/app.mjs';

async function openProjects(page) {
  await page.locator('#tab-projects').click();
  await expect(page.locator('#projects')).toBeVisible();
}

async function patchCurrentDashboard(page, provider) {
  const response = await page.context().request.get(page.url());
  const documentText = await response.text();
  await page.evaluate(({ nextProvider, documentText }) => {
    const nextDocument = new DOMParser().parseFromString(documentText, 'text/html');
    const nextPanel = nextDocument.getElementById('provider-panel');
    if (!nextPanel) throw new Error('Fixture did not render a provider panel');
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        command: 'dashboardDataPatch',
        provider: nextProvider,
        tab: 'projects',
        revision: 1,
        html: nextPanel.innerHTML,
        claudeLast30HoursByDay: {},
      },
    }));
  }, { nextProvider: provider, documentText });
}

test('Claude Projects starts with the bounded 30-day Token heatmap', async ({ page }) => {
  await openClaude(page);
  await openProjects(page);

  const matrix = page.locator('#projects [data-project-matrix="claude"]');
  await expect(matrix).toBeVisible();
  await expect(matrix).toContainText('Project activity');
  await expect(matrix).toContainText('Token activity only');
  await expect(matrix.locator('[data-metric="cost"], .cost-cell, .quota-card')).toHaveCount(0);
  await expect(matrix.locator('[data-project-matrix-range="30"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(matrix.locator('[data-project-matrix-view="heatmap"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(matrix.locator('[data-project-matrix-range-panel="30"]')).toBeVisible();
  await expect(matrix.locator('[data-project-matrix-range-panel="90"]')).toBeHidden();
  await expect(matrix.locator('[data-project-matrix-range-panel="30"] [data-project-matrix-heatmap]')).toBeVisible();
  await expect(matrix.locator('[data-project-matrix-range-panel="30"] [data-project-matrix-trend]')).toBeHidden();
  await expect(matrix.locator('[data-project-matrix-range-panel="30"] .project-matrix-row:not([hidden])')).toHaveCount(12);
  await expect(matrix.locator('.project-matrix-cell')).toHaveCount(16 * 30 + 16 * 90);
});

test('range, view, and expanded rows persist separately for Claude Projects', async ({ page }) => {
  await openClaude(page);
  await openProjects(page);
  const matrix = page.locator('#projects [data-project-matrix="claude"]');

  await matrix.locator('[data-project-matrix-range="90"]').click();
  await matrix.locator('[data-project-matrix-view="trend"]').click();
  await matrix.locator('[data-project-matrix-expand]').click();
  await expect(matrix.locator('[data-project-matrix-range-panel="90"]')).toBeVisible();
  await expect(matrix.locator('[data-project-matrix-range-panel="90"] [data-project-matrix-trend]')).toBeVisible();
  await expect(matrix.locator('[data-project-matrix-range-panel="90"] .project-matrix-row:not([hidden])')).toHaveCount(16);
  await expect(matrix.locator('[data-project-matrix-range-panel="90"] .project-matrix-trend-series')).toHaveCount(6);
  await expect(matrix).toContainText('Other projects');

  await page.reload({ waitUntil: 'load' });
  await openProjects(page);
  const restored = page.locator('#projects [data-project-matrix="claude"]');
  await expect(restored.locator('[data-project-matrix-range="90"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(restored.locator('[data-project-matrix-view="trend"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(restored.locator('[data-project-matrix-range-panel="90"] .project-matrix-row:not([hidden])')).toHaveCount(16);
});

test('Codex Projects uses its indexed project-day projection and exact partial-coverage tooltips', async ({ page }) => {
  await openCodex(page);
  await openProjects(page);

  const matrix = page.locator('#projects [data-project-matrix="codex"]');
  await expect(matrix).toBeVisible();
  await expect(matrix).toContainText('Indexed subtotal');
  await expect(matrix).toContainText('ClaudeCodeUsage');
  await expect(matrix.locator('[data-project-matrix-range-panel="30"] .project-matrix-cell[data-day="2026-07-20"]')).toHaveCount(3);
  await expect(matrix.locator('[data-project-matrix-range-panel="30"] .project-matrix-cell[title*="partial coverage"]').first()).toBeAttached();
});

test('a live dashboard patch preserves the active project range, view, and keyboard focus', async ({ page }) => {
  await openCodex(page);
  await openProjects(page);
  const matrix = page.locator('#projects [data-project-matrix="codex"]');
  await matrix.locator('[data-project-matrix-range="90"]').click();
  const trend = matrix.locator('[data-project-matrix-view="trend"]');
  await trend.click();
  await trend.focus();

  await patchCurrentDashboard(page, 'codex');

  const restored = page.locator('#projects [data-project-matrix="codex"]');
  await expect(restored.locator('[data-project-matrix-range="90"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(restored.locator('[data-project-matrix-view="trend"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(restored.locator('[data-project-matrix-view="trend"]')).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.__ccuPostedMessages.at(-1))).toEqual({
    command: 'dashboardDataPatchAck',
    revision: 1,
    ok: true,
  });
});

test('Project matrix stays inside a local scroller on a narrow page', async ({ page }) => {
  await openClaude(page, { width: 360, height: 800 });
  await openProjects(page);

  const geometry = await page.locator('[data-project-matrix="claude"] [data-project-matrix-range-panel="30"] .project-matrix-scroll').evaluate((scroller) => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    clientWidth: scroller.clientWidth,
    scrollWidth: scroller.scrollWidth,
  }));
  expect(geometry.documentWidth, geometry).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.bodyWidth, geometry).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.scrollWidth, geometry).toBeGreaterThan(geometry.clientWidth);
});

test('the shared presentation setting can hide the project matrix for either provider', async ({ page }) => {
  await openClaude(page, { projectMatrix: false });
  await openProjects(page);
  await expect(page.locator('[data-project-matrix]')).toHaveCount(0);

  await openCodex(page, { projectMatrix: false });
  await openProjects(page);
  await expect(page.locator('[data-project-matrix]')).toHaveCount(0);
});
