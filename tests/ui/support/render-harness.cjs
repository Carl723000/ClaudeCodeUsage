'use strict';

const Module = require('node:module');
const originalLoad = Module._load;

const vscodeHost = {
  ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 },
  ViewColumn: { One: 1 },
  Uri: { file: (fsPath) => ({ fsPath }) },
  env: { language: 'en', uriScheme: 'vscode' },
  commands: { executeCommand: async () => undefined },
  extensions: { getExtension: () => undefined },
  authentication: { getSession: async () => undefined },
  window: {
    activeColorTheme: { kind: 1 },
    createWebviewPanel: () => { throw new Error('UI harness does not create VS Code panels'); },
  },
  workspace: {
    workspaceFolders: undefined,
    getConfiguration: () => ({ get: () => undefined, update: async () => undefined }),
    fs: {},
  },
};

Module._load = function load(request, parent, isMain) {
  if (request === 'vscode') return vscodeHost;
  return originalLoad.call(this, request, parent, isMain);
};

const { UsageWebviewProvider } = require('../../../out/webview.js');
const { I18n } = require('../../../out/i18n.js');
const { SETTINGS } = require('../../../out/settings.js');
const { buildCodexUsageView } = require('../../../out/providers/codex/codexUsage.js');
const { buildScopedCodexInsights } = require('../../../out/providers/codex/codexInsights.js');
const {
  CODEX_WEBVIEW_NOW,
  codexWebviewFixture,
} = require('../../../out/test/codexWebviewFixtures.js');
const {
  rootedTaskBeyondRecentRowCapFixture,
  rootlessCrossProjectCycleFixture,
} = require('../../../out/test/codexFixtures.js');

Module._load = originalLoad;

// Resolve Light+/Dark+ overrides against VS Code's registered color defaults.
// Font variables use VS Code's macOS defaults. input.border is registered with
// a null theme value, so `initial` preserves the real webview fallback path.
const THEMES = {
  light: ':root{' +
    '--vscode-font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
    '--vscode-font-size:13px;' +
    '--vscode-editor-font-family:Menlo,Monaco,"Courier New",monospace;' +
    '--vscode-editor-background:#ffffff;' +
    '--vscode-editor-foreground:#000000;' +
    '--vscode-foreground:#616161;' +
    '--vscode-descriptionForeground:#717171;' +
    '--vscode-errorForeground:#A1260D;' +
    '--vscode-textLink-foreground:#006AB1;' +
    '--vscode-textCodeBlock-background:#dcdcdc66;' +
    '--vscode-textBlockQuote-background:#f2f2f2;' +
    '--vscode-textBlockQuote-border:#007acc80;' +
    '--vscode-panel-border:rgba(128,128,128,0.35);' +
    '--vscode-toolbar-hoverBackground:#b8b8b850;' +
    '--vscode-input-background:#ffffff;' +
    '--vscode-input-foreground:#616161;' +
    '--vscode-input-border:initial;' +
    '--vscode-inputValidation-warningBackground:#F6F5D2;' +
    '--vscode-inputValidation-warningBorder:#B89500;' +
    '--vscode-dropdown-background:#FFFFFF;' +
    '--vscode-dropdown-foreground:#616161;' +
    '--vscode-dropdown-border:#CECECE;' +
    '--vscode-button-background:#007ACC;' +
    '--vscode-button-foreground:#ffffff;' +
    '--vscode-button-hoverBackground:#0062A3;' +
    '--vscode-button-secondaryBackground:#E8E8E8;' +
    '--vscode-button-secondaryForeground:#616161;' +
    '--vscode-button-secondaryHoverBackground:#FFFFFF;' +
    '--vscode-badge-background:#C4C4C4;' +
    '--vscode-badge-foreground:#333333;' +
    '--vscode-focusBorder:#0090F1;' +
    '--vscode-list-hoverBackground:#E8E8E8;' +
    '--vscode-progressBar-background:#0E70C0;' +
    '--vscode-editorWidget-background:#F3F3F3;' +
    '--vscode-testing-iconPassed:#73c991;' +
    '--vscode-symbolIcon-functionForeground:#652D90;' +
    '--vscode-charts-foreground:#616161;' +
    '--vscode-charts-lines:rgba(97,97,97,0.5);' +
    '--vscode-charts-blue:#0063D3;' +
    '--vscode-charts-orange:#EA5C0055;' +
    '--vscode-charts-red:#E51400;' +
    '--vscode-charts-green:#388A34;' +
    '--vscode-charts-purple:#652D90;' +
    '--vscode-charts-yellow:#BF8803;' +
    '}*,*::before,*::after{animation:none!important;transition:none!important}',
  dark: ':root{' +
    '--vscode-font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
    '--vscode-font-size:13px;' +
    '--vscode-editor-font-family:Menlo,Monaco,"Courier New",monospace;' +
    '--vscode-editor-background:#1e1e1e;' +
    '--vscode-editor-foreground:#D4D4D4;' +
    '--vscode-foreground:#CCCCCC;' +
    '--vscode-descriptionForeground:rgba(204,204,204,0.7);' +
    '--vscode-errorForeground:#F48771;' +
    '--vscode-textLink-foreground:#3794FF;' +
    '--vscode-textCodeBlock-background:#0a0a0a66;' +
    '--vscode-textBlockQuote-background:#222222;' +
    '--vscode-textBlockQuote-border:#007acc80;' +
    '--vscode-panel-border:rgba(128,128,128,0.35);' +
    '--vscode-toolbar-hoverBackground:#5a5d5e50;' +
    '--vscode-input-background:#3C3C3C;' +
    '--vscode-input-foreground:#CCCCCC;' +
    '--vscode-input-border:initial;' +
    '--vscode-inputValidation-warningBackground:#352A05;' +
    '--vscode-inputValidation-warningBorder:#B89500;' +
    '--vscode-dropdown-background:#3C3C3C;' +
    '--vscode-dropdown-foreground:#F0F0F0;' +
    '--vscode-dropdown-border:#3C3C3C;' +
    '--vscode-button-background:#0e639c;' +
    '--vscode-button-foreground:#ffffff;' +
    '--vscode-button-hoverBackground:#1177BB;' +
    '--vscode-button-secondaryBackground:#2A2D2E;' +
    '--vscode-button-secondaryForeground:#CCCCCC;' +
    '--vscode-button-secondaryHoverBackground:#333637;' +
    '--vscode-badge-background:#4D4D4D;' +
    '--vscode-badge-foreground:#FFFFFF;' +
    '--vscode-focusBorder:#007FD4;' +
    '--vscode-list-hoverBackground:#2A2D2E;' +
    '--vscode-progressBar-background:#0E70C0;' +
    '--vscode-editorWidget-background:#252526;' +
    '--vscode-testing-iconPassed:#73c991;' +
    '--vscode-symbolIcon-functionForeground:#B180D7;' +
    '--vscode-charts-foreground:#CCCCCC;' +
    '--vscode-charts-lines:rgba(204,204,204,0.5);' +
    '--vscode-charts-blue:#59A4F9;' +
    '--vscode-charts-orange:#EA5C0055;' +
    '--vscode-charts-red:#F14C4C;' +
    '--vscode-charts-green:#89D185;' +
    '--vscode-charts-purple:#B180D7;' +
    '--vscode-charts-yellow:#CCA700;' +
    '}*,*::before,*::after{animation:none!important;transition:none!important}',
};

