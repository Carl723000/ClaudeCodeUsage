# v2.3.1 AI 建议有效性：集成交接说明

配套文档：[中文交接说明](AI-ADVICE-INTEGRATION-V2.3.1.zh-CN.md) · [English handoff](AI-ADVICE-INTEGRATION-V2.3.1.md)

相关设计：[中文设计说明](AI-ADVICE-INTEGRATION-DESIGN-V2.3.1.zh-CN.md) · [English design](AI-ADVICE-INTEGRATION-DESIGN-V2.3.1.md)

## 1. 状态与安全结论

本分支提供的是 **默认关闭的 v2.3.1 本地候选**，不是已发布功能。它在现有 Claude / Codex 共用 dashboard 中实现“观察 → 证据 → 建议 → 行动 → 结果”证据链，并把可选远程步骤接入现有用户配置的 BYOK endpoint。它不会自动调用模型，也不发送遥测。

当前安全边界如下：

- `advice.effectiveness.enabled` 与 `advice.optimizer.enabled` 都默认 `false`。host message seam 还会再次检查设置，因此关闭或隐藏的 UI 不能创建 AI network resource。
- 远程 AI 在本候选中已生产可达，但只有用户先检查完整请求预览、再另行明确点击“发送”后才会调用；预览绝不发送。
- Claude 只有经过独立明确同意后才能生成远程预览；默认是 `aggregates-only`。
- “附加用户 prompt 样本”是第二个、独立且默认关闭的同意项；它不能在聚合同意未开启时单独开启。
- Codex 建议保持 `local-only`，不能生成远程快照。
- 默认聚合路径不读取、传递或持久化原始会话记录、原始 session ID、绝对路径、项目路径、prompt/response 正文、tool argument、凭据或本地用户名。只有第二项明确同意可把经过来源过滤和长度限制的 prompt 样本加入一次内存快照；它不写入 `globalState`。
- Prompt Optimizer 只发送用户粘贴的 draft，并使用相同的完整请求预览与显式发送边界。
- 失败时不生成“看起来合理”的建议：无效证据、无效本地状态、传输失败或严格输出失败均保守关闭。

旧 `claudeCodeUsage.getAdvice` 命令现在只打开统一 Content 界面，不再构建旧 summary、调用模型或打开独立 Markdown 结果。Prompt Optimizer 共用 Prepared 预览/发送边界、严格解析策略和可撤销本地反馈边界，不是第三条 sender。

### 基线与选择性移植

本候选面向正式 `v2.3.0` 基线选择性重放，复用已发布的 Claude incremental index、Codex
provider index、刷新协调器与版本化迁移状态。它不建立第二套日志扫描器、scheduler、授权存储或
comparison ledger。候选可以打包本地 VSIX 供验证，但不改变 package version、release workflow、
tag 或发布状态。

## 2. 实现地图与所有权

| 责任 | 当前接入点 | 约束 |
| --- | --- | --- |
| 统一建议契约 | `src/adviceEffectiveness/contract.ts` | host 拥有观察、证据、隐私和来源；建议必须引用已知证据 |
| Claude / Codex 适配 | `src/adviceEffectiveness/adapters.ts` | 只接受窄化 DTO；Codex 永不进入远程 payload |
| canonical payload | `src/adviceEffectiveness/payload.ts` | 只序列化 allowlist 字段；默认不含 `promptSamples` |
| evidence 快照 | `src/adviceEffectiveness/integration.ts` | 构建 consent-scoped 内层 evidence body；无 transport |
| 完整 Prepared 请求 | `src/adviceEffectiveness/preparedRequest.ts` | 完整 provider HTTP JSON body 只序列化一次；预览与发送消费同一对象和 canonical bytes |
| 生产 BYOK 请求 | `src/adviceEffectiveness/remoteAdvice.ts`、`src/optimizerRequest.ts`、`src/advisor.ts` | 只有显式 Send；配置的 API key/endpoint；一个共用 sender 与 retry policy |
| 本地状态与迁移 | `src/adviceEffectiveness/versionedPersistence.ts` | VS Code `globalState`、严格 schema、失败关闭 |
| 前后比较 | `src/adviceEffectiveness/comparison.ts` | 纯函数、成对同类任务、质量护栏、无因果声称 |
| pair/result 生产 | `src/adviceEffectiveness/comparisonPairing.ts`、`comparisonProduction.ts`、`comparisonResult.ts` | 已净化的物化任务 aggregate、严格 cohort identity、版本化有界 envelope |
| 严格模型输出 | `src/adviceEffectiveness/structuredOutput.ts` | JSON-only、exact shape、已知引用、无修复/fallback |
| framework 来源分类 | `src/promptOrigin.ts`、`src/dataLoader.ts` | 只看结构标记并立即聚合，不做语义/写作质量判断 |
| host / UI 接线 | `src/extension.ts`、`src/webview.ts` | feature gate、host-only prompt、opaque snapshot、显式 Send、严格结果处理、可撤销本地反馈 |
| 已排除准备 seam | `legacyBridge.ts`、`evidencePreparation.ts`、`legacyPersonalization.ts`、`modelExperiment.ts`、`adviceSummary.ts`、demo 模块 | 无生产 import 且明确排除出 VSIX；绝不是默认 sender |

