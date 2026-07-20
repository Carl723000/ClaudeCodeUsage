import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  DEFAULT_CODEX_UI_STATE,
  patchCodexUiState,
  sanitizeCodexUiState,
} from '../codexUiState';

test('Codex UI state restores only allow-listed values', () => {
  const state = sanitizeCodexUiState({
    version: 1,
    page: 'explore',
    overviewScope: '30d',
    chartMetric: 'fresh',
    search: '<script>x</script>',
    filters: { role: 'subagent', project: 'p-a', model: 'm', effort: 'high', period: '7d' },
    expandedProjects: ['p-a', 42],
  });

  assert.equal(state.page, 'explore');
  assert.equal(state.overviewScope, '30d');
  assert.equal(state.search, '<script>x</script>');
  assert.deepEqual(state.expandedProjects, ['p-a']);
});

test('invalid and future states fall back without throwing', () => {
  assert.deepEqual(sanitizeCodexUiState({ version: 99, page: 'evil' }), DEFAULT_CODEX_UI_STATE);
  assert.deepEqual(sanitizeCodexUiState(null), DEFAULT_CODEX_UI_STATE);
});

test('sanitization bounds search and string lists while clearing unknown filters', () => {
  const values = Array.from({ length: 105 }, (_, index) => `p-${index % 102}`);
  const state = sanitizeCodexUiState({
    version: 1,
    search: 'x'.repeat(201),
    filters: { role: 1, project: null, model: 'm', effort: {}, period: '30d' },
    expandedProjects: values.concat(['p-0', 1, null] as unknown as string),
    collapsedTasks: ['a', 'a', 'b', 1],
  });

  assert.equal(state.search.length, 200);
  assert.deepEqual(state.filters, { role: '', project: '', model: 'm', effort: '', period: '30d' });
  assert.equal(state.expandedProjects.length, 100);
  assert.equal(new Set(state.expandedProjects).size, 100);
  assert.deepEqual(state.collapsedTasks, ['a', 'b']);
});

test('settings cannot be a return page and defaults are deeply cloned', () => {
  const state = sanitizeCodexUiState({ version: 1, page: 'settings', returnPage: 'settings' });
  assert.equal(state.returnPage, DEFAULT_CODEX_UI_STATE.returnPage);
  state.filters.role = 'changed';
  state.sort.projects.key = 'changed';
  state.expandedProjects.push('changed');
  assert.notEqual(DEFAULT_CODEX_UI_STATE.filters.role, 'changed');
  assert.notEqual(DEFAULT_CODEX_UI_STATE.sort.projects.key, 'changed');
  assert.equal(DEFAULT_CODEX_UI_STATE.expandedProjects.includes('changed'), false);
});

test('patch merges nested filters and sort without mutation before sanitizing', () => {
  const current = sanitizeCodexUiState({
    version: 1,
    filters: { role: 'agent', project: 'alpha', model: 'gpt', effort: 'high', period: '7d' },
    sort: {
      projects: { key: 'processed', direction: 'desc' },
      sessions: { key: 'started', direction: 'asc' },
    },
  });
  const patch = {
    search: 'needle',
    filters: { project: 'beta', role: 42 },
    sort: { projects: { direction: 'asc' } },
  } as unknown as Partial<typeof current>;

  const state = patchCodexUiState(current, patch);
  assert.deepEqual(state.filters, { role: '', project: 'beta', model: 'gpt', effort: 'high', period: '7d' });
  assert.deepEqual(state.sort, {
    projects: { key: 'processed', direction: 'asc' },
    sessions: { key: 'started', direction: 'asc' },
  });
  assert.equal(current.search, '');
  assert.equal(current.filters.project, 'alpha');
  assert.equal(current.sort.projects.direction, 'desc');
});

test('patch sanitizes explicit unknown nested values instead of retaining them', () => {
  const current = sanitizeCodexUiState({
    version: 1,
    filters: { role: 'agent', project: 'alpha', model: '', effort: '', period: '' },
    sort: { projects: { key: 'processed', direction: 'desc' }, sessions: { key: 'recent', direction: 'desc' } },
  });
  const state = patchCodexUiState(current, {
    filters: { role: undefined },
    sort: { sessions: { direction: 'sideways' } },
  } as unknown as Partial<typeof current>);

  assert.equal(state.filters.role, '');
  assert.equal(state.sort.sessions.direction, DEFAULT_CODEX_UI_STATE.sort.sessions.direction);
});

test('untrusted prototype-like objects do not invoke accessors', () => {
  let reads = 0;
  const raw = Object.create({ page: 'explore' }) as Record<string, unknown>;
  Object.defineProperty(raw, 'version', { value: 1, enumerable: true });
  Object.defineProperty(raw, 'page', {
    enumerable: true,
    get() { reads += 1; throw new Error('must not read accessor'); },
  });
  Object.defineProperty(raw, 'filters', {
    value: Object.create({ role: 'agent' }),
    enumerable: true,
  });

  const state = sanitizeCodexUiState(raw);
  assert.equal(reads, 0);
  assert.equal(state.page, DEFAULT_CODEX_UI_STATE.page);
  assert.equal(state.filters.role, '');
});
