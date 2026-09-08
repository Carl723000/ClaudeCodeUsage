import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  createEmptyQuotaObservationStore,
  deriveQuotaResetEvents,
  fingerprintForStableIdentity,
  loadQuotaObservationStore,
  mergeQuotaCaptures,
  QuotaCapture,
  QuotaObservationRepository,
  QuotaObservationScopedClearBlockedError,
  quotaStoreWeeklyObservations,
  saveQuotaObservationStoreAtomic,
} from '../quotaObservationStore';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-09-02T12:00:00.000Z');
const RESET = Date.parse('2026-09-07T03:24:00.000Z');
const SALT = '00112233445566778899aabbccddeeff';

function capture(overrides: Partial<QuotaCapture> = {}): QuotaCapture {
  return {
    provider: 'codex',
    unattributedEpochSignal: 'fixture-codex-epoch',
    accountAttribution: 'unattributed',
    observedAt: NOW,
    periodType: 'seven-day',
    usedFraction: 0.3,
    resetAt: RESET,
    source: 'codex-local-structured-event',
    confidence: 'medium',
    captureReason: 'refresh',
    ...overrides,
  };
}

test('stable fingerprints are machine-local and never retain the raw identity signal', () => {
  const first = fingerprintForStableIdentity(SALT, 'claude', '/private/profile-a');
  const repeated = fingerprintForStableIdentity(SALT, 'claude', '/private/profile-a');
  const other = fingerprintForStableIdentity(SALT, 'claude', '/private/profile-b');

  assert.equal(first, repeated);
  assert.notEqual(first, other);
  assert.equal(first.includes('/private/profile-a'), false);

  const merged = mergeQuotaCaptures(createEmptyQuotaObservationStore(), [capture({
    provider: 'claude',
    stableIdentitySignal: '/private/profile-a',
    accountAttribution: 'profile-continuity',
    source: 'claude-official-api',
    sourceWindowId: 'private-provider-window-canary',
  })], { salt: SALT, now: NOW });
  const serialized = JSON.stringify(merged);
  assert.equal(serialized.includes('/private/profile-a'), false);
  assert.equal(serialized.includes('private-provider-window-canary'), false);
  assert.equal(merged.observations[0].accountFingerprint, first);
  assert.match(
    merged.observations[0].providerWindowFingerprint ?? '',
    /^pwin_[a-f0-9]{32}$/,
  );
});

test('exact duplicate polls are idempotent while changed utilization is retained', () => {
  const first = capture({ observedAt: NOW - HOUR, usedFraction: 0.2 });
  let store = mergeQuotaCaptures(createEmptyQuotaObservationStore(), [first, first], {
    salt: SALT,
    now: NOW,
  });
  store = mergeQuotaCaptures(store, [
    first,
    capture({ observedAt: NOW, usedFraction: 0.3 }),
  ], { salt: SALT, now: NOW });

  assert.equal(store.observations.length, 2);
  assert.deepEqual(store.observations.map((item) => item.usedFraction), [0.2, 0.3]);
  assert.equal(new Set(store.observations.map((item) => item.windowId)).size, 1);
});

test('structured windows remain deterministic when observations arrive out of order', () => {
  const early = capture({ observedAt: NOW - HOUR, usedFraction: 0.2 });
  const late = capture({ observedAt: NOW, usedFraction: 0.3 });
  const ordered = mergeQuotaCaptures(createEmptyQuotaObservationStore(), [early, late], {
    salt: SALT,
    now: NOW,
  });
  let reversed = mergeQuotaCaptures(createEmptyQuotaObservationStore(), [late], {
    salt: SALT,
    now: NOW,
  });
  reversed = mergeQuotaCaptures(reversed, [early], { salt: SALT, now: NOW });

  assert.deepEqual(reversed, ordered);
  assert.equal(new Set(ordered.observations.map((item) => item.windowId)).size, 1);
});

