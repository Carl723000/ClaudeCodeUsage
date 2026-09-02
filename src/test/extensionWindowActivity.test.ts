import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ClaudeDataLoader } from '../dataLoader';
import {
  RefreshSingleFlight,
  WindowActivityGate,
} from '../refreshPolicy';
import { createClaudeUsageIndex } from '../claudeIncrementalIndex';
import {
  beginBackgroundWork,
  createBackgroundWorkState,
  pauseBackgroundWork,
  recordBackgroundWorkFailure,
  recordBackgroundWorkProgress,
} from '../backgroundWorkState';
import { ResourceOwnershipRegistry } from '../resourceOwnership';
import { snapshotFixture } from './codexFixtures';
import {
  createEmptyQuotaObservationStore,
  mergeQuotaCaptures,
} from '../quotaObservationStore';

type ExtensionModule = typeof import('../extension');

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

const {
  ClaudeCodeUsageExtension,
  initializeQuotaObservationRuntime,
} = loadExtensionModule();

function bareExtension(): any {
  const extension = Object.create(ClaudeCodeUsageExtension.prototype) as any;
  const quotaSalt = 'extension-window-activity-test-salt';
  extension.resourceOwnership = new ResourceOwnershipRegistry();
  extension.codexWatcherLeases = new Map();
  extension.debounceTimerLeases = new Map();
  extension.activeAdviceNetworks = new Map();
  extension.activeQuotaNetworks = new Map();
  extension.codexProviderRetirements = new Set();
  extension.activeCodexRefreshes = new Set();
  extension.pendingResourceStops = new Set();
  extension.resourceStopFailure = null;
  extension.codexProviderRetirementFailure = null;
  extension.codexBackgroundStateWrite = Promise.resolve();
  extension.configurationGeneration = 0;
  extension.fileWatcherGeneration = 0;
  extension.codexWatcherGeneration = 0;
  extension.credentialsWatcherGeneration = 0;
  extension.disposed = false;
  extension.codexBackgroundState = createBackgroundWorkState({
    measurementVersion: 1,
    reason: 'first-index',
    now: 0,
  });
  extension.codexFirstBackfillActive = false;
  extension.codexWorkerCancellationRequested = false;
  extension.context = {
    globalState: {
      update: async () => undefined,
    },
  };
  extension.outputChannel = { appendLine: () => undefined };
  extension.quotaFingerprintSalt = quotaSalt;
  extension.quotaObservationStore = createEmptyQuotaObservationStore();
  extension.quotaObservationRepository = {
    append: async (captures: any[]) => {
      extension.quotaObservationStore = mergeQuotaCaptures(
        extension.quotaObservationStore,
        captures,
        { salt: quotaSalt, now: Date.now() },
      );
      return extension.quotaObservationStore;
    },
  };
  extension.webviewProvider = {
    updateQuota: () => undefined,
    updateWeeklyQuotaHistory: () => undefined,
  };
  return extension;
}

test('background transition stops every Claude and Codex recurring resource once', () => {
  const extension = bareExtension();
  const calls: string[] = [];
  extension.windowActivity = new WindowActivityGate(true);
  extension.stopAutoRefresh = () => calls.push('timer:stop');
  extension.stopFileWatching = () => calls.push('claude:stop');
  extension.stopCodexWatching = () => calls.push('codex:stop');
  extension.stopCredentialsWatching = () => calls.push('credentials:stop');

  extension.handleWindowFocusChange(false);
  extension.handleWindowFocusChange(false);

  assert.deepEqual(calls, [
    'timer:stop',
    'claude:stop',
    'codex:stop',
    'credentials:stop',
  ]);
});

test('foreground transition resumes both providers and catches up once', () => {
  const extension = bareExtension();
  const calls: string[] = [];
  extension.windowActivity = new WindowActivityGate(false);
  extension.startAutoRefresh = () => calls.push('timer:start');
  extension.startFileWatching = () => {
    calls.push('claude:start');
    return Promise.resolve();
  };
  extension.startCodexWatching = () => calls.push('codex:start');
  extension.startCredentialsWatching = () => calls.push('credentials:start');
  extension.refreshData = (_force: boolean, trigger: string) => {
    calls.push(`refresh:${trigger}`);
    return Promise.resolve();
  };

  extension.handleWindowFocusChange(true);
  extension.handleWindowFocusChange(true);

  assert.deepEqual(calls, [
    'timer:start',
    'claude:start',
    'codex:start',
    'credentials:start',
    'refresh:focus',
  ]);
});

