import {
  NormalizedUsageEvent,
  ProviderLimitSnapshot,
  ProviderThreadRole,
  ProviderTokenCounts,
} from '../providerTypes';
import {
  isObject,
  JsonObject,
  numberField,
  parseJsonObject,
  stringField,
} from './codexSchema';

export interface CodexRawTokenCounts {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
}

export interface CodexParserState {
  schemaVersion: 1;
  fileKey: string;
  sessionKey: string;
  parentSessionKey?: string;
  currentTurnId?: string;
  model?: string;
  effort?: string;
  role: ProviderThreadRole;
  highWater?: CodexRawTokenCounts;
  qualityFlags: string[];
}

export interface CodexStructuralEvent {
  kind: 'tool' | 'patch' | 'task-complete' | 'compaction';
  name?: string;
  count?: number;
  timestamp: number;
}

export interface CodexLineOutput {
  state: CodexParserState;
  events: NormalizedUsageEvent[];
  limit?: ProviderLimitSnapshot;
  structural?: CodexStructuralEvent;
}

export function createCodexParserState(fileKey: string): CodexParserState {
  return {
    schemaVersion: 1,
    fileKey,
    sessionKey: fileKey,
    role: 'root',
    qualityFlags: [],
  };
}

function withFlag(state: CodexParserState, flag: string): CodexParserState {
  if (state.qualityFlags.includes(flag)) {
    return state;
  }
  return { ...state, qualityFlags: [...state.qualityFlags, flag] };
}

function rawTokenCounts(value: unknown): CodexRawTokenCounts | null {
  if (!isObject(value)) {
    return null;
  }
  const inputTokens = numberField(value, 'input_tokens');
  const outputTokens = numberField(value, 'output_tokens');
  if (inputTokens === undefined || outputTokens === undefined) {
    return null;
  }
  return {
    inputTokens,
    cachedInputTokens: numberField(value, 'cached_input_tokens') ?? 0,
    outputTokens,
    reasoningOutputTokens: numberField(value, 'reasoning_output_tokens') ?? 0,
    totalTokens: numberField(value, 'total_tokens') ?? inputTokens + outputTokens,
  };
}

function componentDelta(
  current: CodexRawTokenCounts,
  previous: CodexRawTokenCounts,
): ProviderTokenCounts {
  return {
    inputTotal: current.inputTokens - previous.inputTokens,
    cachedInput: current.cachedInputTokens - previous.cachedInputTokens,
    outputTotal: current.outputTokens - previous.outputTokens,
    reasoningOutput:
      current.reasoningOutputTokens - previous.reasoningOutputTokens,
    sourceTotal: current.totalTokens - previous.totalTokens,
  };
}

function zeroCounts(): CodexRawTokenCounts {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
  };
}

function hasRegression(
  current: CodexRawTokenCounts,
  previous: CodexRawTokenCounts,
): boolean {
  return (
    current.inputTokens < previous.inputTokens ||
    current.cachedInputTokens < previous.cachedInputTokens ||
    current.outputTokens < previous.outputTokens ||
    current.reasoningOutputTokens < previous.reasoningOutputTokens
  );
}

function hasUsage(tokens: ProviderTokenCounts): boolean {
  return (
    tokens.inputTotal > 0 ||
    (tokens.cachedInput ?? 0) > 0 ||
    tokens.outputTotal > 0 ||
    (tokens.reasoningOutput ?? 0) > 0
  );
}

function timestampOf(entry: JsonObject): number {
  const timestamp = stringField(entry, 'timestamp');
  if (!timestamp) {
    return 0;
  }
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resetTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? value * 1_000 : value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function parsePrimaryLimit(
  payload: JsonObject,
  info: JsonObject,
  observedAt: number,
): ProviderLimitSnapshot | undefined {
  const rateLimits = isObject(payload.rate_limits)
    ? payload.rate_limits
    : isObject(info.rate_limits)
      ? info.rate_limits
      : null;
  if (!rateLimits || !isObject(rateLimits.primary)) {
    return undefined;
  }
  const primary = rateLimits.primary;
  const usedPercent = numberField(primary, 'used_percent');
  if (usedPercent === undefined) {
    return undefined;
  }

  return {
    provider: 'codex',
    observedAt,
    source: 'local-log',
    confidence: 'last-observed',
    windows: [
      {
        label: 'primary',
        usedPercent,
        windowMinutes: numberField(primary, 'window_minutes'),
        resetsAt: resetTimestamp(primary.resets_at),
      },
    ],
  };
}

function parseTurnContext(
  entry: JsonObject,
  state: CodexParserState,
): CodexLineOutput {
  if (!isObject(entry.payload)) {
    return { state: withFlag(state, 'invalid-turn-context'), events: [] };
  }
  return {
    state: {
      ...state,
      model: stringField(entry.payload, 'model') ?? state.model,
      effort: stringField(entry.payload, 'effort') ?? state.effort,
    },
    events: [],
  };
}

function parseTokenCount(
  entry: JsonObject,
  payload: JsonObject,
  state: CodexParserState,
): CodexLineOutput {
  if (!isObject(payload.info)) {
    return { state: withFlag(state, 'missing-token-info'), events: [] };
  }
  const info = payload.info;
  const current = rawTokenCounts(info.total_token_usage);
  if (!current) {
    return { state: withFlag(state, 'invalid-token-count'), events: [] };
  }

  const observedAt = timestampOf(entry);
  const limit = parsePrimaryLimit(payload, info, observedAt);
  const previous = state.highWater ?? zeroCounts();
  if (hasRegression(current, previous)) {
    return {
      state: { ...withFlag(state, 'counter-regression'), highWater: current },
      events: [],
      limit,
    };
  }

  const tokens = componentDelta(current, previous);
  const nextState = { ...state, highWater: current };
  if (!hasUsage(tokens)) {
    return { state: nextState, events: [], limit };
  }

  const event: NormalizedUsageEvent = {
    provider: 'codex',
    sourceKind: 'local-jsonl',
    schemaVariant: 'codex-token-count-v1',
    timestamp: observedAt,
    sessionKey: state.sessionKey,
    parentSessionKey: state.parentSessionKey,
    model: state.model,
    effort: state.effort,
    role: state.role,
    tokens,
    confidence: state.qualityFlags.length > 0 ? 'partial' : 'exact',
    qualityFlags: [...state.qualityFlags],
  };
  return { state: nextState, events: [event], limit };
}

export function parseCodexLine(
  line: string,
  state: CodexParserState,
): CodexLineOutput {
  const entry = parseJsonObject(line);
  if (!entry) {
    return { state: withFlag(state, 'invalid-json'), events: [] };
  }
  const type = stringField(entry, 'type');
  if (type === 'turn_context') {
    return parseTurnContext(entry, state);
  }
  if (type === 'event_msg') {
    if (!isObject(entry.payload)) {
      return { state: withFlag(state, 'invalid-event-payload'), events: [] };
    }
    if (stringField(entry.payload, 'type') === 'token_count') {
      return parseTokenCount(entry, entry.payload, state);
    }
    return { state, events: [] };
  }
  if (type === 'session_meta' || type === 'response_item') {
    return { state, events: [] };
  }
  return { state: withFlag(state, 'unknown-event'), events: [] };
}
