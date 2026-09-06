import type {
  CodexInsight,
  CodexInsightKind,
} from '../providers/codex/codexInsights';
import type { CodexScope } from '../types';
import {
  AdviceContract,
  AdviceEvidence,
  AdviceObservation,
  AdviceRecommendation,
  AdviceScope,
  AdviceSourceInfo,
  AdviceWindow,
  createAdviceContract,
  isAdviceIdentifier,
} from './contract';
import {
  AdviceAggregateSnapshot,
  validateAdviceAggregateSnapshot,
} from './payload';

/** Pre-declared local-rule threshold; both the count and share must hold. */
export const CLAUDE_CLEAR_MIN_AFFECTED_SESSIONS = 2;
export const CLAUDE_CLEAR_MIN_AFFECTED_SHARE = 0.25;

const MIN_COMPARABLE_TASKS = 5;
const DEFAULT_RELATIVE_TARGET = 0.1;
const QUALITY_GUARDRAIL = {
  rubricId: 'task-quality-rubric-v1',
  minimumScore: 0.8,
  maximumRegression: 0.02,
} as const;

export interface AdviceAdapterMetadata {
  adviceId: string;
  generatedAt: string;
  locale: string;
}

export interface ClaudeAdviceSessionSummary {
  scope: AdviceAggregateSnapshot['scope'];
  windowDays: number;
  /** Numeric aggregate only; no session IDs, titles, paths, or records. */
  totalSessions: number;
  /** Sessions already classified locally as active for at least eight hours. */
  longSessionCount: number;
  /** Sessions already classified locally as observing context above 150k. */
  largeContextSessionCount: number;
}

export interface ClaudeAdviceAdapterInput extends AdviceAdapterMetadata {
  /** Must already represent exactly the same scope/window as sessionSummary. */
  aggregate: AdviceAggregateSnapshot;
  sessionSummary: ClaudeAdviceSessionSummary;
  frameworkOverhead?: {
    frameworkEstimatedTokens: number;
    /** Upstream-owned denominator; the adapter never re-sums content buckets. */
    observedInputEstimatedTokens: number;
    classifiedEvents: number;
  };
}

export interface ClaudeAdviceAdapterOutput {
  aggregate: AdviceAggregateSnapshot;
  contract: AdviceContract;
  remoteEvidenceEligible: true;
}

export interface CodexAdviceBehaviorSummary {
  childFreshShare: number;
  approvalReviewerFreshShare: number;
  highEffortFreshShare: number;
  processedToFreshRatio: number;
  cacheShare: number;
  postPatchToolCallsPerPatchCall: number;
}

export interface CodexAdviceQualitySummary {
  indexComplete: boolean;
  identityComplete: boolean;
  periodComplete: boolean;
  /** Machine-readable provider flags only. */
  qualityFlags: readonly string[];
}

export interface CodexAdviceAdapterInput extends AdviceAdapterMetadata {
  scope: CodexScope;
  insights: readonly CodexInsight[];
  /** Narrow structural aggregate; deliberately excludes task/session/project data. */
  behavior: CodexAdviceBehaviorSummary;
  quality: CodexAdviceQualitySummary;
}

export interface CodexAdviceAdapterOutput {
  contract: AdviceContract;
  /** Codex aggregate payload semantics require a separate future review. */
  remoteEvidenceEligible: false;
}

export type AdviceAdapterBuildResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: string[] };

function cloneAggregate(input: AdviceAggregateSnapshot): AdviceAggregateSnapshot | undefined {
  try {
    const value: AdviceAggregateSnapshot = {
      scope: input.scope,
      windowDays: input.windowDays,
      totals: {
        inputTokens: input.totals.inputTokens,
        outputTokens: input.totals.outputTokens,
        cacheCreationTokens: input.totals.cacheCreationTokens,
        cacheReadTokens: input.totals.cacheReadTokens,
        messageCount: input.totals.messageCount,
        estimatedCostUsd: input.totals.estimatedCostUsd,
      },
      modelFamilies: input.modelFamilies.map((row) => ({
        family: row.family,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        cacheCreationTokens: row.cacheCreationTokens,
        cacheReadTokens: row.cacheReadTokens,
        count: row.count,
      })),
    };
    validateAdviceAggregateSnapshot(value);
    return value;
  } catch {
    return undefined;
  }
}

function validCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function validFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function validShare(value: number): boolean {
  return validFiniteNonNegative(value) && value <= 1;
}

function localPrivacy() {
  return {
    dataMode: 'local-only' as const,
    promptSampleConsent: 'not-applicable' as const,
    promptSampleCount: 0,
    feedbackStorage: 'local-only' as const,
  };
}

function successCriterion(
  metricObservationId: string,
  direction: 'increase' | 'decrease' | 'maintain' = 'decrease',
) {
  return {
    metricObservationId,
    direction,
    target: { kind: 'relative-change' as const, value: DEFAULT_RELATIVE_TARGET },
    minimumComparableTasks: MIN_COMPARABLE_TASKS,
    qualityGuardrail: { ...QUALITY_GUARDRAIL },
  };
}

function adapterFailure(...issues: string[]): AdviceAdapterBuildResult<never> {
  return { ok: false, issues };
}

/**
 * Map one already-windowed Claude aggregate into a complete local advice
 * contract. No raw-record type is accepted at this boundary.
 */
export function adaptClaudeAdvice(
  input: ClaudeAdviceAdapterInput,
): AdviceAdapterBuildResult<ClaudeAdviceAdapterOutput> {
  const aggregate = cloneAggregate(input.aggregate);
  if (!aggregate) return adapterFailure('claude-aggregate-invalid');
  const summary = input.sessionSummary;
  if (summary.scope !== aggregate.scope || summary.windowDays !== aggregate.windowDays) {
    return adapterFailure('claude-session-summary-scope-window-mismatch');
  }
  if (
    !validCount(summary.totalSessions) ||
    !validCount(summary.longSessionCount) ||
    !validCount(summary.largeContextSessionCount) ||
    summary.longSessionCount > summary.totalSessions ||
    summary.largeContextSessionCount > summary.totalSessions
  ) {
    return adapterFailure('claude-session-summary-invalid');
  }
  const framework = input.frameworkOverhead;
  if (
    framework !== undefined &&
    (!validFiniteNonNegative(framework.frameworkEstimatedTokens) ||
      !validFiniteNonNegative(framework.observedInputEstimatedTokens) ||
      !validCount(framework.classifiedEvents) ||
      framework.frameworkEstimatedTokens > framework.observedInputEstimatedTokens)
  ) {
    return adapterFailure('claude-framework-overhead-invalid');
  }

  const aggregateSource: AdviceSourceInfo = {
    id: 'source-claude-usage-aggregate',
    kind: 'claude-usage-aggregate',
    scope: aggregate.scope,
    window: { kind: 'rolling-days', days: aggregate.windowDays },
    confidence: 'high',
    qualityFlags: [],
  };
  const sessionSource: AdviceSourceInfo = {
    id: 'source-claude-session-summary',
    kind: 'claude-local-insight',
    scope: aggregate.scope,
    window: { kind: 'rolling-days', days: aggregate.windowDays },
    confidence: 'high',
    qualityFlags: [],
  };
  const frameworkSource: AdviceSourceInfo | undefined =
    framework === undefined || framework.observedInputEstimatedTokens === 0
    ? undefined
    : {
        id: 'source-claude-framework-summary',
        kind: 'claude-local-insight',
        scope: aggregate.scope,
        window: { kind: 'rolling-days', days: aggregate.windowDays },
        confidence: 'high',
        qualityFlags: [],
      };

  const observations: AdviceObservation[] = [
    {
      id: 'observation-claude-input-tokens',
      metric: 'input-tokens',
      value: aggregate.totals.inputTokens,
      unit: 'tokens',
      method: 'measured',
      sourceId: aggregateSource.id,
      summary: 'advice.observation.claude.input-tokens',
    },
    {
      id: 'observation-claude-output-tokens',
      metric: 'output-tokens',
      value: aggregate.totals.outputTokens,
      unit: 'tokens',
      method: 'measured',
      sourceId: aggregateSource.id,
      summary: 'advice.observation.claude.output-tokens',
    },
    {
      id: 'observation-claude-cache-creation-tokens',
      metric: 'cache-creation-tokens',
      value: aggregate.totals.cacheCreationTokens,
      unit: 'tokens',
      method: 'measured',
      sourceId: aggregateSource.id,
      summary: 'advice.observation.claude.cache-creation-tokens',
    },
    {
      id: 'observation-claude-cache-read-tokens',
      metric: 'cache-read-tokens',
      value: aggregate.totals.cacheReadTokens,
      unit: 'tokens',
      method: 'measured',
      sourceId: aggregateSource.id,
      summary: 'advice.observation.claude.cache-read-tokens',
    },
    {
      id: 'observation-claude-message-count',
      metric: 'message-count',
      value: aggregate.totals.messageCount,
      unit: 'count',
      method: 'measured',
      sourceId: aggregateSource.id,
      summary: 'advice.observation.claude.message-count',
    },
    {
      id: 'observation-claude-estimated-cost',
      metric: 'estimated-cost-usd',
      value: aggregate.totals.estimatedCostUsd,
      unit: 'usd-estimate',
      method: 'estimated',
      sourceId: aggregateSource.id,
      summary: 'advice.observation.claude.estimated-cost-usd',
    },
  ];
  const longShare = summary.totalSessions > 0
    ? summary.longSessionCount / summary.totalSessions
    : 0;
  const contextShare = summary.totalSessions > 0
    ? summary.largeContextSessionCount / summary.totalSessions
    : 0;
  const longObservation: AdviceObservation = {
    id: 'observation-claude-long-session-share',
    metric: 'long-session-share',
    value: longShare,
    unit: 'ratio',
    method: 'structural-proxy',
    sourceId: sessionSource.id,
    summary: 'advice.observation.claude.long-session-share',
  };
  const contextObservation: AdviceObservation = {
    id: 'observation-claude-large-context-share',
    metric: 'large-context-share',
    value: contextShare,
    unit: 'ratio',
    method: 'structural-proxy',
    sourceId: sessionSource.id,
    summary: 'advice.observation.claude.large-context-share',
  };
  observations.push(longObservation, contextObservation);

  const aggregateEvidence: AdviceEvidence = {
    id: 'evidence-claude-usage-aggregate',
    observationIds: observations.slice(0, 6).map((item) => item.id),
    strength: 'direct',
    summary: 'advice.evidence.claude.usage-aggregate',
    limitations: [],
  };
  const longEvidence: AdviceEvidence = {
    id: 'evidence-claude-long-session-share',
    observationIds: [longObservation.id],
    strength: 'proxy',
    summary: 'advice.evidence.claude.long-session-share',
    limitations: ['advice.limitation.claude.session-duration-proxy'],
  };
  const contextEvidence: AdviceEvidence = {
    id: 'evidence-claude-large-context-share',
    observationIds: [contextObservation.id],
    strength: 'proxy',
    summary: 'advice.evidence.claude.large-context-share',
    limitations: ['advice.limitation.claude.context-size-proxy'],
  };
  const evidence = [aggregateEvidence, longEvidence, contextEvidence];
  if (framework && frameworkSource) {
    const denominator = framework.observedInputEstimatedTokens;
    const frameworkObservation: AdviceObservation = {
      id: 'observation-claude-framework-overhead-share',
      metric: 'framework-overhead-share',
      value: framework.frameworkEstimatedTokens / denominator,
      unit: 'ratio',
      method: 'structural-proxy',
      sourceId: frameworkSource.id,
      summary: 'advice.observation.claude.framework-overhead-share',
    };
    observations.push(frameworkObservation);
    evidence.push({
      id: 'evidence-claude-framework-overhead-share',
      observationIds: [frameworkObservation.id],
      strength: 'proxy',
      summary: 'advice.evidence.claude.framework-overhead-share',
      limitations: ['advice.limitation.claude.framework-overlay-proxy'],
    });
  }

  const longTriggered =
    summary.longSessionCount >= CLAUDE_CLEAR_MIN_AFFECTED_SESSIONS &&
    longShare >= CLAUDE_CLEAR_MIN_AFFECTED_SHARE;
  const contextTriggered =
    summary.largeContextSessionCount >= CLAUDE_CLEAR_MIN_AFFECTED_SESSIONS &&
    contextShare >= CLAUDE_CLEAR_MIN_AFFECTED_SHARE;
  const triggered = [
    ...(longTriggered ? [{ evidence: longEvidence, observation: longObservation }] : []),
    ...(contextTriggered ? [{ evidence: contextEvidence, observation: contextObservation }] : []),
  ];
  const recommendations: AdviceRecommendation[] = triggered.length === 0
    ? []
    : [
        {
          id: 'recommendation-claude-clear-between-tasks',
          title: 'advice.recommendation.claude.clear-between-unrelated-tasks',
          evidenceIds: triggered.map((item) => item.evidence.id),
          explanation: {
            summary: 'advice.explanation.claude.clear-is-conditional',
            proxyMetricObservationIds: triggered.map((item) => item.observation.id),
            limitations: ['advice.limitation.claude.clear-not-causal'],
          },
          conditionalActions: [
            {
              when: 'advice.condition.claude.next-task-is-unrelated',
              action: '/clear',
              evidenceIds: triggered.map((item) => item.evidence.id),
              stopCondition: 'advice.stop.claude.prior-context-still-required',
            },
          ],
          successCriteria: triggered.map((item) => successCriterion(item.observation.id)),
        },
      ];

  const built = createAdviceContract({
    adviceId: input.adviceId,
    observations,
    evidence,
    recommendations,
    privacy: localPrivacy(),
    provenance: {
      generatedBy: { kind: 'local-rules' },
      generatedAt: input.generatedAt,
      locale: input.locale,
      sources: [
        aggregateSource,
        sessionSource,
        ...(frameworkSource ? [frameworkSource] : []),
      ],
    },
  });
  if (!built.ok) return { ok: false, issues: built.issues };
  return {
    ok: true,
    value: { aggregate, contract: built.value, remoteEvidenceEligible: true },
  };
}

