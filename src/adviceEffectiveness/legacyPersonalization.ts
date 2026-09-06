import {
  MAX_PROMPT_SAMPLES,
  MAX_PROMPT_SAMPLE_CHARS,
  MAX_PROMPT_SAMPLE_TOTAL_CHARS,
} from './payload';

export const LEGACY_PERSONALIZATION_MIGRATION_VERSION = 1 as const;
export const MAX_LEGACY_USER_CONTEXT_CHARS = 1_000;

export type LegacyPromptSampleAge = 'within-window' | 'older-than-window' | 'unknown';

export interface LegacyPersonalizationMigrationSummary {
  requiresExplicitPromptPersonalizationConsent: boolean;
  userContextChars: number;
  userContextTruncated: boolean;
  promptSampleCount: number;
  promptSamplesTruncated: boolean;
  sampleAge: {
    withinWindow: number;
    olderThanWindow: number;
    unknown: number;
  };
}

export interface LegacyPersonalizationDraft {
  schemaVersion: typeof LEGACY_PERSONALIZATION_MIGRATION_VERSION;
  windowDays: number;
  userContext?: string;
  promptSamples: { text: string; age: LegacyPromptSampleAge }[];
  /** Content-free metadata safe for migration/status UI. */
  migration: LegacyPersonalizationMigrationSummary;
}

export interface LegacyPersonalizationProjection {
  schemaVersion: typeof LEGACY_PERSONALIZATION_MIGRATION_VERSION;
  consent: 'explicit';
  windowDays: number;
  userContext?: string;
  promptSamples: { text: string; age: LegacyPromptSampleAge }[];
}

export type BuildLegacyPersonalizationDraftResult =
  | { ok: true; value: LegacyPersonalizationDraft }
  | { ok: false; reason: 'invalid-legacy-personalization' };

interface LegacyPromptSampleInput {
  text?: unknown;
  observedAtEpochMs?: unknown;
  [key: string]: unknown;
}

export interface LegacyPersonalizationInput {
  promptWindowDays: unknown;
  userContext: unknown;
  promptSamples: unknown;
  nowEpochMs: unknown;
}

function invalid(): BuildLegacyPersonalizationDraftResult {
  return { ok: false, reason: 'invalid-legacy-personalization' };
}

function sampleAge(
  observedAtEpochMs: number | undefined,
  cutoffEpochMs: number,
): LegacyPromptSampleAge {
  if (observedAtEpochMs === undefined) return 'unknown';
  return observedAtEpochMs >= cutoffEpochMs ? 'within-window' : 'older-than-window';
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).sort().join('\0') === [...expected].sort().join('\0');
}

function validDraft(value: unknown): value is LegacyPersonalizationDraft {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const draft = value as Record<string, unknown>;
  const rootKeys = ['migration', 'promptSamples', 'schemaVersion', 'windowDays'];
  if (draft.userContext !== undefined) rootKeys.push('userContext');
  if (!hasExactKeys(draft, rootKeys)) return false;
  if (
    draft.schemaVersion !== LEGACY_PERSONALIZATION_MIGRATION_VERSION ||
    typeof draft.windowDays !== 'number' ||
    !Number.isInteger(draft.windowDays) ||
    draft.windowDays < 1 ||
    draft.windowDays > 365 ||
    (draft.userContext !== undefined &&
      (typeof draft.userContext !== 'string' ||
        draft.userContext.length < 1 ||
        draft.userContext.length > MAX_LEGACY_USER_CONTEXT_CHARS ||
        draft.userContext.trim() !== draft.userContext)) ||
    !Array.isArray(draft.promptSamples) ||
    draft.promptSamples.length > MAX_PROMPT_SAMPLES
  ) {
    return false;
  }

  const sampleAgeCounts = { withinWindow: 0, olderThanWindow: 0, unknown: 0 };
  let totalChars = 0;
  for (const candidate of draft.promptSamples) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) return false;
    const sample = candidate as Record<string, unknown>;
    if (
      !hasExactKeys(sample, ['age', 'text']) ||
      typeof sample.text !== 'string' ||
      sample.text.length < 1 ||
      sample.text.length > MAX_PROMPT_SAMPLE_CHARS ||
      sample.text.trim() !== sample.text ||
      (sample.age !== 'within-window' && sample.age !== 'older-than-window' && sample.age !== 'unknown')
    ) {
      return false;
    }
    totalChars += sample.text.length;
    if (totalChars > MAX_PROMPT_SAMPLE_TOTAL_CHARS) return false;
    sampleAgeCounts[
      sample.age === 'within-window'
        ? 'withinWindow'
        : sample.age === 'older-than-window'
          ? 'olderThanWindow'
          : 'unknown'
    ] += 1;
  }

  if (typeof draft.migration !== 'object' || draft.migration === null || Array.isArray(draft.migration)) {
    return false;
  }
  const migration = draft.migration as Record<string, unknown>;
  if (!hasExactKeys(migration, [
    'promptSampleCount',
    'promptSamplesTruncated',
    'requiresExplicitPromptPersonalizationConsent',
    'sampleAge',
    'userContextChars',
    'userContextTruncated',
  ])) {
    return false;
  }
  if (
    migration.requiresExplicitPromptPersonalizationConsent !==
      (draft.userContext !== undefined || draft.promptSamples.length > 0) ||
    migration.userContextChars !== (draft.userContext?.length ?? 0) ||
    typeof migration.userContextTruncated !== 'boolean' ||
    migration.promptSampleCount !== draft.promptSamples.length ||
    typeof migration.promptSamplesTruncated !== 'boolean' ||
    typeof migration.sampleAge !== 'object' ||
    migration.sampleAge === null ||
    Array.isArray(migration.sampleAge)
  ) {
    return false;
  }
  const ages = migration.sampleAge as Record<string, unknown>;
  return (
    hasExactKeys(ages, ['olderThanWindow', 'unknown', 'withinWindow']) &&
    ages.withinWindow === sampleAgeCounts.withinWindow &&
    ages.olderThanWindow === sampleAgeCounts.olderThanWindow &&
    ages.unknown === sampleAgeCounts.unknown
  );
}

