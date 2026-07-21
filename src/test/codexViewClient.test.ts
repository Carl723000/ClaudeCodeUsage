import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';

import { getCodexClientScript } from '../codexViewClient';

class FixtureClassList {
  private readonly values = new Set<string>();

  constructor(initial = '') {
    initial.split(/\s+/).filter(Boolean).forEach((value) => this.values.add(value));
  }

  add(...values: string[]): void { values.forEach((value) => this.values.add(value)); }
  remove(...values: string[]): void { values.forEach((value) => this.values.delete(value)); }
  contains(value: string): boolean { return this.values.has(value); }
  toggle(value: string, force?: boolean): boolean {
    const enabled = force === undefined ? !this.values.has(value) : force;
    if (enabled) this.values.add(value); else this.values.delete(value);
    return enabled;
  }
}

class FixtureElement {
  readonly attributes = new Map<string, string>();
  readonly classList: FixtureClassList;
  readonly children: FixtureElement[] = [];
  readonly listeners = new Map<string, Array<(event: FixtureEvent) => void>>();
  parentElement: FixtureElement | null = null;
  hidden = false;
  disabled = false;
  value = '';
  valueAsNumber = Number.NaN;
  validity: { valid: boolean } | undefined = { valid: true };
  checked = false;
  textContent = '';
  style: Record<string, string> = {};
  focused = false;
  scrolled = false;

  constructor(readonly tagName: string, attributes: Record<string, string> = {}) {
    this.classList = new FixtureClassList(attributes.class ?? '');
    for (const [key, value] of Object.entries(attributes)) {
      if (key !== 'class') this.attributes.set(key, value);
    }
    this.value = attributes.value ?? '';
    this.disabled = Object.prototype.hasOwnProperty.call(attributes, 'disabled');
  }

  append(...children: FixtureElement[]): this {
    for (const child of children) {
      if (child.parentElement) {
        const previousIndex = child.parentElement.children.indexOf(child);
        if (previousIndex >= 0) child.parentElement.children.splice(previousIndex, 1);
      }
      child.parentElement = this;
      this.children.push(child);
    }
    return this;
  }

  appendChild(child: FixtureElement): FixtureElement { this.append(child); return child; }
  removeChild(child: FixtureElement): FixtureElement {
    const index = this.children.indexOf(child);
    if (index < 0) throw new Error('Fixture child not found');
    this.children.splice(index, 1);
    child.parentElement = null;
    return child;
  }
  get firstChild(): FixtureElement | null { return this.children[0] ?? null; }
  get options(): FixtureElement[] | undefined {
    return this.tagName.toLowerCase() === 'select' ? this.children.filter((child) => child.tagName.toLowerCase() === 'option') : undefined;
  }
  get selectedIndex(): number {
    return this.options?.findIndex((option) => option.value === this.value) ?? -1;
  }
  get text(): string { return this.textContent; }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  setAttribute(name: string, value: string): void { this.attributes.set(name, String(value)); }
  removeAttribute(name: string): void { this.attributes.delete(name); }
  hasAttribute(name: string): boolean { return this.attributes.has(name); }
  focus(): void { this.focused = true; }
  scrollIntoView(): void { this.scrolled = true; }

  matches(selector: string): boolean {
    return selector.split(',').some((part) => this.matchesSingle(part.trim()));
  }

