# v2.3.1 AI Advice Effectiveness: Integration Handoff

Companion documents: [中文交接说明](AI-ADVICE-INTEGRATION-V2.3.1.zh-CN.md) · [English handoff](AI-ADVICE-INTEGRATION-V2.3.1.md)

Related design: [中文设计说明](AI-ADVICE-INTEGRATION-DESIGN-V2.3.1.zh-CN.md) · [English design](AI-ADVICE-INTEGRATION-DESIGN-V2.3.1.md)

## 1. Status and safety conclusion

This branch provides a **default-off v2.3.1 candidate foundation and experimental integration**, not a shipped feature. It prepares an “Observation → Evidence → Advice → Action → Result” evidence chain inside the existing shared Claude/Codex dashboard, but adds no production AI endpoint, makes no automatic model call, sends no telemetry, and exposes no send button.

The current safety boundary is:

- `advice.effectiveness.enabled` defaults to `false`; while off, the extension does not build or show the experimental panel.
- The new path currently runs entirely locally. Its remote portion stops at an inspectable sealed snapshot and an unwired BYOK bridge.
- Claude can create a remote preview only after separate explicit aggregate consent; its default mode is `aggregates-only`.
- “Attach user prompt samples” is a second, independent, default-off consent. It cannot be granted unless aggregate consent is also granted.
- Codex advice remains `local-only` and cannot create a remote snapshot.
- The default aggregate path does not accept, transmit, or persist raw conversation records, raw session IDs, absolute or project paths, prompt/response bodies, tool arguments, credentials, or local usernames. Only the second explicit consent can place origin-filtered, bounded prompt samples into one in-memory snapshot; prompt text is never written to `globalState`.
- Failure does not produce plausible-looking advice: invalid evidence, invalid local state, transport failure, or structured-output failure all fail closed.

The existing `Get AI Advice` and Prompt Optimizer remain separate legacy features. Their compatibility boundaries are documented in section 9; they must not be represented as satisfying the new path's sealed-payload or strict-parser guarantees.

### 2026-08-27 main-roadmap alignment

This task has read and aligned with `feature-coverage-matrix.md`,
`parallel-development-handoff.md`, and `github-connected-roadmap.md` under the main
repository's `decision-reports/2026-08-24-release-roadmap/`. The actual commit chain is
R8 `48e5e77` → foundation cherry-pick `91739a8` → integration `20466a7`. Commit
`c7a95d9` on `codex/v2.3.1-ai-advice-validity-foundation` has the same patch as
`91739a8` but is based on old commit `0b4b750`; it must not be branch-merged or
cherry-picked again.

The final Claude #87 incremental index is not on this branch. A clean candidate,
`2584173`, appeared on 2026-08-27, but it diverges substantially from R8 and also
changes `dataLoader.ts`, `extension.ts`, Codex backfill, and architecture documents.
It is not a small patch to import here. A final candidate must first inherit the
released v2.2.3 #87/#89/#92 work and stable v2.3.0, then selectively replay this
branch's contract, adapter, persistence, host-wiring, and UI layers. This prototype
is not the final integration baseline.

## 2. Implementation map and ownership

