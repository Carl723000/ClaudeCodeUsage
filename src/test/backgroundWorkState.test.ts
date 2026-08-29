import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  BACKGROUND_WORK_STATE_SCHEMA_VERSION,
  beginBackgroundWork,
  canStartBackgroundWork,
  createBackgroundWorkState,
  interruptBackgroundWork,
  pauseBackgroundWork,
  recordBackgroundWorkFailure,
  recordBackgroundWorkProgress,
  restoreBackgroundWorkState,
  type BackgroundWorkBackoffPolicy,
  type BackgroundWorkProgress,
} from '../backgroundWorkState';

const policy: BackgroundWorkBackoffPolicy = {
  failureBaseMs: 100,
  failureMaxMs: 400,
  noProgressCooldownMs: 250,
};

const emptyProgress: BackgroundWorkProgress = {
  completedUnits: 0,
  totalUnits: 5,
  completedBytes: 0,
  totalBytes: 50,
};

test('successful progress resets failures and is immediately eligible', () => {
  const initial = createBackgroundWorkState({
    measurementVersion: 7,
    reason: 'first-index',
    now: 1_000,
    progress: emptyProgress,
  });
  const firstStart = beginBackgroundWork(initial, { trigger: 'automatic', now: 1_000 });
  assert.equal(firstStart.started, true);

  const failed = recordBackgroundWorkFailure(firstStart.state, { now: 1_010 }, policy);
  assert.equal(failed.failStreak, 1);
  const retry = beginBackgroundWork(failed, { trigger: 'manual', now: 1_011, reason: 'resume' });
  assert.equal(retry.started, true);

  const progressed = recordBackgroundWorkProgress(retry.state, {
    now: 1_020,
    complete: false,
    progress: {
      completedUnits: 1,
      totalUnits: 5,
      completedBytes: 10,
      totalBytes: 50,
    },
  }, policy);

  assert.equal(progressed.status, 'eligible');
  assert.equal(progressed.failStreak, 0);
  assert.equal(progressed.nextEligibleAt, 1_020);
  assert.equal(progressed.pausedReason, null);
  assert.equal(progressed.reason, 'resume');
  assert.equal(canStartBackgroundWork(progressed, { trigger: 'automatic', now: 1_020 }), true);
});

test('failures persist an exponential backoff and manual work may bypass it', () => {
  let state = createBackgroundWorkState({
    measurementVersion: 1,
    reason: 'first-index',
    now: 1_000,
    progress: emptyProgress,
  });

  state = beginBackgroundWork(state, { trigger: 'automatic', now: 1_000 }).state;
  state = recordBackgroundWorkFailure(state, { now: 1_000 }, policy);
  assert.equal(state.failStreak, 1);
  assert.equal(state.nextEligibleAt, 1_100);
  assert.equal(state.pausedReason, 'failure-backoff');
  assert.equal(canStartBackgroundWork(state, { trigger: 'automatic', now: 1_099 }), false);
  assert.equal(canStartBackgroundWork(state, { trigger: 'automatic', now: 1_100 }), true);
  assert.equal(canStartBackgroundWork(state, { trigger: 'manual', now: 1_001 }), true);

  state = beginBackgroundWork(state, { trigger: 'automatic', now: 1_100 }).state;
  state = recordBackgroundWorkFailure(state, { now: 1_100 }, policy);
  assert.equal(state.failStreak, 2);
  assert.equal(state.nextEligibleAt, 1_300);

  state = beginBackgroundWork(state, { trigger: 'automatic', now: 1_300 }).state;
  state = recordBackgroundWorkFailure(state, { now: 1_300 }, policy);
  state = beginBackgroundWork(state, { trigger: 'automatic', now: 1_700 }).state;
  state = recordBackgroundWorkFailure(state, { now: 1_700 }, policy);
  assert.equal(state.failStreak, 4);
  assert.equal(state.nextEligibleAt, 2_100, 'backoff is capped by failureMaxMs');
});

test('an attempt with no progress cools down instead of hot-looping', () => {
  const initial = createBackgroundWorkState({
    measurementVersion: 1,
    reason: 'hourly-history',
    now: 10,
    progress: emptyProgress,
  });
  const running = beginBackgroundWork(initial, { trigger: 'automatic', now: 10 }).state;
  const noProgress = recordBackgroundWorkProgress(running, {
    now: 20,
    complete: false,
    progress: emptyProgress,
  }, policy);

  assert.equal(noProgress.status, 'cooldown');
  assert.equal(noProgress.pausedReason, 'no-progress');
  assert.equal(noProgress.nextEligibleAt, 270);
  assert.equal(noProgress.failStreak, 0, 'no-progress is distinct from an execution failure');
  assert.equal(canStartBackgroundWork(noProgress, { trigger: 'automatic', now: 269 }), false);
  assert.equal(canStartBackgroundWork(noProgress, { trigger: 'manual', now: 21 }), true);
});