test('reset projections remain deterministic when the post-reset fact arrives first', () => {
  const before = capture({
    observedAt: NOW - HOUR,
    resetAt: NOW + HOUR,
    usedFraction: 0.9,
    unattributedEpochSignal: 'before-reset-epoch',
  });
  const after = capture({
    observedAt: NOW,
    resetAt: NOW + 8 * HOUR,
    usedFraction: 0.05,
    unattributedEpochSignal: 'after-reset-epoch',
  });
  const ordered = mergeQuotaCaptures(createEmptyQuotaObservationStore(), [before, after], {
    salt: SALT,
    now: NOW,
  });
  let reversed = mergeQuotaCaptures(createEmptyQuotaObservationStore(), [after], {
    salt: SALT,
    now: NOW,
  });
  reversed = mergeQuotaCaptures(reversed, [before], { salt: SALT, now: NOW });

  assert.deepEqual(reversed, ordered);
  assert.deepEqual(deriveQuotaResetEvents(reversed), deriveQuotaResetEvents(ordered));
  assert.equal(deriveQuotaResetEvents(reversed)[0].evidence, 'reset-at-change');
});

test('resetAt changes retain consecutive and same-day reset events', () => {
  const firstReset = NOW + 2 * HOUR;
  const secondReset = NOW + 8 * HOUR;
  const thirdReset = NOW + 14 * HOUR;
  const store = mergeQuotaCaptures(createEmptyQuotaObservationStore(), [
    capture({ observedAt: NOW - HOUR, resetAt: firstReset, usedFraction: 0.92 }),
    capture({ observedAt: NOW, resetAt: secondReset, usedFraction: 0.03 }),
    capture({ observedAt: NOW + HOUR, resetAt: thirdReset, usedFraction: 0.02 }),
  ], { salt: SALT, now: NOW + 2 * HOUR });

  const resetEvents = deriveQuotaResetEvents(store);
  assert.equal(resetEvents.length, 2);
  assert.deepEqual(resetEvents.map((event) => event.evidence), [
    'reset-at-change',
    'reset-at-change',
  ]);
  assert.equal(new Set(store.observations.map((item) => item.windowId)).size, 3);
  assert.equal(new Set(store.observations.map((item) => item.accountFingerprint)).size, 1);
});

test('unattributed reset epochs retain low-confidence account ambiguity at a reset boundary', () => {
  const store = mergeQuotaCaptures(createEmptyQuotaObservationStore(), [
    capture({
      observedAt: NOW - HOUR,
      resetAt: NOW + HOUR,
      usedFraction: 0.91,
      unattributedEpochSignal: 'first-unattributed-window',
    }),
    capture({
      observedAt: NOW,
      resetAt: NOW + 8 * HOUR,
      usedFraction: 0.04,
      unattributedEpochSignal: 'second-unattributed-window',
    }),
  ], { salt: SALT, now: NOW });

  assert.equal(new Set(store.observations.map((item) => item.accountFingerprint)).size, 2);
  assert.equal(new Set(store.observations.map((item) => item.windowId)).size, 2);
  assert.equal(store.observations[1].flags.includes('account-ambiguous'), true);
  const events = deriveQuotaResetEvents(store);
  assert.equal(events.length, 1);
  assert.equal(events[0].evidence, 'reset-at-change');
  assert.notEqual(events[0].previousAccountFingerprint, events[0].nextAccountFingerprint);
});

test('a legacy account-ambiguous flag survives a coherent reset boundary', () => {
  const first = mergeQuotaCaptures(createEmptyQuotaObservationStore(), [capture({
    observedAt: NOW - HOUR,
    resetAt: NOW + HOUR,
    usedFraction: 0.91,
    unattributedEpochSignal: 'legacy-first-window',
  })], { salt: SALT, now: NOW });
  const legacy = mergeQuotaCaptures(first, [capture({
    observedAt: NOW,
    resetAt: NOW + 8 * HOUR,
    usedFraction: 0.04,
    unattributedEpochSignal: 'legacy-second-window',
    flags: ['account-ambiguous'],
  })], { salt: SALT, now: NOW });

  assert.equal(legacy.observations[1].captureReason, 'reset-at-change');
  assert.equal(legacy.observations[1].flags.includes('account-ambiguous'), true);
});

