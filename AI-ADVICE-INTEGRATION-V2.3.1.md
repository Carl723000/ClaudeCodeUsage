# v2.3.1 AI Advice Effectiveness: Integration Handoff

Companion documents: [中文交接说明](AI-ADVICE-INTEGRATION-V2.3.1.zh-CN.md) · [English handoff](AI-ADVICE-INTEGRATION-V2.3.1.md)

Related design: [中文设计说明](AI-ADVICE-INTEGRATION-DESIGN-V2.3.1.zh-CN.md) · [English design](AI-ADVICE-INTEGRATION-DESIGN-V2.3.1.md)

## 1. Status and safety conclusion

This branch provides a **default-off v2.3.1 local candidate**, not a published feature. It implements an “Observation → Evidence → Advice → Action → Result” chain inside the existing shared Claude/Codex dashboard and connects the optional remote step to the existing user-configured BYOK endpoint. It makes no automatic model call and sends no telemetry.

The current safety boundary is:

- `advice.effectiveness.enabled` and `advice.optimizer.enabled` default to `false`. Their host message seams also recheck the setting, so disabled or hidden UI cannot create an AI network resource.
- Remote AI is production-reachable in this candidate only after a complete request preview and a separate explicit Send click. Previewing never sends.
- Claude can create a remote preview only after separate explicit aggregate consent; its default mode is `aggregates-only`.
- “Attach user prompt samples” is a second, independent, default-off consent. It cannot be granted unless aggregate consent is also granted.
- Codex advice remains `local-only` and cannot create a remote snapshot.
- The default aggregate path does not accept, transmit, or persist raw conversation records, raw session IDs, absolute or project paths, prompt/response bodies, tool arguments, credentials, or local usernames. Only the second explicit consent can place origin-filtered, bounded prompt samples into one in-memory snapshot; prompt text is never written to `globalState`.
- Prompt Optimizer sends only the draft the user pasted, through the same complete-request preview and explicit-Send transport boundary.
- Failure does not produce plausible-looking advice: invalid evidence, invalid local state, transport failure, or strict-output failure all fail closed.

The legacy `claudeCodeUsage.getAdvice` command now only opens the unified Content surface. It does not build a legacy summary, call a model, or open a separate Markdown result. Prompt Optimizer shares the Prepared preview/send boundary, strict parsing policy, and reversible local feedback boundary; it is not a third sender.

### Baseline and selective portability

The candidate is designed for selective replay on the formal `v2.3.0` baseline. It
reuses the released Claude incremental index, Codex provider index, refresh
coordinator, and versioned migration state. It does not introduce a second log
scanner, scheduler, authorization store, or comparison ledger. The candidate may be
packaged locally for verification, but it does not change the package version,
release workflow, tag, or publication state.

## 2. Implementation map and ownership

