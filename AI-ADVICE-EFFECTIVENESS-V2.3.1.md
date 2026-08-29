# v2.3.1 AI 建议有效性：候选实现说明

## 状态与边界

当前 worktree 是从正式 `v2.3.0` 基线选择性移植并继续收敛的 v2.3.1 本地候选；版本号、
release workflow 与发布入口保持不变，尚未发布。

候选代码已经进入 `extension.ts`、`webview.ts` 与生产 VSIX 路径，但相关功能默认关闭。
关闭、隐藏或未授权时不创建 AI timer、watcher、worker、network 或额外日志扫描。启用后，
只有用户先检查完整请求预览、再另行点击“发送”，才会调用现有用户配置的 BYOK endpoint。
旧 `Get AI Advice` 命令仅打开这一统一界面；Prompt Optimizer 也使用同一 prepare → preview →
explicit Send → strict parse → local feedback 边界，不再保留一次性持久授权或宽松 parser fallback。

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

`prepareAdvicePayload()` 默认生成 `aggregates-only` 的内层 evidence body，且序列化结果中完全没有
`promptSamples` key。只有调用者额外提供：

```ts
{ consent: 'explicit', samples: [{ text: '...' }] }
```

才会加入受数量、单条长度和总长度限制的 prompt 文本；sample 上的 `cwd` 等多余字段仍会被
丢弃。`advice.userContext` 与 prompt sample 共用独立于 aggregate 的 personalization consent；
未授权时两者都不进入 body，授权后必须逐字出现在完整预览中。

生产路径再由 `preparedRequest.ts` 把内层 evidence body 封装为完整 Anthropic / OpenAI-compatible
provider HTTP JSON body。该 body 只序列化一次，生成 host-retained `PreparedAiInvocation`、
`canonicalBytes` 与 SHA-256；预览从同一 bytes 解码，实际发送和同一次发送内的 retry / curl
fallback 继续复用该 Prepared bytes。API key 只在发送边界加入 header，不进入预览 body。

### `src/adviceEffectiveness/versionedPersistence.ts`

生产反馈统一写入 `ccu.adviceEffectiveness.localState` v2 envelope，只接受
`helpful / not-helpful / applied`、格式验证后的 advice/recommendation ID 与本地 epoch 时间。
它不接受自由文本、prompt、payload、解释、endpoint、path 或 session ID。helpful 与
not-helpful 互斥，applied 独立；再次点击已选状态会撤回并在全部状态清空时删除该条记录。
Advice 的每条 recommendation 与 Prompt Optimizer 的每次结果都走同一个写入函数。
损坏、未知版本或带额外字段的数据 fail closed，写失败后不会用旧快照覆盖新决定。

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

`comparisonPairing.ts`、`comparisonProduction.ts` 与 `comparisonResult.ts` 把这条纯比较边界接入
真实、已净化的 provider/task-level 物化 aggregate。只有 scope、task kind、complexity、provider、
model、effort、metric definition 与 quality rubric 全部相同，且 applied 时间能可靠划分前后时，
才形成 comparable pair。版本化 result envelope 只保存 schema、provider、measurement / recommendation
version、guardrail、replay eligibility、sample 与 result；prompt、response、session、path、正文和未知字段
没有目标字段。无可靠 pair 时 UI 明确显示“证据不足”。

### `src/adviceEffectiveness/structuredOutput.ts`

`parseStructuredAdviceOutput()` 只接受一个严格 JSON 值，并逐层拒绝未知/缺失字段、错误
schema version、非法枚举、超长/超量内容、重复 ID、空 action/criterion 和未知证据引用。
任一 recommendation 非法会拒绝整批。它不会剥 Markdown fence、修 JSON、接受尾随 prose、
返回 partial batch，或把 raw 输出 fallback 成看似有效的建议；错误结果也不回显 raw 模型
正文。`recommendations: []` 是明确的 no-conclusion 成功结果。

## 当前生产闭环

1. **本地证据**：Claude 只消费 `claudeIncrementalIndex` 已物化的同窗口 aggregate / session
   summary；Codex 只消费现有结构化数值 insight 与任务级物化 aggregate，不新增日志扫描器。
2. **独立 consent**：Advice 的 aggregate consent 与 prompt-personalization consent 分开持久化；
   默认是 aggregates-only。Optimizer 只包含用户主动粘贴的 draft，不使用持久网络授权。
3. **exact preview / explicit Send**：host 保留完整 Prepared provider body；Webview 只持有 opaque
   snapshot ID、精确 body、byte count、content type、data mode 与 SHA-256。只有另行 Send 点击会联网。
4. **唯一生产 sender**：Advice 与 Optimizer 都进入 `sendPreparedModelRequest()` →
   `sendPreparedAiInvocation()`，且只能使用配置的 BYOK key / endpoint。
5. **strict response**：Advice 只接受 exact-shape JSON 与已知 evidence references；Optimizer 只接受
   完整 marker / 三行 settings contract。任一失败都不显示 raw 或自由文本 fallback。
6. **可撤销本地 feedback**：每条 Advice recommendation 和 Optimizer result 共用 v2 bounded ledger；
   不接 analytics、telemetry、contribution endpoint 或 advice payload。
7. **有效性评估**：只有 applied 后出现严格可比的前后任务时才写 pair / result envelope；否则显示
   `insufficient-evidence`。结果是受控描述性证据，不是因果证明。

## 排除项与剩余边界

- `claudeCodeUsage.getAdvice` 只打开统一 Content 界面，不再构建旧 summary 或直接调用模型。
- `legacyBridge.ts`、`adviceSummary.ts`、旧 demo / personalization / experiment 准备模块被排除出 VSIX，
  且 `extension.ts` / `webview.ts` 没有生产调用点；它们不能成为默认或第三条 sender。
- 生产 backend 固定为 BYOK `api`。Claude Code OAuth/subscription 凭据仅服务既有 quota/usage，
  不用于 Advice 或 Optimizer，也不存在后台模型请求。
- Codex remote advice 仍保持关闭；Codex recommendation 与 comparison 使用本地结构数据。
- comparison 不做显著性或因果识别；缺少可靠 cohort、质量证据或最小样本时保持证据不足。
- feedback 不存自由文本、不同步、不发 telemetry；Optimizer feedback 当前不触发 comparable-task comparison。

## 验证

测试平铺在 `src/test/` 与 `tests/ui/`，覆盖契约引用、完整 Prepared preview/send object identity、
默认 aggregates-only、prompt 独立 opt-in、Optimizer 关闭态与严格 parser、敌意隐私字段注入、
可撤销本地 feedback、真实 pairing / 版本化 result envelope、可比性 / quality guardrail 以及
未知字段 fail-closed。候选验证仍按仓库流程运行：

```bash
npm test
```