test('an unattributed epoch change without reset evidence remains account ambiguous', () => {
  const store = mergeQuotaCaptures(createEmptyQuotaObservationStore(), [
    capture({
      observedAt: NOW - HOUR,
      usedFraction: 0.2,
      unattributedEpochSignal: 'first-unattributed-epoch',
    }),
    capture({
      observedAt: NOW,
      usedFraction: 0.3,
      unattributedEpochSignal: 'second-unattributed-epoch',
    }),
  ], { salt: SALT, now: NOW });

  assert.equal(store.observations[1].captureReason, 'refresh');
  assert.ok(store.observations[1].flags.includes('account-ambiguous'));
});

test('small percentage rollback is noise but a significant rollback creates a new window', () => {
  const noisy = mergeQuotaCaptures(createEmptyQuotaObservationStore(), [
    capture({ observedAt: NOW - 2 * HOUR, usedFraction: 0.5 }),
    capture({ observedAt: NOW - HOUR, usedFraction: 0.48 }),
  ], { salt: SALT, now: NOW });
  assert.equal(deriveQuotaResetEvents(noisy).length, 0);
  assert.equal(new Set(noisy.observations.map((item) => item.windowId)).size, 1);

  const reset = mergeQuotaCaptures(noisy, [
    capture({ observedAt: NOW, usedFraction: 0.08 }),
  ], { salt: SALT, now: NOW });
  const resetEvents = deriveQuotaResetEvents(reset);
  assert.equal(resetEvents.length, 1);
  assert.equal(resetEvents[0].evidence, 'usage-drop');
  assert.notEqual(reset.observations[1].windowId, reset.observations[2].windowId);
});

test('different stable account signals never share a fingerprint or window', () => {
  const store = mergeQuotaCaptures(createEmptyQuotaObservationStore(), [
    capture({
      provider: 'claude',
      stableIdentitySignal: '/profile/a',
      accountAttribution: 'profile-continuity',
      source: 'claude-official-api',
    }),
    capture({
      provider: 'claude',
      stableIdentitySignal: '/profile/b',
      accountAttribution: 'profile-continuity',
      source: 'claude-official-api',
    }),
  ], { salt: SALT, now: NOW });

  assert.equal(new Set(store.observations.map((item) => item.accountFingerprint)).size, 2);
  assert.equal(new Set(store.observations.map((item) => item.windowId)).size, 2);
});

test('an account epoch change alone does not invent an official reset event', () => {
  const store = mergeQuotaCaptures(createEmptyQuotaObservationStore(), [
    capture({
      provider: 'claude',
      stableIdentitySignal: '/profile/a',
      accountAttribution: 'profile-continuity',
      source: 'claude-official-api',
      observedAt: NOW - HOUR,
      usedFraction: 0.2,
    }),
    capture({
      provider: 'claude',
      stableIdentitySignal: '/profile/b',
      accountAttribution: 'profile-continuity',
      source: 'claude-official-api',
      observedAt: NOW,
      usedFraction: 0.3,
    }),
  ], { salt: SALT, now: NOW });

  assert.equal(new Set(store.observations.map((item) => item.accountFingerprint)).size, 2);
  assert.equal(new Set(store.observations.map((item) => item.windowId)).size, 2);
  assert.ok(store.observations[1].flags.includes('account-ambiguous'));
  assert.deepEqual(deriveQuotaResetEvents(store), []);
});

