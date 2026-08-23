# v2.3.1 AI 建议有效性：集成交接说明

配套文档：[中文交接说明](AI-ADVICE-INTEGRATION-V2.3.1.zh-CN.md) · [English handoff](AI-ADVICE-INTEGRATION-V2.3.1.md)

相关设计：[中文设计说明](AI-ADVICE-INTEGRATION-DESIGN-V2.3.1.zh-CN.md) · [English design](AI-ADVICE-INTEGRATION-DESIGN-V2.3.1.md)

## 1. 状态与安全结论

本分支提供的是 **v2.3.1 候选基础与默认关闭的实验性集成**，不是已上线功能。它在现有 Claude / Codex 共用 dashboard 中准备了一条“观察 → 证据 → 建议 → 行动 → 结果”的证据链，但不增加生产 AI 端点、不自动调用模型、不发送遥测，也没有发送按钮。

当前安全边界如下：

- `advice.effectiveness.enabled` 默认 `false`；关闭时扩展不构建或显示实验面板。
- 新链路当前完全本地运行。远程部分只做到可审查的密封快照和一个未接线的 BYOK bridge。
- Claude 只有经过独立明确同意后才能生成远程预览；默认是 `aggregates-only`。
- “附加用户 prompt 样本”是第二个、独立且默认关闭的同意项；它不能在聚合同意未开启时单独开启。
- Codex 建议保持 `local-only`，不能生成远程快照。
- 默认聚合路径不读取、传递或持久化原始会话记录、原始 session ID、绝对路径、项目路径、prompt/response 正文、tool argument、凭据或本地用户名。只有第二项明确同意可把经过来源过滤和长度限制的 prompt 样本加入一次内存快照；它不写入 `globalState`。
- 新链路失败时不生成“看起来合理”的建议：无效证据、无效本地状态、传输失败或结构化输出失败均保守关闭。

已有的 `Get AI Advice` 与 Prompt Optimizer 仍是独立的旧功能；它们的兼容边界见第 9 节，不能被视为满足新链路的密封 payload 或严格解析保证。

## 2. 实现地图与所有权

| 责任 | 当前接入点 | 约束 |
| --- | --- | --- |
| 统一建议契约 | `src/adviceEffectiveness/contract.ts` | host 拥有观察、证据、隐私和来源；建议必须引用已知证据 |
| Claude / Codex 适配 | `src/adviceEffectiveness/adapters.ts` | 只接受窄化 DTO；Codex 永不进入远程 payload |
| canonical payload | `src/adviceEffectiveness/payload.ts` | 只序列化 allowlist 字段；默认不含 `promptSamples` |
| host 密封快照 | `src/adviceEffectiveness/integration.ts` | 同一 Prepared 对象供预览和未来发送；模块本身无 transport |
| 本地状态与迁移 | `src/adviceEffectiveness/versionedPersistence.ts` | VS Code `globalState`、严格 schema、失败关闭 |
| 前后比较 | `src/adviceEffectiveness/comparison.ts` | 纯函数、成对同类任务、质量护栏、无因果声称 |
| model 可逆实验 | `src/adviceEffectiveness/modelExperiment.ts` | 只允许相邻向下一档，至少五对任务 |
| 严格模型输出 | `src/adviceEffectiveness/structuredOutput.ts` | JSON-only、exact shape、已知引用、无修复/fallback |
| 唯一未来 BYOK 接线 | `src/adviceEffectiveness/legacyBridge.ts` | 仅 `backend: api`；当前生产代码未调用 |
| framework 来源分类 | `src/promptOrigin.ts`、`src/dataLoader.ts` | 只看结构标记并立即聚合，不做语义/写作质量判断 |
| host / UI 薄接线 | `src/extension.ts`、`src/webview.ts` | feature flag、host-only prompt、opaque snapshot、本地反馈 |

## 3. 统一建议契约

`AdviceContract` 把建议拆成六类可审计数据：