## 3. 统一建议契约

`AdviceContract` 把建议拆成六类可审计数据：

1. `observations`：有限数值或布尔观察，带稳定 metric、单位、方法和 source ID。
2. `evidence`：引用观察，明确是 direct、correlational 或 proxy，并为 proxy 声明限制。
3. `recommendations`：引用证据，包含解释、条件动作、停止条件和成功判据。
4. `privacy`：记录 local-only / aggregates-only / aggregates-with-prompt-samples、prompt 同意和本地反馈边界。
5. `provenance`：生成方式、时间、locale、来源、scope/window、confidence 和机器化 quality flags。
6. `schemaVersion` 与稳定 opaque IDs：便于严格解析、迁移和比较，不承载自由文本身份信息。

host 始终拥有观察、证据、隐私和来源。生产远程模型最多只能返回 `recommendations`，且所有 observation/evidence 引用必须已存在；模型不能制造测量结果、改写来源或自称有更高置信度。空建议数组是合法且优先于推测的结果。

## 4. 适配器及 provider 边界

### Claude

`adaptClaudeAdvice` 接收同一 scope、同一 rolling window 的两类窄化数据：

- coarse usage aggregate：token、message、估算成本与粗粒度 model family；
- 数值 session summary：总 session 数、长 session 数、大 context session 数。

适配器类型不接受 raw record、路径、session ID、标题或 prompt。`extension.ts` 消费已物化的 Claude dashboard snapshot，并把同窗口 advice aggregate / session summary 映射为 DTO。scope/window 不一致、计数越界或非有限数会整批拒绝。

Claude 的结构化证据可用于密封远程预览，但仍需聚合数据的独立明确同意。

### 增量索引依赖

Claude advice 消费稳定 `claudeIncrementalIndex` 已物化的 dashboard snapshot；不会过滤
`cache.records`、调用 full-corpus reducer 或触发 JSONL 扫描。prompt sample 与 framework-overhead
contribution 来自同一现有 indexed analysis state；可选个性化证据缺失或过期时失败关闭，不启动自动工作。

### Codex

`adaptCodexLocalAdvice` 只映射 R8 已有的结构数值信号，例如 fresh share、cache share、processed/fresh multiple 与 post-patch tool intensity。它只使用 insight 的 allowlisted `kind`、`scope`、`proxy` 和单独的数值 behavior DTO；开放式 evidence 对象以及 `observedEffort` 等字符串不会进入统一契约。

当 index、identity 或 period coverage 不完整，或存在未解决 quality flag 时，来源 confidence 降为 `unknown`，并返回观察/证据但不返回建议。`remoteEvidenceEligible` 固定为 `false`；在出现经过单独隐私评审的 provider-discriminated Codex aggregate 契约前，不得改变。

## 5. 密封 canonical payload

`prepareAdvicePayload` 先构建 allowlisted 内层 evidence body；`prepareAiInvocation` 再把它嵌入完整配置的 Anthropic / OpenAI-compatible provider HTTP JSON body，并且只序列化该 provider body 一次。它拒绝非有限数和不支持的值，随后产生：

