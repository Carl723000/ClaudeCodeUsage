import { after, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { scanUsageManifest } from '../claudeUsageFiles';
import { ClaudeDataLoader } from '../dataLoader';
import { I18n } from '../i18n';
import { ClaudeUsageRecord, ContentAnalysis } from '../types';

const tempRoots: string[] = [];

after(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
});

function record(model: string): ClaudeUsageRecord {
  return {
    timestamp: new Date().toISOString(),
    message: {
      model,
      usage: { input_tokens: 1_000, output_tokens: 10 },
    },
  };
}

test('getCurrentContextInfo reports a 1M window for Sonnet 5', () => {
  const info = ClaudeDataLoader.getCurrentContextInfo([record('claude-sonnet-5')]);
  assert.ok(info, 'expected context info, got null');
  assert.equal(info!.windowTokens, 1_000_000);
  assert.equal(info!.estimated, false);
});

test('getCurrentContextInfo reports a 1M window for Opus 5, with or without the [1m] marker', () => {
  for (const model of ['claude-opus-5', 'claude-opus-5[1m]']) {
    const info = ClaudeDataLoader.getCurrentContextInfo([record(model)]);
    assert.ok(info, `expected context info for ${model}, got null`);
    assert.equal(info!.windowTokens, 1_000_000, model);
    assert.equal(info!.estimated, false, model);
  }
});

test('getCurrentContextInfo keeps the 200K window for pre-4.6 Opus and Sonnet', () => {
  for (const model of ['claude-opus-4-20250514', 'claude-sonnet-4-5-20250929', 'claude-3-5-sonnet-20241022']) {
    const info = ClaudeDataLoader.getCurrentContextInfo([record(model)]);
    assert.ok(info, `expected context info for ${model}, got null`);
    assert.equal(info!.windowTokens, 200_000, model);
  }
});

test('day attribution uses the configured timezone instead of the host timezone', () => {
  const previousTimeZone = I18n.getTimezone();
  const fixedNow = new Date('2026-07-21T02:00:00.000Z');
  const attributionRecord = (
    timestamp: string,
    inputTokens: number,
    sessionId: string,
  ): ClaudeUsageRecord => ({
    timestamp,
    _sessionId: sessionId,
    message: {
      model: 'claude-sonnet-4-5',
      usage: { input_tokens: inputTokens, output_tokens: 10 },
    },
  });

  try {
    I18n.setTimezone('America/New_York');
    const attribution = ClaudeDataLoader.getUsageAttribution(
      [
        attributionRecord('2026-07-20T03:30:00.000Z', 200, 'previous-day'),
        attributionRecord('2026-07-21T01:00:00.000Z', 100, 'configured-today'),
      ],
      null,
      { kind: 'day' },
      fixedNow,
    );

    assert.equal(attribution.totalTokens, 110);
    assert.deepEqual(attribution.models.map(({ key, count }) => ({ key, count })), [
      { key: 'claude-sonnet-4-5', count: 1 },
    ]);
  } finally {
    I18n.setTimezone(previousTimeZone);
  }
});

function assertRollingAttributionUsesCivilDays(
  kind: 'week' | 'month',
  cases: ReadonlyArray<{
    timeZone: string;
    now: string;
    outside: string;
    outsideDay: string;
    inside: string;
    insideDay: string;
  }>,
): void {
  const previousTimeZone = I18n.getTimezone();
  const attributionRecord = (
    timestamp: string,
    inputTokens: number,
    sessionId: string,
  ): ClaudeUsageRecord => ({
    timestamp,
    _sessionId: sessionId,
    message: {
      model: 'claude-sonnet-4-5',
      usage: { input_tokens: inputTokens, output_tokens: 10 },
    },
  });

  try {
    for (const sample of cases) {
      I18n.setTimezone(sample.timeZone);
      const analysis: ContentAnalysis = {
        categories: [],
        toolResultBreakdown: [],
        totalEstimatedTokens: 0,
        recentPrompts: [],
        thinkingBySession: {},
        thinkingByDay: {},
        skillUses: [
          {
            name: 'outside-skill',
            sessionId: 'outside',
            day: sample.outsideDay,
            ts: Date.parse(sample.outside),
            estTokens: 50,
          },
          {
            name: 'inside-skill',
            sessionId: 'inside',
            day: sample.insideDay,
            ts: Date.parse(sample.inside),
            estTokens: 100,
          },
        ],
      };
      const attribution = ClaudeDataLoader.getUsageAttribution(
        [
          attributionRecord(sample.outside, 500, 'outside'),
          attributionRecord(sample.inside, 1_000, 'inside'),
        ],
        analysis,
        { kind },
        new Date(sample.now),
      );

      assert.equal(attribution.totalTokens, 1_010, sample.timeZone);
      assert.deepEqual(attribution.skills.map(({ key }) => key), ['inside-skill'], sample.timeZone);
    }
  } finally {
    I18n.setTimezone(previousTimeZone);
  }
}