1. `observations`：有限数值或布尔观察，带稳定 metric、单位、方法和 source ID。
2. `evidence`：引用观察，明确是 direct、correlational 或 proxy，并为 proxy 声明限制。
3. `recommendations`：引用证据，包含解释、条件动作、停止条件和成功判据。
4. `privacy`：记录 local-only / aggregates-only / aggregates-with-prompt-samples、prompt 同意和本地反馈边界。
5. `provenance`：生成方式、时间、locale、来源、scope/window、confidence 和机器化 quality flags。
6. `schemaVersion` 与稳定 opaque IDs：便于严格解析、迁移和比较，不承载自由文本身份信息。

host 始终拥有观察、证据、隐私和来源。未来远程模型最多只能返回 `recommendations`，且所有 observation/evidence 引用必须已存在；模型不能制造测量结果、改写来源或自称有更高置信度。空建议数组是合法且优先于推测的结果。

## 4. 适配器及 provider 边界

### Claude

`adaptClaudeAdvice` 接收同一 scope、同一 rolling window 的两类窄化数据：

- coarse usage aggregate：token、message、估算成本与粗粒度 model family；
- 数值 session summary：总 session 数、长 session 数、大 context session 数。

适配器类型不接受 raw record、路径、session ID、标题或 prompt。`extension.ts` 只在本地把当前窗口的记录归约成 DTO，再调用适配器。scope/window 不一致、计数越界或非有限数会整批拒绝。

Claude 的结构化证据可用于密封远程预览，但仍需聚合数据的独立明确同意。

### Codex

`adaptCodexLocalAdvice` 只映射 R8 已有的结构数值信号，例如 fresh share、cache share、processed/fresh multiple 与 post-patch tool intensity。它只使用 insight 的 allowlisted `kind`、`scope`、`proxy` 和单独的数值 behavior DTO；开放式 evidence 对象以及 `observedEffort` 等字符串不会进入统一契约。

当 index、identity 或 period coverage 不完整，或存在未解决 quality flag 时，来源 confidence 降为 `unknown`，并返回观察/证据但不返回建议。`remoteEvidenceEligible` 固定为 `false`；在出现经过单独隐私评审的 provider-discriminated Codex aggregate 契约前，不得改变。

## 5. 密封 canonical payload

`prepareAdvicePayload` 只构建一次对象，并按递归排序的 key 生成唯一 canonical JSON。它拒绝非有限数和不支持的值，随后一次性产生：

- `serializedBody`：canonical UTF-8 JSON 的精确字符串；
- `canonicalBytes`：由该字符串一次性编码得到的字节；
- `sha256`：这些字节的 lowercase hexadecimal SHA-256；
- `utf8Bytes`：预览中展示的 `canonicalBytes.byteLength`；
- `contentType`、`dataMode` 和 prompt sample count。

SHA-256 是快照身份/一致性摘要，不是签名，也不代表服务端可信。它的作用是让人和测试确认“预览的内容”与“未来发送的字节”是同一个密封对象。

关键不变量：

- `preview.body === UTF8.decode(prepared.canonicalBytes) === prepared.serializedBody`；
- `preview.utf8Bytes === prepared.canonicalBytes.byteLength`，不能用 JavaScript 字符数代替；
- `preview.sha256 === SHA256(prepared.canonicalBytes) === prepared.sha256`；
- preview 与 future sender 在使用前都会重算并核对 body/bytes/digest；任一字段被修改都会整份拒绝；
- 未来 sender 必须接收同一个 host-retained `PreparedAdvicePayload` / `canonicalBytes`，不能从 webview 文本或普通对象重新序列化；
- host 只把 body、byte count、digest 和非敏感元数据交给 webview，Prepared 对象保留在内存中并由 opaque snapshot ID 引用；
- provider 数据刷新、同意变更、面板关闭或显式丢弃会清除旧快照。

默认快照是 `aggregates-only`，JSON 中连 `promptSamples` key 都不存在。只有第二项同意明确为 `explicit` 时才加入纯 `{id,text}` 样本；每条和总量都有上限，runtime 附带的 cwd、ID 或额外字段会被丢弃。当前没有 sender 或网络调用。

## 6. 本地反馈与版本化持久化

实验 UI 的唯一写入目标是 VS Code `globalState` 中的 `ccu.adviceEffectiveness.localState`，当前 schema version 为 2。v2 envelope 只允许：

