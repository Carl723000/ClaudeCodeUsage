import { lstat } from 'node:fs/promises';
import * as path from 'node:path';

import {
  ProviderLimitSnapshot,
  ProviderSourceOutcome,
  ProviderTokenCounts,
} from '../providerTypes';
import {
  CodexFileAggregate,
  CodexIndexCoverage,
  CodexIndexProgress,
  CodexIndexV1,
  createEmptyCodexIndex,
} from './codexIndex';
import { CodexIndexClient } from './codexIndexClient';
import {
  CodexWorkerRefreshInput,
  CodexWorkerResult,
} from './codexWorkerProtocol';
import { loadCodexSessionTitles } from './codexIdentity';
import { classifyCodexSessionDuplicates } from './codexDedup';

export interface CodexProviderOptions extends CodexWorkerRefreshInput {
  enabled: boolean;
}

export interface CodexIndexClientLike {
  refresh(
    input: CodexWorkerRefreshInput,
    onProgress?: (progress: CodexIndexProgress) => void,
  ): Promise<CodexWorkerResult>;
  dispose(): void;
}

export interface CodexProviderSnapshot {
  provider: 'codex';
  total: ProviderTokenCounts;
  files: CodexFileAggregate[];
  coverage: CodexIndexCoverage;
  qualityFlags: Record<string, number>;
  limits: ProviderLimitSnapshot[];
  limit: ProviderLimitSnapshot | null;
}

export interface CodexProviderResult {
  outcome: ProviderSourceOutcome;
  snapshot: CodexProviderSnapshot;
  progress?: CodexIndexProgress;
  diagnostic?: {
    bodyReads: number;
    failedFiles: number;
    metadataMs: number;
    parseMs: number;
  };
}

export type CodexIndexClientFactory = () => CodexIndexClientLike;

function emptySnapshot(): CodexProviderSnapshot {
  return snapshotFromIndex(createEmptyCodexIndex());
}

function latestLimits(
  files: CodexIndexV1['files'][string][],
): ProviderLimitSnapshot[] {
  const latest = new Map<string, ProviderLimitSnapshot>();
  for (const file of files) {
    const snapshots = [
      ...Object.values(file.limits ?? {}),
      ...(file.limit ? [file.limit] : []),
    ];
    for (const snapshot of snapshots) {
      const key = snapshot.limitId ?? snapshot.limitName ?? 'default';
      const current = latest.get(key);
      if (!current || snapshot.observedAt >= current.observedAt) {
        latest.set(key, snapshot);
      }
    }
  }
  return [...latest.values()].sort(
    (left, right) =>
      right.observedAt - left.observedAt ||
      (left.limitName ?? left.limitId ?? '').localeCompare(
        right.limitName ?? right.limitId ?? '',
      ),
  );
}

function qualityCounts(
  files: CodexIndexV1['files'][string][],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of files) {
    for (const flag of new Set(file.qualityFlags)) {
      counts[flag] = (counts[flag] ?? 0) + 1;
    }
  }
  return counts;
}

function aggregateTotal(
  files: CodexIndexV1['files'][string][],
): ProviderTokenCounts {
  const total: ProviderTokenCounts = {
    inputTotal: 0,
    cachedInput: 0,
    cacheWriteInput: 0,
    outputTotal: 0,
    reasoningOutput: 0,
    sourceTotal: 0,
  };
  for (const file of files) {
    total.inputTotal += Math.max(0, file.aggregate.total.inputTotal);
    total.cachedInput = (total.cachedInput ?? 0) +
      Math.max(0, file.aggregate.total.cachedInput ?? 0);
    total.cacheWriteInput = (total.cacheWriteInput ?? 0) +
      Math.max(0, file.aggregate.total.cacheWriteInput ?? 0);
    total.outputTotal += Math.max(0, file.aggregate.total.outputTotal);
    total.reasoningOutput = (total.reasoningOutput ?? 0) +
      Math.max(0, file.aggregate.total.reasoningOutput ?? 0);
    total.sourceTotal = (total.sourceTotal ?? 0) +
      Math.max(0, file.aggregate.total.sourceTotal ?? 0);
  }
  return total;
}

