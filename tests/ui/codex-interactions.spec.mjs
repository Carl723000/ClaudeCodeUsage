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

test('Codex metric activation never enters the Claude chart handler', async ({ page }) => {
  await openCodex(page);
  await page.locator('#codex-overview-tab-7d').click();
  const firstBar = page.locator('[data-codex-overview-panel="7d"] [data-codex-chart-bar]').first();
  const firstAxisValue = page.locator('[data-codex-overview-panel="7d"] .hc-yaxis .hc-yval').first();
  const before = await firstAxisValue.textContent();

  await page.evaluate(() => {
    window.__claudeChartCalls = 0;
    const original = window.updateMainChart;
    window.updateMainChart = (...args) => {
      window.__claudeChartCalls += 1;
      return original(...args);
    };
  });

  const output = page.getByRole('button', { name: 'Output tokens', exact: true });
  await output.click();

  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('__ccu-vscode-state') || '{}')))
    .toMatchObject({ codexUi: { chartMetric: 'output' } });

  await expect(output).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.__claudeChartCalls)).toBe(0);
  await expect(firstBar).toHaveClass(/output-bar/);
  await expect.poll(() => firstAxisValue.textContent()).not.toBe(before);
});

test('rogue Codex metric values return before Claude chart DOM or logging work', async ({ page }) => {
  await openCodex(page);
  const result = await page.evaluate(() => {
    const container = document.createElement('div');
    container.innerHTML = '<div class="chart-bar" data-cost="9" style="height:17px">sentinel</div>';
    const bar = container.querySelector('.chart-bar');
    const before = { html: container.innerHTML, height: bar?.style.height };
    let logs = 0;
    const originalLog = console.log;
    console.log = () => { logs += 1; };
    try {
      for (const metric of [undefined, null, '', 'fresh', 'processed', 'reasoning', 1, {}]) {
        window.updateMainChart(metric, container);
      }
    } finally {
      console.log = originalLog;
    }
    return { before, after: { html: container.innerHTML, height: bar?.style.height }, logs };
  });

  expect(result.after).toEqual(result.before);
  expect(result.logs).toBe(0);
});

async function openSessions(page) {
  await page.getByRole('tab', { name: 'Explore', exact: true }).click();
  await page.getByRole('tab', { name: 'Sessions', exact: true }).click();
}

test('Codex exposes three primary destinations', async ({ page }) => {
  await openCodex(page);
  await expect(page.locator('[data-codex-page-button]')).toHaveCount(3);
  await expect(page.locator('[data-codex-page-button]')).toHaveText([
    'Overview', 'Explore', 'Recommendations',
  ]);
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Settings', exact: true })).toHaveCount(0);
});

test('Explore exposes three secondary destinations', async ({ page }) => {
  await openCodex(page);
  await page.getByRole('tab', { name: 'Explore', exact: true }).click();
  const tabs = page.locator('#codex-explore-tablist [role="tab"]');
  await expect(tabs).toHaveText(['Projects', 'Sessions', 'Models & effort']);
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
});

test('recent task drilldown preserves task identity', async ({ page }) => {
  await openCodex(page);
  const identity = page.locator('.codex-task-identity');
  const identityKeys = await identity.evaluate((element) => ({
    task: element.getAttribute('data-codex-task-key'),
    project: element.getAttribute('data-codex-project-key'),
    projectName: element.querySelector('.model-details-stacked strong')?.textContent,
    matchingRows: Array.from(document.querySelectorAll('[data-codex-thread-row]'))
      .filter((row) => row.getAttribute('data-codex-view-key') === element.getAttribute('data-codex-task-key'))
      .map((row) => ({ parent: row.getAttribute('data-codex-parent-view-key'), project: row.getAttribute('data-project') })),
  }));
  expect(identityKeys.matchingRows).toEqual([{ parent: null, project: identityKeys.project }]);
  await identity.getByRole('button', { name: 'Explore', exact: true }).click();

  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('__ccu-vscode-state') || '{}')))
    .toMatchObject({ codexUi: { page: 'explore', exploreView: 'sessions' } });

  await expect(page.getByRole('tab', { name: 'Explore', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Sessions', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-codex-filter-chips] [data-codex-filter-key="project"]'))
    .toHaveText(`Project: ${identityKeys.projectName} ×`);
  await expect(page.locator(`[data-codex-thread-row][data-codex-view-key="${identityKeys.task}"]`)).toBeVisible();
});

