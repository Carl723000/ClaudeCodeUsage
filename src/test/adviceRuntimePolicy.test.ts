import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const root = path.resolve(__dirname, '..', '..');

test('extension advice and optimizer runtime stay API/BYOK-only', () => {
  const source = readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
  const types = readFileSync(path.join(root, 'src', 'types.ts'), 'utf8');
  assert.match(source, /adviceBackend:\s*'api'/);
  assert.doesNotMatch(source, /getSubscriptionToken\s*:/);
  assert.doesNotMatch(source, /subscriptionModel\s*:/);
  assert.match(types, /adviceBackend:\s*'api'/);
  assert.doesNotMatch(types, /adviceSubscriptionModel/);

  // Advice and optimizer now share the prepared-request hooks installed during
  // activation. Keep the production credential/endpoint assertions attached to
  // those hooks instead of the legacy command-method boundaries.
  const hooksStart = source.indexOf('this.webviewProvider.onSendOptimizerInvocation');
  const hooksEnd = source.indexOf('this.webviewProvider.settings = this.settings', hooksStart);
  assert.ok(hooksStart >= 0 && hooksEnd > hooksStart);
  const runtimeHooks = source.slice(hooksStart, hooksEnd);
  assert.match(runtimeHooks, /apiKey:\s*config\.adviceApiKey/);
  assert.match(runtimeHooks, /apiUrl:\s*config\.adviceApiUrl/);
  assert.match(runtimeHooks, /requestPreparedOptimizer\s*\(/);
  assert.match(runtimeHooks, /requestStructuredAdvice\s*\(/);
  assert.doesNotMatch(runtimeHooks, /getAccessToken\s*\(/);
});

test('optimizer preview does not create a second persisted authorization path', () => {
  const source = readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
  const start = source.indexOf('private async prepareOptimizerRequest');
  const end = source.indexOf('private loadConfiguration', start);
  assert.ok(start >= 0 && end > start);
  const preparation = source.slice(start, end);
  assert.doesNotMatch(preparation, /optimizerConsented/);
  assert.doesNotMatch(preparation, /showWarningMessage/);
  assert.doesNotMatch(preparation, /globalState\.update/);
});

test('packaged advisor exposes no prepare-and-send shortcut around exact preview', () => {
  const source = readFileSync(path.join(root, 'src', 'advisor.ts'), 'utf8');
  assert.doesNotMatch(source, /export\s+async\s+function\s+callModel\b/);
  assert.doesNotMatch(source, /export\s+async\s+function\s+getUsageAdvice\b/);
  assert.doesNotMatch(source, /getSubscriptionToken|subscriptionModel/);
  assert.match(source, /export\s+async\s+function\s+sendPreparedModelRequest\b/);
});

test('only the reviewed comparison writer reaches the bounded local ledger', () => {
  const extension = readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
  const webview = readFileSync(path.join(root, 'src', 'webview.ts'), 'utf8');
  const production = [extension, webview].join('\n');

  for (const seam of [
    'planAdviceEvidencePreparation',
    'buildLegacyPersonalizationDraft',
    'projectLegacyPersonalization',
    'requestStructuredAdviceViaLegacyByok',
  ]) {
    assert.doesNotMatch(production, new RegExp(`\\b${seam}\\b`));
  }

  assert.doesNotMatch(extension, /\bappendStoredComparablePair\b/);
  const materializerStart = webview.indexOf('private materializeAdviceComparisonState');
  const materializerEnd = webview.indexOf(
    'private currentAdviceComparisonProductionRevision',
    materializerStart,
  );
  assert.ok(materializerStart >= 0 && materializerEnd > materializerStart);
  const materializer = webview.slice(materializerStart, materializerEnd);
  assert.match(materializer, /\bbuildAppliedComparablePairs\b/);
  assert.match(materializer, /\bappendStoredComparablePair\b/);
  assert.match(materializer, /\bbuildAdviceComparisonResultEnvelope\b/);
  assert.match(materializer, /\bappendAdviceComparisonResult\b/);
});

test('Claude advice consumes the materialized index snapshot instead of rebuilding from records', () => {
  const source = readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
  const start = source.indexOf('private buildAdviceEffectivenessProviderStates');
  const end = source.indexOf('private codexHistoricalWorkPending', start);
  assert.ok(start >= 0 && end > start);
  const builder = source.slice(start, end);
  assert.match(builder, /claudeUsageDashboardSnapshot\s*\(/);
  assert.match(builder, /adviceWindowDays:\s*windowDays/);
  assert.doesNotMatch(builder, /this\.cache\.records/);
  assert.doesNotMatch(builder, /ClaudeDataLoader\.(?:getAllTimeData|getSessionBreakdown)/);
});
