import { createHash } from 'node:crypto';
import { UsageData } from '../types';
import {
  ADVICE_CONTRACT_VERSION,
  AdviceEvidence,
  AdviceObservation,
  AdviceSourceInfo,
  isAdviceIdentifier,
} from './contract';

export const ADVICE_REMOTE_PAYLOAD_VERSION = 1 as const;
export const MAX_PROMPT_SAMPLES = 20;
export const MAX_PROMPT_SAMPLE_CHARS = 1_000;
export const MAX_PROMPT_SAMPLE_TOTAL_CHARS = 12_000;
export const MAX_USER_CONTEXT_CHARS = 1_000;

/** Adding a metric here is an explicit remote-data/privacy review point. */
export const REMOTE_ADVICE_METRIC_ALLOWLIST = [
  'approval-reviewer-share',
  'cache-creation-tokens',
  'cache-hit-rate',
  'cache-read-share',
  'cache-read-tokens',
  'estimated-cost-usd',
  'framework-overhead-share',
  'high-effort-share',
  'input-tokens',
  'large-context-share',
  'long-session-share',
  'message-count',
  'multi-agent-share',
  'output-tokens',
  'post-patch-tool-intensity',
  'processed-to-fresh-ratio',
  'quality-score',
  'subagent-share',
  'task-primary-metric',
  'thinking-share',
  'workflow-share',
] as const;

export type AdviceModelFamily = 'opus' | 'sonnet' | 'haiku' | 'fable' | 'other';

export interface AdviceAggregateSnapshot {
  scope: 'overall' | 'project';
  windowDays: number;
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    messageCount: number;
    estimatedCostUsd: number;
  };
  modelFamilies: {
    family: AdviceModelFamily;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    count: number;
  }[];
}

export interface PromptSampleOptIn {
  consent: 'explicit';
  /** Configured context shares the same separate prompt-personalisation consent. */
  userContext?: string;
  /** Only text is accepted. Extra runtime fields such as cwd are discarded. */
  samples: readonly { text: string }[];
}

export interface PrepareAdvicePayloadInput {
  locale: string;
  aggregate: AdviceAggregateSnapshot;
  sources: readonly AdviceSourceInfo[];
  observations: readonly AdviceObservation[];
  evidence: readonly AdviceEvidence[];
  promptSamples?: PromptSampleOptIn;
}

export interface PreparedAdvicePayload {
  contentType: 'application/json';
  dataMode:
    | 'aggregates-only'
    | 'aggregates-with-personalization'
    | 'aggregates-with-prompt-samples';
  promptSampleCount: number;
  /** The one canonical serialization used by both preview and transport. */
  serializedBody: string;
  /** Exact UTF-8 bytes derived once from serializedBody. The sender uses these bytes directly. */
  canonicalBytes: Uint8Array;
  /** SHA-256 of canonicalBytes, lowercase hexadecimal. */
  sha256: string;
}

export interface AdvicePayloadPreview {
  contentType: 'application/json';
  dataMode: PreparedAdvicePayload['dataMode'];
  promptSampleCount: number;
  body: string;
  utf8Bytes: number;
  sha256: string;
}

interface RemoteAdviceRequest {
  schemaVersion: typeof ADVICE_REMOTE_PAYLOAD_VERSION;
  responseContractVersion: typeof ADVICE_CONTRACT_VERSION;
  locale: string;
  aggregate: AdviceAggregateSnapshot;
  signals: {
    sources: {
      id: string;
      kind: AdviceSourceInfo['kind'];
      scope: AdviceSourceInfo['scope'];
      window: AdviceSourceInfo['window'];
      confidence: 'high' | 'medium';
    }[];
    observations: {
      id: string;
      metric: string;
      value: number | boolean;
      unit: AdviceObservation['unit'];
      method: AdviceObservation['method'];
      sourceId: string;
    }[];
    evidence: {
      id: string;
      observationIds: string[];
      strength: AdviceEvidence['strength'];
    }[];
  };
  responseRules: {
    format: 'strict-json';
    unknownFields: 'reject';
    evidenceReferences: 'required';
    qualityGuardrail: 'required';
    hostOwnedFields: ['observations', 'evidence', 'privacy', 'provenance'];
  };
  privacy: {
    dataMode: PreparedAdvicePayload['dataMode'];
    promptSampleConsent: 'not-granted' | 'explicit';
    promptSampleCount: number;
    userContextIncluded: boolean;
  };
  userContext?: string;
  promptSamples?: { id: string; text: string }[];
}

function requireFiniteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number`);
  }
  return value;
}

function requireCount(value: number, label: string): number {
  requireFiniteNonNegative(value, label);
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer`);
  return value;
}

