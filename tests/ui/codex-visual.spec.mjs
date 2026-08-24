import { test, expect, openClaude, openCodex } from './support/app.mjs';

// Runtime variables provided by VS Code's webview/theme bridge. Keeping this
// independent from the harness prevents an invented variable from being added
// to both sides of the test and turning a real transparent-style bug green.
const REGISTERED_VSCODE_VARIABLES = new Set([
  '--vscode-badge-background', '--vscode-badge-foreground',
  '--vscode-button-background', '--vscode-button-foreground', '--vscode-button-hoverBackground',
  '--vscode-button-secondaryBackground', '--vscode-button-secondaryForeground',
  '--vscode-button-secondaryHoverBackground', '--vscode-charts-blue', '--vscode-charts-foreground',
  '--vscode-charts-green', '--vscode-charts-lines', '--vscode-charts-orange', '--vscode-charts-purple',
  '--vscode-charts-red', '--vscode-charts-yellow', '--vscode-descriptionForeground',
  '--vscode-dropdown-background', '--vscode-dropdown-border', '--vscode-dropdown-foreground',
  '--vscode-editor-background', '--vscode-editor-font-family', '--vscode-editorWidget-background',
  '--vscode-errorForeground', '--vscode-focusBorder', '--vscode-font-family', '--vscode-font-size',
  '--vscode-foreground', '--vscode-input-background', '--vscode-input-border', '--vscode-input-foreground',
  '--vscode-inputValidation-warningBackground', '--vscode-inputValidation-warningBorder',
  '--vscode-list-hoverBackground', '--vscode-panel-border', '--vscode-progressBar-background',
  '--vscode-symbolIcon-functionForeground', '--vscode-testing-iconPassed',
  '--vscode-textBlockQuote-background', '--vscode-textBlockQuote-border',
  '--vscode-textCodeBlock-background', '--vscode-textLink-foreground', '--vscode-toolbar-hoverBackground',
]);

test('Codex uses the shared dashboard shell and tab vocabulary', async ({ page }) => {
  await openCodex(page);

  await expect(page.locator('.container > header')).toBeVisible();
  await expect(page.locator('.tabs > .tab')).toHaveText([
    'Recent task',
    'Last 30 days',
    'All time',
    'Sessions',
    'Projects',
    'Recommendations',
    'Settings',
  ]);
  await expect(page.locator('.tab-content.active')).toHaveAttribute('id', 'today');
  await expect(page.locator('[class*="codex-"]')).toHaveCount(0);
});

test('Codex header matches Claude with only Refresh and Settings actions', async ({ page }) => {
  await openCodex(page);

  await expect(page.locator('.container > header .actions > button')).toHaveText([
    '↻ Refresh',
    '⚙ Settings',
  ]);
});

test('manual Refresh remains visible while dashboard auto-refresh is enabled', async ({ page }) => {
  await openCodex(page, { autoRefresh: true });

  await expect(page.locator('#refreshNowBtn')).toBeVisible();
});

test('Codex labels incomplete usage as an indexed subtotal', async ({ page }) => {
  await openCodex(page);

  await expect(page.locator('#today .usage-summary').first()).toContainText('Indexed subtotal');
  await page.locator('#tab-all').click();
  await expect(page.locator('#all .usage-summary').first()).toContainText('Indexed subtotal');
});

test('Codex summary leads with a clearly qualified API-equivalent cost', async ({ page }) => {
  await openCodex(page);

  const cards = page.locator('#today .usage-summary').first().locator('.summary-grid .summary-item');
  await expect(cards).toHaveCount(7);
  await expect(cards.first().locator('.label')).toHaveText('API-equivalent cost');
  await expect(cards.first().locator('.value')).toHaveText(/^\$[\d,.]+$/);
  await expect(cards.first()).toHaveAttribute(
    'title',
    /not a bill or subscription charge.*Priced model coverage: \d+%/,
  );
  await expect(cards.nth(1).locator('.label')).toHaveText('Processed');
});

