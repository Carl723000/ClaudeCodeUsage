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

const THEMES = {
  light: ':root{' +
    '--vscode-font-family:Arial,sans-serif;' +
    '--vscode-editor-font-family:Menlo,monospace;' +
    '--vscode-editor-background:#ffffff;' +
    '--vscode-editor-foreground:#24292f;' +
    '--vscode-foreground:#24292f;' +
    '--vscode-descriptionForeground:#57606a;' +
    '--vscode-panel-border:#d0d7de;' +
    '--vscode-input-background:#ffffff;' +
    '--vscode-input-foreground:#24292f;' +
    '--vscode-input-border:#8c959f;' +
    '--vscode-button-background:#0969da;' +
    '--vscode-button-foreground:#ffffff;' +
    '--vscode-focusBorder:#0969da;' +
    '--vscode-charts-blue:#0969da;' +
    '--vscode-charts-orange:#9a6700;' +
    '--vscode-charts-red:#cf222e;' +
    '--vscode-charts-green:#1a7f37;' +
    '}*,*::before,*::after{animation:none!important;transition:none!important}',
  dark: ':root{' +
    '--vscode-font-family:Arial,sans-serif;' +
    '--vscode-editor-font-family:Menlo,monospace;' +
    '--vscode-editor-background:#1e1e1e;' +
    '--vscode-editor-foreground:#f2f2f2;' +
    '--vscode-foreground:#f2f2f2;' +
    '--vscode-descriptionForeground:#c4c4c4;' +
    '--vscode-panel-border:#555555;' +
    '--vscode-input-background:#2b2b2b;' +
    '--vscode-input-foreground:#ffffff;' +
    '--vscode-input-border:#777777;' +
    '--vscode-button-background:#0e639c;' +
    '--vscode-button-foreground:#ffffff;' +
    '--vscode-focusBorder:#75beff;' +
    '--vscode-charts-blue:#4daafc;' +
    '--vscode-charts-orange:#d18616;' +
    '--vscode-charts-red:#f14c4c;' +
    '--vscode-charts-green:#89d185;' +
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
    provider.settings = settingsStore();
    addClaudeData(provider);
    provider.updateProviderData(
      view,
      buildScopedCodexInsights(view),
      { claude: true, codex: true },
    );
    provider.currentProvider = selectedProvider;

    const html = provider.getWebviewContent();
    const bodyClass = theme === 'dark' ? 'vscode-dark ' : 'vscode-light ';
    return html
      .replace('</head>', `<style id="test-vscode-theme">${THEMES[theme]}</style></head>`)
      .replace('<body class="', `<body class="${bodyClass}`);
  } finally {
    Date.now = originalNow;
  }
};
