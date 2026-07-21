import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertSafeVsixEntries,
  assertCodexBundleMarkers,
} from './vsixPolicy.mjs';
import { assertPackagedManifest } from './verify-vsix.mjs';

const minimalEntries = [
  '[Content_Types].xml',
  'extension.vsixmanifest',
  'extension/package.json',
  'extension/out/extension.js',
  'extension/out/webview.js',
  'extension/out/codexView.js',
];

const validBundle = [
  'data-codex-page="overview"',
  'data-codex-page="explore"',
  'data-codex-page="recommendations"',
  'data-codex-action',
  'hostState.codexUi = nextState',
].join('\n');

test('VSIX policy accepts runtime files and normal publication assets', () => {
  assert.doesNotThrow(() => assertSafeVsixEntries([
    ...minimalEntries,
    'extension/README.md',
    'extension/CHANGELOG.md',
    'extension/LICENSE',
    'extension/icon.png',
    'extension/package.nls.json',
  ]));
});

test('VSIX policy rejects development, dependency, and secret material', () => {
  for (const entry of [
    'extension/src/webview.ts',
    'extension/out/test/codexView.test.js',
    'extension/tests/ui/codex-visual.spec.mjs',
    'extension/docs/private.md',
    'extension/.github/workflows/test.yml',
    'extension/.codex/private.json',
    'extension/AGENTS.md',
    'extension/node_modules/left-pad/index.js',
    'extension/node_modules/@playwright/test/index.js',
    'extension/.env.local',
    'extension/private.pem',
    'extension/private.key',
  ]) {
    assert.throws(
      () => assertSafeVsixEntries([...minimalEntries, entry]),
      /forbidden VSIX entry/,
      entry,
    );
  }
});

test('VSIX policy rejects internal Superpowers review material', () => {
  assert.throws(
    () => assertSafeVsixEntries([
      ...minimalEntries,
      'extension/.superpowers/sdd/review-a45ff9e..51ad1d0.diff',
    ]),
    /forbidden VSIX entry/,
  );
});

test('VSIX policy rejects unsafe or non-canonical archive paths', () => {
  for (const entry of [
    '/extension/out/extra.js',
    'C:\\extension\\out\\extra.js',
    '\\\\server\\share\\extra.js',
    'extension\\out\\extra.js',
    'extension/out/evil\0.js',
    'extension/./out/extra.js',
    'extension/out/../private.json',
    'extension/out/',
    '../extension/out/extra.js',
    'unexpected-root-file.txt',
    '_rels/.rels',
  ]) {
    assert.throws(
      () => assertSafeVsixEntries([...minimalEntries, entry]),
      /unsafe VSIX entry/,
      entry,
    );
  }
});

test('VSIX policy rejects malformed entry inventories', () => {
  assert.throws(() => assertSafeVsixEntries(null), /VSIX entries must be an array/);
  assert.throws(() => assertSafeVsixEntries([...minimalEntries, 42]), /unsafe VSIX entry/);
  assert.throws(() => assertSafeVsixEntries([...minimalEntries, '']), /unsafe VSIX entry/);
});

test('VSIX policy rejects duplicate archive entries', () => {
  assert.throws(
    () => assertSafeVsixEntries([...minimalEntries, 'extension/icon.png', 'extension/icon.png']),
    /duplicate VSIX entry: extension\/icon\.png/,
  );
});

test('VSIX policy requires the manifest and basic runtime bundles', () => {
  for (const required of [
    '[Content_Types].xml',
    'extension.vsixmanifest',
    'extension/package.json',
    'extension/out/extension.js',
    'extension/out/webview.js',
    'extension/out/codexView.js',
  ]) {
    assert.throws(
      () => assertSafeVsixEntries(minimalEntries.filter((entry) => entry !== required)),
      new RegExp(`missing required VSIX entry: ${required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
      required,
    );
  }
});

test('bundle policy requires current Codex product and host-state markers', () => {
  assert.doesNotThrow(() => assertCodexBundleMarkers(validBundle));
  for (const marker of [
    'data-codex-page="overview"',
    'data-codex-page="explore"',
    'data-codex-page="recommendations"',
    'data-codex-action',
    'hostState.codexUi = nextState',
  ]) {
    assert.throws(
      () => assertCodexBundleMarkers(validBundle.replace(marker, '')),
      /missing bundle marker/,
      marker,
    );
  }
});

test('bundle policy rejects retired flat tabs and legacy Codex storage', () => {
  for (const marker of [
    'ccu.codex.ui.v1',
    'data-codex-tab-button="recent"',
    'data-codex-tab-button="7d"',
    'data-codex-tab-button="30d"',
    'data-codex-tab-button="all"',
    'data-codex-tab-button="threads"',
    'data-codex-tab-button="projects"',
    'data-codex-tab-button="behavior"',
    'data-codex-tab-button="settings"',
  ]) {
    assert.throws(
      () => assertCodexBundleMarkers(`${validBundle}\n${marker}`),
      /retired bundle marker/,
      marker,
    );
  }
});

test('bundle policy rejects non-text input', () => {
  assert.throws(() => assertCodexBundleMarkers(null), /bundle must be text/);
});

test('packaged manifest policy returns its verified runtime main entry', () => {
  assert.equal(
    assertPackagedManifest(
      { version: '2.1.1', main: './out/extension.js' },
      '2.1.1',
      minimalEntries,
    ),
    'extension/out/extension.js',
  );
});

test('packaged manifest policy rejects version mismatches', () => {
  assert.throws(
    () => assertPackagedManifest(
      { version: '9.9.9', main: './out/extension.js' },
      '2.1.1',
      minimalEntries,
    ),
    /VSIX version mismatch: expected 2\.1\.1, got 9\.9\.9/,
  );
});

test('packaged manifest policy rejects unsafe or missing runtime mains', () => {
  for (const main of [
    '',
    '/out/extension.js',
    'C:\\out\\extension.js',
    '.\\out\\extension.js',
    './out/../private.js',
    './out//extension.js',
    './README.md',
    './out/missing.js',
  ]) {
    assert.throws(
      () => assertPackagedManifest({ version: '2.1.1', main }, '2.1.1', minimalEntries),
      /invalid VSIX main|missing VSIX main entry/,
      main,
    );
  }
});
