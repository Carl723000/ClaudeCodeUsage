import { after, test, type TestContext } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  claudeQuotaCapturesFromUsage,
  createEmptyQuotaObservationStore,
  fingerprintForStableIdentity,
  QUOTA_SCOPE_LABEL_FILE,
  QuotaObservationRepository,
} from '../quotaObservationStore';
import { formatQuotaStatusText } from '../quotaFormat';
import {
  liveQuotaWindows,
  normalizeQuotaWindows,
  visibleQuotaWindows,
} from '../quotaWindows';
import { ClaudeQuotaPaceSource } from '../quotaPaceSource';
import { ResourceOwnershipRegistry } from '../resourceOwnership';
import type { ClaudeApiUsageResponse } from '../types';

type ExtensionModule = typeof import('../extension');

// As in extensionWindowActivity.test.ts, load the actual owner behind a VS Code
// shim; its constructor, activation, timers and watchers never run.
function loadExtensionModule(): ExtensionModule {
  const moduleLoader = require('node:module') as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = moduleLoader._load;
  const vscodeStub: any = new Proxy(function () {}, {
    get: (_target, property) => {
      if (property === 'then' || property === 'workspaceFolders') return undefined;
      return vscodeStub;
    },
    apply: () => vscodeStub,
    construct: () => vscodeStub,
  });
  moduleLoader._load = function (request, parent, isMain): unknown {
    if (request === 'vscode') {
      return vscodeStub;
    }
    return Reflect.apply(originalLoad, this, [request, parent, isMain]);
  };
  try {
    return require('../extension') as ExtensionModule;
  } finally {
    moduleLoader._load = originalLoad;
  }
}

const { ClaudeCodeUsageExtension } = loadExtensionModule();
const { ClaudeApiClient, claudeQuotaIdentitySignal } =
  require('../claudeApiClient') as typeof import('../claudeApiClient');

const SALT = 'quota-window-sharing-fixture-salt';
const HOUR = 60 * 60 * 1000;
const roots: string[] = [];

