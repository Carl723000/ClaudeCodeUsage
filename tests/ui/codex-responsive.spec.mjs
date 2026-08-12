import { test, expect, openCodex } from './support/app.mjs';

const locales = ['en', 'de-DE', 'zh-TW', 'zh-CN', 'ja', 'ko', 'pt-BR', 'id'];
const viewports = [
  { width: 360, height: 800 },
  { width: 1280, height: 900 },
];

async function overflowAudit(page) {
  return page.evaluate(() => {
    const tolerance = 1;
    const descriptor = (element) => {
      const id = element.id ? `#${element.id}` : '';
      const classes = Array.from(element.classList || []).slice(0, 3).map((value) => `.${value}`).join('');
      return `${element.tagName.toLowerCase()}${id}${classes}`;
    };
    const visible = (element) => {
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };
    const illegal = Array.from(document.querySelectorAll('body *'))
      .filter((element) => visible(element) && element.scrollWidth > element.clientWidth + tolerance)
      .filter((element) => !element.matches('.sr-only'))
      .filter((element) => !element.closest('.codex-scroll-region'))
      .map((element) => ({
        element: descriptor(element),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
    return {
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      },
      body: {
        clientWidth: document.body.clientWidth,
        scrollWidth: document.body.scrollWidth,
      },
      illegal,
    };
  });
}

async function expectNoPageOverflow(page) {
  const audit = await overflowAudit(page);
  expect(audit.document.scrollWidth, audit).toBeLessThanOrEqual(audit.document.clientWidth + 1);
  expect(audit.body.scrollWidth, audit).toBeLessThanOrEqual(audit.body.clientWidth + 1);
  expect(audit.illegal).toEqual([]);
}

for (const locale of locales) {
  for (const viewport of viewports) {
    test(`${locale} has no page overflow at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await openCodex(page, { locale, ...viewport });
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expectNoPageOverflow(page);
    });
  }
}

for (const locale of ['en', 'zh-CN']) {
  test(`${locale} smoke covers every destination at 480x900`, async ({ page }) => {
    await openCodex(page, { locale, width: 480, height: 900 });

    await expect(page.locator('[data-codex-page="overview"]')).toBeVisible();
    await expectNoPageOverflow(page);

    await page.locator('[data-codex-page-button="explore"]').click();
    await page.locator('[data-codex-explore-view-button="sessions"]').click();
    await expect(page.locator('[data-codex-explore-panel="sessions"]')).toBeVisible();
    await expectNoPageOverflow(page);

    await page.locator('[data-codex-page-button="recommendations"]').click();
    await expect(page.locator('[data-codex-page="recommendations"]')).toBeVisible();
    await expectNoPageOverflow(page);

    await page.locator('[data-codex-header-action="settings"]').click();
    await expect(page.locator('[data-codex-page="settings"]')).toBeVisible();
    await expectNoPageOverflow(page);
  });
}

test('360px Sessions hides wide columns and keeps compact details usable', async ({ page }) => {
  await openCodex(page, { locale: 'en', width: 360, height: 800 });
  await page.locator('[data-codex-page-button="explore"]').click();
  await page.locator('[data-codex-explore-view-button="sessions"]').click();

  const firstRow = page.locator('[data-codex-thread-row]:visible').first();
  const details = firstRow.locator('.codex-mobile-details');
  const compact = firstRow.locator('.codex-compact-session-summary');
  await expect(page.locator('.codex-wide-only:visible')).toHaveCount(0);
  await expect(firstRow.locator('.name-cell')).toBeVisible();
  await expect(firstRow.locator('.codex-desktop-session-title')).toBeHidden();
  await expect(compact).toBeVisible();
  await expect(compact.locator('[data-codex-mobile-role]')).not.toHaveText('');
  await expect(compact.locator('[data-codex-mobile-project]')).not.toHaveText('');
  await expect(compact.locator('[data-codex-mobile-fresh]')).not.toHaveText('');
  await expect(compact.locator('[data-codex-mobile-time]')).not.toHaveText('');
  await expect(details).toBeVisible();
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
  await expect(details.locator('dl')).toBeVisible();
  expect(await details.locator('dt').count()).toBeGreaterThan(3);
  await expectNoPageOverflow(page);
});