test('week attribution uses seven configured-zone civil days', () => {
  assertRollingAttributionUsesCivilDays('week', [
    {
      timeZone: 'Asia/Tokyo',
      now: '2026-07-21T23:30:00.000Z',
      outside: '2026-07-15T05:00:00.000Z',
      outsideDay: '2026-07-15',
      inside: '2026-07-15T15:30:00.000Z',
      insideDay: '2026-07-16',
    },
    {
      timeZone: 'Pacific/Honolulu',
      now: '2026-07-21T05:00:00.000Z',
      outside: '2026-07-14T07:00:00.000Z',
      outsideDay: '2026-07-13',
      inside: '2026-07-14T12:00:00.000Z',
      insideDay: '2026-07-14',
    },
  ]);
});

test('month attribution uses thirty configured-zone civil days', () => {
  assertRollingAttributionUsesCivilDays('month', [
    {
      timeZone: 'Asia/Tokyo',
      now: '2026-07-21T23:30:00.000Z',
      outside: '2026-06-22T05:00:00.000Z',
      outsideDay: '2026-06-22',
      inside: '2026-06-22T15:30:00.000Z',
      insideDay: '2026-06-23',
    },
    {
      timeZone: 'Pacific/Honolulu',
      now: '2026-07-21T05:00:00.000Z',
      outside: '2026-06-21T07:00:00.000Z',
      outsideDay: '2026-06-20',
      inside: '2026-06-21T12:00:00.000Z',
      insideDay: '2026-06-21',
    },
  ]);
});

test('rolling attribution rebuckets cached skill-use timestamps after a timezone change', () => {
  const previousTimeZone = I18n.getTimezone();
  const outside = '2026-07-15T05:00:00.000Z';
  const inside = '2026-07-15T15:30:00.000Z';
  const analysis: ContentAnalysis = {
    categories: [],
    toolResultBreakdown: [],
    totalEstimatedTokens: 0,
    recentPrompts: [],
    thinkingBySession: {},
    thinkingByDay: {},
    skillUses: [
      {
        name: 'outside-skill',
        sessionId: 'outside',
        day: '2026-07-16',
        ts: Date.parse(outside),
        estTokens: 50,
      },
      {
        name: 'inside-skill',
        sessionId: 'inside',
        day: '2026-07-15',
        ts: Date.parse(inside),
        estTokens: 100,
      },
    ],
  };

  try {
    I18n.setTimezone('Asia/Tokyo');
    const attribution = ClaudeDataLoader.getUsageAttribution(
      [
        {
          timestamp: outside,
          _sessionId: 'outside',
          message: {
            model: 'claude-sonnet-4-5',
            usage: { input_tokens: 500, output_tokens: 10 },
          },
        },
        {
          timestamp: inside,
          _sessionId: 'inside',
          message: {
            model: 'claude-sonnet-4-5',
            usage: { input_tokens: 1_000, output_tokens: 10 },
          },
        },
      ],
      analysis,
      { kind: 'week' },
      new Date('2026-07-21T23:30:00.000Z'),
    );

    assert.equal(attribution.totalTokens, 1_010);
    assert.deepEqual(attribution.skills.map(({ key }) => key), ['inside-skill']);
  } finally {
    I18n.setTimezone(previousTimeZone);
  }
});

