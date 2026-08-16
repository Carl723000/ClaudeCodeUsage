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

async function screenshot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.container')).toHaveScreenshot(name);
}

test('Overview desktop light', async ({ page }) => {
  await openCodex(page);
  await screenshot(page, 'codex-overview-light-1280.png');
});

test('Claude Today desktop light parity reference', async ({ page }) => {
  await openClaude(page);
  await screenshot(page, 'claude-today-light-1280.png');
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
}