test('rootless recent task drilldown resolves its representative project row', async ({ page }) => {
  await openCodex(page, { fixture: 'rootless-cycle' });
  const identity = page.locator('.codex-task-identity');
  const identityKeys = await identity.evaluate((element) => ({
    task: element.getAttribute('data-codex-task-key'),
    project: element.getAttribute('data-codex-project-key'),
    projectName: element.querySelector('.model-details-stacked strong')?.textContent,
    matches: Array.from(document.querySelectorAll('[data-codex-thread-row]'))
      .filter((row) => row.getAttribute('data-codex-view-key') === element.getAttribute('data-codex-task-key'))
      .map((row) => ({
        parent: row.getAttribute('data-codex-parent-view-key'),
        parentStatus: row.getAttribute('data-parent-status'),
        project: row.getAttribute('data-project'),
      })),
  }));

  expect(identityKeys.projectName).toBe('Representative Project');
  expect(identityKeys.matches).toEqual([{
    parent: null,
    parentStatus: 'cycle',
    project: identityKeys.project,
  }]);
  await identity.getByRole('button', { name: 'Explore', exact: true }).click();

  await expect(page.getByRole('tab', { name: 'Sessions', exact: true }))
    .toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-codex-filter-chips] [data-codex-filter-key="project"]'))
    .toHaveText('Project: Representative Project ×');
  await expect(page.locator('[data-codex-thread-visible]')).toHaveText('1');
  const visible = page.locator('[data-codex-thread-row]:visible');
  await expect(visible).toHaveCount(1);
  await expect(visible).toHaveAttribute('data-codex-view-key', identityKeys.task);
  await expect(visible).toHaveAttribute('data-project', identityKeys.project);
});

test('capped recent task drilldown resolves a visible same-project descendant', async ({ page }) => {
  await openCodex(page, { fixture: 'root-over-limit' });
  const identity = page.locator('.codex-task-identity');
  const task = await identity.getAttribute('data-codex-task-key');
  const project = await identity.getAttribute('data-codex-project-key');
  const rows = page.locator('[data-codex-thread-row]');
  const descendants = page.locator(
    `[data-codex-thread-row][data-codex-root-task-view-key="${task}"][data-project="${project}"]`,
  );

  await expect(rows).toHaveCount(1_000);
  await expect(page.locator(`[data-codex-thread-row][data-codex-view-key="${task}"]`))
    .toHaveCount(0);
  await expect(descendants).toHaveCount(1_000);
  const target = descendants.first();
  await target.evaluate((element) => {
    element.scrollIntoView = () => element.setAttribute('data-test-scrolled', 'true');
  });
  await identity.getByRole('button', { name: 'Explore', exact: true }).click();

  await expect(page.getByRole('tab', { name: 'Sessions', exact: true }))
    .toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-codex-filter-chips] [data-codex-filter-key="project"]'))
    .toHaveText('Project: ClaudeCodeUsage ×');
  await expect(page.locator('[data-codex-thread-visible]')).toHaveText('1000');
  await expect(target).toBeFocused();
  await expect(target).toHaveAttribute('data-test-scrolled', 'true');
  const visibleLineage = await page.locator('[data-codex-thread-row]:visible')
    .evaluateAll((visibleRows) => visibleRows.map((row) => ({
      project: row.getAttribute('data-project'),
      rootTask: row.getAttribute('data-codex-root-task-view-key'),
    })));
  expect(visibleLineage).toEqual(Array(1_000).fill({ project, rootTask: task }));
});

test('project disclosure opens its rendered session preview', async ({ page }) => {
  await openCodex(page);
  await page.getByRole('tab', { name: 'Explore', exact: true }).click();
  const disclosure = page.getByRole('button', { name: 'Expand ClaudeCodeUsage', exact: true });
  const projectKey = await disclosure.getAttribute('data-codex-project-view-key');
  await disclosure.click();

  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator(`[data-codex-project-detail="${projectKey}"]`)).toBeVisible();
  await expect(page.locator(`[data-codex-project-detail="${projectKey}"]`)).toContainText('Refine the Codex dashboard');
});