| Responsibility | Current integration point | Constraint |
| --- | --- | --- |
| Unified advice contract | `src/adviceEffectiveness/contract.ts` | The host owns observations, evidence, privacy, and provenance; advice must reference known evidence |
| Claude / Codex adaptation | `src/adviceEffectiveness/adapters.ts` | Accepts narrow DTOs only; Codex never enters a remote payload |
| Canonical payload | `src/adviceEffectiveness/payload.ts` | Serializes allowlisted fields only; omits `promptSamples` by default |
| Evidence snapshot | `src/adviceEffectiveness/integration.ts` | Builds the consent-scoped inner evidence body; no transport |
| Complete Prepared request | `src/adviceEffectiveness/preparedRequest.ts` | Serializes the full provider HTTP JSON body once; preview and send consume the same object and canonical bytes |
| Production BYOK request | `src/adviceEffectiveness/remoteAdvice.ts`, `src/optimizerRequest.ts`, `src/advisor.ts` | Explicit Send only; configured API key/endpoint; one shared sender and retry policy |
| Local state and migration | `src/adviceEffectiveness/versionedPersistence.ts` | VS Code `globalState`, exact schema, fail closed |
| Before/after comparison | `src/adviceEffectiveness/comparison.ts` | Pure function, paired comparable tasks, quality guardrail, no causal claim |
| Pair/result production | `src/adviceEffectiveness/comparisonPairing.ts`, `comparisonProduction.ts`, `comparisonResult.ts` | Sanitized materialized task aggregates, strict cohort identity, versioned bounded envelope |
| Strict model output | `src/adviceEffectiveness/structuredOutput.ts` | JSON-only, exact shape, known references, no repair/fallback |
| Framework-origin classification | `src/promptOrigin.ts`, `src/dataLoader.ts` | Structural markers are aggregated immediately; no semantic or writing-quality judgment |
| Host / UI wiring | `src/extension.ts`, `src/webview.ts` | Feature gates, host-only prompts, opaque snapshots, explicit Send, strict result handling, reversible local feedback |
| Excluded preparation seams | `legacyBridge.ts`, `evidencePreparation.ts`, `legacyPersonalization.ts`, `modelExperiment.ts`, `adviceSummary.ts`, demo modules | No production import and explicitly excluded from VSIX; never a default sender |

## 3. Unified advice contract

`AdviceContract` separates an advice artifact into six auditable parts:

1. `observations`: finite numeric or boolean observations with a stable metric, unit, method, and source ID.
2. `evidence`: references observations, declares direct/correlational/proxy strength, and states limitations for proxies.
3. `recommendations`: references evidence and includes an explanation, conditional actions, stop conditions, and success criteria.
4. `privacy`: records local-only / aggregates-only / aggregates-with-prompt-samples mode, prompt consent, and the local-feedback boundary.
5. `provenance`: generation method, time, locale, sources, scope/window, confidence, and machine-readable quality flags.
6. `schemaVersion` and stable opaque IDs: support strict parsing, migration, and comparison without carrying free-text identity data.

The host always owns observations, evidence, privacy, and provenance. The production remote model may return only `recommendations`, and every observation/evidence reference must already exist; the model cannot manufacture measurements, rewrite provenance, or claim higher confidence. An empty recommendation array is valid and preferred to guessing.

## 4. Adapters and provider boundaries

### Claude

`adaptClaudeAdvice` accepts two narrow data sets for exactly the same scope and rolling window:

- a coarse usage aggregate containing token, message, estimated-cost, and coarse model-family totals;
- a numeric session summary containing total, long, and large-context session counts.

The adapter type does not accept raw records, paths, session IDs, titles, or prompts. `extension.ts` consumes the already materialized Claude dashboard snapshot and maps its same-window advice aggregate/session summary into the DTO. A scope/window mismatch, out-of-range count, or non-finite value rejects the entire result.

Claude's structural evidence is eligible for a sealed remote preview, but only after separate explicit aggregate consent.

### Incremental-index dependency

Claude advice consumes the stable `claudeIncrementalIndex` materialized dashboard
snapshot. It does not filter `cache.records`, call full-corpus reducers, or trigger a
JSONL scan. Prompt samples and framework-overhead contributions come from the same
existing indexed analysis state; missing or stale optional personalization evidence
fails closed instead of starting automatic work.

### Codex

`adaptCodexLocalAdvice` maps only existing R8 structural numeric signals such as fresh shares, cache share, processed/fresh multiples, and post-patch tool intensity. It uses only an insight's allowlisted `kind`, `scope`, and `proxy` fields plus a separate numeric behavior DTO; open-ended evidence objects and strings such as `observedEffort` do not enter the unified contract.

If index, identity, or period coverage is incomplete, or unresolved quality flags exist, source confidence becomes `unknown` and the adapter returns observations/evidence but no recommendations. `remoteEvidenceEligible` is always `false` and must stay that way until a provider-discriminated Codex aggregate contract receives a separate privacy review.