test('Codex shows an unpriced marker without hiding unknown-model token totals', async ({ page }) => {
  await openCodex(page, { fixture: 'unknown-models' });

  const cards = page.locator('#today .usage-summary').first().locator('.summary-grid .summary-item');
  const costCard = cards.first();
  const costValue = costCard.locator('.value');
  await expect(cards).toHaveCount(7);
  await expect(costValue).toHaveText('—');
  const costText = await costValue.textContent();
  expect(costText).toBe('—');
  expect(costText).not.toContain('$');
  await expect(costCard).toHaveAttribute('title', /Priced model coverage: 0%/);
  await expect(cards.locator('.value')).toHaveText([
    '—',
    '61,920',
    '33,720',
    '51,600',
    '28,200',
    '10,320',
    '3,300',
  ]);
});

test('Codex explains multi-sign-in usage and last-observed limits', async ({ page }) => {
  await openCodex(page);

  const limits = page.locator('#today .usage-summary').filter({ hasText: 'Usage limits' });
  await expect(limits).toContainText(
    'Usage combines sign-ins in this Codex home · limits are last observed, not combined',
  );
});

test('Claude and Codex receive the exact same production stylesheet', async ({ page }) => {
  await openClaude(page);
  const claudeStyles = await page.locator('head style').first().textContent();

  await openCodex(page);
  const codexStyles = await page.locator('head style').first().textContent();

  expect(codexStyles).toBe(claudeStyles);
});

for (const theme of ['light', 'dark']) {
  test(`${theme} harness defines every VS Code variable used by the dashboard`, async ({ page }) => {
    await openClaude(page, { theme });

    const { referenced, defined } = await page.evaluate(() => {
      const productionCss = document.querySelector('head style:not(#test-vscode-theme)')?.textContent ?? '';
      const harnessCss = document.querySelector('#test-vscode-theme')?.textContent ?? '';
      const references = [];
      const pattern = /var\(\s*(--vscode-[\w-]+)/g;
      let match;
      while ((match = pattern.exec(productionCss)) !== null) {
        let depth = 1;
        let hasFallback = false;
        for (let index = pattern.lastIndex; index < productionCss.length; index += 1) {
          if (productionCss[index] === '(') depth += 1;
          if (productionCss[index] === ')') depth -= 1;
          if (productionCss[index] === ',' && depth === 1) hasFallback = true;
          if (depth === 0) break;
        }
        references.push({ name: match[1], hasFallback });
      }
      return {
        referenced: references,
        defined: [...new Set([...harnessCss.matchAll(/(--vscode-[\w-]+)\s*:/g)].map((match) => match[1]))],
      };
    });

    const referenceKinds = new Map();
    for (const { name, hasFallback } of referenced) {
      const kinds = referenceKinds.get(name) ?? new Set();
      kinds.add(hasFallback);
      referenceKinds.set(name, kinds);
    }
    const definedSet = new Set(defined);
    const missingWithoutFallback = [...referenceKinds]
      .filter(([name, kinds]) =>
        (REGISTERED_VSCODE_VARIABLES.has(name) && !definedSet.has(name)) ||
        (!REGISTERED_VSCODE_VARIABLES.has(name) && kinds.has(false)))
      .map(([name]) => name)
      .sort();
    const definedDespiteFallback = [...referenceKinds]
      .filter(([name, kinds]) =>
        !REGISTERED_VSCODE_VARIABLES.has(name) && kinds.has(true) && !kinds.has(false) && definedSet.has(name))
      .map(([name]) => name)
      .sort();

    const failureMessage = [
      `缺失(无回退): ${missingWithoutFallback.join(', ') || '无'}`,
      `不应定义(有回退): ${definedDespiteFallback.join(', ') || '无'}`,
    ].join('\n');
    expect(referenced.length).toBeGreaterThan(0);
    expect(
      { missingWithoutFallback, definedDespiteFallback },
      failureMessage,
    ).toEqual({ missingWithoutFallback: [], definedDespiteFallback: [] });
  });

  test(`${theme} composition fills are fully opaque`, async ({ page }) => {
    await openClaude(page, { theme });

    const fills = page.locator('.cost-comp-seg, .cost-comp-legend .legend-dot');
    expect(await fills.count()).toBeGreaterThan(0);
    const translucent = await fills.evaluateAll((elements) => elements.map((element) => {
      const background = getComputedStyle(element).backgroundColor;
      const rgba = background.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/);
      return {
        className: element.className,
        background,
        alpha: rgba ? Number(rgba[1]) : background === 'transparent' ? 0 : 1,
      };
    }).filter(({ alpha }) => alpha !== 1));

    expect(translucent).toEqual([]);
  });
}

