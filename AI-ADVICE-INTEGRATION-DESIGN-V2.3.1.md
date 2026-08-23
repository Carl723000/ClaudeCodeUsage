# v2.3.1 AI Advice Effectiveness: Experimental UI Design Plan

> Status: v2.3.1 integration candidate only. The feature flag is off by default;
> this document is not a current-release commitment.

## Goal and boundaries

The UI answers one question: can a user see which local evidence supports an
advice candidate, exactly what would leave the device, and how effectiveness
would be judged before opting in? It joins the existing AI Advice / Codex local
optimization areas on the Content tab. It does not add a third top-level entry,
replace Prompt Optimizer, or remove the existing BYOK path.

Nothing is rendered while the experiment is off. Enabling it still performs no
automatic network call. This iteration provides an exact sealed payload preview,
local feedback, and evidence-bound result states, with no send button or production
endpoint.

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
  host rechecks the flag and consent, serializes once, and retains canonical
  UTF-8 bytes. Preview text is decoded from those bytes; byte count and SHA-256
  are derived from the same bytes; a future transport may consume only that
  Prepared object and cannot reserialize it.
- Helpful / not helpful / applied are native buttons with `aria-pressed`.
  Helpful and not helpful are mutually exclusive; applied is independent. The
  events write only to VS Code `globalState`.
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
- Topic drift is semantic. It may enter a future model path only after separate
  prompt-personalization consent, with every prompt visible in the exact preview.
  This iteration never infers drift from body-free signals.
- Strict parse failure, unknown persistence versions, damaged state, or incomplete
  evidence closes the result and never produces a permissive fallback suggestion.

## Design critique and revision

An early direction risked becoming another generic dashboard and a third isolated
experience. The revision embeds the experiment in the existing Advice / Codex card,
reuses the action-card language, and makes one continuous evidence spine express the
evidence boundary. The only new visual signature is the sealed byte snapshot because
it directly supports privacy review. Narrow layouts, keyboard use, screen readers,
and theme changes are launch checks; with the flag off, the current UI is unchanged.
