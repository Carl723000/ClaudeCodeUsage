import { CodexInsight, CodexScopedInsights } from './providers/codex/codexInsights';
import { CodexUsageView } from './providers/codex/codexUsage';
import {
  CODEX_COPY_EN,
  CodexRenderOptions,
  CodexViewCopy,
  createCodexRenderContext,
  renderCodexExplore,
  renderCodexHeader,
  renderCodexOverview,
  renderCodexPrimaryNav,
  renderCodexRecommendations,
  renderCodexSettings,
} from './codexViewComponents';

export { CodexScopedInsights } from './providers/codex/codexInsights';

export {
  CODEX_COPY_EN,
  CodexRenderContext,
  CodexRenderFormatters,
  CodexRenderOptions,
  CodexViewCopy,
  ProviderCompareInput,
  ProviderCompareRenderOptions,
  defaultDashboardProvider,
  getCodexDocumentIdentity,
  renderCodexExplore,
  renderCodexHeader,
  renderCodexOverview,
  renderCodexPrimaryNav,
  renderCodexRecommendations,
  renderCodexSettings,
  renderProviderCompare,
} from './codexViewComponents';

export function renderCodexView(
  view: CodexUsageView,
  insights: CodexScopedInsights,
  copy?: CodexViewCopy,
  options?: CodexRenderOptions,
): string;

/** @deprecated Pass scope-specific insight arrays instead. */
export function renderCodexView(
  view: CodexUsageView,
  insights: CodexInsight[],
  copy?: CodexViewCopy,
  options?: CodexRenderOptions,
): string;

export function renderCodexView(
  view: CodexUsageView,
  insights: CodexScopedInsights | CodexInsight[],
  copy: CodexViewCopy = CODEX_COPY_EN,
  options: CodexRenderOptions = {},
): string {
  const scopedInsights: CodexScopedInsights = Array.isArray(insights)
    ? {
        recent: insights,
        last7Days: [],
        last30Days: [],
        allTime: [],
      }
    : insights;
  const ctx = createCodexRenderContext(view, scopedInsights, copy, options);
  return `<section class="codex-view" data-provider="codex" data-codex-root>
    ${renderCodexHeader(copy)}
    ${renderCodexPrimaryNav(copy, ctx.optimizationEnabled)}
    <section class="codex-page active" id="codex-page-panel-overview" role="tabpanel" data-codex-page="overview" aria-labelledby="codex-page-tab-overview">${renderCodexOverview(ctx)}</section>
    <section class="codex-page" id="codex-page-panel-explore" role="tabpanel" data-codex-page="explore" aria-labelledby="codex-page-tab-explore" hidden>${renderCodexExplore(ctx)}</section>
    <section class="codex-page" id="codex-page-panel-recommendations" role="tabpanel" data-codex-page="recommendations" aria-labelledby="codex-page-tab-recommendations" hidden>${renderCodexRecommendations(ctx)}</section>
    <section class="codex-page codex-settings-page" id="codex-page-panel-settings" role="tabpanel" data-codex-page="settings" aria-labelledby="codex-open-settings" hidden>${renderCodexSettings(ctx)}</section>
  </section>`;
}
