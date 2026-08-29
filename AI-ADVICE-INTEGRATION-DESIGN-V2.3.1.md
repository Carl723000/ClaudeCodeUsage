# v2.3.1 AI Advice Effectiveness: Experimental UI Design Plan

> Status: v2.3.1 integration candidate only. The feature flag is off by default;
> this document is not a current-release commitment.

## Goal and boundaries

The UI answers one question: can a user see which local evidence supports an
advice candidate, exactly what would leave the device, and how effectiveness
would be judged before opting in? It extends the existing AI Advice and Prompt
Optimizer cards on the Content tab instead of adding a third top-level entry.

Both features are off by default and create no AI network work while disabled.
When enabled, AI Advice and Prompt Optimizer use the same interaction grammar:
prepare a complete provider HTTP JSON body, preview its exact UTF-8 bytes, require
a separate explicit Send click, strictly parse the response, and offer reversible
local helpful / not-helpful / applied feedback. There is no automatic or default
model request.

## Visual system

- **Color:** use existing VS Code theme tokens only. Background and copy use
  `--vscode-editor-background` / `--vscode-foreground`; borders and secondary
  copy use `--vscode-panel-border` / `--vscode-descriptionForeground`; actions
  and focus use `--vscode-button-background` / `--vscode-focusBorder`; the
  snapshot uses `--vscode-editorWidget-background`. Light+ and Dark+ remain
  host-owned, with no new gradient or hard-coded brand accent.
- **Type:** explanatory copy uses `--vscode-font-family` at the existing 13px
  density. Metrics, byte counts, and JSON use `--vscode-editor-font-family`.
  Small 10–11px status stamps never carry meaning by color alone.
- **Spacing:** reuse `.action-card`, `.model-details-stacked`, and the existing
  button/input rhythm. Avoid a new oversized KPI-card language.
- **Signature:** one continuous evidence spine joins five ordered stages. The
  sealed snapshot header reads `SEALED · N BYTES · SHA-256`, and its body is
  decoded verbatim from the same canonical UTF-8 bytes.

## Information architecture and wireframe

Wide layout:

```text
┌ AI advice effectiveness (experimental) ──────────────────────────┐
│ [Observed] ─── [Evidence] ─── [Advice] ─── [Action] ─── [Result] │
│   values          strength       conditional   local feedback     │
│                                                   sample/guardrail│
│                                                                  │
│ □ Allow aggregates only   □ Allow prompt samples (separate, off) │
│ [Create sealed snapshot]                                         │
│ ▾ SEALED · 1248 BYTES · SHA-256 · AGGREGATES ONLY                │
│   {"schemaVersion":1,...}                                        │
│ [Send prepared request]  (disabled until a valid preview exists) │
│ Helpful ○  Not helpful ○  Applied ○                              │
└──────────────────────────────────────────────────────────────────┘
```

At narrow widths the five stages stack vertically and the spine becomes a left
rail. Consent controls and actions wrap naturally. JSON scrolls horizontally;
actual transmitted bytes are never compressed or elided.

## Interaction and accessibility

- Aggregate consent and prompt-personalization consent are separate values in
  version-migrated VS Code `globalState`. Both start off; prompt consent is
  disabled until aggregate consent is selected. Every included prompt is
  visible in the sealed snapshot.
- “Create sealed snapshot” asks the extension host to prepare the object. The
  host rechecks the flag and consent, serializes the complete provider body once,
  and retains its canonical UTF-8 bytes. Preview text, byte count, and SHA-256 all
  come from that object. The separately clicked Send action resolves the opaque
  snapshot ID and passes the same Prepared object to the sole production BYOK
  transport; it cannot rebuild a request from webview text.
- Prompt Optimizer has the same preview and Send stages. Its body contains only
  the pasted draft plus the fixed optimizer system instruction and configured
  model fields; it has no persistent “first-run authorization.”
- Advice output uses the strict evidence-referencing JSON parser. Optimizer output
  uses its strict marker/settings parser. Neither repairs malformed output or
  falls back to free-form prose.
- Helpful / not helpful / applied are native buttons with `aria-pressed` for
  every advice recommendation and for an Optimizer result. Selecting an active
  button again withdraws that value. Helpful and not helpful are mutually
  exclusive; applied is independent. All mutations use the same bounded local
  `globalState` envelope and never enter a remote payload.
- Every action is keyboard reachable. Headings, lists, `fieldset` / `legend`,
  `aria-live`, and VS Code focus tokens give screen-reader and focus semantics.
  Consent, disclosure, and provider UI state survive a webview reload.
- The result stage says “insufficient evidence” until comparable sample and
  quality guardrails are met; a one-off movement is never called effective.

## Content and privacy rules

- The default route carries same-window aggregate numbers, coarse model families,
  allow-listed metrics, confidence, and evidence references only. It never accepts
  or serializes raw sessions, per-record data, prompts, responses, project paths,
  cwd values, or stable session IDs.
- Long sessions use elapsed-duration as a proxy; large context uses numeric token
  thresholds. A conditional “start a new session / `/clear` at a stable task
  boundary” action appears only when deterministic thresholds and sample rules pass.
- Topic drift is semantic. It may enter the AI Advice model request only after
  separate prompt-personalization consent, with every included prompt visible in
  the exact preview. The host never infers drift from body-free signals.
- Strict parse failure, unknown persistence versions, damaged state, or incomplete
  evidence closes the result and never produces a permissive fallback suggestion.
- `claudeCodeUsage.getAdvice` only reveals the unified Content surface. It does
  not call a model, build a legacy summary, or open a separate Markdown result.
- `legacyBridge.ts`, `adviceSummary.ts`, and the demo/preparation modules have no
  production import and are excluded from the VSIX. They are neither a default
  transport nor a third sender.
- Only the configured Anthropic/OpenAI-compatible BYOK endpoint may receive these
  requests. Claude Code OAuth/subscription credentials are not an AI backend, and
  no preview, refresh, timer, or background task sends a model request.

## Design critique and revision

An early direction risked becoming another generic dashboard and a third isolated
experience. The revision embeds the evidence chain in the existing Advice card and
applies the same preview, Send, strict-result, and feedback grammar to Prompt
Optimizer. The only new visual signature is the sealed byte snapshot because it
directly supports privacy review. Narrow layouts, keyboard use, screen readers, and
theme changes remain candidate checks; with either feature disabled, its host
message seam fails closed and creates no AI network resource.