const CODEX_KINDS = new Set<CodexInsightKind>([
  'multi-agent-share',
  'effort-comparison',
  'post-patch-tool-intensity',
  'cache-context',
  'approval-reviewer-share',
]);

function codexScope(scope: CodexScope): { scope: AdviceScope; window: AdviceWindow } {
  if (scope === 'recent') return { scope: 'task-cohort', window: { kind: 'task-cohort' } };
  if (scope === '7d') return { scope: 'overall', window: { kind: 'rolling-days', days: 7 } };
  if (scope === '30d') return { scope: 'overall', window: { kind: 'rolling-days', days: 30 } };
  return { scope: 'overall', window: { kind: 'all-time' } };
}

function codexSignal(
  kind: CodexInsightKind,
  behavior: CodexAdviceBehaviorSummary,
  sourceId: string,
): {
  observations: AdviceObservation[];
  evidence: AdviceEvidence;
  recommendation: AdviceRecommendation;
} {
  const observation = (
    suffix: string,
    metric: string,
    value: number,
    unit: 'ratio' | 'multiple',
  ): AdviceObservation => ({
    id: `observation-codex-${suffix}`,
    metric,
    value,
    unit,
    method: 'structural-proxy',
    sourceId,
    summary: `advice.observation.codex.${suffix}`,
  });
  let observations: AdviceObservation[];
  if (kind === 'multi-agent-share') {
    observations = [observation('subagent-share', 'subagent-share', behavior.childFreshShare, 'ratio')];
  } else if (kind === 'effort-comparison') {
    observations = [observation('high-effort-share', 'high-effort-share', behavior.highEffortFreshShare, 'ratio')];
  } else if (kind === 'post-patch-tool-intensity') {
    observations = [
      observation(
        'post-patch-tool-intensity',
        'post-patch-tool-intensity',
        behavior.postPatchToolCallsPerPatchCall,
        'multiple',
      ),
    ];
  } else if (kind === 'cache-context') {
    observations = [
      observation(
        'processed-to-fresh-ratio',
        'processed-to-fresh-ratio',
        behavior.processedToFreshRatio,
        'multiple',
      ),
      observation('cache-read-share', 'cache-read-share', behavior.cacheShare, 'ratio'),
    ];
  } else {
    observations = [
      observation(
        'approval-reviewer-share',
        'approval-reviewer-share',
        behavior.approvalReviewerFreshShare,
        'ratio',
      ),
    ];
  }
  const evidence: AdviceEvidence = {
    id: `evidence-codex-${kind}`,
    observationIds: observations.map((item) => item.id),
    strength: 'proxy',
    summary: `advice.evidence.codex.${kind}`,
    limitations: ['advice.limitation.codex.structural-proxy'],
  };
  const recommendation: AdviceRecommendation = {
    id: `recommendation-codex-${kind}`,
    title: `advice.recommendation.codex.${kind}`,
    evidenceIds: [evidence.id],
    explanation: {
      summary: `advice.explanation.codex.${kind}`,
      proxyMetricObservationIds: observations.map((item) => item.id),
      limitations: ['advice.limitation.codex.no-causal-claim'],
    },
    conditionalActions: [
      {
        when: 'advice.condition.codex.next-comparable-task',
        action: `advice.action.codex.${kind}`,
        evidenceIds: [evidence.id],
        stopCondition: 'advice.stop.codex.quality-guardrail-fails',
      },
    ],
    successCriteria: [successCriterion(observations[0].id)],
  };
  return { observations, evidence, recommendation };
}