| Responsibility | Current integration point | Constraint |
| --- | --- | --- |
| Unified advice contract | `src/adviceEffectiveness/contract.ts` | The host owns observations, evidence, privacy, and provenance; advice must reference known evidence |
| Claude / Codex adaptation | `src/adviceEffectiveness/adapters.ts` | Accepts narrow DTOs only; Codex never enters a remote payload |
| Canonical payload | `src/adviceEffectiveness/payload.ts` | Serializes allowlisted fields only; omits `promptSamples` by default |
| Host-sealed snapshot | `src/adviceEffectiveness/integration.ts` | The same Prepared object feeds preview and future send; the module has no transport |
| Local state and migration | `src/adviceEffectiveness/versionedPersistence.ts` | VS Code `globalState`, exact schema, fail closed |
| Before/after comparison | `src/adviceEffectiveness/comparison.ts` | Pure function, paired comparable tasks, quality guardrail, no causal claim |
| Reversible model experiment | `src/adviceEffectiveness/modelExperiment.ts` | One adjacent downward tier only, at least five pairs |
| Strict model output | `src/adviceEffectiveness/structuredOutput.ts` | JSON-only, exact shape, known references, no repair/fallback |
| Sole future BYOK seam | `src/adviceEffectiveness/legacyBridge.ts` | `backend: api` only; production code does not call it |
| #87 evidence preparation plan | `src/adviceEffectiveness/evidencePreparation.ts` | Pure and I/O-free; disabled and aggregates-only modes never request content scans, and a missing personalization snapshot only yields an explicit-refresh request |
| Legacy personalization migration preparation | `src/adviceEffectiveness/legacyPersonalization.ts` | userContext/prompts remain in a host-memory draft; no projection exists without the second consent; production does not call it |
| Framework-origin classification | `src/promptOrigin.ts`, `src/dataLoader.ts` | Structural markers are aggregated immediately; no semantic or writing-quality judgment |
| Thin host / UI wiring | `src/extension.ts`, `src/webview.ts` | Feature flag, host-only prompts, opaque snapshot, local feedback |

## 3. Unified advice contract

`AdviceContract` separates an advice artifact into six auditable parts:

1. `observations`: finite numeric or boolean observations with a stable metric, unit, method, and source ID.
2. `evidence`: references observations, declares direct/correlational/proxy strength, and states limitations for proxies.
3. `recommendations`: references evidence and includes an explanation, conditional actions, stop conditions, and success criteria.
4. `privacy`: records local-only / aggregates-only / aggregates-with-prompt-samples mode, prompt consent, and the local-feedback boundary.
5. `provenance`: generation method, time, locale, sources, scope/window, confidence, and machine-readable quality flags.
6. `schemaVersion` and stable opaque IDs: support strict parsing, migration, and comparison without carrying free-text identity data.

The host always owns observations, evidence, privacy, and provenance. A future remote model may return only `recommendations`, and every observation/evidence reference must already exist; the model cannot manufacture measurements, rewrite provenance, or claim higher confidence. An empty recommendation array is valid and preferred to guessing.

## 4. Adapters and provider boundaries

### Claude

`adaptClaudeAdvice` accepts two narrow data sets for exactly the same scope and rolling window:

- a coarse usage aggregate containing token, message, estimated-cost, and coarse model-family totals;
- a numeric session summary containing total, long, and large-context session counts.

The adapter type does not accept raw records, paths, session IDs, titles, or prompts. `extension.ts` reduces records to the DTO locally before invoking it. A scope/window mismatch, out-of-range count, or non-finite value rejects the entire result.

Claude's structural evidence is eligible for a sealed remote preview, but only after separate explicit aggregate consent.

### #87 incremental-index dependency

When this R8 prototype is enabled, it still filters `cache.records` and recomputes
usage aggregates and session breakdowns. The default-off state adds no current-release
cost, but this path cannot ship in v2.3.1. The final integration must consume a
same-window aggregate, session summary, coverage, and quality state materialized by
the stable #87 `ClaudeUsageIndex`. Prompt samples and framework overhead must come
from the same per-file analysis contribution; advice must never trigger another JSONL
scan.

`planAdviceEvidencePreparation` now records that boundary as an I/O-free typed seam.
Local rendering and aggregates-only mode consume existing data only. Prompt
personalization checks a content snapshot only after both consents are explicit and
the user asks to preview or send. A missing, stale, or mismatched snapshot yields a
`refresh-content-analysis` host-action request while `allowAutomaticScan` remains
fixed to `false`; the function never reads files or starts a refresh. It remains
unwired until the final stable index exists.

### Codex