- `serializedBody`：canonical UTF-8 JSON 的精确字符串；
- `canonicalBytes`：由该字符串一次性编码得到的字节；
- `sha256`：这些字节的 lowercase hexadecimal SHA-256；
- `utf8Bytes`：预览中展示的 `canonicalBytes.byteLength`；
- `contentType`、`dataMode` 和 prompt sample count。

SHA-256 是快照身份/一致性摘要，不是签名，也不代表服务端可信。它的作用是让人和测试确认“预览的内容”与“实际发送的字节”是同一个密封对象。

关键不变量：

- `preview.body === UTF8.decode(prepared.canonicalBytes) === prepared.serializedBody`；
- `preview.utf8Bytes === prepared.canonicalBytes.byteLength`，不能用 JavaScript 字符数代替；
- `preview.sha256 === SHA256(prepared.canonicalBytes) === prepared.sha256`；
- preview 与 sender 在使用前都会重算并核对 body/bytes/digest；任一字段被修改都会整份拒绝；
- 生产 sender 必须接收同一个 host-retained `PreparedAiInvocation` / `canonicalBytes`，不能从 webview 文本或普通对象重新序列化；
- host 只把 body、byte count、digest 和非敏感元数据交给 webview，Prepared 对象保留在内存中并由 opaque snapshot ID 引用；
- provider 数据刷新、同意变更、面板关闭或显式丢弃会清除旧快照。

默认 Advice 快照是 `aggregates-only`，其内层 evidence JSON 连 `promptSamples` key 都不存在。只有第二项 prompt-personalization consent 明确为 `explicit` 时才加入有界 sample/context；runtime 附带的 cwd、session ID、path 或额外字段会被丢弃。预览不联网；只有用户另行点击“发送”后，才使用配置的 BYOK endpoint 与 key 发出请求。

## 6. 本地反馈与版本化持久化

实验 UI 的唯一写入目标是 VS Code `globalState` 中的 `ccu.adviceEffectiveness.localState`，当前 schema version 为 3。v3 envelope 只允许：

- feature mode 与两个 consent enum；
- opaque、格式已验证的 advice / recommendation / pair / rubric / metric IDs；
- `helpful` / `not-helpful` / `unrated` 与 `applied` / `not-applied` 枚举；
- 有界、有限的数值、epoch 时间、provider/context/quality 枚举与 allowlisted quality flags。

它不接受 prompt、payload、解释、endpoint、path、raw session ID 或任意自由文本。反馈最多 500 项，可比任务对最多 200 项。

`helpful` 与 `not-helpful` 对同一建议互斥；`applied` 与评分独立，可同时存在。再次点击已选值会撤回。每条 Advice recommendation 与每次 Prompt Optimizer 结果都使用这一写入边界。所有反馈只写本地，不联网、不进入 payload、不记遥测。

迁移/降级策略：

- 缺少状态时返回全关闭的 v3 默认值。
- 当前 v3 原样读取；受支持的旧 v2/v3 形状原地迁移到包含有界反馈、暂停、可比任务对与比较结果的当前形状。
- 合法 v1 envelope 只迁移已验证反馈；feature、aggregate consent、prompt consent 全部重置为关闭，可比任务对从空数组开始。
- 未知未来版本、额外字段、重复 ID、非法 enum、非有限数或存储错误都返回全关闭状态，并且不覆盖原始未知/损坏数据。
- 写入失败后 host 进入 degraded 状态，拒绝继续修改 consent 或反馈。
- 状态若出现 `promptSampleConsent=explicit` 但 aggregate consent 未授予，会作为损坏状态整体失败关闭，且不会覆盖原值。

基础提交中的独立 `feedback.ts` / `claudeCodeUsage.adviceEffectiveness.feedback.v1` event ledger 仍保留供兼容测试，但不是集成 UI 的写入点，也不会被静默合并进 v2 envelope。未来若决定迁移，必须单独设计可审计的一次性导入；在此之前不得双写。

## 7. 前后比较与“不足证据时不下结论”

`compareAdviceEffectiveness` 是无 I/O 的纯函数。每个 before/after pair 必须在 task kind、complexity band、provider、model family、effort、metric definition、quality rubric、metric name/unit/direction 上一致；整个 cohort 也必须一致。任何坏 pair 都会使整次比较返回 `insufficient-evidence`，而不是悄悄丢弃。

