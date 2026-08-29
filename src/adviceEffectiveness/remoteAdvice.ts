import type {
  PreparedAiTransportRequest,
  PreparedAiInvocation,
} from './preparedRequest';
import { prepareAiInvocation } from './preparedRequest';
import type { PreparedAdvicePayload } from './payload';
import { previewAdvicePayload } from './payload';
import { parseStructuredAdviceOutput } from './structuredOutput';
import type {
  StructuredAdviceOutput,
  StructuredAdviceParseErrorCode,
  StructuredAdviceReferences,
} from './structuredOutput';
import type { HttpResponse } from '../httpClient';
import { sendPreparedModelRequest } from '../advisor';

export const STRUCTURED_ADVICE_SYSTEM_PROMPT =
  'Return exactly one strict JSON object matching the response contract in the user payload. ' +
  'Do not use Markdown fences, prose outside JSON, unknown fields, or evidence IDs absent ' +
  'from that payload. Return an empty recommendations array when the evidence is insufficient.';

export interface StructuredAdviceInvocationConfig {
  apiFormat: 'anthropic' | 'openai';
  apiUrl: string;
  model: string;
  reasoningEffort?: string;
  sourceRevision: string;
  consentGeneration: number;
  createdAtEpochMs: number;
  timeoutMs?: number;
}

export interface StructuredAdviceSendOptions {
  apiKey: string;
  expectedSourceRevision?: string;
  expectedConsentGeneration?: number;
  signal?: AbortSignal;
  transport?: (request: PreparedAiTransportRequest) => Promise<HttpResponse>;
}

export type StructuredAdviceRequestResult =
  | { ok: true; value: StructuredAdviceOutput }
  | {
      ok: false;
      code: StructuredAdviceParseErrorCode | 'transport-error' | 'invalid-prepared-request';
      issues: string[];
    };

/**
 * Wrap the sealed evidence body in the provider's complete HTTP body exactly
 * once. The returned object, not the evidence-only inner payload, is what both
 * preview and transport consume.
 */
export function prepareStructuredAdviceInvocation(
  evidence: PreparedAdvicePayload,
  config: StructuredAdviceInvocationConfig,
): PreparedAiInvocation {
  // This assertion catches any mismatch between the inner evidence preview and
  // its bytes before those exact bytes are embedded in the provider body.
  previewAdvicePayload(evidence);
  return prepareAiInvocation({
    kind: 'advice',
    apiFormat: config.apiFormat,
    apiUrl: config.apiUrl,
    model: config.model,
    ...(config.reasoningEffort ? { reasoningEffort: config.reasoningEffort } : {}),
    systemPrompt: STRUCTURED_ADVICE_SYSTEM_PROMPT,
    userContent: evidence.serializedBody,
    dataMode: evidence.dataMode,
    sourceRevision: config.sourceRevision,
    consentGeneration: config.consentGeneration,
    createdAtEpochMs: config.createdAtEpochMs,
    ...(config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs }),
  });
}

/**
 * Strict advice send boundary. Only an already-prepared advice invocation may
 * cross it; malformed output is rejected without prose repair or fallback.
 */
export async function requestStructuredAdvice(
  prepared: PreparedAiInvocation,
  references: StructuredAdviceReferences,
  options: StructuredAdviceSendOptions,
): Promise<StructuredAdviceRequestResult> {
  if (prepared.kind !== 'advice' || prepared.dataMode === 'user-draft-only') {
    return {
      ok: false,
      code: 'invalid-prepared-request',
      issues: ['prepared request is not structured advice'],
    };
  }
  let raw: string;
  try {
    raw = await sendPreparedModelRequest(prepared, options.apiKey, {
      ...(options.expectedSourceRevision === undefined
        ? {}
        : { expectedSourceRevision: options.expectedSourceRevision }),
      ...(options.expectedConsentGeneration === undefined
        ? {}
        : { expectedConsentGeneration: options.expectedConsentGeneration }),
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.transport ? { transport: options.transport } : {}),
    });
  } catch {
    return {
      ok: false,
      code: 'transport-error',
      issues: ['configured BYOK transport failed'],
    };
  }
  return parseStructuredAdviceOutput(raw, references);
}