test('share-card rolling ranges use configured-zone civil days', () => {
  const previousTimeZone = I18n.getTimezone();
  const fixedNow = new Date('2026-07-08T04:00:00.000Z');
  const shareRecord = (
    timestamp: string,
    inputTokens: number,
    id: string,
  ): ClaudeUsageRecord => ({
    timestamp,
    requestId: `request-${id}`,
    message: {
      id: `message-${id}`,
      model: 'claude-sonnet-4-5',
      usage: { input_tokens: inputTokens, output_tokens: 0 },
    },
  });
  const cases = [
    { range: 'week', outside: '2026-07-01T06:00:00.000Z', inside: '2026-07-01T12:00:00.000Z' },
    { range: 'last30', outside: '2026-06-08T06:00:00.000Z', inside: '2026-06-08T12:00:00.000Z' },
    { range: 'year', outside: '2025-07-08T06:00:00.000Z', inside: '2025-07-08T12:00:00.000Z' },
  ] as const;

  try {
    I18n.setTimezone('Pacific/Honolulu');
    for (const { range, outside, inside } of cases) {
      const input = ClaudeDataLoader.buildShareInput(
        [
          shareRecord(outside, 500, `${range}-outside`),
          shareRecord(inside, 1_000, `${range}-inside`),
        ],
        range,
        'all',
        fixedNow,
      );
      assert.equal(input.rangeData.totalInputTokens, 1_000, range);
      assert.deepEqual(input.dailyDates, [inside.slice(0, 10)], range);
    }
  } finally {
    I18n.setTimezone(previousTimeZone);
  }
});

test('an injected manifest is authoritative and returns anonymous load counters', async () => {
  const manifestRoot = await mkdtemp(path.join(os.tmpdir(), 'ccu-loader-manifest-'));
  const emptyArgumentRoot = await mkdtemp(path.join(os.tmpdir(), 'ccu-loader-empty-'));
  tempRoots.push(manifestRoot, emptyArgumentRoot);
  const project = path.join(manifestRoot, 'projects', '-tmp-project');
  await mkdir(project, { recursive: true });
  const line = JSON.stringify({
    type: 'assistant',
    timestamp: '2026-07-17T00:00:00.000Z',
    requestId: 'request-1',
    message: {
      id: 'message-1',
      model: 'claude-sonnet-4-5',
      usage: { input_tokens: 10, output_tokens: 2 },
    },
  }) + '\n';
  await writeFile(path.join(project, 'session.jsonl'), line);
  const manifest = await scanUsageManifest([manifestRoot]);

  const loaded = await ClaudeDataLoader.loadUsageRecords(emptyArgumentRoot, {
    analyzeContent: false,
    manifest,
  });

  assert.equal(loaded.records.length, 1);
  assert.equal(loaded.diagnostics.filesDiscovered, 1);
  assert.ok(loaded.diagnostics.bytesRead >= Buffer.byteLength(line, 'utf8'));
  assert.equal(loaded.diagnostics.linesParsed, 1);
  assert.equal(loaded.diagnostics.filesFailed, 0);
});

test('a file that disappears after manifest scan marks the load incomplete', async () => {
  const manifestRoot = await mkdtemp(path.join(os.tmpdir(), 'ccu-loader-race-'));
  tempRoots.push(manifestRoot);
  const project = path.join(manifestRoot, 'projects', '-tmp-project');
  await mkdir(project, { recursive: true });
  const file = path.join(project, 'vanishing.jsonl');
  await writeFile(file, '{"timestamp":"2026-07-17T00:00:00.000Z"}\n');
  const manifest = await scanUsageManifest([manifestRoot]);
  await rm(file);
  const loaded = await ClaudeDataLoader.loadUsageRecords(manifestRoot, {
    analyzeContent: false,
    manifest,
  });
  assert.equal(loaded.diagnostics.filesFailed, 1);
});

interface UsageFixture {
  messageId?: string;
  requestId?: string;
  input: number;
  output: number;
  cacheCreation?: number;
  cacheRead?: number;
  contentType?: 'thinking' | 'text';
  timestamp?: string;
}

