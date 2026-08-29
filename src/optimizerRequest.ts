import type {
  PreparedAiInvocation,
  PreparedAiTransportRequest,
} from './adviceEffectiveness/preparedRequest';
import { prepareAiInvocation } from './adviceEffectiveness/preparedRequest';
import type { HttpResponse } from './httpClient';
import { sendPreparedModelRequest } from './advisor';

export interface PrepareOptimizerInvocationInput {
  apiFormat: 'anthropic' | 'openai';
  apiUrl: string;
  model: string;
  reasoningEffort?: string;
  systemPrompt: string;
  draft: string;
  sourceRevision: string;
  consentGeneration: number;
  createdAtEpochMs: number;
  timeoutMs?: number;
}

export interface PreparedOptimizerSendOptions {
  apiKey: string;
  expectedSourceRevision?: string;
  expectedConsentGeneration?: number;
  signal?: AbortSignal;
  transport?: (request: PreparedAiTransportRequest) => Promise<HttpResponse>;
}

export type PreparedOptimizerResult =
  | { ok: true; value: { prompt: string; settings: string } }
  | {
      ok: false;
      code: 'invalid-prepared-request' | 'invalid-output' | 'transport-error';
      issues: string[];
    };

export function prepareOptimizerInvocation(
  input: PrepareOptimizerInvocationInput,
): PreparedAiInvocation {
  return prepareAiInvocation({
    kind: 'optimizer',
    apiFormat: input.apiFormat,
    apiUrl: input.apiUrl,
    model: input.model,
    ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
    systemPrompt: input.systemPrompt,
    userContent: input.draft,
    dataMode: 'user-draft-only',
    sourceRevision: input.sourceRevision,
    consentGeneration: input.consentGeneration,
    createdAtEpochMs: input.createdAtEpochMs,
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
  });
}

/** Strict marker and three-line settings parser; never surfaces malformed text. */
export function parseStrictOptimizerOutput(
  raw: string,
): { prompt: string; settings: string } | undefined {
  const text = raw.trim();
  const promptMarker = '===PROMPT===';
  const settingsMarker = '===SETTINGS===';
  if (!text.startsWith(`${promptMarker}\n`)) return undefined;
  const settingsIndex = text.indexOf(`\n${settingsMarker}\n`);
  if (settingsIndex <= promptMarker.length) return undefined;
  if (
    text.indexOf(promptMarker, promptMarker.length) !== -1 ||
    text.indexOf(settingsMarker, settingsIndex + settingsMarker.length + 2) !== -1
  ) {
    return undefined;
  }
  const prompt = text.slice(promptMarker.length, settingsIndex).trim();
  const settings = text
    .slice(settingsIndex + settingsMarker.length + 2)
    .trim();
  if (!prompt || prompt.length > 100_000 || !settings || settings.length > 10_000) {
    return undefined;
  }
  const lines = settings.split(/\r?\n/);
  if (lines.length !== 3) return undefined;
  const reason = String.raw`\s+—\s+\S.{0,1000}`;
  if (!new RegExp(`^Effort: (low|medium|high|max|ultracode)${reason}$`).test(lines[0])) {
    return undefined;
  }
  if (!new RegExp(`^Thinking: (on|off)${reason}$`).test(lines[1])) {
    return undefined;
  }
  if (!new RegExp(`^Model: [A-Za-z0-9._/-]{1,128}${reason}$`).test(lines[2])) {
    return undefined;
  }
  return { prompt, settings };
}

export async function requestPreparedOptimizer(
  prepared: PreparedAiInvocation,
  options: PreparedOptimizerSendOptions,
): Promise<PreparedOptimizerResult> {
  if (prepared.kind !== 'optimizer' || prepared.dataMode !== 'user-draft-only') {
    return {
      ok: false,
      code: 'invalid-prepared-request',
      issues: ['prepared request is not an optimizer request'],
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
  const parsed = parseStrictOptimizerOutput(raw);
  return parsed
    ? { ok: true, value: parsed }
    : {
        ok: false,
        code: 'invalid-output',
        issues: ['optimizer output did not match the strict response contract'],
      };
}
