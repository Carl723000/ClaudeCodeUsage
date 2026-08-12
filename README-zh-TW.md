# Claude Code 使用量監控

🌐 **語言**: [🏠 Main](README.md) | [English](README-en.md) | **繁體中文** | [简体中文](README-zh-CN.md) | [日本語](README-ja.md) | [한국어](README-ko.md) | [Bahasa Indonesia](README-id.md)

---

**看清 Claude Code 與 Codex 的本地用量，讓 AI 幫你用得更好。** 不是帳單工具。Claude 保留成本與配額檢視；Codex Beta 依自己的 token 與行為語意提供分析。

> **它是什麼**：一個 VS Code 狀態列小工具，讀取本地 Claude Code 對話日誌，按 token × 公開單價估算用量與成本；並提供可選的 AI 建議功能，幫你優化提示詞、減少不必要的 token 消耗。
>
> **它不是什麼**：帳單工具。顯示金額均為估算值，實際費用請以官方帳單為準。

> 截圖取自英文介面。完整功能說明請見[主 README](README.md)。

## 截圖

### 狀態列

![狀態列](images/v2-status-bar-en.png)

將滑鼠移到配額指示器上可看到明細：

![配額提示](images/v2-quota-en.png)

提示會列出每個視窗的使用率、剩餘時間與實際重置時刻。方案計量的每一項每週
上限都會各占一列，包括由 Anthropic 動態命名的模型專屬上限，以及啟用時的
使用額度。

### 儀表板

![儀表板](images/v2-dashboard-en.png)

## 功能特色

- **狀態列** — 今日成本、當前 session 成本，以及真實的 5 小時 / 每週配額（`5h:N% wk:N%`），透過 Claude Code 自身的 OAuth 工作階段讀取，無需設定。
- **儀表板分頁** — 今日 / 本月 / 全部時間，外加 **Sessions / Projects / Content / Branches**，皆可排序。
- **堆疊式成本構成圖**，含 Y 軸與參考線 —— 一眼看出每日 / 每月的成本中，輸入、輸出、快取寫入、快取讀取各佔多少。
- **Content 分頁** — 估算哪些內容消耗你的 token（你的提示 vs 工具結果 vs 助理輸出 / 思考）。
- **AI 建議**（選用）— 將用量摘要加上你近期提示的樣本送往 OpenAI 相容 API（預設 DeepSeek V4 Pro），給出具體改寫建議。需自備 key，或先預覽靜態示範。
- **多廠商定價** — Opus 4.x / Sonnet 4.x / Haiku 4.5 對照 Anthropic 官方定價；OpenAI / Gemini / DeepSeek / Kimi / GLM / Qwen 參考價，含家族感知回退。`Refresh Token Pricing` 可拉取 LiteLLM 即時價格。
- **個人化** — 語言、時區、小數位數、精簡數字、專案分組、儀表板自動刷新開關。

## v2.3 Codex Beta

- Codex 用量記錄只會從 `sessions/**/*.jsonl` 與 `archived_sessions/**/*.jsonl` 中發現；憑證、資料庫與未知檔案仍明確排除。此外，擴充功能會精確串流讀取 `$CODEX_HOME/session_index.jsonl`，僅將 `id` 對應到 `thread_name`，用於真實執行緒標題。標題中的絕對路徑會先去識別化，標題只保留在記憶體。用量 JSONL 會逐行串流並暫時解析，以擷取白名單內的用量與結構中繼資料；提示、回覆、命令和工具參數欄位不會被檢查或用於分析，也不會被保留或持久化。
- **已處理** = 輸入 + 輸出；**新鮮** = 未快取輸入 + 輸出；**快取輸入**仍是輸入的子集，reasoning 仍是輸出的子集。Codex 不估算美元成本；Claude / Codex / Compare 會維持各供應商獨立的統計口徑。
- 三個主頁面沿用現有儀表板的視覺語言：**總覽**提供最近任務 / 最近 7 天 / 最近 30 天 / 全部時間的摘要、趨勢、構成、最後觀測額度與最近任務；**探索**包含專案、工作階段、模型與推理強度，可搜尋、篩選、排序、下鑽並查看父子譜系；**最佳化建議**跟隨所選範圍。
- 根任務使用經過路徑去識別化的最新真實執行緒標題；子任務優先使用自己的真實執行緒標題，缺少時使用其回報的暱稱並顯示父級 / 根任務標題；這些資訊仍缺少時採用本地化的中性回退名稱。專案名稱使用 Git 儲存庫名稱，非 Git 目錄則使用資料夾的末級名稱。擴充功能不會虛構無法可靠統計的 Branches 或 Workflows。
- 最近 7 天與 30 天依設定時區中的事件發生日精確切片。遷移或覆蓋不完整時會明確顯示為**部分**。額度是本地記錄中**最後觀測**到的快照，不是即時訂閱或帳單資料。
- 每則建議只在所選範圍有證據時顯示觀測、易讀證據、結構性代理指標解釋和條件式行動；沒有證據就不會產生泛化建議。
- 持久索引保存使用本機鹽值產生的假名化鍵、數值與結構聚合，以及經過去識別化的專案、目錄、agent、模型、effort、角色、時間和品質中繼資料；絕不保存原始 ID、完整路徑或儲存庫 URL、執行緒標題或對話正文。
- 設定是會返回上一個主頁面的供應商感知輔助頁，並非第四個主分頁。Codex 資料收集和本地 Codex 建議可分別關閉；背景監聽延遲可設定（預設 30 秒，也可關閉或選更長間隔）。

