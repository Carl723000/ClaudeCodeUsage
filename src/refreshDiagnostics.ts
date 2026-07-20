import { RefreshTrigger } from './refreshPolicy';
import { ProviderSourceOutcome } from './providers/providerTypes';

export interface LoadUsageDiagnostics {
  filesDiscovered: number;
  filesFailed: number;
  bytesRead: number;
  linesParsed: number;
  readParseMs: number;
}

export interface RefreshDiagnostic extends LoadUsageDiagnostics {
  trigger: RefreshTrigger;
  filesChanged: number;
  filesReused: number;
  filesRemoved: number;
  watcherEvents: number;
  coalescedTriggers: number;
  manifestMs: number;
  aggregateRenderMs: number;
  totalMs: number;
}

const ms = (value: number): string => value.toFixed(1);

export function formatRefreshDiagnostic(value: RefreshDiagnostic): string {
  return `refresh: trigger=${value.trigger} ` +
    `files(discovered=${value.filesDiscovered} changed=${value.filesChanged} ` +
    `reused=${value.filesReused} removed=${value.filesRemoved} failed=${value.filesFailed}) ` +
    `io(bytes=${value.bytesRead} lines=${value.linesParsed}) ` +
    `events(watcher=${value.watcherEvents} coalesced=${value.coalescedTriggers}) ` +
    `ms(manifest=${ms(value.manifestMs)} read-parse=${ms(value.readParseMs)} ` +
    `aggregate-render=${ms(value.aggregateRenderMs)} total=${ms(value.totalMs)})`;
}

export interface CodexIndexDiagnostic {
  outcome: ProviderSourceOutcome;
  indexedFiles: number;
  totalFiles: number;
  indexedBytes: number;
  totalBytes: number;
  periodMigratedBytes: number;
  periodTotalBytes: number;
  migrationPending: boolean;
  bodyReads: number;
  failedFiles: number;
  metadataMs: number;
  parseMs: number;
  qualityFlags: Record<string, number>;
}

function safeFlagCounts(flags: Record<string, number>): string {
  const safe: Record<string, number> = {};
  for (const [key, rawCount] of Object.entries(flags)) {
    const name = /^[a-z0-9][a-z0-9-]{0,63}$/.test(key) ? key : 'unknown';
    const count = Number.isFinite(rawCount) ? Math.max(0, Math.floor(rawCount)) : 0;
    safe[name] = (safe[name] ?? 0) + count;
  }
  const entries = Object.entries(safe)
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => left.localeCompare(right));
  return entries.length > 0
    ? entries.map(([name, count]) => `${name}:${count}`).join(',')
    : 'none';
}

export function formatCodexIndexDiagnostic(value: CodexIndexDiagnostic): string {
  return (
    `codex-index outcome=${value.outcome} ` +
    `files=${value.indexedFiles}/${value.totalFiles} ` +
    `bytes=${value.indexedBytes}/${value.totalBytes} ` +
    `periodBytes=${value.periodMigratedBytes}/${value.periodTotalBytes} ` +
    `migrationPending=${value.migrationPending} ` +
    `bodyReads=${value.bodyReads} failed=${value.failedFiles} ` +
    `metadataMs=${ms(value.metadataMs)} parseMs=${ms(value.parseMs)} ` +
    `flags=${safeFlagCounts(value.qualityFlags)}`
  );
}
