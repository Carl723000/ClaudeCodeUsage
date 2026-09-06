import { AdviceContract } from './contract';
import {
  AdviceAggregateSnapshot,
  PreparedAdvicePayload,
  prepareAdvicePayload,
  previewAdvicePayload,
} from './payload';

export type AdviceEffectivenessProvider = 'claude' | 'codex';

/**
 * Extension-host state for the experimental panel. Prompt text stays in this
 * host-only object and is not rendered or serialized until the separate
 * prompt-sample capability is explicitly granted for one sealed snapshot.
 */
export interface AdviceEffectivenessProviderState {
  provider: AdviceEffectivenessProvider;
  contract: AdviceContract;
  remotePreviewEligible: boolean;
  aggregate?: AdviceAggregateSnapshot;
  /** Included only when the separate prompt-personalisation consent is explicit. */
  userContext?: string;
  promptSamples: readonly { text: string }[];
}

export type AdviceEffectivenessProviderStates = Partial<
  Record<AdviceEffectivenessProvider, AdviceEffectivenessProviderState>
>;

export type AdviceSnapshotConsent = {
  aggregate: 'explicit' | 'not-granted';
  promptSamples: 'explicit' | 'not-granted';
};

/** Select only timestamped samples inside the current consent window. */
export function selectAdvicePromptSamples(
  samples: readonly { text: string; observedAtEpochMs: number }[],
  nowEpochMs: number,
  windowDays: number,
): { text: string }[] {
  if (
    !Number.isFinite(nowEpochMs) ||
    !Number.isInteger(windowDays) ||
    windowDays < 1 ||
    windowDays > 365
  ) {
    return [];
  }
  const cutoff = nowEpochMs - windowDays * 86_400_000;
  return samples
    .filter(
      (sample) =>
        typeof sample.text === 'string' &&
        Number.isFinite(sample.observedAtEpochMs) &&
        sample.observedAtEpochMs >= cutoff &&
        sample.observedAtEpochMs <= nowEpochMs,
    )
    .map((sample) => ({ text: sample.text }));
}

export interface PreparedAdviceSnapshot {
  provider: 'claude';
  prepared: PreparedAdvicePayload;
  preview: {
    contentType: PreparedAdvicePayload['contentType'];
    dataMode: PreparedAdvicePayload['dataMode'];
    promptSampleCount: number;
    body: string;
    utf8Bytes: number;
    sha256: string;
  };
}

export type PrepareAdviceSnapshotResult =
  | { ok: true; value: PreparedAdviceSnapshot }
  | {
      ok: false;
      reason:
        | 'aggregate-consent-required'
        | 'provider-not-eligible'
        | 'aggregate-unavailable'
        | 'invalid-evidence';
    };

/**
 * Seal one canonical remote object. This function has no transport and cannot
 * send; callers retain `prepared` under an opaque snapshot ID for the single
 * future wiring point. Preview text is read from that same prepared value.
 */
export function prepareAdviceSnapshot(
  state: AdviceEffectivenessProviderState,
  consent: AdviceSnapshotConsent,
): PrepareAdviceSnapshotResult {
  if (consent.aggregate !== 'explicit') {
    return { ok: false, reason: 'aggregate-consent-required' };
  }
  if (state.provider !== 'claude' || !state.remotePreviewEligible) {
    return { ok: false, reason: 'provider-not-eligible' };
  }
  if (!state.aggregate) {
    return { ok: false, reason: 'aggregate-unavailable' };
  }

  try {
    const prepared = prepareAdvicePayload({
      locale: state.contract.provenance.locale,
      aggregate: state.aggregate,
      sources: state.contract.provenance.sources,
      observations: state.contract.observations,
      evidence: state.contract.evidence,
      ...(consent.promptSamples === 'explicit'
        ? {
            promptSamples: {
              consent: 'explicit' as const,
              ...(state.userContext === undefined ? {} : { userContext: state.userContext }),
              samples: state.promptSamples.map((sample) => ({ text: sample.text })),
            },
          }
        : {}),
    });
    const preview = previewAdvicePayload(prepared);
    return {
      ok: true,
      value: {
        provider: 'claude',
        prepared,
        preview: {
          contentType: preview.contentType,
          dataMode: preview.dataMode,
          promptSampleCount: preview.promptSampleCount,
          body: preview.body,
          utf8Bytes: preview.utf8Bytes,
          sha256: preview.sha256,
        },
      },
    };
  } catch {
    return { ok: false, reason: 'invalid-evidence' };
  }
}
