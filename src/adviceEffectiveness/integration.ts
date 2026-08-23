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
  promptSamples: readonly { text: string }[];
}

export type AdviceEffectivenessProviderStates = Partial<
  Record<AdviceEffectivenessProvider, AdviceEffectivenessProviderState>
>;

export type AdviceSnapshotConsent = {
  aggregate: 'explicit' | 'not-granted';
  promptSamples: 'explicit' | 'not-granted';
};

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