`adaptCodexLocalAdvice` maps only existing R8 structural numeric signals such as fresh shares, cache share, processed/fresh multiples, and post-patch tool intensity. It uses only an insight's allowlisted `kind`, `scope`, and `proxy` fields plus a separate numeric behavior DTO; open-ended evidence objects and strings such as `observedEffort` do not enter the unified contract.

If index, identity, or period coverage is incomplete, or unresolved quality flags exist, source confidence becomes `unknown` and the adapter returns observations/evidence but no recommendations. `remoteEvidenceEligible` is always `false` and must stay that way until a provider-discriminated Codex aggregate contract receives a separate privacy review.

## 5. Sealed canonical payload

`prepareAdvicePayload` builds the object once and produces a single canonical JSON serialization by recursively sorting keys. It rejects non-finite numbers and unsupported values, then derives exactly once:

- `serializedBody`: the exact canonical UTF-8 JSON string;
- `canonicalBytes`: the bytes encoded once from that string;
- `sha256`: the lowercase hexadecimal SHA-256 of those bytes;
- `utf8Bytes`: `canonicalBytes.byteLength`, shown in preview;
- `contentType`, `dataMode`, and prompt sample count.

SHA-256 is a snapshot identity/integrity digest, not a signature and not proof that a server is trustworthy. Its purpose is to let people and tests verify that the reviewed preview and the future transmitted bytes are the same sealed object.

Required invariants are:

- `preview.body === UTF8.decode(prepared.canonicalBytes) === prepared.serializedBody`;
- `preview.utf8Bytes === prepared.canonicalBytes.byteLength`; JavaScript character count is not a substitute;
- `preview.sha256 === SHA256(prepared.canonicalBytes) === prepared.sha256`;
- preview and the future sender both recompute and check body/bytes/digest before use; mutation of any field rejects the complete object;
- a future sender must receive the same host-retained `PreparedAdvicePayload` / `canonicalBytes`; it must not reserialize webview text or an ordinary object;
- the host exposes only the body, byte count, digest, and non-sensitive metadata to the webview, while retaining the Prepared object in memory behind an opaque snapshot ID;
- provider refresh, consent changes, panel close, or explicit discard invalidate old snapshots.

The default snapshot is `aggregates-only`, and its JSON omits the `promptSamples` key entirely. Only a second explicit prompt consent adds plain `{id,text}` samples; per-sample and total limits apply, and runtime cwd, IDs, or extra fields are discarded. There is currently no sender or network call.

## 6. Local feedback and versioned persistence

The experimental UI's only write target is `ccu.adviceEffectiveness.localState` in VS Code `globalState`, currently schema version 2. The v2 envelope permits only:

- feature mode and two consent enums;
- opaque validated advice / recommendation / pair / rubric / metric IDs;
- `helpful` / `not-helpful` / `unrated` and `applied` / `not-applied` enums;
- bounded finite numbers, epoch timestamps, provider/context/quality enums, and allowlisted quality flags.

It accepts no prompt, payload, explanation, endpoint, path, raw session ID, or arbitrary free text. Feedback is capped at 500 entries and comparable pairs at 200.

`helpful` and `not-helpful` are mutually exclusive for one recommendation; `applied` is independent and may coexist with either rating. All feedback stays local, never enters a payload, and emits no telemetry.

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

The only results are `insufficient-evidence`, `quality-guardrail-failed`, `improved`, and `no-demonstrated-improvement`. Even `improved` is a controlled paired observation, not proof of causation. Automatic task pairing and real quality scoring are not yet authorized; the interface currently accepts only host-validated, versioned pairs. Production code currently has no runtime caller of `appendStoredComparablePair`, so the UI truthfully remains inconclusive without externally validated pairs and never auto-records tasks, sessions, or prompts.

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

## 9. Legacy AI compatibility matrix

