import AxeBuilder from '@axe-core/playwright';
import { test, expect, openCompare } from './support/app.mjs';

test('Compare opens with the combined Claude + Codex heatmap and privacy-bounded share card', async ({ page }) => {
  await openCompare(page, { fixture: 'combined-heatmap', locale: 'en' });

  const panel = page.locator('.combined-heatmap-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Combined activity heatmap and share card' })).toBeVisible();
  await expect(page.locator('#combinedHeatmapPreview svg')).toHaveAttribute('role', 'img');
  await expect(page.locator('#combinedHeatmapMarkdown')).toHaveValue(
    /^!\[Claude \+ Codex local activity\]\(claude-codex-activity-year-\d{4}-\d{2}-\d{2}\.svg\)$/,
  );

  const tooltips = await page.locator('#combinedHeatmapPreview svg rect title').allTextContents();
  expect(tooltips.some((value) =>
    value.includes('Claude:') && value.includes('Codex:') && value.includes('Combined:'),
  )).toBe(true);
  await expect(page.locator('#combinedHeatmapPrivacyPreview')).toContainText('accounts, projects, thread titles, local paths, and log content');
  await expect(panel).toContainText('not productivity, subscription billing, or provider capability equivalence');
});

test('combined share preferences stay local and every export action is explicit', async ({ page }) => {
  await openCompare(page, { fixture: 'combined-heatmap', locale: 'en' });
  expect(await page.evaluate(() => window.__ccuPostedMessages.filter(
    (message) => message.command !== 'localDataClientReady',
  ))).toEqual([]);

  await page.locator('#combinedHeatmapTitle').fill('My local activity');
  await page.locator('#combinedHeatmapRange').selectOption('30d');
  await page.locator('#combinedHeatmapPrivacy').uncheck();
  await expect(page.locator('#combinedHeatmapPrivacyPreview')).toBeHidden();
  await page.getByRole('button', { name: 'Update preview' }).click();
  await page.getByRole('button', { name: 'Export SVG…' }).click();
  await page.getByRole('button', { name: 'Copy Markdown' }).click();

  const state = await page.evaluate(() => ({
    title: localStorage.getItem('ccu.combinedHeatmap.title'),
    range: localStorage.getItem('ccu.combinedHeatmap.range'),
    privacy: localStorage.getItem('ccu.combinedHeatmap.privacyPreview'),
    messages: window.__ccuPostedMessages.filter(
      (message) => message.command !== 'localDataClientReady',
    ),
  }));
  expect(state).toMatchObject({ title: 'My local activity', range: '30d', privacy: 'false' });
  expect(state.messages).toEqual([
    { command: 'previewCombinedHeatmap', title: 'My local activity', range: '30d' },
    { command: 'exportCombinedHeatmap', title: 'My local activity', range: '30d' },
    { command: 'copyCombinedHeatmapMarkdown', title: 'My local activity', range: '30d' },
  ]);
  expect(state.messages.some((message) => /publish/i.test(message.command))).toBe(false);

  await page.getByRole('button', { name: 'Reset sharing preferences' }).click();
  await expect(page.locator('#combinedHeatmapTitle')).toHaveValue('Claude + Codex local activity');
  await expect(page.locator('#combinedHeatmapRange')).toHaveValue('year');
  await expect(page.locator('#combinedHeatmapPrivacy')).toBeChecked();
  const reset = await page.evaluate(() => ({
    title: localStorage.getItem('ccu.combinedHeatmap.title'),
    range: localStorage.getItem('ccu.combinedHeatmap.range'),
    privacy: localStorage.getItem('ccu.combinedHeatmap.privacyPreview'),
    messages: window.__ccuPostedMessages.slice(-2),
  }));
  expect(reset).toEqual({
    title: null,
    range: null,
    privacy: null,
    messages: [
      { command: 'previewCombinedHeatmap', title: 'Claude + Codex local activity', range: 'year' },
      { command: 'resetCombinedHeatmapPreferences' },
    ],
  });
});

for (const theme of ['light', 'dark']) {
  test(`combined heatmap controls and preview are accessible in ${theme} theme`, async ({ page }) => {
    await openCompare(page, { fixture: 'combined-heatmap', locale: 'zh-CN', theme });
    await expect(page.getByLabel('分享标题')).toBeVisible();
    await expect(page.getByLabel('时间范围')).toBeVisible();
    await expect(page.getByLabel('显示隐私预览')).toBeChecked();
    const results = await new AxeBuilder({ page })
      .include('.combined-heatmap-panel')
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test('combined heatmap remains usable at a 360px webview width', async ({ page }) => {
  await openCompare(page, { fixture: 'combined-heatmap', locale: 'zh-CN', width: 360, height: 900 });
  await expect(page.locator('.combined-heatmap-controls')).toHaveCSS('grid-template-columns', /\d+(?:\.\d+)?px/);
  const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(pageOverflow).toBeLessThanOrEqual(1);
  const previewOverflow = await page.locator('.combined-heatmap-preview').evaluate((node) => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
  }));
  expect(previewOverflow.scrollWidth).toBeGreaterThan(previewOverflow.clientWidth);
});
