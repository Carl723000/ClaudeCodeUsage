import {
  PreparedAdvicePayload,
  sendPreparedAdvicePayload,
} from './payload';
import {
  StructuredAdviceOutput,
  StructuredAdviceParseErrorCode,
  StructuredAdviceReferences,
  parseStructuredAdviceOutput,
} from './structuredOutput';

/**
 * The only approved future seam from the evidence contract into the existing
 * user-key transport. This module is intentionally not wired by production.
 */
export const LEGACY_BYOK_STRUCTURED_ADVICE_SYSTEM_PROMPT =
  'Return exactly one strict JSON object matching the requested response contract. ' +
  'Do not use Markdown fences, prose outside JSON, unknown fields, or evidence IDs ' +
  'that are absent from the sealed user payload. An empty recommendations array is ' +
  'required when the evidence does not support a recommendation.';

export interface LegacyByokAdviceOptions {
  backend?: 'api';
  apiFormat: 'anthropic' | 'openai';
  apiKey: string;
  apiUrl: string;
  model: string;
  reasoningEffort?: '' | 'high' | 'max';
  timeoutMs?: number;
}

export interface LegacyByokCallOptions extends LegacyByokAdviceOptions {
  backend: 'api';
  summary: '';
  language: '';
}

export type LegacyByokModelCall = (
  systemPrompt: string,
  userContent: string,
  options: LegacyByokCallOptions,
) => Promise<string>;

export type LegacyByokAdviceResult =
  | { ok: true; value: StructuredAdviceOutput }
  | {
      ok: false;
      code: StructuredAdviceParseErrorCode | 'invalid-config' | 'transport-error';
      issues: string[];
    };

/**
 * Passes the already-sealed body as the exact model user turn and applies the
 * strict parser. It never calls the legacy Markdown advice builder or fallback.
 */
export async function requestStructuredAdviceViaLegacyByok(
  prepared: PreparedAdvicePayload,
  references: StructuredAdviceReferences,
  options: LegacyByokAdviceOptions,
  invoke: LegacyByokModelCall,
): Promise<LegacyByokAdviceResult> {
  if (!validLegacyByokOptions(options)) {
    return {
      ok: false,
      code: 'invalid-config',
      issues: ['legacy BYOK configuration was rejected'],
    };
  }
  let raw: string;
  try {
    raw = await sendPreparedAdvicePayload(
      prepared,
      async (canonicalBytes) => invoke(
        LEGACY_BYOK_STRUCTURED_ADVICE_SYSTEM_PROMPT,
        Buffer.from(canonicalBytes).toString('utf8'),
        {
          backend: 'api',
          apiFormat: options.apiFormat,
          apiKey: options.apiKey,
          apiUrl: options.apiUrl,
          model: options.model,
          summary: '',
          language: '',
          ...(options.reasoningEffort === undefined
            ? {}
            : { reasoningEffort: options.reasoningEffort }),
          ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
        },
      ),
    );
  } catch {
    return {
      ok: false,
      code: 'transport-error',
      issues: ['legacy BYOK transport failed'],
    };
  }
  return parseStructuredAdviceOutput(raw, references);
}

function validLegacyByokOptions(value: unknown): value is LegacyByokAdviceOptions {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  const required = ['apiFormat', 'apiKey', 'apiUrl', 'model'];
  const allowed = new Set([...required, 'backend', 'reasoningEffort', 'timeoutMs']);
  const keys = Object.keys(input);
  if (!required.every((key) => keys.includes(key)) || keys.some((key) => !allowed.has(key))) {
    return false;
  }
  if (
    (input.backend !== undefined && input.backend !== 'api') ||
    (input.apiFormat !== 'anthropic' && input.apiFormat !== 'openai') ||
    typeof input.apiKey !== 'string' ||
    input.apiKey.trim().length === 0 ||
    typeof input.apiUrl !== 'string' ||
    input.apiUrl.trim().length === 0 ||
    typeof input.model !== 'string' ||
    input.model.trim().length === 0 ||
    (input.reasoningEffort !== undefined &&
      input.reasoningEffort !== '' &&
      input.reasoningEffort !== 'high' &&
      input.reasoningEffort !== 'max') ||
    (input.timeoutMs !== undefined &&
      (typeof input.timeoutMs !== 'number' ||
        !Number.isFinite(input.timeoutMs) ||
        input.timeoutMs <= 0))
  ) {
    return false;
  }
  return true;
}