| Existing capability | Current behavior | Relationship to the new path | Migration rule |
| --- | --- | --- | --- |
| `claudeCodeUsage.getAdvice` | Explicit user action; scope selection; legacy summary + BYOK model; opens Markdown output | Preserved, but does not use the unified contract, sealed bytes, separate prompt consent, or strict JSON parser | The experimental entry must not forward to this command; a future migration must use the sole structured bridge |
| `advisor.ts#getUsageAdvice` | Produces free-form Markdown advice | Legacy output, not a verifiable recommendation batch | Keep for legacy behavior; never use as a new-parser fallback |
| `advisor.ts#callModel` | Existing Anthropic/OpenAI-compatible BYOK transport; still defines a dormant subscription type | Reused only as a low-level legacy transport; the new bridge enforces `backend: api` at runtime | Add no endpoint; never pass OAuth tokens or subscription model/provider fields |
| `adviceSummary.ts#buildAdviceSummary` | Builds a prose digest; the legacy path may include recent prompt samples | Does not satisfy the remote allowlist, same-source canonical preview, or separate prompt consent | Keep legacy compatibility but never call it from the new UI; decide deprecation only after migration |
| Prompt Optimizer | Sends only the pasted draft; has its own first-run consent; missing markers fall back to the whole output as a prompt | A separate text-rewrite tool, not evidence-effectiveness advice | Preserve its existing fallback only for Optimizer; never reuse it for structured advice |
| `legacyBridge.ts` | Currently unwired; receives a Prepared payload, decodes the user turn from the same canonical bytes, and strict-parses the response | The sole allowed future BYOK seam for the new evidence chain | The host may call it only after separate approval of network wiring |

The legacy `getAdvice` / `adviceSummary` prompt behavior is a historical compatibility boundary and must not be described as the new path's privacy guarantee. The new aggregate and prompt-sample consents are not interchangeable with old Optimizer consent or any legacy configuration boolean.

`legacyPersonalization.ts` prepares only the A-20 migration seam and does not change
legacy runtime behavior. It rebuilds `advice.userContext` and candidate prompt
samples into a bounded, host-only draft, drops cwd, session IDs, and unknown fields,
and classifies sample age as within-window, older-than-window, or unknown. No content
means no migration; any content requires the new prompt-personalization consent.
`projectLegacyPersonalization` returns `undefined` without that consent and emits an
allowlisted, verbatim-previewable projection only after explicit consent. It also
revalidates the complete in-memory draft before projection, rejecting extra fields
and inconsistent metadata. The projection is not yet part of the canonical payload,
so A-20 remains partially prepared rather than wired.

## 10. Strict parsing and the OAuth 403 boundary

`parseStructuredAdviceOutput` accepts exactly one bounded, exact-shape JSON object. It rejects Markdown fences, surrounding prose, unknown fields, unknown observation/evidence references, duplicate IDs, oversized arrays/text, missing conditional actions, missing success criteria or quality guardrails, and unsupported versions. It does not strip fences, repair JSON, return a partial batch, or call legacy Markdown/Optimizer fallbacks. An empty `recommendations` array is a valid fail-closed result.

`requestStructuredAdviceViaLegacyByok` is the sole future wiring point:

1. The host creates and retains the same Prepared/Sealed object.
2. The user reviews its body, UTF-8 byte count, and SHA-256.
3. A separately approved explicit send action passes that Prepared object and known reference IDs to the bridge.
4. The bridge accepts only `backend: api`, `apiFormat`, non-empty apiKey/apiUrl/model, and bounded optional fields.
5. The model user content is exactly `prepared.serializedBody`.
6. The response goes only through the strict parser; any failure produces no advice.

The bridge rejects hostile casts containing `backend: subscription`, `getSubscriptionToken`, `subscriptionModel`, or any other unknown field.

Claude Code OAuth credentials remain scoped to the existing usage/quota API. Historical direct Messages model calls with an OAuth token returned `403 Request not allowed`, so OAuth is not an approved AI backend. The dormant subscription branch in `advisor.ts` does not imply production support: production configuration is fixed to BYOK API, and the bridge rejects subscription at both type and runtime boundaries. Advice must not expand OAuth scope, read additional credentials, or repurpose a quota token as a model token.

