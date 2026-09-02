import AxeBuilder from '@axe-core/playwright';
import { test, expect, openCompare } from './support/app.mjs';

test('Compare opens with the combined Claude + Codex heatmap and privacy-bounded share card', async ({ page }) => {
  await openCompare(page, { fixture: 'combined-heatmap', locale: 'en' });

  const panel = page.locator('.combined-heatmap-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Combined activity heatmap and share card' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Live preview' })).toBeVisible();
  await expect(page.locator('#combinedHeatmapPreview svg')).toHaveAttribute('role', 'img');
  await expect(page.getByRole('radio', { name: 'Academic Violet' })).toBeChecked();
  const markdown = page.locator('#combinedHeatmapMarkdown');
  await expect(markdown).toHaveAttribute('aria-label', 'README / Markdown snippet');
  await expect(markdown).toHaveValue(
    /^!\[Claude \+ Codex local activity\]\(claude-codex-activity-year-\d{4}-\d{2}-\d{2}\.svg\)$/,
  );
  await page.locator('.combined-output-panel summary').click();
  await expect(markdown).toBeVisible();
  const fonts = await markdown.evaluate((element) => ({
    markdown: getComputedStyle(element).fontFamily,
    body: getComputedStyle(document.body).fontFamily,
  }));
  expect(fonts.markdown).toContain('monospace');
  expect(fonts.markdown).not.toBe(fonts.body);

  const tooltips = await page.locator('#combinedHeatmapPreview svg rect title').allTextContents();
  expect(tooltips.some((value) =>
    value.includes('Claude:') && value.includes('Codex:') && value.includes('Combined:'),
  )).toBe(true);
  await expect(page.locator('#combinedHeatmapPrivacyPreview')).toContainText('accounts, projects, thread titles, local paths, and log content');
  await expect(panel).toContainText('not productivity, subscription billing, or provider capability equivalence');
  const desktopPreviewGeometry = await page.locator('.combined-heatmap-preview').evaluate((preview) => {
    const svg = preview.querySelector('svg');
    const more = [...preview.querySelectorAll('text')].find((element) => element.textContent === 'More');
    if (!svg || !more) {
      return null;
    }
    const previewRect = preview.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const moreRect = more.getBoundingClientRect();
    return {
      previewWidth: previewRect.width,
      svgWidth: svgRect.width,
      previewRight: previewRect.right,
      svgRight: svgRect.right,
      moreRight: moreRect.right,
      overflow: preview.scrollWidth - preview.clientWidth,
    };
  });
  expect(desktopPreviewGeometry).not.toBeNull();
  expect(desktopPreviewGeometry.overflow).toBeLessThanOrEqual(1);
  expect(desktopPreviewGeometry.svgWidth).toBeGreaterThanOrEqual(desktopPreviewGeometry.previewWidth * 0.95);
  expect(desktopPreviewGeometry.svgRight).toBeLessThanOrEqual(desktopPreviewGeometry.previewRight);
  expect(desktopPreviewGeometry.moreRight).toBeLessThanOrEqual(desktopPreviewGeometry.previewRight);
  const verticalLayout = await panel.evaluate((element) => {
    const preview = element.querySelector('.combined-preview-column');
    const settings = element.querySelector('.combined-config-card');
    if (!preview || !settings) return null;
    const previewRect = preview.getBoundingClientRect();
    const settingsRect = settings.getBoundingClientRect();
    return {
      previewBottom: previewRect.bottom,
      settingsTop: settingsRect.top,
      settingsWidth: settingsRect.width,
      panelWidth: element.getBoundingClientRect().width,
    };
  });
  expect(verticalLayout).not.toBeNull();
  expect(verticalLayout.settingsTop).toBeGreaterThanOrEqual(verticalLayout.previewBottom);
  expect(verticalLayout.settingsWidth).toBeLessThanOrEqual(verticalLayout.panelWidth);
});

test('sharing workspace is on by default and can be hidden without removing Compare data', async ({ page }) => {
  await openCompare(page, { fixture: 'combined-heatmap', locale: 'en' });
  await expect(page.locator('.combined-heatmap-panel')).toBeVisible();

  await openCompare(page, {
    fixture: 'combined-heatmap',
    locale: 'en',
    shareStudio: false,
  });
  await expect(page.locator('.combined-heatmap-panel')).toHaveCount(0);
  await expect(page.locator('.usage-summary')).toBeVisible();
  await expect(page.locator('.weekly-value-details')).toHaveCount(2);
});

test('combined share preferences stay local and every export action is explicit', async ({ page }) => {
  await openCompare(page, { fixture: 'combined-heatmap', locale: 'en' });
  expect(await page.evaluate(() => window.__ccuPostedMessages.filter(
    (message) => message.command !== 'localDataClientReady',
  ))).toEqual([]);

  await page.locator('#combinedHeatmapTitle').fill('My local activity');
  await page.locator('#combinedHeatmapRange').selectOption('30d');
  await page.getByRole('radio', { name: 'Custom' }).check();
  await page.locator('#combinedHeatmapCustomAccent').fill('#0f766e');
  await page.locator('#combinedHeatmapPrivacy').uncheck();
  await expect(page.locator('#combinedHeatmapPrivacyPreview')).toBeHidden();
  await page.getByRole('button', { name: 'Update preview' }).click();
  await page.getByRole('button', { name: 'Export SVG…' }).click();
  await page.getByRole('button', { name: 'Copy Markdown' }).click();

  const state = await page.evaluate(() => ({
    title: localStorage.getItem('ccu.combinedHeatmap.title'),
    range: localStorage.getItem('ccu.combinedHeatmap.range'),
    privacy: localStorage.getItem('ccu.combinedHeatmap.privacyPreview'),
    palette: localStorage.getItem('ccu.combinedHeatmap.palette'),
    customAccent: localStorage.getItem('ccu.combinedHeatmap.customAccent'),
    messages: window.__ccuPostedMessages.filter(
      (message) => message.command !== 'localDataClientReady',
    ),
  }));
  expect(state).toMatchObject({
    title: 'My local activity', range: '30d', privacy: 'false',
    palette: 'custom', customAccent: '#0f766e',
  });
  expect(state.messages).toEqual([
    { command: 'previewCombinedHeatmap', title: 'My local activity', range: '30d', palette: 'custom', customAccent: '#0f766e' },
    { command: 'exportCombinedHeatmap', title: 'My local activity', range: '30d', palette: 'custom', customAccent: '#0f766e' },
    { command: 'copyCombinedHeatmapMarkdown', title: 'My local activity', range: '30d', palette: 'custom', customAccent: '#0f766e' },
  ]);
  expect(state.messages.some((message) => /publish/i.test(message.command))).toBe(false);

  await page.getByRole('button', { name: 'Reset sharing preferences' }).click();
  await expect(page.locator('#combinedHeatmapTitle')).toHaveValue('Claude + Codex local activity');
  await expect(page.locator('#combinedHeatmapRange')).toHaveValue('year');
  await expect(page.getByRole('radio', { name: 'Academic Violet' })).toBeChecked();
  await expect(page.locator('#combinedHeatmapPrivacy')).toBeChecked();
  const reset = await page.evaluate(() => ({
    title: localStorage.getItem('ccu.combinedHeatmap.title'),
    range: localStorage.getItem('ccu.combinedHeatmap.range'),
    privacy: localStorage.getItem('ccu.combinedHeatmap.privacyPreview'),
    palette: localStorage.getItem('ccu.combinedHeatmap.palette'),
    customAccent: localStorage.getItem('ccu.combinedHeatmap.customAccent'),
    messages: window.__ccuPostedMessages.slice(-2),
  }));
  expect(reset).toEqual({
    title: null,
    range: null,
    privacy: null,
    palette: null,
    customAccent: null,
    messages: [
      { command: 'previewCombinedHeatmap', title: 'Claude + Codex local activity', range: 'year', palette: 'academicViolet', customAccent: '#4f2f87' },
      { command: 'resetCombinedHeatmapPreferences' },
    ],
  });
});

for (const theme of ['light', 'dark']) {
  test(`combined heatmap controls and preview are accessible in ${theme} theme`, async ({ page }) => {
    await openCompare(page, { fixture: 'combined-heatmap', locale: 'zh-CN', theme });
    await expect(page.getByLabel('分享标题')).toBeVisible();
    await expect(page.getByLabel('时间范围')).toBeVisible();
    await expect(page.getByRole('group', { name: '热力图配色' })).toBeVisible();
    await expect(page.getByLabel('显示隐私预览')).toBeChecked();
    await page.locator('.combined-output-panel').evaluate((element) => { element.open = true; });
    await expect(page.getByLabel('README / Markdown 引用片段')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include('.combined-heatmap-panel')
      // Chromium/axe cannot resolve overlapping SVG primitives reliably.
      // Export-card text/background pairs have deterministic contrast tests
      // in combinedHeatmap.test.ts; Axe owns the surrounding HTML controls.
      .exclude('#combinedHeatmapPreview svg')
      .analyze();
    expect(results.violations).toEqual([]);
    expect(results.incomplete.filter((item) => item.id === 'color-contrast')).toEqual([]);
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
