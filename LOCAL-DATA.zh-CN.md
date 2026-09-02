# 本地数据与隐私

Claude Code Usage 采用本地优先设计。插件只读取供应商拥有的本地用量日志，
并保留快速刷新、重置识别和额度估算所必需的有界派生状态；API 等效成本始终
只是估算，不是账单。

本文是 v2.3.1 面向用户的数据清单。字段级规范见
[`docs/superpowers/specs/2026-09-02-v2.3.1-local-data-contract.zh-CN.md`](docs/superpowers/specs/2026-09-02-v2.3.1-local-data-contract.zh-CN.md)。

## 插件读取和保留什么

| 数据类别 | 来源 | 插件保留的内容 | 保留与清除 | 远程交互 |
|---|---|---|---|---|
| Claude 用量记录 | Claude Code 本地 `projects/**/*.jsonl` | 运行时用量记录和内存中的逐文件索引；仅在启用内容分析时保留有界提示样本 | 窗口重载/退出即释放；绝不修改源日志 | 默认无；只有用户另行预览并发送建议请求时才可能包含获准内容 |
| Codex 用量记录 | `$CODEX_HOME/sessions/**/*.jsonl` 与 `archived_sessions/**/*.jsonl` | 版本化增量索引：匿名文件键、偏移量、数值用量、日期、模型/effort 和已净化结构聚合 | 保留到重建、明确清除、schema 替换或宿主移除 | 无 |
| Codex 标题 | 仅 `$CODEX_HOME/session_index.jsonl` | 流式读取 `id → thread_name` 供运行时显示；标题不写入索引 | 仅运行时 | 无 |
| 额度观测 | Claude 官方额度响应或 Codex 结构化 rate-limit 事件 | 供应商、本机匿名账号 epoch、观测/重置时间、周期、已用/剩余比例、匿名窗口标识、来源、可信度和质量标志 | 保留不超过 180 天；边界保护压缩后每个供应商/账号/周期最多 512 条；可单独或随全部派生数据清除 | 启用时 Claude 额度查询会访问 Anthropic；Codex 额度证据只来自本地 |
| 设置与 UI 偏好 | 用户选择 | 类型化设置、标签页/筛选、有限后台任务状态、热力图标题/范围/隐私预览 | 保留到重置、清除或卸载；普通 VS Code 设置可能参与 Settings Sync | 插件不主动传输 |
| 分享目标 | 用户输入的 GitHub 目标 | 可选 `owner/repository/path`；不保存 GitHub 凭据 | 保留到重置分享偏好 | 仅在用户明确发布并确认精确目标后发生 |
| 建议证据 | 本地派生聚合与明确反馈 | 粗粒度观察、建议、评分、暂停、可比任务指标、覆盖率和版本 | 有界本地台账；可独立清除 | 默认不发送；只有单独确认后才发送精确预览过的请求 |
| 建议 API Key | 用户自备密钥 | 仅存于 VS Code SecretStorage | 保留到清除密钥或全部派生数据 | 只作为用户明确配置端点的授权凭据 |

## 绝不缓存什么

- OAuth access/refresh token、cookie、authorization header 或 GitHub 凭据。
- VS Code SecretStorage 之外的 API key。
- 完整账号标识、邮箱、显示名或订阅名称。账号连续性只用本机 HMAC
  fingerprint 或隔离的未归属 epoch。
- 原始提示/响应正文、工具参数、命令、完整 CLI 输出、源日志绝对路径、
  仓库 remote 或持久化线程标题。

不同匿名账号 fingerprint 不会合并。如果本地 Codex 日志无法证明属于同一账号
和同一窗口，仪表盘只显示已用 API 等效价值，并说明为何不能声称账号级未用额度。

## 综合热力图与导出

“对比”热力图直接复用供应商日聚合，不会再次扫描日志，也不会新增第二套统计缓存。

```text
Claude processed = input + cache creation + cache read + output
Codex processed  = input total + output total
综合活动量 = Claude processed + Codex processed
```

Codex 的 cached input 已包含在 input total 中，reasoning 已包含在 output total 中，
因此均不得重复相加。综合活动量只代表本地 Token 活动，不代表生产率、账单、模型能力
或两个供应商的能力等价。

本地 SVG 与 Markdown 导出只含有界标题、所选日期范围、每日 Claude/Codex/综合聚合、
标签和免责声明；不含账号、项目、线程标题、路径、提示或日志内容。

直接发布到 GitHub 是可选动作，且绝不在后台运行。v2.3.1 仅请求 `public_repo`，
先验证仓库公开性和默认分支，再要求用户确认精确的
`owner/repository/branch/path` 以及创建或覆盖动作。私有仓库应改用本地 SVG +
Markdown，不会静默索取更宽权限。

## 清除与迁移

Data 设置提供独立控制：重建 Codex 派生索引、清除额度历史、清除建议数据、重置 UI
或分享偏好、移除 BYOK 密钥。“清除全部扩展派生数据”会先列出精确目标。上述操作均不
删除 Claude/Codex 源日志或供应商拥有的凭据。

v2.3.1 会先验证并原子迁移已知旧版额度/配置状态，成功后才移除旧副本。损坏或未来
schema 会安全失败；替代文件通过验证前不会覆盖旧的有效文件。卸载后宿主可能保留
扩展存储，因此明确的清除命令才是可靠删除路径。

## 已知限制

- 从未出现在官方响应或本地结构化事件中的重置无法重建；只有日粒度的 Codex 证据
  会降低边界可信度。
- 同一 Codex home 可能包含多个登录。归属重叠不清时只显示已用值，绝不虚构账号拆分。
- API 等效价值按当前已知公开 API 单价和定价覆盖率估算，不是供应商账单或订阅价格。
- 源日志保留期由 Claude Code 和 Codex 控制，不由本插件控制。
