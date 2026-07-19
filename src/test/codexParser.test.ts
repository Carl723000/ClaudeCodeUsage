import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  createCodexParserState,
  parseCodexLine,
} from '../providers/codex/codexParser';

interface TokenLineOptions {
  inputTotal: number;
  inputLast: number;
  cachedInput?: number;
  outputTotal?: number;
  outputLast?: number;
  reasoningOutput?: number;
  rateLimit?: {
    usedPercent: number;
    windowMinutes: number;
    resetsAtSeconds: number;
  };
}

function tokenLine(options: TokenLineOptions): string {
  const outputTotal = options.outputTotal ?? 20;
  const outputLast = options.outputLast ?? 20;
  return JSON.stringify({
    timestamp: '2026-07-20T00:00:00.000Z',
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: options.inputTotal,
          cached_input_tokens: options.cachedInput ?? 0,
          output_tokens: outputTotal,
          reasoning_output_tokens: options.reasoningOutput ?? 0,
          total_tokens: options.inputTotal + outputTotal,
        },
        last_token_usage: {
          input_tokens: options.inputLast,
          cached_input_tokens: 0,
          output_tokens: outputLast,
          reasoning_output_tokens: options.reasoningOutput ?? 0,
          total_tokens: options.inputLast + outputLast,
        },
      },
      rate_limits: options.rateLimit
        ? {
            primary: {
              used_percent: options.rateLimit.usedPercent,
              window_minutes: options.rateLimit.windowMinutes,
              resets_at: options.rateLimit.resetsAtSeconds,
            },
          }
        : undefined,
    },
  });
}

test('repeated cumulative snapshots emit only advancing deltas', () => {
  let state = createCodexParserState('file-key');

  const first = parseCodexLine(
    tokenLine({ inputTotal: 100, inputLast: 100 }),
    state,
  );
  state = first.state;
  const repeat = parseCodexLine(
    tokenLine({ inputTotal: 100, inputLast: 100 }),
    state,
  );
  state = repeat.state;
  const next = parseCodexLine(
    tokenLine({ inputTotal: 150, inputLast: 50 }),
    state,
  );

  assert.equal(first.events[0].tokens.inputTotal, 100);
  assert.equal(repeat.events.length, 0);
  assert.equal(next.events[0].tokens.inputTotal, 50);
  assert.equal(next.events[0].tokens.outputTotal, 0);
});

test('cached and reasoning remain subsets and inherit turn context', () => {
  let state = createCodexParserState('file-key');
  state = parseCodexLine(
    JSON.stringify({
      timestamp: '2026-07-20T00:00:00.000Z',
      type: 'turn_context',
      payload: { model: 'gpt-5.6-sol', effort: 'high' },
    }),
    state,
  ).state;

  const result = parseCodexLine(
    tokenLine({
      inputTotal: 1_000,
      inputLast: 1_000,
      cachedInput: 800,
      outputTotal: 200,
      outputLast: 200,
      reasoningOutput: 120,
    }),
    state,
  );
  const event = result.events[0];

  assert.deepEqual(event.tokens, {
    inputTotal: 1_000,
    cachedInput: 800,
    outputTotal: 200,
    reasoningOutput: 120,
    sourceTotal: 1_200,
  });
  assert.equal(event.model, 'gpt-5.6-sol');
  assert.equal(event.effort, 'high');
});

test('invalid JSON is flagged and unknown events contribute no usage', () => {
  let state = createCodexParserState('file-key');
  const invalid = parseCodexLine('{not-json', state);
  state = invalid.state;
  const unknown = parseCodexLine(
    JSON.stringify({
      timestamp: '2026-07-20T00:00:00.000Z',
      type: 'future_event',
      payload: {},
    }),
    state,
  );

  assert.equal(invalid.events.length, 0);
  assert.ok(invalid.state.qualityFlags.includes('invalid-json'));
  assert.equal(unknown.events.length, 0);
  assert.ok(unknown.state.qualityFlags.includes('unknown-event'));
});

test('known non-usage envelopes do not become quality failures', () => {
  let state = createCodexParserState('file-key');
  for (const type of [
    'world_state',
    'inter_agent_communication_metadata',
  ]) {
    const result = parseCodexLine(
      JSON.stringify({
        timestamp: '2026-07-20T00:00:00.000Z',
        type,
        payload: { private: 'must not be returned' },
      }),
      state,
    );
    state = result.state;
    assert.equal(result.events.length, 0);
    assert.equal(result.structural, undefined);
  }

  const compacted = parseCodexLine(
    JSON.stringify({
      timestamp: '2026-07-20T00:01:00.000Z',
      type: 'compacted',
      payload: { private: 'must not be returned' },
    }),
    state,
  );
  assert.equal(compacted.structural, undefined);
  assert.deepEqual(compacted.state.qualityFlags, []);
  assert.doesNotMatch(JSON.stringify(compacted), /private|must not be returned/);
});

