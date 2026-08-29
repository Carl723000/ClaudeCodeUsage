export const BACKGROUND_WORK_STATE_SCHEMA_VERSION = 1 as const;

export const BACKGROUND_WORK_STATUSES = [
  'eligible',
  'running',
  'cooldown',
  'paused',
  'complete',
] as const;

export const BACKGROUND_WORK_REASONS = [
  'first-index',
  'parser-migration',
  'period-migration',
  'hourly-history',
  'history-backfill',
  'rule-migration',
  'resume',
] as const;

export const BACKGROUND_WORK_PAUSED_REASONS = [
  'failure-backoff',
  'no-progress',
  'user',
  'corrupt-state',
] as const;

export const BACKGROUND_WORK_TRIGGERS = ['automatic', 'manual'] as const;

export type BackgroundWorkStatus = typeof BACKGROUND_WORK_STATUSES[number];
export type BackgroundWorkReason = typeof BACKGROUND_WORK_REASONS[number];
export type BackgroundWorkPausedReason = typeof BACKGROUND_WORK_PAUSED_REASONS[number];
export type BackgroundWorkTrigger = typeof BACKGROUND_WORK_TRIGGERS[number];

/** A monotonic, aggregate-only watermark. It is not a scanner cursor: the
 * provider index remains responsible for exact resume positions. */
export interface BackgroundWorkProgress {
  completedUnits: number;
  totalUnits: number;
  completedBytes: number;
  totalBytes: number;
}

export interface BackgroundWorkState {
  schemaVersion: typeof BACKGROUND_WORK_STATE_SCHEMA_VERSION;
  measurementVersion: number;
  /** Persisted producer generation; prevents reusing completion from an old index. */
  indexGeneration: number | null;
  status: BackgroundWorkStatus;
  reason: BackgroundWorkReason;
  progress: BackgroundWorkProgress;
  failStreak: number;
  nextEligibleAt: number | null;
  pausedReason: BackgroundWorkPausedReason | null;
  updatedAt: number;
}

export interface BackgroundWorkBackoffPolicy {
  failureBaseMs: number;
  failureMaxMs: number;
  noProgressCooldownMs: number;
}

export const DEFAULT_BACKGROUND_WORK_BACKOFF_POLICY: Readonly<BackgroundWorkBackoffPolicy> =
  Object.freeze({
    failureBaseMs: 60_000,
    failureMaxMs: 3_600_000,
    noProgressCooldownMs: 300_000,
  });

export interface CreateBackgroundWorkStateOptions {
  measurementVersion: number;
  reason: BackgroundWorkReason;
  now: number;
  progress?: BackgroundWorkProgress;
  indexGeneration?: number | null;
}

export type BackgroundWorkRestoreDisposition =
  | 'new'
  | 'valid'
  | 'measurement-changed'
  | 'generation-changed'
  | 'corrupt';

export interface BackgroundWorkRestoreResult {
  disposition: BackgroundWorkRestoreDisposition;
  state: BackgroundWorkState;
}

export interface BackgroundWorkStartOptions {
  trigger: BackgroundWorkTrigger;
  now: number;
  reason?: BackgroundWorkReason;
}

export interface BackgroundWorkStartResult {
  started: boolean;
  state: BackgroundWorkState;
}

const STATE_FIELDS = [
  'schemaVersion',
  'measurementVersion',
  'indexGeneration',
  'status',
  'reason',
  'progress',
  'failStreak',
  'nextEligibleAt',
  'pausedReason',
  'updatedAt',
] as const;

const PROGRESS_FIELDS = [
  'completedUnits',
  'totalUnits',
  'completedBytes',
  'totalBytes',
] as const;

