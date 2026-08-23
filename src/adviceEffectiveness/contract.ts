/**
 * Versioned, provider-neutral contract for evidence-backed advice.
 *
 * The host owns observations, evidence, provenance, and privacy metadata. A
 * remote model may only propose recommendations that reference those host-owned
 * IDs; it never gets to manufacture measurements or claim its own provenance.
 */

export const ADVICE_CONTRACT_VERSION = 1 as const;

export type AdviceScope = 'overall' | 'project' | 'task-cohort';

export type AdviceWindow =
  | { kind: 'rolling-days'; days: number }
  | { kind: 'all-time' }
  | { kind: 'task-cohort' };

export type AdviceSourceKind =
  | 'claude-usage-aggregate'
  | 'claude-local-insight'
  | 'codex-local-insight'
  | 'task-comparison';

export interface AdviceSourceInfo {
  id: string;
  kind: AdviceSourceKind;
  scope: AdviceScope;
  window: AdviceWindow;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  /** Machine-readable quality flags only; never raw paths, IDs, or content. */
  qualityFlags: string[];
}

export type AdviceMetricUnit =
  | 'count'
  | 'tokens'
  | 'ratio'
  | 'percent'
  | 'milliseconds'
  | 'usd-estimate'
  | 'boolean';

export interface AdviceObservation {
  id: string;
  /** Stable machine-readable metric name, e.g. cache-read-share. */
  metric: string;
  value: number | boolean;
  unit: AdviceMetricUnit;
  method: 'measured' | 'estimated' | 'structural-proxy';
  sourceId: string;
  /** Host-authored readable observation. It is not included in remote payloads. */
  summary: string;
}

export interface AdviceEvidence {
  id: string;
  observationIds: string[];
  strength: 'direct' | 'correlational' | 'proxy';
  /** Host-authored readable evidence. It is not included in remote payloads. */
  summary: string;
  limitations: string[];
}

export interface AdviceExplanation {
  summary: string;
  /** Observation IDs used only as proxies, never as proof of causation. */
  proxyMetricObservationIds: string[];
  limitations: string[];
}

export interface AdviceConditionalAction {
  when: string;
  action: string;
  evidenceIds: string[];
  stopCondition?: string;
}

export interface AdviceQualityGuardrail {
  /** Stable rubric ID shared by every task in the comparison cohort. */
  rubricId: string;
  /** Normalized 0..1 quality score required after applying the advice. */
  minimumScore: number;
  /** Maximum allowed mean quality-score drop, normalized to 0..1. */
  maximumRegression: number;
}

export interface AdviceSuccessCriterion {
  metricObservationId: string;
  direction: 'increase' | 'decrease' | 'maintain';
  target: {
    kind: 'relative-change' | 'absolute';
    value: number;
  };
  minimumComparableTasks: number;
  qualityGuardrail: AdviceQualityGuardrail;
}

export interface AdviceRecommendation {
  id: string;
  title: string;
  evidenceIds: string[];
  explanation: AdviceExplanation;
  conditionalActions: AdviceConditionalAction[];
  successCriteria: AdviceSuccessCriterion[];
}

export interface AdvicePrivacyInfo {
  dataMode: 'local-only' | 'aggregates-only' | 'aggregates-with-prompt-samples';
  promptSampleConsent: 'not-applicable' | 'not-granted' | 'explicit';
  promptSampleCount: number;
  feedbackStorage: 'local-only';
}

export interface AdviceProvenance {
  generatedBy: {
    kind: 'local-rules' | 'remote-model';
    /** Coarse family only; never a full custom model or endpoint identifier. */
    modelFamily?: string;
  };
  generatedAt: string;
  locale: string;
  sources: AdviceSourceInfo[];
}

export interface AdviceContract {
  schemaVersion: typeof ADVICE_CONTRACT_VERSION;
  adviceId: string;
  observations: AdviceObservation[];
  evidence: AdviceEvidence[];
  recommendations: AdviceRecommendation[];
  privacy: AdvicePrivacyInfo;
  provenance: AdviceProvenance;
}

export type AdviceContractBuildResult =
  | { ok: true; value: AdviceContract }
  | { ok: false; issues: string[] };

export interface AdviceContractInput {
  adviceId: string;
  observations: AdviceObservation[];
  evidence: AdviceEvidence[];
  recommendations: AdviceRecommendation[];
  privacy: AdvicePrivacyInfo;
  provenance: AdviceProvenance;
}