test('Codex month chart reuses the shared chart controls and bars', async ({ page }) => {
  await openCodex(page);
  await page.locator('#tab-month').click();

  const chart = page.locator('#month .daily-breakdown');
  await expect(chart).toBeVisible();
  await expect(chart.locator('.chart-tab')).toHaveCount(5);
  await expect(chart.locator('.chart-bar').first()).toBeVisible();
  await chart.locator('.chart-tab[data-metric="outputTokens"]').click();
  await expect(chart.locator('.chart-tab[data-metric="outputTokens"]')).toHaveClass(/active/);
});

test('weekly allowance value uses the shared all-time chart and exposes uncertainty', async ({ page }) => {
  await openCodex(page);
  await page.locator('#tab-all').click();

  const panel = page.locator('#all .daily-breakdown').filter({
    hasText: 'Weekly allowance value · Codex Beta',
  });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Estimate, not a bill');
  await expect(panel).toContainText('Historical used equivalents come directly from local token logs');
  await expect(panel).toContainText('Quota-derived total and unused estimates stay tied to the observed reset series');
  await expect(panel).toContainText('no account split is invented');
  await expect(panel.locator('.hc-col')).toHaveCount(2);
  await expect(panel.locator('tbody tr')).toHaveCount(2);
  await expect(panel.locator('thead')).toContainText('Full allowance est.');
  await expect(panel.locator('thead')).toContainText('Priced coverage');
});

test('weekly allowance table fits at 1280px in the longest locale', async ({ page }) => {
  await openCodex(page, { locale: 'de-DE', width: 1280 });
  await page.locator('#tab-all').click();
  const panel = page.locator('#all .daily-breakdown').filter({
    hasText: 'Wöchentlicher Gegenwert · Codex Beta',
  });
  const container = panel.locator('.daily-table-container');
  await expect(container).toBeVisible();
  const dimensions = await container.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  const clippedHeaders = await panel.locator('th').evaluateAll((headers) =>
    headers.filter((header) => header.scrollWidth > header.clientWidth).map((header) => header.textContent),
  );
  expect(clippedHeaders).toEqual([]);
});

test('weekly used-value history remains visible without historical quota samples', async ({ page }) => {
  await openCodex(page, { fixture: 'weekly-usage-only' });
  await page.locator('#tab-all').click();

  const panel = page.locator('#all .daily-breakdown').filter({
    hasText: 'Weekly allowance value · Codex Beta',
  });
  await expect(panel).toContainText('Monday-to-Monday UTC calendar weeks');
  await expect(panel.locator('tbody tr')).toHaveCount(2);
  await expect(panel.locator('tbody')).toContainText('Usage only');
  await expect(panel.locator('tbody')).toContainText('$12.00');
  await expect(panel.locator('tbody')).toContainText('$8.00');
  for (const row of await panel.locator('tbody tr').all()) {
    await expect(row.locator('td').nth(2)).toHaveText('—');
    await expect(row.locator('td').nth(3)).toHaveText('—');
    await expect(row.locator('td').nth(4)).toHaveText('—');
  }
});
