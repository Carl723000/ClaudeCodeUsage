// Shared AI helpers for the two explicit user-triggered workflows. Production
// can send only an already-previewed PreparedAiInvocation through the user's
// configured BYOK endpoint. Anthropic Messages and OpenAI-compatible chat are
// wire formats; neither implies subscription/OAuth credential reuse.

import { HttpResponse, requestViaCurl, requestViaFetch } from './httpClient';
import {
  PreparedAiInvocation,
  PreparedAiTransportRequest,
  sendPreparedAiInvocation,
} from './adviceEffectiveness/preparedRequest';

export type AdviceFormat = 'anthropic' | 'openai';

/** Normalise an OpenAI-compatible chat endpoint URL. */
function normalizeOpenAiUrl(url: string): string {
  let u = (url || '').trim().replace(/\/+$/, '');
  if (u === '') {
    return 'https://api.deepseek.com/chat/completions';
  }
  if (/api\.deepseek\.com\/v1(\/chat\/completions)?$/.test(u)) {
    u = u.replace('/v1', '');
  }
  if (!u.endsWith('/chat/completions')) {
    u = `${u}/chat/completions`;
  }
  return u;
}

/** Normalise an Anthropic Messages endpoint URL. */
function normalizeAnthropicUrl(url: string): string {
  const u = (url || '').trim().replace(/\/+$/, '');
  if (u === '' || /api\.anthropic\.com$/.test(u) || /chat\/completions$/.test(u)) {
    return 'https://api.anthropic.com/v1/messages';
  }
  return u.endsWith('/v1/messages') ? u : `${u}/v1/messages`;
}