## 11. Release acceptance gates

Before anyone changes a default, adds a send button, or calls the feature shipped, all of the following must hold.

### Safety and privacy

- Fresh-install, upgrade, and corrupt-state tests prove that the feature flag and both consents default closed.
- Aggregates-only shape snapshots and hostile-sentinel tests prove there is no prompt/response/path/session/raw-record/tool-argument/credential leakage.
- Prompt samples appear only after the second explicit consent, with tests for limits, extra-field removal, and invalidation of old snapshots after consent withdrawal.
- Preview body, canonical bytes, UTF-8 count, SHA-256, and future-sender object-identity tests all pass; the send path cannot reserialize.
- Remote enablement receives a separate privacy/security review, an explicit user send action, a BYOK-only configuration audit, redacted errors, and a no-telemetry verification.
- Codex remote eligibility remains false under test.

### Effectiveness and failure policy

- Full unit coverage passes for the contract, Claude/Codex adapters, comparison, model experiment, migration, and strict parser.
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
- If this later becomes a user-visible release, update CHANGELOG and all seven README files as a separately authorized release task; that work is not implicitly authorized by this candidate branch.

The operation → full reload → persistence/invalidation gate is not yet complete.
Existing tests cover post-host-reply page state and independent `globalState`
read/write behavior, but not a real full-page replacement after consent or feedback,
nor host retrieval failure for an old opaque snapshot after consent withdrawal. The
final candidate must add those tests and must not report this gate as passed today.

## 12. Current limitations and next step

- The new panel has no production sender; a sealed preview does not mean data was sent.
- Automatic comparable-task generation/matching and real quality-rubric collection are not implemented; only strict storage and pure comparison interfaces exist.
- Current Claude host wiring still recomputes from `cache.records`; final v2.3.1 must use the stable #87 materialized aggregate/coverage seam and prove advice causes no extra JSONL body reads.
- The remote parser strictly validates shape and references, but host-owned recommendation lineage/type and success policy are not yet locked. A model must not invent cross-day IDs or wrap unrelated evidence in a `/clear` recommendation.
- The Codex adapter may produce multiple recommendations, while the experimental UI currently closes feedback/comparison around the first only. The final candidate needs per-recommendation closure or one auditable host-owned selection rule.
- Full-reload persistence for consent/feedback and old-snapshot invalidation after consent withdrawal still lack end-to-end tests.
- Topic drift and writing quality have no local semantic evidence.
- Codex has no remote payload schema and remains local-only.
- Legacy `Get AI Advice` and Prompt Optimizer have not migrated to the unified contract and retain their historical parsing behavior.
- Framework origin is a structural proxy; log schema drift may reduce coverage and must not be filled with guesses.
- `advice.userContext` and sample age have only an unwired host-only migration seam; aggregates-only payloads still contain neither.
- The separate feedback v1 ledger is not automatically imported into the v2 envelope.

The minimum future wiring sequence is: first complete the gates above and a network privacy review; then let the host resolve the same Prepared object from its opaque snapshot ID and call only `requestStructuredAdviceViaLegacyByok`; after strict parsing, let the host assemble the complete `AdviceContract`. Do not wire through webview body text, `getAdvice`, `buildAdviceSummary`, `getUsageAdvice`, or Prompt Optimizer.

## 13. Release-line statement

This candidate is based on a clean R8 baseline and remains isolated. This integration preparation has not merged, pushed, or released anything, and it changes no version number, release workflow, or release entry point. README and CHANGELOG are untouched. `package.json` contains only a safety clarification to the existing API-key setting description, not a version change. Any later default enablement, network wiring, documentation publication, or version action requires separate maintainer approval.

---
🤖 Generated with [OpenAI Codex](https://developers.openai.com/codex/)