function settingsStore() {
  const values = new Map(SETTINGS.map((definition) => [definition.key, definition.default]));
  values.set('codex.optimization.enabled', true);
  values.set('dashboardAutoRefresh', false);
  return {
    get: (key) => values.get(key),
    snapshot: () => SETTINGS.map((definition) => ({
      ...definition,
      value: values.get(definition.key),
      isDefault: true,
    })),
  };
}

function claudeUsage(multiplier = 1) {
  const modelBreakdown = {
    'claude-sonnet-4-5-20250929': {
      inputTokens: 38200 * multiplier,
      outputTokens: 6100 * multiplier,
      cacheCreationTokens: 14800 * multiplier,
      cacheReadTokens: 236000 * multiplier,
      cost: 2.74 * multiplier,
      count: 18 * multiplier,
    },
    'claude-haiku-4-5-20251001': {
      inputTokens: 9400 * multiplier,
      outputTokens: 2200 * multiplier,
      cacheCreationTokens: 3100 * multiplier,
      cacheReadTokens: 52000 * multiplier,
      cost: 0.31 * multiplier,
      count: 7 * multiplier,
    },
  };
  return {
    totalInputTokens: 47600 * multiplier,
    totalOutputTokens: 8300 * multiplier,
    totalCacheCreationTokens: 17900 * multiplier,
    totalCacheReadTokens: 288000 * multiplier,
    totalCost: 3.05 * multiplier,
    costBreakdown: {
      input: 0.44 * multiplier,
      output: 1.52 * multiplier,
      cacheWrite: 0.82 * multiplier,
      cacheRead: 0.27 * multiplier,
    },
    messageCount: 25 * multiplier,
    modelBreakdown,
  };
}

function addClaudeData(provider) {
  const today = claudeUsage();
  const now = new Date(CODEX_WEBVIEW_NOW);
  provider.updateData(
    { ...today, sessionStart: new Date(now.getTime() - 3_600_000), sessionEnd: now },
    today,
    claudeUsage(6),
    claudeUsage(18),
    [],
    [],
    [
      { hour: '18:00', data: claudeUsage(0.35) },
      { hour: '19:00', data: claudeUsage(0.65) },
    ],
  );
}

exports.renderHarness = function renderHarness({ provider: selectedProvider = 'codex', locale = 'en', theme = 'light', fixture = 'default' } = {}) {
  I18n.setLanguage(locale);
  I18n.setTimezone('Asia/Hong_Kong');
  vscodeHost.window.activeColorTheme.kind = theme === 'dark' ? 2 : 1;
  const originalNow = Date.now;
  try {
    Date.now = () => CODEX_WEBVIEW_NOW;
    const snapshot = fixture === 'rootless-cycle'
      ? rootlessCrossProjectCycleFixture()
      : fixture === 'root-over-limit'
        ? rootedTaskBeyondRecentRowCapFixture()
        : codexWebviewFixture();
    const view = buildCodexUsageView(snapshot, CODEX_WEBVIEW_NOW);
    const provider = new UsageWebviewProvider({});
    const persistedDetailsFixture = fixture === 'persisted-details';
    provider.settings = settingsStore();
    addClaudeData(provider);
    provider.updateProviderData(
      view,
      buildScopedCodexInsights(view),
      { claude: true, codex: true },
    );
    provider.currentProvider = selectedProvider;

    const html = provider.getWebviewContent();
    const fixtureHtml = persistedDetailsFixture
      ? html.replace('<details class="model-item"', '<details class="model-item" data-persist="test-model"')
      : html;
    const bodyClass = theme === 'dark' ? 'vscode-dark ' : 'vscode-light ';
    return fixtureHtml
      .replace('</head>', `<style id="test-vscode-theme">${THEMES[theme]}</style></head>`)
      .replace('<body class="', `<body class="${bodyClass}`);
  } finally {
    Date.now = originalNow;
  }
};
