/**
 * Return the dependency-free client controller for the Codex dashboard.
 * The script deliberately owns no global API: its only durable state is the
 * `codexUi` sibling in VS Code's webview state object.
 */
export function getCodexClientScript(): string {
  return `(function() {
  'use strict';
  var root = document.querySelector('[data-codex-root]');
  if (!root) { return; }

  var pages = ['overview', 'explore', 'recommendations', 'settings'];
  var returnPages = ['overview', 'explore', 'recommendations'];
  var scopes = ['recent', '7d', '30d', 'all'];
  var exploreViews = ['projects', 'sessions', 'models-effort'];
  var metrics = ['processed', 'fresh', 'output', 'reasoning', 'sessions'];
  var filterKeys = ['role', 'project', 'model', 'effort', 'period'];
  var filterRowAttributes = {
    role: 'data-role', project: 'data-project', model: 'data-models',
    effort: 'data-efforts', period: 'data-codex-periods'
  };
  var sortKeys = {
    projects: ['name', 'lastactive', 'processed', 'fresh', 'output', 'reasoning', 'roots', 'children'],
    sessions: ['title', 'recent', 'role', 'project', 'model', 'effort', 'processed', 'fresh', 'cache', 'output', 'reasoning', 'duration']
  };
  var settingTypes = {
    language: 'string', tokenDecimalPlaces: 'number', compactNumbers: 'boolean',
    releaseAnnouncements: 'boolean', 'codex.enabled': 'boolean',
    'codex.dataDirectory': 'string', 'codex.fileWatchSeconds': 'string',
    'codex.optimization.enabled': 'boolean', timezone: 'string',
    statusBarProvider: 'string', 'codex.statusMetric': 'string',
    dashboardAutoRefresh: 'boolean'
  };
  var settingEnums = {
    language: ['auto', 'en', 'de-DE', 'zh-TW', 'zh-CN', 'ja', 'ko', 'pt-BR', 'id'],
    'codex.fileWatchSeconds': ['0', '10', '30', '60', '120', '300'],
    statusBarProvider: ['auto', 'claude', 'codex'],
    'codex.statusMetric': ['fresh', 'processed', 'output']
  };
  var defaults = {
    version: 1, page: 'overview', returnPage: 'overview',
    overviewScope: 'recent', recommendationScope: 'recent',
    exploreView: 'projects', exploreScope: 'recent', chartMetric: 'processed',
    search: '', filters: { role: '', project: '', model: '', effort: '', period: '' },
    sort: { projects: { key: 'processed', direction: 'desc' }, sessions: { key: 'recent', direction: 'desc' } },
    expandedProjects: [], collapsedTasks: []
  };
  var state;
  var resolvedTaskTarget = null;

  function copyDefaults() {
    return {
      version: 1, page: defaults.page, returnPage: defaults.returnPage,
      overviewScope: defaults.overviewScope, recommendationScope: defaults.recommendationScope,
      exploreView: defaults.exploreView, exploreScope: defaults.exploreScope,
      chartMetric: defaults.chartMetric, search: '',
      filters: { role: '', project: '', model: '', effort: '', period: '' },
      sort: {
        projects: { key: defaults.sort.projects.key, direction: defaults.sort.projects.direction },
        sessions: { key: defaults.sort.sessions.key, direction: defaults.sort.sessions.direction }
      },
      expandedProjects: [], collapsedTasks: []
    };
  }

  function own(value, key) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { return undefined; }
    var descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : undefined;
  }

  function choice(value, allowed, fallback) {
    return typeof value === 'string' && allowed.indexOf(value) !== -1 ? value : fallback;
  }

  function text(value, fallback, maximum) {
    if (typeof value !== 'string') { return fallback; }
    return maximum === undefined ? value : value.slice(0, maximum);
  }

  function stringList(value) {
    if (!Array.isArray(value)) { return []; }
    var seen = new Set();
    var result = [];
    for (var index = 0; index < value.length && result.length < 100; index += 1) {
      var descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      var item = descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : undefined;
      if (typeof item === 'string' && !seen.has(item)) { seen.add(item); result.push(item); }
    }
    return result;
  }

  function sanitize(raw) {
    if (own(raw, 'version') !== 1) { return copyDefaults(); }
    var next = copyDefaults();
    next.page = choice(own(raw, 'page'), pages, next.page);
    next.returnPage = choice(own(raw, 'returnPage'), returnPages, next.returnPage);
    next.overviewScope = choice(own(raw, 'overviewScope'), scopes, next.overviewScope);
    next.recommendationScope = choice(own(raw, 'recommendationScope'), scopes, next.recommendationScope);
    next.exploreView = choice(own(raw, 'exploreView'), exploreViews, next.exploreView);
    next.exploreScope = choice(own(raw, 'exploreScope'), scopes, next.exploreScope);
    next.chartMetric = choice(own(raw, 'chartMetric'), metrics, next.chartMetric);
    next.search = text(own(raw, 'search'), '', 200);
    var rawFilters = own(raw, 'filters');
    filterKeys.forEach(function(key) { next.filters[key] = text(own(rawFilters, key), ''); });
    var rawSort = own(raw, 'sort');
    ['projects', 'sessions'].forEach(function(group) {
      var value = own(rawSort, group);
      next.sort[group].key = text(own(value, 'key'), next.sort[group].key, 40);
      next.sort[group].direction = choice(own(value, 'direction'), ['asc', 'desc'], next.sort[group].direction);
    });
    next.expandedProjects = stringList(own(raw, 'expandedProjects'));
    next.collapsedTasks = stringList(own(raw, 'collapsedTasks'));
    return next;
  }

  function values(selector, attribute) {
    var result = [];
    root.querySelectorAll(selector).forEach(function(element) {
      var value = element.getAttribute(attribute);
      if (value !== null && result.indexOf(value) === -1) { result.push(value); }
    });
    return result;
  }

  function tagIs(element, name) {
    return Boolean(element && typeof element.tagName === 'string' && element.tagName.toLowerCase() === name);
  }

  function isDisabled(element) {
    return !element || Boolean(element.disabled) || element.getAttribute('aria-disabled') === 'true';
  }

  function hasElement(selector, candidate) {
    var found = false;
    root.querySelectorAll(selector).forEach(function(element) {
      if (element === candidate) { found = true; }
    });
    return found;
  }

  function hasEnabledValue(selector, attribute, value) {
    var found = false;
    root.querySelectorAll(selector).forEach(function(element) {
      if (!isDisabled(element) && element.getAttribute(attribute) === value) { found = true; }
    });
    return found;
  }

  function firstEnabledValue(selector, attribute, fallback) {
    var result = fallback;
    var found = false;
    root.querySelectorAll(selector).forEach(function(element) {
      if (!found && !isDisabled(element)) {
        var value = element.getAttribute(attribute);
        if (value !== null) { result = value; found = true; }
      }
    });
    return result;
  }

  function rowHas(attribute, value) {
    if (!value) { return true; }
    var found = false;
    root.querySelectorAll('[data-codex-thread-row]').forEach(function(row) {
      var raw = row.getAttribute(attribute) || '';
      if (raw === value || raw.split('|').indexOf(value) !== -1) { found = true; }
    });
    return found;
  }

  function enabledOption(control, value) {
    if (!tagIs(control, 'select') || !control.options) { return false; }
    return Array.prototype.some.call(control.options, function(option) {
      return String(option.value) === value && !isDisabled(option);
    });
  }

  function filterControl(key) {
    var result = null;
    root.querySelectorAll('[data-codex-session-filter="' + key + '"]').forEach(function(control) {
      if (!result && tagIs(control, 'select')) { result = control; }
    });
    return result;
  }

  function searchControl() {
    var result = null;
    root.querySelectorAll('[data-codex-session-search]').forEach(function(control) {
      if (!result && tagIs(control, 'input') && !control.hasAttribute('data-codex-session-filter') &&
          (control.getAttribute('type') || '').toLowerCase() === 'search') { result = control; }
    });
    return result;
  }

  function validFilterValue(control, key, value) {
    if (filterKeys.indexOf(key) === -1 || !tagIs(control, 'select') ||
        control.getAttribute('data-codex-session-filter') !== key ||
        control.hasAttribute('data-codex-session-search') || !enabledOption(control, value)) { return false; }
    return !value || rowHas(filterRowAttributes[key], value);
  }

  function filterActionKind(element) {
    if (tagIs(element, 'input') && element.hasAttribute('data-codex-session-search') &&
        !element.hasAttribute('data-codex-session-filter') &&
        (element.getAttribute('type') || '').toLowerCase() === 'search') { return 'search'; }
    var key = element.getAttribute('data-codex-session-filter');
    if (tagIs(element, 'select') && !element.hasAttribute('data-codex-session-search') && filterKeys.indexOf(key) !== -1) { return 'select'; }
    return '';
  }

  function sortAttribute(key) {
    return key === 'recent' ? 'data-sort-time' : 'data-sort-' + key;
  }

  function sortInventory(table, group, key) {
    if (!table || !sortKeys[group] || sortKeys[group].indexOf(key) === -1) { return false; }
    var body = table.querySelector('tbody');
    if (!body) { return false; }
    var found = false;
    Array.prototype.forEach.call(body.children, function(row) {
      var lead = group === 'projects'
        ? row.hasAttribute('data-codex-project-view-key') && !row.hasAttribute('data-codex-project-detail')
        : row.hasAttribute('data-codex-thread-row') && row.hasAttribute('data-codex-view-key');
      if (lead && row.getAttribute(sortAttribute(key)) !== null) { found = true; }
    });
    return found;
  }

  function validSortAction(element, group, key) {
    if (!tagIs(element, 'th') || !sortKeys[group] || sortKeys[group].indexOf(key) === -1 ||
        element.getAttribute('data-codex-action') !== (group === 'projects' ? 'sort-projects' : 'sort-sessions')) { return null; }
    var table = element.closest('[data-codex-sort-table="' + group + '"]');
    if (!table || !element.closest('thead') || !hasElement('[data-codex-sort-table="' + group + '"] [data-codex-sort-key]', element) ||
        !sortInventory(table, group, key)) { return null; }
    return table;
  }

  function scopeActionValid(element, buttonSelector, buttonAttribute, panelSelector, panelAttribute, value) {
    return tagIs(element, 'button') && !isDisabled(element) && hasElement(buttonSelector, element) &&
      element.getAttribute(buttonAttribute) === value && values(panelSelector, panelAttribute).indexOf(value) !== -1;
  }

  function prune(next) {
    if (values('[data-codex-page]', 'data-codex-page').indexOf(next.page) === -1) { next.page = 'overview'; }
    if (values('[data-codex-page]', 'data-codex-page').indexOf(next.returnPage) === -1) { next.returnPage = 'overview'; }
    if (!hasEnabledValue('[data-codex-page-button]', 'data-codex-page-button', next.page) && next.page !== 'settings') { next.page = 'overview'; }
    if (values('[data-codex-explore-panel]', 'data-codex-explore-panel').indexOf(next.exploreView) === -1) { next.exploreView = 'projects'; }
    if (!hasEnabledValue('[data-codex-overview-scope]', 'data-codex-overview-scope', next.overviewScope)) {
      next.overviewScope = firstEnabledValue('[data-codex-overview-scope]', 'data-codex-overview-scope', 'recent');
    }
    if (!hasEnabledValue('[data-codex-recommendation-scope]', 'data-codex-recommendation-scope', next.recommendationScope)) {
      next.recommendationScope = firstEnabledValue('[data-codex-recommendation-scope]', 'data-codex-recommendation-scope', 'recent');
    }
    if (!hasEnabledValue('[data-codex-model-effort-scope]', 'data-codex-model-effort-scope', next.exploreScope)) {
      next.exploreScope = firstEnabledValue('[data-codex-model-effort-scope]', 'data-codex-model-effort-scope', 'recent');
    }
    if (!hasEnabledValue('[data-codex-chart-metric]', 'data-codex-chart-metric', next.chartMetric)) {
      next.chartMetric = firstEnabledValue('[data-codex-chart-metric]', 'data-codex-chart-metric', 'processed');
    }
    ['projects', 'sessions'].forEach(function(group) {
      var available = [];
      root.querySelectorAll('[data-codex-sort-table="' + group + '"] [data-codex-sort-key]').forEach(function(header) {
        var key = header.getAttribute('data-codex-sort-key');
        if (validSortAction(header, group, key) && available.indexOf(key) === -1) { available.push(key); }
      });
      if (available.length && available.indexOf(next.sort[group].key) === -1) {
        next.sort[group].key = available.indexOf(defaults.sort[group].key) !== -1 ? defaults.sort[group].key : available[0];
        next.sort[group].direction = defaults.sort[group].direction;
      }
    });
    var projectKeys = values('[data-codex-project-detail]', 'data-codex-project-detail');
    var taskKeys = values('[data-codex-thread-row][data-codex-view-key]', 'data-codex-view-key');
    next.expandedProjects = next.expandedProjects.filter(function(key) { return projectKeys.indexOf(key) !== -1; });
    next.collapsedTasks = next.collapsedTasks.filter(function(key) { return taskKeys.indexOf(key) !== -1; });
    filterKeys.forEach(function(key) {
      if (!validFilterValue(filterControl(key), key, next.filters[key])) { next.filters[key] = ''; }
    });
    return next;
  }

  function persist() {
    var nextState = sanitize(state);
    var hostState = vscode.getState() || {};
    hostState.codexUi = nextState;
    vscode.setState(hostState);
    state = nextState;
  }

  function activate(buttonSelector, buttonAttribute, panelSelector, panelAttribute, value) {
    root.querySelectorAll(buttonSelector).forEach(function(button) {
      var selected = !isDisabled(button) && button.getAttribute(buttonAttribute) === value;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.setAttribute('tabindex', selected ? '0' : '-1');
    });
    root.querySelectorAll(panelSelector).forEach(function(panel) {
      var selected = panel.getAttribute(panelAttribute) === value;
      panel.hidden = !selected;
      panel.classList.toggle('active', selected);
    });
  }

  function updateChart(chart, metric) {
    if (!chart || metrics.indexOf(metric) === -1) { return; }
    var bars = chart.querySelectorAll('[data-codex-chart-bar], [data-codex-chart]');
    var maximum = 0;
    bars.forEach(function(bar) {
      var value = Number(bar.getAttribute('data-' + metric) || '0');
      if (isFinite(value) && value > maximum) { maximum = value; }
    });
    var classes = { processed: 'cache-creation-bar', fresh: 'input-bar', output: 'output-bar', reasoning: 'cache-read-bar', sessions: 'messages-bar' };
    bars.forEach(function(bar) {
      var value = Number(bar.getAttribute('data-' + metric) || '0');
      if (!isFinite(value) || value < 0) { value = 0; }
      bar.style.height = (maximum > 0 ? Math.max(2, Math.round(value / maximum * 100)) : 2) + 'px';
      ['cache-creation-bar', 'input-bar', 'output-bar', 'cache-read-bar', 'messages-bar'].forEach(function(name) { bar.classList.remove(name); });
      bar.classList.add(classes[metric]);
      var rendered = bar.getAttribute('data-label-' + metric) || String(value);
      var name = bar.getAttribute('data-name-' + metric) || metric;
      var rowLabel = bar.getAttribute('data-row-label') || bar.getAttribute('data-codex-date') || '';
      var accessibleLabel = rowLabel + ' · ' + name + ': ' + rendered;
      bar.setAttribute('title', accessibleLabel);
      bar.setAttribute('aria-label', accessibleLabel);
      var column = bar.closest('.hc-col');
      var label = column ? column.querySelector('[data-codex-chart-value]') : null;
      if (label) { label.textContent = rendered; }
    });
    chart.querySelectorAll('[data-codex-chart-metric]').forEach(function(button) {
      var selected = button.getAttribute('data-codex-chart-metric') === metric;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    var yValues = chart.querySelectorAll('.hc-yaxis .hc-yval');
    if (yValues.length === 3) {
      yValues[0].textContent = chart.getAttribute('data-axis-top-' + metric) || String(maximum);
      yValues[1].textContent = chart.getAttribute('data-axis-mid-' + metric) || String(Math.round(maximum / 2));
      yValues[2].textContent = '0';
    }
  }

  function applyCharts() {
    root.querySelectorAll('[data-codex-chart-root], [data-codex-overview-dataset]').forEach(function(chart) {
      updateChart(chart, state.chartMetric);
    });
  }

  function filterActive() {
    if (state.search.trim()) { return true; }
    return filterKeys.some(function(key) { return Boolean(state.filters[key]); });
  }

  function syncFilterControls() {
    var search = searchControl();
    if (search) { search.value = state.search; }
    filterKeys.forEach(function(key) {
      var control = filterControl(key);
      if (control) { control.value = state.filters[key]; }
    });
  }

  function rebuildChips() {
    var container = root.querySelector('[data-codex-filter-chips]');
    if (!container) { return; }
    while (container.firstChild) { container.removeChild(container.firstChild); }
    var items = [];
    if (state.search.trim()) { items.push(['query', container.getAttribute('data-codex-search-label') || 'Search', state.search]); }
    filterKeys.forEach(function(key) {
      if (!state.filters[key]) { return; }
      var control = filterControl(key);
      var label = control ? control.getAttribute('aria-label') || key : key;
      var rendered = state.filters[key];
      if (control && control.options && control.selectedIndex >= 0) { rendered = control.options[control.selectedIndex].text; }
      items.push([key, label, rendered]);
    });
    items.forEach(function(item) {
      var button = document.createElement('button');
      button.setAttribute('type', 'button');
      button.setAttribute('data-codex-action', 'remove-filter');
      button.setAttribute('data-codex-filter-key', item[0]);
      button.textContent = item[1] + ': ' + item[2] + ' ×';
      container.appendChild(button);
    });
  }

  function applyFilters() {
    syncFilterControls();
    var filtered = filterActive();
    var rows = root.querySelectorAll('[data-codex-thread-row]');
    var byKey = {};
    rows.forEach(function(row) { byKey[row.getAttribute('data-codex-view-key') || ''] = row; });
    var normalized = state.search.trim().toLowerCase();
    var visible = 0;
    rows.forEach(function(row) {
      var matches = (!normalized || (row.getAttribute('data-search') || '').indexOf(normalized) !== -1) &&
        (!state.filters.role || row.getAttribute('data-role') === state.filters.role) &&
        (!state.filters.project || row.getAttribute('data-project') === state.filters.project) &&
        (!state.filters.model || (row.getAttribute('data-models') || '').split('|').indexOf(state.filters.model) !== -1) &&
        (!state.filters.effort || (row.getAttribute('data-efforts') || '').split('|').indexOf(state.filters.effort) !== -1) &&
        (!state.filters.period || (row.getAttribute('data-codex-periods') || '').split('|').indexOf(state.filters.period) !== -1);
      var lineageVisible = true;
      if (!filtered) {
        var parent = row.getAttribute('data-codex-parent-view-key');
        var visited = new Set();
        while (parent && !visited.has(parent)) {
          visited.add(parent);
          if (state.collapsedTasks.indexOf(parent) !== -1) { lineageVisible = false; break; }
          parent = byKey[parent] ? byKey[parent].getAttribute('data-codex-parent-view-key') : '';
        }
      }
      row.classList.toggle('codex-child-thread', !filtered && Boolean(row.getAttribute('data-codex-parent-view-key')));
      row.querySelectorAll('[data-codex-filter-parent]').forEach(function(parentLabel) { parentLabel.hidden = !filtered; });
      row.hidden = !(matches && lineageVisible);
      if (!row.hidden) { visible += 1; }
    });
    root.querySelectorAll('[data-codex-session-layout]').forEach(function(layout) {
      layout.setAttribute('data-codex-session-layout', filtered ? 'flat' : 'tree');
    });
    root.querySelectorAll('[data-codex-thread-visible]').forEach(function(count) { count.textContent = String(visible); });
    root.querySelectorAll('[data-codex-action="toggle-thread-children"]').forEach(function(button) {
      var key = button.getAttribute('data-codex-thread-key') || '';
      var expanded = state.collapsedTasks.indexOf(key) === -1;
      button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      button.textContent = expanded ? '▼' : '▶';
    });
    var clear = root.querySelector('[data-codex-action="clear-filters"]');
    if (clear) { clear.hidden = !filtered; }
    rebuildChips();
  }

  function applyProjects() {
    root.querySelectorAll('[data-codex-project-detail]').forEach(function(detail) {
      var key = detail.getAttribute('data-codex-project-detail') || '';
      detail.hidden = state.expandedProjects.indexOf(key) === -1;
    });
    root.querySelectorAll('[data-codex-action="project-sessions"]').forEach(function(button) {
      var key = button.getAttribute('data-codex-project-view-key') || '';
      var expanded = state.expandedProjects.indexOf(key) !== -1;
      button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      button.textContent = expanded ? '▼' : '▶';
    });
  }

  function sortValue(row, key) {
    var raw = row.getAttribute('data-sort-' + key);
    if (raw === null && key === 'recent') { raw = row.getAttribute('data-sort-time'); }
    if (raw === null) { raw = ''; }
    var number = Number(raw);
    return raw !== '' && isFinite(number) ? number : String(raw);
  }

  function applySort(group, key, direction) {
    var table = root.querySelector('[data-codex-sort-table="' + group + '"]');
    if (!table || !key || !sortKeys[group] || sortKeys[group].indexOf(key) === -1 ||
        ['asc', 'desc'].indexOf(direction) === -1 || !sortInventory(table, group, key)) { return false; }
    var body = table.querySelector('tbody');
    if (!body) { return false; }
    var rows = Array.prototype.slice.call(body.children);
    var units = [];
    if (group === 'projects') {
      rows.forEach(function(row) {
        if (row.hasAttribute('data-codex-project-detail') && units.length) { units[units.length - 1].push(row); }
        else { units.push([row]); }
      });
    } else if (!filterActive()) {
      var byParent = {};
      rows.forEach(function(row) {
        var parent = row.getAttribute('data-codex-parent-view-key') || '';
        if (!byParent[parent]) { byParent[parent] = []; }
        byParent[parent].push(row);
      });
      var visited = new Set();
      var collect = function(row, unit) {
        var rowKey = row.getAttribute('data-codex-view-key') || '';
        if (visited.has(rowKey)) { return; }
        visited.add(rowKey); unit.push(row);
        (byParent[rowKey] || []).forEach(function(child) { collect(child, unit); });
      };
      rows.forEach(function(row) {
        var parent = row.getAttribute('data-codex-parent-view-key') || '';
        if (!parent) { var unit = []; collect(row, unit); units.push(unit); }
      });
      rows.forEach(function(row) { if (!visited.has(row.getAttribute('data-codex-view-key') || '')) { var unit = []; collect(row, unit); units.push(unit); } });
    } else {
      units = rows.map(function(row) { return [row]; });
    }
    units.sort(function(left, right) {
      var a = sortValue(left[0], key); var b = sortValue(right[0], key);
      var compared = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
      return direction === 'asc' ? compared : -compared;
    });
    units.forEach(function(unit) { unit.forEach(function(row) { body.appendChild(row); }); });
    table.querySelectorAll('[data-codex-sort-key]').forEach(function(header) {
      var active = header.getAttribute('data-codex-sort-key') === key;
      header.setAttribute('aria-sort', active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none');
      header.classList.toggle('sorted-asc', active && direction === 'asc');
      header.classList.toggle('sorted-desc', active && direction === 'desc');
    });
    return true;
  }

  function applyState() {
    activate('[data-codex-page-button]', 'data-codex-page-button', '[data-codex-page]', 'data-codex-page', state.page);
    activate('[data-codex-explore-view-button]', 'data-codex-explore-view-button', '[data-codex-explore-panel]', 'data-codex-explore-panel', state.exploreView);
    activate('[data-codex-overview-scope]', 'data-codex-overview-scope', '[data-codex-overview-panel]', 'data-codex-overview-panel', state.overviewScope);
    activate('[data-codex-recommendation-scope]', 'data-codex-recommendation-scope', '[data-codex-recommendation-panel]', 'data-codex-recommendation-panel', state.recommendationScope);
    activate('[data-codex-model-effort-scope]', 'data-codex-model-effort-scope', '[data-codex-model-effort-panel]', 'data-codex-model-effort-panel', state.exploreScope);
    activate('[data-codex-behavior-scope]', 'data-codex-behavior-scope', '[data-codex-behavior-panel]', 'data-codex-behavior-panel', state.exploreScope);
    applyCharts();
    applyProjects();
    applyFilters();
    applySort('projects', state.sort.projects.key, state.sort.projects.direction);
    applySort('sessions', state.sort.sessions.key, state.sort.sessions.direction);
  }

  function setPage(page) {
    if (pages.indexOf(page) === -1 || values('[data-codex-page]', 'data-codex-page').indexOf(page) === -1) { return false; }
    if (page !== 'settings' && !hasEnabledValue('[data-codex-page-button]', 'data-codex-page-button', page)) { return false; }
    if (page === 'settings') { if (state.page !== 'settings') { state.returnPage = returnPages.indexOf(state.page) !== -1 ? state.page : 'overview'; } }
    else { state.returnPage = page; }
    state.page = page;
    return true;
  }

  function collectFilters(actionElement) {
    var kind = filterActionKind(actionElement);
    if (kind === 'search') {
      if (actionElement !== searchControl()) { return false; }
      state.search = String(actionElement.value || '').slice(0, 200);
      return true;
    }
    var key = actionElement.getAttribute('data-codex-session-filter');
    var value = String(actionElement.value || '');
    if (kind !== 'select' || actionElement !== filterControl(key)) { return false; }
    if (!validFilterValue(actionElement, key, value)) {
      applyFilters();
      return false;
    }
    state.filters[key] = value;
    return true;
  }

  function validSettingValue(key, type, source, element) {
    if (!Object.prototype.hasOwnProperty.call(settingTypes, key) || settingTypes[key] !== type) { return null; }
    if ((source === 'checked') !== (type === 'boolean') || (source !== 'checked' && source !== 'value')) { return null; }
    var value = source === 'checked' ? Boolean(element.checked) : element.value;
    if (type === 'number') {
      if (typeof value !== 'string' || !value.trim() || (element.validity && element.validity.valid === false)) { return null; }
      var nativeValue = element.valueAsNumber;
      value = typeof nativeValue === 'number' && isFinite(nativeValue) ? nativeValue : Number(value);
      if (!isFinite(value) || key !== 'tokenDecimalPlaces') { return null; }
      var minimumRaw = element.getAttribute('min');
      var maximumRaw = element.getAttribute('max');
      var stepRaw = element.getAttribute('step');
      var minimum = minimumRaw === null || !String(minimumRaw).trim() ? null : Number(minimumRaw);
      var maximum = maximumRaw === null || !String(maximumRaw).trim() ? null : Number(maximumRaw);
      if ((minimum !== null && !isFinite(minimum)) || (maximum !== null && !isFinite(maximum)) ||
          (minimum !== null && value < minimum) || (maximum !== null && value > maximum)) { return null; }
      if (stepRaw !== null && String(stepRaw).trim() && stepRaw !== 'any') {
        var step = Number(stepRaw);
        if (!isFinite(step) || step <= 0) { return null; }
        var stepBase = minimum === null ? 0 : minimum;
        var quotient = (value - stepBase) / step;
        var tolerance = 1e-9 * Math.max(1, Math.abs(quotient));
        if (Math.abs(quotient - Math.round(quotient)) > tolerance) { return null; }
      }
      if (value < 0 || value > 2 || Math.floor(value) !== value) { return null; }
    } else if (type === 'string') {
      if (typeof value !== 'string' || value.length > (key === 'codex.dataDirectory' ? 1024 : 100)) { return null; }
      if (settingEnums[key] && settingEnums[key].indexOf(value) === -1) { return null; }
      if (element.options) {
        var optionFound = Array.prototype.some.call(element.options, function(option) { return option.value === value && !isDisabled(option); });
        if (!optionFound) { return null; }
      }
    }
    return { command: 'updateSetting', key: key, value: value };
  }

  function projectDetailExists(key) {
    var found = false;
    root.querySelectorAll('[data-codex-project-detail]').forEach(function(detail) {
      if (detail.getAttribute('data-codex-project-detail') === key) { found = true; }
    });
    return found;
  }

  function resolveRootTask(task, project) {
    if (!task || !project) { return null; }
    var rows = root.querySelectorAll('[data-codex-thread-row][data-codex-view-key]');
    var direct = null;
    rows.forEach(function(row) {
      if (!direct && row.getAttribute('data-codex-view-key') === task) { direct = row; }
    });
    if (direct) {
      return !direct.hasAttribute('data-codex-parent-view-key') && direct.getAttribute('data-project') === project ? direct : null;
    }
    var fallback = null;
    rows.forEach(function(row) {
      if (!fallback && !row.hasAttribute('data-codex-parent-view-key') &&
          row.getAttribute('data-project') === project && row.getAttribute('data-codex-root-task-view-key') === task) { fallback = row; }
    });
    return fallback;
  }

  function handleAction(element) {
    var action = element.getAttribute('data-codex-action');
    var value;
    if (action === 'refresh') { vscode.postMessage({ command: 'refresh' }); return true; }
    if (action === 'select-page') { return setPage(element.getAttribute('data-codex-page-target')); }
    if (action === 'open-settings') { return setPage('settings'); }
    if (action === 'close-settings') { return setPage(state.returnPage); }
    if (action === 'set-overview-scope') {
      value = element.getAttribute('data-codex-overview-scope');
      if (scopes.indexOf(value) === -1 || !scopeActionValid(element, '[data-codex-overview-scope]', 'data-codex-overview-scope', '[data-codex-overview-panel]', 'data-codex-overview-panel', value)) { return false; }
      state.overviewScope = value; return true;
    }
    if (action === 'set-recommendation-scope') {
      value = element.getAttribute('data-codex-recommendation-scope');
      if (scopes.indexOf(value) === -1 || !scopeActionValid(element, '[data-codex-recommendation-scope]', 'data-codex-recommendation-scope', '[data-codex-recommendation-panel]', 'data-codex-recommendation-panel', value)) { return false; }
      state.recommendationScope = value; return true;
    }
    if (action === 'set-model-effort-scope' || action === 'select-behavior-scope') {
      var modelEffort = action === 'set-model-effort-scope';
      var scopeButtonSelector = modelEffort ? '[data-codex-model-effort-scope]' : '[data-codex-behavior-scope]';
      var scopeButtonAttribute = modelEffort ? 'data-codex-model-effort-scope' : 'data-codex-behavior-scope';
      var scopePanelSelector = modelEffort ? '[data-codex-model-effort-panel]' : '[data-codex-behavior-panel]';
      var scopePanelAttribute = modelEffort ? 'data-codex-model-effort-panel' : 'data-codex-behavior-panel';
      value = element.getAttribute(scopeButtonAttribute);
      if (scopes.indexOf(value) === -1 || !scopeActionValid(element, scopeButtonSelector, scopeButtonAttribute, scopePanelSelector, scopePanelAttribute, value)) { return false; }
      state.exploreScope = value; return true;
    }
    if (action === 'set-chart-metric' || action === 'select-chart-metric') {
      value = element.getAttribute('data-codex-chart-metric');
      if (metrics.indexOf(value) === -1) { return false; }
      state.chartMetric = value; return true;
    }
    if (action === 'select-explore-view') {
      value = element.getAttribute('data-codex-explore-view');
      if (exploreViews.indexOf(value) === -1) { return false; }
      state.exploreView = value; return true;
    }
    if (action === 'filter-sessions') { return collectFilters(element); }
    if (action === 'remove-filter') {
      value = element.getAttribute('data-codex-filter-key');
      if (value === 'query') { state.search = ''; return true; }
      if (filterKeys.indexOf(value) === -1) { return false; }
      state.filters[value] = ''; return true;
    }
    if (action === 'clear-filters') {
      state.search = ''; filterKeys.forEach(function(key) { state.filters[key] = ''; }); return true;
    }
    if (action === 'toggle-thread-children') {
      value = element.getAttribute('data-codex-thread-key');
      if (values('[data-codex-view-key]', 'data-codex-view-key').indexOf(value) === -1) { return false; }
      var collapsedAt = state.collapsedTasks.indexOf(value);
      if (collapsedAt === -1) { state.collapsedTasks.push(value); } else { state.collapsedTasks.splice(collapsedAt, 1); }
      return true;
    }
    if (action === 'project-sessions') {
      value = element.getAttribute('data-codex-project-view-key');
      if (!tagIs(element, 'button') || !value || !projectDetailExists(value)) { return false; }
      var expandedAt = state.expandedProjects.indexOf(value);
      if (expandedAt === -1) { state.expandedProjects.push(value); } else { state.expandedProjects.splice(expandedAt, 1); }
      return true;
    }
    if (action === 'sort-projects' || action === 'sort-sessions') {
      var group = action === 'sort-projects' ? 'projects' : 'sessions';
      value = element.getAttribute('data-codex-sort-key');
      if (!value || !validSortAction(element, group, value)) { return false; }
      var current = state.sort[group];
      state.sort[group] = { key: value, direction: current.key === value && current.direction === 'asc' ? 'desc' : 'asc' };
      return true;
    }
    if (action === 'view-task') {
      var task = element.getAttribute('data-codex-task-key');
      var project = element.getAttribute('data-codex-project-key');
      var target = tagIs(element, 'button') ? resolveRootTask(task, project) : null;
      if (!target || !validFilterValue(filterControl('project'), 'project', project) ||
          values('[data-codex-explore-panel]', 'data-codex-explore-panel').indexOf('sessions') === -1 ||
          !hasEnabledValue('[data-codex-explore-view-button]', 'data-codex-explore-view-button', 'sessions')) { return false; }
      if (!setPage('explore')) { return false; }
      resolvedTaskTarget = target;
      state.exploreView = 'sessions'; state.search = '';
      filterKeys.forEach(function(key) { state.filters[key] = ''; });
      state.filters.project = project; return true;
    }
    if (action === 'drilldown-date') {
      value = element.getAttribute('data-codex-date');
      if (!tagIs(element, 'button') || !value || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value) || state.page !== 'overview') { return false; }
      var scopePanel = element.closest('[data-codex-overview-panel]');
      var overviewPage = scopePanel ? scopePanel.closest('[data-codex-page="overview"]') : null;
      var row = scopePanel ? scopePanel.querySelector('[data-codex-date-row="' + value + '"]') : null;
      if (!scopePanel || !overviewPage || overviewPage.hidden || scopePanel.hidden || isDisabled(scopePanel) ||
          scopePanel.getAttribute('data-codex-overview-panel') !== state.overviewScope || !row || row.hidden || isDisabled(row)) { return false; }
      root.querySelectorAll('[data-codex-date-row].selected').forEach(function(item) { item.classList.remove('selected'); });
      row.classList.add('selected'); row.focus(); row.scrollIntoView({ behavior: scrollBehavior(), block: 'center' }); return true;
    }
    if (action === 'set-setting') {
      var message = validSettingValue(element.getAttribute('data-codex-setting-key'), element.getAttribute('data-codex-setting-type'), element.getAttribute('data-codex-setting-value-source'), element);
      if (!message) { return false; }
      vscode.postMessage(message); return true;
    }
    if (action === 'reset-settings') {
      var serialized = element.getAttribute('data-codex-setting-keys');
      try {
        var keys = JSON.parse(serialized);
        if (!Array.isArray(keys) || keys.length > 100 || keys.some(function(key) { return typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(settingTypes, key); })) { return false; }
        vscode.postMessage({ command: 'resetAllSettings', keys: Array.from(new Set(keys)) }); return true;
      } catch (_error) { return false; }
    }
    return false;
  }

  function afterAction(element) {
    state = prune(sanitize(state));
    applyState();
    persist();
    if (element.getAttribute('data-codex-action') === 'view-task') {
      if (resolvedTaskTarget) { resolvedTaskTarget.focus(); resolvedTaskTarget.scrollIntoView({ behavior: scrollBehavior(), block: 'center' }); }
    }
    resolvedTaskTarget = null;
  }

  function performAction(actionElement, event) {
    if (!handleAction(actionElement)) { return false; }
    afterAction(actionElement);
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  function scrollBehavior() {
    return typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  }

  function route(event) {
    resolvedTaskTarget = null;
    var actionElement = event.target && event.target.closest ? event.target.closest('[data-codex-action]') : null;
    if (!actionElement || isDisabled(actionElement)) { return; }
    var action = actionElement.getAttribute('data-codex-action');
    if (action === 'filter-sessions') {
      var filterKind = filterActionKind(actionElement);
      if ((filterKind === 'search' && event.type !== 'input') ||
          (filterKind === 'select' && event.type !== 'change') || !filterKind) { return; }
    }
    if (action === 'set-setting' && event.type !== 'change') { return; }
    if (action !== 'filter-sessions' && action !== 'set-setting' && event.type !== 'click') { return; }
    performAction(actionElement, event);
  }

  root.addEventListener('click', route);
  root.addEventListener('input', route);
  root.addEventListener('change', route);
  root.addEventListener('keydown', function(event) {
    var tab = event.target && event.target.closest ? event.target.closest('[role="tab"][data-codex-action]') : null;
    if (!tab) { return; }
    if (event.key === 'Enter' || event.key === ' ') {
      resolvedTaskTarget = null;
      if (!isDisabled(tab)) { performAction(tab, event); }
      return;
    }
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(event.key) === -1) { return; }
    var tablist = tab.closest('[role="tablist"]') || tab.parentElement;
    var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"][data-codex-action]')).filter(function(item) { return !isDisabled(item); });
    var index = tabs.indexOf(tab);
    if (index === -1 || tabs.length === 0) { return; }
    if (event.key === 'Home') { index = 0; }
    else if (event.key === 'End') { index = tabs.length - 1; }
    else { index = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; }
    tabs[index].focus();
    event.preventDefault(); event.stopPropagation();
  });

  var hostState = vscode.getState() || {};
  state = prune(sanitize(hostState.codexUi));
  applyState();
  persist();
}());`;
}