  private matchesSingle(selector: string): boolean {
    if (selector.includes(' ')) {
      const parts = selector.split(/\s+/);
      const leaf = parts.pop()!;
      if (!this.matchesSingle(leaf)) return false;
      let cursor = this.parentElement;
      while (parts.length && cursor) {
        if (cursor.matchesSingle(parts[parts.length - 1])) parts.pop();
        cursor = cursor.parentElement;
      }
      return parts.length === 0;
    }
    const not = selector.match(/:not\(\[([^\]]+)\]\)$/);
    if (not) {
      selector = selector.slice(0, not.index);
      if (this.hasAttribute(not[1])) return false;
    }
    const tag = selector.match(/^[a-zA-Z0-9-]+/);
    if (tag && this.tagName.toLowerCase() !== tag[0].toLowerCase()) return false;
    for (const match of selector.matchAll(/\.([a-zA-Z0-9_-]+)/g)) {
      if (!this.classList.contains(match[1])) return false;
    }
    for (const match of selector.matchAll(/\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]/g)) {
      if (!this.hasAttribute(match[1])) return false;
      if (match[2] !== undefined && this.getAttribute(match[1]) !== match[2]) return false;
    }
    return true;
  }

  closest(selector: string): FixtureElement | null {
    let cursor: FixtureElement | null = this;
    while (cursor) {
      if (cursor.matches(selector)) return cursor;
      cursor = cursor.parentElement;
    }
    return null;
  }

  querySelectorAll(selector: string): FixtureElement[] {
    const result: FixtureElement[] = [];
    const visit = (node: FixtureElement): void => {
      for (const child of node.children) {
        if (child.matches(selector)) result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }

  querySelector(selector: string): FixtureElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  addEventListener(type: string, listener: (event: FixtureEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  dispatch(type: string, target: FixtureElement = this, key = ''): FixtureEvent {
    const event = new FixtureEvent(type, target, key);
    for (const listener of this.listeners.get(type) ?? []) listener(event);
    return event;
  }
}

class FixtureEvent {
  defaultPrevented = false;
  propagationStopped = false;
  constructor(readonly type: string, readonly target: FixtureElement, readonly key = '') {}
  preventDefault(): void { this.defaultPrevented = true; }
  stopPropagation(): void { this.propagationStopped = true; }
}

function el(tag: string, attributes: Record<string, string> = {}): FixtureElement {
  return new FixtureElement(tag, attributes);
}

interface ControllerFixtureOptions {
  sevenDayPeriodDisabled?: boolean;
  sevenDayPeriodAriaDisabled?: boolean;
  rootlessCycle?: boolean;
  rootBeyondCap?: boolean;
}

function controllerFixture(initialCodexUi: unknown = undefined, fixtureOptions: ControllerFixtureOptions = {}): {
  root: FixtureElement;
  vscode: { state: Record<string, unknown>; messages: unknown[]; setStateCalls: number; getState(): Record<string, unknown>; setState(value: Record<string, unknown>): void; postMessage(value: unknown): void };
  elements: Record<string, FixtureElement>;
} {
  const option = (value: string, label: string, disabled = false, ariaDisabled = false): FixtureElement => {
    const attributes: Record<string, string> = { value };
    if (disabled) attributes.disabled = '';
    if (ariaDisabled) attributes['aria-disabled'] = 'true';
    const item = el('option', attributes);
    item.textContent = label;
    return item;
  };
  const select = (filter: string, options: FixtureElement[]): FixtureElement =>
    el('select', { 'data-codex-action': 'filter-sessions', 'data-codex-session-filter': filter, 'aria-label': filter }).append(...options);

  const root = el('section', { 'data-codex-root': '' });
  const refreshHeader = el('button', { 'data-codex-header-action': 'refresh', 'data-codex-action': 'refresh' });
  const settingsHeader = el('button', { 'data-codex-header-action': 'settings', 'data-codex-action': 'open-settings' });
  const overviewTab = el('button', { 'data-codex-action': 'select-page', 'data-codex-page-target': 'overview', 'data-codex-page-button': 'overview', role: 'tab' });
  const exploreTab = el('button', { 'data-codex-action': 'select-page', 'data-codex-page-target': 'explore', 'data-codex-page-button': 'explore', role: 'tab' });
  const recommendationsTab = el('button', { 'data-codex-action': 'select-page', 'data-codex-page-target': 'recommendations', 'data-codex-page-button': 'recommendations', role: 'tab' });
  const pageTablist = el('nav', { role: 'tablist' }).append(overviewTab, exploreTab, recommendationsTab);
  const overview = el('section', { 'data-codex-page': 'overview' });
  const explore = el('section', { 'data-codex-page': 'explore' });
  const recommendations = el('section', { 'data-codex-page': 'recommendations' });
  const settings = el('section', { 'data-codex-page': 'settings' });
  const recentScope = el('button', { 'data-codex-action': 'set-overview-scope', 'data-codex-overview-scope': 'recent', role: 'tab' });
  const sevenScope = el('button', { 'data-codex-action': 'set-overview-scope', 'data-codex-overview-scope': '7d', role: 'tab' });
  const recentPanel = el('section', { 'data-codex-overview-panel': 'recent', 'data-codex-overview-dataset': 'recent', 'data-axis-top-processed': '10', 'data-axis-mid-processed': '5', 'data-axis-top-fresh': '8', 'data-axis-mid-fresh': '4' });
  const sevenPanel = el('section', { 'data-codex-overview-panel': '7d', 'data-codex-overview-dataset': '7d' });
  const processedMetric = el('button', { 'data-codex-action': 'set-chart-metric', 'data-codex-chart-metric': 'processed' });
  const freshMetric = el('button', { 'data-codex-action': 'set-chart-metric', 'data-codex-chart-metric': 'fresh' });
  const metricGroup = el('div', { class: 'codex-overview-metric' }).append(processedMetric, freshMetric);
  const firstValue = el('span', { 'data-codex-chart-value': '' });
  const firstBar = el('button', { 'data-codex-chart-bar': '', 'data-row-label': 'one', 'data-processed': '10', 'data-fresh': '2', 'data-label-processed': '10p', 'data-label-fresh': '2f', 'data-name-processed': 'Processed', 'data-name-fresh': 'Fresh' });
  const secondBar = el('button', { 'data-codex-chart-bar': '', 'data-row-label': 'two', 'data-processed': '5', 'data-fresh': '8', 'data-label-processed': '5p', 'data-label-fresh': '8f', 'data-name-processed': 'Processed', 'data-name-fresh': 'Fresh' });
  const yaxis = el('div', { class: 'hc-yaxis' }).append(el('span', { class: 'hc-yval' }), el('span', { class: 'hc-yval' }), el('span', { class: 'hc-yval' }));
  const recentDateBar = el('button', { 'data-codex-action': 'drilldown-date', 'data-codex-date': '2026-07-20' });
  const recentDateRow = el('tr', { 'data-codex-date-row': '2026-07-20' });
  const sevenDateBar = el('button', { 'data-codex-action': 'drilldown-date', 'data-codex-date': '2026-07-19' });
  const sevenDateRow = el('tr', { 'data-codex-date-row': '2026-07-19' });
  recentPanel.append(el('div', { class: 'hc-col' }).append(firstValue, firstBar), el('div', { class: 'hc-col' }).append(secondBar), yaxis, recentDateBar, recentDateRow);
  sevenPanel.append(sevenDateBar, sevenDateRow);
  overview.append(recentScope, sevenScope, metricGroup, recentPanel, sevenPanel);

  const recommendationRecent = el('button', { 'data-codex-action': 'set-recommendation-scope', 'data-codex-recommendation-scope': 'recent', role: 'tab' });
  const recommendationSeven = el('button', { 'data-codex-action': 'set-recommendation-scope', 'data-codex-recommendation-scope': '7d', role: 'tab', disabled: '', 'aria-disabled': 'true' });
  const recommendationAll = el('button', { 'data-codex-action': 'set-recommendation-scope', 'data-codex-recommendation-scope': 'all', role: 'tab' });
  const recommendationRecentPanel = el('section', { 'data-codex-recommendation-panel': 'recent' });
  const recommendationSevenPanel = el('section', { 'data-codex-recommendation-panel': '7d' });
  const recommendationAllPanel = el('section', { 'data-codex-recommendation-panel': 'all' });
  recommendations.append(recommendationRecent, recommendationSeven, recommendationAll, recommendationRecentPanel, recommendationSevenPanel, recommendationAllPanel);

  const projectsTab = el('button', { 'data-codex-action': 'select-explore-view', 'data-codex-explore-view': 'projects', 'data-codex-explore-view-button': 'projects', role: 'tab' });
  const sessionsTab = el('button', { 'data-codex-action': 'select-explore-view', 'data-codex-explore-view': 'sessions', 'data-codex-explore-view-button': 'sessions', role: 'tab' });
  const modelsEffortTab = el('button', { 'data-codex-action': 'select-explore-view', 'data-codex-explore-view': 'models-effort', 'data-codex-explore-view-button': 'models-effort', role: 'tab' });
  const projects = el('section', { 'data-codex-explore-panel': 'projects' });
  const sessions = el('section', { 'data-codex-explore-panel': 'sessions' });
  const modelsEffort = el('section', { 'data-codex-explore-panel': 'models-effort' });
  const modelRecent = el('button', { 'data-codex-action': 'set-model-effort-scope', 'data-codex-model-effort-scope': 'recent', role: 'tab' });
  const modelSeven = el('button', { 'data-codex-action': 'set-model-effort-scope', 'data-codex-model-effort-scope': '7d', role: 'tab' });
  const modelRecentPanel = el('section', { 'data-codex-model-effort-panel': 'recent' });
  const modelSevenPanel = el('section', { 'data-codex-model-effort-panel': '7d' });
  modelsEffort.append(modelRecent, modelSeven, modelRecentPanel, modelSevenPanel);

  const search = el('input', { type: 'search', 'data-codex-action': 'filter-sessions', 'data-codex-session-search': '' });
  const role = select('role', [option('', 'All roles'), option('root', 'Root'), option('subagent', 'Subagent')]);
  const projectOptions = [option('', 'All projects'), option('p-a', 'Alpha'), option('p-b', 'Beta')];
  if (fixtureOptions.rootlessCycle) {
    projectOptions.push(option('p-cycle', 'Cycle Project'));
  }
  const projectFilter = select('project', projectOptions);
  const modelFilter = select('model', [option('', 'All models'), option('gpt-5', 'gpt-5'), option('gpt-4.1', 'gpt-4.1')]);
  const effortFilter = select('effort', [option('', 'All efforts'), option('high', 'High'), option('medium', 'Medium')]);
  const sevenDayPeriodOption = option(
    '7d',
    'Last 7 days',
    fixtureOptions.sevenDayPeriodDisabled,
    fixtureOptions.sevenDayPeriodAriaDisabled,
  );
  const periodFilter = select('period', [option('', 'All periods'), option('recent', 'Recent'), sevenDayPeriodOption, option('30d', 'Last 30 days')]);
  const chips = el('div', { 'data-codex-filter-chips': '', 'data-codex-search-label': 'Search', 'data-codex-date-label': 'Date' });
  const clearFilters = el('button', { 'data-codex-action': 'clear-filters' });
  const count = el('span', { 'data-codex-thread-visible': '' });
  const layout = el('section', { 'data-codex-session-layout': 'tree' });
  const rootRow = el('tr', { 'data-codex-thread-row': '', 'data-codex-view-key': 'root-a', 'data-codex-root-task-view-key': 'task-a', 'data-search': 'alpha', 'data-role': 'root', 'data-project': 'p-a', 'data-models': 'gpt-5', 'data-efforts': 'high', 'data-codex-periods': 'recent|7d|30d|all', 'data-codex-days': '2026-07-20', 'data-sort-title': 'alpha', 'data-sort-time': '10' });
  const childRow = el('tr', { class: 'codex-child-thread', 'data-codex-thread-row': '', 'data-codex-view-key': 'child-a', 'data-codex-parent-view-key': 'root-a', 'data-codex-root-task-view-key': 'task-a', 'data-search': 'beta', 'data-role': 'subagent', 'data-project': 'p-a', 'data-models': 'gpt-5', 'data-efforts': 'medium', 'data-codex-periods': '7d|30d|all', 'data-codex-days': '2026-07-19', 'data-sort-title': 'beta', 'data-sort-time': '20' });
  const rootBRow = el('tr', { 'data-codex-thread-row': '', 'data-codex-view-key': 'root-b', 'data-codex-root-task-view-key': 'root-b', 'data-search': 'gamma', 'data-role': 'root', 'data-project': 'p-b', 'data-models': 'gpt-4.1', 'data-efforts': 'high', 'data-codex-periods': 'recent|7d|30d|all', 'data-codex-days': '2026-07-20', 'data-sort-title': 'gamma', 'data-sort-time': '30' });
  const cycleRow = el('tr', { 'data-codex-thread-row': '', 'data-codex-view-key': 'cycle-representative', 'data-codex-root-task-view-key': 'cycle-representative', 'data-parent-status': 'cycle', 'data-search': 'cycle', 'data-role': 'subagent', 'data-project': 'p-cycle', 'data-models': 'gpt-5', 'data-efforts': 'high', 'data-codex-periods': 'recent|7d|30d|all', 'data-codex-days': '2026-07-20', 'data-sort-title': 'cycle', 'data-sort-time': '40' });
  const cappedRootChildRow = el('tr', { class: 'codex-child-thread', 'data-codex-thread-row': '', 'data-codex-view-key': 'capped-child', 'data-codex-parent-view-key': 'capped-root', 'data-codex-root-task-view-key': 'capped-root', 'data-parent-status': 'available', 'data-search': 'capped child', 'data-role': 'subagent', 'data-project': 'p-a', 'data-models': 'gpt-5', 'data-efforts': 'high', 'data-codex-periods': 'recent|7d|30d|all', 'data-codex-days': '2026-07-20', 'data-sort-title': 'capped child', 'data-sort-time': '50' });
  const toggle = el('button', { 'data-codex-action': 'toggle-thread-children', 'data-codex-thread-key': 'root-a' });
  rootRow.append(toggle);
  const sessionTable = el('table', { 'data-codex-sort-table': 'sessions' });
  const sessionTitleSort = el('th', { 'data-codex-sort-key': 'title', 'aria-sort': 'none' });
  const sessionTitleSortButton = el('button', { 'data-codex-action': 'sort-sessions', 'data-codex-sort-key': 'title' });
  sessionTitleSort.append(sessionTitleSortButton);
  const sessionSort = el('th', { 'data-codex-sort-key': 'recent', 'aria-sort': 'none' });
  const sessionSortButton = el('button', { 'data-codex-action': 'sort-sessions', 'data-codex-sort-key': 'recent' });
  sessionSort.append(sessionSortButton);
  const sessionBody = el('tbody').append(rootRow, childRow, rootBRow);
  if (fixtureOptions.rootlessCycle) {
    sessionBody.append(cycleRow);
  }
  if (fixtureOptions.rootBeyondCap) {
    sessionBody.append(cappedRootChildRow);
  }
  sessionTable.append(el('thead').append(el('tr').append(sessionTitleSort, sessionSort)), sessionBody);

  const projectRow = el('tr', { 'data-codex-project-view-key': 'p-a', 'data-sort-name': 'alpha', 'data-sort-processed': '5' });
  const projectDetail = el('tr', { 'data-codex-project-detail': 'p-a' });
  const projectToggle = el('button', { 'data-codex-action': 'project-sessions', 'data-codex-project-view-key': 'p-a' });
  projectRow.append(projectToggle);
  const projectSessionsAction = el('button', { 'data-codex-action': 'view-project-sessions', 'data-codex-project-view-key': 'p-a' });
  projectDetail.append(projectSessionsAction);
  const projectBRow = el('tr', { 'data-codex-project-view-key': 'p-b', 'data-sort-name': 'beta', 'data-sort-processed': '2' });
  const projectBDetail = el('tr', { 'data-codex-project-detail': 'p-b' });
  const projectTable = el('table', { 'data-codex-sort-table': 'projects' });
  const projectBody = el('tbody').append(projectRow, projectDetail, projectBRow, projectBDetail);
  const projectSort = el('th', { 'data-codex-sort-key': 'name', 'aria-sort': 'none' });
  const projectSortButton = el('button', { 'data-codex-action': 'sort-projects', 'data-codex-sort-key': 'name' });
  projectSort.append(projectSortButton);
  const projectProcessedSort = el('th', { 'data-codex-sort-key': 'processed', 'aria-sort': 'none' });
  const projectProcessedSortButton = el('button', { 'data-codex-action': 'sort-projects', 'data-codex-sort-key': 'processed' });
  projectProcessedSort.append(projectProcessedSortButton);
  const validSetting = el('input', { 'data-codex-action': 'set-setting', 'data-codex-setting-key': 'compactNumbers', 'data-codex-setting-type': 'boolean', 'data-codex-setting-value-source': 'checked' });
  validSetting.checked = true;
  const numberSetting = el('input', { type: 'number', min: '0', max: '2', step: '1', 'data-codex-action': 'set-setting', 'data-codex-setting-key': 'tokenDecimalPlaces', 'data-codex-setting-type': 'number', 'data-codex-setting-value-source': 'value' });
  const validReset = el('button', { 'data-codex-action': 'reset-settings', 'data-codex-setting-keys': '["compactNumbers","language"]' });
  const validViewTask = el('button', { 'data-codex-action': 'view-task', 'data-codex-task-key': 'root-a', 'data-codex-project-key': 'p-a' });
  const fallbackViewTask = el('button', { 'data-codex-action': 'view-task', 'data-codex-task-key': 'task-a', 'data-codex-project-key': 'p-a' });
  const rootlessCycleViewTask = el('button', { 'data-codex-action': 'view-task', 'data-codex-task-key': 'cycle-representative', 'data-codex-project-key': 'p-cycle' });
  const cappedRootViewTask = el('button', { 'data-codex-action': 'view-task', 'data-codex-task-key': 'capped-root', 'data-codex-project-key': 'p-a' });

  projectTable.append(el('thead').append(el('tr').append(projectSort, projectProcessedSort)), projectBody);
  layout.append(search, role, projectFilter, modelFilter, effortFilter, periodFilter, chips, clearFilters, count, sessionTable);
  root.append(
    refreshHeader,
    settingsHeader,
    pageTablist,
    overview,
    explore.append(
      projectsTab,
      sessionsTab,
      modelsEffortTab,
      projects.append(projectTable),
      sessions.append(layout),
      modelsEffort,
    ),
    recommendations,
    settings,
    validSetting,
    numberSetting,
    validReset,
    validViewTask,
    fallbackViewTask,
    ...(fixtureOptions.rootlessCycle ? [rootlessCycleViewTask] : []),
    ...(fixtureOptions.rootBeyondCap ? [cappedRootViewTask] : []),
  );
  const vscode = {
    state: { openDetails: ['host-sibling'], codexUi: initialCodexUi } as Record<string, unknown>,
    messages: [] as unknown[],
    setStateCalls: 0,
    getState(): Record<string, unknown> { return this.state; },
    setState(value: Record<string, unknown>): void { this.setStateCalls += 1; this.state = value; },
    postMessage(value: unknown): void { this.messages.push(value); },
  };
  assert.equal(
    root.querySelectorAll('[data-codex-thread-row]').length,
    3 + Number(Boolean(fixtureOptions.rootlessCycle)) +
      Number(Boolean(fixtureOptions.rootBeyondCap)),
  );
  runInNewContext(getCodexClientScript(), {
    document: { querySelector: (selector: string) => selector === '[data-codex-root]' ? root : null, createElement: (tag: string) => el(tag) },
    vscode,
    console,
    Number,
    String,
    JSON,
    Math,
    Set,
    Array,
  });
  return {
    root,
    vscode,
    elements: {
      refreshHeader, settingsHeader, settings,
      pageTablist, overviewTab, exploreTab, recommendationsTab, overview, explore, recommendations,
      recentScope, sevenScope, recentPanel, sevenPanel, recentDateBar, recentDateRow, sevenDateBar, sevenDateRow,
      metricGroup, processedMetric, freshMetric, firstValue, firstBar, secondBar, yaxis,
      recommendationRecent, recommendationSeven, recommendationAll, recommendationRecentPanel, recommendationSevenPanel, recommendationAllPanel,
      projectsTab, sessionsTab, modelsEffortTab, projects, sessions, modelsEffort,
      modelRecent, modelSeven, modelRecentPanel, modelSevenPanel,
      search, role, projectFilter, modelFilter, effortFilter, periodFilter, sevenDayPeriodOption, chips, clearFilters, count, layout,
      rootRow, childRow, rootBRow, cycleRow, cappedRootChildRow, toggle, sessionTable, sessionTitleSort, sessionTitleSortButton, sessionSort, sessionSortButton, sessionBody,
      projectRow, projectDetail, projectToggle, projectSessionsAction, projectBRow, projectBDetail, projectSort, projectSortButton, projectProcessedSort, projectProcessedSortButton, projectBody,
      validSetting, numberSetting, validReset, validViewTask, fallbackViewTask, rootlessCycleViewTask, cappedRootViewTask,
    },
  };
}

function stateSnapshot(fixture: ReturnType<typeof controllerFixture>): string {
  return JSON.stringify(fixture.vscode.state.codexUi);
}

test('Codex client installs one root-scoped delegated controller', () => {
  const script = getCodexClientScript();
  assert.match(script, /^\(function\(\) \{/);
  assert.match(script, /\[data-codex-root\]/);
  for (const event of ['click', 'input', 'change', 'keydown']) {
    assert.match(script, new RegExp(`root\\.addEventListener\\('${event}'`));
  }
  assert.match(script, /closest\('\[data-codex-action\]'\)/);
  assert.match(script, /vscode\.getState\(\)/);
  assert.match(script, /hostState\.codexUi = nextState/);
  assert.match(script, /vscode\.setState\(hostState\)/);
  assert.doesNotMatch(script, /\['click', 'keydown'\]\.indexOf\(event\.type\)/);
  assert.doesNotMatch(script, /window\.|localStorage|eval\(|new Function|onclick=/);
});

test('Codex header refresh posts once and settings stays in the Codex controller', () => {
  const fixture = controllerFixture();

  const refresh = fixture.root.dispatch('click', fixture.elements.refreshHeader);
  assert.equal(refresh.defaultPrevented, true);
  assert.equal(refresh.propagationStopped, true);
  assert.equal(JSON.stringify(fixture.vscode.messages), JSON.stringify([{ command: 'refresh' }]));

  const settings = fixture.root.dispatch('click', fixture.elements.settingsHeader);
  assert.equal(settings.defaultPrevented, true);
  assert.equal(settings.propagationStopped, true);
  const state = fixture.vscode.state.codexUi as Record<string, unknown>;
  assert.equal(state.page, 'settings');
  assert.equal(state.returnPage, 'overview');
  assert.equal(fixture.elements.settings.hidden, false);
  assert.equal(JSON.stringify(fixture.vscode.messages), JSON.stringify([{ command: 'refresh' }]));
});

test('controller restores pruned state without overwriting host siblings', () => {
  const fixture = controllerFixture({
    version: 1,
    page: 'explore',
    returnPage: 'overview',
    exploreView: 'sessions',
    search: 'x'.repeat(250),
    filters: { role: 'missing-role', project: 'missing-project' },
    expandedProjects: ['p-a', 'missing-project'],
    collapsedTasks: ['root-a', 'missing-task'],
  });
  const state = fixture.vscode.state.codexUi as any;
  assert.deepEqual(fixture.vscode.state.openDetails, ['host-sibling']);
  assert.equal(state.page, 'explore');
  assert.equal(state.exploreView, 'sessions');
  assert.equal(state.search.length, 200);
  assert.equal(state.filters.role, '');
  assert.equal(state.filters.project, '');
  assert.deepEqual(Array.from(state.expandedProjects), ['p-a']);
  assert.deepEqual(Array.from(state.collapsedTasks), ['root-a']);
  assert.equal(fixture.elements.explore.hidden, false);
  assert.equal(fixture.elements.sessions.hidden, false);
  assert.equal(fixture.elements.projectDetail.hidden, false);
  assert.equal(fixture.elements.childRow.hidden, true);
});

test('saved 7d period is pruned when the restored DOM only exposes it as disabled', () => {
  const complete = controllerFixture({
    version: 1,
    page: 'explore',
    exploreView: 'sessions',
    filters: { period: '7d' },
  });
  assert.equal((complete.vscode.state.codexUi as any).filters.period, '7d');
  assert.equal(complete.elements.periodFilter.value, '7d');
  assert.equal(complete.elements.layout.getAttribute('data-codex-session-layout'), 'flat');
  assert.equal(complete.elements.chips.children.length, 1);

  const restored = controllerFixture(
    JSON.parse(JSON.stringify(complete.vscode.state.codexUi)),
    { sevenDayPeriodDisabled: true },
  );
  const state = restored.vscode.state.codexUi as any;
  assert.equal(state.filters.period, '');
  assert.equal(restored.elements.periodFilter.value, '');
  assert.equal(restored.elements.layout.getAttribute('data-codex-session-layout'), 'tree');
  assert.equal(restored.elements.count.textContent, '3');
  assert.equal(restored.elements.chips.children.length, 0);
  assert.equal(restored.elements.clearFilters.hidden, true);
  assert.equal(restored.vscode.setStateCalls, 1);

  const callsBeforeChange = restored.vscode.setStateCalls;
  restored.elements.periodFilter.value = '7d';
  const event = restored.root.dispatch('change', restored.elements.periodFilter);
  assert.equal(event.defaultPrevented, false);
  assert.equal(event.propagationStopped, false);
  assert.equal(restored.vscode.setStateCalls, callsBeforeChange);
  assert.equal((restored.vscode.state.codexUi as any).filters.period, '');
  assert.equal(restored.elements.periodFilter.value, '');
  assert.equal(restored.elements.layout.getAttribute('data-codex-session-layout'), 'tree');
  assert.equal(restored.elements.count.textContent, '3');
  assert.equal(restored.elements.chips.children.length, 0);
  assert.equal(restored.elements.clearFilters.hidden, true);
});

test('changing a period select to an aria-disabled option resyncs without persisting or consuming', () => {
  const fixture = controllerFixture(undefined, { sevenDayPeriodAriaDisabled: true });
  const before = stateSnapshot(fixture);
  const callsBeforeChange = fixture.vscode.setStateCalls;
  fixture.elements.periodFilter.value = '7d';
  const event = fixture.root.dispatch('change', fixture.elements.periodFilter);
  assert.equal(event.defaultPrevented, false);
  assert.equal(event.propagationStopped, false);
  assert.equal(fixture.vscode.setStateCalls, callsBeforeChange);
  assert.equal(stateSnapshot(fixture), before);
  assert.equal((fixture.vscode.state.codexUi as any).filters.period, '');
  assert.equal(fixture.elements.periodFilter.value, '');
  assert.equal(fixture.elements.layout.getAttribute('data-codex-session-layout'), 'tree');
  assert.equal(fixture.elements.count.textContent, '3');
  assert.equal(fixture.elements.chips.children.length, 0);
  assert.equal(fixture.elements.clearFilters.hidden, true);
  assert.equal(fixture.vscode.messages.length, 0);
});

const rejectedNumberSettings: Array<{
  name: string;
  value: string;
  valueAsNumber: number;
  valid?: boolean;
  min?: string;
  max?: string;
  step?: string;
}> = [
  { name: 'blank', value: '', valueAsNumber: Number.NaN },
  { name: 'whitespace', value: '   ', valueAsNumber: Number.NaN },
  { name: 'NaN', value: 'not-a-number', valueAsNumber: Number.NaN },
  { name: 'invalid validity', value: '1', valueAsNumber: 1, valid: false },
  { name: 'input minimum violation', value: '0', valueAsNumber: 0, min: '1' },
  { name: 'input maximum violation', value: '2', valueAsNumber: 2, max: '1' },
  { name: 'input step violation', value: '1', valueAsNumber: 1, step: '2' },
  { name: 'schema range violation', value: '3', valueAsNumber: 3 },
];

for (const valueCase of rejectedNumberSettings) {
  test(`number setting rejects ${valueCase.name} without posting or persisting`, () => {
    const fixture = controllerFixture();
    const input = fixture.elements.numberSetting;
    input.value = valueCase.value;
    input.valueAsNumber = valueCase.valueAsNumber;
    input.validity = { valid: valueCase.valid ?? true };
    if (valueCase.min !== undefined) input.setAttribute('min', valueCase.min);
    if (valueCase.max !== undefined) input.setAttribute('max', valueCase.max);
    if (valueCase.step !== undefined) input.setAttribute('step', valueCase.step);
    const before = stateSnapshot(fixture);
    const event = fixture.root.dispatch('change', input);
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.propagationStopped, false);
    assert.equal(fixture.vscode.messages.length, 0);
    assert.equal(stateSnapshot(fixture), before);
  });
}

test('number setting prefers finite valueAsNumber, falls back to nonempty numeric text, and posts once per change', () => {
  const nativeValue = controllerFixture();
  nativeValue.elements.numberSetting.value = '2';
  nativeValue.elements.numberSetting.valueAsNumber = 1;
  let event = nativeValue.root.dispatch('change', nativeValue.elements.numberSetting);
  assert.equal(event.defaultPrevented, true);
  assert.equal(nativeValue.vscode.messages.length, 1);
  let message = nativeValue.vscode.messages[0] as Record<string, unknown>;
  assert.equal(message.command, 'updateSetting');
  assert.equal(message.key, 'tokenDecimalPlaces');
  assert.equal(message.value, 1);
  nativeValue.root.dispatch('click', nativeValue.elements.numberSetting);
  assert.equal(nativeValue.vscode.messages.length, 1);

  const fallbackValue = controllerFixture();
  fallbackValue.elements.numberSetting.value = '2';
  fallbackValue.elements.numberSetting.valueAsNumber = Number.NaN;
  event = fallbackValue.root.dispatch('change', fallbackValue.elements.numberSetting);
  assert.equal(event.defaultPrevented, true);
  assert.equal(fallbackValue.vscode.messages.length, 1);
  message = fallbackValue.vscode.messages[0] as Record<string, unknown>;
  assert.equal(message.command, 'updateSetting');
  assert.equal(message.key, 'tokenDecimalPlaces');
  assert.equal(message.value, 2);
});

test('delegated page/filter/collapse/expand/sort and keyboard actions mutate the fixture DOM', () => {
  const fixture = controllerFixture();
  const pageEvent = fixture.root.dispatch('click', fixture.elements.exploreTab);
  assert.equal(pageEvent.defaultPrevented, true);
  assert.equal(pageEvent.propagationStopped, true);
  assert.equal(fixture.elements.explore.hidden, false);

  fixture.elements.search.value = 'beta';
  fixture.root.dispatch('input', fixture.elements.search);
  assert.equal(fixture.elements.rootRow.hidden, true);
  assert.equal(fixture.elements.childRow.hidden, false);
  assert.equal(fixture.elements.layout.getAttribute('data-codex-session-layout'), 'flat');
  assert.equal(fixture.elements.childRow.classList.contains('codex-child-thread'), false);

  fixture.elements.search.value = '';
  fixture.root.dispatch('input', fixture.elements.search);
  assert.equal(fixture.elements.childRow.classList.contains('codex-child-thread'), true);
  fixture.root.dispatch('click', fixture.elements.toggle);
  assert.equal(fixture.elements.childRow.hidden, true);
  fixture.root.dispatch('click', fixture.elements.projectToggle);
  assert.equal(fixture.elements.projectDetail.hidden, false);

  fixture.root.dispatch('click', fixture.elements.projectSortButton);
  assert.equal(fixture.elements.projectSort.getAttribute('aria-sort'), 'ascending');

  const callsBeforeArrow = fixture.vscode.setStateCalls;
  const keyEvent = fixture.root.dispatch('keydown', fixture.elements.overviewTab, 'ArrowRight');
  assert.equal(keyEvent.defaultPrevented, true);
  assert.equal(fixture.elements.exploreTab.focused, true);
  assert.equal(fixture.elements.explore.hidden, false);
  assert.equal(fixture.vscode.setStateCalls, callsBeforeArrow + 1);
});

for (const keyCase of [{ key: 'Enter', label: 'Enter' }, { key: ' ', label: 'Space' }]) {
  test(`tab ${keyCase.label} performs and persists its action exactly once`, () => {
    const fixture = controllerFixture();
    const callsBeforeKey = fixture.vscode.setStateCalls;
    const event = fixture.root.dispatch('keydown', fixture.elements.exploreTab, keyCase.key);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.propagationStopped, true);
    assert.equal(fixture.vscode.setStateCalls, callsBeforeKey + 1);
    assert.equal((fixture.vscode.state.codexUi as any).page, 'explore');
    assert.equal(fixture.elements.explore.hidden, false);
  });
}

for (const keyCase of [
  { key: 'ArrowLeft', page: 'recommendations' },
  { key: 'ArrowRight', page: 'explore' },
  { key: 'Home', page: 'overview' },
  { key: 'End', page: 'recommendations' },
]) {
  test(`tab ${keyCase.key} changes roving focus and activates exactly once`, () => {
    const fixture = controllerFixture();
    const callsBeforeKey = fixture.vscode.setStateCalls;
    const event = fixture.root.dispatch('keydown', fixture.elements.overviewTab, keyCase.key);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.propagationStopped, true);
    assert.equal(fixture.vscode.setStateCalls, callsBeforeKey + 1);
    assert.equal((fixture.vscode.state.codexUi as any).page, keyCase.page);
  });
}

for (const keyCase of [{ key: 'Enter', label: 'Enter' }, { key: ' ', label: 'Space' }]) {
  test(`non-tab ${keyCase.label} performs no action while a later click performs exactly one`, () => {
    const fixture = controllerFixture();
    const before = stateSnapshot(fixture);
    const callsBeforeKey = fixture.vscode.setStateCalls;
    const keyEvent = fixture.root.dispatch('keydown', fixture.elements.projectToggle, keyCase.key);
    assert.equal(keyEvent.defaultPrevented, false);
    assert.equal(keyEvent.propagationStopped, false);
    assert.equal(fixture.vscode.setStateCalls, callsBeforeKey);
    assert.equal(stateSnapshot(fixture), before);

    const clickEvent = fixture.root.dispatch('click', fixture.elements.projectToggle);
    assert.equal(clickEvent.defaultPrevented, true);
    assert.equal(clickEvent.propagationStopped, true);
    assert.equal(fixture.vscode.setStateCalls, callsBeforeKey + 1);
    assert.deepEqual(Array.from((fixture.vscode.state.codexUi as any).expandedProjects), ['p-a']);
  });
}

const malformedFilterCases: Array<{
  name: string;
  eventType: 'input' | 'change';
  resyncToCanonical?: boolean;
  target: (fixture: ReturnType<typeof controllerFixture>) => FixtureElement;
}> = [
  {
    name: 'search control on change instead of input',
    eventType: 'change',
    target: (fixture) => {
      fixture.elements.search.value = 'alpha';
      return fixture.elements.search;
    },
  },
  {
    name: 'select control on input instead of change',
    eventType: 'input',
    target: (fixture) => {
      fixture.elements.role.value = 'root';
      return fixture.elements.role;
    },
  },
  {
    name: 'non-input search element',
    eventType: 'input',
    target: (fixture) => {
      const target = el('div', { 'data-codex-action': 'filter-sessions', 'data-codex-session-search': '' });
      target.value = 'alpha';
      fixture.root.append(target);
      return target;
    },
  },
  {
    name: 'non-select filter element',
    eventType: 'change',
    target: (fixture) => {
      const target = el('input', { 'data-codex-action': 'filter-sessions', 'data-codex-session-filter': 'role' });
      target.value = 'root';
      fixture.root.append(target);
      return target;
    },
  },
  {
    name: 'unknown select filter key',
    eventType: 'change',
    target: (fixture) => {
      const target = el('select', { 'data-codex-action': 'filter-sessions', 'data-codex-session-filter': 'secret' });
      target.value = 'root';
      fixture.root.append(target);
      return target;
    },
  },
  {
    name: 'select value missing from enabled options',
    eventType: 'change',
    resyncToCanonical: true,
    target: (fixture) => {
      fixture.elements.role.value = 'missing';
      return fixture.elements.role;
    },
  },
];

for (const valueCase of malformedFilterCases) {
  test(`filter action rejects ${valueCase.name} without consuming the event`, () => {
    const fixture = controllerFixture();
    const target = valueCase.target(fixture);
    const before = stateSnapshot(fixture);
    const callsBeforeEvent = fixture.vscode.setStateCalls;
    const attemptedValue = target.value;
    const event = fixture.root.dispatch(valueCase.eventType, target);
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.propagationStopped, false);
    assert.equal(fixture.vscode.setStateCalls, callsBeforeEvent);
    assert.equal(stateSnapshot(fixture), before);
    assert.equal(target.value, valueCase.resyncToCanonical ? '' : attemptedValue);
    assert.equal(fixture.vscode.messages.length, 0);
  });
}

test('duplicate canonical-key select with a valid value is completely ignored', () => {
  const fixture = controllerFixture();
  const duplicate = el('select', { 'data-codex-action': 'filter-sessions', 'data-codex-session-filter': 'role' }).append(
    el('option', { value: '' }),
    el('option', { value: 'root' }),
  );
  duplicate.value = 'root';
  fixture.root.append(duplicate);
  const before = stateSnapshot(fixture);
  const callsBeforeEvent = fixture.vscode.setStateCalls;
  const event = fixture.root.dispatch('change', duplicate);
  assert.equal(event.defaultPrevented, false);
  assert.equal(event.propagationStopped, false);
  assert.equal(fixture.vscode.setStateCalls, callsBeforeEvent);
  assert.equal(stateSnapshot(fixture), before);
  assert.equal(fixture.elements.role.value, '');
  assert.equal(duplicate.value, 'root');
});

test('duplicate canonical-key select with an invalid value is ignored without resync', () => {
  const fixture = controllerFixture();
  const duplicate = el('select', { 'data-codex-action': 'filter-sessions', 'data-codex-session-filter': 'role' }).append(
    el('option', { value: '' }),
    el('option', { value: 'missing' }),
  );
  duplicate.value = 'missing';
  fixture.root.append(duplicate);
  const before = stateSnapshot(fixture);
  const callsBeforeEvent = fixture.vscode.setStateCalls;
  const event = fixture.root.dispatch('change', duplicate);
  assert.equal(event.defaultPrevented, false);
  assert.equal(event.propagationStopped, false);
  assert.equal(fixture.vscode.setStateCalls, callsBeforeEvent);
  assert.equal(stateSnapshot(fixture), before);
  assert.equal(fixture.elements.role.value, '');
  assert.equal(duplicate.value, 'missing');
});

test('duplicate search input is completely ignored', () => {
  const fixture = controllerFixture();
  const duplicate = el('input', { type: 'search', 'data-codex-action': 'filter-sessions', 'data-codex-session-search': '' });
  duplicate.value = 'alpha';
  fixture.root.append(duplicate);
  const before = stateSnapshot(fixture);
  const callsBeforeEvent = fixture.vscode.setStateCalls;
  const event = fixture.root.dispatch('input', duplicate);
  assert.equal(event.defaultPrevented, false);
  assert.equal(event.propagationStopped, false);
  assert.equal(fixture.vscode.setStateCalls, callsBeforeEvent);
  assert.equal(stateSnapshot(fixture), before);
  assert.equal(fixture.elements.search.value, '');
  assert.equal(duplicate.value, 'alpha');
});

test('filter chips remove one filter and clear-filters resets all filter state', () => {
  const fixture = controllerFixture();
  fixture.elements.search.value = 'beta';
  fixture.root.dispatch('input', fixture.elements.search);
  assert.equal(fixture.elements.chips.children.length, 1);
  const queryChip = fixture.elements.chips.children[0];
  assert.equal(queryChip.getAttribute('data-codex-filter-key'), 'query');
  const removeEvent = fixture.root.dispatch('click', queryChip);
  assert.equal(removeEvent.defaultPrevented, true);
  assert.equal((fixture.vscode.state.codexUi as any).search, '');
  assert.equal(fixture.elements.chips.children.length, 0);

  fixture.elements.search.value = 'alpha';
  fixture.root.dispatch('input', fixture.elements.search);
  fixture.elements.role.value = 'root';
  fixture.root.dispatch('change', fixture.elements.role);
  assert.equal(fixture.elements.chips.children.length, 2);
  assert.equal(fixture.elements.clearFilters.hidden, false);
  const clearEvent = fixture.root.dispatch('click', fixture.elements.clearFilters);
  assert.equal(clearEvent.defaultPrevented, true);
  const state = fixture.vscode.state.codexUi as any;
  assert.equal(state.search, '');
  assert.equal(state.filters.role, '');
  assert.equal(fixture.elements.chips.children.length, 0);
  assert.equal(fixture.elements.clearFilters.hidden, true);
  assert.equal(fixture.elements.layout.getAttribute('data-codex-session-layout'), 'tree');
  assert.equal(fixture.elements.count.textContent, '3');
});

test('project toggle requires a separate same-key detail row', () => {
  const fixture = controllerFixture();
  const malformed = el('button', { 'data-codex-action': 'project-sessions', 'data-codex-project-view-key': 'p-ghost' });
  fixture.root.append(malformed);
  const before = stateSnapshot(fixture);
  const event = fixture.root.dispatch('click', malformed);
  assert.equal(event.defaultPrevented, false);
  assert.equal(event.propagationStopped, false);
  assert.equal(stateSnapshot(fixture), before);
});

test('valid session sort keeps lineage adjacent and updates only the session sort state', () => {
  const fixture = controllerFixture();
  const event = fixture.root.dispatch('click', fixture.elements.sessionTitleSortButton);
  assert.equal(event.defaultPrevented, true);
  const state = fixture.vscode.state.codexUi as any;
  assert.equal(state.sort.sessions.key, 'title');
  assert.equal(state.sort.sessions.direction, 'asc');
  assert.equal(state.sort.projects.key, 'processed');
  assert.deepEqual(
    fixture.elements.sessionBody.children.map((row) => row.getAttribute('data-codex-view-key')),
    ['root-a', 'child-a', 'root-b'],
  );
  assert.equal(fixture.elements.sessionTitleSort.getAttribute('aria-sort'), 'ascending');
});

const malformedSortCases: Array<{
  name: string;
  target: (fixture: ReturnType<typeof controllerFixture>) => FixtureElement;
}> = [
  {
    name: 'non-whitelisted key',
    target: (fixture) => {
      const header = el('th', { 'data-codex-sort-key': '__proto__', 'aria-sort': 'none' });
      const target = el('button', { 'data-codex-action': 'sort-sessions', 'data-codex-sort-key': '__proto__' });
      header.append(target);
      fixture.elements.sessionTable.querySelector('thead')!.children[0].append(header);
      return target;
    },
  },
  {
    name: 'non-header trigger',
    target: (fixture) => {
      const target = el('button', { 'data-codex-action': 'sort-sessions', 'data-codex-sort-key': 'recent' });
      fixture.elements.sessionTable.append(target);
      return target;
    },
  },
  {
    name: 'table without row inventory',
    target: (fixture) => {
      const table = el('table', { 'data-codex-sort-table': 'sessions' });
      const header = el('th', { 'data-codex-sort-key': 'recent', 'aria-sort': 'none' });
      const target = el('button', { 'data-codex-action': 'sort-sessions', 'data-codex-sort-key': 'recent' });
      header.append(target);
      table.append(el('thead').append(el('tr').append(header)), el('tbody'));
      fixture.root.append(table);
      return target;
    },
  },
];

for (const valueCase of malformedSortCases) {
  test(`sort action rejects ${valueCase.name} without persisting`, () => {
    const fixture = controllerFixture();
    const target = valueCase.target(fixture);
    const before = stateSnapshot(fixture);
    const event = fixture.root.dispatch('click', target);
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.propagationStopped, false);
    assert.equal(stateSnapshot(fixture), before);
  });
}

test('delegated scope metric and valid settings actions update DOM state and host messages', () => {
  const fixture = controllerFixture();
  assert.equal(fixture.elements.metricGroup.hidden, true);
  fixture.root.dispatch('click', fixture.elements.sevenScope);
  assert.equal(fixture.elements.recentPanel.hidden, true);
  assert.equal(fixture.elements.sevenPanel.hidden, false);
  assert.equal(fixture.elements.metricGroup.hidden, false);
  assert.equal((fixture.vscode.state.codexUi as any).overviewScope, '7d');

  fixture.root.dispatch('click', fixture.elements.freshMetric);
  assert.equal(fixture.elements.firstBar.style.height, '25px');
  assert.equal(fixture.elements.secondBar.style.height, '100px');
  assert.equal(fixture.elements.firstBar.classList.contains('input-bar'), true);
  assert.equal(fixture.elements.firstBar.getAttribute('title'), 'one · Fresh: 2f');
  assert.equal(fixture.elements.firstBar.getAttribute('aria-label'), 'one · Fresh: 2f');
  assert.equal(fixture.elements.secondBar.getAttribute('title'), 'two · Fresh: 8f');
  assert.equal(fixture.elements.secondBar.getAttribute('aria-label'), 'two · Fresh: 8f');
  assert.equal(fixture.elements.firstValue.textContent, '2f');
  assert.equal(fixture.elements.processedMetric.getAttribute('aria-pressed'), 'false');
  assert.equal(fixture.elements.freshMetric.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(fixture.elements.yaxis.children.map((value) => value.textContent), ['8', '4', '0']);
  assert.equal((fixture.vscode.state.codexUi as any).chartMetric, 'fresh');

  fixture.root.dispatch('click', fixture.elements.validSetting);
  assert.equal(fixture.vscode.messages.length, 0);
  const event = fixture.root.dispatch('change', fixture.elements.validSetting);
  assert.equal(event.defaultPrevented, true);
  const message = fixture.vscode.messages[fixture.vscode.messages.length - 1] as Record<string, unknown>;
  assert.equal(message.command, 'updateSetting');
  assert.equal(message.key, 'compactNumbers');
  assert.equal(message.value, true);
  fixture.root.dispatch('click', fixture.elements.validReset);
  const reset = fixture.vscode.messages[fixture.vscode.messages.length - 1] as Record<string, unknown>;
  assert.equal(reset.command, 'resetAllSettings');
  assert.deepEqual(Array.from(reset.keys as string[]), ['compactNumbers', 'language']);
});

test('recommendation and model-effort scopes require enabled controls with matching panels', () => {
  const fixture = controllerFixture();
  let event = fixture.root.dispatch('click', fixture.elements.recommendationAll);
  assert.equal(event.defaultPrevented, true);
  assert.equal((fixture.vscode.state.codexUi as any).recommendationScope, 'all');
  assert.equal(fixture.elements.recommendationAllPanel.hidden, false);
  assert.equal(fixture.elements.recommendationRecentPanel.hidden, true);

  fixture.elements.recommendationSeven.disabled = false;
  fixture.elements.recommendationSeven.removeAttribute('disabled');
  const beforeDisabled = stateSnapshot(fixture);
  event = fixture.root.dispatch('click', fixture.elements.recommendationSeven);
  assert.equal(event.defaultPrevented, false);
  assert.equal(stateSnapshot(fixture), beforeDisabled);

  event = fixture.root.dispatch('click', fixture.elements.modelSeven);
  assert.equal(event.defaultPrevented, true);
  assert.equal((fixture.vscode.state.codexUi as any).exploreScope, '7d');
  assert.equal(fixture.elements.modelSevenPanel.hidden, false);
  assert.equal(fixture.elements.modelRecentPanel.hidden, true);

  const rogue = el('button', { 'data-codex-action': 'set-model-effort-scope', 'data-codex-model-effort-scope': '30d' });
  fixture.root.append(rogue);
  const beforeRogue = stateSnapshot(fixture);
  event = fixture.root.dispatch('click', rogue);
  assert.equal(event.defaultPrevented, false);
  assert.equal(stateSnapshot(fixture), beforeRogue);
});

test('date drilldown from the visible Overview panel opens exact-day Sessions results', () => {
  const fixture = controllerFixture({
    version: 1,
    page: 'overview',
    search: 'old search',
    filters: { role: 'subagent', project: 'p-b', model: 'gpt-5', effort: 'medium', period: '7d' },
  });
  const before = stateSnapshot(fixture);
  let event = fixture.root.dispatch('click', fixture.elements.sevenDateBar);
  assert.equal(event.defaultPrevented, false);
  assert.equal(event.propagationStopped, false);
  assert.equal(fixture.elements.sevenDateRow.classList.contains('selected'), false);
  assert.equal(stateSnapshot(fixture), before);

  event = fixture.root.dispatch('click', fixture.elements.recentDateBar);
  assert.equal(event.defaultPrevented, true);
  const state = fixture.vscode.state.codexUi as any;
  assert.equal(state.page, 'explore');
  assert.equal(state.exploreView, 'sessions');
  assert.deepEqual(
    { ...state.filters },
    { role: '', project: '', model: '', effort: '', period: '', date: '2026-07-20' },
  );
  assert.equal(fixture.elements.layout.getAttribute('data-codex-session-layout'), 'flat');
  assert.equal(fixture.elements.rootRow.hidden, false);
  assert.equal(fixture.elements.childRow.hidden, true);
  assert.equal(fixture.elements.rootBRow.hidden, false);
  assert.equal(fixture.elements.count.textContent, '2');
  assert.equal(fixture.elements.chips.children[0].getAttribute('data-codex-filter-key'), 'date');
  assert.equal(fixture.elements.chips.children[0].textContent, 'Date: 2026-07-20 ×');
});

test('restored absent exact day remains a safe zero-result filter instead of being pruned', () => {
  const fixture = controllerFixture({
    version: 1,
    page: 'explore',
    exploreView: 'sessions',
    filters: { date: '2099-12-31' },
  });
  const state = fixture.vscode.state.codexUi as any;
  assert.equal(state.filters.date, '2099-12-31');
  assert.equal(fixture.elements.count.textContent, '0');
  assert.equal(fixture.elements.chips.children[0].textContent, 'Date: 2099-12-31 ×');
});

test('project detail action opens Sessions with only its canonical project filter', () => {
  const fixture = controllerFixture({
    version: 1,
    page: 'explore',
    exploreView: 'projects',
    search: 'old search',
    filters: { role: 'subagent', model: 'gpt-5', effort: 'high', period: '7d', date: '2026-07-19' },
  });
  const event = fixture.root.dispatch('click', fixture.elements.projectSessionsAction);
  assert.equal(event.defaultPrevented, true);
  const state = fixture.vscode.state.codexUi as any;
  assert.equal(state.page, 'explore');
  assert.equal(state.exploreView, 'sessions');
  assert.equal(state.search, '');
  assert.deepEqual(
    { ...state.filters },
    { role: '', project: 'p-a', model: '', effort: '', period: '', date: '' },
  );
  assert.equal(fixture.elements.rootRow.hidden, false);
  assert.equal(fixture.elements.childRow.hidden, false);
  assert.equal(fixture.elements.rootBRow.hidden, true);
  assert.equal(fixture.elements.count.textContent, '2');
  assert.equal(fixture.elements.chips.children[0].textContent, 'project: Alpha ×');
});

test('view-task resolves only a same-project root row and focuses the resolved target', () => {
  const direct = controllerFixture();
  let event = direct.root.dispatch('click', direct.elements.validViewTask);
  assert.equal(event.defaultPrevented, true);
  let state = direct.vscode.state.codexUi as any;
  assert.equal(state.page, 'explore');
  assert.equal(state.exploreView, 'sessions');
  assert.equal(state.filters.project, 'p-a');
  assert.equal(direct.elements.rootRow.focused, true);
  assert.equal(direct.elements.rootRow.scrolled, true);

  const fallback = controllerFixture();
  event = fallback.root.dispatch('click', fallback.elements.fallbackViewTask);
  assert.equal(event.defaultPrevented, true);
  state = fallback.vscode.state.codexUi as any;
  assert.equal(state.filters.project, 'p-a');
  assert.equal(fallback.elements.rootRow.focused, true);
});

test('view-task resolves a rootless cycle representative and filters its project', () => {
  const fixture = controllerFixture(undefined, { rootlessCycle: true });
  const event = fixture.root.dispatch(
    'click',
    fixture.elements.rootlessCycleViewTask,
  );

  assert.equal(event.defaultPrevented, true);
  const state = fixture.vscode.state.codexUi as any;
  assert.equal(state.page, 'explore');
  assert.equal(state.exploreView, 'sessions');
  assert.equal(state.filters.project, 'p-cycle');
  assert.equal(fixture.elements.cycleRow.hidden, false);
  assert.equal(fixture.elements.rootRow.hidden, true);
  assert.equal(fixture.elements.childRow.hidden, true);
  assert.equal(fixture.elements.rootBRow.hidden, true);
  assert.equal(fixture.elements.count.textContent, '1');
  assert.equal(fixture.elements.chips.children[0].textContent, 'project: Cycle Project ×');
  assert.equal(fixture.elements.cycleRow.focused, true);
  assert.equal(fixture.elements.cycleRow.scrolled, true);
});

test('view-task resolves a same-project descendant when its capped root row is absent', () => {
  const fixture = controllerFixture(undefined, { rootBeyondCap: true });
  const event = fixture.root.dispatch(
    'click',
    fixture.elements.cappedRootViewTask,
  );

  assert.equal(event.defaultPrevented, true);
  const state = fixture.vscode.state.codexUi as any;
  assert.equal(state.page, 'explore');
  assert.equal(state.exploreView, 'sessions');
  assert.equal(state.filters.project, 'p-a');
  assert.equal(fixture.elements.cappedRootChildRow.hidden, false);
  assert.equal(fixture.elements.rootBRow.hidden, true);
  assert.equal(fixture.elements.cappedRootChildRow.focused, true);
  assert.equal(fixture.elements.cappedRootChildRow.scrolled, true);
});

test('view-task capped-root fallback rejects a descendant from another project', () => {
  const fixture = controllerFixture(undefined, { rootBeyondCap: true });
  const target = el('button', {
    'data-codex-action': 'view-task',
    'data-codex-task-key': 'capped-root',
    'data-codex-project-key': 'p-b',
  });
  fixture.root.append(target);
  const before = stateSnapshot(fixture);
  const event = fixture.root.dispatch('click', target);

  assert.equal(event.defaultPrevented, false);
  assert.equal(stateSnapshot(fixture), before);
  assert.equal(fixture.elements.cappedRootChildRow.focused, false);
  assert.equal(fixture.elements.cappedRootChildRow.scrolled, false);
});

const rejectedViewTaskCases = [
  { name: 'child task', task: 'child-a', project: 'p-a' },
  { name: 'unknown task', task: 'missing', project: 'p-a' },
  { name: 'project mismatch', task: 'root-a', project: 'p-b' },
];

for (const valueCase of rejectedViewTaskCases) {
  test(`view-task rejects ${valueCase.name} without changing page or filters`, () => {
    const fixture = controllerFixture();
    const target = el('button', {
      'data-codex-action': 'view-task',
      'data-codex-task-key': valueCase.task,
      'data-codex-project-key': valueCase.project,
    });
    fixture.root.append(target);
    const before = stateSnapshot(fixture);
    const event = fixture.root.dispatch('click', target);
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.propagationStopped, false);
    assert.equal(stateSnapshot(fixture), before);
    assert.equal(fixture.elements.rootRow.focused, false);
  });
}

test('unknown actions and malformed settings payloads fail closed', () => {
  const fixture = controllerFixture();
  const unknown = el('button', { 'data-codex-action': 'unknown-action' });
  fixture.root.append(unknown);
  const event = fixture.root.dispatch('click', unknown);
  assert.equal(event.defaultPrevented, false);
  assert.equal(fixture.vscode.messages.length, 0);

  const badSetting = el('input', { 'data-codex-action': 'set-setting', 'data-codex-setting-key': '__proto__', 'data-codex-setting-type': 'boolean', 'data-codex-setting-value-source': 'checked' });
  badSetting.checked = true;
  fixture.root.append(badSetting);
  fixture.root.dispatch('change', badSetting);
  const badReset = el('button', { 'data-codex-action': 'reset-settings', 'data-codex-setting-keys': '["ok",42]' });
  fixture.root.append(badReset);
  fixture.root.dispatch('click', badReset);
  assert.equal(fixture.vscode.messages.length, 0);
});