after(() => {
  for (const root of roots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function temporaryDirectory(prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(directory);
  return directory;
}

/** A synthetic explicit Claude profile whose credentials file holds one login. */
function claudeProfile(refreshToken: string): string {
  const directory = temporaryDirectory('ccu-quota-sharing-profile-');
  fs.writeFileSync(path.join(directory, '.credentials.json'), JSON.stringify({
    claudeAiOauth: {
      accessToken: `fixture-access-${refreshToken}`,
      refreshToken,
      expiresAt: Date.now() + 30 * 24 * HOUR,
    },
  }));
  return directory;
}

/** The observation file every window of one VS Code profile shares. */
function sharedStoreFile(): string {
  return path.join(
    temporaryDirectory('ccu-quota-sharing-storage-'),
    'quota-observations-v2.json',
  );
}

function controlledClock(t: TestContext): {
  now: () => number;
  advance: (milliseconds: number) => void;
} {
  const original = Date.now;
  let current = original();
  Date.now = () => current;
  t.after(() => {
    Date.now = original;
  });
  return {
    now: () => current,
    advance: (milliseconds) => {
      current += milliseconds;
    },
  };
}

function usage(
  resetBase: number,
  session: number,
  weekly: number,
  scoped?: number,
): ClaudeApiUsageResponse {
  const iso = (offset: number): string => new Date(resetBase + offset).toISOString();
  return {
    limits: [
      { kind: 'session', group: 'session', percent: session, resets_at: iso(3 * HOUR), scope: null, is_active: false },
      { kind: 'weekly_all', group: 'weekly', percent: weekly, resets_at: iso(72 * HOUR), scope: null, is_active: true },
      ...(scoped === undefined ? [] : [{
        kind: 'weekly_scoped',
        group: 'weekly',
        percent: scoped,
        resets_at: iso(72 * HOUR),
        scope: { model: { display_name: 'Fable' } },
        is_active: false,
      }]),
    ],
  };
}

/** What the status bar would print for a quota value (StatusBarManager.updateQuota). */
function barText(value: ClaudeApiUsageResponse | null): string {
  return formatQuotaStatusText(
    visibleQuotaWindows(liveQuotaWindows(normalizeQuotaWindows(value))),
    { showReset: false, fiveHourOnly: false, showScopedWeekly: true },
  );
}

interface FakeUsageApi {
  status: number;
  payload: ClaudeApiUsageResponse | null;
  requests: number;
  credentialReads: number;
}

/** One Extension Host's quota path against shared profile storage. Only the
 * usage endpoint is faked; credentials, observation store and lease are real. */
function editorWindow(storeFile: string, profile: string): {
  extension: any;
  api: FakeUsageApi;
  logs: string[];
  refresh: () => Promise<ClaudeApiUsageResponse | null>;
} {
  const api: FakeUsageApi = { status: 429, payload: null, requests: 0, credentialReads: 0 };
  const logs: string[] = [];
  const client = new ClaudeApiClient(null, profile, SALT) as any;
  client.callUsageApi = async () => {
    api.requests += 1;
    return { status: api.status, body: JSON.stringify(api.payload ?? {}) };
  };
  const loadCredentials = client.loadCredentials.bind(client);
  client.loadCredentials = async () => {
    api.credentialReads += 1;
    return loadCredentials();
  };
  const extension = Object.create(ClaudeCodeUsageExtension.prototype) as any;
  Object.assign(extension, {
    disposed: false,
    apiClient: client,
    claudeProfileGeneration: 0,
    quotaFingerprintSalt: SALT,
    quotaObservationRepository: new QuotaObservationRepository(storeFile, SALT, () => Date.now()),
    quotaObservationStore: createEmptyQuotaObservationStore(),
    claudeWeeklyQuotaHistory: [],
    claudeQuotaPaceSource: new ClaudeQuotaPaceSource(),
    resourceOwnership: new ResourceOwnershipRegistry(),
    activeQuotaNetworks: new Map(),
    codexView: null,
    cache: {
      usageLimits: null,
      usageLimitsLastUpdate: new Date(0),
      usageLimitsBackoffUntil: new Date(0),
      usageLimitsFailStreak: 0,
    },
    settings: {
      get: (key: string) =>
        key === 'showWeeklyQuotaPace' || key === 'usageLimitTracking' ? true : undefined,
    },
    outputChannel: { appendLine: (line: string) => logs.push(line) },
    webviewProvider: { updateWeeklyQuotaHistory: () => undefined },
    isActive: () => false,
  });
  return {
    extension,
    api,
    logs,
    refresh: () => extension.maybeFetchUsageLimits({ usageLimitTracking: true }),
  };
}

test('a cold window shows a fresh same-account success from another window without a request', async (t) => {
  const clock = controlledClock(t);
  const storeFile = sharedStoreFile();
  const profile = claudeProfile('fixture-refresh-a');
  const first = editorWindow(storeFile, profile);
  const second = editorWindow(storeFile, profile);
  first.api.status = 200;
  first.api.payload = usage(clock.now(), 37, 12);
  assert.ok(await first.refresh());
  const observedAt = first.extension.cache.usageLimitsLastUpdate.getTime();

  clock.advance(8_000);
  const shown = await second.refresh();

  assert.equal(barText(shown), '5h 37% · wk 12%');
  assert.equal(second.api.requests, 0, 'the cold window sent no usage request');
  assert.equal(
    second.extension.cache.usageLimitsLastUpdate.getTime(),
    observedAt,
    'the shared value keeps its original observation time',
  );
  assert.deepEqual(
    [first.api.credentialReads, second.api.credentialReads],
    [1, 1],
    'a cycle reads credentials once, whether the window fetches or shows a shared value',
  );
  assert.equal(second.logs.length, 1);
  assert.doesNotMatch(second.logs[0], /fixture|ccu-quota-sharing/);
});

test('a success older than the quota TTL is not shown as current', async (t) => {
  const clock = controlledClock(t);
  const storeFile = sharedStoreFile();
  const profile = claudeProfile('fixture-refresh-a');
  const first = editorWindow(storeFile, profile);
  first.api.status = 200;
  first.api.payload = usage(clock.now(), 37, 12);
  assert.ok(await first.refresh());

  clock.advance(119_000);
  const inside = editorWindow(storeFile, profile);
  assert.equal(barText(await inside.refresh()), '5h 37% · wk 12%', 'still inside the idle TTL');

  clock.advance(2_000);
  const late = editorWindow(storeFile, profile);
  assert.equal(await late.refresh(), null);
  assert.equal(late.api.requests, 1, 'the late window asks for its own value instead');
});

test('a success whose window has already reset is not shown as current', async (t) => {
  const clock = controlledClock(t);
  const storeFile = sharedStoreFile();
  const profile = claudeProfile('fixture-refresh-a');
  const first = editorWindow(storeFile, profile);
  const payload = usage(clock.now(), 90, 12);
  payload.limits![0].resets_at = new Date(clock.now() + 10_000).toISOString();
  first.api.status = 200;
  first.api.payload = payload;
  assert.ok(await first.refresh());

  clock.advance(5_000);
  const beforeReset = editorWindow(storeFile, profile);
  assert.equal(barText(await beforeReset.refresh()), '5h 90% · wk 12%');

  clock.advance(10_000);
  const afterReset = editorWindow(storeFile, profile);
  assert.equal(await afterReset.refresh(), null);
  assert.equal(afterReset.api.requests, 1);
});

test("another account's success is never shown", async (t) => {
  const clock = controlledClock(t);
  const storeFile = sharedStoreFile();
  const first = editorWindow(storeFile, claudeProfile('fixture-refresh-a'));
  first.api.status = 200;
  first.api.payload = usage(clock.now(), 37, 12);
  assert.ok(await first.refresh());
  clock.advance(5_000);

  const other = editorWindow(storeFile, claudeProfile('fixture-refresh-b'));
  assert.equal(await other.refresh(), null);
  assert.equal(other.api.requests, 1);

  const sameLogin = editorWindow(storeFile, claudeProfile('fixture-refresh-a'));
  assert.equal(barText(await sameLogin.refresh()), '5h 37% · wk 12%');
  assert.equal(sameLogin.api.requests, 0);
});

test('only verified request observations are shared, never profile-continuity history', async (t) => {
  const clock = controlledClock(t);
  const storeFile = sharedStoreFile();
  const profile = claudeProfile('fixture-refresh-a');
  const repository = new QuotaObservationRepository(storeFile, SALT, () => Date.now());
  // The same identity signal under the weaker attribution yields the same
  // account fingerprint, so only the attribution itself can exclude it.
  const signal = claudeQuotaIdentitySignal(SALT, 'fixture-refresh-a');
  const resetBase = clock.now();
  await repository.append(claudeQuotaCapturesFromUsage(
    usage(resetBase, 37, 12), signal, 'profile-continuity', clock.now(),
  ));
  clock.advance(5_000);

  const cold = editorWindow(storeFile, profile);
  assert.equal(await cold.refresh(), null);
  assert.equal(cold.api.requests, 1);

  await repository.append(claudeQuotaCapturesFromUsage(
    usage(resetBase, 38, 12), signal, 'verified-local-signal', clock.now(),
  ));
  clock.advance(1_000);
  const next = editorWindow(storeFile, profile);
  assert.equal(barText(await next.refresh()), '5h 38% · wk 12%');
  assert.equal(next.api.requests, 0);
});

test("showing another window's success clears this window's failure backoff", async (t) => {
  const clock = controlledClock(t);
  const storeFile = sharedStoreFile();
  const profile = claudeProfile('fixture-refresh-a');
  const cold = editorWindow(storeFile, profile);
  cold.extension.cache.usageLimitsFailStreak = 4;
  cold.extension.cache.usageLimitsBackoffUntil = new Date(clock.now() + 8 * 60_000);
  assert.equal(await cold.refresh(), null, 'nothing to show while backing off');
  assert.equal(cold.api.requests, 0);

  const first = editorWindow(storeFile, profile);
  first.api.status = 200;
  first.api.payload = usage(clock.now(), 37, 12);
  assert.ok(await first.refresh());
  const observedAt = first.extension.cache.usageLimitsLastUpdate.getTime();
  clock.advance(5_000);

  assert.equal(barText(await cold.refresh()), '5h 37% · wk 12%');
  assert.equal(cold.api.requests, 0);
  assert.equal(cold.extension.cache.usageLimitsFailStreak, 0);
  assert.equal(
    cold.extension.cache.usageLimitsBackoffUntil.getTime(),
    observedAt + 30_000,
    'the usual post-success floor, counted from the original observation',
  );
});

test('a backing-off window parses the shared store again only after it changes', async (t) => {
  const clock = controlledClock(t);
  const storeFile = sharedStoreFile();
  const profile = claudeProfile('fixture-refresh-a');
  const first = editorWindow(storeFile, profile);
  first.api.status = 200;
  first.api.payload = usage(clock.now(), 37, 12);
  assert.ok(await first.refresh());
  clock.advance(121_000);

  const promises = require('node:fs/promises') as { readFile: (...args: unknown[]) => unknown };
  const readFile = promises.readFile;
  let storeReads = 0;
  promises.readFile = (...args: unknown[]) => {
    if (args[0] === storeFile) storeReads += 1;
    return readFile(...args);
  };
  t.after(() => {
    promises.readFile = readFile;
  });

  const cold = editorWindow(storeFile, profile);
  cold.extension.cache.usageLimitsFailStreak = 4;
  cold.extension.cache.usageLimitsBackoffUntil = new Date(clock.now() + 8 * 60_000);
  for (let n = 0; n < 3; n++) assert.equal(await cold.refresh(), null);
  assert.equal(storeReads, 1, 'an unchanged store is parsed once, not on every refresh');
  assert.equal(cold.api.requests, 0);

  first.api.payload = usage(clock.now(), 38, 12);
  assert.ok(await first.refresh());
  clock.advance(1_000);
  storeReads = 0;
  assert.equal(barText(await cold.refresh()), '5h 38% · wk 12%');
  assert.equal(storeReads, 1, "another window's write is picked up with one re-read");
});

test("another window's success never feeds this window's weekly pace forecast", async (t) => {
  const clock = controlledClock(t);
  const storeFile = sharedStoreFile();
  const profile = claudeProfile('fixture-refresh-a');
  const resetBase = clock.now();
  const second = editorWindow(storeFile, profile);
  second.api.status = 200;
  second.api.payload = usage(resetBase, 30, 10);
  assert.ok(await second.refresh());
  assert.ok(second.extension.getClaudeQuotaPaceSnapshot(), 'its own success is pace input');

  second.api.status = 429;
  clock.advance(10 * 60_000);
  const first = editorWindow(storeFile, profile);
  first.api.status = 200;
  first.api.payload = usage(resetBase, 37, 12);
  assert.ok(await first.refresh());
  clock.advance(5_000);

  assert.equal(barText(await second.refresh()), '5h 37% · wk 12%');
  assert.equal(second.api.requests, 1, 'only its own earlier request');
  assert.equal(second.extension.getClaudeQuotaPaceSnapshot(), null);
});

test('scoped caps keep their names in every window once any window has seen them', async (t) => {
  const clock = controlledClock(t);
  const storeFile = sharedStoreFile();
  const profile = claudeProfile('fixture-refresh-a');
  const resetBase = clock.now();
  const warm = editorWindow(storeFile, profile);
  warm.api.status = 200;
  warm.api.payload = usage(resetBase, 20, 8, 15);
  assert.ok(await warm.refresh());
  warm.api.status = 429;

  clock.advance(10 * 60_000);
  const first = editorWindow(storeFile, profile);
  first.api.status = 200;
  first.api.payload = usage(resetBase, 37, 12, 16);
  assert.ok(await first.refresh());
  clock.advance(5_000);

  assert.equal(barText(await warm.refresh()), '5h 37% · wk 12% (fable 16%)');
  const cold = editorWindow(storeFile, profile);
  assert.equal(barText(await cold.refresh()), '5h 37% · wk 12% (fable 16%)');
  assert.equal(warm.api.requests + cold.api.requests, 1, "only the warm window's own earlier request");
});

test('a shared scope name is shown only when it reproduces the stored window hash', async (t) => {
  const clock = controlledClock(t);
  const storeFile = sharedStoreFile();
  const profile = claudeProfile('fixture-refresh-a');
  const repository = new QuotaObservationRepository(storeFile, SALT, () => Date.now());
  const signal = claudeQuotaIdentitySignal(SALT, 'fixture-refresh-a');
  await repository.append(claudeQuotaCapturesFromUsage(
    usage(clock.now(), 37, 12, 16), signal, 'verified-local-signal', clock.now(),
  ));
  await repository.rememberScopeLabels(['Opus']);
  clock.advance(5_000);

  const unmatched = editorWindow(storeFile, profile);
  assert.equal(barText(await unmatched.refresh()), '5h 37% · wk 12% (wk* 16%)');

  await repository.rememberScopeLabels(['Fable']);
  const matched = editorWindow(storeFile, profile);
  assert.equal(barText(await matched.refresh()), '5h 37% · wk 12% (fable 16%)');
});

test('shared scope names stay bounded and valid, and an unknown schema is left alone', async () => {
  const storeFile = sharedStoreFile();
  const labelFile = path.join(path.dirname(storeFile), QUOTA_SCOPE_LABEL_FILE);
  const repository = new QuotaObservationRepository(storeFile, SALT);
  const names = Array.from({ length: 20 }, (_, index) => `Scope ${index}`);
  await repository.rememberScopeLabels(names.slice(0, 10));
  await repository.rememberScopeLabels(['', ' ', 'x'.repeat(257), ...names.slice(10)]);

  const labels = await repository.loadScopeLabels();
  assert.equal(labels.length, 16);
  assert.deepEqual(labels.slice(0, 10), names.slice(10), 'newest names first');
  assert.deepEqual(labels.slice(10), names.slice(0, 6), 'the oldest names drop out');
  assert.equal(labels.some((label) => label.trim() === '' || label.length > 256), false);
  assert.equal(fs.statSync(labelFile).mode & 0o777, 0o600);

  fs.writeFileSync(labelFile, JSON.stringify({ schemaVersion: 2, labels: ['Future'] }));
  await repository.rememberScopeLabels(['Fable']);
  assert.deepEqual(JSON.parse(fs.readFileSync(labelFile, 'utf8')).labels, ['Future']);
  assert.deepEqual(await repository.loadScopeLabels(), []);
});

test('shared scope names are removed by every quota clear that covers Claude', async () => {
  const storeFile = sharedStoreFile();
  const labelFile = path.join(path.dirname(storeFile), QUOTA_SCOPE_LABEL_FILE);
  const repository = new QuotaObservationRepository(storeFile, SALT);
  await repository.rememberScopeLabels(['Fable']);

  await repository.clear({ provider: 'codex' });
  assert.deepEqual(await repository.loadScopeLabels(), ['Fable'], 'a Codex-only clear keeps them');
  await repository.clear({ provider: 'claude' });
  assert.equal(fs.existsSync(labelFile), false);

  await repository.rememberScopeLabels(['Fable']);
  await repository.clear({
    provider: 'claude',
    accountFingerprint: fingerprintForStableIdentity(SALT, 'claude', 'fixture-signal'),
  });
  assert.equal(fs.existsSync(labelFile), false, 'a Claude account-epoch clear removes them');

  await repository.rememberScopeLabels(['Fable']);
  await repository.clear({});
  assert.equal(fs.existsSync(labelFile), false, 'clearing all quota history removes them');
});

test('a blur during the shared lookup also cancels the request that would follow', async () => {
  const window = editorWindow(sharedStoreFile(), claudeProfile('fixture-refresh-a'));
  window.api.status = 200;
  window.api.payload = usage(Date.now(), 37, 12);
  let releaseLookup!: () => void;
  const lookupHeld = new Promise<void>((resolve) => {
    releaseLookup = resolve;
  });
  const repository = window.extension.quotaObservationRepository;
  const loadIfChanged = repository.loadIfChanged.bind(repository);
  repository.loadIfChanged = async () => {
    await lookupHeld;
    return loadIfChanged();
  };

  const pending = window.refresh();
  assert.equal(
    window.extension.resourceOwnership.snapshotForTests().byKind.network,
    1,
    'the lookup is owned like the request it may replace',
  );
  const blurred = window.extension.cancelQuotaNetworks('window-blur');
  releaseLookup();
  await Promise.all([pending, blurred]);

  assert.equal(window.api.requests, 0);
  assert.equal(window.extension.resourceOwnership.snapshotForTests().byKind.network, 0);
});

test('the shared-quota identity uses the request path credential read and never refreshes a token', async () => {
  const refuse = (what: string) => (): never =>
    assert.fail(`the identity read must not ${what}`);
  const guard = (client: any): void => {
    client.getValidCredentials = refuse('validate or refresh credentials');
    client.refreshAccessToken = refuse('refresh a token');
    client.callUsageApi = refuse('send a request');
  };
  const client = new ClaudeApiClient(null, claudeProfile('fixture-refresh-a'), SALT) as any;
  guard(client);
  let reads = 0;
  const loadCredentials = client.loadCredentials.bind(client);
  client.loadCredentials = async () => {
    reads += 1;
    return loadCredentials();
  };
  assert.equal(
    await client.currentQuotaIdentitySignal(),
    claudeQuotaIdentitySignal(SALT, 'fixture-refresh-a'),
  );
  assert.equal(reads, 1, 'one read through the same loader the request path uses');
  assert.equal(client.getLastQuotaIdentitySignal(), null, 'reading the identity verifies no request');

  const missing = new ClaudeApiClient(
    null,
    temporaryDirectory('ccu-quota-sharing-empty-'),
    SALT,
  ) as any;
  guard(missing);
  assert.equal(await missing.currentQuotaIdentitySignal(), null);

  const tokenless = temporaryDirectory('ccu-quota-sharing-tokenless-');
  fs.writeFileSync(path.join(tokenless, '.credentials.json'), JSON.stringify({
    claudeAiOauth: { accessToken: 'fixture-access-only' },
  }));
  const withoutRefreshToken = new ClaudeApiClient(null, tokenless, SALT) as any;
  guard(withoutRefreshToken);
  assert.equal(await withoutRefreshToken.currentQuotaIdentitySignal(), null);
});

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function enableHistoryClear(extension: any, storeFile: string): void {
  extension.context = {
    globalStorageUri: { fsPath: path.dirname(storeFile) },
    globalState: { keys: () => [], get: () => undefined, update: async () => undefined },
  };
  extension.stopQuotaColdRetry = () => undefined;
}

test('shared adoption switches the selected account history after a missed credentials watcher', async (t) => {
  const clock = controlledClock(t);
  const storeFile = sharedStoreFile();
  const profileA = claudeProfile('fixture-refresh-a');
  const window = editorWindow(storeFile, profileA);
  window.api.status = 200;
  window.api.payload = usage(clock.now(), 20, 8);
  await window.refresh();
  const fingerprintA = window.extension.activeClaudeQuotaFingerprint;
  clock.advance(121_000);
  const profileB = claudeProfile('fixture-refresh-b');
  fs.copyFileSync(path.join(profileB, '.credentials.json'), path.join(profileA, '.credentials.json'));
  const other = editorWindow(storeFile, profileB);
  other.api.status = 200;
  other.api.payload = usage(clock.now(), 40, 16, 12);
  await other.refresh();
  clock.advance(1_000);

  assert.equal(barText(await window.refresh()), '5h 40% · wk 16% (fable 12%)');
  assert.equal(window.api.requests, 1, 'only the earlier request for A');
  assert.equal(window.extension.activeClaudeQuotaFingerprint, other.extension.activeClaudeQuotaFingerprint);
  assert.notEqual(window.extension.activeClaudeQuotaFingerprint, fingerprintA);
  assert.deepEqual(window.extension.claudeWeeklyQuotaHistory.map((item: any) => item.usedPercent), [16]);
  assert.deepEqual(window.extension.quotaObservationStore, await other.extension.quotaObservationRepository.load());
  assert.equal(window.extension.getClaudeQuotaPaceSnapshot(), null);

  enableHistoryClear(window.extension, storeFile);
  await window.extension.executeLocalDataAction('clear-quota-history', {
    provider: 'claude', accountFingerprint: window.extension.activeClaudeQuotaFingerprint,
  });
  assert.deepEqual(window.extension.claudeWeeklyQuotaHistory, []);
  const retained = await other.extension.quotaObservationRepository.load();
  assert.ok(retained.observations.length > 0);
  assert.ok(retained.observations.every((item: any) => item.accountFingerprint === fingerprintA),
    'clearing B preserves the exact A history scope');

  enableAllDerivedClear(window.extension, storeFile);
  assert.equal((await window.extension.clearAllExtensionDerivedData()).ok, true);
  await window.extension.verifyClearAllPostcondition();
  assert.deepEqual(window.extension.quotaObservationStore.observations, []);
  assert.deepEqual(window.extension.claudeWeeklyQuotaHistory, []);
  assert.equal(window.extension.cache.usageLimits, null);
});

for (const scope of [{}, { provider: 'claude' as const }]) {
  test(`a paused host append cannot restore history or labels after ${JSON.stringify(scope)} clear`, async (t) => {
    const clock = controlledClock(t);
    const storeFile = sharedStoreFile();
    const window = editorWindow(storeFile, claudeProfile('fixture-refresh-a'));
    enableHistoryClear(window.extension, storeFile);
    window.api.status = 200;
    window.api.payload = usage(clock.now(), 20, 8, 10);
    const repository = window.extension.quotaObservationRepository as QuotaObservationRepository;
    const appended = deferred();
    const resume = deferred();
    const append = repository.append.bind(repository);
    repository.append = async (...args: Parameters<typeof append>) => {
      const result = await append(...args);
      appended.resolve();
      await resume.promise;
      return result;
    };
    const pending = window.refresh();
    await appended.promise;
    try {
      await window.extension.executeLocalDataAction('clear-quota-history', scope);
    } finally { resume.resolve(); }
    await pending;
    assert.equal(fs.existsSync(path.join(path.dirname(storeFile), QUOTA_SCOPE_LABEL_FILE)), false);
    assert.deepEqual((await repository.load()).observations, []);
    assert.deepEqual(window.extension.quotaObservationStore.observations, []);
    assert.deepEqual(window.extension.claudeWeeklyQuotaHistory, []);
  });
}

test('a clear while a host append waits for its lease retires that write', async (t) => {
  const clock = controlledClock(t);
  const storeFile = sharedStoreFile();
  const window = editorWindow(storeFile, claudeProfile('fixture-refresh-a'));
  enableHistoryClear(window.extension, storeFile);
  window.api.status = 200;
  window.api.payload = usage(clock.now(), 20, 8, 10);
  const leaseModule = require('../providers/codex/codexIndexLease') as typeof import('../providers/codex/codexIndexLease');
  const acquire = leaseModule.acquireCodexIndexLease;
  const waiting = deferred();
  const resume = deferred();
  let held = false;
  leaseModule.acquireCodexIndexLease = async (...args: Parameters<typeof acquire>) => {
    if (args[0] === storeFile && !held) {
      held = true;
      waiting.resolve();
      await resume.promise;
    }
    return acquire(...args);
  };
  t.after(() => { leaseModule.acquireCodexIndexLease = acquire; });
  const pending = window.refresh();
  await waiting.promise;
  // A second repository represents the concurrent clearer, while the actual
  // host clear starts its lifecycle fence before queuing behind the append.
  const clear = window.extension.executeLocalDataAction('clear-quota-history', {});
  const peer = new QuotaObservationRepository(storeFile, SALT);
  await peer.clear({});
  resume.resolve();
  await Promise.all([pending, clear]);
  assert.deepEqual((await peer.load()).observations, []);
  assert.deepEqual(window.extension.quotaObservationStore.observations, []);
  assert.deepEqual(await peer.loadScopeLabels(), []);
});

for (const invalid of ['{broken-json', JSON.stringify({ schemaVersion: 999 })]) {
  test(`snapshot lookup never quarantines an atomic valid replacement after reading ${invalid}`, async (t) => {
    const clock = controlledClock(t);
    const storeFile = sharedStoreFile();
    const window = editorWindow(storeFile, claudeProfile('fixture-refresh-a'));
    window.extension.cache.usageLimitsBackoffUntil = new Date(clock.now() + HOUR);
    fs.writeFileSync(storeFile, invalid);
    const peer = new QuotaObservationRepository(storeFile, SALT);
    // First make a real validated store, then install it atomically at the
    // precise point after the snapshot has read the old invalid inode.
    const validFile = sharedStoreFile();
    await new QuotaObservationRepository(validFile, SALT).append(claudeQuotaCapturesFromUsage(
      usage(clock.now(), 30, 12), claudeQuotaIdentitySignal(SALT, 'fixture-refresh-a'),
      'verified-local-signal', clock.now(),
    ));
    const promises = require('node:fs/promises') as typeof import('node:fs/promises');
    const readFile = promises.readFile;
    let replaced = false;
    promises.readFile = (async (...args: any[]) => {
      const body = await (readFile as any)(...args);
      if (args[0] === storeFile && !replaced) {
        replaced = true;
        fs.renameSync(validFile, storeFile);
      }
      return body;
    }) as typeof promises.readFile;
    t.after(() => { promises.readFile = readFile; });

    assert.equal(await window.refresh(), null);
    assert.equal(fs.existsSync(storeFile), true, 'the newer canonical store survives snapshot validation');
    assert.deepEqual(fs.readdirSync(path.dirname(storeFile)), ['quota-observations-v2.json']);
    assert.equal(barText(await window.refresh()), '5h 30% · wk 12%', 'the next lookup reads the replacement');
    assert.equal((await peer.load()).observations.length, 2);
    assert.equal(window.api.requests, 0);
  });
}

function enableAllDerivedClear(extension: any, storeFile: string): void {
  enableHistoryClear(extension, storeFile);
  extension.initializationWrites = Promise.resolve();
  extension.initializationWriteFailure = null;
  extension.settings.preflightResetAllOwnedData = () => undefined;
  extension.settings.resetAllOwnedData = async () => undefined;
  extension.stopAutoRefresh = () => undefined;
  extension.stopFileWatching = () => undefined;
  extension.stopCredentialsWatching = () => undefined;
  extension.cancelAdviceNetworks = async () => undefined;
  extension.clearCodexDerivedIndex = async () => undefined;
  extension.webviewProvider.clearAchievementGrants = async () => {
    const { AchievementRecordRepository, ACHIEVEMENT_RECORD_FILE } =
      require('../achievementRecordStore') as typeof import('../achievementRecordStore');
    await new AchievementRecordRepository(path.join(path.dirname(storeFile), ACHIEVEMENT_RECORD_FILE)).clear();
  };
  extension.webviewProvider.clearAdviceLocalData = async () => true;
  extension.webviewProvider.clearSharingRuntimeState = () => undefined;
  extension.syncProviderUi = () => undefined;
}

test('Clear All keeps its actual postconditions after a pre-clear host append resumes', async (t) => {
  const clock = controlledClock(t);
  const storeFile = sharedStoreFile();
  const window = editorWindow(storeFile, claudeProfile('fixture-refresh-a'));
  enableAllDerivedClear(window.extension, storeFile);
  window.api.status = 200;
  window.api.payload = usage(clock.now(), 20, 8, 10);
  const repository = window.extension.quotaObservationRepository as QuotaObservationRepository;
  const appended = deferred();
  const resume = deferred();
  const append = repository.append.bind(repository);
  repository.append = async (...args: Parameters<typeof append>) => {
    const result = await append(...args);
    appended.resolve();
    await resume.promise;
    return result;
  };
  const pending = window.refresh();
  await appended.promise;
  try {
    assert.equal((await window.extension.clearAllExtensionDerivedData()).ok, true);
  } finally { resume.resolve(); }
  assert.equal(await pending, null, 'an old request cannot return its cleared cache');
  await window.extension.verifyClearAllPostcondition();
  assert.equal(fs.existsSync(path.join(path.dirname(storeFile), QUOTA_SCOPE_LABEL_FILE)), false);
  assert.deepEqual(window.extension.quotaObservationStore.observations, []);
  assert.deepEqual(window.extension.claudeWeeklyQuotaHistory, []);
  assert.equal(window.extension.cache.usageLimits, null);
  assert.equal(await window.refresh(), null, 'Clear All remains fenced until reload');
});

test('a peer clear between append completion and host continuation cannot resurrect scope labels', async (t) => {
  const clock = controlledClock(t);
  const storeFile = sharedStoreFile();
  const window = editorWindow(storeFile, claudeProfile('fixture-refresh-a'));
  window.api.status = 200;
  window.api.payload = usage(clock.now(), 20, 8, 10);
  const repository = window.extension.quotaObservationRepository as QuotaObservationRepository;
  const append = repository.append.bind(repository);
  repository.append = async (...args: Parameters<typeof append>) => {
    const result = await append(...args);
    await new QuotaObservationRepository(storeFile, SALT).clear({});
    return result;
  };
  await window.refresh();
  assert.equal(fs.existsSync(path.join(path.dirname(storeFile), QUOTA_SCOPE_LABEL_FILE)), false);
  assert.deepEqual((await repository.load()).observations, []);
});

for (const condition of ['window-blur', 'feature-disabled', 'profile-change'] as const) {
  test(`${condition} during an append's leased read retires queued persistence`, async (t) => {
    const clock = controlledClock(t);
    const storeFile = sharedStoreFile();
    const window = editorWindow(storeFile, claudeProfile('fixture-refresh-a'));
    window.api.status = 200;
    window.api.payload = usage(clock.now(), 20, 8, 10);
    const reading = deferred();
    const resume = deferred();
    const promises = require('node:fs/promises') as typeof import('node:fs/promises');
    const readFile = promises.readFile;
    let reads = 0;
    promises.readFile = (async (...args: any[]) => {
      try { return await (readFile as any)(...args); }
      finally {
        // First read is the read-only sharing lookup; second is append under
        // its real acquired lease, before it decides whether to persist.
        if (args[0] === storeFile && ++reads === 2) {
          reading.resolve();
          await resume.promise;
        }
      }
    }) as typeof promises.readFile;
    t.after(() => { promises.readFile = readFile; });
    const pending = window.refresh();
    await reading.promise;
    try { await window.extension.cancelQuotaNetworks(condition); }
    finally { resume.resolve(); }
    await pending;
    assert.equal(fs.existsSync(storeFile), false, 'no observation write outlives its owner');
    assert.equal(fs.existsSync(path.join(path.dirname(storeFile), QUOTA_SCOPE_LABEL_FILE)), false);
    assert.deepEqual(window.extension.quotaObservationStore.observations, []);
    assert.deepEqual(window.extension.claudeWeeklyQuotaHistory, []);
  });
}
