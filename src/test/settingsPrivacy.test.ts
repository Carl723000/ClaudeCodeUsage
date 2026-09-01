import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

type SettingsModule = typeof import('../settings');

interface FakeConfiguration {
  values: {
    global?: unknown;
    workspace?: unknown;
    folder?: unknown;
  };
  updates: Array<{ key: string; value: unknown; target: number }>;
  get<T>(key: string, fallback: T): T;
  inspect<T>(key: string): {
    globalValue?: T;
    workspaceValue?: T;
    workspaceFolderValue?: T;
  };
  update(key: string, value: unknown, target: number): Promise<void>;
}

function fakeConfiguration(initial: FakeConfiguration['values'] = {}): FakeConfiguration {
  const config: FakeConfiguration = {
    values: { ...initial },
    updates: [],
    get<T>(_key: string, fallback: T): T {
      return (config.values.folder ?? config.values.workspace ?? config.values.global ?? fallback) as T;
    },
    inspect<T>(_key: string) {
      return {
        globalValue: config.values.global as T | undefined,
        workspaceValue: config.values.workspace as T | undefined,
        workspaceFolderValue: config.values.folder as T | undefined,
      };
    },
    async update(key: string, value: unknown, target: number): Promise<void> {
      config.updates.push({ key, value, target });
      const slot = target === 3 ? 'folder' : target === 2 ? 'workspace' : 'global';
      config.values[slot] = value;
    },
  };
  return config;
}

let activeConfiguration = fakeConfiguration();
let activeWorkspaceFolders: Array<{ uri: string }> = [];
let activeFolderConfigurations = new Map<string, FakeConfiguration>();

function loadSettingsModule(): SettingsModule {
  const moduleLoader = require('node:module') as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = moduleLoader._load;
  moduleLoader._load = function (request, parent, isMain): unknown {
    if (request === 'vscode') {
      return {
        ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
        workspace: {
          get workspaceFolders() { return activeWorkspaceFolders; },
          getConfiguration: (_section: string, resource?: string) =>
            resource ? activeFolderConfigurations.get(resource) ?? activeConfiguration : activeConfiguration,
        },
      };
    }
    return Reflect.apply(originalLoad, this, [request, parent, isMain]);
  };
  try {
    return require('../settings') as SettingsModule;
  } finally {
    moduleLoader._load = originalLoad;
  }
}

const { SettingsStore } = loadSettingsModule();

function fakeContext(options: {
  state?: Map<string, unknown>;
  secrets?: Map<string, string>;
  failSecretStore?: boolean;
} = {}): any {
  const state = options.state ?? new Map<string, unknown>();
  const secrets = options.secrets ?? new Map<string, string>();
  const secretStores: Array<{ key: string; value: string }> = [];
  const secretDeletes: string[] = [];
  return {
    globalState: {
      get: <T>(key: string, fallback?: T): T | undefined =>
        (state.has(key) ? state.get(key) : fallback) as T | undefined,
      update: async (key: string, value: unknown): Promise<void> => {
        if (value === undefined) state.delete(key);
        else state.set(key, value);
      },
    },
    secrets: {
      get: async (key: string): Promise<string | undefined> => secrets.get(key),
      store: async (key: string, value: string): Promise<void> => {
        if (options.failSecretStore) throw new Error('synthetic secret-store failure');
        secretStores.push({ key, value });
        secrets.set(key, value);
      },
      delete: async (key: string): Promise<void> => {
        secretDeletes.push(key);
        secrets.delete(key);
      },
    },
    _state: state,
    _secrets: secrets,
    _secretStores: secretStores,
    _secretDeletes: secretDeletes,
  };
}

test('legacy plaintext BYOK migrates to SecretStorage and never enters a settings snapshot', async () => {
  const canary = 'sk-v2.3.1-privacy-canary';
  activeConfiguration = fakeConfiguration({ global: canary, workspace: canary });
  const folderConfiguration = fakeConfiguration({ folder: canary });
  activeWorkspaceFolders = [{ uri: 'folder-a' }];
  activeFolderConfigurations = new Map([['folder-a', folderConfiguration]]);
  const context = fakeContext({
    state: new Map([['ccu.setting.advice.apiKey', canary]]),
  });
  const store = new SettingsStore(context);

  await store.initializeSecrets();

  assert.equal(context._secrets.get('claudeCodeUsage.secret.advice.apiKey'), canary);
  assert.equal(context._state.has('ccu.setting.advice.apiKey'), false);
  assert.deepEqual(activeConfiguration.values, {
    global: undefined,
    workspace: undefined,
  });
  assert.equal(folderConfiguration.values.folder, undefined);
  assert.equal(store.get('advice.apiKey'), canary, 'the extension host can still use the key');
  const apiKeyView = store.snapshot().find((entry) => entry.key === 'advice.apiKey');
  assert.equal(apiKeyView?.configured, true);
  assert.equal(apiKeyView?.value, '');
  assert.doesNotMatch(JSON.stringify(store.snapshot()), /v2\.3\.1-privacy-canary/);
});

test('conflicting machine and workspace secrets fail closed without deleting plaintext', async () => {
  activeConfiguration = fakeConfiguration({
    global: 'sk-global-canary',
    workspace: 'sk-workspace-canary',
  });
  activeWorkspaceFolders = [];
  activeFolderConfigurations = new Map();
  const context = fakeContext();
  const store = new SettingsStore(context);

  await assert.rejects(
    () => store.initializeSecrets(),
    /settings-secret-migration:legacy-secret-conflict/,
  );

  assert.equal(context._secrets.size, 0);
  assert.equal(activeConfiguration.values.global, 'sk-global-canary');
  assert.equal(activeConfiguration.values.workspace, 'sk-workspace-canary');
  assert.equal(activeConfiguration.updates.length, 0);
});