function modelFamily(model: string): AdviceModelFamily {
  const normalized = model.toLowerCase();
  if (normalized.includes('opus')) return 'opus';
  if (normalized.includes('sonnet')) return 'sonnet';
  if (normalized.includes('haiku')) return 'haiku';
  if (normalized.includes('fable')) return 'fable';
  return 'other';
}

/**
 * Convert the existing UsageData aggregate through an explicit allow-list.
 * Full/custom model IDs, project labels, paths, sessions, and prompt content
 * have no destination field and therefore cannot leak through object spreads.
 */
export function buildAdviceAggregateSnapshot(
  usage: UsageData,
  scope: AdviceAggregateSnapshot['scope'],
  windowDays: number
): AdviceAggregateSnapshot {
  if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 3_650) {
    throw new Error('windowDays must be an integer from 1 to 3650');
  }
  const families = new Map<AdviceModelFamily, AdviceAggregateSnapshot['modelFamilies'][number]>();
  for (const model of Object.keys(usage.modelBreakdown)) {
    const row = usage.modelBreakdown[model];
    const family = modelFamily(model);
    const current = families.get(family) || {
      family,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      count: 0,
    };
    current.inputTokens += requireFiniteNonNegative(row.inputTokens, `${family}.inputTokens`);
    current.outputTokens += requireFiniteNonNegative(row.outputTokens, `${family}.outputTokens`);
    current.cacheCreationTokens += requireFiniteNonNegative(
      row.cacheCreationTokens,
      `${family}.cacheCreationTokens`
    );
    current.cacheReadTokens += requireFiniteNonNegative(row.cacheReadTokens, `${family}.cacheReadTokens`);
    current.count += requireCount(row.count, `${family}.count`);
    families.set(family, current);
  }

  return {
    scope,
    windowDays,
    totals: {
      inputTokens: requireFiniteNonNegative(usage.totalInputTokens, 'totalInputTokens'),
      outputTokens: requireFiniteNonNegative(usage.totalOutputTokens, 'totalOutputTokens'),
      cacheCreationTokens: requireFiniteNonNegative(
        usage.totalCacheCreationTokens,
        'totalCacheCreationTokens'
      ),
      cacheReadTokens: requireFiniteNonNegative(usage.totalCacheReadTokens, 'totalCacheReadTokens'),
      messageCount: requireCount(usage.messageCount, 'messageCount'),
      estimatedCostUsd: requireFiniteNonNegative(usage.totalCost, 'totalCost'),
    },
    modelFamilies: Array.from(families.values()).sort((a, b) => a.family.localeCompare(b.family)),
  };
}

export function validateAdviceAggregateSnapshot(aggregate: AdviceAggregateSnapshot): void {
  if (aggregate.scope !== 'overall' && aggregate.scope !== 'project') {
    throw new Error('aggregate scope is invalid');
  }
  if (!Number.isInteger(aggregate.windowDays) || aggregate.windowDays < 1 || aggregate.windowDays > 3_650) {
    throw new Error('aggregate windowDays is invalid');
  }
  requireFiniteNonNegative(aggregate.totals.inputTokens, 'aggregate.inputTokens');
  requireFiniteNonNegative(aggregate.totals.outputTokens, 'aggregate.outputTokens');
  requireFiniteNonNegative(aggregate.totals.cacheCreationTokens, 'aggregate.cacheCreationTokens');
  requireFiniteNonNegative(aggregate.totals.cacheReadTokens, 'aggregate.cacheReadTokens');
  requireCount(aggregate.totals.messageCount, 'aggregate.messageCount');
  requireFiniteNonNegative(aggregate.totals.estimatedCostUsd, 'aggregate.estimatedCostUsd');
  const allowedFamilies = new Set<AdviceModelFamily>(['opus', 'sonnet', 'haiku', 'fable', 'other']);
  const seen = new Set<AdviceModelFamily>();
  for (const row of aggregate.modelFamilies) {
    if (!allowedFamilies.has(row.family) || seen.has(row.family)) {
      throw new Error('aggregate model family is invalid or duplicated');
    }
    seen.add(row.family);
    requireFiniteNonNegative(row.inputTokens, `${row.family}.inputTokens`);
    requireFiniteNonNegative(row.outputTokens, `${row.family}.outputTokens`);
    requireFiniteNonNegative(row.cacheCreationTokens, `${row.family}.cacheCreationTokens`);
    requireFiniteNonNegative(row.cacheReadTokens, `${row.family}.cacheReadTokens`);
    requireCount(row.count, `${row.family}.count`);
  }
}

