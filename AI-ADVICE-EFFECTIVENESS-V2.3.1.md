# v2.3.1 AI 建议有效性基础：接入与迁移说明

## 状态与边界

本基础开发从独立 worktree 的 `0b4b750`（tag `v2.2.0`）开始。R8 worktree
`codex/v2.3.0-energy-efficiency`（`48e5e77`）只用于核对未来接口，没有复制或修改。

本提交不会改变当前 UI、设置、版本号、发布 workflow 或网络入口。新增代码没有被
`extension.ts`、`advisor.ts`、`webview.ts` 或 settings 引用，因此默认完全 inert。
当前旧 AI Advice/Optimizer 行为也保持不变；迁移必须在 v2.3.1 的独立 feature flag
下完成，并经过单独的 UI、隐私和多语言评审。

## 新增核心

### `src/adviceEffectiveness/contract.ts`

`AdviceContract` 是 provider-neutral 的 v1 契约，统一保存：

- host 生成的本地 observation 与 evidence；
- direct / correlational / proxy 证据强度；
- AI 只能引用已有证据的 explanation；
- 带 `when` 与 stop condition 的 conditional action；
- 带最小可比任务数与质量 guardrail 的 success criterion；
- host 盖章的 privacy、source、confidence、quality flags 与 provenance。

模型不能提供 observation、evidence、privacy 或 provenance。`createAdviceContract()`
只在整个引用图和隐私声明一致时返回 `{ ok: true }`。空 recommendations 是合法的
“没有足够证据下结论”，不会自动补通用建议。

### `src/adviceEffectiveness/payload.ts`

`buildAdviceAggregateSnapshot()` 只消费现有 `UsageData` aggregate，并通过 allow-list
重建 DTO。完整/自定义 model ID 被压成 `opus / sonnet / haiku / fable / other`；raw
record、project label/path、cwd、session、prompt、response、credential 没有目标字段。
可远程发送的 metric 还有单独 allow-list；新增 metric 必须经过显式隐私评审。low/unknown
confidence 或仍带 quality flag 的 source 会在 payload 生成前失败，不会要求模型填补缺口。

`prepareAdvicePayload()` 默认生成 `aggregates-only`，且序列化结果中完全没有
`promptSamples` key。只有调用者额外提供：

```ts
{ consent: 'explicit', samples: [{ text: '...' }] }
```

才会加入受数量、单条长度和总长度限制的 prompt 文本；sample 上的 `cwd` 等多余字段
仍会被丢弃。`adviceUserContext` 不属于 aggregate，未来不能悄悄接入该默认路径；若要
发送，必须另设一项明确 consent 与 preview 设计。

payload 只序列化一次。`previewAdvicePayload()` 返回该 `serializedBody`，
`sendPreparedAdvicePayload()` 把同一个字符串原样交给 transport。未来 transport 不得
重新从 object 构建或“清理” body；API key、endpoint 和 headers 应在此字符串之外处理。

### `src/adviceEffectiveness/feedback.ts`

feedback ledger 只接受 `helpful / not-helpful / applied`、advice/recommendation/event ID
和本地时间。它不接受自由文本、prompt、payload、解释或 endpoint。helpful 与
not-helpful 对同一建议互斥，applied 可独立共存。存储通过最小 `get/update` port 注入，
未来可直接适配 VS Code `ExtensionContext.globalState`；模块本身没有任何网络依赖。
损坏、未知版本或带额外字段的本地数据 fail closed，记录操作不会覆盖它。

### `src/adviceEffectiveness/comparison.ts`

`compareAdviceEffectiveness()` 是无时间/IO 依赖的 paired comparison。只有以下条件全部
满足，才可能返回 `improved`：

- task kind、complexity、provider、model family、effort、metric definition、单位、方向、
  quality rubric 在 pair 内和 cohort 间一致；