test('invalid and far-future captures are rejected without manufacturing values', () => {
  const store = mergeQuotaCaptures(createEmptyQuotaObservationStore(), [
    capture({ usedFraction: Number.NaN }),
    capture({ usedFraction: 1.01 }),
    capture({ observedAt: NOW + 2 * DAY }),
    capture({ resetAt: null, usedFraction: 0 }),
  ], { salt: SALT, now: NOW });

  assert.equal(store.observations.length, 1);
  assert.equal(store.observations[0].usedFraction, 0);
  assert.equal(store.observations[0].remainingFraction, 1);
  assert.equal(store.observations[0].resetAt, null);
});

test('weekly projection exposes only seven-day facts and retains attribution metadata', () => {
  const store = mergeQuotaCaptures(createEmptyQuotaObservationStore(), [
    capture({ periodType: 'five-hour', usedFraction: 0.4 }),
    capture({ periodType: 'seven-day', usedFraction: 0.3 }),
  ], { salt: SALT, now: NOW });
  const rows = quotaStoreWeeklyObservations(store, 'codex');

  assert.equal(rows.length, 1);
  assert.equal(rows[0].usedPercent, 30);
  assert.equal(rows[0].accountAttribution, 'unattributed');
  assert.equal(rows[0].seriesKey, 'codex-epoch-1');
  assert.notEqual(rows[0].seriesKey, store.observations[1].accountFingerprint);
  assert.equal(rows[0].windowId, 'codex-window-1');
  assert.doesNotMatch(JSON.stringify(rows), /(?:acct|anon|win|pwin)_[a-f0-9]{32}/);
});

test('retention and compaction preserve a live window first and last observation', () => {
  const additions = Array.from({ length: 10 }, (_unused, index) => capture({
    observedAt: NOW - (9 - index) * HOUR,
    usedFraction: 0.1 + index * 0.01,
  }));
  const compacted = mergeQuotaCaptures(createEmptyQuotaObservationStore(), additions, {
    salt: SALT,
    now: NOW,
    limitPerSeries: 4,
  });
  assert.equal(compacted.observations.length, 4);
  assert.ok(compacted.observations.some((item) => item.observedAt === NOW - 9 * HOUR));
  assert.ok(compacted.observations.some((item) => item.observedAt === NOW));

  const oldNow = NOW - 190 * DAY;
  const old = mergeQuotaCaptures(createEmptyQuotaObservationStore(), [capture({
    observedAt: oldNow,
    resetAt: oldNow + DAY,
  })], { salt: SALT, now: oldNow });
  const retained = mergeQuotaCaptures(old, [], { salt: SALT, now: NOW });
  assert.equal(retained.observations.length, 0);
});

test('migration compaction keeps the oldest and newest boundary evidence', () => {
  const additions = Array.from({ length: 10 }, (_unused, index) => capture({
    observedAt: NOW - (9 - index) * HOUR,
    usedFraction: 0.1 + index * 0.01,
    captureReason: 'migration',
  }));
  const compacted = mergeQuotaCaptures(createEmptyQuotaObservationStore(), additions, {
    salt: SALT,
    now: NOW,
    limitPerSeries: 4,
  });

  assert.equal(compacted.observations.length, 4);
  assert.ok(compacted.observations.some((item) => item.observedAt === NOW - 9 * HOUR));
  assert.ok(compacted.observations.some((item) => item.observedAt === NOW));
});

test('quota store writes atomically and reloads a strict schema-2 document', async () => {
  const root = path.join(os.tmpdir(), `ccu-quota-store-${process.pid}-${Math.random().toString(16).slice(2)}`);
  await mkdir(root, { recursive: true });
  const file = path.join(root, 'quota-observations-v2.json');
  const store = mergeQuotaCaptures(createEmptyQuotaObservationStore(), [capture()], {
    salt: SALT,
    now: NOW,
  });
  await saveQuotaObservationStoreAtomic(file, store);
  const loaded = await loadQuotaObservationStore(file, { now: NOW });

  assert.equal(loaded.disposition, 'valid');
  assert.deepEqual(loaded.store, store);
  const persisted = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  assert.equal(persisted.schemaVersion, 2);
  assert.deepEqual(Object.keys(persisted).sort(), [
    'fingerprintAlgorithm',
    'observations',
    'schemaVersion',
  ]);
  assert.deepEqual(Object.keys((persisted.observations as Record<string, unknown>[])[0]).sort(), [
    'accountAttribution',
    'accountFingerprint',
    'captureReason',
    'confidence',
    'flags',
    'observedAt',
    'periodType',
    'provider',
    'providerWindowFingerprint',
    'remainingFraction',
    'resetAt',
    'schemaVersion',
    'source',
    'usedFraction',
    'windowId',
  ]);
  assert.equal(root.startsWith(os.tmpdir()), true);
});