test('blur deadline cooperatively cancels the bounded first Codex backfill', async () => {
  const extension = bareExtension();
  extension.codexRefreshing = true;
  extension.codexFirstBackfillActive = true;
  let cancelCalls = 0;
  extension.codexProvider = { cancelAndWait: async () => { cancelCalls += 1; } };
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let callback: (() => void) | undefined;
  globalThis.setTimeout = ((fn: () => void) => {
    callback = fn;
    return 123 as any;
  }) as typeof setTimeout;
  globalThis.clearTimeout = (() => undefined) as typeof clearTimeout;
  try {
    extension.scheduleFirstBackfillBlurDeadline();
    assert.equal(extension.resourceOwnership.snapshotForTests().byKind.timer, 1);
    callback?.();
    await Promise.resolve();
    assert.equal(cancelCalls, 1);
    await extension.drainResourceStops();
    assert.equal(extension.resourceOwnership.snapshotForTests().activeCount, 0);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test('background window cannot arm a new polling timer', () => {
  const extension = bareExtension();
  extension.windowActivity = new WindowActivityGate(false);
  extension.refreshGen = 0;
  extension.refreshTimer = undefined;
  extension.getConfiguration = () => ({ refreshInterval: 30 });
  extension.refreshData = () => Promise.resolve();

  try {
    extension.startAutoRefresh();
    assert.equal(extension.refreshTimer, undefined);
  } finally {
    extension.stopAutoRefresh();
  }
});

test('background window does not open a credentials watcher', () => {
  const extension = bareExtension();
  const calls: string[] = [];
  extension.windowActivity = new WindowActivityGate(false);
  extension.stopCredentialsWatching = () => calls.push('credentials:stop');
  extension.apiClient = {
    getCredentialsPath: () => {
      calls.push('credentials:path');
      return '/missing-parent/.credentials.json';
    },
  };

  extension.startCredentialsWatching();

  assert.deepEqual(calls, ['credentials:stop']);
});

test('background window does not inspect either provider log tree', async () => {
  const extension = bareExtension();
  const calls: string[] = [];
  const originalFind = ClaudeDataLoader.findClaudeDataDirectory;
  extension.windowActivity = new WindowActivityGate(false);
  extension.stopFileWatching = () => calls.push('claude:stop');
  extension.stopCodexWatching = () => calls.push('codex:stop');
  extension.getConfiguration = () => ({
    fileWatchSeconds: 30,
    dataDirectory: '',
    codexEnabled: true,
    codexFileWatchSeconds: 30,
  });
  extension.codexHome = () => {
    calls.push('codex:lookup');
    return '/missing-codex-home';
  };
  (ClaudeDataLoader as any).findClaudeDataDirectory = async () => {
    calls.push('claude:lookup');
    return null;
  };

  try {
    await extension.startFileWatching();
    extension.startCodexWatching();
    assert.deepEqual(calls, ['claude:stop', 'codex:stop']);
  } finally {
    (ClaudeDataLoader as any).findClaudeDataDirectory = originalFind;
  }
});

test('Codex becomes available in the dashboard before a slow cold index finishes', async () => {
  const extension = bareExtension();
  const states: Array<{
    available: boolean;
    hasData: boolean;
    refreshing: boolean;
    scannedFiles: number | null;
  }> = [];
  let releaseRefresh: ((value: unknown) => void) | undefined;
  extension.getConfiguration = () => ({ codexEnabled: true });
  extension.codexAvailable = false;
  extension.codexHasData = false;
  extension.codexRefreshing = false;
  extension.codexProgress = null;
  extension.codexProgressLastRenderedAt = 0;
  extension.codexView = null;
  extension.codexInsights = {};
  const liveProgress: number[] = [];
  extension.webviewProvider = {
    updateCodexProgress: (progress: { scannedFiles: number }) => {
      liveProgress.push(progress.scannedFiles);
    },
  };
  extension.codexProvider = {
    isAvailable: async () => true,
    loadPersistedSnapshot: async () => null,
    refresh: (_profile: string, onProgress?: (progress: unknown) => void) => new Promise((resolve) => {
      releaseRefresh = resolve;
      onProgress?.({
        scannedFiles: 12,
        totalFiles: 40,
        indexedBytes: 1_024,
        totalBytes: 4_096,
        period: {},
      });
    }),
  };
  extension.syncProviderUi = () => states.push({
    available: extension.codexAvailable,
    hasData: extension.codexHasData,
    refreshing: extension.codexRefreshing,
    scannedFiles: extension.codexProgress?.scannedFiles ?? null,
  });

  const pending = extension.runCodexRefresh('startup');
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(states[0], {
    available: true,
    hasData: false,
    refreshing: true,
    scannedFiles: null,
  });
  assert.ok(states.every((state) => state.available && state.refreshing));
  assert.deepEqual(liveProgress, [12]);

  releaseRefresh?.({ outcome: 'unavailable' });
  await pending;
});

test('a verified Codex checkpoint stays visible while its index refresh continues', async () => {
  const extension = bareExtension();
  const cached = snapshotFixture();
  cached.coverage.complete = false;
  cached.coverage.indexedFiles = Math.max(1, cached.coverage.totalFiles - 1);
  const states: Array<{
    refreshing: boolean;
    processed: number;
  }> = [];
  let releaseRefresh: ((value: unknown) => void) | undefined;
  extension.getConfiguration = () => ({ codexEnabled: true });
  extension.codexAvailable = false;
  extension.codexHasData = false;
  extension.codexRefreshing = false;
  extension.codexProgress = null;
  extension.codexProgressLastRenderedAt = 0;
  extension.codexView = null;
  extension.codexInsights = {};
  extension.webviewProvider = {
    updateCodexProgress: () => undefined,
  };
  extension.codexProvider = {
    isAvailable: async () => true,
    loadPersistedSnapshot: async () => cached,
    refresh: () => new Promise((resolve) => {
      releaseRefresh = resolve;
    }),
  };
  extension.syncProviderUi = () => states.push({
    refreshing: extension.codexRefreshing,
    processed: extension.codexView?.allTime.total.processed ?? 0,
  });

  const pending = extension.runCodexRefresh('startup');
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(releaseRefresh, 'the background worker refresh should still be running');
  assert.ok(
    states.some((state) => state.refreshing && state.processed > 0),
    'the persisted subtotal dashboard should render before the worker resolves',
  );

  releaseRefresh?.({ outcome: 'unavailable' });
  await pending;
});

test('a brand-new cold index adopts its first checkpoint before the worker finishes', async () => {
  const extension = bareExtension();
  const cached = snapshotFixture();
  cached.coverage.complete = false;
  let renders = 0;
  extension.codexView = null;
  extension.codexInsights = {};
  extension.codexRefreshing = true;
  extension.codexProgress = null;
  extension.codexProgressLastRenderedAt = 0;
  extension.codexCheckpointHydration = null;
  extension.codexCheckpointHydrationLastAttemptAt = 0;
  extension.codexProvider = {
    loadPersistedSnapshot: async () => cached,
  };
  extension.webviewProvider = {
    updateCodexProgress: () => undefined,
  };
  extension.syncProviderUi = () => {
    renders += 1;
  };

  extension.onCodexIndexProgress({
    scannedFiles: 1,
    totalFiles: 40,
    indexedBytes: 1_024,
    totalBytes: 4_096,
    period: {},
  });
  await Promise.resolve();
  await Promise.resolve();

  assert.ok(extension.codexView?.allTime.total.processed > 0);
  assert.equal(renders, 1);
});

test('Codex live index progress coalesces dashboard renders', () => {
  const extension = bareExtension();
  const originalNow = Date.now;
  let now = 1_000;
  let renders = 0;
  const reasons: unknown[] = [];
  extension.codexProgress = null;
  extension.codexProgressLastRenderedAt = 0;
  extension.codexBackgroundState = beginBackgroundWork(
    extension.codexBackgroundState,
    { trigger: 'automatic', now, reason: 'first-index' },
  ).state;
  extension.webviewProvider = {
    updateCodexProgress: (rendered: { reason?: unknown }) => {
      renders += 1;
      reasons.push(rendered.reason);
    },
  };
  const progress = (scannedFiles: number) => ({
    scannedFiles,
    totalFiles: 40,
    indexedBytes: scannedFiles * 1_024,
    totalBytes: 40 * 1_024,
    period: {},
  });
  Date.now = () => now;

  try {
    extension.onCodexIndexProgress(progress(1));
    now += 100;
    extension.onCodexIndexProgress(progress(2));
    assert.equal(renders, 1);
    assert.equal(extension.codexProgress.scannedFiles, 2);

    now += 150;
    extension.onCodexIndexProgress(progress(3));
    assert.equal(renders, 2);

    now += 1;
    extension.onCodexIndexProgress(progress(40));
    assert.equal(renders, 2);
    assert.equal(extension.codexProgress.scannedFiles, 40);
    assert.deepEqual(reasons, ['first-index', 'first-index']);
  } finally {
    Date.now = originalNow;
  }
});

test('cooldown, user pause, and completed measurement suppress historical backfill', async () => {
  const originalNow = Date.now;
  Date.now = () => 1_001;
  const snapshot = snapshotFixture();
  snapshot.coverage.complete = false;
  snapshot.coverage.indexedFiles = Math.max(0, snapshot.coverage.totalFiles - 1);
  const progress = {
    completedUnits: 1,
    totalUnits: 2,
    completedBytes: 10,
    totalBytes: 20,
  };
  const seed = createBackgroundWorkState({
    measurementVersion: 1,
    reason: 'history-backfill',
    now: 1_000,
    progress,
  });
  const running = beginBackgroundWork(seed, {
    trigger: 'automatic',
    now: 1_000,
  }).state;
  const states = [
    recordBackgroundWorkFailure(running, { now: 1_000 }),
    pauseBackgroundWork(seed, { now: 1_000 }),
    recordBackgroundWorkProgress(running, {
      now: 1_000,
      complete: true,
      progress,
    }),
  ];
  const allowed: boolean[] = [];

  try {
    for (const state of states) {
      const extension = bareExtension();
      extension.codexBackgroundState = state;
      extension.getConfiguration = () => ({ codexEnabled: true });
      extension.webviewProvider = { updateCodexProgress: () => undefined };
      extension.syncProviderUi = () => undefined;
      extension.codexProvider = {
        isAvailable: async () => true,
        loadPersistedSnapshot: async () => snapshot,
        refresh: async (
          _profile: string,
          _onProgress: unknown,
          allowHistoricalBackfill: boolean,
        ) => {
          allowed.push(allowHistoricalBackfill);
          return {
            outcome: 'partial',
            snapshot,
            diagnostic: {
              bodyReads: 0,
              failedFiles: 0,
              metadataMs: 0,
              parseMs: 0,
              migrationPending: true,
            },
          };
        },
      };

      await extension.runCodexRefresh('poll');
      assert.equal(extension.codexBackgroundState.status, state.status);
    }
  } finally {
    Date.now = originalNow;
  }

  assert.deepEqual(allowed, [false, false, false]);
});

test('a missing persisted index invalidates same-version complete background work', async () => {
  const extension = bareExtension();
  const completeSnapshot = snapshotFixture();
  const seed = createBackgroundWorkState({
    measurementVersion: 1,
    reason: 'history-backfill',
    now: 1,
    progress: {
      completedUnits: 1,
      totalUnits: 1,
      completedBytes: 1,
      totalBytes: 1,
    },
  });
  extension.codexBackgroundState = recordBackgroundWorkProgress(
    beginBackgroundWork(seed, { trigger: 'automatic', now: 1 }).state,
    {
      now: 2,
      complete: true,
      progress: seed.progress,
    },
  );
  extension.getConfiguration = () => ({ codexEnabled: true });
  extension.windowActivity = new WindowActivityGate(true);
  extension.webviewProvider = { updateCodexProgress: () => undefined };
  extension.syncProviderUi = () => undefined;
  let historicalAllowed: boolean | undefined;
  extension.codexProvider = {
    isAvailable: async () => true,
    loadPersistedSnapshot: async () => null,
    refresh: async (
      _profile: string,
      _onProgress: unknown,
      allowHistoricalBackfill: boolean,
    ) => {
      historicalAllowed = allowHistoricalBackfill;
      return {
        outcome: 'success',
        snapshot: completeSnapshot,
        diagnostic: {
          bodyReads: 1,
          failedFiles: 0,
          metadataMs: 1,
          parseMs: 1,
          migrationPending: false,
        },
      };
    },
  };

  await extension.runCodexRefresh('startup');

  assert.equal(historicalAllowed, true);
  assert.equal(extension.codexBackgroundState.status, 'eligible');
});

test('a failed preflight state write never strands in-memory background work as running', async () => {
  const extension = bareExtension();
  const snapshot = snapshotFixture();
  snapshot.coverage.complete = false;
  snapshot.coverage.indexedFiles = Math.max(0, snapshot.coverage.totalFiles - 1);
  let writes = 0;
  extension.context.globalState.update = async () => {
    writes += 1;
    if (writes === 1) throw new Error('persistence unavailable');
  };
  extension.getConfiguration = () => ({ codexEnabled: true });
  extension.windowActivity = new WindowActivityGate(true);
  extension.webviewProvider = { updateCodexProgress: () => undefined };
  extension.syncProviderUi = () => undefined;
  extension.codexProvider = {
    isAvailable: async () => true,
    loadPersistedSnapshot: async () => snapshot,
    refresh: async () => assert.fail('worker must not start before state is durable'),
  };

  await assert.rejects(extension.runCodexRefresh('poll'), /persistence unavailable/);

  assert.equal(extension.codexBackgroundState.status, 'eligible');
  assert.equal(extension.codexBackgroundState.reason, 'resume');
  assert.ok(writes >= 1);
});

test('background state writes are serialized and preserve their captured order', async () => {
  const extension = bareExtension();
  let finishFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => { finishFirst = resolve; });
  const writes: Array<{ status: string; reason: string }> = [];
  extension.context.globalState.update = async (_key: string, value: any) => {
    writes.push({ status: value.status, reason: value.reason });
    if (writes.length === 1) await firstGate;
  };

  const first = extension.saveCodexBackgroundState();
  extension.codexBackgroundState = beginBackgroundWork(
    extension.codexBackgroundState,
    { trigger: 'automatic', now: 1, reason: 'first-index' },
  ).state;
  const second = extension.saveCodexBackgroundState();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(writes, [{ status: 'eligible', reason: 'first-index' }]);

  finishFirst();
  await Promise.all([first, second]);
  assert.deepEqual(writes, [
    { status: 'eligible', reason: 'first-index' },
    { status: 'running', reason: 'first-index' },
  ]);
});

test('a recovered index invalidates complete state and queues historical reconciliation', async () => {
  const extension = bareExtension();
  const pending = snapshotFixture();
  pending.coverage.complete = false;
  pending.coverage.indexedFiles = Math.max(0, pending.coverage.totalFiles - 1);
  const seed = createBackgroundWorkState({
    measurementVersion: 1,
    reason: 'history-backfill',
    now: 1,
    progress: {
      completedUnits: 1,
      totalUnits: 1,
      completedBytes: 1,
      totalBytes: 1,
    },
  });
  extension.codexBackgroundState = recordBackgroundWorkProgress(
    beginBackgroundWork(seed, { trigger: 'automatic', now: 1 }).state,
    { now: 2, complete: true, progress: seed.progress },
  );
  extension.getConfiguration = () => ({ codexEnabled: true });
  extension.windowActivity = new WindowActivityGate(true);
  extension.webviewProvider = { updateCodexProgress: () => undefined };
  extension.syncProviderUi = () => undefined;
  const continuations: string[] = [];
  extension.refreshCodexData = async (trigger: string) => {
    continuations.push(trigger);
  };
  extension.codexProvider = {
    isAvailable: async () => true,
    loadPersistedSnapshot: async () => pending,
    refresh: async () => ({
      outcome: 'partial',
      snapshot: pending,
      diagnostic: {
        bodyReads: 0,
        failedFiles: 0,
        metadataMs: 1,
        parseMs: 1,
        migrationPending: true,
        indexRecovery: { reason: 'invalid-json' },
      },
    }),
  };

  await extension.runCodexRefresh('poll');
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(extension.codexBackgroundState.status, 'eligible');
  assert.deepEqual(continuations, ['poll']);
});

test('successful historical progress queues one immediate continuation without a timer', async () => {
  const extension = bareExtension();
  const before = snapshotFixture();
  const after = structuredClone(before);
  before.coverage.complete = false;
  after.coverage.complete = false;
  before.coverage.indexedFiles = Math.max(0, before.coverage.totalFiles - 2);
  after.coverage.indexedFiles = Math.max(0, after.coverage.totalFiles - 1);
  before.coverage.indexedBytes = Math.max(0, before.coverage.totalBytes - 200);
  after.coverage.indexedBytes = Math.max(0, after.coverage.totalBytes - 100);
  const continuations: string[] = [];
  extension.getConfiguration = () => ({ codexEnabled: true });
  extension.windowActivity = new WindowActivityGate(true);
  extension.webviewProvider = { updateCodexProgress: () => undefined };
  extension.syncProviderUi = () => undefined;
  extension.refreshCodexData = async (trigger: string) => {
    continuations.push(trigger);
  };
  extension.codexProvider = {
    isAvailable: async () => true,
    loadPersistedSnapshot: async () => before,
    refresh: async () => ({
      outcome: 'partial',
      snapshot: after,
      diagnostic: {
        bodyReads: 1,
        failedFiles: 0,
        metadataMs: 1,
        parseMs: 1,
        migrationPending: true,
      },
    }),
  };

  await extension.runCodexRefresh('startup');
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(extension.codexBackgroundState.status, 'eligible');
  assert.deepEqual(continuations, ['startup']);
  assert.equal(extension.resourceOwnership.snapshotForTests().activeCount, 0);
});

test('timer and watcher ownership clear only after their real handles stop', async () => {
  const extension = bareExtension();
  extension.refreshGen = 0;
  extension.watchDebounce = { clear: () => undefined };
  let fired = false;
  let watcherClosed = 0;
  const timer = setTimeout(() => { fired = true; }, 20);
  extension.refreshTimer = timer;
  extension.refreshTimerLease = extension.resourceOwnership.register({
    kind: 'timer',
    capability: 'refresh',
    scope: 'extension',
    creator: 'refresh-coordinator',
    stopConditions: ['window-blur'],
    boundedException: 'none',
  });
  extension.fileWatcher = {
    close: () => { watcherClosed += 1; },
  };
  extension.fileWatcherLease = extension.resourceOwnership.register({
    kind: 'watcher',
    capability: 'refresh',
    scope: 'claude',
    creator: 'extension',
    stopConditions: ['window-blur'],
    boundedException: 'none',
  });

  extension.stopAutoRefresh('window-blur');
  extension.stopFileWatching('window-blur');
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(watcherClosed, 1);
  assert.equal(extension.resourceOwnership.snapshotForTests().activeCount, 0);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(fired, false);
});

test('watch quiet-delay timers are owned and actually cancelled', async () => {
  const extension = bareExtension();
  extension.debounceTimerLeases = new Map();
  const debounce = extension.createOwnedRefreshDebounce('codex');
  let fired = false;

  debounce.push(20, () => { fired = true; });
  assert.equal(extension.resourceOwnership.snapshotForTests().byKind.timer, 1);
  debounce.clear();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(extension.resourceOwnership.snapshotForTests().byKind.timer, 0);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(fired, false);
});

test('backgrounding aborts an active quota network before releasing ownership', async () => {
  const extension = bareExtension();
  let observedSignal: AbortSignal | undefined;
  extension.cache = {
    usageLimits: null,
    usageLimitsLastUpdate: new Date(0),
    usageLimitsBackoffUntil: new Date(0),
    usageLimitsFailStreak: 0,
  };
  extension.isActive = () => false;
  extension.apiClient = {
    fetchUsageLimits: (signal?: AbortSignal) => new Promise<null>((resolve) => {
      observedSignal = signal;
      assert.ok(signal);
      signal.addEventListener('abort', () => resolve(null), { once: true });
    }),
  };

  const pending = extension.maybeFetchUsageLimits({ usageLimitTracking: true });
  await Promise.resolve();
  assert.equal(extension.resourceOwnership.snapshotForTests().byKind.network, 1);

  await extension.cancelQuotaNetworks('window-blur');
  assert.equal(observedSignal?.aborted, true);
  await pending;
  assert.equal(extension.resourceOwnership.snapshotForTests().byKind.network, 0);
  assert.equal(extension.cache.usageLimitsFailStreak, 0);
});

test('network ownership remains active until an aborted request actually settles', async () => {
  const extension = bareExtension();
  let releaseRequest!: () => void;
  let aborted = false;
  const pending = extension.runAdviceNetwork((signal: AbortSignal) =>
    new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        aborted = true;
        releaseRequest = () => reject(new Error('request finally settled'));
      }, { once: true });
    }),
  );
  await Promise.resolve();
  assert.equal(extension.resourceOwnership.snapshotForTests().byKind.network, 1);

  let cancellationSettled = false;
  const cancellation = extension.cancelAdviceNetworks('cancelled').then(() => {
    cancellationSettled = true;
  });
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(aborted, true);
  assert.equal(cancellationSettled, false);
  assert.equal(extension.resourceOwnership.snapshotForTests().byKind.network, 1);

  releaseRequest();
  await assert.rejects(pending, /finally settled/);
  await cancellation;
  assert.equal(extension.resourceOwnership.snapshotForTests().byKind.network, 0);
});

