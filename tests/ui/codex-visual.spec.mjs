import { test, expect, openCodex } from './support/app.mjs';

async function screenshot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.container')).toHaveScreenshot(name);
}

test('Overview desktop light', async ({ page }) => {
  await openCodex(page);
  await screenshot(page, 'codex-overview-light-1280.png');
});

test('Explore desktop light', async ({ page }) => {
  await openCodex(page);
  await page.getByRole('tab', { name: 'Explore' }).click();
  await screenshot(page, 'codex-explore-light-1280.png');
});

test('Recommendations desktop light', async ({ page }) => {
  await openCodex(page);
  await page.getByRole('tab', { name: 'Recommendations' }).click();
  await screenshot(page, 'codex-recommendations-light-1280.png');
});

test('Overview desktop dark', async ({ page }) => {
  await openCodex(page, { theme: 'dark' });
  await screenshot(page, 'codex-overview-dark-1280.png');
});

test('Overview mobile light', async ({ page }) => {
  await openCodex(page, { width: 360, height: 800 });
  await screenshot(page, 'codex-overview-light-360.png');
});

test('Sessions mobile light', async ({ page }) => {
  await openCodex(page, { width: 360, height: 800 });
  await page.getByRole('tab', { name: 'Explore' }).click();
  await page.getByRole('tab', { name: 'Sessions' }).click();
  await screenshot(page, 'codex-sessions-light-360.png');
});
