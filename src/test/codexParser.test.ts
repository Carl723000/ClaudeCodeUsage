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