比较入口先按稳定的 recommendation lineage（`provider + recommendationId`）选取 pair，而不按会随观察日期变化的 `adviceId` 截断。`adviceId` 仍保留在每个 pair 中，作为一次建议实例的审计字段。因此不同日期的同一建议可以形成闭环，但后续纯比较器仍会严格拒绝 task kind、complexity、model、effort、metric definition、quality rubric 或 primary metric 不一致的混合 cohort；它不会为了凑样本而静默过滤。

默认门槛为：

- 至少 5 个可比 pair；
- before/after coverage 完整；
- confidence 不得为 low/unknown；
- 不得有未 allowlist 的 quality flag；
- primary metric 必须有限、非负，baseline 不能为 0；
- 两侧都要有 0..1 quality score、明确 pass/fail 和至少一条质量证据；baseline 必须通过 rubric；
- 平均 primary metric 相对改善至少 10%；
- 每个 after task 必须通过，after 平均质量至少 0.8，平均质量下降不得超过 0.02。

结果只可能是 `insufficient-evidence`、`quality-guardrail-failed`、`improved` 或 `no-demonstrated-improvement`。即使结果为 `improved`，它也只是受控的配对观察，不是因果证明。生产配对只消费已经净化、已物化的任务级结构 observation，并要求本地 `applied` 时间点以及完全一致的 scope、task kind、complexity、provider、model、effort、metric 与 rubric cohort。只有可靠的 before/after pair 才会写入有界、版本化的 comparison result envelope；它不记录 prompt、response、路径、原始 session ID 或任务正文。缺少可靠 pair 或质量证据时，界面明确显示“证据不足”。

## 8. 证据解释边界

### 长 session、大 context 与 `/clear`

- “长 session”是本地已分类的活动跨度至少 8 小时；“大 context”是 peak context 至少 150k。
- 两者都按同一 rolling window 的 session 数计算 share。
- 只有“受影响 session 至少 2 个”且“share 至少 25%”同时满足时，才生成条件 `/clear` 建议。
- 条件是下一项任务确实无关；如果仍需前文，停止条件要求保留当前 context。
- 这些指标是 structural proxy，不证明浪费，也不证明 `/clear` 导致改善。

### Topic drift

当前没有 topic-drift 观察器，也不从 session 时长、context 大小或 body-free aggregates 推断语义漂移。即使用户单独同意附加 prompt 样本，当前代码也只是把可见样本放入密封快照；在 host 没有新增、经过隐私评审的 topic-drift observation/evidence ID 前，远程模型不得把“topic drift”作为已证实证据或生成相应确定性建议。

### Framework origin 与 overhead proxy

loader 使用结构字段和 allowlisted wrapper/command/system marker 区分 user-authored 与 framework-origin 内容；分类后只保留 token/count aggregates。tool result 正文只进入 `observedInputEstimatedTokens` denominator 一次，普通正文不进入 numerator；固定 tool-result envelope 可计入 framework numerator。Skill body 作为 skill-preamble proxy 时不在 denominator 中重复计算。

适配器只接收 `frameworkEstimatedTokens`、`observedInputEstimatedTokens`、`classifiedEvents`，要求全部为非负有限数、event count 为整数且 framework 不超过 observed。`framework-overhead-share = frameworkEstimatedTokens / observedInputEstimatedTokens`，method 固定为 `structural-proxy`，并声明 overlay limitation。

该 share 不能评价用户写作质量、不能识别话题、不能自动生成改写建议，也不能等同于可消除成本。它可以进入 Claude aggregate-only payload 的 metric allowlist，但不携带 component text 或 hostile extra fields。

### Model rightsizing

model rightsizing 只是一条 typed、可逆实验 seam：允许 `opus → sonnet` 或 `sonnet → haiku`，拒绝跨两档、向上切换和未声明 family。它不声称“较小模型一定更便宜/更好”，也不根据短 output 直接要求换模型。

