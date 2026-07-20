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

function latestLimit(index: CodexIndexV1): ProviderLimitSnapshot | null {
  let latest: ProviderLimitSnapshot | null = null;
  for (const file of Object.values(index.files)) {
    if (file.limit && (!latest || file.limit.observedAt > latest.observedAt)) {
      latest = file.limit;
    }
  }
  return latest;
}

function qualityCounts(index: CodexIndexV1): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of Object.values(index.files)) {
    for (const flag of new Set(file.qualityFlags)) {
      counts[flag] = (counts[flag] ?? 0) + 1;
    }
  }
  return counts;
}

function snapshotFromIndex(
  index: CodexIndexV1,
  sessionTitles: Map<string, string> = new Map(),
): CodexProviderSnapshot {
  const files = Object.values(index.files)
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
  return {
    provider: 'codex',
    total: index.aggregate.total,
    files,
    coverage: index.coverage,
    qualityFlags: qualityCounts(index),
    limit: latestLimit(index),
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
        result.failedFiles > 0 || !result.index.coverage.complete
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
