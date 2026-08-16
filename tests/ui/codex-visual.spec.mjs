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