test('rate limit is a last-observed local-log snapshot', () => {
  const resetsAtSeconds = Date.parse('2026-07-20T05:00:00.000Z') / 1_000;
  const result = parseCodexLine(
    tokenLine({
      inputTotal: 100,
      inputLast: 100,
      rateLimit: { usedPercent: 42, windowMinutes: 300, resetsAtSeconds },
    }),
    createCodexParserState('file-key'),
  );

  assert.deepEqual(result.limit, {
    provider: 'codex',
    observedAt: Date.parse('2026-07-20T00:00:00.000Z'),
    source: 'local-log',
    confidence: 'last-observed',
    windows: [
      {
        label: 'primary',
        usedPercent: 42,
        windowMinutes: 300,
        resetsAt: resetsAtSeconds * 1_000,
      },
    ],
  });
});

test('counter regression starts a partial lineage without negative usage', () => {
  let state = createCodexParserState('root-file');
  state = parseCodexLine(
    tokenLine({ inputTotal: 100, inputLast: 100 }),
    state,
  ).state;
  const result = parseCodexLine(
    tokenLine({ inputTotal: 90, inputLast: 0 }),
    state,
  );

  assert.ok(result.state.qualityFlags.includes('counter-regression'));
  assert.equal(result.events.length, 0);
});

test('session metadata is pseudonymized and auto-review stays distinct', () => {
  const pseudonyms: Record<string, string> = {
    'raw-session': 'session:001',
    'raw-parent': 'session:000',
    '/private/project': 'project:001',
  };
  const pseudonymize = (raw: string): string => pseudonyms[raw] ?? 'unknown:key';
  const line = JSON.stringify({
    timestamp: '2026-07-20T00:00:00.000Z',
    type: 'session_meta',
    payload: {
      id: 'raw-session',
      cwd: '/private/project',
      source: {
        subagent: {
          thread_spawn: {
            parent_thread_id: 'raw-parent',
            agent_role: 'codex-auto-review',
          },
        },
      },
    },
  });

  const sessionsState = parseCodexLine(
    line,
    createCodexParserState('sessions-file'),
    pseudonymize,
  ).state;
  const archiveState = parseCodexLine(
    line,
    createCodexParserState('archive-file'),
    pseudonymize,
  ).state;

  assert.equal(sessionsState.sessionKey, 'session:001');
  assert.equal(archiveState.sessionKey, 'session:001');
  assert.equal(sessionsState.parentSessionKey, 'session:000');
  assert.equal(sessionsState.projectKey, 'project:001');
  assert.equal(sessionsState.role, 'approval-reviewer');
  assert.doesNotMatch(JSON.stringify(sessionsState), /raw-session|raw-parent|private\/project/);
});

test('repeated metadata cannot erase an established child role', () => {
  const pseudonymize = (raw: string): string => `safe:${raw}`;
  let state = parseCodexLine(
    JSON.stringify({
      timestamp: '2026-07-20T00:00:00.000Z',
      type: 'session_meta',
      payload: {
        id: 'child',
        source: {
          subagent: {
            thread_spawn: { parent_thread_id: 'parent' },
          },
        },
      },
    }),
    createCodexParserState('child-file'),
    pseudonymize,
  ).state;

  state = parseCodexLine(
    JSON.stringify({
      timestamp: '2026-07-20T00:00:01.000Z',
      type: 'session_meta',
      payload: { id: 'child' },
    }),
    state,
    pseudonymize,
  ).state;

  assert.equal(state.parentSessionKey, 'safe:parent');
  assert.equal(state.role, 'subagent');
});

test('guardian subagent metadata maps to an approval reviewer', () => {
  const state = parseCodexLine(
    JSON.stringify({
      timestamp: '2026-07-20T00:00:00.000Z',
      type: 'session_meta',
      payload: {
        id: 'review',
        parent_thread_id: 'parent',
        source: { subagent: { other: 'guardian' } },
      },
    }),
    createCodexParserState('review-file'),
    (raw) => `safe:${raw}`,
  ).state;

  assert.equal(state.parentSessionKey, 'safe:parent');
  assert.equal(state.role, 'approval-reviewer');
});

test('compaction and patch calls emit structural facts without bodies', () => {
  let state = createCodexParserState('file-key');
  const compacted = parseCodexLine(
    JSON.stringify({
      timestamp: '2026-07-20T01:00:00.000Z',
      type: 'event_msg',
      payload: { type: 'context_compacted', message: 'must not be read' },
    }),
    state,
  );
  state = compacted.state;
  const patched = parseCodexLine(
    JSON.stringify({
      timestamp: '2026-07-20T01:01:00.000Z',
      type: 'response_item',
      payload: {
        type: 'function_call',
        name: 'apply_patch',
        arguments: '{"private":"body"}',
      },
    }),
    state,
  );

  assert.deepEqual(compacted.structural, {
    kind: 'compaction',
    timestamp: Date.parse('2026-07-20T01:00:00.000Z'),
  });
  assert.deepEqual(patched.structural, {
    kind: 'patch',
    name: 'apply_patch',
    timestamp: Date.parse('2026-07-20T01:01:00.000Z'),
  });
  assert.doesNotMatch(JSON.stringify(patched), /private|body/);
});