## 5. Sealed canonical payload

`prepareAdvicePayload` first builds the allowlisted inner evidence body. `prepareAiInvocation` then embeds that body in the complete configured Anthropic/OpenAI-compatible provider HTTP JSON body and serializes that provider body exactly once. It rejects non-finite numbers and unsupported values, then derives:

- `serializedBody`: the exact canonical UTF-8 JSON string;
- `canonicalBytes`: the bytes encoded once from that string;
- `sha256`: the lowercase hexadecimal SHA-256 of those bytes;
- `utf8Bytes`: `canonicalBytes.byteLength`, shown in preview;
- `contentType`, `dataMode`, and prompt sample count.

SHA-256 is a snapshot identity/integrity digest, not a signature and not proof that a server is trustworthy. Its purpose is to let people and tests verify that the reviewed preview and the transmitted bytes are the same sealed object.

Required invariants are:

- `preview.body === UTF8.decode(prepared.canonicalBytes) === prepared.serializedBody`;
- `preview.utf8Bytes === prepared.canonicalBytes.byteLength`; JavaScript character count is not a substitute;
- `preview.sha256 === SHA256(prepared.canonicalBytes) === prepared.sha256`;
- preview and the sender both recompute and check body/bytes/digest before use; mutation of any field rejects the complete object;
- the production sender receives the same host-retained `PreparedAiInvocation` / `canonicalBytes`; it never reserializes webview text or an ordinary object;
- the host exposes only the body, byte count, digest, and non-sensitive metadata to the webview, while retaining the Prepared object in memory behind an opaque snapshot ID;
- provider refresh, consent changes, panel close, or explicit discard invalidate old snapshots.

The default advice snapshot is `aggregates-only`, and its inner evidence JSON omits the `promptSamples` key entirely. Only a second explicit prompt-personalization consent adds bounded samples/context; runtime cwd, session IDs, paths, or extra fields are discarded. Previewing performs no network call. A request crosses the network only when the user separately clicks Send, using the configured BYOK endpoint and key.

## 6. Local feedback and versioned persistence

The experimental UI's only write target is `ccu.adviceEffectiveness.localState` in VS Code `globalState`, currently schema version 2. The v2 envelope permits only:

- feature mode and two consent enums;
- opaque validated advice / recommendation / pair / rubric / metric IDs;
- `helpful` / `not-helpful` / `unrated` and `applied` / `not-applied` enums;
- bounded finite numbers, epoch timestamps, provider/context/quality enums, and allowlisted quality flags.

It accepts no prompt, payload, explanation, endpoint, path, raw session ID, or arbitrary free text. Feedback is capped at 500 entries and comparable pairs at 200.

`helpful` and `not-helpful` are mutually exclusive for one recommendation; `applied` is independent and may coexist with either rating. Clicking a selected value again withdraws it. Every Advice recommendation and each Prompt Optimizer result uses this same mutation boundary. All feedback stays local, never enters a payload, and emits no telemetry.

Migration and degradation policy:

- Missing state yields an all-closed v2 default.
- Valid v2 state loads unchanged.
- A valid v1 envelope migrates only validated feedback; feature mode, aggregate consent, and prompt consent all close, and comparable pairs start empty.
- An unknown future version, extra field, duplicate ID, invalid enum, non-finite number, or storage error returns the all-closed state and does not overwrite the unknown/corrupt source.
- After a write failure, the host enters degraded mode and rejects further consent or feedback mutations.
- A v2 state with explicit prompt consent but no aggregate consent is treated as corrupt, fails closed as a whole, and is never overwritten.

The foundation's separate `feedback.ts` / `claudeCodeUsage.adviceEffectiveness.feedback.v1` event ledger remains for compatibility tests, but it is not the integrated UI's write target and is not silently merged into the v2 envelope. Any future migration needs a separately reviewed one-time import; code must not dual-write in the meantime.