function validateSignalGraph(input: PrepareAdvicePayloadInput): void {
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(input.locale)) {
    throw new Error('locale must be a BCP-47-style locale code');
  }
  if (input.sources.length === 0 || input.observations.length === 0 || input.evidence.length === 0) {
    throw new Error('evidence-backed advice requires sources, observations, and evidence');
  }
  const sourceIds = new Set<string>();
  for (const source of input.sources) {
    if (!isAdviceIdentifier(source.id) || sourceIds.has(source.id)) throw new Error('invalid source id');
    sourceIds.add(source.id);
    if (source.confidence !== 'high' && source.confidence !== 'medium') {
      throw new Error('remote advice requires high or medium source confidence');
    }
    if (source.qualityFlags.length > 0) {
      throw new Error('remote advice does not accept unresolved source quality flags');
    }
    if (source.window.kind === 'rolling-days') {
      if (!Number.isInteger(source.window.days) || source.window.days < 1) {
        throw new Error('invalid source window');
      }
    }
    for (const flag of source.qualityFlags) {
      if (!isAdviceIdentifier(flag)) throw new Error('invalid source quality flag');
    }
  }
  const observationIds = new Set<string>();
  const allowedMetrics = new Set<string>(REMOTE_ADVICE_METRIC_ALLOWLIST);
  for (const observation of input.observations) {
    if (!isAdviceIdentifier(observation.id) || observationIds.has(observation.id)) {
      throw new Error('invalid observation id');
    }
    observationIds.add(observation.id);
    if (!allowedMetrics.has(observation.metric) || !sourceIds.has(observation.sourceId)) {
      throw new Error('invalid observation metric or source reference');
    }
    if (typeof observation.value === 'number') {
      requireFiniteNonNegative(observation.value, observation.metric);
    }
    if (observation.unit === 'ratio' && typeof observation.value === 'number' && observation.value > 1) {
      throw new Error('ratio observations must be between 0 and 1');
    }
    if (observation.unit === 'percent' && typeof observation.value === 'number' && observation.value > 100) {
      throw new Error('percent observations must be between 0 and 100');
    }
    if (observation.unit === 'boolean' && typeof observation.value !== 'boolean') {
      throw new Error('boolean observations require a boolean value');
    }
  }
  const evidenceIds = new Set<string>();
  for (const item of input.evidence) {
    if (!isAdviceIdentifier(item.id) || evidenceIds.has(item.id) || item.observationIds.length === 0) {
      throw new Error('invalid evidence id or empty evidence references');
    }
    evidenceIds.add(item.id);
    for (const observationId of item.observationIds) {
      if (!observationIds.has(observationId)) throw new Error('evidence references an unknown observation');
    }
  }
}

function promptSamples(optIn: PromptSampleOptIn | undefined): { id: string; text: string }[] {
  if (optIn === undefined) return [];
  if (optIn.consent !== 'explicit' || !Array.isArray(optIn.samples)) {
    throw new Error('prompt samples require a separate explicit opt-in');
  }
  const out: { id: string; text: string }[] = [];
  let totalChars = 0;
  for (const sample of optIn.samples.slice(0, MAX_PROMPT_SAMPLES)) {
    if (!sample || typeof sample.text !== 'string') throw new Error('prompt sample text must be a string');
    const text = sample.text.trim().slice(0, MAX_PROMPT_SAMPLE_CHARS);
    if (text.length === 0) continue;
    const remaining = MAX_PROMPT_SAMPLE_TOTAL_CHARS - totalChars;
    if (remaining <= 0) break;
    const bounded = text.slice(0, remaining);
    out.push({ id: `prompt-${out.length + 1}`, text: bounded });
    totalChars += bounded.length;
  }
  return out;
}

function userContext(optIn: PromptSampleOptIn | undefined): string | undefined {
  if (optIn === undefined || optIn.userContext === undefined) return undefined;
  if (optIn.consent !== 'explicit' || typeof optIn.userContext !== 'string') {
    throw new Error('user context requires the separate prompt-personalisation opt-in');
  }
  const text = optIn.userContext.trim().slice(0, MAX_USER_CONTEXT_CHARS);
  return text.length > 0 ? text : undefined;
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('payload contains a non-finite number');
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const item = source[key];
      if (item !== undefined) out[key] = canonicalize(item);
    }
    return out;
  }
  throw new Error(`payload contains unsupported ${typeof value} value`);
}

