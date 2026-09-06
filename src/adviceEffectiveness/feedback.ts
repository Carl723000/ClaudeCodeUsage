import { isAdviceIdentifier } from './contract';

export const ADVICE_FEEDBACK_STORAGE_KEY = 'claudeCodeUsage.adviceEffectiveness.feedback.v1';
export const ADVICE_FEEDBACK_VERSION = 1 as const;
export const MAX_ADVICE_FEEDBACK_EVENTS = 500;

export type AdviceFeedbackKind = 'helpful' | 'not-helpful' | 'applied';

export interface AdviceFeedbackEvent {
  schemaVersion: typeof ADVICE_FEEDBACK_VERSION;
  eventId: string;
  adviceId: string;
  recommendationId: string;
  kind: AdviceFeedbackKind;
  recordedAt: string;
  localOnly: true;
}

export interface AdviceFeedbackStorage {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

interface StoredAdviceFeedback {
  schemaVersion: typeof ADVICE_FEEDBACK_VERSION;
  events: AdviceFeedbackEvent[];
}

export type AdviceFeedbackLoadResult =
  | { ok: true; events: AdviceFeedbackEvent[] }
  | { ok: false; reason: 'invalid-local-data' };

export type AdviceFeedbackWriteResult =
  | { ok: true; events: AdviceFeedbackEvent[] }
  | { ok: false; reason: 'invalid-event' | 'invalid-local-data' };

const EVENT_KEYS = [
  'adviceId',
  'eventId',
  'kind',
  'localOnly',
  'recordedAt',
  'recommendationId',
  'schemaVersion',
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function isFeedbackKind(value: unknown): value is AdviceFeedbackKind {
  return value === 'helpful' || value === 'not-helpful' || value === 'applied';
}

function parseEvent(value: unknown): AdviceFeedbackEvent | undefined {
  if (!isObject(value) || !hasExactKeys(value, EVENT_KEYS)) return undefined;
  if (
    value.schemaVersion !== ADVICE_FEEDBACK_VERSION ||
    value.localOnly !== true ||
    typeof value.eventId !== 'string' ||
    typeof value.adviceId !== 'string' ||
    typeof value.recommendationId !== 'string' ||
    typeof value.recordedAt !== 'string' ||
    !isFeedbackKind(value.kind) ||
    !isAdviceIdentifier(value.eventId) ||
    !isAdviceIdentifier(value.adviceId) ||
    !isAdviceIdentifier(value.recommendationId) ||
    !Number.isFinite(Date.parse(value.recordedAt))
  ) {
    return undefined;
  }
  return {
    schemaVersion: ADVICE_FEEDBACK_VERSION,
    eventId: value.eventId,
    adviceId: value.adviceId,
    recommendationId: value.recommendationId,
    kind: value.kind,
    recordedAt: value.recordedAt,
    localOnly: true,
  };
}

/** Read only the versioned local ledger; corrupt or unknown shapes fail closed. */
export function loadAdviceFeedback(storage: AdviceFeedbackStorage): AdviceFeedbackLoadResult {
  const raw = storage.get<unknown>(ADVICE_FEEDBACK_STORAGE_KEY);
  if (raw === undefined) return { ok: true, events: [] };
  if (!isObject(raw) || !hasExactKeys(raw, ['events', 'schemaVersion'])) {
    return { ok: false, reason: 'invalid-local-data' };
  }
  if (raw.schemaVersion !== ADVICE_FEEDBACK_VERSION || !Array.isArray(raw.events)) {
    return { ok: false, reason: 'invalid-local-data' };
  }
  const events: AdviceFeedbackEvent[] = [];
  const eventIds = new Set<string>();
  for (const rawEvent of raw.events) {
    const event = parseEvent(rawEvent);
    if (!event || eventIds.has(event.eventId)) return { ok: false, reason: 'invalid-local-data' };
    eventIds.add(event.eventId);
    events.push(event);
  }
  return { ok: true, events };
}

/**
 * Store a local feedback state transition. Helpful/not-helpful are mutually
 * exclusive for one recommendation; applied is independent and may coexist.
 * No prompt, payload, explanation, endpoint, or free-text field is accepted.
 */
export async function recordAdviceFeedback(
  storage: AdviceFeedbackStorage,
  eventInput: Omit<AdviceFeedbackEvent, 'schemaVersion' | 'localOnly'>
): Promise<AdviceFeedbackWriteResult> {
  const event = parseEvent({
    schemaVersion: ADVICE_FEEDBACK_VERSION,
    eventId: eventInput.eventId,
    adviceId: eventInput.adviceId,
    recommendationId: eventInput.recommendationId,
    kind: eventInput.kind,
    recordedAt: eventInput.recordedAt,
    localOnly: true,
  });
  if (!event) return { ok: false, reason: 'invalid-event' };

  const loaded = loadAdviceFeedback(storage);
  if (!loaded.ok) return loaded;

  const sameTarget = (candidate: AdviceFeedbackEvent): boolean =>
    candidate.adviceId === event.adviceId && candidate.recommendationId === event.recommendationId;
  const next = loaded.events.filter((candidate) => {
    if (candidate.eventId === event.eventId) return false;
    if (!sameTarget(candidate)) return true;
    if (event.kind === 'applied') return candidate.kind !== 'applied';
    return candidate.kind === 'applied';
  });
  next.push(event);
  const bounded = next.slice(-MAX_ADVICE_FEEDBACK_EVENTS);
  const stored: StoredAdviceFeedback = { schemaVersion: ADVICE_FEEDBACK_VERSION, events: bounded };
  await storage.update(ADVICE_FEEDBACK_STORAGE_KEY, stored);
  return { ok: true, events: bounded };
}

export interface AdviceFeedbackSummary {
  rating: 'helpful' | 'not-helpful' | 'unrated';
  applied: boolean;
}

export function summarizeAdviceFeedback(
  events: readonly AdviceFeedbackEvent[],
  adviceId: string,
  recommendationId: string
): AdviceFeedbackSummary {
  let rating: AdviceFeedbackSummary['rating'] = 'unrated';
  let applied = false;
  for (const event of events) {
    if (event.adviceId !== adviceId || event.recommendationId !== recommendationId) continue;
    if (event.kind === 'applied') applied = true;
    else rating = event.kind;
  }
  return { rating, applied };
}