/**
 * Rebuild the old settings/content into a host-only, bounded draft. Extra
 * runtime fields (cwd, session IDs, paths) have no destination. No projection
 * is returned until the new prompt-personalization consent is explicit.
 */
export function buildLegacyPersonalizationDraft(
  input: LegacyPersonalizationInput,
): BuildLegacyPersonalizationDraftResult {
  if (
    typeof input !== 'object' ||
    input === null ||
    typeof input.promptWindowDays !== 'number' ||
    !Number.isInteger(input.promptWindowDays) ||
    input.promptWindowDays < 1 ||
    input.promptWindowDays > 365 ||
    typeof input.nowEpochMs !== 'number' ||
    !Number.isFinite(input.nowEpochMs) ||
    input.nowEpochMs < 0 ||
    typeof input.userContext !== 'string' ||
    !Array.isArray(input.promptSamples)
  ) {
    return invalid();
  }

  const nowEpochMs = input.nowEpochMs;
  const cutoffEpochMs = nowEpochMs - input.promptWindowDays * 86_400_000;
  const rawContext = input.userContext.trim();
  const userContext = rawContext.slice(0, MAX_LEGACY_USER_CONTEXT_CHARS);
  const promptSamples: LegacyPersonalizationDraft['promptSamples'] = [];
  let totalChars = 0;
  let promptSamplesTruncated = input.promptSamples.length > MAX_PROMPT_SAMPLES;
  const ages = { withinWindow: 0, olderThanWindow: 0, unknown: 0 };

  const candidates = input.promptSamples.slice(0, MAX_PROMPT_SAMPLES) as LegacyPromptSampleInput[];
  for (const candidate of candidates) {
    if (typeof candidate !== 'object' || candidate === null || typeof candidate.text !== 'string') {
      return invalid();
    }
    let observedAtEpochMs: number | undefined;
    if (candidate.observedAtEpochMs !== undefined) {
      if (
        typeof candidate.observedAtEpochMs !== 'number' ||
        !Number.isFinite(candidate.observedAtEpochMs) ||
        candidate.observedAtEpochMs < 0 ||
        candidate.observedAtEpochMs > nowEpochMs
      ) {
        return invalid();
      }
      observedAtEpochMs = candidate.observedAtEpochMs;
    }

    const trimmed = candidate.text.trim();
    if (trimmed.length === 0) {
      promptSamplesTruncated = true;
      continue;
    }
    const individuallyBounded = trimmed.slice(0, MAX_PROMPT_SAMPLE_CHARS);
    const remaining = MAX_PROMPT_SAMPLE_TOTAL_CHARS - totalChars;
    if (remaining <= 0) {
      promptSamplesTruncated = true;
      break;
    }
    const text = individuallyBounded.slice(0, remaining);
    if (text.length !== candidate.text.length || text.length !== trimmed.length) {
      promptSamplesTruncated = true;
    }
    const age = sampleAge(observedAtEpochMs, cutoffEpochMs);
    ages[age === 'within-window' ? 'withinWindow' : age === 'older-than-window' ? 'olderThanWindow' : 'unknown'] += 1;
    promptSamples.push({ text, age });
    totalChars += text.length;
    if (text.length < individuallyBounded.length) {
      promptSamplesTruncated = true;
      break;
    }
  }
  if (promptSamples.length < input.promptSamples.length) promptSamplesTruncated = true;

  const effectiveContext = userContext.length > 0 ? userContext : undefined;
  return {
    ok: true,
    value: {
      schemaVersion: LEGACY_PERSONALIZATION_MIGRATION_VERSION,
      windowDays: input.promptWindowDays,
      ...(effectiveContext === undefined ? {} : { userContext: effectiveContext }),
      promptSamples,
      migration: {
        requiresExplicitPromptPersonalizationConsent:
          effectiveContext !== undefined || promptSamples.length > 0,
        userContextChars: effectiveContext?.length ?? 0,
        userContextTruncated: rawContext.length > MAX_LEGACY_USER_CONTEXT_CHARS,
        promptSampleCount: promptSamples.length,
        promptSamplesTruncated,
        sampleAge: ages,
      },
    },
  };
}

/**
 * Create the exact future payload addendum only after separate consent. The
 * current v2.3.1 prototype deliberately has no production caller.
 */
export function projectLegacyPersonalization(
  draft: unknown,
  consent: unknown,
): LegacyPersonalizationProjection | undefined {
  if (consent !== 'explicit' || !validDraft(draft)) {
    return undefined;
  }
  return {
    schemaVersion: LEGACY_PERSONALIZATION_MIGRATION_VERSION,
    consent: 'explicit',
    windowDays: draft.windowDays,
    ...(draft.userContext === undefined ? {} : { userContext: draft.userContext }),
    promptSamples: draft.promptSamples.map((sample) => ({ ...sample })),
  };
}
