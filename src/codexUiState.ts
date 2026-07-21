import type { CodexScope } from './types';

export type CodexPage = 'overview' | 'explore' | 'recommendations' | 'settings';
export type CodexExploreView = 'projects' | 'sessions' | 'models-effort';
export type CodexMetric = 'processed' | 'fresh' | 'output' | 'reasoning' | 'sessions';

export interface CodexUiState {
  version: 1;
  page: CodexPage;
  returnPage: Exclude<CodexPage, 'settings'>;
  overviewScope: CodexScope;
  recommendationScope: CodexScope;
  exploreView: CodexExploreView;
  exploreScope: CodexScope;
  chartMetric: CodexMetric;
  search: string;
  filters: { role: string; project: string; model: string; effort: string; period: string; date: string };
  sort: {
    projects: { key: string; direction: 'asc' | 'desc' };
    sessions: { key: string; direction: 'asc' | 'desc' };
  };
  expandedProjects: string[];
  collapsedTasks: string[];
}

export const DEFAULT_CODEX_UI_STATE: CodexUiState = {
  version: 1,
  page: 'overview',
  returnPage: 'overview',
  overviewScope: 'recent',
  recommendationScope: 'recent',
  exploreView: 'projects',
  exploreScope: 'recent',
  chartMetric: 'processed',
  search: '',
  filters: { role: '', project: '', model: '', effort: '', period: '', date: '' },
  sort: {
    projects: { key: 'processed', direction: 'desc' },
    sessions: { key: 'recent', direction: 'desc' },
  },
  expandedProjects: [],
  collapsedTasks: [],
};

const PAGES = new Set<CodexPage>(['overview', 'explore', 'recommendations', 'settings']);
const RETURN_PAGES = new Set<Exclude<CodexPage, 'settings'>>(['overview', 'explore', 'recommendations']);
const SCOPES = new Set<CodexScope>(['recent', '7d', '30d', 'all']);
const EXPLORE_VIEWS = new Set<CodexExploreView>(['projects', 'sessions', 'models-effort']);
const METRICS = new Set<CodexMetric>(['processed', 'fresh', 'output', 'reasoning', 'sessions']);
const DIRECTIONS = new Set<'asc' | 'desc'>(['asc', 'desc']);
const FILTER_KEYS = ['role', 'project', 'model', 'effort', 'period', 'date'] as const;
const MAX_SEARCH_LENGTH = 200;
const MAX_LIST_LENGTH = 100;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// State can come from persisted, untrusted JSON-like values. Own data
// descriptors avoid executing inherited or accessor-backed values during restore.
function ownData(value: unknown, key: string): unknown {
  if (!isRecord(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function hasOwnData(value: unknown, key: string): boolean {
  if (!isRecord(value)) return false;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return Boolean(descriptor && 'value' in descriptor);
}

function allowed<T extends string>(value: unknown, choices: Set<T>, fallback: T): T {
  return typeof value === 'string' && choices.has(value as T) ? value as T : fallback;
}

function text(value: unknown, fallback: string, maxLength?: number): string {
  if (typeof value !== 'string') return fallback;
  return maxLength === undefined ? value : value.slice(0, maxLength);
}

function isoDay(value: unknown): string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length && result.length < MAX_LIST_LENGTH; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    const item = descriptor && 'value' in descriptor ? descriptor.value : undefined;
    if (typeof item === 'string' && !seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

function cloneDefault(): CodexUiState {
  return {
    ...DEFAULT_CODEX_UI_STATE,
    filters: { ...DEFAULT_CODEX_UI_STATE.filters },
    sort: {
      projects: { ...DEFAULT_CODEX_UI_STATE.sort.projects },
      sessions: { ...DEFAULT_CODEX_UI_STATE.sort.sessions },
    },
    expandedProjects: [...DEFAULT_CODEX_UI_STATE.expandedProjects],
    collapsedTasks: [...DEFAULT_CODEX_UI_STATE.collapsedTasks],
  };
}

export function sanitizeCodexUiState(raw: unknown): CodexUiState {
  if (ownData(raw, 'version') !== 1) return cloneDefault();
  const defaults = cloneDefault();
  const rawFilters = ownData(raw, 'filters');
  const rawSort = ownData(raw, 'sort');
  const rawProjectsSort = ownData(rawSort, 'projects');
  const rawSessionsSort = ownData(rawSort, 'sessions');

  const filters = { ...defaults.filters };
  for (const key of FILTER_KEYS) filters[key] = text(ownData(rawFilters, key), '');
  filters.date = isoDay(ownData(rawFilters, 'date'));

  return {
    version: 1,
    page: allowed(ownData(raw, 'page'), PAGES, defaults.page),
    returnPage: allowed(ownData(raw, 'returnPage'), RETURN_PAGES, defaults.returnPage),
    overviewScope: allowed(ownData(raw, 'overviewScope'), SCOPES, defaults.overviewScope),
    recommendationScope: allowed(ownData(raw, 'recommendationScope'), SCOPES, defaults.recommendationScope),
    exploreView: allowed(ownData(raw, 'exploreView'), EXPLORE_VIEWS, defaults.exploreView),
    exploreScope: allowed(ownData(raw, 'exploreScope'), SCOPES, defaults.exploreScope),
    chartMetric: allowed(ownData(raw, 'chartMetric'), METRICS, defaults.chartMetric),
    search: text(ownData(raw, 'search'), defaults.search, MAX_SEARCH_LENGTH),
    filters,
    sort: {
      projects: {
        key: text(ownData(rawProjectsSort, 'key'), defaults.sort.projects.key),
        direction: allowed(ownData(rawProjectsSort, 'direction'), DIRECTIONS, defaults.sort.projects.direction),
      },
      sessions: {
        key: text(ownData(rawSessionsSort, 'key'), defaults.sort.sessions.key),
        direction: allowed(ownData(rawSessionsSort, 'direction'), DIRECTIONS, defaults.sort.sessions.direction),
      },
    },
    expandedProjects: strings(ownData(raw, 'expandedProjects')),
    collapsedTasks: strings(ownData(raw, 'collapsedTasks')),
  };
}

export function patchCodexUiState(
  current: CodexUiState,
  patch: Partial<CodexUiState>,
): CodexUiState {
  const base = sanitizeCodexUiState(current);
  const merged: UnknownRecord = {
    ...base,
    filters: { ...base.filters },
    sort: {
      projects: { ...base.sort.projects },
      sessions: { ...base.sort.sessions },
    },
    expandedProjects: [...base.expandedProjects],
    collapsedTasks: [...base.collapsedTasks],
  };

  for (const key of [
    'version', 'page', 'returnPage', 'overviewScope', 'recommendationScope',
    'exploreView', 'exploreScope', 'chartMetric', 'search', 'expandedProjects', 'collapsedTasks',
  ]) {
    const value = ownData(patch, key);
    if (hasOwnData(patch, key)) merged[key] = value;
  }

  const patchFilters = ownData(patch, 'filters');
  for (const key of FILTER_KEYS) {
    const value = ownData(patchFilters, key);
    if (hasOwnData(patchFilters, key)) (merged.filters as UnknownRecord)[key] = value;
  }

  const patchSort = ownData(patch, 'sort');
  for (const group of ['projects', 'sessions'] as const) {
    const patchGroup = ownData(patchSort, group);
    for (const key of ['key', 'direction']) {
      const value = ownData(patchGroup, key);
      if (hasOwnData(patchGroup, key)) ((merged.sort as UnknownRecord)[group] as UnknownRecord)[key] = value;
    }
  }
  return sanitizeCodexUiState(merged);
}