## 7. Before/after comparison and “no conclusion without enough evidence”

`compareAdviceEffectiveness` is a pure function with no I/O. Every before/after pair must match on task kind, complexity band, provider, model family, effort, metric definition, quality rubric, and primary metric name/unit/direction; the whole cohort must match as well. One bad pair makes the complete comparison `insufficient-evidence` instead of being silently dropped.

The comparison entry point first selects a stable recommendation lineage by `provider + recommendationId`; it does not truncate history on the date-varying `adviceId`. Each pair still retains `adviceId` as an audit field for the individual advice instance. The same recommendation can therefore span observation days, while the downstream pure comparator still rejects a mixed task kind, complexity, model, effort, metric-definition, quality-rubric, or primary-metric cohort. It never drops incompatible pairs merely to reach the sample threshold.

The default policy requires:

- at least 5 comparable pairs;
- complete before/after coverage;
- confidence above low/unknown;
- no unresolved, non-allowlisted quality flag;
- a finite non-negative primary metric and a non-zero baseline;
- a 0..1 quality score, explicit pass/fail, and at least one quality evidence item on both sides; the baseline must pass its rubric;
- at least 10% mean relative primary-metric improvement;
- every after task passing, a mean after quality of at least 0.8, and no more than 0.02 mean quality regression.

The only results are `insufficient-evidence`, `quality-guardrail-failed`, `improved`, and `no-demonstrated-improvement`. Even `improved` is a controlled paired observation, not proof of causation. Production pairing consumes only sanitized, already materialized task-level structural observations and requires an applied timestamp plus an exact cohort match. It writes a bounded, versioned comparison-result envelope and never records prompt, response, path, raw session ID, or task body. Without a reliable before/after pair and quality evidence, the UI remains explicitly `insufficient-evidence`.

## 8. Evidence interpretation boundaries

### Long sessions, large context, and `/clear`

- A “long session” is locally classified as active for at least 8 hours; “large context” means peak context of at least 150k.
- Both shares use session counts from the same rolling window.
- A conditional `/clear` recommendation appears only when both “at least 2 affected sessions” and “at least 25% share” hold.
- Its condition is that the next task is genuinely unrelated; its stop condition preserves the current context if prior material is still needed.
- These are structural proxies. They prove neither waste nor that `/clear` caused an improvement.

### Topic drift

There is no topic-drift observer, and the code does not infer semantic drift from session duration, context size, or body-free aggregates. Even after separate prompt-sample consent, current code only places visible samples in the sealed snapshot. Until the host adds a separately privacy-reviewed topic-drift observation/evidence ID, a remote model must not present topic drift as established evidence or generate a deterministic recommendation from it.

### Framework origin and overhead proxy

The loader uses structural fields and allowlisted wrapper/command/system markers to distinguish user-authored from framework-origin content, retaining only token/count aggregates after classification. A tool-result body enters the `observedInputEstimatedTokens` denominator once and does not ordinarily enter the numerator; a fixed tool-result envelope may enter the framework numerator. A Skill body used as a skill-preamble proxy is not counted again in the denominator.

The adapter accepts only `frameworkEstimatedTokens`, `observedInputEstimatedTokens`, and `classifiedEvents`. All must be finite and non-negative, event count must be an integer, and framework tokens cannot exceed observed tokens. `framework-overhead-share = frameworkEstimatedTokens / observedInputEstimatedTokens`, its method is always `structural-proxy`, and it carries an overlay limitation.

This share cannot assess the quality of the user's writing, identify topics, automatically generate rewrite advice, or be treated as removable cost. It may enter the Claude aggregates-only payload through the metric allowlist, but component text and hostile extra fields do not.

### Model rightsizing

Model rightsizing is only a typed, reversible experiment seam. It permits `opus → sonnet` or `sonnet → haiku`, and rejects two-tier changes, upgrades, and undeclared families. It does not claim that a smaller model is necessarily cheaper or better, and does not turn a short-output proxy into a model-switch directive.

