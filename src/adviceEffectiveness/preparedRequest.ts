import { createHash } from 'node:crypto';

import type { AdviceFormat } from '../advisor';
import { stableAdvicePayloadStringify } from './payload';

const AI_INVOCATION_SCHEMA_VERSION = 1 as const;
const AI_MAX_TOKENS = 16_000;
const DEFAULT_TIMEOUT_MS = 120_000;

export type AiInvocationKind = 'advice' | 'optimizer';
export type AiInvocationDataMode =
  | 'aggregates-only'
  | 'aggregates-with-personalization'
  | 'aggregates-with-prompt-samples'
  | 'user-draft-only';

export interface PrepareAiInvocationInput {
  kind: AiInvocationKind;
  apiFormat: AdviceFormat;
  apiUrl: string;
  model: string;
  reasoningEffort?: string;
  systemPrompt: string;
  userContent: string;
  dataMode: AiInvocationDataMode;
  /** Opaque provider-index or draft revision; never a path/session/title. */
  sourceRevision: string;
  consentGeneration: number;
  createdAtEpochMs: number;
  timeoutMs?: number;
}

export interface PreparedAiInvocation {
  readonly schemaVersion: typeof AI_INVOCATION_SCHEMA_VERSION;
  readonly kind: AiInvocationKind;
  readonly apiFormat: AdviceFormat;
  readonly endpoint: string;
  readonly model: string;
  readonly dataMode: AiInvocationDataMode;
  readonly sourceRevision: string;
  readonly consentGeneration: number;
  readonly createdAtEpochMs: number;
  readonly timeoutMs: number;
  readonly contentType: 'application/json';
  /** Canonical full provider HTTP body. It is never rebuilt after preparation. */
  readonly serializedBody: string;
  readonly canonicalBytes: Uint8Array;
  readonly sha256: string;
}

export interface AiInvocationPreview {
  kind: AiInvocationKind;
  dataMode: AiInvocationDataMode;
  contentType: 'application/json';
  body: string;
  utf8Bytes: number;
  sha256: string;
}

export interface PreparedAiSendAuthorization {
  backend: 'api';
  apiKey: string;
  expectedSourceRevision?: string;
  expectedConsentGeneration?: number;
  signal?: AbortSignal;
}

export interface PreparedAiTransportRequest {
  endpoint: string;
  apiFormat: AdviceFormat;
  contentType: 'application/json';
  headers: Record<string, string>;
  /** Same object identity as PreparedAiInvocation.canonicalBytes. */
  canonicalBytes: Uint8Array;
  timeoutMs: number;
  signal?: AbortSignal;
}

export type PreparedAiTransport<T> = (request: PreparedAiTransportRequest) => Promise<T>;

function normalizeOpenAiUrl(value: string): string {
  let url = value.trim().replace(/\/+$/, '');
  if (url === '') return 'https://api.deepseek.com/chat/completions';
  if (/api\.deepseek\.com\/v1(?:\/chat\/completions)?$/.test(url)) {
    url = url.replace('/v1', '');
  }
  return url.endsWith('/chat/completions') ? url : `${url}/chat/completions`;
}

function normalizeAnthropicUrl(value: string): string {
  const url = value.trim().replace(/\/+$/, '');
  if (url === '' || /api\.anthropic\.com$/.test(url) || /chat\/completions$/.test(url)) {
    return 'https://api.anthropic.com/v1/messages';
  }
  return url.endsWith('/v1/messages') ? url : `${url}/v1/messages`;
}

function requireBoundedText(value: string, label: string, maxChars: number): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  const text = value.trim();
  if (text.length === 0 || text.length > maxChars) {
    throw new Error(`${label} must contain 1-${maxChars} characters`);
  }
  return value;
}

function requireOpaqueRevision(value: string): string {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(value)) {
    throw new Error('sourceRevision must be an opaque revision');
  }
  return value;
}

function requestBody(input: PrepareAiInvocationInput): Record<string, unknown> {
  if (input.apiFormat === 'anthropic') {
    return {
      model: requireBoundedText(input.model, 'model', 256),
      max_tokens: AI_MAX_TOKENS,
      system: requireBoundedText(input.systemPrompt, 'systemPrompt', 40_000),
      messages: [{ role: 'user', content: requireBoundedText(input.userContent, 'userContent', 200_000) }],
    };
  }
  const body: Record<string, unknown> = {
    model: requireBoundedText(input.model, 'model', 256),
    stream: false,
    messages: [
      { role: 'system', content: requireBoundedText(input.systemPrompt, 'systemPrompt', 40_000) },
      { role: 'user', content: requireBoundedText(input.userContent, 'userContent', 200_000) },
    ],
  };
  const reasoningEffort = input.reasoningEffort?.trim();
  if (reasoningEffort) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(reasoningEffort)) {
      throw new Error('reasoningEffort is invalid');
    }
    body.reasoning_effort = reasoningEffort;
  }
  return body;
}