比较前必须本地标记 `applied` 并给出 helpful/not-helpful 评分；随后至少收集 5 对同类任务，目标 primary metric 改善 10%，同时保留 0.8 最低质量和 0.02 最大回退护栏。一旦质量回退，停止条件是恢复 baseline model。

## 9. 统一 AI 兼容矩阵

| 现有能力 | 当前生产候选行为 | 边界 |
| --- | --- | --- |
| `claudeCodeUsage.getAdvice` | 打开或显示统一的 Content 界面；功能关闭时提供 Settings 入口 | 不调用模型，不生成旧 summary，不弹 scope 对话框，也不输出 Markdown |
| AI Advice 远程个性化 | 准备完整 provider body → 逐字节预览 → 显式点击 Send → 严格 JSON／引用解析 → Advice contract | 默认仅 aggregate；prompt/context 需要独立同意；只使用用户配置的 BYOK |
| Prompt Optimizer | 准备只含用户 draft 的完整 provider body → 逐字节预览 → 显式点击 Send → 严格 marker/settings 解析 → 本地结果 | 共用 sender、取消和反馈边界；没有持久化的首次运行授权，也没有 parser fallback |
| 原 `advisor.ts#callModel` / `getUsageAdvice` 快捷路径 | 已从候选中删除 | 打包模块只导出接收既有 Prepared 对象的 sender，不再存在 prepare-and-send 的预览绕过路径 |
| `legacyBridge.ts`、`adviceSummary.ts`、demo／准备模块 | 没有生产 import，其编译产物被明确禁止进入 VSIX | 仅供准备或参考，绝不是默认 sender 或第三条 sender |

aggregate consent 与 prompt-personalization consent 始终独立。Prompt Optimizer 不借用其中任何一种 consent：它的授权来自用户可见的 draft 精确预览，以及针对该 opaque Prepared snapshot 的另一次 Send 点击。这些本地选择都不授权未来的后台请求。

## 10. 严格解析与生产 BYOK 边界

`parseStructuredAdviceOutput` 只接受一个 bounded、exact-shape JSON object。它拒绝 Markdown fence、前后 prose、未知字段、未知 observation/evidence reference、重复 ID、过大数组/字符串、无条件动作、无成功判据、无 quality guardrail 以及不合版本的输出。它不剥 fence、不修 JSON、不返回部分 batch，也不调用旧 Markdown/Optimizer fallback；空 `recommendations` 是合法的 fail-closed 结果。

`parseStrictOptimizerOutput` 独立要求精确的 `===PROMPT===` 与 `===SETTINGS===` 段，以及三行有界 settings。缺少 marker 的回复不能被当作 prompt。两种特性各自使用严格 parser，但在共用的 Prepared transport 之后收敛；两者失败时都关闭，不显示原始 fallback 文本。

生产请求链为：

1. host 创建并保留一个 `PreparedAiInvocation`，其中包含完整的 provider HTTP JSON body；
2. 用户审查该 body 的精确解码内容、UTF-8 byte count、content type／data mode 与 SHA-256；
3. 用户另行点击 Send，把同一个对象、source revision 与 consent generation 交给 `sendPreparedAiInvocation`；
4. 该边界只接受 `backend: api` 和非空的用户配置 key，并发送到冻结在 Prepared 对象中的 endpoint；
5. fetch retry 与 curl fallback 复用同一份 canonical body bytes；任何 caller 都不能从 webview 文本重建请求；
6. 在呈现任何结果或建议之前，必须先运行对应输出形状的严格 parser。

Claude Code OAuth 凭据仍只用于既有 usage/quota API。OAuth 与 subscription 凭据都不是获准的 AI backend；生产配置与 Prepared sender 都要求 BYOK `api`。Advice／Optimizer 不扩大 OAuth scope、不读取其他凭据来源，也不把 quota token 转作模型 token。

## 11. 上线验收门槛

在任何人改变默认值或发布候选前，至少必须同时满足：

### 安全与隐私