export function stableAdvicePayloadStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/** Build and serialize once. Aggregates-only is the default and has no promptSamples key. */
export function prepareAdvicePayload(input: PrepareAdvicePayloadInput): PreparedAdvicePayload {
  validateAdviceAggregateSnapshot(input.aggregate);
  validateSignalGraph(input);
  const samples = promptSamples(input.promptSamples);
  const context = userContext(input.promptSamples);
  if (input.promptSamples !== undefined && samples.length === 0 && context === undefined) {
    throw new Error('explicit prompt opt-in must contain a sample or user context');
  }
  const dataMode: PreparedAdvicePayload['dataMode'] =
    samples.length > 0
      ? 'aggregates-with-prompt-samples'
      : context !== undefined
        ? 'aggregates-with-personalization'
        : 'aggregates-only';

  const request: RemoteAdviceRequest = {
    schemaVersion: ADVICE_REMOTE_PAYLOAD_VERSION,
    responseContractVersion: ADVICE_CONTRACT_VERSION,
    locale: input.locale,
    aggregate: {
      scope: input.aggregate.scope,
      windowDays: input.aggregate.windowDays,
      totals: {
        inputTokens: input.aggregate.totals.inputTokens,
        outputTokens: input.aggregate.totals.outputTokens,
        cacheCreationTokens: input.aggregate.totals.cacheCreationTokens,
        cacheReadTokens: input.aggregate.totals.cacheReadTokens,
        messageCount: input.aggregate.totals.messageCount,
        estimatedCostUsd: input.aggregate.totals.estimatedCostUsd,
      },
      modelFamilies: input.aggregate.modelFamilies.map((row) => ({
        family: row.family,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        cacheCreationTokens: row.cacheCreationTokens,
        cacheReadTokens: row.cacheReadTokens,
        count: row.count,
      })),
    },
    signals: {
      sources: input.sources.map((source) => ({
        id: source.id,
        kind: source.kind,
        scope: source.scope,
        window:
          source.window.kind === 'rolling-days'
            ? { kind: 'rolling-days', days: source.window.days }
            : { kind: source.window.kind },
        confidence: source.confidence as 'high' | 'medium',
      })),
      observations: input.observations.map((observation) => ({
        id: observation.id,
        metric: observation.metric,
        value: observation.value,
        unit: observation.unit,
        method: observation.method,
        sourceId: observation.sourceId,
      })),
      evidence: input.evidence.map((item) => ({
        id: item.id,
        observationIds: [...item.observationIds],
        strength: item.strength,
      })),
    },
    responseRules: {
      format: 'strict-json',
      unknownFields: 'reject',
      evidenceReferences: 'required',
      qualityGuardrail: 'required',
      hostOwnedFields: ['observations', 'evidence', 'privacy', 'provenance'],
    },
    privacy: {
      dataMode,
      promptSampleConsent: input.promptSamples !== undefined ? 'explicit' : 'not-granted',
      promptSampleCount: samples.length,
      userContextIncluded: context !== undefined,
    },
  };
  if (context !== undefined) request.userContext = context;
  if (samples.length > 0) request.promptSamples = samples;

  const serializedBody = stableAdvicePayloadStringify(request);
  const canonicalBytes = Buffer.from(serializedBody, 'utf8');
  const sha256 = createHash('sha256').update(canonicalBytes).digest('hex');
  return {
    contentType: 'application/json',
    dataMode,
    promptSampleCount: samples.length,
    serializedBody,
    canonicalBytes,
    sha256,
  };
}

function assertPreparedAdvicePayloadIntegrity(prepared: PreparedAdvicePayload): void {
  if (!(prepared.canonicalBytes instanceof Uint8Array)) {
    throw new Error('prepared advice payload bytes are invalid');
  }
  const decoded = Buffer.from(prepared.canonicalBytes).toString('utf8');
  const digest = createHash('sha256').update(prepared.canonicalBytes).digest('hex');
  if (decoded !== prepared.serializedBody || digest !== prepared.sha256) {
    throw new Error('prepared advice payload integrity check failed');
  }
}

/** Preview decodes the same canonical bytes that the explicit sender receives. */
export function previewAdvicePayload(prepared: PreparedAdvicePayload): AdvicePayloadPreview {
  assertPreparedAdvicePayloadIntegrity(prepared);
  return {
    contentType: prepared.contentType,
    dataMode: prepared.dataMode,
    promptSampleCount: prepared.promptSampleCount,
    body: Buffer.from(prepared.canonicalBytes).toString('utf8'),
    utf8Bytes: prepared.canonicalBytes.byteLength,
    sha256: prepared.sha256,
  };
}

export type AdvicePayloadSender<T> = (
  canonicalBytes: Uint8Array,
  contentType: PreparedAdvicePayload['contentType'],
  sha256: string,
) => Promise<T>;

/** This boundary deliberately cannot reserialize: it only receives the prepared bytes. */
export async function sendPreparedAdvicePayload<T>(
  prepared: PreparedAdvicePayload,
  sender: AdvicePayloadSender<T>
): Promise<T> {
  assertPreparedAdvicePayloadIntegrity(prepared);
  return sender(prepared.canonicalBytes, prepared.contentType, prepared.sha256);
}
