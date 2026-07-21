/** Styles owned by the Codex provider view. */
export function getCodexViewStyles(): string {
  return `
    body.codex-document,
    body.codex-document .container {
      box-sizing: border-box;
      min-width: 0;
      max-width: 100%;
    }

    body.codex-document .container,
    [data-codex-root],
    [data-codex-root] .codex-page,
    [data-codex-root] .codex-scope-panel,
    [data-codex-root] .hc-main {
      width: 100%;
      min-width: 0;
      max-width: 100%;
    }

    [data-codex-root] .codex-header,
    [data-codex-root] .codex-header-title,
    [data-codex-root] .codex-header-actions {
      display: flex;
      align-items: center;
    }

    [data-codex-root] .codex-header {
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      padding-bottom: 12px;
      margin-bottom: 12px;
    }

    [data-codex-root] .codex-header-title {
      min-width: 0;
      gap: 8px;
    }

    [data-codex-root] .codex-header-title h1 {
      min-width: 0;
    }

    [data-codex-root] .codex-header-actions {
      gap: 8px;
      margin-left: auto;
    }

    [data-codex-root] .codex-beta {
      flex: 0 0 auto;
      padding: 2px 7px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 999px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-color: var(--vscode-panel-border);
      font-size: 11px;
    }

    [data-codex-root] .codex-tabs,
    [data-codex-root] .chart-tabs,
    [data-codex-root] .codex-thread-filters {
      min-width: 0;
      max-width: 100%;
    }

    [data-codex-root] .codex-tabs {
      overflow: visible;
      flex-wrap: wrap;
    }

    [data-codex-root] .daily-table-container,
    [data-codex-root] .hc-scroll {
      overflow: visible;
    }

    [data-codex-root] .codex-scroll-region {
      max-width: 100%;
      min-width: 0;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-gutter: stable;
    }

    [data-codex-root] .number-cell {
      text-align: right;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }

    [data-codex-root] .codex-chart-bar {
      padding: 0;
      border: 0;
      border-radius: 2px 2px 0 0;
    }

    [data-codex-root] .cost-bar,
    [data-codex-root] .input-bar {
      background: var(--vscode-charts-blue);
    }

    [data-codex-root] .output-bar {
      background: var(--vscode-charts-orange);
    }

    [data-codex-root] .cache-creation-bar {
      background: var(--vscode-charts-purple);
    }

    [data-codex-root] .cache-read-bar {
      background: var(--vscode-charts-yellow);
    }

    [data-codex-root] .messages-bar {
      background: var(--vscode-charts-foreground);
    }

    [data-codex-root] button.codex-disclosure {
      appearance: none;
      min-width: 24px;
      padding: 2px 4px;
      border: 0;
      background: transparent;
      color: var(--vscode-foreground);
    }

    [data-codex-root] .codex-sort-button {
      appearance: none;
      font: inherit;
      width: 100%;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      text-align: inherit;
      cursor: pointer;
    }

    [data-codex-root] .codex-project-sessions-action {
      display: block;
      margin-top: 10px;
    }

    [data-codex-root] button:focus-visible,
    [data-codex-root] summary:focus-visible,
    .provider-tab:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }

    [data-codex-root] .codex-mobile-details {
      display: none;
    }

    [data-codex-root] .codex-tab-content,
    [data-codex-root] .codex-behavior-scope {
      display: none;
    }

    [data-codex-root] .codex-tab-content.active,
    [data-codex-root] .codex-behavior-scope.active {
      display: block;
    }

    [data-codex-root] .codex-period-chart .hc-wrap {
      margin-bottom: 12px;
    }

    [data-codex-root] .codex-chart-value {
      color: var(--vscode-descriptionForeground);
      font-size: 9px;
      line-height: 12px;
      margin-bottom: 3px;
      white-space: nowrap;
    }

    [data-codex-root] .codex-evidence {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    [data-codex-root] .codex-evidence span {
      font-size: 12px;
    }

    [data-codex-root] .codex-coverage,
    [data-codex-root] .codex-limit {
      margin: 12px 0;
      line-height: 1.6;
    }

    [data-codex-root] .codex-insight {
      margin: 8px 0;
    }

    [data-codex-root] .codex-insight-strong {
      border-left: 4px solid var(--vscode-charts-red);
    }

    [data-codex-root] .codex-insight-normal {
      border-left: 4px solid var(--vscode-charts-orange);
    }

    [data-codex-root] .codex-insight-info {
      border-left: 4px solid var(--vscode-charts-blue);
    }

    [data-codex-root] .codex-insights pre {
      white-space: pre-wrap;
      word-break: break-word;
    }

    [data-codex-root] .codex-thread-filters input,
    [data-codex-root] .codex-thread-filters select {
      min-height: 30px;
      padding: 4px 8px;
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 4px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
    }

    [data-codex-root] .codex-thread-filters input {
      flex: 1 1 220px;
    }

    [data-codex-root] .codex-child-thread .name-cell {
      padding-left: 28px;
    }

    [data-codex-root] .codex-task-identity {
      margin-bottom: 12px;
    }

    [data-codex-root] .codex-task-identity h3 {
      margin: 0 0 8px;
    }

    [data-codex-root] .codex-project-thread {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 7px 4px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    [data-codex-root] .codex-project-thread:last-child {
      border-bottom: 0;
    }

    [data-codex-root] .codex-project-thread span {
      color: var(--vscode-descriptionForeground);
    }

    .provider-compare-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .provider-compare-card {
      flex: 1 1 240px;
    }

    .provider-compare-card dl {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px 16px;
    }

    .provider-compare-card dd {
      margin: 0;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    @media (max-width: 480px) {
      [data-codex-root] .codex-header,
      [data-codex-root] .codex-header-actions,
      [data-codex-root] .codex-thread-filters,
      [data-codex-root] .chart-tabs,
      .provider-tabs {
        flex-wrap: wrap;
      }

      [data-codex-root] .summary-grid {
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 140px), 1fr));
      }

      [data-codex-root] .codex-header-actions {
        margin-left: 0;
      }
    }

    @media (max-width: 380px) {
      [data-codex-root] .summary-grid {
        grid-template-columns: minmax(0, 1fr);
      }

      [data-codex-root] .codex-wide-only {
        display: none;
      }

      [data-codex-root] .codex-mobile-details {
        display: block;
        margin-top: 6px;
      }

      [data-codex-root] .codex-session-table,
      [data-codex-root] .codex-session-table tbody,
      [data-codex-root] .codex-session-table tr,
      [data-codex-root] .codex-session-table td.name-cell {
        display: block;
        width: 100%;
        min-width: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      [data-codex-root],
      [data-codex-root] *,
      [data-codex-root] *::before,
      [data-codex-root] *::after {
        scroll-behavior: auto;
        transition-duration: 0.01ms;
        animation-duration: 0.01ms;
        animation-iteration-count: 1;
      }
    }
  `;
}