test('quota cold retry timer is owned and cleared on blur', async () => {
  const extension = bareExtension();
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  let cleared = 0;
  const fakeTimer = { fake: true } as unknown as NodeJS.Timeout;
  global.setTimeout = ((_callback: () => void, _ms: number) =>
    fakeTimer) as typeof setTimeout;
  global.clearTimeout = ((handle: NodeJS.Timeout) => {
    assert.equal(handle, fakeTimer);
    cleared += 1;
  }) as typeof clearTimeout;
  extension.windowActivity = new WindowActivityGate(true);
  extension.getConfiguration = () => ({ usageLimitTracking: true });
  extension.maybeFetchUsageLimits = async () => null;

  try {
    extension.scheduleQuotaColdRetry();
    assert.equal(extension.resourceOwnership.snapshotForTests().byKind.timer, 1);
    extension.stopQuotaColdRetry('window-blur');
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(cleared, 1);
    assert.equal(extension.resourceOwnership.snapshotForTests().byKind.timer, 0);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

test('extension disposal releases worker and backfill only after provider termination', async () => {
  const extension = bareExtension();
  let finishProviderDispose!: () => void;
  const providerDisposed = new Promise<void>((resolve) => {
    finishProviderDispose = resolve;
  });
  let providerCancelCalls = 0;
  let hostDisposals = 0;
  extension.stopAutoRefresh = () => undefined;
  extension.stopFileWatching = () => undefined;
  extension.stopCodexWatching = () => undefined;
  extension.stopCredentialsWatching = () => undefined;
  extension.codexProviderRetirements = new Set();
  extension.codexProvider = {
    cancel: () => { providerCancelCalls += 1; },
    dispose: () => providerDisposed,
  };
  extension.statusBar = { dispose: () => { hostDisposals += 1; } };
  extension.webviewProvider = { dispose: () => { hostDisposals += 1; } };
  extension.codexWorkerLease = extension.resourceOwnership.register({
    kind: 'worker',
    capability: 'codex-index',
    scope: 'codex',
    creator: 'codex-index-client',
    stopConditions: ['extension-dispose'],
    boundedException: 'none',
  });
  extension.codexBackfillLease = extension.resourceOwnership.register({
    kind: 'backfill',
    capability: 'codex-history',
    scope: 'codex',
    creator: 'refresh-coordinator',
    stopConditions: ['extension-dispose'],
    boundedException: 'first-codex-history',
  });

  let disposalSettled = false;
  const disposal = extension.dispose().then(() => {
    disposalSettled = true;
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(providerCancelCalls, 1);
  assert.equal(disposalSettled, false);
  assert.equal(extension.resourceOwnership.snapshotForTests().activeCount, 2);
  assert.equal(hostDisposals, 0);

  finishProviderDispose();
  await disposal;
  assert.equal(extension.resourceOwnership.snapshotForTests().activeCount, 0);
  assert.equal(hostDisposals, 2);
});

test('extension disposal keeps worker ownership active when termination fails', async () => {
  const extension = bareExtension();
  let hostDisposals = 0;
  extension.stopAutoRefresh = () => undefined;
  extension.stopFileWatching = () => undefined;
  extension.stopCodexWatching = () => undefined;
  extension.stopCredentialsWatching = () => undefined;
  extension.codexProvider = {
    cancel: () => undefined,
    dispose: async () => { throw new Error('provider terminate failed'); },
  };
  extension.statusBar = { dispose: () => { hostDisposals += 1; } };
  extension.webviewProvider = { dispose: () => { hostDisposals += 1; } };
  extension.codexWorkerLease = extension.resourceOwnership.register({
    kind: 'worker',
    capability: 'codex-index',
    scope: 'codex',
    creator: 'codex-index-client',
    stopConditions: ['extension-dispose'],
    boundedException: 'none',
  });
  extension.codexBackfillLease = extension.resourceOwnership.register({
    kind: 'backfill',
    capability: 'codex-history',
    scope: 'codex',
    creator: 'refresh-coordinator',
    stopConditions: ['extension-dispose'],
    boundedException: 'first-codex-history',
  });

  await assert.rejects(extension.dispose(), /provider terminate failed/);

  assert.equal(extension.resourceOwnership.snapshotForTests().activeCount, 2);
  assert.equal(hostDisposals, 2);
});

test('a refresh termination failure retains its worker and backfill leases for disposal', async () => {
  const extension = bareExtension();
  const snapshot = snapshotFixture();
  snapshot.coverage.complete = false;
  snapshot.coverage.indexedFiles = Math.max(0, snapshot.coverage.totalFiles - 1);
  extension.getConfiguration = () => ({ codexEnabled: true });
  extension.windowActivity = new WindowActivityGate(true);
  extension.webviewProvider = { updateCodexProgress: () => undefined };
  extension.syncProviderUi = () => undefined;
  extension.codexProvider = {
    isAvailable: async () => true,
    loadPersistedSnapshot: async () => snapshot,
    refresh: async () => { throw new Error('worker could not terminate'); },
  };

  await assert.rejects(extension.runCodexRefresh('poll'), /could not terminate/);

  assert.equal(extension.resourceOwnership.snapshotForTests().byKind.worker, 1);
  assert.equal(extension.resourceOwnership.snapshotForTests().byKind.backfill, 1);
  assert.equal(extension.codexWorkerLease?.active, true);
  assert.equal(extension.codexBackfillLease?.active, true);
});

test('disposal drains every resource kind and stale callbacks cannot recreate work', async () => {
  const extension = bareExtension();
  let releaseNetwork!: () => void;
  let releaseProvider!: () => void;
  let releaseStaleCallbacks!: () => void;
  let watcherClosed = 0;
  let providerCancelled = 0;
  let hostDisposals = 0;
  const providerDisposal = new Promise<void>((resolve) => {
    releaseProvider = resolve;
  });
  const staleCallbacks = new Promise<void>((resolve) => {
    releaseStaleCallbacks = resolve;
  });

  extension.windowActivity = new WindowActivityGate(true);
  extension.refreshGen = 0;
  extension.refreshTimer = setTimeout(() => assert.fail('disposed timer fired'), 60_000);
  extension.refreshTimerLease = extension.resourceOwnership.register({
    kind: 'timer',
    capability: 'refresh',
    scope: 'extension',
    creator: 'refresh-coordinator',
    stopConditions: ['extension-dispose'],
    boundedException: 'none',
  });
  extension.watchDebounce = { clear: () => undefined };
  extension.codexWatchDebounce = { clear: () => undefined };
  extension.fileWatcher = { close: () => { watcherClosed += 1; } };
  extension.fileWatcherLease = extension.resourceOwnership.register({
    kind: 'watcher',
    capability: 'refresh',
    scope: 'claude',
    creator: 'extension',
    stopConditions: ['extension-dispose'],
    boundedException: 'none',
  });
  extension.codexWatchers = [];
  extension.codexWorkerLease = extension.resourceOwnership.register({
    kind: 'worker',
    capability: 'codex-index',
    scope: 'codex',
    creator: 'codex-index-client',
    stopConditions: ['extension-dispose'],
    boundedException: 'none',
  });
  extension.codexBackfillLease = extension.resourceOwnership.register({
    kind: 'backfill',
    capability: 'codex-history',
    scope: 'codex',
    creator: 'refresh-coordinator',
    stopConditions: ['extension-dispose'],
    boundedException: 'first-codex-history',
  });
  extension.codexProvider = {
    cancel: () => { providerCancelled += 1; },
    dispose: () => providerDisposal,
  };
  extension.statusBar = { dispose: () => { hostDisposals += 1; } };
  extension.webviewProvider = { dispose: () => { hostDisposals += 1; } };
  extension.stopQuotaColdRetry = ClaudeCodeUsageExtension.prototype['stopQuotaColdRetry'];
  extension.stopAutoRefresh = ClaudeCodeUsageExtension.prototype['stopAutoRefresh'];
  extension.stopFileWatching = ClaudeCodeUsageExtension.prototype['stopFileWatching'];
  extension.stopCodexWatching = ClaudeCodeUsageExtension.prototype['stopCodexWatching'];
  extension.stopCredentialsWatching = () => undefined;

  const network = extension.runAdviceNetwork((signal: AbortSignal) =>
    new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        releaseNetwork = () => reject(new Error('network closed'));
      }, { once: true });
    }),
  ).catch(() => undefined);
  await Promise.resolve();
  assert.deepEqual(extension.resourceOwnership.snapshotForTests().byKind, {
    timer: 1,
    watcher: 1,
    worker: 1,
    network: 1,
    backfill: 1,
  });

  const stale = staleCallbacks.then(async () => {
    extension.startAutoRefresh();
    await extension.startFileWatching();
    extension.startCodexWatching();
    extension.scheduleQuotaColdRetry();
    await extension.refreshData(false, 'poll');
  });
  const disposal = extension.dispose();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(extension.resourceOwnership.snapshotForTests().byKind.network, 1);

  releaseStaleCallbacks();
  releaseNetwork();
  releaseProvider();
  await Promise.all([network, stale, disposal]);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(watcherClosed, 1);
  assert.equal(providerCancelled, 1);
  assert.equal(hostDisposals, 2);
  assert.equal(extension.resourceOwnership.snapshotForTests().activeCount, 0);
  await assert.rejects(
    extension.runAdviceNetwork(async () => undefined),
    /disposed/i,
  );
  assert.equal(extension.resourceOwnership.snapshotForTests().activeCount, 0);
});

test('Claude watcher is not created when the window loses focus during directory lookup', async () => {
  const extension = bareExtension();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccu-claude-watch-focus-'));
  fs.mkdirSync(path.join(root, 'projects'));
  const originalFind = ClaudeDataLoader.findClaudeDataDirectory;
  const originalWatch = fs.watch;
  let resolveDirectory: ((value: string) => void) | undefined;
  let watchCalls = 0;
  extension.windowActivity = new WindowActivityGate(true);
  extension.watchDebounce = { clear: () => undefined };
  extension.fileWatcher = undefined;
  extension.watchedDir = null;
  extension.getConfiguration = () => ({
    fileWatchSeconds: 30,
    dataDirectory: '',
  });
  (ClaudeDataLoader as any).findClaudeDataDirectory = () => new Promise<string>((resolve) => {
    resolveDirectory = resolve;
  });
  (fs as any).watch = () => {
    watchCalls += 1;
    return { close: () => undefined };
  };

  try {
    const pending = extension.startFileWatching();
    extension.windowActivity.update(false);
    resolveDirectory?.(root);
    await pending;
    assert.equal(watchCalls, 0);
    assert.equal(extension.fileWatcher, undefined);
  } finally {
    (ClaudeDataLoader as any).findClaudeDataDirectory = originalFind;
    (fs as any).watch = originalWatch;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Claude watcher is not created after disposal or a stale settings generation', async () => {
  const extension = bareExtension();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccu-claude-watch-dispose-'));
  fs.mkdirSync(path.join(root, 'projects'));
  const originalFind = ClaudeDataLoader.findClaudeDataDirectory;
  const originalWatch = fs.watch;
  let resolveDirectory!: (value: string) => void;
  let watchCalls = 0;
  extension.windowActivity = new WindowActivityGate(true);
  extension.watchDebounce = { clear: () => undefined };
  extension.fileWatcher = undefined;
  extension.watchedDir = null;
  extension.getConfiguration = () => ({
    fileWatchSeconds: 30,
    dataDirectory: '',
  });
  (ClaudeDataLoader as any).findClaudeDataDirectory = () => new Promise<string>((resolve) => {
    resolveDirectory = resolve;
  });
  (fs as any).watch = () => {
    watchCalls += 1;
    return { close: () => undefined };
  };

  try {
    const pending = extension.startFileWatching();
    extension.disposed = true;
    extension.fileWatcherGeneration += 1;
    resolveDirectory(root);
    await pending;
    assert.equal(watchCalls, 0);
    assert.equal(extension.fileWatcher, undefined);
  } finally {
    (ClaudeDataLoader as any).findClaudeDataDirectory = originalFind;
    (fs as any).watch = originalWatch;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Claude recursive watcher forwards nested subagent JSONL writes to a watch refresh', async () => {
  const extension = bareExtension();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccu-claude-watch-subagent-'));
  fs.mkdirSync(path.join(root, 'projects'));
  const originalFind = ClaudeDataLoader.findClaudeDataDirectory;
  const originalWatch = fs.watch;
  let listener: ((eventType: string, filename: string | Buffer | null) => void) | undefined;
  let watcherClosed = 0;
  const refreshes: Array<{ forceReload: boolean; trigger: string }> = [];
  extension.windowActivity = new WindowActivityGate(true);
  extension.watchDebounce = {
    clear: () => undefined,
    push: (_delay: number, callback: () => void) => callback(),
  };
  extension.fileWatcher = undefined;
  extension.fileWatcherLease = undefined;
  extension.watchedDir = null;
  extension.getConfiguration = () => ({
    fileWatchSeconds: 1,
    dataDirectory: '',
  });
  extension.refreshData = async (forceReload: boolean, trigger: string) => {
    refreshes.push({ forceReload, trigger });
  };
  (ClaudeDataLoader as any).findClaudeDataDirectory = async () => root;
  (fs as any).watch = (
    directory: string,
    options: { recursive?: boolean },
    callback: (eventType: string, filename: string | Buffer | null) => void,
  ) => {
    assert.equal(directory, path.join(root, 'projects'));
    assert.equal(options.recursive, true);
    listener = callback;
    return { close: () => { watcherClosed += 1; } };
  };

  try {
    await extension.startFileWatching();
    assert.ok(listener);
    listener('change', path.join('-fixture', 'session-root', 'subagents', 'agent-review.jsonl'));
    await Promise.resolve();
    assert.deepEqual(refreshes, [{ forceReload: false, trigger: 'watch' }]);

    listener('change', path.join('-fixture', 'session-root', 'subagents', 'agent-review.meta.json'));
    await Promise.resolve();
    assert.equal(refreshes.length, 1, 'non-JSONL metadata must not schedule a usage refresh');
  } finally {
    extension.stopFileWatching();
    (ClaudeDataLoader as any).findClaudeDataDirectory = originalFind;
    (fs as any).watch = originalWatch;
    fs.rmSync(root, { recursive: true, force: true });
  }
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(watcherClosed, 1);
});

test('Claude watcher errors close the watcher and fall back to polling', async () => {
  const extension = bareExtension();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccu-claude-watch-error-'));
  fs.mkdirSync(path.join(root, 'projects'));
  const originalFind = ClaudeDataLoader.findClaudeDataDirectory;
  const originalWatch = fs.watch;
  let errorListener: ((error: Error) => void) | undefined;
  let watcherClosed = 0;
  const diagnostics: string[] = [];
  extension.windowActivity = new WindowActivityGate(true);
  extension.watchDebounce = { clear: () => undefined };
  extension.fileWatcher = undefined;
  extension.fileWatcherLease = undefined;
  extension.watchedDir = null;
  extension.outputChannel = { appendLine: (line: string) => diagnostics.push(line) };
  extension.getConfiguration = () => ({
    fileWatchSeconds: 1,
    dataDirectory: '',
  });
  (ClaudeDataLoader as any).findClaudeDataDirectory = async () => root;
  const watcher = {
    close: () => { watcherClosed += 1; },
    on: (event: string, listener: (error: Error) => void) => {
      if (event === 'error') errorListener = listener;
      return watcher;
    },
  };
  (fs as any).watch = () => watcher;

  try {
    await extension.startFileWatching();
    assert.ok(errorListener, 'the watcher must handle asynchronous fs.watch errors');
    const error = Object.assign(new Error('watch resources exhausted'), { code: 'EMFILE' });
    errorListener(error);
    await extension.drainResourceStops();

    assert.equal(extension.fileWatcher, undefined);
    assert.equal(extension.watchedDir, null);
    assert.equal(watcherClosed, 1);
    assert.equal(extension.resourceOwnership.snapshotForTests().activeCount, 0);
    assert.match(diagnostics.join('\n'), /EMFILE/);
    assert.match(diagnostics.join('\n'), /poll/i);
  } finally {
    extension.stopFileWatching();
    (ClaudeDataLoader as any).findClaudeDataDirectory = originalFind;
    (fs as any).watch = originalWatch;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('real Claude filesystem events flow through manifest, index, and dashboard refresh', {
  timeout: 10_000,
}, async (t) => {
  const extension = bareExtension();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccu-claude-watch-e2e-'));
  const project = path.join(root, 'projects', '-fixture');
  const subagents = path.join(project, 'session-root', 'subagents');
  fs.mkdirSync(subagents, { recursive: true });
  const timestamp = new Date().toISOString();
  const usageLine = (id: string, input: number): string => JSON.stringify({
    type: 'assistant',
    timestamp,
    cwd: '/fixture/project',
    gitBranch: 'main',
    requestId: `request-${id}`,
    message: {
      id: `message-${id}`,
      model: 'claude-sonnet-4-5',
      content: [{ type: 'text', text: `answer-${id}` }],
      usage: {
        input_tokens: input,
        output_tokens: 1,
        cache_creation_input_tokens: 2,
        cache_read_input_tokens: 3,
      },
    },
  });
  const initialFile = path.join(project, 'session-root.jsonl');
  const nestedFile = path.join(subagents, 'agent-review.jsonl');
  fs.writeFileSync(initialFile, `${usageLine('root', 10)}\n`, 'utf8');

  extension.windowActivity = new WindowActivityGate(true);
  extension.localDataClearedRequiresReload = false;
  extension.refreshGate = new RefreshSingleFlight();
  extension.watchDebounce = {
    clear: () => undefined,
    push: (_delay: number, callback: () => void) => callback(),
  };
  extension.fileWatcher = undefined;
  extension.fileWatcherLease = undefined;
  extension.watchedDir = null;
  extension.quotaColdRetryDone = true;
  extension.cache = {
    records: [],
    contentAnalysis: null,
    claudeIndex: createClaudeUsageIndex(),
    manifest: null,
    lastUpdate: new Date(0),
    dataDirectory: null,
    usageLimits: null,
    usageLimitsLastUpdate: new Date(0),
    usageLimitsBackoffUntil: new Date(0),
    usageLimitsFailStreak: 0,
  };
  extension.getConfiguration = () => ({
    dataDirectory: root,
    fileWatchSeconds: 1,
    dashboardAutoRefresh: true,
    enableContentAnalysis: false,
    advicePromptWindowDays: 30,
    projectGroupingMode: 'git',
    contextWindowOverride: 0,
  });
  extension.refreshCodexData = () => undefined;
  extension.maybeFetchUsageLimits = async () => null;
  extension.syncProviderUi = () => undefined;
  const diagnostics: string[] = [];
  extension.outputChannel = { appendLine: (line: string) => diagnostics.push(line) };
  extension.statusBar = {
    setLoading: () => undefined,
    updateQuota: () => undefined,
    updateUsageData: () => undefined,
    updateContext: () => undefined,
  };

  let resolveNestedRefresh!: () => void;
  const nestedRefresh = new Promise<void>((resolve) => {
    resolveNestedRefresh = resolve;
  });
  const todayInputs: number[] = [];
  const allTimeInputs: number[] = [];
  extension.webviewProvider = {
    setLoading: () => undefined,
    updateQuota: () => undefined,
    updateData: (
      _session: unknown,
      today: { totalInputTokens?: number } | null,
      _last30Days: unknown,
      allTime: { totalInputTokens?: number } | null,
      _dailyForLast30Days: unknown,
      _monthlyForAllTime: unknown,
      _hourlyForToday: unknown,
      error?: string,
    ) => {
      const input = today?.totalInputTokens ?? 0;
      todayInputs.push(input);
      allTimeInputs.push(allTime?.totalInputTokens ?? 0);
      if (error) diagnostics.push(error);
      if (input === 30) resolveNestedRefresh();
    },
  };

  try {
    await extension.refreshData(true, 'manual');
    assert.equal(
      todayInputs[todayInputs.length - 1],
      10,
      `allTime=${allTimeInputs[allTimeInputs.length - 1]} records=${extension.cache.records.length} diagnostics=${diagnostics.join(' | ')}`,
    );

    await extension.startFileWatching();
    if (!extension.fileWatcher) {
      t.skip('recursive fs.watch is not supported on this platform');
      return;
    }
    const activeWatcher = extension.fileWatcher as fs.FSWatcher;

    const outcomePromise = new Promise<'refreshed' | 'watch-error'>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('timed out waiting for nested Claude refresh'));
      }, 5_000);
      nestedRefresh.then(() => {
        clearTimeout(timeout);
        resolve('refreshed');
      });
      activeWatcher.once('error', () => {
        clearTimeout(timeout);
        resolve('watch-error');
      });
    });
    fs.writeFileSync(nestedFile, `${usageLine('subagent', 20)}\n`, 'utf8');
    const outcome = await outcomePromise;
    if (outcome === 'watch-error') {
      t.skip('the test host cannot allocate a recursive fs.watch handle');
      return;
    }

    assert.equal(todayInputs[todayInputs.length - 1], 30);
    assert.equal(extension.cache.records.length, 2);
    assert.equal(extension.cache.manifest?.entries.size, 2);
  } finally {
    extension.stopFileWatching();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rapid settings changes wait for every provider retirement and only latest generation restarts', async () => {
  const extension = bareExtension();
  let finishFirst!: () => void;
  let finishSecond!: () => void;
  const firstDisposal = new Promise<void>((resolve) => { finishFirst = resolve; });
  const secondDisposal = new Promise<void>((resolve) => { finishSecond = resolve; });
  const calls: string[] = [];
  const provider = (name: string, disposal: Promise<void>) => ({
    cancel: () => calls.push(`${name}:cancel`),
    dispose: () => disposal,
  });
  const first = provider('first', firstDisposal);
  const second = provider('second', secondDisposal);
  const third = provider('third', Promise.resolve());
  const replacements = [second, third];
  extension.codexProvider = first;
  extension.windowActivity = new WindowActivityGate(true);
  extension.webviewProvider = {
    invalidatePreparedAiRequests: () => undefined,
  };
  extension.statusBar = {
    setVisibility: () => undefined,
  };
  extension.getConfiguration = () => ({
    language: 'en',
    decimalPlaces: 2,
    tokenDecimalPlaces: 0,
    compactNumbers: true,
    timezone: 'UTC',
    showCost: true,
    showContext: true,
    usageLimitTracking: false,
    statusBarMetric: 'tokens',
    showScopedWeekly: false,
    quotaFiveHourOnly: false,
    showResetInStatusBar: false,
    resetCountdownFormat: 'short',
    dataDirectory: '',
  });
  extension.cancelAdviceNetworks = async () => undefined;
  extension.cancelQuotaNetworks = async () => undefined;
  extension.stopQuotaColdRetry = () => undefined;
  extension.startAutoRefresh = () => undefined;
  extension.stopFileWatching = () => undefined;
  extension.stopCodexWatching = () => undefined;
  extension.stopCredentialsWatching = () => undefined;
  extension.selectClaudeProfile = () => undefined;
  extension.createCodexProvider = () => replacements.shift();
  extension.refreshData = async () => { calls.push('refresh'); };
  extension.startFileWatching = async () => { calls.push('claude:start'); };
  extension.startCodexWatching = () => { calls.push('codex:start'); };
  extension.startCredentialsWatching = () => { calls.push('credentials:start'); };

  extension.onConfigurationChanged();
  extension.onConfigurationChanged();
  finishSecond();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(calls.filter((call) => call === 'refresh'), []);

  finishFirst();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.filter((call) => call === 'refresh'), ['refresh']);
  assert.equal(calls.filter((call) => call === 'claude:start').length, 1);
  assert.equal(calls.filter((call) => call === 'codex:start').length, 1);
  assert.equal(calls.filter((call) => call === 'credentials:start').length, 1);
});

test('credentials change clears quota failure backoff before refreshing', async () => {
  const extension = bareExtension();
  const calls: string[] = [];
  extension.cache = {
    usageLimitsLastUpdate: new Date(123_000),
    usageLimitsFailStreak: 6,
    usageLimitsBackoffUntil: new Date(9_999_999),
  };
  extension.refreshData = (_force: boolean, trigger: string) => {
    calls.push(`refresh:${trigger}`);
    return Promise.resolve();
  };
  extension.webviewProvider = {
    updateWeeklyQuotaHistory: () => undefined,
  };

  extension.handleCredentialsChange();
  await Promise.resolve();

  assert.equal(extension.cache.usageLimitsLastUpdate.getTime(), 0);
  assert.equal(extension.cache.usageLimitsFailStreak, 0);
  assert.equal(extension.cache.usageLimitsBackoffUntil.getTime(), 0);
  assert.deepEqual(calls, ['refresh:credentials']);
});

test('changing Claude profiles replaces the quota client and clears account state', () => {
  const extension = bareExtension();
  const oldProfile = path.join(os.tmpdir(), 'ccu-profile-old');
  const newProfile = path.join(os.tmpdir(), 'ccu-profile-new');
  const quotaUpdates: unknown[] = [];
  const weeklyHistoryUpdates: unknown[] = [];
  extension.outputChannel = null;
  extension.apiClient = {
    getCredentialsPath: () => path.join(oldProfile, '.credentials.json'),
  };
  extension.cache = {
    usageLimits: { five_hour: { utilization: 42, resets_at: null } },
    usageLimitsLastUpdate: new Date(123_000),
    usageLimitsBackoffUntil: new Date(456_000),
    usageLimitsFailStreak: 3,
  };
  extension.quotaColdRetryDone = true;
  extension.statusBar = { updateQuota: (value: unknown) => quotaUpdates.push(value) };
  extension.webviewProvider = {
    updateQuota: (value: unknown) => quotaUpdates.push(value),
    updateWeeklyQuotaHistory: (value: unknown) => weeklyHistoryUpdates.push(value),
  };
  extension.context = { globalState: { get: () => undefined } };
  extension.getConfiguration = () => ({ usageLimitTracking: true });

  extension.selectClaudeProfile(newProfile);

  assert.equal(
    extension.apiClient.getCredentialsPath(),
    path.join(newProfile, '.credentials.json'),
  );
  assert.equal(extension.cache.usageLimits, null);
  assert.equal(extension.cache.usageLimitsLastUpdate.getTime(), 0);
  assert.equal(extension.cache.usageLimitsBackoffUntil.getTime(), 0);
  assert.equal(extension.cache.usageLimitsFailStreak, 0);
  assert.equal(extension.quotaColdRetryDone, false);
  assert.deepEqual(quotaUpdates, [null, null]);
  assert.deepEqual(weeklyHistoryUpdates, [[], []]);
});

test('a quota response from the previous profile is discarded after a switch', async () => {
  const extension = bareExtension();
  let releaseOldRequest: ((value: unknown) => void) | undefined;
  const oldClient = {
    fetchUsageLimits: () => new Promise((resolve) => {
      releaseOldRequest = resolve;
    }),
  };
  extension.apiClient = oldClient;
  extension.claudeProfileGeneration = 0;
  extension.cache = {
    usageLimits: null,
    usageLimitsLastUpdate: new Date(0),
    usageLimitsBackoffUntil: new Date(0),
    usageLimitsFailStreak: 0,
  };
  extension.isActive = () => false;
  extension.context = {
    globalState: {
      update: () => assert.fail('stale quota must not be persisted'),
    },
  };

  const pending = extension.maybeFetchUsageLimits({ usageLimitTracking: true });
  extension.apiClient = { fetchUsageLimits: async () => null };
  extension.claudeProfileGeneration += 1;
  releaseOldRequest?.({ five_hour: { utilization: 77, resets_at: null } });

  assert.equal(await pending, null);
  assert.equal(extension.cache.usageLimits, null);
  assert.equal(extension.cache.usageLimitsLastUpdate.getTime(), 0);
});

test('a same-path credential rotation cannot persist the stale in-flight quota response', async () => {
  const extension = bareExtension();
  let releaseRequest: ((value: unknown) => void) | undefined;
  const client = {
    getCredentialsPath: () => '/private/profile/.credentials.json',
    getLastQuotaIdentitySignal: () => 'stale-continuity-signal',
    fetchUsageLimits: () => new Promise((resolve) => {
      releaseRequest = resolve;
    }),
  };
  extension.apiClient = client;
  extension.claudeProfileGeneration = 0;
  extension.cache = {
    usageLimits: null,
    usageLimitsLastUpdate: new Date(0),
    usageLimitsBackoffUntil: new Date(0),
    usageLimitsFailStreak: 0,
  };
  extension.isActive = () => false;
  extension.refreshData = async () => undefined;

  const pending = extension.maybeFetchUsageLimits({ usageLimitTracking: true });
  extension.handleCredentialsChange();
  releaseRequest?.({
    limits: [{
      kind: 'weekly_all',
      group: 'weekly',
      percent: 75,
      resets_at: '2026-09-07T03:24:00.000Z',
      scope: null,
      is_active: true,
    }],
  });

  assert.equal(await pending, null);
  assert.equal(extension.quotaObservationStore.observations.length, 0);
  assert.equal(extension.cache.usageLimits, null);
});

test('disabled quota tracking neither calls the provider nor records an observation', async () => {
  const extension = bareExtension();
  let fetches = 0;
  extension.apiClient = {
    fetchUsageLimits: async () => {
      fetches += 1;
      return null;
    },
  };

  assert.equal(
    await extension.maybeFetchUsageLimits({ usageLimitTracking: false }),
    null,
  );
  assert.equal(fetches, 0);
  assert.equal(extension.quotaObservationStore.observations.length, 0);
});

test('repeated quota failures use the one-hour backoff cap', async () => {
  const extension = bareExtension();
  const originalNow = Date.now;
  Date.now = () => 1_000_000;
  extension.cache = {
    usageLimits: null,
    usageLimitsLastUpdate: new Date(0),
    usageLimitsBackoffUntil: new Date(0),
    usageLimitsFailStreak: 6,
  };
  extension.apiClient = {
    fetchUsageLimits: async () => null,
  };
  extension.isActive = () => false;

  try {
    const result = await extension.maybeFetchUsageLimits({
      usageLimitTracking: true,
    });
    assert.equal(result, null);
    assert.equal(extension.cache.usageLimitsFailStreak, 7);
    assert.equal(extension.cache.usageLimitsBackoffUntil.getTime(), 4_600_000);
  } finally {
    Date.now = originalNow;
  }
});

test('a successful Claude quota fetch persists sanitized weekly observations per profile', async () => {
  const extension = bareExtension();
  const originalNow = Date.now;
  const now = Date.parse('2026-08-22T08:00:00.000Z');
  Date.now = () => now;
  const writes: Array<{ key: string; value: unknown }> = [];
  const historyUpdates: unknown[] = [];
  extension.apiClient = {
    getCredentialsPath: () => '/private/profile-a/.credentials.json',
    getLastQuotaIdentitySignal: () => 'safe-local-continuity-signal',
    fetchUsageLimits: async () => ({
      limits: [{
        kind: 'weekly_all',
        group: 'weekly',
        percent: 40,
        resets_at: '2026-08-25T08:00:00.000Z',
        scope: null,
        is_active: true,
      }],
    }),
  };
  extension.claudeProfileGeneration = 0;
  extension.claudeWeeklyQuotaHistory = [];
  extension.cache = {
    usageLimits: null,
    usageLimitsLastUpdate: new Date(0),
    usageLimitsBackoffUntil: new Date(0),
    usageLimitsFailStreak: 0,
  };
  extension.isActive = () => false;
  extension.webviewProvider = {
    updateWeeklyQuotaHistory: (value: unknown) => historyUpdates.push(value),
  };
  extension.context = {
    globalState: {
      update: (key: string, value: unknown) => {
        writes.push({ key, value });
        return Promise.resolve();
      },
    },
  };

  try {
    const result = await extension.maybeFetchUsageLimits({ usageLimitTracking: true });
    assert.ok(result);
    assert.equal(
      writes.some((write) => write.key.startsWith('ccu.weeklyQuotaHistory.v1.')),
      false,
    );
    const observations = extension.quotaObservationStore.observations;
    assert.equal(observations.length, 1);
    assert.equal(observations[0].provider, 'claude');
    assert.equal(observations[0].usedFraction, 0.4);
    assert.equal(observations[0].accountAttribution, 'verified-local-signal');
    assert.match(observations[0].accountFingerprint, /^acct_[a-f0-9]{32}$/);
    assert.equal(
      JSON.stringify(extension.quotaObservationStore).includes('/private/profile-a'),
      false,
    );
    assert.equal(
      JSON.stringify(extension.quotaObservationStore).includes('safe-local-continuity-signal'),
      false,
    );
    assert.equal(historyUpdates.length, 1);
  } finally {
    Date.now = originalNow;
  }
});

test('legacy quota migration is atomic, private, idempotent, and independent of tracking state', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ccu-quota-migration-'));
  const observedAt = Date.now() - 60_000;
  const resetAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const state = new Map<string, unknown>([
    ['ccu.usageLimits.legacy-profile', {
      ts: observedAt,
      data: {
        limits: [{
          kind: 'weekly_all',
          group: 'weekly',
          percent: 40,
          resets_at: new Date(resetAt).toISOString(),
          scope: null,
          is_active: true,
        }],
        unsafeCredentialCanary: 'oauth-token-canary',
      },
    }],
    ['ccu.weeklyQuotaHistory.v1.legacy-profile', [{
      provider: 'claude',
      seriesKey: '/private/legacy-profile',
      observedAt,
      resetAt,
      usedPercent: 40,
    }]],
  ]);
  const globalState = {
    keys: () => [...state.keys()],
    get: <T>(key: string): T | undefined => state.get(key) as T | undefined,
    update: async (key: string, value: unknown) => {
      if (value === undefined) state.delete(key);
      else state.set(key, value);
    },
  };
  const context = {
    globalState,
    globalStorageUri: { fsPath: root },
  } as any;
  const settings = {
    get: (key: string) => key === 'dataDirectory'
      ? path.join(root, 'profile-without-credentials')
      : key === 'timezone'
        ? 'UTC'
        : key === 'usageLimitTracking'
          ? false
          : undefined,
  } as any;

  const first = await initializeQuotaObservationRuntime(context, settings);
  assert.equal(first.store.observations.length, 1);
  assert.equal(first.store.observations[0].usedFraction, 0.4);
  assert.equal(first.store.observations[0].captureReason, 'migration');
  assert.ok(first.store.observations[0].flags.includes('account-ambiguous'));
  assert.equal(state.has('ccu.usageLimits.legacy-profile'), false);
  assert.equal(state.has('ccu.weeklyQuotaHistory.v1.legacy-profile'), false);
  assert.equal(state.get('ccu.quota.migratedCodexIndex.v2'), true);

  const file = path.join(root, 'quota-observations-v2.json');
  const persisted = await fs.promises.readFile(file, 'utf8');
  assert.doesNotMatch(persisted, /oauth-token-canary|private\/legacy-profile/);
  const second = await initializeQuotaObservationRuntime(context, settings);
  assert.deepEqual(second.store, first.store);
});

