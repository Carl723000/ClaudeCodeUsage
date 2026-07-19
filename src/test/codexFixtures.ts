import { CodexProviderSnapshot } from '../providers/codex/codexProvider';
import {
  CodexFileAggregate,
  CodexStructuralSummary,
} from '../providers/codex/codexIndex';
import { ProviderTokenCounts } from '../providers/providerTypes';

const EMPTY_STRUCTURAL: CodexStructuralSummary = {
  filesChanged: 0,
  patchRounds: 0,
  commands: 0,
  postChangeCommands: 0,
  compactCount: 0,
  taskCompleteCount: 0,
};

interface FixtureRow {
  sessionKey: string;
  parentSessionKey?: string;
  role: 'root' | 'subagent' | 'approval-reviewer';
  model: string;
  effort: string;
  end: string;
  input: number;
  cached: number;
  output: number;
  reasoning: number;
  projectKey: string;
}

const ROWS: FixtureRow[] = [
  {
    sessionKey: 'session:root-a',
    role: 'root',
    model: 'gpt-5.6-sol',
    effort: 'high',
    end: '2026-07-20T11:00:00.000Z',
    input: 500,
    cached: 400,
    output: 100,
    reasoning: 60,
    projectKey: 'project:a',
  },
  {
    sessionKey: 'session:child-a',
    parentSessionKey: 'session:root-a',
    role: 'subagent',
    model: 'gpt-5.6-sol',
    effort: 'high',
    end: '2026-07-20T11:30:00.000Z',
    input: 500,
    cached: 400,
    output: 100,
    reasoning: 60,
    projectKey: 'project:a',
  },
  {
    sessionKey: 'session:review-old',
    role: 'approval-reviewer',
    model: 'gpt-5.6-sol',
    effort: 'medium',
    end: '2026-07-10T09:00:00.000Z',
    input: 200,
    cached: 100,
    output: 40,
    reasoning: 10,
    projectKey: 'project:a',
  },
  {
    sessionKey: 'session:terra-old',
    role: 'root',
    model: 'gpt-5.6-terra',
    effort: 'medium',
    end: '2026-06-01T09:00:00.000Z',
    input: 100,
    cached: 20,
    output: 20,
    reasoning: 0,
    projectKey: 'project:b',
  },
];

function tokens(row: FixtureRow): ProviderTokenCounts {
  return {
    inputTotal: row.input,
    cachedInput: row.cached,
    outputTotal: row.output,
    reasoningOutput: row.reasoning,
    sourceTotal: row.input + row.output,
  };
}

function aggregate(row: FixtureRow): CodexFileAggregate {
  const total = tokens(row);
  const endedAt = Date.parse(row.end);
  return {
    total,
    byDay: { [row.end.slice(0, 10)]: { ...total } },
    byModel: { [row.model]: { ...total } },
    byEffort: { [row.effort]: { ...total } },
    session: {
      sessionKey: row.sessionKey,
      parentSessionKey: row.parentSessionKey,
      projectKey: row.projectKey,
      role: row.role,
      startedAt: endedAt - 10 * 60_000,
      endedAt,
    },
    structural: { ...EMPTY_STRUCTURAL },
  };
}

function sum(files: CodexFileAggregate[]): ProviderTokenCounts {
  return files.reduce<ProviderTokenCounts>(
    (total, file) => ({
      inputTotal: total.inputTotal + file.total.inputTotal,
      cachedInput: (total.cachedInput ?? 0) + (file.total.cachedInput ?? 0),
      outputTotal: total.outputTotal + file.total.outputTotal,
      reasoningOutput:
        (total.reasoningOutput ?? 0) + (file.total.reasoningOutput ?? 0),
      sourceTotal: (total.sourceTotal ?? 0) + (file.total.sourceTotal ?? 0),
    }),
    {
      inputTotal: 0,
      cachedInput: 0,
      outputTotal: 0,
      reasoningOutput: 0,
      sourceTotal: 0,
    },
  );
}

export function snapshotFixture(): CodexProviderSnapshot {
  const files = ROWS.map(aggregate);
  return {
    provider: 'codex',
    total: sum(files),
    files,
    coverage: {
      indexedFiles: 4,
      totalFiles: 5,
      indexedBytes: 1_300,
      totalBytes: 1_500,
      complete: false,
    },
    qualityFlags: { 'unknown-event': 1 },
    limit: {
      provider: 'codex',
      observedAt: Date.parse('2026-07-20T09:00:00.000Z'),
      source: 'local-log',
      confidence: 'last-observed',
      windows: [
        {
          label: 'primary',
          usedPercent: 42,
          windowMinutes: 300,
          resetsAt: Date.parse('2026-07-20T10:00:00.000Z'),
        },
      ],
    },
  };
}
