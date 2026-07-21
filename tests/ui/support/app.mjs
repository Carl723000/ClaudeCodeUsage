import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      window.__ccuPostedMessages = [];
      window.acquireVsCodeApi = () => ({
        getState: () => {
          const raw = localStorage.getItem('__ccu-vscode-state');
          return raw ? JSON.parse(raw) : undefined;
        },
        setState: (value) => {
          localStorage.setItem('__ccu-vscode-state', JSON.stringify(value));
        },
        postMessage: (value) => {
          window.__ccuPostedMessages.push(structuredClone(value));
          return Promise.resolve(true);
        },
      });
    });
    await page.clock.install({ time: new Date('2026-07-20T12:00:00.000Z') });
    await use(page);
  },
});

export { expect };

export async function openCodex(
  page,
  { locale = 'en', theme = 'light', fixture = 'default', width = 1280, height = 900 } = {},
) {
  await page.setViewportSize({ width, height });
  await page.goto(
    `http://127.0.0.1:4173/?locale=${encodeURIComponent(locale)}&theme=${theme}&fixture=${encodeURIComponent(fixture)}`,
    { waitUntil: 'load' },
  );
  await page.locator('.codex-view').waitFor();
}