/** Send a request with the Phase-0 timeout / retry / curl-fallback policy. */
async function send(
  url: string,
  headers: Record<string, string>,
  body: string | Uint8Array,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<HttpResponse> {
  const reqOpts = { method: 'POST', headers, body, ...(signal ? { signal } : {}) };
  const curl = (): Promise<HttpResponse> =>
    requestViaCurl(url, { ...reqOpts, timeoutSec: Math.ceil(timeoutMs / 1000) });
  try {
    const r = await requestViaFetch(url, { ...reqOpts, timeoutMs });
    // Anthropic's edge fingerprints Node's TLS ClientHello and answers 403
    // "Request not allowed"; curl gets through (same gate the quota client hits).
    if (r.status === 403 && r.body.includes('Request not allowed')) {
      return curl();
    }
    return r;
  } catch {
    if (signal?.aborted) throw new Error('Request cancelled');
    try {
      return await requestViaFetch(url, { ...reqOpts, timeoutMs });
    } catch {
      if (signal?.aborted) throw new Error('Request cancelled');
      return curl();
    }
  }
}

function parsePreparedModelResponse(
  prepared: PreparedAiInvocation,
  response: HttpResponse,
): string {
  if (response.status < 200 || response.status >= 300) {
    const hint = prepared.apiFormat === 'openai' && response.status === 404
      ? ' (check advice.apiUrl — for DeepSeek it is https://api.deepseek.com/chat/completions)'
      : '';
    throw new Error(`API ${response.status}${hint}: ${response.body.slice(0, 300)}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(response.body);
  } catch {
    throw new Error(`The API returned a non-JSON response: ${response.body.slice(0, 200)}`);
  }
  let text = '';
  if (prepared.apiFormat === 'anthropic') {
    const blocks = (data as { content?: { type?: string; text?: string }[] }).content;
    text = (blocks ?? [])
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string)
      .join('');
  } else {
    text = (data as { choices?: { message?: { content?: string } }[] })
      .choices?.[0]?.message?.content ?? '';
  }
  if (!text.trim()) throw new Error('The model returned an empty response.');
  return text;
}

/**
 * Production transport for an already-previewed invocation. The full wire
 * body is the original canonical byte object on every fetch retry/curl
 * fallback; this function never calls JSON.stringify.
 */
export async function sendPreparedModelRequest(
  prepared: PreparedAiInvocation,
  apiKey: string,
  options: {
    expectedSourceRevision?: string;
    expectedConsentGeneration?: number;
    signal?: AbortSignal;
    transport?: (request: PreparedAiTransportRequest) => Promise<HttpResponse>;
  } = {},
): Promise<string> {
  const response = await sendPreparedAiInvocation(
    prepared,
    {
      backend: 'api',
      apiKey,
      ...(options.expectedSourceRevision !== undefined
        ? { expectedSourceRevision: options.expectedSourceRevision }
        : {}),
      ...(options.expectedConsentGeneration !== undefined
        ? { expectedConsentGeneration: options.expectedConsentGeneration }
        : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    },
    options.transport ?? ((request) => send(
      request.endpoint,
      request.headers,
      request.canonicalBytes,
      request.timeoutMs,
      request.signal,
    )),
  );
  return parsePreparedModelResponse(prepared, response);
}

// === Usage Optimizer (Phase 9c) ===
// The optimizer turns a rough pasted request into one tight, paste-ready prompt
// plus a settings recommendation. The system prompt and the reply parser are
// pure functions here (no VS Code dependency) so they can be unit-tested; the
// VS Code glue (exact preview, explicit send, config, webview round-trip) lives
// in extension.ts and webview.ts.

export interface OptimizerLenses {
  resolve: boolean; // flag ambiguous references
  distil: boolean; // condense long pasted material
  aesthetic: boolean; // suggest a style direction
}

/** Build the optimizer system prompt for the given language + enabled lenses.
 * `availableModels` is the set of models the user actually uses (Claude ones
 * already reduced to family names) — the recommendation is constrained to these
 * so it never names a model the user doesn't have or a stale version a
 * third-party model wouldn't know about. */
export function buildOptimizerSystemPrompt(
  language: string,
  lenses: OptimizerLenses,
  availableModels: string[] = []
): string {
  const extra: string[] = [];
  if (lenses.resolve) {
    extra.push(
      'Flag every ambiguous reference (e.g. "this", "the file", "that bug", "as before") ' +
        'and either ask the user to pin it down or state a clearly-marked assumption.'
    );
  }
  if (lenses.distil) {
    extra.push(
      'If the draft pastes long material (logs, stack traces, code, docs), condense it to ' +
        'only the part Claude needs and reference the rest rather than repeating it verbatim.'
    );
  }
  if (lenses.aesthetic) {
    extra.push(
      'Where the task is UI / visual / writing, propose one concrete style or aesthetic ' +
        'direction so the result is not generic.'
    );
  }
  return (
    'You are a prompt engineer for the Claude Code CLI coding agent. The user pastes a ' +
    'rough request they intend to hand to Claude Code. Rewrite it into ONE tight, ' +
    'paste-ready prompt Claude Code can act on directly: clear goal, concrete scope, ' +
    'explicit constraints and acceptance criteria, no filler. Preserve the user’s intent ' +
    'and every specific detail; never invent requirements. ' +
    extra.join(' ') +
    (extra.length > 0 ? ' ' : '') +
    'CRITICAL: write the rewritten prompt as PLAIN TEXT — no Markdown at all (no **bold**, ' +
    'no #headings, no backticks, no bullet characters), so it pastes cleanly into a ' +
    'terminal. Use short paragraphs or hyphen lines if structure helps. ' +
    'Then recommend run settings for THIS task. ' +
    (availableModels.length > 0
      ? 'For the model, choose ONLY from the models the user actually uses: ' +
        availableModels.join(', ') +
        '. Refer to Claude models by family only (haiku / sonnet / opus / fable) — ' +
        'never a version number. Pick the cheaper option for mechanical edits, the ' +
        'strongest for ambiguous or design-heavy work. '
      : 'Refer to Claude models by family only (haiku / sonnet / opus / fable), never a ' +
        'version number; pick the cheaper for mechanical edits, the strongest for ambiguous work. ') +
    'Format the settings as EXACTLY three lines, each "Label: value — reason":\n' +
    'Effort: <low|medium|high|max|ultracode> — <short reason>\n' +
    'Thinking: <on|off> — <short reason>\n' +
    'Model: <model> — <short reason>\n' +
    '("max" is the highest single-run effort; "ultracode" means split the task ' +
    'across multiple sub-agents — suggest it only for large, parallelisable work.) ' +
    'Keep the labels (Effort / Thinking / Model) AND the value tokens (e.g. high, ' +
    'max, ultracode, on, opus) in English; write only the reason in the target language. ' +
    'Output EXACTLY this shape and nothing else:\n' +
    '===PROMPT===\n<the rewritten prompt, plain text>\n===SETTINGS===\n<the three settings lines>\n' +
    `Write the prompt and the reasons in ${language}.`
  );
}

/** Split the optimizer reply on the ===PROMPT=== / ===SETTINGS=== markers. */
export function parseOptimizerOutput(raw: string): { prompt: string; settings: string } {
  const text = (raw || '').trim();
  const promptIdx = text.indexOf('===PROMPT===');
  const settingsIdx = text.indexOf('===SETTINGS===');
  if (promptIdx === -1 || settingsIdx === -1 || settingsIdx < promptIdx) {
    // Marker-free or malformed: surface the whole thing as the prompt so the
    // user still gets a usable result.
    return { prompt: text, settings: '' };
  }
  const prompt = text.slice(promptIdx + '===PROMPT==='.length, settingsIdx).trim();
  const settings = text.slice(settingsIdx + '===SETTINGS==='.length).trim();
  return { prompt, settings };
}