- feature mode 与两个 consent enum；
- opaque、格式已验证的 advice / recommendation / pair / rubric / metric IDs；
- `helpful` / `not-helpful` / `unrated` 与 `applied` / `not-applied` 枚举；
- 有界、有限的数值、epoch 时间、provider/context/quality 枚举与 allowlisted quality flags。

它不接受 prompt、payload、解释、endpoint、path、raw session ID 或任意自由文本。反馈最多 500 项，可比任务对最多 200 项。

`helpful` 与 `not-helpful` 对同一建议互斥；`applied` 与评分独立，可同时存在。所有反馈只写本地，不联网、不进入 payload、不记遥测。

迁移/降级策略：

- 缺少状态时返回全关闭的 v2 默认值。
- 合法 v2 原样读取。
- 合法 v1 envelope 只迁移已验证反馈；feature、aggregate consent、prompt consent 全部重置为关闭，可比任务对从空数组开始。
- 未知未来版本、额外字段、重复 ID、非法 enum、非有限数或存储错误都返回全关闭状态，并且不覆盖原始未知/损坏数据。
- 写入失败后 host 进入 degraded 状态，拒绝继续修改 consent 或反馈。

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

结果只可能是 `insufficient-evidence`、`quality-guardrail-failed`、`improved` 或 `no-demonstrated-improvement`。即使结果为 `improved`，它也只是受控的配对观察，不是因果证明。自动任务配对与真实质量打分尚未授权；当前接口只接受 host 已验证并版本化保存的 pair。生产代码目前没有调用 `appendStoredComparablePair` 的 runtime 入口，所以界面在没有外部已验证 pair 时会如实保持“证据不足”，不会自动记录任务、会话或 prompt。

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

## 9. 旧 AI 功能兼容矩阵

| 现有能力 | 当前行为 | 与新链路的关系 | 迁移规则 |
| --- | --- | --- | --- |
| `claudeCodeUsage.getAdvice` | 用户显式触发；选择 scope；调用旧 summary + BYOK model；结果打开为 Markdown | 保持兼容，但不使用统一 contract、sealed bytes、独立 prompt consent 或 strict JSON parser | 不得让新实验入口转发到此 command；未来迁移必须改走唯一 structured bridge |
| `advisor.ts#getUsageAdvice` | 生成自由格式 Markdown 建议 | 旧输出，不是可验证 recommendation batch | 保留旧功能；不能作为新建议 parser 的 fallback |
| `advisor.ts#callModel` | 现有 Anthropic/OpenAI-compatible BYOK transport；代码中仍有 dormant subscription 类型 | 只作为低层旧 transport 复用；新 bridge 在 runtime 强制 `backend: api` | 不新增 endpoint；不得传 OAuth token、subscription model/provider 字段 |
| `adviceSummary.ts#buildAdviceSummary` | 构建 prose digest；旧路径可能附带最近 prompt 样本 | 不满足 remote allowlist、同源 canonical preview 或独立 prompt consent | 保持旧路径兼容但不得从新 UI 调用；以后迁移后再决定弃用 |
| Prompt Optimizer | 只发送用户粘贴的 draft；首次运行有独立 consent；解析器缺 marker 时会把全文作为 prompt | 是独立的文本改写工具，不是证据有效性建议 | 保留其既有 fallback，仅限 Optimizer；绝不能复用到 structured advice |
| `legacyBridge.ts` | 当前未接线；接收 Prepared payload，从同一 canonical bytes 解码 user turn，strict parse | 新证据链未来唯一允许的 BYOK seam | 只有另行批准网络接线后才能由 host 调用 |

旧 `getAdvice` / `adviceSummary` 的 prompt 行为是历史兼容边界，不应被描述成新链路的隐私保证。新链路中的聚合同意和 prompt 样本同意不能与旧 Optimizer consent 或任何旧配置布尔值互相替代。

## 10. 严格解析与 OAuth 403 边界

`parseStructuredAdviceOutput` 只接受一个 bounded、exact-shape JSON object。它拒绝 Markdown fence、前后 prose、未知字段、未知 observation/evidence reference、重复 ID、过大数组/字符串、无条件动作、无成功判据、无 quality guardrail 以及不合版本的输出。它不剥 fence、不修 JSON、不返回部分 batch，也不调用旧 Markdown/Optimizer fallback；空 `recommendations` 是合法的 fail-closed 结果。