Comparison requires a local `applied` mark and a helpful/not-helpful rating, followed by at least 5 comparable pairs. Its target is 10% primary-metric improvement while retaining the 0.8 minimum quality and 0.02 maximum-regression guardrails. If quality regresses, the stop condition is to restore the baseline model.

## 9. Unified AI compatibility matrix

| Existing capability | Current production-candidate behavior | Boundary |
| --- | --- | --- | --- |
| `claudeCodeUsage.getAdvice` | Opens/reveals the unified Content surface; when disabled it offers the Settings entry | No model call, legacy summary, scope dialog, or Markdown output |
| AI Advice remote personalization | Prepare full provider body → exact preview → explicit Send → strict JSON/reference parser → Advice contract | Aggregates-only by default; prompt/context requires separate consent; configured BYOK only |
| Prompt Optimizer | Prepare user-draft-only provider body → exact preview → explicit Send → strict marker/settings parser → local result | Same sender/cancellation/feedback boundary; no persistent first-run authorization and no parser fallback |
| Former `advisor.ts#callModel` / `getUsageAdvice` shortcuts | Removed from the candidate | The packaged module exports only the already-prepared sender; there is no prepare-and-send preview bypass |
| `legacyBridge.ts`, `adviceSummary.ts`, demo/preparation modules | No production import; compiled artifacts explicitly forbidden from the VSIX | Readiness/reference code only, never a default or third sender |

Aggregate and prompt-personalization consent remain separate. Prompt Optimizer does
not borrow either consent: its authorization is the user's visible draft preview plus
the separate Send click for that opaque Prepared snapshot. None of these local choices
authorizes a later background request.

## 10. Strict parsing and the production BYOK boundary

`parseStructuredAdviceOutput` accepts exactly one bounded, exact-shape JSON object. It rejects Markdown fences, surrounding prose, unknown fields, unknown observation/evidence references, duplicate IDs, oversized arrays/text, missing conditional actions, missing success criteria or quality guardrails, and unsupported versions. It does not strip fences, repair JSON, return a partial batch, or call legacy Markdown/Optimizer fallbacks. An empty `recommendations` array is a valid fail-closed result.

`parseStrictOptimizerOutput` independently requires the exact `===PROMPT===` and
`===SETTINGS===` sections plus three bounded settings lines. It does not accept a
marker-free response as a prompt. The two feature-specific parsers converge after
the shared Prepared transport and both fail closed without displaying raw fallback
text.

The production request chain is:

1. The host creates and retains one `PreparedAiInvocation` containing the complete provider HTTP JSON body.
2. The user reviews the exact decoded body, UTF-8 byte count, content type/data mode, and SHA-256.
3. A separate Send click passes the same object, source revision, and consent generation to `sendPreparedAiInvocation`.
4. That boundary accepts only `backend: api` plus a non-empty user-configured key and sends to the endpoint frozen into the Prepared object.
5. Fetch retry and curl fallback reuse the same canonical body bytes; no caller rebuilds the request from webview text.
6. The shape-specific strict parser runs before any result or recommendation is rendered.

Claude Code OAuth credentials remain scoped to the existing usage/quota API. OAuth
and subscription credentials are not approved AI backends; production configuration
and the Prepared sender both require BYOK `api`. Advice/Optimizer never expand OAuth
scope, read another credential source, or repurpose a quota token as a model token.

## 11. Release acceptance gates

Before anyone changes a default or publishes the candidate, all of the following must hold.

### Safety and privacy

