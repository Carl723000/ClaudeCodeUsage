# Claude Code 使用量モニター

🌐 **言語**: [🏠 Main](README.md) | [English](README-en.md) | [繁體中文](README-zh-TW.md) | [简体中文](README-zh-CN.md) | **日本語** | [한국어](README-ko.md) | [Bahasa Indonesia](README-id.md)

---

**Claude Code と Codex のローカル使用量を改善するステータスバーコーチ。** 請求ツールではありません。Claude のコスト / クォータ表示を維持し、Codex Beta は Codex 固有のトークンと動作の意味で分析します。

> **これは何か**：ローカルの Claude Code 会話ログを読み取り、**トークンから算出した**使用量とコストの見積もりを表示する VS Code ステータスバーモニター。さらに、プロンプトの改善と無駄削減を提案する任意の AI アドバイザー付き。
>
> **これは何ではないか**：請求ツールではありません。表示される金額はすべて公開のトークン単価に基づく見積もりです。実際の請求は Anthropic アカウントをご確認ください。

> スクリーンショットは英語 UI のものです。全機能の詳細は[メイン README](README.md) を参照してください。

## スクリーンショット

### ステータスバー

![ステータスバー](images/v2-status-bar-en.png)

クォータ表示にカーソルを合わせると内訳が出ます：

![クォータツールチップ](images/v2-quota-en.png)

### ダッシュボード

![ダッシュボード](images/v2-dashboard-en.png)

## 主な機能

- **ステータスバー** — 本日のコスト、現在のセッションのコスト、そして Claude Code 自身の OAuth セッションから読み取る実際の 5 時間 / 週間クォータ（`5h:N% wk:N%`）。設定不要。
- **ダッシュボードタブ** — 今日 / 今月 / 全期間 に加え、**Sessions / Projects / Content / Branches**。すべて並べ替え可能。
- **積み上げコスト構成チャート**（Y 軸と参照線付き）— 各日 / 各月のコストが入力・出力・キャッシュ書き込み・キャッシュ読み取りにどれだけ使われたか一目で分かります。
- **Content タブ** — どの内容がトークンを消費しているか（あなたのプロンプト vs ツール結果 vs アシスタント出力 / 思考）を推定。
- **AI アドバイス**（任意）— 使用量サマリーと最近のプロンプトのサンプルを OpenAI 互換 API（デフォルト DeepSeek V4 Pro）に送り、具体的な書き換えを提案。キーは自分で用意、または静的デモを先にプレビュー可能。
- **マルチベンダー価格** — Opus 4.x / Sonnet 4.x / Haiku 4.5 は Anthropic 公式価格で検証済み。OpenAI / Gemini / DeepSeek / Kimi / GLM / Qwen の参考価格（ファミリー認識フォールバック付き）。`Refresh Token Pricing` で LiteLLM の最新価格を取得。
- **パーソナライズ** — 言語、タイムゾーン、小数点桁数、コンパクト数値、プロジェクトのグループ化、ダッシュボード自動更新の切り替え。

## v2.3 Codex Beta

- Codex の使用量レコードは `sessions/**/*.jsonl` と `archived_sessions/**/*.jsonl` からだけ検出し、認証情報、DB、未知のファイルは対象外です。これとは別に、`$CODEX_HOME/session_index.jsonl` だけをストリームで読み込み、実際のスレッド名に使う `id` → `thread_name` の対応を取得します。名前に含まれる絶対パスは伏せ、名前はメモリ内だけに保持します。使用量 JSONL の各行は、許可リスト内の使用量・構造メタデータを抽出するためだけにストリーム処理で一時解析します。プロンプト、応答、コマンド、ツール引数の各フィールドは参照も分析利用もせず、保持・永続化もしません。
- **処理済み** = 入力 + 出力、**非キャッシュ使用量** = 非キャッシュ入力 + 出力、**キャッシュ入力**は入力の部分集合、reasoning は出力の部分集合です。Codex のドルコストは推定せず、Claude / Codex / Compare は各プロバイダーの集計方法を分けて扱います。
- Codex に切り替えても、既存の今日 / 今月 / 全期間 / セッション / プロジェクト / コンテンツ / 設定の構成を維持し、Codex の意味に合わせてラベルだけを調整します。両プロバイダーは同じ render function、HTML class、チャート、表、余白、レスポンシブルールを使い、Codex の提案はインデックス済み 30 日間の構造的根拠を使います。
- ルートタスクには、絶対パスを伏せた最新の実際のスレッド名を使います。子タスクは自身の実際のスレッド名を優先し、ない場合は報告されたニックネームを使って親 / ルートタスク名も表示します。それらもない場合はローカライズ済みの中立的な代替名を表示します。プロジェクト名は Git リポジトリ名、Git 外ではフォルダー名です。信頼できる集計ができない Branches や Workflows は作り上げません。
- 過去 7 日 / 30 日は、設定したタイムゾーンでイベント発生日を正確に区切ります。移行やカバレッジが不完全なら**一部**と明示します。上限はローカルログで**最終観測**されたスナップショットであり、リアルタイムの契約情報や請求データではありません。
- 各提案は、インデックス済み 30 日間の構造集計に根拠がある場合だけ、観測、読みやすい根拠、条件付きアクションを示します。根拠がなければ一般論を生成しません。
- 永続インデックスには、マシン固有のソルトで仮名化したキー、数値・構造集計、ならびにサニタイズ済みのプロジェクト、ディレクトリ、エージェント、モデル、effort、役割、時刻、品質メタデータを保存します。生の ID、完全なパスやリポジトリ URL、スレッド名、会話本文は保存しません。
- 共通の Settings タブは、Codex 選択時に共通設定と Codex に有効な設定だけを表示します。Codex の収集とローカル Codex 提案は別々に無効化できます。バックグラウンド監視遅延は既定 30 秒で、Off や長い間隔も選べます。