const statusSet = new Set<unknown>(BACKGROUND_WORK_STATUSES);
const reasonSet = new Set<unknown>(BACKGROUND_WORK_REASONS);
const pausedReasonSet = new Set<unknown>(BACKGROUND_WORK_PAUSED_REASONS);
const triggerSet = new Set<unknown>(BACKGROUND_WORK_TRIGGERS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === fields.length && fields.every((field) =>
    Object.prototype.hasOwnProperty.call(value, field));
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isIndexGeneration(value: unknown): value is number | null {
  return value === null || (isSafeNonNegativeInteger(value) && value > 0);
}

function assertSafeNonNegativeInteger(value: number, field: string): void {
  if (!isSafeNonNegativeInteger(value)) {
    throw new RangeError(`${field} must be a non-negative safe integer`);
  }
}

function assertReason(reason: BackgroundWorkReason): void {
  if (!reasonSet.has(reason)) throw new TypeError('reason must be a fixed BackgroundWorkReason');
}

function assertTrigger(trigger: BackgroundWorkTrigger): void {
  if (!triggerSet.has(trigger)) throw new TypeError('trigger must be automatic or manual');
}

function isProgress(value: unknown): value is BackgroundWorkProgress {
  if (!isRecord(value) || !hasExactFields(value, PROGRESS_FIELDS)) return false;
  if (!isSafeNonNegativeInteger(value.completedUnits) ||
      !isSafeNonNegativeInteger(value.totalUnits) ||
      !isSafeNonNegativeInteger(value.completedBytes) ||
      !isSafeNonNegativeInteger(value.totalBytes)) {
    return false;
  }
  return value.completedUnits <= value.totalUnits && value.completedBytes <= value.totalBytes;
}

function cloneProgress(progress: BackgroundWorkProgress): BackgroundWorkProgress {
  if (!isProgress(progress)) throw new TypeError('progress must contain fixed non-negative numeric fields');
  return {
    completedUnits: progress.completedUnits,
    totalUnits: progress.totalUnits,
    completedBytes: progress.completedBytes,
    totalBytes: progress.totalBytes,
  };
}

function emptyProgress(): BackgroundWorkProgress {
  return {
    completedUnits: 0,
    totalUnits: 0,
    completedBytes: 0,
    totalBytes: 0,
  };
}

function validStatusFields(value: Record<string, unknown>): boolean {
  switch (value.status) {
    case 'eligible':
      return isSafeNonNegativeInteger(value.nextEligibleAt) && value.pausedReason === null;
    case 'running':
    case 'complete':
      return value.nextEligibleAt === null && value.pausedReason === null;
    case 'cooldown':
      return isSafeNonNegativeInteger(value.nextEligibleAt) &&
        (value.pausedReason === 'failure-backoff' || value.pausedReason === 'no-progress');
    case 'paused':
      return value.nextEligibleAt === null &&
        (value.pausedReason === 'user' || value.pausedReason === 'corrupt-state');
    default:
      return false;
  }
}

export function isBackgroundWorkState(value: unknown): value is BackgroundWorkState {
  if (!isRecord(value) || !hasExactFields(value, STATE_FIELDS)) return false;
  return value.schemaVersion === BACKGROUND_WORK_STATE_SCHEMA_VERSION &&
    isSafeNonNegativeInteger(value.measurementVersion) && value.measurementVersion > 0 &&
    isIndexGeneration(value.indexGeneration) &&
    statusSet.has(value.status) &&
    reasonSet.has(value.reason) &&
    isProgress(value.progress) &&
    isSafeNonNegativeInteger(value.failStreak) &&
    (value.nextEligibleAt === null || isSafeNonNegativeInteger(value.nextEligibleAt)) &&
    (value.pausedReason === null || pausedReasonSet.has(value.pausedReason)) &&
    isSafeNonNegativeInteger(value.updatedAt) &&
    validStatusFields(value);
}

function cloneState(value: BackgroundWorkState): BackgroundWorkState {
  return {
    schemaVersion: BACKGROUND_WORK_STATE_SCHEMA_VERSION,
    measurementVersion: value.measurementVersion,
    indexGeneration: value.indexGeneration,
    status: value.status,
    reason: value.reason,
    progress: cloneProgress(value.progress),
    failStreak: value.failStreak,
    nextEligibleAt: value.nextEligibleAt,
    pausedReason: value.pausedReason,
    updatedAt: value.updatedAt,
  };
}

export function createBackgroundWorkState(
  options: CreateBackgroundWorkStateOptions,
): BackgroundWorkState {
  assertSafeNonNegativeInteger(options.measurementVersion, 'measurementVersion');
  if (options.measurementVersion === 0) throw new RangeError('measurementVersion must be positive');
  assertSafeNonNegativeInteger(options.now, 'now');
  assertReason(options.reason);
  return {
    schemaVersion: BACKGROUND_WORK_STATE_SCHEMA_VERSION,
    measurementVersion: options.measurementVersion,
    indexGeneration: options.indexGeneration ?? null,
    status: 'eligible',
    reason: options.reason,
    progress: options.progress === undefined ? emptyProgress() : cloneProgress(options.progress),
    failStreak: 0,
    nextEligibleAt: options.now,
    pausedReason: null,
    updatedAt: options.now,
  };
}

export function restoreBackgroundWorkState(
  value: unknown,
  options: CreateBackgroundWorkStateOptions,
): BackgroundWorkRestoreResult {
  const fresh = (): BackgroundWorkState => createBackgroundWorkState(options);
  if (value === undefined || value === null) return { disposition: 'new', state: fresh() };
  if (!isBackgroundWorkState(value)) {
    const state = fresh();
    return {
      disposition: 'corrupt',
      state: {
        ...state,
        status: 'paused',
        nextEligibleAt: null,
        pausedReason: 'corrupt-state',
      },
    };
  }
  if (value.measurementVersion !== options.measurementVersion) {
    return { disposition: 'measurement-changed', state: fresh() };
  }
  if (options.indexGeneration !== undefined && value.indexGeneration !== options.indexGeneration) {
    return { disposition: 'generation-changed', state: fresh() };
  }
  return { disposition: 'valid', state: cloneState(value) };
}

export function canStartBackgroundWork(
  state: BackgroundWorkState,
  options: Pick<BackgroundWorkStartOptions, 'trigger' | 'now'>,
): boolean {
  assertTrigger(options.trigger);
  assertSafeNonNegativeInteger(options.now, 'now');
  if (!isBackgroundWorkState(state)) return false;
  if (state.status === 'complete' || state.status === 'running') return false;
  if (state.status === 'paused') {
    return state.pausedReason === 'user' && options.trigger === 'manual';
  }
  if (options.trigger === 'manual') return true;
  return state.nextEligibleAt !== null && options.now >= state.nextEligibleAt;
}

export function beginBackgroundWork(
  state: BackgroundWorkState,
  options: BackgroundWorkStartOptions,
): BackgroundWorkStartResult {
  if (options.reason !== undefined) assertReason(options.reason);
  if (!canStartBackgroundWork(state, options)) return { started: false, state };
  return {
    started: true,
    state: {
      ...cloneState(state),
      status: 'running',
      reason: options.reason ?? state.reason,
      nextEligibleAt: null,
      pausedReason: null,
      updatedAt: options.now,
    },
  };
}

function assertRunningState(state: BackgroundWorkState): void {
  if (!isBackgroundWorkState(state) || state.status !== 'running') {
    throw new Error('background work attempt must be running');
  }
}

function assertBackoffPolicy(policy: BackgroundWorkBackoffPolicy): void {
  assertSafeNonNegativeInteger(policy.failureBaseMs, 'failureBaseMs');
  assertSafeNonNegativeInteger(policy.failureMaxMs, 'failureMaxMs');
  assertSafeNonNegativeInteger(policy.noProgressCooldownMs, 'noProgressCooldownMs');
  if (policy.failureBaseMs === 0 || policy.failureMaxMs < policy.failureBaseMs ||
      policy.noProgressCooldownMs === 0) {
    throw new RangeError('background work backoff durations must be positive and ordered');
  }
}

export function backgroundWorkFailureBackoffMs(
  failStreak: number,
  policy: BackgroundWorkBackoffPolicy = DEFAULT_BACKGROUND_WORK_BACKOFF_POLICY,
): number {
  assertSafeNonNegativeInteger(failStreak, 'failStreak');
  assertBackoffPolicy(policy);
  if (failStreak === 0) return 0;
  const exponent = Math.min(52, failStreak - 1);
  return Math.min(policy.failureMaxMs, policy.failureBaseMs * Math.pow(2, exponent));
}

function safeTimestampAfter(now: number, delay: number): number {
  return Math.min(Number.MAX_SAFE_INTEGER, now + delay);
}

export function recordBackgroundWorkFailure(
  state: BackgroundWorkState,
  options: { now: number },
  policy: BackgroundWorkBackoffPolicy = DEFAULT_BACKGROUND_WORK_BACKOFF_POLICY,
): BackgroundWorkState {
  assertRunningState(state);
  assertSafeNonNegativeInteger(options.now, 'now');
  assertBackoffPolicy(policy);
  const failStreak = Math.min(Number.MAX_SAFE_INTEGER, state.failStreak + 1);
  return {
    ...cloneState(state),
    status: 'cooldown',
    failStreak,
    nextEligibleAt: safeTimestampAfter(
      options.now,
      backgroundWorkFailureBackoffMs(failStreak, policy),
    ),
    pausedReason: 'failure-backoff',
    updatedAt: options.now,
  };
}

/** Return an interrupted in-flight attempt to the immediately eligible state.
 * Cancellation is neither a failure nor proof of no progress: the provider
 * index owns the exact durable cursor and the next permitted coordinator pass
 * may resume it from there. */
export function interruptBackgroundWork(
  state: BackgroundWorkState,
  options: { now: number },
): BackgroundWorkState {
  assertRunningState(state);
  assertSafeNonNegativeInteger(options.now, 'now');
  return {
    ...cloneState(state),
    status: 'eligible',
    reason: 'resume',
    nextEligibleAt: options.now,
    pausedReason: null,
    updatedAt: options.now,
  };
}

function mergedProgress(
  current: BackgroundWorkProgress,
  incoming: BackgroundWorkProgress,
): BackgroundWorkProgress {
  const checked = cloneProgress(incoming);
  const completedUnits = Math.max(current.completedUnits, checked.completedUnits);
  const completedBytes = Math.max(current.completedBytes, checked.completedBytes);
  return {
    completedUnits,
    totalUnits: Math.max(current.totalUnits, checked.totalUnits, completedUnits),
    completedBytes,
    totalBytes: Math.max(current.totalBytes, checked.totalBytes, completedBytes),
  };
}

export function recordBackgroundWorkProgress(
  state: BackgroundWorkState,
  options: { now: number; complete: boolean; progress: BackgroundWorkProgress },
  policy: BackgroundWorkBackoffPolicy = DEFAULT_BACKGROUND_WORK_BACKOFF_POLICY,
): BackgroundWorkState {
  assertRunningState(state);
  assertSafeNonNegativeInteger(options.now, 'now');
  assertBackoffPolicy(policy);
  const progress = mergedProgress(state.progress, options.progress);
  const advanced = progress.completedUnits > state.progress.completedUnits ||
    progress.completedBytes > state.progress.completedBytes;

  if (options.complete) {
    return {
      ...cloneState(state),
      status: 'complete',
      progress,
      failStreak: 0,
      nextEligibleAt: null,
      pausedReason: null,
      updatedAt: options.now,
    };
  }
  if (advanced) {
    return {
      ...cloneState(state),
      status: 'eligible',
      progress,
      failStreak: 0,
      nextEligibleAt: options.now,
      pausedReason: null,
      updatedAt: options.now,
    };
  }
  return {
    ...cloneState(state),
    status: 'cooldown',
    progress,
    nextEligibleAt: safeTimestampAfter(options.now, policy.noProgressCooldownMs),
    pausedReason: 'no-progress',
    updatedAt: options.now,
  };
}

export function pauseBackgroundWork(
  state: BackgroundWorkState,
  options: { now: number },
): BackgroundWorkState {
  assertSafeNonNegativeInteger(options.now, 'now');
  if (!isBackgroundWorkState(state)) throw new TypeError('background work state is invalid');
  if (state.status === 'complete' || state.pausedReason === 'corrupt-state') return state;
  if (state.status === 'paused' && state.pausedReason === 'user') return state;
  return {
    ...cloneState(state),
    status: 'paused',
    nextEligibleAt: null,
    pausedReason: 'user',
    updatedAt: options.now,
  };
}
