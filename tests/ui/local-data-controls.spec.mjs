import { test, expect, openCodex } from './support/app.mjs';

test('Settings/Data exposes every inventory and clearing route with value-free client metadata', async ({ page }) => {
  await openCodex(page);
  await page.locator('#tab-settings').click();

  await expect(page.locator('#localDataTitle')).toHaveText('Local data and privacy controls');
  await expect(page.locator('.local-data-actions button')).toHaveCount(7);
  await expect(page.locator('#localDataQuotaScope')).toBeVisible();

  await page.evaluate(() => {
    localStorage.setItem('ccu.activeTab', 'settings');
    localStorage.setItem('ccu.sessionFilter', 'all');
    localStorage.setItem('ccu.combinedHeatmap.range', '90d');
    localStorage.setItem('unrelated-private-canary', '/Users/private/account');
    const api = acquireVsCodeApi();
    api.setState({ openDetails: ['synthetic'], scrollPositions: { settings: 10 } });
    window.requestLocalDataInventory();
  });
  const request = await page.evaluate(() => window.__ccuPostedMessages.at(-1));
  expect(request).toEqual({
    command: 'requestLocalDataInventory',
    clientSummary: {
      uiPreferenceKeys: 2,
      webviewStateFields: 2,
      sharingPreferenceKeys: 1,
    },
  });
  expect(JSON.stringify(request)).not.toContain('/Users/private/account');
});

test('inventory rendering uses text nodes and quota clearing returns only an opaque scope token', async ({ page }) => {
  await openCodex(page);
  await page.locator('#tab-settings').click();
  await page.evaluate(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        command: 'localDataInventoryResult',
        ok: true,
        inventory: {
          schemaVersion: 1,
          generatedAt: Date.now(),
          rows: [{
            id: 'P2',
            category: '<img src=x onerror="window.__inventoryInjected=true">P2 quota observations',
            locationClass: 'Extension global storage / quota observations',
            schema: 'schema 2',
            approximateBytes: 512,
            itemCount: 3,
            oldestAt: Date.parse('2026-07-01T00:00:00Z'),
            newestAt: Date.parse('2026-07-03T00:00:00Z'),
            networkInteraction: 'Structured observations only',
            clearability: 'Scoped clear',
          }],
          quotaScopes: [{
            token: '0123456789abcdef0123456789abcdef0123',
            label: 'Codex local anonymous account epoch 1 (3)',
            provider: 'codex',
            itemCount: 3,
            oldestAt: null,
            newestAt: null,
          }],
          exclusions: ['provider-owned source logs', 'provider credentials'],
        },
      },
    }));
  });

  await expect(page.locator('#localDataInventoryBody tr')).toHaveCount(1);
  await expect(page.locator('#localDataInventoryBody img')).toHaveCount(0);
  await expect(page.locator('#localDataInventoryBody td').first()).toContainText('<img src=x');
  expect(await page.evaluate(() => window.__inventoryInjected === true)).toBe(false);
  await expect(page.locator('#localDataQuotaScope')).toHaveValue('0123456789abcdef0123456789abcdef0123');

  await page.getByRole('button', { name: 'Clear selected quota history…' }).click();
  const posted = await page.evaluate(() => window.__ccuPostedMessages.at(-1));
  expect(posted).toEqual({
    command: 'runLocalDataAction',
    action: 'clear-quota-history',
    quotaScopeToken: '0123456789abcdef0123456789abcdef0123',
  });
  expect(JSON.stringify(posted)).not.toMatch(/fingerprint|accountFingerprint|Users\//);
});

test('UI and sharing resets are independent and preserve unrelated localStorage', async ({ page }) => {
  await openCodex(page);
  await page.locator('#tab-settings').click();
  await page.evaluate(() => {
    localStorage.setItem('ccu.activeTab', 'settings');
    localStorage.setItem('ccu.sessionRange', '30');
    localStorage.setItem('ccu.combinedHeatmap.title', 'Synthetic title');
    localStorage.setItem('ccu.combinedHeatmap.range', '90d');
    localStorage.setItem('unrelated-private-canary', 'preserve');
    acquireVsCodeApi().setState({ scrollPositions: { settings: 10 } });
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        command: 'localDataClientAction',
        action: 'reset-ui-state',
        requestId: 'opaque-reset-request-1',
      },
    }));
  });
  expect(await page.evaluate(() => window.__ccuPostedMessages.findLast(
    (message) => message.command === 'localDataClientActionAck',
  ))).toEqual({
    command: 'localDataClientActionAck',
    requestId: 'opaque-reset-request-1',
    ok: true,
  });
  expect(await page.evaluate(() => ({
    active: localStorage.getItem('ccu.activeTab'),
    range: localStorage.getItem('ccu.sessionRange'),
    shareTitle: localStorage.getItem('ccu.combinedHeatmap.title'),
    state: JSON.parse(localStorage.getItem('__ccu-vscode-state') || '{}'),
    unrelated: localStorage.getItem('unrelated-private-canary'),
  }))).toEqual({
    active: null,
    range: null,
    shareTitle: 'Synthetic title',
    state: {},
    unrelated: 'preserve',
  });

  await page.evaluate(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { command: 'localDataClientAction', action: 'reset-sharing-preferences' },
    }));
  });
  expect(await page.evaluate(() => ({
    title: localStorage.getItem('ccu.combinedHeatmap.title'),
    range: localStorage.getItem('ccu.combinedHeatmap.range'),
    unrelated: localStorage.getItem('unrelated-private-canary'),
  }))).toEqual({ title: null, range: null, unrelated: 'preserve' });
});

test('client reset ACK is false when allowlisted browser storage cannot be deleted', async ({ page }) => {
  await openCodex(page);
  await page.locator('#tab-settings').click();
  await page.evaluate(() => {
    localStorage.setItem('ccu.activeTab', 'settings');
    const original = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function failingRemoveItem() {
      throw new Error('synthetic-storage-failure');
    };
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        command: 'localDataClientAction',
        action: 'reset-ui-state',
        requestId: 'opaque-reset-failure-1',
      },
    }));
    Storage.prototype.removeItem = original;
  });

  expect(await page.evaluate(() => window.__ccuPostedMessages.findLast(
    (message) => message.command === 'localDataClientActionAck',
  ))).toEqual({
    command: 'localDataClientActionAck',
    requestId: 'opaque-reset-failure-1',
    ok: false,
  });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ccu.activeTab')))
    .toBe('settings');
});
