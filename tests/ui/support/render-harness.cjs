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

Module._load = originalLoad;

const THEMES = {
  light: ':root{' +
    '--vscode-font-family:Arial,sans-serif;' +
    '--vscode-editor-font-family:Menlo,monospace;' +
    '--vscode-editor-background:#ffffff;' +
    '--vscode-editor-foreground:#24292f;' +
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

exports.renderHarness = function renderHarness({ locale = 'en', theme = 'light' } = {}) {
  I18n.setLanguage(locale);
  I18n.setTimezone('Asia/Hong_Kong');
  vscodeHost.window.activeColorTheme.kind = theme === 'dark' ? 2 : 1;
  const originalNow = Date.now;
  try {
    Date.now = () => CODEX_WEBVIEW_NOW;
    const view = buildCodexUsageView(codexWebviewFixture(), CODEX_WEBVIEW_NOW);
    const provider = new UsageWebviewProvider({});
    provider.settings = settingsStore();
    provider.updateProviderData(
      view,
      buildScopedCodexInsights(view),
      { claude: true, codex: true },
    );
    provider.currentProvider = 'codex';

    const html = provider.getAlternateProviderContent();
    const bodyClass = theme === 'dark' ? 'vscode-dark ' : 'vscode-light ';
    return html
      .replace('</head>', `<style id="test-vscode-theme">${THEMES[theme]}</style></head>`)
      .replace('<body class="', `<body class="${bodyClass}`);
  } finally {
    Date.now = originalNow;
  }
};
