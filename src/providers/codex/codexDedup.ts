import type { ProviderTokenCounts } from '../providerTypes';
import type { CodexFileContribution } from './codexIndex';

export interface CodexDeduplication {
  canonicalFileKeys: Set<string>;
  exactDuplicateFileKeys: Set<string>;
  ambiguousSessionGroups: number;
}

type StableNumber = number | null;

function stableNumber(value: number | undefined): StableNumber {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function tokenSignature(tokens: ProviderTokenCounts): StableNumber[] {
  return [
    stableNumber(tokens.inputTotal),
    stableNumber(tokens.cachedInput),
    stableNumber(tokens.cacheWriteInput),
    stableNumber(tokens.outputTotal),
    stableNumber(tokens.reasoningOutput),
    stableNumber(tokens.sourceTotal),
  ];
}

function bucketSignature(
  buckets: Record<string, ProviderTokenCounts>,
): Array<[string, StableNumber[]]> {
  return Object.entries(buckets)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, tokens]) => [key, tokenSignature(tokens)]);
}

function contributionSignature(contribution: CodexFileContribution): string {
  const { aggregate } = contribution;
  const { session, structural } = aggregate;
  return JSON.stringify([
    tokenSignature(aggregate.total),
    bucketSignature(aggregate.byModel),
    bucketSignature(aggregate.byEffort),
    session.parentSessionKey ?? null,
    session.projectKey ?? null,
    session.role,
    stableNumber(session.startedAt),
    stableNumber(session.endedAt),
    stableNumber(structural.patchCalls),
    stableNumber(structural.toolCalls),
    stableNumber(structural.postPatchToolCalls),
    stableNumber(structural.compactCount),
    stableNumber(structural.taskCompleteCount),
  ]);
}

function isVerified(contribution: CodexFileContribution): boolean {
  return (
    contribution.offset === contribution.size &&
    !contribution.discardingOversizedLine
  );
}

export function classifyCodexSessionDuplicates(
  files: Readonly<Record<string, CodexFileContribution>>,
): CodexDeduplication {
  const canonicalFileKeys = new Set(Object.keys(files));
  const exactDuplicateFileKeys = new Set<string>();
  const groups = new Map<string, CodexFileContribution[]>();

  for (const contribution of Object.values(files)) {
    const sessionKey = contribution.aggregate.session.sessionKey;
    if (!sessionKey) {
      continue;
    }
    const group = groups.get(sessionKey) ?? [];
    group.push(contribution);
    groups.set(sessionKey, group);
  }

  let ambiguousSessionGroups = 0;
  for (const group of groups.values()) {
    const active = group.filter((file) => file.sourceArea === 'sessions');
    const archive = group.filter((file) => file.sourceArea === 'archive');
    if (active.length === 0 || archive.length === 0) {
      continue;
    }
    if (
      group.length === 2 &&
      active.length === 1 &&
      archive.length === 1 &&
      isVerified(active[0]) &&
      isVerified(archive[0]) &&
      contributionSignature(active[0]) === contributionSignature(archive[0])
    ) {
      canonicalFileKeys.delete(archive[0].fileKey);
      exactDuplicateFileKeys.add(archive[0].fileKey);
      continue;
    }
    ambiguousSessionGroups += 1;
  }

  return {
    canonicalFileKeys,
    exactDuplicateFileKeys,
    ambiguousSessionGroups,
  };
}