/** Prepare the complete provider wire body exactly once. No credential enters it. */
export function prepareAiInvocation(input: PrepareAiInvocationInput): PreparedAiInvocation {
  if (input.kind !== 'advice' && input.kind !== 'optimizer') {
    throw new Error('AI invocation kind is invalid');
  }
  if (input.apiFormat !== 'anthropic' && input.apiFormat !== 'openai') {
    throw new Error('AI invocation format is invalid');
  }
  if (!Number.isInteger(input.consentGeneration) || input.consentGeneration < 0) {
    throw new Error('consentGeneration must be a non-negative integer');
  }
  if (!Number.isFinite(input.createdAtEpochMs) || input.createdAtEpochMs < 0) {
    throw new Error('createdAtEpochMs must be finite and non-negative');
  }
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 10 * 60_000) {
    throw new Error('timeoutMs is outside the supported range');
  }
  const serializedBody = stableAdvicePayloadStringify(requestBody(input));
  const canonicalBytes = Buffer.from(serializedBody, 'utf8');
  const sha256 = createHash('sha256').update(canonicalBytes).digest('hex');
  return {
    schemaVersion: AI_INVOCATION_SCHEMA_VERSION,
    kind: input.kind,
    apiFormat: input.apiFormat,
    endpoint: input.apiFormat === 'anthropic'
      ? normalizeAnthropicUrl(input.apiUrl)
      : normalizeOpenAiUrl(input.apiUrl),
    model: input.model.trim(),
    dataMode: input.dataMode,
    sourceRevision: requireOpaqueRevision(input.sourceRevision),
    consentGeneration: input.consentGeneration,
    createdAtEpochMs: input.createdAtEpochMs,
    timeoutMs,
    contentType: 'application/json',
    serializedBody,
    canonicalBytes,
    sha256,
  };
}

export function assertPreparedAiInvocationIntegrity(prepared: PreparedAiInvocation): void {
  if (
    prepared.schemaVersion !== AI_INVOCATION_SCHEMA_VERSION ||
    !(prepared.canonicalBytes instanceof Uint8Array) ||
    prepared.contentType !== 'application/json'
  ) {
    throw new Error('prepared AI invocation integrity check failed');
  }
  const decoded = Buffer.from(prepared.canonicalBytes).toString('utf8');
  const digest = createHash('sha256').update(prepared.canonicalBytes).digest('hex');
  if (decoded !== prepared.serializedBody || digest !== prepared.sha256) {
    throw new Error('prepared AI invocation integrity check failed');
  }
}

export function previewAiInvocation(prepared: PreparedAiInvocation): AiInvocationPreview {
  assertPreparedAiInvocationIntegrity(prepared);
  return {
    kind: prepared.kind,
    dataMode: prepared.dataMode,
    contentType: prepared.contentType,
    body: Buffer.from(prepared.canonicalBytes).toString('utf8'),
    utf8Bytes: prepared.canonicalBytes.byteLength,
    sha256: prepared.sha256,
  };
}

/**
 * The only send boundary. It validates current consent/source generation and
 * gives transport the original canonical byte object; it cannot reserialize.
 */
export async function sendPreparedAiInvocation<T>(
  prepared: PreparedAiInvocation,
  authorization: PreparedAiSendAuthorization,
  transport: PreparedAiTransport<T>,
): Promise<T> {
  assertPreparedAiInvocationIntegrity(prepared);
  if (!authorization || authorization.backend !== 'api') {
    throw new Error('Only the configured BYOK API backend may send AI requests');
  }
  const apiKey = authorization.apiKey?.trim();
  if (!apiKey) throw new Error('A user-configured API key is required');
  if (
    (authorization.expectedSourceRevision !== undefined &&
      authorization.expectedSourceRevision !== prepared.sourceRevision) ||
    (authorization.expectedConsentGeneration !== undefined &&
      authorization.expectedConsentGeneration !== prepared.consentGeneration)
  ) {
    throw new Error('The prepared AI invocation is stale');
  }
  if (authorization.signal?.aborted) {
    throw new Error('The prepared AI invocation was cancelled');
  }
  const headers: Record<string, string> = prepared.apiFormat === 'anthropic'
    ? {
        'Content-Type': prepared.contentType,
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      }
    : {
        'Content-Type': prepared.contentType,
        Authorization: `Bearer ${apiKey}`,
      };
  return transport({
    endpoint: prepared.endpoint,
    apiFormat: prepared.apiFormat,
    contentType: prepared.contentType,
    headers,
    canonicalBytes: prepared.canonicalBytes,
    timeoutMs: prepared.timeoutMs,
    ...(authorization.signal ? { signal: authorization.signal } : {}),
  });
}
