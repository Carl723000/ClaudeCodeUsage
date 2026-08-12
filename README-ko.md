# Claude Code 사용량 모니터

🌐 **언어**: [🏠 Main](README.md) | [English](README-en.md) | [繁體中文](README-zh-TW.md) | [简体中文](README-zh-CN.md) | [日本語](README-ja.md) | **한국어** | [Bahasa Indonesia](README-id.md)

---

**Claude Code와 Codex의 로컬 사용량을 개선하는 상태 표시줄 코치.** 청구 도구가 아닙니다. Claude 비용 / 쿼터 보기를 유지하면서 Codex Beta는 Codex 고유의 토큰과 동작 의미로 분석합니다.

> **무엇인가**: 로컬 Claude Code 대화 로그를 읽어 **토큰 기반**의 사용량과 비용 추정치를 보여주는 VS Code 상태 표시줄 모니터. 프롬프트 개선과 낭비 절감을 제안하는 선택적 AI 어드바이저 포함.
>
> **무엇이 아닌가**: 청구 도구가 아닙니다. 표시되는 모든 금액은 공개된 100만 토큰당 단가 기준 추정치입니다. 실제 청구는 Anthropic 계정을 확인하세요.

> 스크린샷은 영어 UI 기준입니다. 전체 기능 설명은 [메인 README](README.md)를 참고하세요.

## 스크린샷

### 상태 표시줄

![상태 표시줄](images/v2-status-bar-en.png)

쿼터 표시기에 마우스를 올리면 상세 내역이 나옵니다:

![쿼터 툴팁](images/v2-quota-en.png)

툴팁에는 각 기간의 사용률, 남은 시간, 실제 초기화 시각이 표시됩니다. 요금제가
측정하는 각 주간 한도는 Anthropic이 동적으로 이름을 제공하는 모델별 한도와
활성화된 사용 크레딧을 포함해 각각 별도의 행으로 표시됩니다.

### 대시보드

![대시보드](images/v2-dashboard-en.png)

## 기능

- **상태 표시줄** — 오늘 비용, 현재 세션 비용, 그리고 Claude Code 자체 OAuth 세션에서 읽는 실제 5시간 / 주간 쿼터(`5h:N% wk:N%`). 설정 불필요.
- **대시보드 탭** — 오늘 / 이번 달 / 전체 기간, 그리고 **Sessions / Projects / Content / Branches**. 모두 정렬 가능.
- **누적 비용 구성 차트**(Y축과 기준선 포함) — 각 일 / 월의 비용 중 입력·출력·캐시 쓰기·캐시 읽기가 차지하는 비율을 한눈에.
- **Content 탭** — 어떤 콘텐츠가 토큰을 소비하는지 추정(내 프롬프트 vs 도구 결과 vs 어시스턴트 출력 / 사고).
- **AI 조언**(선택) — 사용량 요약과 최근 프롬프트 샘플을 OpenAI 호환 API(기본 DeepSeek V4 Pro)로 보내 구체적인 재작성을 제안. 키는 직접 준비하거나, 정적 데모를 먼저 미리보기.
- **멀티 벤더 가격** — Opus 4.x / Sonnet 4.x / Haiku 4.5는 Anthropic 공식 가격으로 검증. OpenAI / Gemini / DeepSeek / Kimi / GLM / Qwen 참고 가격(패밀리 인식 폴백 포함). `Refresh Token Pricing`으로 LiteLLM 최신 가격 가져오기.
- **개인화** — 언어, 시간대, 소수 자릿수, 간략 숫자, 프로젝트 그룹화, 대시보드 자동 새로고침 토글.

## v2.3 Codex Beta