test('corrupt and future-schema files are quarantined without exposing their contents', async () => {
  const root = path.join(os.tmpdir(), `ccu-quota-quarantine-${process.pid}-${Math.random().toString(16).slice(2)}`);
  await mkdir(root, { recursive: true });
  for (const [name, body] of [
    ['corrupt', '{secret-cookie'],
    ['future', JSON.stringify({ schemaVersion: 99, secret: 'token-canary' })],
  ] as const) {
    const file = path.join(root, `${name}.json`);
    await writeFile(file, body, 'utf8');
    const loaded = await loadQuotaObservationStore(file, { now: NOW });
    assert.equal(loaded.disposition, 'quarantined');
    assert.equal(loaded.store.observations.length, 0);
    assert.ok(loaded.quarantinePath);
    assert.equal(path.basename(loaded.quarantinePath ?? '').includes('secret'), false);
    await access(loaded.quarantinePath as string);
  }
});

test('repository serializes cross-instance concurrent appends without losing either observation', async () => {
  const root = path.join(os.tmpdir(), `ccu-quota-repository-${process.pid}-${Math.random().toString(16).slice(2)}`);
  await mkdir(root, { recursive: true });
  const file = path.join(root, 'quota-observations-v2.json');
  const repository = new QuotaObservationRepository(
    file,
    SALT,
    () => NOW,
  );
  const secondRepository = new QuotaObservationRepository(
    file,
    SALT,
    () => NOW,
  );
  await Promise.all([
    repository.append([capture({ observedAt: NOW - HOUR, usedFraction: 0.2 })]),
    secondRepository.append([capture({ observedAt: NOW, usedFraction: 0.3 })]),
  ]);
  const loaded = await repository.load();

  assert.equal(loaded.observations.length, 2);
  assert.deepEqual(loaded.observations.map((item) => item.usedFraction), [0.2, 0.3]);
});

test('repository clears exact provider and account scopes without rewriting unrelated epochs', async () => {
  const root = path.join(os.tmpdir(), `ccu-quota-clear-${process.pid}-${Math.random().toString(16).slice(2)}`);
  await mkdir(root, { recursive: true });
  const file = path.join(root, 'quota-observations-v2.json');
  const repository = new QuotaObservationRepository(file, SALT, () => NOW);
  await repository.append([
    capture({
      provider: 'claude',
      stableIdentitySignal: 'claude-profile-one',
      unattributedEpochSignal: undefined,
      accountAttribution: 'profile-continuity',
      source: 'claude-official-api',
      sourceWindowId: 'weekly',
      observedAt: NOW - 2 * HOUR,
    }),
    capture({
      provider: 'claude',
      stableIdentitySignal: 'claude-profile-two',
      unattributedEpochSignal: undefined,
      accountAttribution: 'profile-continuity',
      source: 'claude-official-api',
      sourceWindowId: 'weekly',
      observedAt: NOW - HOUR,
    }),
    capture({ observedAt: NOW }),
  ]);
  const seeded = await repository.load();
  const firstClaude = seeded.observations.find((item) =>
    item.provider === 'claude' && item.observedAt === NOW - 2 * HOUR,
  );
  assert.ok(firstClaude);

  const afterEpochClear = await repository.clear({
    provider: 'claude',
    accountFingerprint: firstClaude.accountFingerprint,
  });
  assert.equal(afterEpochClear.observations.length, 2);
  assert.equal(afterEpochClear.observations.some((item) =>
    item.accountFingerprint === firstClaude.accountFingerprint,
  ), false);
  assert.equal(afterEpochClear.observations.some((item) => item.provider === 'codex'), true);

  const afterProviderClear = await repository.clear({ provider: 'claude' });
  assert.deepEqual(afterProviderClear.observations.map((item) => item.provider), ['codex']);

  const afterAllClear = await repository.clear();
  assert.deepEqual(afterAllClear.observations, []);
  assert.deepEqual((await repository.load()).observations, []);
});

