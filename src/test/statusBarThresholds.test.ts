// Wiring test for the fill thresholds. quotaFormat.test.ts pins the pairs
// themselves; this pins which indicator gets which, because the interesting
// failure is a correct pair handed to the wrong bar. statusBar.ts imports
// vscode, so the module is loaded against a stub (see extensionWindowActivity).

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { CONTEXT_FILL_THRESHOLDS, QUOTA_FILL_THRESHOLDS, fillLevel } from '../quotaFormat';

const GREEN = '#4caf50';
const AMBER = '#ff9800';
const RED = '#f44336';

type StatusBarModule = typeof import('../statusBar');

/** Records the id it was constructed with, so a background assertion can name
 * the theme colour rather than compare opaque stubs. */
class RecordingThemeColor {
  constructor(public readonly id: string) {}
}

class RecordingMarkdownString {
  value = '';
  supportThemeIcons = false;
  supportHtml = false;

  appendMarkdown(value: string): this {
    this.value += value;
    return this;
  }
}

function loadStatusBarModule(): StatusBarModule {
  const moduleLoader = require('node:module') as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = moduleLoader._load;
  const vscodeStub: any = new Proxy(function () {}, {
    get: (_target, property) => {
      if (property === 'then') {
        return undefined;
      }
      if (property === 'ThemeColor') {
        return RecordingThemeColor;
      }
      if (property === 'MarkdownString') {
        return RecordingMarkdownString;
      }
      return vscodeStub;
    },
    apply: () => vscodeStub,
    construct: () => vscodeStub,
  });
  moduleLoader._load = function (request, parent, isMain): unknown {
    if (request === 'vscode') {
      return vscodeStub;
    }
    return Reflect.apply(originalLoad, this, [request, parent, isMain]);
  };
  try {
    return require('../statusBar') as StatusBarModule;
  } finally {
    moduleLoader._load = originalLoad;
  }
}

const { StatusBarManager } = loadStatusBarModule();

/** The prototype alone — the real constructor builds live status-bar items. */
function bareStatusBar(): any {
  return Object.create(StatusBarManager.prototype) as any;
}

/** The fill colour the bar paints, read back off the rendered spans. The inner
 * span carries the fill; the outer track is always #bbbbbb. */
function barColor(pct: number, thresholds?: unknown): string {
  const html: string =
    thresholds === undefined
      ? bareStatusBar().progressBarSvg(pct)
      : bareStatusBar().progressBarSvg(pct, 24, thresholds);
  const fills = [GREEN, AMBER, RED].filter((c) => html.includes(c));
  assert.equal(fills.length, 1, `expected exactly one fill colour in ${html}`);
  return fills[0];
}

test('a quota bar defaults to the quota thresholds', () => {
  // The default matters: every quota row and the credits row rely on it.
  assert.equal(barColor(74), GREEN);
  assert.equal(barColor(75), AMBER);
  assert.equal(barColor(89), AMBER);
  assert.equal(barColor(90), RED);
});

test('the context bar is explicitly given the later thresholds', () => {
  assert.equal(barColor(79, CONTEXT_FILL_THRESHOLDS), GREEN);
  assert.equal(barColor(80, CONTEXT_FILL_THRESHOLDS), AMBER);
  assert.equal(barColor(94, CONTEXT_FILL_THRESHOLDS), AMBER);
  assert.equal(barColor(95, CONTEXT_FILL_THRESHOLDS), RED);
});

test('the two bars disagree in the bands the split created', () => {
  // 77% is the whole point of the change: quota warns, context stays quiet.
  assert.equal(barColor(77, QUOTA_FILL_THRESHOLDS), AMBER);
  assert.equal(barColor(77, CONTEXT_FILL_THRESHOLDS), GREEN);
  assert.equal(barColor(92, QUOTA_FILL_THRESHOLDS), RED);
  assert.equal(barColor(92, CONTEXT_FILL_THRESHOLDS), AMBER);
});

test('the track is drawn even when the fill is empty', () => {
  const html: string = bareStatusBar().progressBarSvg(0);
  assert.ok(html.includes('#bbbbbb'), 'the gray track must survive a 0% fill');
});