test('project detail action opens Sessions with the canonical project result set', async ({ page }) => {
  await openCodex(page);
  await page.getByRole('tab', { name: 'Explore', exact: true }).click();
  const disclosure = page.getByRole('button', { name: 'Expand ClaudeCodeUsage', exact: true });
  const projectKey = await disclosure.getAttribute('data-codex-project-view-key');
  const expectedCount = await page.locator(`[data-codex-thread-row][data-project="${projectKey}"]`).count();
  await disclosure.click();
  await page.getByRole('button', { name: 'View all sessions: ClaudeCodeUsage', exact: true }).click();

  await expect(page.getByRole('tab', { name: 'Explore', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Sessions', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-codex-filter-chips] [data-codex-filter-key="project"]'))
    .toHaveText('Project: ClaudeCodeUsage ×');
  await expect(page.locator('[data-codex-thread-visible]')).toHaveText(String(expectedCount));
  const visibleProjects = await page.locator('[data-codex-thread-row]:visible').evaluateAll((rows) =>
    rows.map((row) => row.getAttribute('data-project')));
  expect(visibleProjects).toEqual(Array(expectedCount).fill(projectKey));
});

for (const keyCase of [{ key: 'Enter', label: 'Enter' }, { key: ' ', label: 'Space' }]) {
  test(`chart day ${keyCase.label} activation opens exact-date Sessions results`, async ({ page }) => {
    await openCodex(page);
    await page.locator('#codex-overview-tab-7d').click();
    const chartDay = page.locator('[data-codex-overview-panel="7d"] [data-codex-date="2026-07-20"]');
    const expectedCount = await page.locator('[data-codex-thread-row]').evaluateAll((rows) => rows
      .filter((row) => (row.getAttribute('data-codex-days') || '').split('|').includes('2026-07-20')).length);
    await chartDay.focus();
    await chartDay.press(keyCase.key);

    await expect(page.getByRole('tab', { name: 'Explore', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'Sessions', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-codex-filter-chips] [data-codex-filter-key="date"]'))
      .toHaveText('Date: 2026-07-20 ×');
    await expect(page.locator('[data-codex-thread-visible]')).toHaveText(String(expectedCount));
    const visibleDays = await page.locator('[data-codex-thread-row]:visible').evaluateAll((rows) =>
      rows.map((row) => (row.getAttribute('data-codex-days') || '').split('|')));
    expect(visibleDays).toHaveLength(expectedCount);
    expect(visibleDays.every((days) => days.includes('2026-07-20'))).toBe(true);
  });
}

test('root disclosure recursively collapses direct and grandchild rows after a real reload', async ({ page }) => {
  await openCodex(page);
  await openSessions(page);
  const lineage = await page.locator('[data-codex-thread-row]').evaluateAll((rows) => {
    const entries = rows.map((row) => ({
      key: row.getAttribute('data-codex-view-key'),
      parent: row.getAttribute('data-codex-parent-view-key'),
    }));
    for (const root of entries.filter((entry) => !entry.parent)) {
      for (const direct of entries.filter((entry) => entry.parent === root.key)) {
        const grandchild = entries.find((entry) => entry.parent === direct.key);
        if (grandchild) return { root: root.key, direct: direct.key, grandchild: grandchild.key };
      }
    }
    return null;
  });
  expect(lineage).not.toBeNull();
  const root = page.locator(`[data-codex-thread-row][data-codex-view-key="${lineage.root}"]`);
  const toggle = root.locator('[data-codex-action="toggle-thread-children"]');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator(`[data-codex-thread-row][data-codex-view-key="${lineage.direct}"]`)).toBeHidden();
  await expect(page.locator(`[data-codex-thread-row][data-codex-view-key="${lineage.grandchild}"]`)).toBeHidden();

  await page.reload({ waitUntil: 'load' });
  await page.locator('[data-codex-root]').waitFor();
  const restoredRoot = page.locator(`[data-codex-thread-row][data-codex-view-key="${lineage.root}"]`);
  await expect(restoredRoot.locator('[data-codex-action="toggle-thread-children"]')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator(`[data-codex-thread-row][data-codex-view-key="${lineage.direct}"]`)).toBeHidden();
  await expect(page.locator(`[data-codex-thread-row][data-codex-view-key="${lineage.grandchild}"]`)).toBeHidden();
});

test('filtered child keeps its parent context', async ({ page }) => {
  await openCodex(page);
  await openSessions(page);
  const reviewer = page.locator('[data-codex-thread-row][data-role="approval-reviewer"]').first();
  const search = ((await reviewer.getAttribute('data-search')) ?? '').split(' ').slice(0, 3).join(' ');
  await page.getByRole('searchbox', { name: 'Search sessions' }).fill(search);

  await expect(reviewer).toBeVisible();
  await expect(reviewer.locator('[data-codex-filter-parent]')).toContainText('Parent task:');
  await expect(page.locator('[data-codex-session-layout]')).toHaveAttribute('data-codex-session-layout', 'flat');
});

test('clear all restores the complete result set', async ({ page }) => {
  await openCodex(page);
  await openSessions(page);
  await page.getByRole('searchbox', { name: 'Search sessions' }).fill('dashboard');
  await page.getByLabel('Role', { exact: true }).selectOption('subagent');
  await page.getByLabel('Models', { exact: true }).selectOption('gpt-5.6-sol');
  await page.getByLabel('Effort', { exact: true }).selectOption('high');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();

  await expect(page.locator('[data-codex-filter-chips] button')).toHaveCount(0);
  await expect(page.getByRole('searchbox', { name: 'Search sessions' })).toHaveValue('');
  await expect(page.getByLabel('Role', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Models', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Effort', { exact: true })).toHaveValue('');
  await expect(page.locator('[data-codex-thread-visible]')).toHaveText('24');
});

test('native sort button mouse Space and Enter each produce exactly one fresh-order transition', async ({ page }) => {
  await openCodex(page);
  await openSessions(page);
  await page.getByRole('searchbox', { name: 'Search sessions' }).fill('dashboard');
  const fresh = page.locator('[data-codex-sort-table="sessions"] th[data-codex-sort-key="fresh"]');
  const trigger = fresh.locator('button[data-codex-action="sort-sessions"]');
  const values = await page.locator('[data-codex-thread-row]:visible').evaluateAll((rows) =>
    rows.map((row) => Number(row.getAttribute('data-sort-fresh'))));
  expect(new Set(values).size).toBeGreaterThan(1);
  const firstFresh = () => page.locator('[data-codex-thread-row]:visible').first().getAttribute('data-sort-fresh')
    .then((value) => Number(value));
  await expect(fresh).toHaveAttribute('aria-sort', 'none');
  await trigger.click();
  await expect(fresh).toHaveAttribute('aria-sort', 'ascending');
  expect(await firstFresh()).toBe(Math.min(...values));
  await trigger.press(' ');
  await expect(fresh).toHaveAttribute('aria-sort', 'descending');
  expect(await firstFresh()).toBe(Math.max(...values));
  await trigger.press('Enter');
  await expect(fresh).toHaveAttribute('aria-sort', 'ascending');
  expect(await firstFresh()).toBe(Math.min(...values));
});

test('Codex exploration state survives a full Webview reload', async ({ page }) => {
  await openCodex(page);
  await openSessions(page);
  await page.getByRole('searchbox', { name: 'Search sessions' }).fill('dashboard');
  await page.getByLabel('Role', { exact: true }).selectOption('subagent');
  await page.getByLabel('Models', { exact: true }).selectOption('gpt-5.6-sol');
  const fresh = page.locator('[data-codex-sort-table="sessions"] th[data-codex-sort-key="fresh"]');
  await fresh.locator('button[data-codex-action="sort-sessions"]').click();

  await page.reload({ waitUntil: 'load' });
  await page.locator('[data-codex-root]').waitFor();

  await expect(page.getByRole('tab', { name: 'Explore', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Sessions', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('searchbox', { name: 'Search sessions' })).toHaveValue('dashboard');
  await expect(page.getByLabel('Role', { exact: true })).toHaveValue('subagent');
  await expect(page.getByLabel('Models', { exact: true })).toHaveValue('gpt-5.6-sol');
  await expect(fresh).toHaveAttribute('aria-sort', 'ascending');
});

test('Codex state restores scopes, metric, disclosure, recommendations and settings return destination', async ({ page }) => {
  await openCodex(page);
  await page.locator('#codex-overview-tab-7d').click();
  await page.getByRole('button', { name: 'Output tokens', exact: true }).click();
  await page.getByRole('tab', { name: 'Explore', exact: true }).click();
  const project = page.getByRole('button', { name: 'Expand ClaudeCodeUsage', exact: true });
  await project.click();
  await page.getByRole('tab', { name: 'Recommendations', exact: true }).click();
  await page.getByRole('tab', { name: 'All time', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();

  await page.reload({ waitUntil: 'load' });
  await page.locator('[data-codex-root]').waitFor();

  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toHaveAttribute('aria-controls', 'codex-page-panel-settings');
  await expect(page.locator('[data-codex-page="settings"]')).toBeVisible();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Recommendations', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'All time', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Explore', exact: true }).click();
  await expect(project).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await expect(page.locator('#codex-overview-tab-7d')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Output tokens', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('Codex restores a legal absent target as an empty production result without Codex localStorage keys', async ({ page }) => {
  await openCodex(page);
  await page.evaluate(() => {
    localStorage.setItem('__ccu-vscode-state', JSON.stringify({
      codexUi: {
        version: 1,
        page: 'explore',
        returnPage: 'overview',
        overviewScope: 'recent',
        recommendationScope: 'recent',
        exploreView: 'sessions',
        exploreScope: 'recent',
        chartMetric: 'processed',
        search: '',
        filters: { role: '', project: '', model: '', effort: '', period: '', date: '2099-12-31' },
        sort: { projects: { key: 'processed', direction: 'desc' }, sessions: { key: 'recent', direction: 'desc' } },
        expandedProjects: ['no-longer-present'],
        collapsedTasks: ['no-longer-present'],
      },
    }));
  });
  await page.reload({ waitUntil: 'load' });
  await page.locator('[data-codex-root]').waitFor();

  await expect(page.getByRole('tab', { name: 'Explore', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Sessions', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-codex-thread-visible]')).toHaveText('0');
  await expect(page.locator('[data-codex-filter-chips] [data-codex-filter-key="date"]'))
    .toHaveText('Date: 2099-12-31 ×');
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage)
    .filter((key) => key !== '__ccu-vscode-state'))).toEqual([]);
});