test('provider clear and a concurrent append preserve the new unrelated observation', async () => {
  const root = path.join(os.tmpdir(), `ccu-quota-clear-race-${process.pid}-${Math.random().toString(16).slice(2)}`);
  await mkdir(root, { recursive: true });
  const file = path.join(root, 'quota-observations-v2.json');
  const first = new QuotaObservationRepository(file, SALT, () => NOW);
  const second = new QuotaObservationRepository(file, SALT, () => NOW);
  await first.append([capture({ observedAt: NOW - HOUR })]);

  await Promise.all([
    first.clear({ provider: 'codex' }),
    second.append([capture({
      provider: 'claude',
      stableIdentitySignal: 'concurrent-profile',
      unattributedEpochSignal: undefined,
      accountAttribution: 'profile-continuity',
      source: 'claude-official-api',
      sourceWindowId: 'weekly',
      observedAt: NOW,
    })]),
  ]);
  const loaded = await first.load();
  assert.equal(loaded.observations.some((item) => item.provider === 'codex'), false);
  assert.equal(loaded.observations.some((item) => item.provider === 'claude'), true);
});

test('all-history clear purges exact auxiliaries under one lease and preserves later appends', async () => {
  const root = path.join(os.tmpdir(), `ccu-quota-clear-all-${process.pid}-${Math.random().toString(16).slice(2)}`);
  await mkdir(root, { recursive: true });
  const file = path.join(root, 'quota-observations-v2.json');
  const first = new QuotaObservationRepository(file, SALT, () => NOW);
  const second = new QuotaObservationRepository(file, SALT, () => NOW);
  await first.append([capture({ observedAt: NOW - HOUR })]);
  await writeFile(`${file}.quarantine-100-deadbeef`, 'quarantined-canary', 'utf8');
  await writeFile(path.join(root, '.quota-observations-v2.json.200.abcdef123456.tmp'), 'temp-canary', 'utf8');

  const cleared = await first.clear({});
  assert.deepEqual(cleared.observations, []);
  assert.deepEqual((await readdir(root)).sort(), ['quota-observations-v2.json']);

  await second.append([capture({
    provider: 'claude',
    stableIdentitySignal: 'post-clear-profile',
    unattributedEpochSignal: undefined,
    accountAttribution: 'profile-continuity',
    source: 'claude-official-api',
    sourceWindowId: 'weekly',
    observedAt: NOW,
  })]);
  const loaded = await first.load();
  assert.deepEqual(loaded.observations.map((item) => item.provider), ['claude']);
});

test('scoped clear refuses to strand quarantined quota data', async () => {
  const root = path.join(os.tmpdir(), `ccu-quota-scoped-quarantine-${process.pid}-${Math.random().toString(16).slice(2)}`);
  await mkdir(root, { recursive: true });
  const file = path.join(root, 'quota-observations-v2.json');
  const repository = new QuotaObservationRepository(file, SALT, () => NOW);
  await repository.append([capture()]);
  const quarantine = `${file}.quarantine-100-deadbeef`;
  await writeFile(quarantine, 'quarantined-canary', 'utf8');

  await assert.rejects(
    () => repository.clear({ provider: 'codex' }),
    QuotaObservationScopedClearBlockedError,
  );
  assert.equal((await repository.load()).observations.length, 1);
  await access(quarantine);
});