`requestStructuredAdviceViaLegacyByok` 是唯一未来接线点：

1. host 生成并保留同一个 Prepared/Sealed 对象；
2. 用户审查 body、UTF-8 byte count 与 SHA-256；
3. 另行批准的显式发送动作把该 Prepared 对象与已知 reference IDs 交给 bridge；
4. bridge 要求配置只有 `backend: api`、`apiFormat`、非空 apiKey/apiUrl/model 及有界可选项；
5. model user content 严格等于 `prepared.serializedBody`；
6. 结果只经 strict parser；任何失败都不生成建议。

桥会拒绝 hostile cast 的 `backend: subscription`、`getSubscriptionToken`、`subscriptionModel` 或其他未知字段。

Claude Code OAuth 凭据仍只用于既有 usage/quota API。历史上的 OAuth token 直连 Messages 模型调用返回过 `403 Request not allowed`，因此不是已批准的 AI backend。`advisor.ts` 内的 dormant subscription 分支不代表生产支持；生产配置固定为 BYOK API，新 bridge 也在类型和 runtime 两层拒绝 subscription。不得为了建议功能扩大 OAuth scope、读取其他凭据或把 quota token 转作模型 token。

## 11. 上线验收门槛

在任何人开启默认值、增加发送按钮或称为已上线前，至少必须同时满足：

### 安全与隐私

- feature flag 和两个 consent 的 fresh-install、upgrade、corrupt-state 测试均证明默认关闭。
- aggregates-only payload 的结构快照和敌意 sentinel 测试证明没有 prompt/response/path/session/raw record/tool argument/credential 泄漏。
- prompt 样本只在第二项显式同意后出现，并证明长度上限、字段丢弃和 consent 撤回后旧 snapshot 失效。
- preview body、canonical bytes、UTF-8 count、SHA-256 与 future sender 的对象身份测试全部通过；发送路径不能重新序列化。
- 远程启用需要独立 privacy/security review、明确的用户发送动作、BYOK-only 配置审计、错误信息脱敏和“无遥测”验证。
- Codex 的远程资格测试持续为 false。

### 有效性与失败策略

- contract、Claude/Codex adapters、comparison、model experiment、migration 和 strict parser 的完整单元测试通过。
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
- 若最终成为用户可见发布内容，再按项目政策单独更新 CHANGELOG 和全部七份 README；这些不是本候选准备分支的隐式授权。

## 12. 当前已知限制与下一步

- 新面板没有生产 sender；密封预览不代表数据已经发送。
- 自动生成/匹配可比任务对与真实质量 rubric 采集仍未实现；当前只有严格存储和纯比较接口。
- topic drift 和写作质量没有本地语义证据。
- Codex 没有远程 payload schema，保持 local-only。
- 旧 `Get AI Advice` 和 Prompt Optimizer 尚未迁移到统一 contract，且保留各自历史解析行为。
- framework origin 是结构 proxy，日志 schema 漂移可能降低覆盖；不得用猜测补齐。
- 独立 feedback v1 ledger 没有自动导入 v2 envelope。

未来最小接线顺序应是：先完成上述验收与网络隐私评审，再让 host 通过 opaque snapshot ID 取回同一个 Prepared 对象，唯一调用 `requestStructuredAdviceViaLegacyByok`，严格解析后由 host 重新组装完整 `AdviceContract`；不要从 webview body、`getAdvice`、`buildAdviceSummary`、`getUsageAdvice` 或 Prompt Optimizer 绕接。

## 13. 发布线声明

本候选建立在干净 R8 基线之上并保持独立。此次集成准备没有合并、推送或发布；没有修改任何版本号、release workflow 或发布入口。README 与 CHANGELOG 未触碰。`package.json` 中仅有现有 API-key 设置说明的安全澄清，不包含版本变更。任何后续默认开启、网络接线、文档发布或版本动作都需要单独的维护者批准。

---
🤖 Generated with [OpenAI Codex](https://developers.openai.com/codex/)