test('a failed P2 migration write preserves every legacy quota source and retry marker', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ccu-quota-migration-failure-'));
  const blockedStorage = path.join(root, 'not-a-directory');
  await fs.promises.writeFile(blockedStorage, 'fixture', 'utf8');
  const observedAt = Date.now() - 60_000;
  const state = new Map<string, unknown>([[
    'ccu.usageLimits.retryable-profile',
    {
      ts: observedAt,
      data: {
        limits: [{
          kind: 'weekly_all',
          group: 'weekly',
          percent: 25,
          resets_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          scope: null,
          is_active: true,
        }],
      },
    },
  ]]);
  const context = {
    globalState: {
      keys: () => [...state.keys()],
      get: <T>(key: string): T | undefined => state.get(key) as T | undefined,
      update: async (key: string, value: unknown) => {
        if (value === undefined) state.delete(key);
        else state.set(key, value);
      },
    },
    globalStorageUri: { fsPath: blockedStorage },
  } as any;
  const settings = {
    get: (key: string) => key === 'timezone' ? 'UTC' : '',
  } as any;

  await assert.rejects(
    initializeQuotaObservationRuntime(context, settings),
    (error: unknown) =>
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'EEXIST' &&
      String((error as NodeJS.ErrnoException).path).endsWith('not-a-directory'),
  );
  assert.equal(state.has('ccu.usageLimits.retryable-profile'), true);
  assert.equal(state.has('ccu.quota.migratedCodexIndex.v2'), false);
});
