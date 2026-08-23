# v2.3.1 AI 建议有效性：实验界面设计计划

> 状态：仅用于 v2.3.1 候选集成。功能开关默认关闭；本文不代表当前发布承诺。

## 设计目标与边界

界面服务于一个明确问题：用户能否先看清“哪些本地证据支持哪条建议、若继续会发送什么、
应用后怎样判断是否有效”，再决定是否参与实验。它接入现有 Content 页的 AI Advice / Codex
本地优化建议区域，不增加第三个顶层入口，不替换 Prompt Optimizer，也不改变现有 BYOK 能力。

实验关闭时不渲染此界面。实验打开后也不会自动联网；本轮只提供精确 payload 密封预览、
本地反馈和证据不足状态，不提供发送按钮或生产端点。

## 视觉系统

- **颜色**：只使用现有 VS Code 主题令牌。背景与正文使用
  `--vscode-editor-background` / `--vscode-foreground`；边界和次级文本使用
  `--vscode-panel-border` / `--vscode-descriptionForeground`；交互和焦点使用
  `--vscode-button-background` / `--vscode-focusBorder`；快照使用
  `--vscode-editorWidget-background` 与编辑器等宽字体。Light+ 与 Dark+ 均由宿主主题决定，
  不引入品牌外的渐变或硬编码强调色。
- **字体**：说明文字沿用 `--vscode-font-family` 与现有 13px 密度；指标、字节数和 JSON
  使用 `--vscode-editor-font-family`。小型状态章保持 10–11px，但不承载唯一语义。
- **空间**：沿用 `.action-card`、`.model-details-stacked`、现有按钮与输入组件的间距，
  保持 Content 页的信息密度，不新增“大号 KPI 卡片”风格。
- **标志性元素**：一条连续的“证据脊柱”连接五个有序阶段；密封快照标题显示
  `SEALED · N BYTES · SHA-256`，正文逐字呈现同一组 canonical UTF-8 bytes。

## 信息架构与草图

宽屏：

```text
┌ AI 建议有效性（实验）──────────────────────────────────────────────┐
│ [观察] ─── [证据] ─── [建议] ─── [行动] ─── [结果]               │
│  数值        强度        有条件      本地反馈      样本/质量护栏       │
│                                                                  │
│ □ 仅允许聚合数据     □ 允许附加用户 prompt（默认关，独立同意）        │
│ [生成密封快照]                                                    │
│ ▾ SEALED · 1248 BYTES · SHA-256 · AGGREGATES ONLY                │
│   {"schemaVersion":1,...}                                        │
└──────────────────────────────────────────────────────────────────┘
```

窄屏时五个阶段改为纵向排列，脊柱成为左侧竖线；同意项和按钮自然换行，JSON 区域横向滚动，
不压缩或省略发送字节。

## 交互与可访问性

- 两项同意分开保存于带版本迁移的 VS Code `globalState`：聚合数据默认未同意；prompt 个性化默认关闭，
  且只有聚合同意后才可选择。prompt 的正文必然出现在密封快照中。
- “生成密封快照”只向 extension host 请求准备对象。host 再次验证实验开关与同意状态，
  只序列化一次并保留 canonical UTF-8 bytes；预览正文从同一 bytes 解码，byte count 与 SHA-256
  也从同一 bytes 派生，未来 transport 只能接收这个 Prepared 对象，不能重新序列化。
- 有用 / 无用 / 已应用使用原生 `<button>`，通过 `aria-pressed` 表达状态；同一建议的有用和
  无用互斥，已应用独立。反馈仅写 VS Code `globalState`。
- 所有交互可用键盘完成；结构使用标题、列表、`fieldset` / `legend`、`aria-live`，焦点使用
  VS Code 焦点令牌。刷新后同意、展开状态和选中的 provider UI 状态保持。
- 结果阶段在最小可比样本或质量护栏不足时只显示“证据不足”，不把单次波动表述为有效。

## 内容与隐私规则

- 默认路径仅包含同一窗口的聚合数值、粗粒度模型家族、allow-list 指标、置信度与证据引用；
  不接收或序列化 raw session、逐条记录、prompt、response、工程路径、cwd 或稳定会话 ID。
- 长 Session 只使用 elapsed-duration 代理；大上下文只使用数值 token 阈值。只有确定性阈值
  达到且样本充分时，才呈现“在稳定任务边界新建 Session / `/clear`”的条件动作。
- 主题漂移属于语义判断；只有用户单独允许 prompt 个性化时才可能进入后续模型路径，且相关
  prompt 必须完整出现在精确预览中。本轮不从无正文信号推断主题漂移。
- 严格解析失败、版本未知、持久化损坏或证据不完整时关闭结果，不生成宽松 fallback 建议。

## 设计自检与修订

初稿容易演变为另一组通用指标卡，造成第三套孤立体验。修订后，界面嵌入现有 Advice / Codex
建议卡，复用同一 action-card 语法，并以单条连续证据脊柱表达因果边界。唯一新增的视觉签名是
“密封字节快照”，它直接服务于隐私核对，不是装饰。窄屏、键盘、屏幕阅读器和主题切换都纳入
验收；默认关闭时不改变当前用户界面。