## インストール

拡張機能ビュー（`Ctrl+Shift+X`）で **`Claude Code Usage`** を検索するか：

```
ext install GrowthJack.claude-code-usage
```

Cursor / Windsurf 向けに [Open VSX Registry](https://open-vsx.org/extension/GrowthJack/claude-code-usage) でも公開しています。

## 設定

設定（`Ctrl+,`）を開き **`Claude Code Usage`** を検索。すべて任意です。よく使うもの：

- `language` — UI 言語（`auto` / `en` / `de-DE` / `zh-TW` / `zh-CN` / `ja` / `ko` / `pt-BR` / `id`）。
- `timezone` — 日付表示用の IANA タイムゾーン（例 `Asia/Tokyo`）。
- `usageLimitTracking` — 実際の 5 時間 / 週間クォータ表示。
- `showCost` / `showContext` — ステータスバーのコスト表示と、コンテキストウィンドウ使用率（`/context` 風）の切り替え。
- これらのステータスバー項目は個別に非表示にできます。`usageLimitTracking` / `showCost` / `showContext` を `false` にすると、その項目だけ消えます。
- `advice.apiKey` — AI アドバイス機能の API キー（OpenAI 互換）。
- `pauseDashboardRefresh` — ダッシュボードの自動更新を一時停止（ダッシュボードのヘッダーでも切り替え可能）。

設定の全一覧は[メイン README](README.md#configuration) を参照。

## トラブルシューティング

**「No Claude Code Data」** — Claude Code がインストールされ、少なくとも一度使用されていることを確認。`dataDirectory` 設定を確認（自動検出は `~/.claude/projects` を参照）。

**クォータが `5h:--% wk:--%`** — Claude Code に一度ログインしてください。拡張機能は `~/.claude/.credentials.json` を読み取り専用で参照します。

**古い月の履歴がない** — Claude Code は `cleanupPeriodDays`（デフォルト 30 日）より古いログを削除します。保持期間を延ばすには `~/.claude/settings.json` に `{ "cleanupPeriodDays": 365 }` を設定。削除済みのログは復元できません。

**トークン数がプロバイダーのダッシュボードより少ない** — 一部のプロキシ / 動的ワークフローはエージェントごとの記録をサブディレクトリに書き込み、不完全な場合があります。実際の消費はプロバイダーの請求ページをご確認ください。ネイティブのワークフロー帰属は計画中です。

**履歴が大きい環境で CPU 使用率が高い／更新が遅い（Linux を含む）**
- V2.2.1 では active 時に隠れて 8 秒へ短縮されるポーリングを廃止し、最初の
  timestamp 読み取りを制限します。導入前は **Live refresh delay** を **Off**、
  **Refresh interval** を **300–900 秒**にし、必要なら **Content analysis** も
  Off にしてください。Dashboard auto-refresh だけを Off にしても、ステータス
  バー用の解析は止まりません。
- V2.2.1 でも高負荷が続く場合は **Show Diagnostic Logs** の匿名 `refresh:` 行だけを
  issue #70 に添付してください。prompt、path、session ID、credential、raw log は含みません。

## クレジット

[`ClaudeCodeUsage/ClaudeCodeUsage`](https://github.com/ClaudeCodeUsage/ClaudeCodeUsage) からフォーク。MIT ライセンス。コミュニティの貢献は [CHANGELOG.md](CHANGELOG.md) に記載。多くのコード変更は [Claude Code](https://claude.com/claude-code) の支援で作成されました。

開発ツールのクレジット：リポジトリの保守には [Claude Code](https://claude.com/claude-code) と [OpenAI Codex](https://developers.openai.com/codex/) の両方を使用しています。これは人間のコントリビューターとは別のツール表記であり、Codex を Release Drafter のコントリビューター一覧に加えたり、架空の `Co-Authored-By` ID を付けたりしません。

**Issue・PR・アイデアを歓迎します** —— それがプロジェクトの成長につながります。

## ライセンス

[MIT](LICENSE)
