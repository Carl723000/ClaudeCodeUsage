import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  CODEX_COPY_EN,
  renderCodexView,
  renderProviderCompare,
} from '../codexView';
import { buildCodexInsights } from '../providers/codex/codexInsights';
import { buildCodexUsageView } from '../providers/codex/codexUsage';
import { snapshotFixture } from './codexFixtures';

const NOW = Date.parse('2026-07-20T12:00:00.000Z');

test('Codex renderer labels provider semantics and never renders subscription cost', () => {
  const view = buildCodexUsageView(snapshotFixture(), NOW);
  const html = renderCodexView(
    view,
    buildCodexInsights(view.lastTask!),
    CODEX_COPY_EN,
  );

  assert.match(html, /Processed tokens/);
  assert.match(html, /Fresh input \+ output/);
  assert.match(html, /Last observed/);
  assert.match(html, /Coverage/);
  assert.doesNotMatch(html, /\$|subscription cost|raw-session|\/Users\//);
});

test('Compare is side-by-side and contains no summed total, cost, or quota', () => {
  const html = renderProviderCompare(
    {
      claude: { label: 'Claude', input: 100, output: 20, cache: 300 },
      codex: { label: 'Codex', input: 500, output: 100, cache: 400 },
    },
    CODEX_COPY_EN,
  );

  assert.match(html, /Claude/);
  assert.match(html, /Codex/);
  assert.match(html, /provider-compare-grid/);
  assert.doesNotMatch(html, /combined|quota|\$/i);
});

test('all dynamic renderer values are escaped', () => {
  const snapshot = snapshotFixture();
  snapshot.files[0].byModel = {
    '<img src=x onerror=alert(1)>': snapshot.files[0].total,
  };
  const view = buildCodexUsageView(snapshot, NOW);
  const html = renderCodexView(view, [], CODEX_COPY_EN);

  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /https?:\/\//);
});
