# 架构说明

> 本文简要说明扩展的 provider 边界、数据流与用量语义。模块职责或
> provider 行为变化时必须同步更新。英文版见
> [`ARCHITECTURE.md`](ARCHITECTURE.md)。

## 产品边界

**Claude Code Usage** 继续保持 local-first、无 runtime dependency 和 read-mostly。
v2.3.0 保留完整 Claude 体验，并增加 provider-specific 的 Codex Beta 用量与优化视图。

- Claude：精确的本地 token bucket、模型成本估算和 Anthropic OAuth 5 小时/每周配额。
- Codex Beta：本地 processed/fresh/cache/output/reasoning 指标、模型与 effort 拆分、
  thread 结构、索引 coverage、quality flag 与结构化优化建议。
- Compare：只并列可比指标，绝不把不同 provider 的成本、配额或 token 求和为误导性总量。

完整账单/发票对账、驱动任一 coding agent 与后台 telemetry 不在范围内。
Opt-in GitHub 认证和跨设备聚合同步延后到 v2.4.x，届时单独做隐私审阅。

## 模块地图（`src/`）

| 模块 | 职责 |
|---|---|
| `extension.ts` | 激活、命令、设置、provider 生命周期、刷新编排、watcher、状态栏/webview 接线和匿名诊断。 |
| `dataLoader.ts` | 既有 Claude 发现、解析、去重、归因、内容分析和聚合。 |
| `providers/providerTypes.ts` | Provider-neutral token、event、confidence、outcome、coverage 和 limit contract。 |
| `providers/claudeProvider.ts` | 薄兼容 adapter，不改变既有 Claude 聚合结果。 |
| `providers/codex/codexSchema.ts` | 最小安全 JSON guard，不展开或返回 message/command/tool body。 |
| `providers/codex/codexParser.ts` | Codex cumulative high-water 解析、伪名 lineage metadata、结构计数、quality flag 和 last-observed limit。 |
| `providers/codex/codexManifest.ts` | Codex 允许目录发现、HMAC file key、fingerprint 和 manifest diff。 |
| `providers/codex/codexIndex.ts` | 持久化 per-file 数字聚合、cold/tail parse、coverage 和原子存取。 |
| `providers/codex/codexIndexWorker.ts` / `codexIndexClient.ts` | 后台 worker、recent-first progress、cancel、resume 和 single-flight client。 |
| `providers/codex/codexProvider.ts` | 面向 extension 的 Codex snapshot facade 与 partial/unavailable/error outcome。 |
| `providers/codex/codexUsage.ts` | Codex-specific 最近 task/7 天/30 天/项目 view model 聚合。 |
| `providers/codex/codexInsights.ts` | 确定性的结构用量建议，不读 prompt/body。 |
| `codexView.ts` | 无依赖 Codex 与 Compare HTML renderer。 |
| `settings.ts` | 权威 `SETTINGS` catalog 和 `SettingsStore`；不得散落直接读取。 |
| `statusBar.ts` / `codexStatus.ts` | Provider-specific 状态展示和通用 Claude 配额格式化。 |
| `webview.ts` | 既有 Claude dashboard、provider tab 和隔离的 Codex/Compare render slot。 |
| `i18n.ts` | 八个 UI locale 的全部用户可见文案。 |
| `types.ts` | 共享 extension 和 Claude contract。 |

`quotaFormat.ts`、`dateKeys.ts`、`shareCard.ts`、`heatmap.ts`、`conversationLog.ts`、
`miniMarkdown.ts` 等既有纯模块保持当前职责与测试。

## Provider 数据流

```text
Claude JSONL ──> ClaudeDataLoader ──> Claude adapter ──> Claude 状态栏/dashboard

允许的 Codex JSONL
  ──> manifest metadata
  ──> background worker
  ──> schema guard + lineage high-water parser
  ──> per-file 数字聚合索引
  ──> CodexProviderSnapshot
  ──> Codex scope + insight
  ──> Codex 状态栏/dashboard

Claude view + Codex view ──> 并列 Compare（不跨 provider 求和）
```

任一 provider unavailable 或 partial 时，不清空另一 provider 最近验证的 snapshot。
Claude-only 保持 v2.2.1 行为；Codex-only 默认显示 Codex；两者都有时 dashboard 默认 Claude。

## Token 与 limit 语义

Claude record 带 Anthropic 的四个 token bucket。扩展对其校验、去重、求和并按模型计价。
Claude 成本仍是根据费率表的估算，不是发票。

Codex 使用以下规则：

- processed = `input total + output total`
- fresh input + output = `max(0, input total - cached input) + output total`
- cached input 是 input 子集，reasoning output 是 output 子集
- 两个子集都不再次加入 processed total
- fresh input + output 是优化行为的辅助指标，不与成本/配额等价

Codex `total_token_usage` 是 cumulative，且可能包含继承的 parent baseline。因此按 component
和 lineage 维护 high-water。Unknown parent、counter regression 和 schema drift 产生 quality flag，
不生成负用量或伪造精度。

本地日志中的 Codex `rate_limits.primary` 只是 last-observed snapshot，到 reset 时间后隐藏。
v2.3.0 不读 Codex credential，也不发网络请求刷新它。

## 隐私与持久化

Codex 发现仅限：

- `$CODEX_HOME/sessions/**/*.jsonl`
- `$CODEX_HOME/archived_sessions/**/*.jsonl`
- 默认 `$CODEX_HOME`：`~/.codex`

绝不读取 `auth.json`、SQLite、config secret、keychain、浏览器状态或未知文件。
Raw path/session/parent ID 只留在本地 worker 的短期内存。磁盘只持久化 machine-salted 伪名 key
和按 day/model/effort/session 聚合的数字，绝不存 prompt、response、command、tool arguments、
raw line 或 raw path。

Machine salt 存在 VS Code `globalState`，不写入索引。Worker progress/result/error 与 diagnostics
只含匿名计数与时间，不含 path 或 ID。

## 刷新与规模

Claude polling 始终遵守 `refreshInterval`，file watcher 使用配置的 quiet debounce。
Codex 使用独立 quiet debounce（默认 30 秒，可选 Off/10/30/60/120/300）。

Codex 按 2.4-GB-class 本地历史设计：

- 发现与解析在 Extension Host 之外的 worker 中执行；
- recent-first 索引，支持 progress 与 cancel；
- unchanged warm refresh 不读 JSONL body；
- append refresh 只读新 tail，保留不完整末行；
- truncate/replacement 只重解析受影响文件；
- 原子持久化与 per-file contribution 允许中断后 resume；
- 并发 refresh 共享同一 worker run。

## 发布不变量

- 根据变更风险执行 strict TypeScript、red-green TDD、完整 `node:test`、F5 smoke test
  和安装 VSIX smoke test。
- 用户可见字符串覆盖 `en`、`de-DE`、`zh-TW`、`zh-CN`、`ja`、`ko`、`pt-BR`、`id`；
  七份 README 同步。
- 不手工修改 `package.json` 版本。发布已审阅的 Release Drafter draft 后才创建 tag，
  publish workflow 再从 tag 写入包版本。
- 通过合并贡献者原 PR，或经授权先修改该 PR 分支再合并，保留贡献归属。
