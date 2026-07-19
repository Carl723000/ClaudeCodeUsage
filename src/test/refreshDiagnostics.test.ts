import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  formatCodexIndexDiagnostic,
  formatRefreshDiagnostic,
} from '../refreshDiagnostics';

test('refresh diagnostics contain only stage names and anonymous numeric counters', () => {
  const line = formatRefreshDiagnostic({
    trigger: 'watch',
    filesDiscovered: 389,
    filesChanged: 1,
    filesReused: 388,
    filesRemoved: 0,
    filesFailed: 0,
    bytesRead: 4096,
    linesParsed: 17,
    watcherEvents: 42,
    coalescedTriggers: 3,
    manifestMs: 12.34,
    readParseMs: 45.67,
    aggregateRenderMs: 8.9,
    totalMs: 67.01,
  });
  assert.equal(
    line,
    'refresh: trigger=watch files(discovered=389 changed=1 reused=388 removed=0 failed=0) ' +
      'io(bytes=4096 lines=17) events(watcher=42 coalesced=3) ' +
      'ms(manifest=12.3 read-parse=45.7 aggregate-render=8.9 total=67.0)'
  );
  assert.equal(/[/\\]|secret|session|prompt|credential|\.jsonl/i.test(line), false);
});

test('Codex diagnostics expose only anonymous counts, timing, and safe flags', () => {
  const line = formatCodexIndexDiagnostic({
    outcome: 'partial',
    indexedFiles: 4,
    totalFiles: 5,
    indexedBytes: 1300,
    totalBytes: 1500,
    bodyReads: 1,
    failedFiles: 1,
    metadataMs: 12.34,
    parseMs: 45.67,
    qualityFlags: {
      'unknown-event': 2,
      '/Users/carl/private-session.jsonl': 1,
    },
  });

  assert.equal(
    line,
    'codex-index outcome=partial files=4/5 bytes=1300/1500 bodyReads=1 failed=1 ' +
      'metadataMs=12.3 parseMs=45.7 flags=unknown:1,unknown-event:2',
  );
  assert.equal(
    /Users|carl|private-session|\.jsonl|prompt|command|credential/i.test(line),
    false,
  );
});