function usageFixtureLine(fixture: UsageFixture): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: fixture.timestamp ?? '2026-08-21T00:00:00.000Z',
    ...(fixture.requestId ? { requestId: fixture.requestId } : {}),
    message: {
      ...(fixture.messageId ? { id: fixture.messageId } : {}),
      model: 'claude-haiku-4-5-20251001',
      content: fixture.contentType ? [{ type: fixture.contentType }] : [],
      usage: {
        input_tokens: fixture.input,
        output_tokens: fixture.output,
        cache_creation_input_tokens: fixture.cacheCreation ?? 0,
        cache_read_input_tokens: fixture.cacheRead ?? 0,
      },
    },
  });
}

async function loadDedupFixture(files: Record<string, UsageFixture[]>): Promise<ClaudeUsageRecord[]> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-loader-dedup-'));
  tempRoots.push(root);
  const project = path.join(root, 'projects', '-dedup-fixture');
  await mkdir(project, { recursive: true });
  await Promise.all(Object.entries(files).map(([name, fixtures]) =>
    writeFile(
      path.join(project, `${name}.jsonl`),
      `${fixtures.map(usageFixtureLine).join('\n')}\n`,
      'utf8',
    ),
  ));
  return (await ClaudeDataLoader.loadUsageRecords(root, { analyzeContent: false })).records;
}

function recordTokenTotal(value: ClaudeUsageRecord): number {
  const usage = value.message.usage;
  return usage.input_tokens + usage.output_tokens
    + (usage.cache_creation_input_tokens ?? 0)
    + (usage.cache_read_input_tokens ?? 0);
}

test('thinking and text transcript rows with one response identity count once', async () => {
  const identity = { messageId: 'message-thinking-text', requestId: 'request-thinking-text' };
  const records = await loadDedupFixture({
    session: [
      { ...identity, input: 3_709, output: 80, contentType: 'thinking' },
      { ...identity, input: 3_709, output: 80, contentType: 'text' },
    ],
  });

  assert.equal(records.length, 1);
  assert.equal(recordTokenTotal(records[0]), 3_789);
});

test('monotonic snapshots with one response identity retain only the maximum vector', async () => {
  const identity = { messageId: 'message-stream', requestId: 'request-stream' };
  const records = await loadDedupFixture({
    session: [
      { ...identity, input: 100, output: 10, cacheCreation: 5, cacheRead: 20 },
      { ...identity, input: 120, output: 30, cacheCreation: 5, cacheRead: 40 },
    ],
  });

  assert.equal(records.length, 1);
  assert.deepEqual(records[0].message.usage, {
    input_tokens: 120,
    output_tokens: 30,
    cache_creation_input_tokens: 5,
    cache_read_input_tokens: 40,
  });
});

test('a cross-file transcript clone with the same response identity counts once', async () => {
  const duplicate = {
    messageId: 'message-clone',
    requestId: 'request-clone',
    input: 500,
    output: 25,
  };
  const records = await loadDedupFixture({ original: [duplicate], clone: [duplicate] });

  assert.equal(records.length, 1);
  assert.equal(recordTokenTotal(records[0]), 525);
});

test('the same message ID with distinct request IDs remains separately counted', async () => {
  const records = await loadDedupFixture({
    session: [
      { messageId: 'message-reused', requestId: 'request-a', input: 100, output: 10 },
      { messageId: 'message-reused', requestId: 'request-b', input: 200, output: 20 },
    ],
  });

  assert.equal(records.length, 2);
  assert.equal(records.reduce((sum, value) => sum + recordTokenTotal(value), 0), 330);
});

test('request ID presence may degrade within one message without double-counting', async () => {
  for (const [name, fixtures] of Object.entries({
    missingFirst: [
      { messageId: 'message-missing-first', input: 300, output: 30 },
      { messageId: 'message-missing-first', requestId: 'request-known', input: 300, output: 30 },
    ],
    knownFirst: [
      { messageId: 'message-known-first', requestId: 'request-known', input: 400, output: 40 },
      { messageId: 'message-known-first', input: 400, output: 40 },
    ],
  })) {
    const records = await loadDedupFixture({ [name]: fixtures });
    assert.equal(records.length, 1, name);
  }
});

