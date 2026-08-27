/**
 * Pure planning contract between v2.3.1 advice and the future stable #87
 * materialized Claude index. It deliberately performs no I/O and never starts
 * a content scan. The host may interpret `refresh-content-analysis` only after
 * the user explicitly requests prompt personalization.
 */

export const ADVICE_EVIDENCE_PREPARATION_PLAN_VERSION = 1 as const;

export type AdviceEvidencePreparationOperation = 'local-render' | 'preview' | 'send';
export type AdviceEvidencePreparationDataMode =
  | 'local-only'
  | 'aggregates-only'
  | 'aggregates-with-prompt-samples';

export interface AdviceContentSnapshotDescriptor {
  status: 'ready' | 'stale';
  windowDays: number;
  promptSampleCount: number;
}

export interface AdviceEvidencePreparationRequest {
  featureMode: 'disabled' | 'enabled';
  operation: AdviceEvidencePreparationOperation;
  dataMode: AdviceEvidencePreparationDataMode;
  aggregateAvailable: boolean;
  aggregateConsent: 'not-granted' | 'explicit';
  promptPersonalizationConsent: 'not-granted' | 'explicit';
  requestedWindowDays: number;
  contentSnapshot?: AdviceContentSnapshotDescriptor;
}

export type AdviceEvidencePreparationReason =
  | 'feature-disabled'
  | 'invalid-request'
  | 'local-evidence-ready'
  | 'aggregate-consent-required'
  | 'aggregate-unavailable'
  | 'aggregate-evidence-ready'
  | 'prompt-personalization-consent-required'
  | 'content-snapshot-missing'
  | 'content-snapshot-stale'
  | 'content-window-mismatch'
  | 'prompt-samples-unavailable'
  | 'personalized-evidence-ready';

export interface AdviceEvidencePreparationPlan {
  schemaVersion: typeof ADVICE_EVIDENCE_PREPARATION_PLAN_VERSION;
  status: 'disabled' | 'ready' | 'blocked' | 'explicit-refresh-required';
  dataMode: AdviceEvidencePreparationDataMode;
  reason: AdviceEvidencePreparationReason;
  requiredHostAction: 'none' | 'refresh-content-analysis';
  /** This pure seam never authorizes a background or implicit JSONL scan. */
  allowAutomaticScan: false;
}

function plan(
  status: AdviceEvidencePreparationPlan['status'],
  dataMode: AdviceEvidencePreparationDataMode,
  reason: AdviceEvidencePreparationReason,
  requiredHostAction: AdviceEvidencePreparationPlan['requiredHostAction'] = 'none',
): AdviceEvidencePreparationPlan {
  return {
    schemaVersion: ADVICE_EVIDENCE_PREPARATION_PLAN_VERSION,
    status,
    dataMode,
    reason,
    requiredHostAction,
    allowAutomaticScan: false,
  };
}

function validSnapshot(value: unknown): value is AdviceContentSnapshotDescriptor {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const snapshot = value as Record<string, unknown>;
  const keys = Object.keys(snapshot).sort();
  if (keys.join('\0') !== ['promptSampleCount', 'status', 'windowDays'].join('\0')) return false;
  return (
    (snapshot.status === 'ready' || snapshot.status === 'stale') &&
    typeof snapshot.windowDays === 'number' &&
    Number.isInteger(snapshot.windowDays) &&
    snapshot.windowDays >= 1 &&
    snapshot.windowDays <= 365 &&
    typeof snapshot.promptSampleCount === 'number' &&
    Number.isInteger(snapshot.promptSampleCount) &&
    snapshot.promptSampleCount >= 0
  );
}

function validRequest(value: AdviceEvidencePreparationRequest): boolean {
  return (
    (value.operation === 'local-render' || value.operation === 'preview' || value.operation === 'send') &&
    (value.dataMode === 'local-only' ||
      value.dataMode === 'aggregates-only' ||
      value.dataMode === 'aggregates-with-prompt-samples') &&
    typeof value.aggregateAvailable === 'boolean' &&
    (value.aggregateConsent === 'not-granted' || value.aggregateConsent === 'explicit') &&
    (value.promptPersonalizationConsent === 'not-granted' ||
      value.promptPersonalizationConsent === 'explicit') &&
    Number.isInteger(value.requestedWindowDays) &&
    value.requestedWindowDays >= 1 &&
    value.requestedWindowDays <= 365 &&
    (value.contentSnapshot === undefined || validSnapshot(value.contentSnapshot))
  );
}

export function planAdviceEvidencePreparation(
  request: AdviceEvidencePreparationRequest,
): AdviceEvidencePreparationPlan {
  if (request?.featureMode === 'disabled') {
    return plan('disabled', 'local-only', 'feature-disabled');
  }
  if (request?.featureMode !== 'enabled' || !validRequest(request)) {
    return plan('blocked', 'local-only', 'invalid-request');
  }
  if (request.operation === 'local-render') {
    return request.dataMode === 'local-only'
      ? plan('ready', 'local-only', 'local-evidence-ready')
      : plan('blocked', 'local-only', 'invalid-request');
  }
  if (request.dataMode === 'local-only') {
    return plan('blocked', 'local-only', 'invalid-request');
  }
  if (request.aggregateConsent !== 'explicit') {
    return plan('blocked', request.dataMode, 'aggregate-consent-required');
  }
  if (!request.aggregateAvailable) {
    return plan('blocked', request.dataMode, 'aggregate-unavailable');
  }
  if (request.dataMode === 'aggregates-only') {
    return plan('ready', request.dataMode, 'aggregate-evidence-ready');
  }
  if (request.promptPersonalizationConsent !== 'explicit') {
    return plan('blocked', request.dataMode, 'prompt-personalization-consent-required');
  }

  const snapshot = request.contentSnapshot;
  if (!snapshot) {
    return plan(
      'explicit-refresh-required',
      request.dataMode,
      'content-snapshot-missing',
      'refresh-content-analysis',
    );
  }
  if (snapshot.status === 'stale') {
    return plan(
      'explicit-refresh-required',
      request.dataMode,
      'content-snapshot-stale',
      'refresh-content-analysis',
    );
  }
  if (snapshot.windowDays !== request.requestedWindowDays) {
    return plan(
      'explicit-refresh-required',
      request.dataMode,
      'content-window-mismatch',
      'refresh-content-analysis',
    );
  }
  if (snapshot.promptSampleCount === 0) {
    return plan('blocked', request.dataMode, 'prompt-samples-unavailable');
  }
  return plan('ready', request.dataMode, 'personalized-evidence-ready');
}
