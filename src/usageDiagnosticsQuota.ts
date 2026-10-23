import type {QuotaObservationV2} from './quotaObservationStore';
import type {UsageProvider} from './providers/providerTypes';
import {diagnosticCurrentQuotaRate, type DiagnosticRate} from './usageDiagnostics';

/** Only fixed enums and numbers cross the host-to-view boundary. */
export interface QuotaDiagnosticsProjection {
  status: DiagnosticRate['status'];
  rate: number | null;
  scope: 'historical-interval';
  precision: 'unknown';
  from?: number;
  through?: number;
  delta?: number;
  resetAt?: number;
  count?: number;
}
/** Host-only current identity authority. Never send this context to the view. */
export interface QuotaDiagnosticsContext {
  provider: UsageProvider;
  accountFingerprint: string;
  observedAt: number;
  resetAt: number;
  now: number;
}
export function projectQuotaDiagnostics(
  observations:readonly QuotaObservationV2[], context:QuotaDiagnosticsContext,
):QuotaDiagnosticsProjection {
  const unavailable=(status:DiagnosticRate['status']):QuotaDiagnosticsProjection=>({status,rate:null,scope:'historical-interval',precision:'unknown'});
  if(!context.accountFingerprint)return unavailable('identity');
  const source=context.provider==='codex'?'codex-official-api':'claude-official-api';
  const rows=observations.filter(row=>row.provider===context.provider&&row.periodType==='seven-day'&&row.source===source)
    .sort((a,b)=>a.observedAt-b.observedAt);
  const last=rows[rows.length-1];
  if(!last)return unavailable('samples');
  if(last.accountFingerprint!==context.accountFingerprint)return unavailable('identity');
  if(last.observedAt!==context.observedAt||last.resetAt!==context.resetAt)return unavailable('boundary');
  const result=diagnosticCurrentQuotaRate(rows.map(row=>({provider:row.provider,seriesKey:row.accountFingerprint,
    windowId:row.windowId,observedAt:row.observedAt,resetAt:row.resetAt??NaN,usedPercent:row.usedFraction*100,
    accountAttribution:row.accountAttribution,flags:row.flags})),context.now);
  if(result.value===null)return unavailable(result.status);
  const first=rows.find(row=>row.observedAt===result.start&&row.accountFingerprint===last.accountFingerprint&&row.windowId===last.windowId);
  return {status:result.status,rate:result.value,scope:'historical-interval',precision:'unknown',
    from:result.start,through:result.end,delta:first?100*(last.usedFraction-first.usedFraction):undefined,
    resetAt:last.resetAt??undefined,count:result.samples};
}
/** At most one entry per provider, no timers or persistence. Time barriers are
 * explicit inputs, so cached ready values cannot survive expiry or clock rollback. */
export class QuotaDiagnosticsProjector {
  private cached=new Map<UsageProvider,{rows:readonly QuotaObservationV2[];key:string;value:QuotaDiagnosticsProjection}>();
  clear():void { this.cached.clear(); }
  project(rows:readonly QuotaObservationV2[],context:QuotaDiagnosticsContext):QuotaDiagnosticsProjection {
    const timeState=context.now<context.observedAt?'future':context.now>=context.resetAt?'expired':
      context.now-context.observedAt>30*60_000?'stale':'fresh';
    const key=[context.accountFingerprint,context.observedAt,context.resetAt,timeState].join('|');
    const previous=this.cached.get(context.provider);
    if(previous&&previous.rows===rows&&previous.key===key)return previous.value;
    const value=projectQuotaDiagnostics(rows,context);
    this.cached.set(context.provider,{rows,key,value});
    return value;
  }
}
