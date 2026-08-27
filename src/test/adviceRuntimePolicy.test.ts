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

  const getAdviceStart = source.indexOf('private async getAdvice()');
  const optimizerEnd = source.indexOf('private loadConfiguration()', getAdviceStart);
  assert.ok(getAdviceStart >= 0 && optimizerEnd > getAdviceStart);
  const runtimeAdvice = source.slice(getAdviceStart, optimizerEnd);
  assert.match(runtimeAdvice, /apiKey:\s*config\.adviceApiKey/);
  assert.match(runtimeAdvice, /apiUrl:\s*config\.adviceApiUrl/);
  assert.doesNotMatch(runtimeAdvice, /getAccessToken\s*\(/);
});

test('future advice seams remain unreachable from production host and webview code', () => {
  const production = [
    readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8'),
    readFileSync(path.join(root, 'src', 'webview.ts'), 'utf8'),
  ].join('\n');

  for (const seam of [
    'planAdviceEvidencePreparation',
    'buildLegacyPersonalizationDraft',
    'projectLegacyPersonalization',
    'requestStructuredAdviceViaLegacyByok',
    'appendStoredComparablePair',
  ]) {
    assert.doesNotMatch(production, new RegExp(`\\b${seam}\\b`));
  }
});