test('a user pause can only be resumed by a manual trigger', () => {
  const initial = createBackgroundWorkState({
    measurementVersion: 1,
    reason: 'period-migration',
    now: 1,
  });
  const paused = pauseBackgroundWork(initial, { now: 2 });

  assert.equal(paused.status, 'paused');
  assert.equal(paused.pausedReason, 'user');
  assert.equal(canStartBackgroundWork(paused, { trigger: 'automatic', now: 10_000 }), false);

  const automatic = beginBackgroundWork(paused, { trigger: 'automatic', now: 10_000 });
  assert.equal(automatic.started, false);
  assert.equal(automatic.state, paused);

  const manual = beginBackgroundWork(paused, { trigger: 'manual', now: 3, reason: 'resume' });
  assert.equal(manual.started, true);
  assert.equal(manual.state.status, 'running');
  assert.equal(manual.state.pausedReason, null);
  assert.equal(manual.state.reason, 'resume');
});

test('an interrupted running attempt resumes without counting as a failure', () => {
  const initial = createBackgroundWorkState({
    measurementVersion: 1,
    reason: 'first-index',
    now: 10,
    progress: emptyProgress,
  });
  const running = beginBackgroundWork(initial, {
    trigger: 'automatic',
    now: 10,
  }).state;
  const interrupted = interruptBackgroundWork(running, { now: 20 });

  assert.equal(interrupted.status, 'eligible');
  assert.equal(interrupted.reason, 'resume');
  assert.equal(interrupted.failStreak, 0);
  assert.equal(interrupted.nextEligibleAt, 20);
  assert.equal(interrupted.pausedReason, null);
  assert.equal(canStartBackgroundWork(interrupted, {
    trigger: 'automatic',
    now: 20,
  }), true);
});

test('complete work stays complete for the same measurement version', () => {
  const initial = createBackgroundWorkState({
    measurementVersion: 4,
    reason: 'first-index',
    now: 100,
    progress: emptyProgress,
  });
  const running = beginBackgroundWork(initial, { trigger: 'automatic', now: 100 }).state;
  const complete = recordBackgroundWorkProgress(running, {
    now: 110,
    complete: true,
    progress: {
      completedUnits: 5,
      totalUnits: 5,
      completedBytes: 50,
      totalBytes: 50,
    },
  }, policy);

  assert.equal(complete.status, 'complete');
  assert.equal(complete.nextEligibleAt, null);
  assert.equal(canStartBackgroundWork(complete, { trigger: 'manual', now: 1_000 }), false);

  const sameVersion = restoreBackgroundWorkState(JSON.parse(JSON.stringify(complete)), {
    measurementVersion: 4,
    reason: 'first-index',
    now: 1_000,
  });
  assert.equal(sameVersion.disposition, 'valid');
  assert.equal(sameVersion.state.status, 'complete');
  assert.equal(canStartBackgroundWork(sameVersion.state, { trigger: 'automatic', now: 1_000 }), false);

  const changedVersion = restoreBackgroundWorkState(complete, {
    measurementVersion: 5,
    reason: 'parser-migration',
    now: 1_000,
  });
  assert.equal(changedVersion.disposition, 'measurement-changed');
  assert.equal(changedVersion.state.status, 'eligible');
  assert.equal(changedVersion.state.measurementVersion, 5);
  assert.deepEqual(changedVersion.state.progress, {
    completedUnits: 0,
    totalUnits: 0,
    completedBytes: 0,
    totalBytes: 0,
  });
});

test('missing state starts safely while corrupt or content-bearing state fails closed', () => {
  const missing = restoreBackgroundWorkState(undefined, {
    measurementVersion: 3,
    reason: 'hourly-history',
    now: 50,
  });
  assert.equal(missing.disposition, 'new');
  assert.equal(missing.state.status, 'eligible');

  const unsafe = {
    schemaVersion: BACKGROUND_WORK_STATE_SCHEMA_VERSION,
    measurementVersion: 3,
    status: 'eligible',
    reason: 'hourly-history',
    progress: {
      completedUnits: 0,
      totalUnits: 0,
      completedBytes: 0,
      totalBytes: 0,
    },
    failStreak: 0,
    nextEligibleAt: 50,
    pausedReason: null,
    updatedAt: 50,
    path: '/Users/alice/.codex/sessions/private.jsonl',
  };
  const corrupt = restoreBackgroundWorkState(unsafe, {
    measurementVersion: 3,
    reason: 'hourly-history',
    now: 60,
  });

  assert.equal(corrupt.disposition, 'corrupt');
  assert.equal(corrupt.state.status, 'paused');
  assert.equal(corrupt.state.pausedReason, 'corrupt-state');
  assert.equal(canStartBackgroundWork(corrupt.state, { trigger: 'manual', now: 61 }), false);
  assert.doesNotMatch(JSON.stringify(corrupt.state), /alice|private|path|session/i);

  const invalidNumber = restoreBackgroundWorkState({ ...unsafe, path: undefined, failStreak: -1 }, {
    measurementVersion: 3,
    reason: 'hourly-history',
    now: 60,
  });
  assert.equal(invalidNumber.disposition, 'corrupt');
});