- Codex 사용량 레코드는 `sessions/**/*.jsonl`과 `archived_sessions/**/*.jsonl`에서만 찾으며 자격 증명, DB, 알 수 없는 파일은 제외합니다. 별도로 `$CODEX_HOME/session_index.jsonl` 하나만 정확히 스트리밍해 실제 스레드 제목에 사용할 `id` → `thread_name` 매핑을 가져옵니다. 제목 속 절대 경로는 가리고 제목은 메모리에만 유지합니다. 사용량 JSONL 각 줄은 허용 목록의 사용량·구조 메타데이터를 추출하기 위해서만 스트리밍 방식으로 일시 파싱합니다. 프롬프트, 응답, 명령, 도구 인수 필드는 검사하거나 분석에 사용하지 않으며 보관·영구 저장하지 않습니다.
- **처리된** 값 = 입력 + 출력, **새 입력을 포함한 fresh** = 캐시되지 않은 입력 + 출력, **캐시 입력**은 입력의 부분집합, reasoning은 출력의 부분집합입니다. Codex의 달러 비용은 추정하지 않으며 Claude / Codex / Compare는 공급자별 집계 의미를 분리합니다.
- 기존 대시보드와 같은 시각 언어로 세 개의 기본 화면을 제공합니다. **개요**는 최근 작업 / 최근 7일 / 최근 30일 / 전체 범위의 요약, 추이, 구성, 마지막 관측 한도와 최근 작업을 보여 줍니다. **탐색**은 프로젝트, 세션, 모델 및 추론 강도에 검색·필터·정렬·드릴다운과 부모/자식 계보를 제공합니다. **최적화 제안**은 선택한 범위를 따릅니다.
- 루트 작업은 절대 경로를 가린 최신 실제 스레드 제목을 사용합니다. 자식 작업은 자신의 실제 스레드 제목을 우선 사용하고, 제목이 없으면 보고된 닉네임을 사용하면서 부모 / 루트 작업 제목도 표시합니다. 이 정보도 없으면 현지화된 중립 대체 이름을 표시합니다. 프로젝트 이름은 Git 저장소 이름을, Git 외부에서는 폴더 이름을 사용합니다. 안정적으로 집계할 수 없는 Branches나 Workflows를 만들어 내지 않습니다.
- 최근 7일 / 30일 값은 설정한 시간대에서 이벤트 발생일을 정확히 나눠 계산합니다. 마이그레이션이나 커버리지가 불완전하면 **부분**으로 명시합니다. 한도는 로컬 로그에서 **마지막 관측**된 스냅샷이며 실시간 구독 또는 청구 데이터가 아닙니다.
- 각 제안은 선택 범위에 근거가 있을 때만 관측, 읽기 쉬운 근거, 구조적 프록시 설명, 조건부 행동을 보여 줍니다. 근거가 없으면 일반적인 조언을 생성하지 않습니다.
- 영구 인덱스에는 기기별 솔트로 가명화한 키, 수치·구조 집계, 그리고 정제된 프로젝트, 디렉터리, 에이전트, 모델, effort, 역할, 시간, 품질 메타데이터를 저장합니다. 원시 ID, 전체 경로나 저장소 URL, 스레드 제목, 대화 본문은 저장하지 않습니다.
- Settings는 이전 기본 화면으로 돌아가는 공급자 인식 보조 페이지이며 네 번째 기본 탭이 아닙니다. Codex 수집과 로컬 Codex 제안은 각각 끌 수 있습니다. 백그라운드 감시 지연은 기본 30초이며 Off 또는 더 긴 간격도 선택할 수 있습니다.

## 설치

확장 보기(`Ctrl+Shift+X`)에서 **`Claude Code Usage`**를 검색하거나:

```
ext install GrowthJack.claude-code-usage
```