- Fresh-install, upgrade, and corrupt-state tests prove that the feature flag and both consents default closed.
- Aggregates-only shape snapshots and hostile-sentinel tests prove there is no prompt/response/path/session/raw-record/tool-argument/credential leakage.
- Prompt samples appear only after the second explicit consent, with tests for limits, extra-field removal, and invalidation of old snapshots after consent withdrawal.
- Preview body, canonical bytes, UTF-8 count, SHA-256, and production-sender object-identity tests pass; the send path cannot reserialize.
- Both AI surfaces retain the explicit Send action, BYOK-only configuration, redacted errors, feature-off host gate, cancellation, and no-telemetry guarantees.
- Codex remote eligibility remains false under test.

### Effectiveness and failure policy

- Focused and affected-repository tests pass for the contract, adapters, pairing/result envelopes, migration, Prepared transport, both strict parsers, and reversible feedback.
- A rotating cross-day `adviceId` does not reset one `provider + recommendationId` lineage; mixed task/model/effort/metric-version/rubric cohorts still fail closed as a whole.
- Fewer than 5 pairs, incomparable context, insufficient coverage/confidence/quality, zero baseline, and unresolved flags all return `insufficient-evidence`.
- Quality regression takes precedence over token/cost improvement, and UI copy never turns correlation into causation.
- Malformed, fenced, oversized, or unknown-reference model output displays neither a partial recommendation nor a free-text fallback.
- Topic drift remains unsupported without separate host evidence; framework overhead never triggers writing-quality advice.

### UI, i18n, and release verification

- All user-visible copy and placeholders exist in all eight locales with matching privacy meaning.
- Keyboard reachability, visible focus, labels/roles/live status for consent, feedback, and preview, and screen-reader reading order are verified.
- Visual snapshots count as evidence only after the webview harness provides real built-in-theme values for every production `--vscode-*` CSS variable.
- Every consent, disclosure, feedback, and snapshot state has an operation → reload → persists/invalidates test.
- Complete an F5 Extension Development Host smoke test, feasible Playwright/screenshot review, `npm run compile`, the full `npm test`, VSIX packaging, and the macOS/Linux installed-VSIX smoke required for a release candidate.
- Verify the current CHANGELOG/README candidate wording against the packaged behavior, without changing the version or release workflow.

The operation → full reload → persistence/invalidation tests must continue to cover
consent, per-recommendation and Optimizer feedback, source/config changes, feature
disablement, surface close, and local-data clear. A stale opaque snapshot must never
be retrievable after any invalidating event.

## 12. Current limitations and next step

- A sealed preview is still local; only the separate Send click creates the production BYOK network request.
- Real comparison production currently depends on sanitized materialized task-level structural and quality evidence. Missing or incomparable observations remain `insufficient-evidence`.
- The remote advice parser accepts model-authored recommendation IDs after strict shape/reference validation; host policy must continue preventing unsupported evidence from being presented as `/clear` or another deterministic action.
- Advice renders and closes feedback/comparison state for every recommendation, not only the first. Optimizer shares feedback but does not currently enter comparable-task comparison.
- Topic drift and writing quality have no local semantic evidence.
- Codex has no remote payload schema and remains local-only.
- Framework origin is a structural proxy; log schema drift may reduce coverage and must not be filled with guesses.
- `advice.userContext` and prompt samples enter a request only under separate prompt-personalization consent and exact preview; aggregates-only payloads contain neither.
- The separate feedback v1 ledger is not automatically imported into the v2 envelope.

The production rule is stable: resolve only a host-retained Prepared object from its
opaque snapshot ID, send only through `sendPreparedAiInvocation`, and render only a
strictly parsed result. Never wire through webview body text, `getAdvice`,
`buildAdviceSummary`, the removed `getUsageAdvice` / `callModel` shortcuts, or
`legacyBridge`.

## 13. Release-line statement

This candidate remains isolated from release actions. It has not pushed, merged, tagged, or published anything and changes no version number, release workflow, or release entry point. Candidate code may enter a local VSIX for verification; default enablement, publishing, or any version action still requires separate maintainer approval.

---
🤖 Generated with [OpenAI Codex](https://developers.openai.com/codex/)
