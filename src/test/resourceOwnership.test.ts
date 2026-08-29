import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  ResourceOwnershipRegistry,
  type ResourceDescriptor,
} from '../resourceOwnership';

const descriptors: ResourceDescriptor[] = [
  {
    kind: 'timer',
    capability: 'refresh',
    scope: 'extension',
    creator: 'extension',
    stopConditions: ['window-blur', 'feature-disabled', 'extension-dispose'],
    boundedException: 'none',
  },
  {
    kind: 'watcher',
    capability: 'codex-index',
    scope: 'codex',
    creator: 'extension',
    stopConditions: ['window-blur', 'feature-disabled', 'settings-change', 'extension-dispose'],
    boundedException: 'none',
  },
  {
    kind: 'worker',
    capability: 'codex-index',
    scope: 'codex',
    creator: 'codex-index-client',
    stopConditions: ['completed', 'cancelled', 'feature-disabled', 'extension-dispose', 'user-pause'],
    boundedException: 'none',
  },
  {
    kind: 'network',
    capability: 'advice-personalization',
    scope: 'advice',
    creator: 'advice-runtime',
    stopConditions: ['settled', 'cancelled', 'feature-disabled', 'extension-dispose'],
    boundedException: 'none',
  },
  {
    kind: 'backfill',
    capability: 'codex-history',
    scope: 'codex',
    creator: 'refresh-coordinator',
    stopConditions: ['completed', 'cancelled', 'feature-disabled', 'extension-dispose', 'user-pause'],
    boundedException: 'first-codex-history',
  },
];

test('registry exposes fixed ownership metadata for every active resource kind', async () => {
  const registry = new ResourceOwnershipRegistry();
  const leases = descriptors.map((descriptor) => registry.register(descriptor));
  const snapshot = registry.snapshotForTests();

  assert.equal(snapshot.activeCount, 5);
  assert.deepEqual(snapshot.byKind, {
    timer: 1,
    watcher: 1,
    worker: 1,
    network: 1,
    backfill: 1,
  });
  assert.deepEqual(snapshot.active, descriptors);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.byKind), true);
  assert.equal(Object.isFrozen(snapshot.active), true);
  assert.equal(Object.isFrozen(snapshot.active[0]), true);
  assert.equal(Object.isFrozen(snapshot.active[0].stopConditions), true);

  let finishWorker!: () => void;
  const workerStopped = leases[2].stop('completed', () => new Promise<void>((resolve) => {
    finishWorker = resolve;
  }));
  await Promise.resolve();
  assert.equal(registry.snapshotForTests().activeCount, 5, 'ownership remains active until terminate settles');
  finishWorker();
  assert.equal(await workerStopped, true);
  assert.equal(registry.snapshotForTests().activeCount, 4);

  await Promise.all([
    leases[0].stop('extension-dispose', () => undefined),
    leases[1].stop('extension-dispose', () => undefined),
    leases[3].stop('settled', () => undefined),
    leases[4].stop('completed', () => undefined),
  ]);
  assert.equal(registry.snapshotForTests().activeCount, 0);
});

test('a lease is idempotent and invokes the actual stopper once', async () => {
  const registry = new ResourceOwnershipRegistry();
  const lease = registry.register(descriptors[2]);
  let stopCalls = 0;
  let finish!: () => void;
  const stopper = (): Promise<void> => {
    stopCalls += 1;
    return new Promise<void>((resolve) => { finish = resolve; });
  };

  const first = lease.stop('completed', stopper);
  const concurrent = lease.stop('completed', stopper);
  await Promise.resolve();
  assert.equal(stopCalls, 1);
  assert.equal(lease.active, true);
  finish();
  assert.equal(await first, true);
  assert.equal(await concurrent, true);
  assert.equal(lease.active, false);
  assert.equal(await lease.stop('completed', stopper), false);
  assert.equal(stopCalls, 1);
});

test('failed destruction keeps ownership active and permits an explicit retry', async () => {
  const registry = new ResourceOwnershipRegistry();
  const lease = registry.register(descriptors[3]);

  await assert.rejects(
    lease.stop('settled', async () => { throw new Error('abort failed'); }),
    /abort failed/,
  );
  assert.equal(lease.active, true);
  assert.equal(registry.snapshotForTests().byKind.network, 1);

  assert.equal(await lease.stop('settled', () => undefined), true);
  assert.equal(lease.active, false);
  assert.equal(registry.snapshotForTests().byKind.network, 0);
});

test('registry rejects free-form, extra, duplicate, and invalid exception metadata', async () => {
  const registry = new ResourceOwnershipRegistry();
  const base = descriptors[0];

  assert.throws(
    () => registry.register({ ...base, capability: 'read-private-log' } as unknown as ResourceDescriptor),
    /capability/,
  );
  assert.throws(
    () => registry.register({ ...base, path: '/Users/alice/private.jsonl' } as ResourceDescriptor),
    /field|metadata/i,
  );
  assert.throws(
    () => registry.register({ ...base, stopConditions: ['window-blur', 'window-blur'] }),
    /duplicate/i,
  );
  assert.throws(
    () => registry.register({ ...base, boundedException: 'first-codex-history' }),
    /bounded exception/i,
  );

  const lease = registry.register(base);
  let stopCalls = 0;
  await assert.rejects(
    lease.stop('completed', () => { stopCalls += 1; }),
    /stop condition/i,
  );
  assert.equal(stopCalls, 0);
  assert.equal(lease.active, true);
  await lease.stop('extension-dispose', () => { stopCalls += 1; });
  assert.equal(stopCalls, 1);
});
