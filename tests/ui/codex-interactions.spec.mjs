import { test, expect, openCodex } from './support/app.mjs';

test('production Codex document loads through the HTTP harness', async ({ page }) => {
  await openCodex(page, { locale: 'en' });
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('.codex-view')).toBeVisible();
  await expect(page.locator('.codex-header')).toBeVisible();
  await expect(page.locator('#provider-tab-claude')).toBeVisible();
  await expect(page.locator('#provider-tab-codex')).toBeVisible();
  await expect(page.locator('#provider-tab-compare')).toBeVisible();
  await expect(page.locator('#codex-open-settings')).toBeVisible();
  await expect(page.locator('[data-codex-page="settings"]')).toContainText('Settings');
  await expect(page.locator('.codex-limit-card').filter({ hasText: '5-hour window' }))
    .toContainText('in 1 hour');
  expect(await page.locator('style').first().textContent()).toContain('[data-codex-root]');
  expect(await page.locator('script').textContent()).toContain("var pages = ['overview'");
});