/** Map R8 structural insights without copying their open evidence object. */
export function adaptCodexLocalAdvice(
  input: CodexAdviceAdapterInput,
): AdviceAdapterBuildResult<CodexAdviceAdapterOutput> {
  const b = input.behavior;
  if (
    !validShare(b.childFreshShare) ||
    !validShare(b.approvalReviewerFreshShare) ||
    !validShare(b.highEffortFreshShare) ||
    !validFiniteNonNegative(b.processedToFreshRatio) ||
    !validShare(b.cacheShare) ||
    !validFiniteNonNegative(b.postPatchToolCallsPerPatchCall)
  ) {
    return adapterFailure('codex-behavior-summary-invalid');
  }
  if (
    typeof input.quality.indexComplete !== 'boolean' ||
    typeof input.quality.identityComplete !== 'boolean' ||
    typeof input.quality.periodComplete !== 'boolean' ||
    !Array.isArray(input.quality.qualityFlags)
  ) {
    return adapterFailure('codex-quality-summary-invalid');
  }
  for (const flag of input.quality.qualityFlags) {
    if (typeof flag !== 'string' || !isAdviceIdentifier(flag)) {
      return adapterFailure('codex-quality-flag-invalid');
    }
  }

  const seen = new Set<CodexInsightKind>();
  for (const insight of input.insights) {
    if (
      !CODEX_KINDS.has(insight.kind) ||
      insight.scope !== input.scope ||
      insight.proxy !== true ||
      seen.has(insight.kind)
    ) {
      return adapterFailure('codex-insight-invalid');
    }
    seen.add(insight.kind);
  }

  const qualityFlags = [
    ...(!input.quality.indexComplete ? ['incomplete-index'] : []),
    ...(!input.quality.identityComplete ? ['incomplete-identity'] : []),
    ...(!input.quality.periodComplete ? ['incomplete-period'] : []),
    ...input.quality.qualityFlags,
  ].filter((flag, index, all) => all.indexOf(flag) === index);
  const mappedScope = codexScope(input.scope);
  const source: AdviceSourceInfo = {
    id: `source-codex-local-insight-${input.scope}`,
    kind: 'codex-local-insight',
    scope: mappedScope.scope,
    window: mappedScope.window,
    confidence: qualityFlags.length === 0 ? 'high' : 'unknown',
    qualityFlags,
  };
  const signals = input.insights.map((insight) => codexSignal(insight.kind, b, source.id));
  const observations = signals.flatMap((signal) => signal.observations);
  const evidence = signals.map((signal) => signal.evidence);
  const recommendations = source.confidence === 'high'
    ? signals.map((signal) => signal.recommendation)
    : [];
  const built = createAdviceContract({
    adviceId: input.adviceId,
    observations,
    evidence,
    recommendations,
    privacy: localPrivacy(),
    provenance: {
      generatedBy: { kind: 'local-rules' },
      generatedAt: input.generatedAt,
      locale: input.locale,
      sources: [source],
    },
  });
  if (!built.ok) return { ok: false, issues: built.issues };
  return {
    ok: true,
    value: { contract: built.value, remoteEvidenceEligible: false },
  };
}