test('workspace-only secrets require explicit migration and every open folder is inspected', async () => {
  activeConfiguration = fakeConfiguration();
  const first = fakeConfiguration({ folder: 'sk-folder-one' });
  const second = fakeConfiguration({ folder: 'sk-folder-two' });
  activeWorkspaceFolders = [{ uri: 'folder-a' }, { uri: 'folder-b' }];
  activeFolderConfigurations = new Map([
    ['folder-a', first],
    ['folder-b', second],
  ]);
  const context = fakeContext();
  const store = new SettingsStore(context);

  await assert.rejects(
    () => store.initializeSecrets(),
    /settings-secret-migration:workspace-secret-requires-manual-migration/,
  );
  assert.equal(first.values.folder, 'sk-folder-one');
  assert.equal(second.values.folder, 'sk-folder-two');
  assert.equal(context._secrets.size, 0);
});

test('failed SecretStorage migration leaves legacy plaintext in place for recovery', async () => {
  const canary = 'sk-recovery-canary';
  activeConfiguration = fakeConfiguration({ global: canary });
  activeWorkspaceFolders = [];
  activeFolderConfigurations = new Map();
  const context = fakeContext({
    state: new Map([['ccu.setting.advice.apiKey', canary]]),
    failSecretStore: true,
  });
  const store = new SettingsStore(context);

  await assert.rejects(
    () => store.initializeSecrets(),
    (error: unknown) => {
      assert.match(String(error), /settings-secret-migration:secret-storage-failed/);
      assert.doesNotMatch(String(error), /recovery-canary|synthetic secret-store failure/);
      return true;
    },
  );
  assert.equal(context._state.get('ccu.setting.advice.apiKey'), canary);
  assert.equal(activeConfiguration.values.global, canary);
});

test('BYOK set and reset use only SecretStorage', async () => {
  activeConfiguration = fakeConfiguration();
  activeWorkspaceFolders = [];
  activeFolderConfigurations = new Map();
  const context = fakeContext();
  const store = new SettingsStore(context);

  await store.set('advice.apiKey', '  sk-runtime-canary  ');
  assert.equal(store.get('advice.apiKey'), 'sk-runtime-canary');
  assert.equal(context._secrets.get('claudeCodeUsage.secret.advice.apiKey'), 'sk-runtime-canary');
  assert.equal(context._state.size, 0);
  assert.equal(activeConfiguration.updates.length, 0);

  await store.reset('advice.apiKey');
  assert.equal(store.get('advice.apiKey'), '');
  assert.equal(context._secrets.size, 0);
});

test('repeat activation is idempotent and secret metadata is independent of key length', async () => {
  activeConfiguration = fakeConfiguration();
  activeWorkspaceFolders = [];
  activeFolderConfigurations = new Map();
  const context = fakeContext({
    secrets: new Map([['claudeCodeUsage.secret.advice.apiKey', 'sk-short']]),
  });
  const store = new SettingsStore(context);

  await store.initializeSecrets();
  const shortView = store.snapshot().find((entry) => entry.key === 'advice.apiKey');
  await store.initializeSecrets();
  await store.set('advice.apiKey', 'sk-a-much-longer-secret-value');
  const longView = store.snapshot().find((entry) => entry.key === 'advice.apiKey');

  assert.deepEqual(shortView, longView);
  assert.deepEqual(shortView && { value: shortView.value, configured: shortView.configured }, {
    value: '',
    configured: true,
  });
  assert.equal(context._secretStores.length, 1, 'only the explicit user edit writes SecretStorage');
  assert.equal(activeConfiguration.updates.length, 0);
});

test('the extension manifest no longer contributes a plaintext API-key setting', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'),
  ) as any;
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      manifest.contributes.configuration.properties,
      'claudeCodeUsage.advice.apiKey',
    ),
    false,
  );
});

test('activation reports a fixed localized migration failure without echoing provider errors', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'extension.ts'), 'utf8');
  assert.match(source, /showErrorMessage\([\s\S]*secretMigrationWorkspace[\s\S]*secretMigrationFailed/);
  assert.doesNotMatch(source, /secretMigrationFailed[^;]*\.message/);
});

test('the tracked bilingual data contract covers quota, retention, clearing, and remote boundaries', () => {
  const root = path.join(__dirname, '..', '..');
  const documents = [
    'docs/superpowers/specs/2026-09-02-v2.3.1-local-data-contract.md',
    'docs/superpowers/specs/2026-09-02-v2.3.1-local-data-contract.zh-CN.md',
  ].map((relative) => fs.readFileSync(path.join(root, relative), 'utf8'));

  for (const document of documents) {
    for (const required of [
      'schemaVersion',
      'provider',
      'accountFingerprint',
      'observedAt',
      'periodType',
      'usedFraction',
      'remainingFraction',
      'resetAt',
      'source',
      'windowId',
      'confidence',
      'SecretStorage',
      '180',
      '512',
      'ccu.heatmapRepo',
      'ccu.heatmapPath',
      'Codex processed',
    ]) {
      assert.match(document, new RegExp(required.replace('.', '\\.')));
    }
    assert.match(document, /OAuth token/i);
    assert.match(document, /cookie/i);
    assert.match(document, /API key/i);
    assert.match(document, /clear|清除/i);
    assert.match(document, /remote|network|远程|网络/i);
  }
});