- feature flag 和两个 consent 的 fresh-install、upgrade、corrupt-state 测试均证明默认关闭。
- aggregates-only payload 的结构快照和敌意 sentinel 测试证明没有 prompt/response/path/session/raw record/tool argument/credential 泄漏。
- prompt 样本只在第二项显式同意后出现，并证明长度上限、字段丢弃和 consent 撤回后旧 snapshot 失效。
- preview body、canonical bytes、UTF-8 count、SHA-256 与生产 sender 的对象身份测试全部通过；发送路径不能重新序列化。
- 两个 AI 界面都保留显式 Send、BYOK-only 配置、错误脱敏、feature-off host gate、取消能力与“无遥测”保证。
- Codex 的远程资格测试持续为 false。

### 有效性与失败策略

- contract、Claude/Codex adapters、pairing/result envelope、migration、Prepared transport、两种 strict parser 与可撤销反馈的聚焦及受影响全仓测试通过。
- 跨日变化的 `adviceId` 不会重置同一 `provider + recommendationId` lineage；不同任务/模型/effort/指标版本/rubric 的混合 cohort 仍会整体失败关闭。
- 不足 5 对、context 不可比、coverage/confidence/quality 不足、零 baseline、未解决 flags 均返回 `insufficient-evidence`。
- quality regression 优先于 token/cost 改善，且 UI 不把相关性写成因果。
- malformed/fenced/oversized/unknown-reference model output 不显示部分建议或自由文本 fallback。
- topic drift 在没有独立 host evidence 前保持不支持；framework overhead 不触发写作质量建议。

### UI、i18n 与发布验证

- 八个 locale 的全部用户可见文案、placeholder 和隐私语义一致。
- 键盘可达、focus 可见、checkbox/feedback/preview 有正确 label、role、live status 和屏幕阅读器顺序。
- webview 测试环境为所有 production `--vscode-*` CSS variables 提供真实主题值后，才接受视觉 snapshot。
- 每个 consent、展开/收起、feedback 与 snapshot 状态都有“操作 → reload → 应保留/应失效”的测试。
- 完成 F5 Extension Development Host smoke、可行的 Playwright/截图检查、`npm run compile`、全量 `npm test`、VSIX 打包，以及发布候选所需的 macOS/Linux installed-VSIX smoke。
- 核对当前 CHANGELOG／README 候选文案与打包行为一致，但不修改版本或 release workflow。

“操作 → full reload → 状态保留／失效”测试必须持续覆盖 consent、逐条 recommendation 与 Optimizer 反馈、source/config 变化、功能关闭、界面关闭和本地数据清除。任何失效事件发生后，过期的 opaque snapshot 都不得再被取回。

## 12. 当前已知限制与下一步

- 密封预览仍是本地状态；只有另行点击 Send 才会创建生产 BYOK 网络请求。
- 真实 comparison production 依赖已净化、已物化的任务级结构与质量证据；观察缺失或不可比时保持 `insufficient-evidence`。
- 远程 Advice parser 在严格校验形状与引用后接受模型生成的 recommendation ID；host policy 必须继续防止把不支持的 evidence 呈现为 `/clear` 或其他确定性动作。
- Advice 会渲染每条 recommendation，并分别闭环其反馈与比较状态，而不是只处理第一条。Optimizer 共用反馈，但当前不进入可比任务 comparison。
- topic drift 和写作质量没有本地语义证据。
- Codex 没有远程 payload schema，保持 local-only。
- framework origin 是结构 proxy，日志 schema 漂移可能降低覆盖；不得用猜测补齐。
- `advice.userContext` 与 prompt 样本只有在独立 prompt-personalization consent 和精确预览下才会进入请求；aggregates-only payload 两者都不包含。
- 独立 feedback v1 ledger 没有自动导入 v2 envelope。

生产规则已经稳定：只通过 opaque snapshot ID 取回 host 保留的 Prepared 对象，只通过 `sendPreparedAiInvocation` 发送，并且只呈现严格解析后的结果。绝不能从 webview body 文本、`getAdvice`、`buildAdviceSummary`、已删除的 `getUsageAdvice` / `callModel` 快捷路径或 `legacyBridge` 绕接。

## 13. 发布线声明

本候选与发布动作保持隔离。它没有推送、合并、打 tag 或发布，也没有修改任何版本号、release workflow 或发布入口。候选代码可以进入本地 VSIX 供验证；默认启用、发布或任何版本动作仍需要维护者另行批准。

---
🤖 Generated with [OpenAI Codex](https://developers.openai.com/codex/)