test('content analysis keeps framework injection out of user prompt samples and emits numeric-only overhead', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ccu-loader-framework-'));
  tempRoots.push(root);
  const project = path.join(root, 'projects', '-tmp-project');
  await mkdir(project, { recursive: true });
  const timestamp = new Date().toISOString();
  const lines = [
    {
      type: 'user',
      uuid: 'user-1',
      timestamp,
      cwd: '/private/project-sentinel',
      message: { role: 'user', content: 'Please fix the login bug carefully.' },
    },
    {
      type: 'user',
      uuid: 'user-web-component',
      timestamp,
      cwd: '/private/project-sentinel',
      message: {
        role: 'user',
        content: '<my-component data-mode="safe">Please review this component.</my-component>',
      },
    },
    {
      type: 'user',
      uuid: 'meta-1',
      timestamp,
      isMeta: true,
      message: { role: 'user', content: 'PRIVATE_META_FRAMEWORK_TEXT' },
    },
    {
      type: 'user',
      uuid: 'command-1',
      timestamp,
      message: { role: 'user', content: '<command-name>/review</command-name>' },
    },
    {
      type: 'user',
      uuid: 'reminder-1',
      timestamp,
      message: {
        role: 'user',
        content: [{
          type: 'text',
          text: 'User-looking prefix <system-reminder>PRIVATE_REMINDER</system-reminder>',
        }],
      },
    },
    {
      type: 'user',
      uuid: 'compaction-1',
      timestamp,
      message: {
        role: 'user',
        content: 'This session is being continued from a previous conversation PRIVATE_COMPACTION_SENTINEL',
      },
    },
    {
      type: 'assistant',
      uuid: 'assistant-1',
      timestamp,
      message: {
        role: 'assistant',
        model: 'claude-sonnet-4-5',
        usage: { input_tokens: 10, output_tokens: 2 },
        content: [{ type: 'tool_use', id: 'tool-private-id', name: 'Skill', input: { skill: 'review' } }],
      },
    },
    {
      type: 'user',
      uuid: 'tool-result-1',
      timestamp,
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tool-private-id', content: 'PRIVATE_SKILL_PREAMBLE' }],
      },
    },
  ];
  const body = lines.map((line) => JSON.stringify(line)).join('\n') + '\n';
  await writeFile(path.join(project, 'session.jsonl'), body);
  const manifest = await scanUsageManifest([root]);

  const loaded = await ClaudeDataLoader.loadUsageRecords(root, {
    analyzeContent: true,
    windowDays: 30,
    manifest,
  });
  const analysis = loaded.contentAnalysis;
  assert.ok(analysis);
  assert.deepEqual(analysis!.recentPrompts.map((prompt) => prompt.text), [
    'Please fix the login bug carefully.',
    '<my-component data-mode="safe">Please review this component.</my-component>',
  ]);
  assert.ok((analysis!.frameworkOverhead?.frameworkEstimatedTokens ?? 0) > 0);
  assert.ok(
    (analysis!.frameworkOverhead?.observedInputEstimatedTokens ?? 0) >=
      (analysis!.frameworkOverhead?.frameworkEstimatedTokens ?? 0),
  );
  assert.ok((analysis!.frameworkOverhead?.userAuthoredEstimatedTokens ?? 0) > 0);
  assert.ok((analysis!.frameworkOverhead?.toolResultEstimatedTokens ?? 0) > 0);
  assert.deepEqual(
    analysis!.frameworkOverhead?.components.map((component) => component.kind),
    ['command-echo', 'meta', 'skill-preamble', 'system-reminder', 'tool-result-envelope'],
  );
  const serialized = JSON.stringify(analysis!.frameworkOverhead);
  for (const privateText of [
    'PRIVATE_META_FRAMEWORK_TEXT',
    'PRIVATE_REMINDER',
    'PRIVATE_SKILL_PREAMBLE',
    'PRIVATE_COMPACTION_SENTINEL',
    '/private/project-sentinel',
    'tool-private-id',
  ]) {
    assert.equal(serialized.includes(privateText), false);
  }
});
