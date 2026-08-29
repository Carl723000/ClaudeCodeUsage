import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';

const root = path.resolve(__dirname, '..', '..');

test('production host registers timer, watcher, worker, network, and backfill ownership', () => {
  const source = readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
  for (const kind of ['timer', 'watcher', 'worker', 'network', 'backfill']) {
    assert.match(source, new RegExp(`kind:\\s*'${kind}'`));
  }
  for (const actualStop of [
    'clearTimeout(timer)',
    'watcher.close()',
    'controller.abort()',
    'this.codexProvider.cancel()',
    'this.codexProvider.dispose()',
  ]) {
    assert.ok(source.includes(actualStop), `missing actual stop: ${actualStop}`);
  }
  assert.match(source, /onAiSurfaceClosed\s*=.*cancelAdviceNetworks/s);
  assert.match(source, /scheduleFirstBackfillBlurDeadline/);
  assert.match(source, /CODEX_FIRST_BACKFILL_BLUR_DEADLINE_MS/);
  assert.match(source, /stopFirstBackfillBlurDeadline\('extension-dispose'\)/);
});

test('background eligibility is persisted and controls historical work only', () => {
  const extension = readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
  const protocol = readFileSync(
    path.join(root, 'src', 'providers', 'codex', 'codexWorkerProtocol.ts'),
    'utf8',
  );
  const index = readFileSync(
    path.join(root, 'src', 'providers', 'codex', 'codexIndex.ts'),
    'utf8',
  );
  assert.match(extension, /ccu\.codex\.backgroundWork\.v1/);
  assert.match(extension, /beginBackgroundWork/);
  assert.match(extension, /recordBackgroundWorkProgress/);
  assert.match(extension, /recordBackgroundWorkFailure/);
  assert.match(extension, /historicalAttempt/);
  assert.match(protocol, /allowHistoricalBackfill\?: boolean/);
  assert.match(index, /allowHistoricalBackfill \? manifest\.files : \[\]/);
  assert.match(index, /indexGeneration/);
  assert.match(extension, /codexIndexGeneration/);
});

test('Codex worker is terminal after every result instead of remaining idle', () => {
  const source = readFileSync(
    path.join(root, 'src', 'providers', 'codex', 'codexIndexClient.ts'),
    'utf8',
  );
  assert.match(source, /terminateSettledWorker/);
  assert.match(source, /Promise\.resolve\(worker\.terminate\(\)\)/);
  assert.match(source, /await termination/);
  assert.match(source, /terminateSettledWorker\(\)[\s\S]*active\.resolve/);
});