Cursor / Windsurf용으로 [Open VSX Registry](https://open-vsx.org/extension/GrowthJack/claude-code-usage)에도 게시되어 있습니다.

## 설정

설정(`Ctrl+,`)을 열고 **`Claude Code Usage`**를 검색하세요. 모두 선택 사항입니다. 가장 유용한 것:

- `language` — UI 언어(`auto` / `en` / `de-DE` / `zh-TW` / `zh-CN` / `ja` / `ko` / `pt-BR` / `id`).
- `timezone` — 날짜 표시용 IANA 시간대(예: `Asia/Seoul`).
- `usageLimitTracking` — 실제 5시간 / 주간 쿼터 표시.
- `showScopedWeekly` — Anthropic이 현재 실제로 명명한 모델별 주간 한도를 상태
  표시줄에 선택적으로 추가합니다.
- `showCost` / `showContext` — 상태 표시줄의 비용 항목과 컨텍스트 윈도우 사용률(`/context` 유사) 표시 전환.
- 위 상태 표시줄 항목들은 개별적으로 끌 수 있습니다. `usageLimitTracking` / `showCost` / `showContext` 를 `false`로 설정하면 해당 항목만 숨겨집니다.
- `advice.apiKey` — AI 조언 기능용 API 키(OpenAI 호환).
- `pauseDashboardRefresh` — 대시보드 자동 새로고침 일시정지(대시보드 헤더에서도 토글 가능).

전체 설정 표는 [메인 README](README.md#configuration)를 참고하세요.

## 문제 해결

**"No Claude Code Data"** — Claude Code가 설치되어 최소 한 번 사용되었는지 확인하고, `dataDirectory` 설정을 확인하세요(자동 감지는 `~/.claude/projects`를 봅니다).

**쿼터가 `5h:--% wk:--%`로 표시** — Claude Code에 한 번 로그인하세요. 확장은 `~/.claude/.credentials.json`을 읽기 전용으로 참조합니다.

**이전 달 기록 누락** — Claude Code는 `cleanupPeriodDays`(기본 30일)보다 오래된 로그를 삭제합니다. 더 오래 보관하려면 `~/.claude/settings.json`에 `{ "cleanupPeriodDays": 365 }`를 설정하세요. 이미 삭제된 로그는 복구할 수 없습니다.

**토큰 수가 프로바이더 대시보드보다 적음** — 일부 프록시 / 동적 워크플로는 에이전트별 기록을 하위 디렉터리에 쓰며 불완전할 수 있습니다. 실제 지출은 프로바이더 청구 페이지를 확인하세요. 네이티브 워크플로 귀속 기능은 계획 중입니다.

**큰 기록에서 CPU 사용률이 높거나 새로 고침이 느림(Linux 포함)**
- V2.2.1은 active 상태에서 숨겨진 8초 폴링 강제를 제거하고 첫 timestamp 읽기를
  제한합니다. 설치 전에는 **Live refresh delay**를 **Off**, **Refresh interval**을
  **300–900초**로 설정하고 필요하면 **Content analysis**도 끄세요. Dashboard
  auto-refresh만 끄면 상태 표시줄용 로그 파싱은 계속됩니다.
- V2.2.1에서도 높은 사용률이 계속되면 **Show Diagnostic Logs**의 익명 `refresh:`
  줄만 issue #70에 첨부하세요. prompt, path, session ID, credential, raw log는 포함되지 않습니다.

## 크레딧

[`ClaudeCodeUsage/ClaudeCodeUsage`](https://github.com/ClaudeCodeUsage/ClaudeCodeUsage)에서 포크. MIT 라이선스. 커뮤니티 기여는 [CHANGELOG.md](CHANGELOG.md)에 명시. 많은 코드 변경은 [Claude Code](https://claude.com/claude-code)의 도움으로 작성되었습니다.

개발 도구 크레딧: 저장소 유지보수에는 [Claude Code](https://claude.com/claude-code)와 [OpenAI Codex](https://developers.openai.com/codex/)를 함께 사용합니다. 이는 사람 기여자와 분리된 도구 표기이며, Codex를 Release Drafter의 사람 기여자 목록에 넣거나 허위 `Co-Authored-By` 신원을 부여하지 않습니다.

**이슈, PR, 아이디어를 환영합니다** —— 그것이 프로젝트가 성장하는 방식입니다.

## 라이선스

[MIT](LICENSE)