- coverage complete，confidence 不是 low/unknown，无未允许的 quality flag；
- 达到预先声明的最小 pair 数，数值均为有限值且 baseline 非零；
- before/after 质量证据已知，after 全部通过 rubric；
- 主指标达到阈值，同时 minimum quality 与最大允许退化两个 guardrail 都守住。

任何可比性、覆盖、置信度、数值或质量证据问题都返回 `insufficient-evidence`。主指标
改善但质量退化返回 `quality-guardrail-failed`；没有达到预设幅度只返回
`no-demonstrated-improvement`，不声称建议造成伤害或收益。

### `src/adviceEffectiveness/structuredOutput.ts`

`parseStructuredAdviceOutput()` 只接受一个严格 JSON 值，并逐层拒绝未知/缺失字段、错误
schema version、非法枚举、超长/超量内容、重复 ID、空 action/criterion 和未知证据引用。
任一 recommendation 非法会拒绝整批。它不会剥 Markdown fence、修 JSON、接受尾随 prose、
返回 partial batch，或把 raw 输出 fallback 成看似有效的建议；错误结果也不回显 raw 模型
正文。`recommendations: []` 是明确的 no-conclusion 成功结果。

## v2.3.1 迁移顺序

1. **薄 adapter，不碰 raw records**：Claude 从 `ClaudeDataLoader.getAllTimeData()` 或等价
   scoped aggregate 映射；本地 insight 先转成 numeric observation/evidence。不要复用当前
   `buildAdviceSummary()`，因为它默认混入 prompt、cwd-derived scope 和自由文本信号。
2. **R8 Codex adapter**：rebase/cherry-pick 到 v2.3.0 后，从
   `CodexScopedInsights` / `CodexUsageScopeView` 映射 `kind、scope、numeric evidence、proxy`，
   同时保留 `periodCoverage.complete`、confidence 和 `qualityFlags`。coverage 不完整或没有
   triggered evidence 时不发 remote request、不生成通用 recommendation。
3. **独立 preview/consent**：先生成 prepared payload 并展示其 exact body/manifest；prompt
   sample 和任何 user context 分开询问、分开授权。取消授权时保留 aggregates-only body。
4. **transport**：让 provider adapter 接收 `serializedBody`，把它作为实际 user payload
   原样发送；重试继续复用同一字符串。不要调用旧 `buildAdviceSummary()` 后再次拼字符串。
5. **strict response**：只在 parser `ok` 后用 host observations/evidence/privacy/provenance
   调用 `createAdviceContract()`；失败只展示错误/重试，不展示 raw fallback 建议。
6. **本地 feedback**：以 `globalState` adapter 接入三个 UI action；不得连接 analytics、
   contribution endpoint 或 advice transport。
7. **有效性评估**：先固定 task cohort、metric definition、quality rubric 与阈值，再收集
   comparable pairs。比较结果是证据边界，不是因果证明。

## 当前已知限制与未来接入点

- 当前 UI 仍走 legacy Markdown advice；本基础未接线，因此现有版本行为完全不变。
- 尚无 Claude local-insight adapter、R8 Codex adapter、provider-specific HTTP adapter 或 UI。
- prompt consent 由未来 host/UI 负责取得；核心只接受显式 capability 并精确预览结果。
- comparator 提供预先声明阈值的描述性 paired result，不做统计显著性或因果识别。
- feedback 只存最小本地状态，没有 free-text 原因、同步或 telemetry。

未来 Claude 接入点是 `extension.ts` 当前 `buildAdviceSummary()` / `runAdviceRequest()` 边界；
未来 Codex 接入点是 R8 的 `buildScopedCodexInsights()` 输出。两者都应通过薄 adapter 接入本
目录，而不是让核心模块 import provider、VS Code 或 transport 类型。

## 验证

测试平铺在 `src/test/`，覆盖契约引用、canonical preview/send、默认 aggregates-only、
prompt 独立 opt-in、敌意隐私字段注入、本地 feedback 损坏数据、可比性/质量 guardrail、
以及严格 JSON fail-closed。运行：

```bash
npm test
```