test('item background follows the same level as the bar', () => {
  const bg = (pct: number, thresholds: unknown): string | undefined =>
    bareStatusBar().fillBackground(fillLevel(pct, thresholds as any))?.id;

  assert.equal(bg(74, QUOTA_FILL_THRESHOLDS), undefined);
  assert.equal(bg(75, QUOTA_FILL_THRESHOLDS), 'statusBarItem.warningBackground');
  assert.equal(bg(90, QUOTA_FILL_THRESHOLDS), 'statusBarItem.errorBackground');
  // Context keeps 80 / 95, so at 77 the item stays uncoloured.
  assert.equal(bg(77, CONTEXT_FILL_THRESHOLDS), undefined);
  assert.equal(bg(80, CONTEXT_FILL_THRESHOLDS), 'statusBarItem.warningBackground');
  assert.equal(bg(95, CONTEXT_FILL_THRESHOLDS), 'statusBarItem.errorBackground');
});

test('Codex quota tooltip reuses the Claude table, progress bar, and line-broken notes', () => {
  const now = Date.parse('2026-09-02T12:00:00.000Z');
  const tooltip = bareStatusBar().createCodexQuotaTooltip({
    provider: 'codex',
    observedAt: now - 60_000,
    source: 'local-log',
    confidence: 'last-observed',
    windows: [{
      label: 'primary',
      usedPercent: 36,
      windowMinutes: 7 * 24 * 60,
      resetsAt: now + 5 * 24 * 60 * 60 * 1000,
    }],
  }, now) as RecordingMarkdownString;

  assert.match(tooltip.value, /<table>/);
  assert.match(tooltip.value, /Weekly/);
  assert.match(tooltip.value, /36%/);
  assert.match(tooltip.value, /#4caf50/);
  assert.doesNotMatch(tooltip.value, /Codex home · limits/);
  assert.equal(tooltip.supportHtml, true);
});

test('Codex item warns for the worst rendered window while keeping weekly compact text', () => {
  const item = (): any => ({
    text: '',
    tooltip: undefined,
    backgroundColor: undefined,
    visible: false,
    show(): void { this.visible = true; },
    hide(): void { this.visible = false; },
  });
  const manager = bareStatusBar();
  manager.statusBarItem = item();
  manager.quotaItem = item();
  manager.contextItem = item();
  manager.showCost = true;
  manager.showContext = true;
  manager.usageLimitTracking = true;
  manager.quotaFiveHourOnly = false;
  manager.resetCountdownFormat = 'decimal';

  const resetsAt = Date.now() + 24 * 60 * 60 * 1000;
  manager.renderCodex({
    total: {
      processed: 5_000_000,
      fresh: 1_000_000,
      input: 4_500_000,
      cachedInput: 3_500_000,
      output: 500_000,
      reasoning: 100_000,
    },
    rootTasks: 1,
    threads: 1,
    childThreads: 0,
    childProcessedShare: 0,
    childFreshShare: 0,
    approvalReviewerThreads: 0,
    approvalReviewerFreshShare: 0,
    cacheShare: 0.7,
    durationMs: 1_000,
    structural: {
      patchCalls: 0,
      toolCalls: 0,
      postPatchToolCalls: 0,
      compactCount: 0,
      taskCompleteCount: 0,
    },
    models: [],
    efforts: [],
  }, 'fresh', {
    provider: 'codex',
    observedAt: Date.now() - 60_000,
    source: 'local-log',
    confidence: 'last-observed',
    windows: [
      { label: 'primary', usedPercent: 96, windowMinutes: 300, resetsAt },
      { label: 'secondary', usedPercent: 40, windowMinutes: 10_080, resetsAt },
    ],
  });

  assert.equal(manager.quotaItem.text, '$(dashboard) wk 60%');
  assert.equal(manager.quotaItem.backgroundColor?.id, 'statusBarItem.errorBackground');
  assert.match(manager.quotaItem.tooltip.value, /96%/);
  assert.match(manager.quotaItem.tooltip.value, /#f44336/);
});

test('Codex quota tooltip escapes provider labels', () => {
  const now = Date.parse('2026-09-02T12:00:00.000Z');
  const manager = bareStatusBar();
  manager.quotaFiveHourOnly = false;
  manager.resetCountdownFormat = 'decimal';
  const tooltip = manager.createCodexQuotaTooltip({
    provider: 'codex',
    observedAt: now,
    source: 'local-log',
    confidence: 'last-observed',
    windows: [{
      label: '<unsafe & label>',
      usedPercent: 12,
      resetsAt: now + 60_000,
    }],
  }, now) as RecordingMarkdownString;

  assert.match(tooltip.value, /&lt;unsafe &amp; label&gt;/);
  assert.doesNotMatch(tooltip.value, /<unsafe/);
});
