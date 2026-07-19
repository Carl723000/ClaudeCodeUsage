import { CodexUsageScopeView } from './codexUsage';

export type CodexInsightKind =
  | 'multi-agent-tax'
  | 'effort-comparison'
  | 'post-change-command-intensity'
  | 'cache-context'
  | 'approval-reviewer';

export interface CodexInsight {
  kind: CodexInsightKind;
  severity: 'info' | 'normal' | 'strong';
  evidence: Record<string, number | string>;
  proxy?: boolean;
}

const HIGH_EFFORTS = new Set(['high', 'xhigh', 'max', 'ultra']);

function highEffort(scope: CodexUsageScopeView): string | undefined {
  return scope.efforts.find(
    (effort) => HIGH_EFFORTS.has(effort.key.toLowerCase()) && effort.totals.fresh > 0,
  )?.key;
}

function isSmallChange(scope: CodexUsageScopeView): boolean {
  return (
    scope.structural.filesChanged >= 1 &&
    scope.structural.filesChanged <= 3 &&
    scope.structural.patchRounds >= 1 &&
    scope.structural.patchRounds <= 2
  );
}

export function buildCodexInsights(
  scope: CodexUsageScopeView,
): CodexInsight[] {
  const insights: CodexInsight[] = [];

  if (scope.childThreads >= 3 && scope.childFreshShare >= 0.4) {
    insights.push({
      kind: 'multi-agent-tax',
      severity: scope.childFreshShare >= 0.7 ? 'strong' : 'normal',
      evidence: {
        childThreads: scope.childThreads,
        childProcessedShare: scope.childProcessedShare,
        childFreshShare: scope.childFreshShare,
        durationMs: scope.durationMs,
      },
    });
  }

  const effort = highEffort(scope);
  const evidentParallelShape =
    scope.childThreads >= 3 && scope.childFreshShare >= 0.4;
  if (effort && isSmallChange(scope) && !evidentParallelShape) {
    insights.push({
      kind: 'effort-comparison',
      severity: 'normal',
      evidence: {
        effort,
        filesChanged: scope.structural.filesChanged,
        patchRounds: scope.structural.patchRounds,
        compareOneLevelLower: 1,
      },
    });
  }

  const commandsPerFile =
    scope.structural.filesChanged > 0
      ? scope.structural.commands / scope.structural.filesChanged
      : 0;
  if (
    isSmallChange(scope) &&
    (scope.structural.postChangeCommands >= 5 || commandsPerFile >= 3)
  ) {
    insights.push({
      kind: 'post-change-command-intensity',
      severity:
        scope.structural.postChangeCommands >= 8 || commandsPerFile >= 5
          ? 'strong'
          : 'normal',
      evidence: {
        filesChanged: scope.structural.filesChanged,
        commands: scope.structural.commands,
        postChangeCommands: scope.structural.postChangeCommands,
        commandsPerFile,
      },
      proxy: true,
    });
  }

  const processedFreshRatio =
    scope.total.fresh > 0
      ? scope.total.processed / scope.total.fresh
      : scope.total.processed > 0
        ? scope.total.processed
        : 0;
  if (processedFreshRatio >= 2.5) {
    const splitCandidate =
      scope.total.fresh >= 100_000 &&
      scope.durationMs >= 60 * 60_000 &&
      scope.structural.compactCount >= 1;
    insights.push({
      kind: 'cache-context',
      severity: splitCandidate ? 'normal' : 'info',
      evidence: {
        processedFreshRatio,
        cacheShare: scope.cacheShare,
        fresh: scope.total.fresh,
        durationMs: scope.durationMs,
        compactCount: scope.structural.compactCount,
        splitCandidate: splitCandidate ? 1 : 0,
      },
    });
  }

  if (
    scope.approvalReviewerThreads > 0 &&
    scope.approvalReviewerFreshShare >= 0.2
  ) {
    insights.push({
      kind: 'approval-reviewer',
      severity:
        scope.approvalReviewerFreshShare >= 0.4 ? 'strong' : 'normal',
      evidence: {
        role: 'approval-reviewer',
        threads: scope.approvalReviewerThreads,
        freshShare: scope.approvalReviewerFreshShare,
      },
    });
  }

  return insights;
}

/**
 * Build fixed local guidance from insight kinds only. No prompt, response,
 * command body, or tool arguments are accepted by this function.
 */
export function pasteReadyConstraint(insights: CodexInsight[]): string {
  const kinds = new Set(insights.map((insight) => insight.kind));
  const sentences: string[] = [];
  if (kinds.has('multi-agent-tax') || kinds.has('approval-reviewer')) {
    sentences.push('Do not start unnecessary subagents or independent review passes.');
  }
  if (kinds.has('effort-comparison')) {
    sentences.push('For this small change, compare one lower effort level on a representative task.');
  }
  if (kinds.has('post-change-command-intensity')) {
    sentences.push('Run only one focused test tied to the change, then one full test pass.');
  } else {
    sentences.push('Run one focused test tied to the change, then one full test pass.');
  }
  sentences.push(
    'Stop when the acceptance criteria pass; do not expand this into production-grade hardening.',
  );
  return sentences.join(' ');
}