function snapshotFromIndex(
  index: CodexIndexV1,
  sessionTitles: Map<string, string> = new Map(),
): CodexProviderSnapshot {
  const canonicalFileKeys = classifyCodexSessionDuplicates(
    index.files,
  ).canonicalFileKeys;
  const contributions = [...canonicalFileKeys]
    .map((fileKey) => index.files[fileKey])
    .filter((file): file is CodexIndexV1['files'][string] => file !== undefined);
  const files = contributions
    .map((file) => ({
      ...file.aggregate,
      session: {
        ...file.aggregate.session,
        sessionTitle: sessionTitles.get(file.aggregate.session.sessionKey),
      },
    }))
    .sort(
      (left, right) =>
        (right.session.startedAt ?? 0) - (left.session.startedAt ?? 0),
    );
  const limits = latestLimits(contributions);
  return {
    provider: 'codex',
    total: aggregateTotal(contributions),
    files,
    coverage: index.coverage,
    qualityFlags: qualityCounts(contributions),
    limits,
    limit: limits[0] ?? null,
  };
}

async function directoryExistsWithoutSymlink(directory: string): Promise<boolean> {
  try {
    const info = await lstat(directory);
    return info.isDirectory() && !info.isSymbolicLink();
  } catch {
    return false;
  }
}

export class CodexProvider {
  private client: CodexIndexClientLike | null = null;
  private currentSnapshot: CodexProviderSnapshot | null = null;
  private lastProgress: CodexIndexProgress | undefined;

  constructor(
    private readonly options: CodexProviderOptions,
    private readonly clientFactory: CodexIndexClientFactory = () =>
      new CodexIndexClient(),
  ) {}

  async isAvailable(): Promise<boolean> {
    if (!this.options.enabled) {
      return false;
    }
    const [sessions, archive] = await Promise.all([
      directoryExistsWithoutSymlink(path.join(this.options.codexHome, 'sessions')),
      directoryExistsWithoutSymlink(
        path.join(this.options.codexHome, 'archived_sessions'),
      ),
    ]);
    return sessions || archive;
  }

  async refresh(): Promise<CodexProviderResult> {
    if (!(await this.isAvailable())) {
      return {
        outcome: 'unavailable',
        snapshot: this.currentSnapshot ?? emptySnapshot(),
      };
    }
    this.client ??= this.clientFactory();
    this.lastProgress = undefined;
    try {
      const result = await this.client.refresh(
        {
          codexHome: this.options.codexHome,
          indexPath: this.options.indexPath,
          salt: this.options.salt,
        },
        (progress) => {
          this.lastProgress = progress;
        },
      );
      const sessionTitles = await loadCodexSessionTitles(
        this.options.codexHome,
        this.options.salt,
      );
      this.currentSnapshot = snapshotFromIndex(result.index, sessionTitles);
      const outcome: ProviderSourceOutcome =
        result.failedFiles > 0 ||
          !result.index.coverage.complete ||
          !result.index.coverage.identity.complete
          ? 'partial'
          : 'success';
      return {
        outcome,
        snapshot: this.currentSnapshot,
        progress: this.lastProgress,
        diagnostic: {
          bodyReads: result.bodyReads,
          failedFiles: result.failedFiles,
          metadataMs: result.metadataMs,
          parseMs: result.parseMs,
        },
      };
    } catch {
      return {
        outcome: 'error',
        snapshot: this.currentSnapshot ?? emptySnapshot(),
        progress: this.lastProgress,
      };
    }
  }

  snapshot(): CodexProviderSnapshot | null {
    return this.currentSnapshot;
  }

  dispose(): void {
    this.client?.dispose();
    this.client = null;
  }
}