## 安裝

在擴充功能檢視（`Ctrl+Shift+X`）搜尋 **`Claude Code Usage`**，或：

```
ext install GrowthJack.claude-code-usage
```

也發佈於 [Open VSX Registry](https://open-vsx.org/extension/GrowthJack/claude-code-usage)，供 Cursor / Windsurf 使用。

## 設定

開啟設定（`Ctrl+,`）並搜尋 **`Claude Code Usage`**。所有設定皆為選用，最常用的：

- `language` — 介面語言（`auto` / `en` / `de-DE` / `zh-TW` / `zh-CN` / `ja` / `ko` / `pt-BR` / `id`）。
- `timezone` — 日期顯示用的 IANA 時區（如 `Asia/Hong_Kong`）。
- `usageLimitTracking` — 顯示真實的 5 小時 / 每週配額指示器。
- `showScopedWeekly` — 可選擇在狀態列加入 Anthropic 目前實際命名的模型專屬
  每週上限。
- `showCost` / `showContext` — 切換狀態列的成本項目與上下文視窗佔用指示器（類似 `/context`）。
- 上述狀態列項目皆可個別隱藏：將 `usageLimitTracking` / `showCost` / `showContext` 設為 `false` 即可只隱藏該項。
- `advice.apiKey` — AI 建議功能的 API key（OpenAI 相容）。
- `pauseDashboardRefresh` — 暫停儀表板自動刷新（也可在儀表板標題列切換）。

完整設定表請見[主 README](README.md#configuration)。

## 疑難排解

**「無 Claude Code 資料」** — 確認 Claude Code 已安裝並至少使用過一次；檢查 `dataDirectory` 設定（自動偵測會查 `~/.claude/projects`）。

**配額顯示 `5h:--% wk:--%`** — 登入 Claude Code 一次即可；插件以唯讀方式讀取 `~/.claude/.credentials.json`。

**缺少較早月份的歷史** — Claude Code 會刪除超過 `cleanupPeriodDays`（預設 30 天）的日誌。若要保留更多，在 `~/.claude/settings.json` 設定 `{ "cleanupPeriodDays": 365 }`。已刪除的日誌無法復原。

**Token 數低於供應商後台** — 部分代理 / 動態工作流會將各 agent 記錄寫入子目錄，可能不完整。實際消費請以供應商帳單為準。原生工作流歸因功能規劃中。

**大量歷史資料下 CPU 佔用高或重新整理緩慢（包括 Linux）**
- V2.2.1 移除了 active 狀態下隱藏的 8 秒輪詢覆蓋，並限制首時間戳掃描。
  安裝 V2.2.1 前，可先把**即時重新整理延遲**設為**關閉**，把**重新整理間隔**
  設為 **300–900 秒**，並視需要關閉**內容分析**。只關閉儀表板自動重新整理
  並不會停止狀態列所需的日誌解析。
- 若 V2.2.1 仍持續高佔用，請執行 **Show Diagnostic Logs**，只把匿名的
  `refresh:` 行附到 issue #70；其中只有計數與耗時，不含提示詞、路徑、
  session ID、憑證或原始日誌行。

## 致謝

Fork 自 [`ClaudeCodeUsage/ClaudeCodeUsage`](https://github.com/ClaudeCodeUsage/ClaudeCodeUsage)。MIT 授權。社群貢獻致謝見 [CHANGELOG.md](CHANGELOG.md)。許多程式碼改動由 [Claude Code](https://claude.com/claude-code) 協助起草。

開發工具致謝：repository 維護同時使用 [Claude Code](https://claude.com/claude-code) 與 [OpenAI Codex](https://developers.openai.com/codex/)。這只記錄開發工具，與人類貢獻者身分分開；Codex 不會列入 Release Drafter 的人類 contributor 名單，也不會使用虛構的 `Co-Authored-By` 身分。

**歡迎提出 Issue、PR 與想法** —— 這正是專案成長的方式。

## 授權

[MIT](LICENSE)
