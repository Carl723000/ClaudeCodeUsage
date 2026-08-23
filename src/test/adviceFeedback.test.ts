import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  ADVICE_FEEDBACK_STORAGE_KEY,
  AdviceFeedbackStorage,
  loadAdviceFeedback,
  recordAdviceFeedback,
  summarizeAdviceFeedback,
} from '../adviceEffectiveness/feedback';

class MemoryStorage implements AdviceFeedbackStorage {
  value: unknown;
  updates = 0;

  get<T>(_key: string): T | undefined {
    return this.value as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    assert.equal(key, ADVICE_FEEDBACK_STORAGE_KEY);
    this.value = value;
    this.updates += 1;
  }
}

function event(eventId: string, kind: 'helpful' | 'not-helpful' | 'applied') {
  return {
    eventId,
    adviceId: 'advice-run-1',
    recommendationId: 'recommendation-1',
    kind,
    recordedAt: `2026-08-24T00:00:0${eventId.slice(-1)}.000Z`,
  };
}

test('records rating and applied state locally while keeping them semantically independent', async () => {
  const storage = new MemoryStorage();
  await recordAdviceFeedback(storage, event('event-1', 'helpful'));
  await recordAdviceFeedback(storage, event('event-2', 'applied'));
  const result = await recordAdviceFeedback(storage, event('event-3', 'not-helpful'));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(storage.updates, 3);
  assert.equal(result.events.length, 2, 'the new rating replaces the previous rating, not applied');
  assert.deepEqual(
    summarizeAdviceFeedback(result.events, 'advice-run-1', 'recommendation-1'),
    { rating: 'not-helpful', applied: true }
  );
  const stored = JSON.stringify(storage.value);
  assert.doesNotMatch(stored, /prompt|payload|explanation|endpoint|PRIVATE/);
  assert.match(stored, /"localOnly":true/);
});

test('invalid events are rejected without writing', async () => {
  const storage = new MemoryStorage();
  const result = await recordAdviceFeedback(storage, {
    ...event('event-1', 'helpful'),
    recordedAt: 'not-a-date',
  });
  assert.deepEqual(result, { ok: false, reason: 'invalid-event' });
  assert.equal(storage.updates, 0);
});

test('corrupt or unknown-version local data fails closed and is not overwritten', async () => {
  const storage = new MemoryStorage();
  storage.value = { schemaVersion: 99, events: [{ prompt: 'private' }] };
  assert.deepEqual(loadAdviceFeedback(storage), { ok: false, reason: 'invalid-local-data' });
  const result = await recordAdviceFeedback(storage, event('event-1', 'helpful'));
  assert.deepEqual(result, { ok: false, reason: 'invalid-local-data' });
  assert.equal(storage.updates, 0);
});