const ID_PATTERN = /^[a-z][a-z0-9._-]{0,95}$/;

export function isAdviceIdentifier(value: string): boolean {
  return ID_PATTERN.test(value);
}

function uniqueIds<T extends { id: string }>(items: T[], label: string, issues: string[]): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (!isAdviceIdentifier(item.id)) {
      issues.push(`${label} has invalid id: ${item.id}`);
    } else if (ids.has(item.id)) {
      issues.push(`${label} has duplicate id: ${item.id}`);
    }
    ids.add(item.id);
  }
  return ids;
}

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function validFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

/** Validate the complete host-owned advice artifact. No partial artifact is returned. */
export function validateAdviceContract(contract: AdviceContract): string[] {
  const issues: string[] = [];
  if (contract.schemaVersion !== ADVICE_CONTRACT_VERSION) {
    issues.push(`unsupported schemaVersion: ${String(contract.schemaVersion)}`);
  }
  if (!isAdviceIdentifier(contract.adviceId)) {
    issues.push('adviceId must be a stable machine-readable identifier');
  }
  if (contract.recommendations.length > 0 && contract.observations.length === 0) {
    issues.push('recommendations require at least one observation');
  }
  if (contract.recommendations.length > 0 && contract.evidence.length === 0) {
    issues.push('recommendations require at least one evidence item');
  }

  const sourceIds = uniqueIds(contract.provenance.sources, 'source', issues);
  const observationIds = uniqueIds(contract.observations, 'observation', issues);
  const evidenceIds = uniqueIds(contract.evidence, 'evidence', issues);
  uniqueIds(contract.recommendations, 'recommendation', issues);

  for (const source of contract.provenance.sources) {
    if (source.window.kind === 'rolling-days') {
      if (!Number.isInteger(source.window.days) || source.window.days < 1) {
        issues.push(`source ${source.id} has an invalid rolling window`);
      }
    }
    for (const flag of source.qualityFlags) {
      if (!isAdviceIdentifier(flag)) {
        issues.push(`source ${source.id} has an invalid quality flag`);
      }
    }
  }

  for (const observation of contract.observations) {
    if (!isAdviceIdentifier(observation.metric)) {
      issues.push(`observation ${observation.id} has an invalid metric`);
    }
    if (typeof observation.value === 'number' && !validFiniteNumber(observation.value)) {
      issues.push(`observation ${observation.id} has a non-finite value`);
    }
    if (!sourceIds.has(observation.sourceId)) {
      issues.push(`observation ${observation.id} references unknown source ${observation.sourceId}`);
    }
    if (!nonEmpty(observation.summary)) {
      issues.push(`observation ${observation.id} has an empty summary`);
    }
  }

  for (const item of contract.evidence) {
    if (item.observationIds.length === 0) {
      issues.push(`evidence ${item.id} must reference an observation`);
    }
    for (const observationId of item.observationIds) {
      if (!observationIds.has(observationId)) {
        issues.push(`evidence ${item.id} references unknown observation ${observationId}`);
      }
    }
    if (!nonEmpty(item.summary)) issues.push(`evidence ${item.id} has an empty summary`);
    if (item.strength === 'proxy' && item.limitations.length === 0) {
      issues.push(`proxy evidence ${item.id} must state a limitation`);
    }
  }

  for (const recommendation of contract.recommendations) {
    if (!nonEmpty(recommendation.title)) {
      issues.push(`recommendation ${recommendation.id} has an empty title`);
    }
    if (recommendation.evidenceIds.length === 0) {
      issues.push(`recommendation ${recommendation.id} must reference evidence`);
    }
    for (const evidenceId of recommendation.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        issues.push(`recommendation ${recommendation.id} references unknown evidence ${evidenceId}`);
      }
    }
    if (!nonEmpty(recommendation.explanation.summary)) {
      issues.push(`recommendation ${recommendation.id} has an empty explanation`);
    }
    for (const observationId of recommendation.explanation.proxyMetricObservationIds) {
      if (!observationIds.has(observationId)) {
        issues.push(`recommendation ${recommendation.id} references unknown proxy ${observationId}`);
      }
    }
    if (
      recommendation.explanation.proxyMetricObservationIds.length > 0 &&
      recommendation.explanation.limitations.length === 0
    ) {
      issues.push(`recommendation ${recommendation.id} must limit its proxy interpretation`);
    }
    if (recommendation.conditionalActions.length === 0) {
      issues.push(`recommendation ${recommendation.id} must include a conditional action`);
    }
    for (const action of recommendation.conditionalActions) {
      if (!nonEmpty(action.when) || !nonEmpty(action.action)) {
        issues.push(`recommendation ${recommendation.id} has an empty condition or action`);
      }
      if (action.evidenceIds.length === 0) {
        issues.push(`recommendation ${recommendation.id} action must reference evidence`);
      }
      for (const evidenceId of action.evidenceIds) {
        if (!evidenceIds.has(evidenceId)) {
          issues.push(`recommendation ${recommendation.id} action references unknown evidence ${evidenceId}`);
        }
      }
    }
    if (recommendation.successCriteria.length === 0) {
      issues.push(`recommendation ${recommendation.id} must include a success criterion`);
    }
    for (const criterion of recommendation.successCriteria) {
      if (!observationIds.has(criterion.metricObservationId)) {
        issues.push(
          `recommendation ${recommendation.id} criterion references unknown observation ${criterion.metricObservationId}`
        );
      }
      if (!validFiniteNumber(criterion.target.value) || criterion.target.value < 0) {
        issues.push(`recommendation ${recommendation.id} has an invalid success target`);
      }
      if (!Number.isInteger(criterion.minimumComparableTasks) || criterion.minimumComparableTasks < 2) {
        issues.push(`recommendation ${recommendation.id} needs at least two comparable tasks`);
      }
      const guardrail = criterion.qualityGuardrail;
      if (!isAdviceIdentifier(guardrail.rubricId)) {
        issues.push(`recommendation ${recommendation.id} has an invalid quality rubric`);
      }
      if (
        !validFiniteNumber(guardrail.minimumScore) ||
        guardrail.minimumScore < 0 ||
        guardrail.minimumScore > 1 ||
        !validFiniteNumber(guardrail.maximumRegression) ||
        guardrail.maximumRegression < 0 ||
        guardrail.maximumRegression > 1
      ) {
        issues.push(`recommendation ${recommendation.id} has an invalid quality guardrail`);
      }
    }
  }

  const privacy = contract.privacy;
  if (!Number.isInteger(privacy.promptSampleCount) || privacy.promptSampleCount < 0) {
    issues.push('promptSampleCount must be a non-negative integer');
  }
  if (
    privacy.dataMode === 'local-only' &&
    (privacy.promptSampleConsent !== 'not-applicable' || privacy.promptSampleCount !== 0)
  ) {
    issues.push('local-only advice cannot carry prompt-sample consent or samples');
  }
  if (
    privacy.dataMode === 'aggregates-only' &&
    (privacy.promptSampleConsent !== 'not-granted' || privacy.promptSampleCount !== 0)
  ) {
    issues.push('aggregates-only advice must contain zero prompt samples');
  }
  if (
    privacy.dataMode === 'aggregates-with-prompt-samples' &&
    (privacy.promptSampleConsent !== 'explicit' || privacy.promptSampleCount < 1)
  ) {
    issues.push('prompt samples require explicit consent and a non-zero sample count');
  }

  if (!nonEmpty(contract.provenance.locale)) issues.push('provenance locale is required');
  if (!Number.isFinite(Date.parse(contract.provenance.generatedAt))) {
    issues.push('provenance generatedAt must be an ISO-compatible timestamp');
  }
  if (
    contract.provenance.generatedBy.modelFamily !== undefined &&
    !isAdviceIdentifier(contract.provenance.generatedBy.modelFamily)
  ) {
    issues.push('provenance modelFamily must be coarse and machine-readable');
  }

  return issues;
}

/** Assemble host metadata with recommendations only after the whole contract validates. */
export function createAdviceContract(input: AdviceContractInput): AdviceContractBuildResult {
  const value: AdviceContract = {
    schemaVersion: ADVICE_CONTRACT_VERSION,
    adviceId: input.adviceId,
    observations: input.observations,
    evidence: input.evidence,
    recommendations: input.recommendations,
    privacy: input.privacy,
    provenance: input.provenance,
  };
  const issues = validateAdviceContract(value);
  return issues.length === 0 ? { ok: true, value } : { ok: false, issues };
}
