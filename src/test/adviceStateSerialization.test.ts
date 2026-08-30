import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import Module = require('node:module');

import {
  ADVICE_LOCAL_STATE_KEY,
  AdviceLocalState,
  AdviceLocalStateStorage,
  createClosedAdviceLocalState,
  snoozeAdviceRecommendation,
} from '../adviceEffectiveness/versionedPersistence';

class ControlledStorage implements AdviceLocalStateStorage {
  public value: AdviceLocalState;
  public readonly pending: Array<{
    value: AdviceLocalState;
    resolve: () => void;
  }> = [];

  constructor(value: AdviceLocalState) {
    this.value = value;
  }

  get<T>(key: string): T | undefined {
    return key === ADVICE_LOCAL_STATE_KEY ? this.value as T : undefined;
  }

  update(key: string, value: unknown): Promise<void> {
    assert.equal(key, ADVICE_LOCAL_STATE_KEY);
    return new Promise((resolve) => {
      this.pending.push({
        value: value as AdviceLocalState,
        resolve: () => {
          this.value = value as AdviceLocalState;
          resolve();
        },
      });
    });
  }

  releaseNext(): void {
    const next = this.pending.shift();
    assert.ok(next, 'expected a pending state write');
    next.resolve();
  }
}

async function nextTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function createProvider(storage: AdviceLocalStateStorage): Promise<any> {
  const originalLoad = (Module as any)._load;
  (Module as any)._load = function(request: string, parent: unknown, isMain: boolean) {
    if (request === 'vscode') {
      return { workspace: { workspaceFolders: [] } };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  let UsageWebviewProvider: typeof import('../webview').UsageWebviewProvider;
  try {
    ({ UsageWebviewProvider } = require('../webview') as typeof import('../webview'));
  } finally {
    (Module as any)._load = originalLoad;
  }
  const provider = new UsageWebviewProvider({ globalState: storage } as any) as any;
  await nextTurn();
  provider.settings = { get: (key: string) => key === 'advice.effectiveness.enabled' };
  provider.adviceLocalStateStatus = 'ready';
  provider.postAdviceMessage = () => undefined;
  return provider;
}

test('clear is serialized after an older consent write and remains the final durable state', async () => {
  const initial = createClosedAdviceLocalState();
  initial.featureMode = 'enabled';
  const storage = new ControlledStorage(initial);
  const provider = await createProvider(storage);
  provider.adviceLocalState = initial;
  provider.adviceEffectivenessStates = {
    claude: {
      provider: 'claude',
      remotePreviewEligible: true,
      aggregate: { windowDays: 30 },
      promptSamples: [],
      contract: { adviceId: 'advice-claude-test', recommendations: [] },
    },
  };
  provider.onAdviceDataCleared = async () => undefined;

  const consent = provider.handleAdviceConsentMessage({
    provider: 'claude',
    aggregateConsent: 'explicit',
    promptSampleConsent: 'not-granted',
  });
  await nextTurn();
  assert.equal(storage.pending.length, 1);

  const clear = provider.handleClearAdviceLocalDataMessage();
  await nextTurn();
  assert.equal(
    storage.pending.length,
    1,
    'clear must share the one state-writer queue instead of racing the consent write',
  );

  storage.releaseNext();
  await nextTurn();
  assert.equal(storage.pending.length, 1, 'clear should begin after consent settles');
  storage.releaseNext();
  await Promise.all([consent, clear]);

  assert.equal(storage.value.featureMode, 'enabled');
  assert.equal(storage.value.aggregateConsent, 'not-granted');
  assert.equal(storage.value.promptSampleConsent, 'not-granted');
  assert.deepEqual(storage.value.feedback, []);
  assert.deepEqual(storage.value.suppression, []);
  assert.deepEqual(storage.value.comparablePairs, []);
  assert.deepEqual(storage.value.comparisonResults, []);
});

test('discarded optimizer request cannot install a stale result after await', async () => {
  const provider = await createProvider({
    get: () => undefined,
    update: async () => undefined,
  });
  provider.settings = {
    get: (key: string) => key === 'advice.optimizer.enabled',
  };
  const snapshotId = 'optimizer-stale-test';
  provider.optimizerConsentGeneration = 7;
  provider.optimizerState = {
    draft: 'old draft',
    resolve: true,
    distil: false,
    aesthetic: false,
  };
  const stored = {
    prepared: {},
    draft: 'old draft',
    sourceRevision: 'optimizer-source',
    consentGeneration: 7,
  };
  provider.preparedOptimizerRequests.set(snapshotId, stored);
  const messages: Array<Record<string, unknown>> = [];
  provider.postAdviceMessage = (message: Record<string, unknown>) => messages.push(message);
  let finish!: (value: unknown) => void;
  provider.onSendOptimizerInvocation = () => new Promise((resolve) => {
    finish = resolve;
  });

  const send = provider.handleSendOptimizerMessage({ snapshotId, draft: 'old draft' });
  await nextTurn();
  provider.discardPreparedOptimizer();
  finish({ ok: true, value: { prompt: 'STALE RESULT', settings: 'stale' } });
  await send;

  assert.equal(provider.optimizerState.prompt, undefined);
  assert.equal(messages.some((message) => message.prompt === 'STALE RESULT'), false);
  const lastMessage = messages[messages.length - 1];
  assert.equal(lastMessage?.command, 'optimizeResult');
  assert.equal(typeof lastMessage?.error, 'string');
});

test('optimizer feedback uses the same retractable local ledger and rendered controls', async () => {
  let durable = createClosedAdviceLocalState();
  const provider = await createProvider({
    get: <T>() => durable as T,
    update: async (_key: string, value: unknown) => {
      durable = value as AdviceLocalState;
    },
  });
  provider.settings = {
    get: (key: string) =>
      key === 'advice.effectiveness.enabled' || key === 'advice.optimizer.enabled',
  };
  provider.adviceLocalState = durable;
  provider.optimizerState = {
    draft: 'host-only draft',
    resolve: false,
    distil: false,
    aesthetic: false,
    prompt: 'Paste-ready result',
    settings: 'Effort: high',
    adviceId: 'advice-optimizer-0123456789abcdef01234567',
  };

  await provider.handleAdviceFeedbackMessage({
    provider: 'optimizer',
    adviceId: provider.optimizerState.adviceId,
    recommendationId: 'recommendation-optimizer-result-v1',
    kind: 'helpful',
  });

  assert.equal(durable.feedback.length, 1);
  assert.equal(durable.feedback[0].rating, 'helpful');
  assert.equal(durable.feedback[0].applied, 'not-applied');
  assert.doesNotMatch(JSON.stringify(durable), /host-only draft|Paste-ready result|Effort: high/);
  const html = provider.renderOptimizerCard();
  assert.equal((html.match(/data-advice-action="feedback"/g) ?? []).length, 3);
  assert.match(html, /data-provider="optimizer"/);
  assert.match(html, /recommendation-optimizer-result-v1/);
});

test('snoozed advice leaves a closed, on-demand resume control instead of the default recommendation summary', async () => {
  let durable = createClosedAdviceLocalState();
  const provider = await createProvider({
    get: <T>() => durable as T,
    update: async (_key: string, value: unknown) => {
      durable = value as AdviceLocalState;
    },
  });
  provider.settings = { get: (key: string) => key === 'advice.effectiveness.enabled' };
  provider.adviceLocalState = durable;
  provider.adviceEffectivenessStates = {
    claude: {
      provider: 'claude',
      remotePreviewEligible: false,
      aggregate: { windowDays: 30 },
      promptSamples: [],
      contract: {
        schemaVersion: 1,
        adviceId: 'advice-claude-snooze-test',
        observations: [{
          id: 'observation-1',
          metric: 'long-session-share',
          value: 0.5,
          unit: 'ratio',
          method: 'measured',
          sourceId: 'source-1',
          summary: 'local',
        }],
        evidence: [{
          id: 'evidence-1',
          observationIds: ['observation-1'],
          strength: 'direct',
          summary: 'local',
          limitations: [],
        }],
        recommendations: [{
          id: 'recommendation-claude-snooze',
          title: 'Boundary',
          evidenceIds: ['evidence-1'],
          explanation: { summary: 'local', proxyMetricObservationIds: [], limitations: [] },
          conditionalActions: [{ when: 'next task', action: 'try', evidenceIds: ['evidence-1'] }],
          successCriteria: [],
        }],
        privacy: {
          dataMode: 'local-only',
          promptSampleConsent: 'not-applicable',
          promptSampleCount: 0,
          feedbackStorage: 'local-only',
        },
        provenance: {
          generatedBy: { kind: 'local-rules' },
          generatedAt: new Date(1_777_000_000_000).toISOString(),
          locale: 'en',
          sources: [{
            id: 'source-1',
            kind: 'claude-local-insight',
            scope: 'overall',
            window: { kind: 'rolling-days', days: 30 },
            confidence: 'high',
            qualityFlags: [],
          }],
        },
      },
    },
  };
  const snoozeNow = Date.now();
  const result = snoozeAdviceRecommendation(durable, {
    adviceId: 'advice-claude-snooze-test',
    recommendationId: 'recommendation-claude-snooze',
    updatedAtEpochMs: snoozeNow,
    snoozedUntilEpochMs: snoozeNow + 86_400_000,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  provider.adviceLocalState = result.value;
  const html = provider.renderAdviceEffectivenessBody('claude');
  assert.doesNotMatch(html, /advice-recommendation-boundary/);
  assert.match(html, /advice-recommendation-snoozed/);
  assert.match(html, /data-snooze-mode="resume"/);
});

test('a failed feedback save returns the validated target identity so only its controls unlock', async () => {
  const durable = createClosedAdviceLocalState();
  const provider = await createProvider({
    get: <T>() => durable as T,
    update: async () => {
      throw new Error('simulated storage failure');
    },
  });
  provider.settings = {
    get: (key: string) => key === 'advice.optimizer.enabled',
  };
  provider.adviceLocalState = durable;
  provider.optimizerState = {
    draft: 'host-only draft',
    resolve: false,
    distil: false,
    aesthetic: false,
    prompt: 'Paste-ready result',
    settings: 'Effort: high',
    adviceId: 'advice-optimizer-0123456789abcdef01234567',
  };
  const messages: Array<Record<string, unknown>> = [];
  provider.postAdviceMessage = (message: Record<string, unknown>) => messages.push(message);

  await provider.handleAdviceFeedbackMessage({
    provider: 'optimizer',
    adviceId: 'advice-optimizer-0123456789abcdef01234567',
    recommendationId: 'recommendation-optimizer-result-v1',
    kind: 'helpful',
  });

  assert.deepEqual(messages[messages.length - 1], {
    command: 'adviceFeedbackResult',
    ok: false,
    provider: 'optimizer',
    adviceId: 'advice-optimizer-0123456789abcdef01234567',
    recommendationId: 'recommendation-optimizer-result-v1',
  });
});

test('optimizer host seam fails closed while its feature is disabled', async () => {
  const provider = await createProvider({
    get: () => undefined,
    update: async () => undefined,
  });
  provider.settings = { get: () => false };
  let prepares = 0;
  let sends = 0;
  provider.onPrepareOptimizerInvocation = async () => {
    prepares += 1;
    return { error: 'must not run' };
  };
  provider.onSendOptimizerInvocation = async () => {
    sends += 1;
    return { ok: false, code: 'transport-error', issues: [] };
  };

  await provider.handlePrepareOptimizerMessage({ draft: 'private draft' });
  provider.preparedOptimizerRequests.set('optimizer-disabled', {
    prepared: {},
    draft: 'private draft',
    sourceRevision: 'disabled',
    consentGeneration: provider.optimizerConsentGeneration,
  });
  await provider.handleSendOptimizerMessage({
    snapshotId: 'optimizer-disabled',
    draft: 'private draft',
  });

  assert.equal(prepares, 0);
  assert.equal(sends, 0);
});

test('successful optimizer send creates an opaque feedback target without deriving it from content', async () => {
  const provider = await createProvider({
    get: () => undefined,
    update: async () => undefined,
  });
  provider.settings = { get: (key: string) => key === 'advice.optimizer.enabled' };
  provider.optimizerConsentGeneration = 3;
  provider.optimizerState = {
    draft: 'SENSITIVE_DRAFT',
    resolve: false,
    distil: false,
    aesthetic: false,
  };
  const snapshotId = 'optimizer-success';
  provider.preparedOptimizerRequests.set(snapshotId, {
    prepared: {},
    draft: 'SENSITIVE_DRAFT',
    sourceRevision: 'optimizer-source',
    consentGeneration: 3,
  });
  provider.onSendOptimizerInvocation = async () => ({
    ok: true,
    value: { prompt: 'SENSITIVE_RESULT', settings: 'SENSITIVE_SETTINGS' },
  });
  const messages: Array<Record<string, unknown>> = [];
  provider.postAdviceMessage = (message: Record<string, unknown>) => messages.push(message);

  await provider.handleSendOptimizerMessage({ snapshotId, draft: 'SENSITIVE_DRAFT' });

  assert.match(provider.optimizerState.adviceId, /^advice-optimizer-[a-f0-9]{24}$/);
  assert.doesNotMatch(provider.optimizerState.adviceId, /SENSITIVE/i);
  const lastMessage = messages[messages.length - 1];
  assert.equal(lastMessage.recommendationId, 'recommendation-optimizer-result-v1');
  assert.equal(lastMessage.adviceId, provider.optimizerState.adviceId);
});
