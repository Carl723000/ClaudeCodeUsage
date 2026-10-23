import type {UsageData} from './types';
import type {WeeklyQuotaObservation} from './weeklyValue';
import {rollingSevenDay, type RollingSevenDayResult} from './rollingSevenDay';

export interface DiagnosticDay {
  day: string;
  output: number;
  processed: number;
  coverage: 'complete' | 'partial' | 'unknown';
  models?: Record<string, number>;
  /** Independent marginal partition, never added to the model partition. */
  roles?: Record<string, number>;
}
export interface DiagnosticRate {
  status: 'ready' | 'partial' | 'unknown' | 'time' | 'identity' | 'boundary' | 'regression' | 'conflict' | 'samples' | 'expired' | 'stale' | 'invalid';
  value: number | null;
  hours?: number;
  samples?: number;
  start?: number;
  end?: number;
}
const count = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;
function ordinal(day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const value = Date.parse(day + 'T00:00:00Z');
  return Number.isFinite(value) && new Date(value).toISOString().slice(0,10) === day ? value : null;
}
/** Bounded binary search for each local calendar boundary. No local-hour buckets
 * are split or stretched; skipped dates fail closed, DST uses actual elapsed time. */
export function diagnosticDayBounds(day: string, zone: string): {start:number;end:number;hours:number} | null {
  const nominal = ordinal(day);
  if (nominal === null || !zone) return null;
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
    const label = (n:number):string => {
      const parts=formatter.formatToParts(n);
      const part=(key:string)=>parts.find(p=>p.type===key)?.value ?? '';
      return `${part('year')}-${part('month')}-${part('day')}`;
    };
    const boundary = (key:string, basis:number):number => {
      let low=basis-36*3600000, high=basis+36*3600000;
      while (high-low>1) { const middle=Math.floor((low+high)/2); if(label(middle)<key)low=middle;else high=middle; }
      return high;
    };
    const start=boundary(day,nominal);
    const next=new Date(nominal+86400000).toISOString().slice(0,10);
    const end=boundary(next,nominal+86400000);
    if(label(start)!==day || label(end-1)!==day || end<=start)return null;
    return {start,end,hours:(end-start)/3600000};
  } catch { return null; }
}
export function diagnosticThroughput(day:DiagnosticDay|undefined, zone:string):DiagnosticRate {
  if(!day || day.coverage==='unknown')return {status:'unknown',value:null};
  const bounds=diagnosticDayBounds(day.day,zone);
  if(!bounds || !count(day.output))return {status:'time',value:null};
  return {status:day.coverage==='partial'?'partial':'ready',value:day.output/bounds.hours,...bounds};
}
export function diagnosticChange(before:DiagnosticDay|undefined,after:DiagnosticDay|undefined,zone:string,dimension:'models'|'roles'):{delta:number|null;rows:Array<{key:string;before:number;after:number;delta:number}>} {
  const unavailable={delta:null,rows:[]};
  if(!before||!after||before.coverage!=='complete'||after.coverage!=='complete')return unavailable;
  const first=diagnosticDayBounds(before.day,zone),last=diagnosticDayBounds(after.day,zone);
  if(!first||!last||first.end!==last.start||first.hours!==last.hours)return unavailable;
  const a=before[dimension],b=after[dimension];
  if(!a||!b)return unavailable;
  const keys=[...new Set([...Object.keys(a),...Object.keys(b)])];
  const own=(bucket:Record<string,number>,key:string):number=>Object.prototype.hasOwnProperty.call(bucket,key)?bucket[key]:0;
  const rows=keys.map(key=>({key,before:own(a,key),after:own(b,key),delta:own(b,key)-own(a,key)}));
  if(rows.some(row=>!count(row.before)||!count(row.after))||rows.reduce((s,r)=>s+r.before,0)!==before.output||rows.reduce((s,r)=>s+r.after,0)!==after.output)return unavailable;
  return {delta:after.output-before.output,rows};
}
/** Host-only account/window keys never appear in the result. This is an endpoint
 * historical mean, not acceleration, source precision or a live burn forecast. */
export function diagnosticQuotaRate(input:readonly WeeklyQuotaObservation[],now:number):DiagnosticRate {
  if(input.length<2)return {status:'samples',value:null};
  if(input.some(row=>!Number.isFinite(row.observedAt)))return {status:'invalid',value:null};
  const rows=[...input].sort((a,b)=>a.observedAt-b.observedAt);
  const last=rows[rows.length-1];
  if(!Number.isFinite(now)||!Number.isFinite(last.resetAt)||last.resetAt<=now)return {status:'expired',value:null};
  if(now-last.observedAt>30*60_000)return {status:'stale',value:null};
  // Do not silently discard an unverified observation to manufacture continuity.
  if(rows.some(row=>row.accountAttribution!=='verified-local-signal'||!row.seriesKey||!row.windowId||row.flags?.some(flag=>flag==='clock-anomaly'||flag==='account-ambiguous')))return {status:'identity',value:null};
  if(rows.some(row=>row.provider!==last.provider||row.seriesKey!==last.seriesKey||row.windowId!==last.windowId||row.resetAt!==last.resetAt))return {status:'boundary',value:null};
  if(rows.some(row=>row.flags?.includes('approximate-boundary')))return {status:'boundary',value:null};
  const unique:WeeklyQuotaObservation[]=[];
  for(const row of rows){
    if(!Number.isFinite(row.observedAt)||row.observedAt<0||row.observedAt>now||row.observedAt>=row.resetAt||!Number.isFinite(row.usedPercent)||row.usedPercent<0||row.usedPercent>100)return {status:'invalid',value:null};
    const previous=unique[unique.length-1];
    if(previous?.observedAt===row.observedAt){if(previous.usedPercent!==row.usedPercent)return {status:'conflict',value:null};continue;}
    if(previous&&row.usedPercent<previous.usedPercent)return {status:'regression',value:null};
    unique.push(row);
  }
  if(unique.length<2)return {status:'samples',value:null};
  const first=unique[0],hours=(last.observedAt-first.observedAt)/3600000;
  // Conservative interpretation gates, not provider billing or timing rules.
  if(hours<1||unique.some((row,index)=>index>0&&row.observedAt-unique[index-1].observedAt>24*3600000))return {status:'samples',value:null};
  return {status:'ready',value:(last.usedPercent-first.usedPercent)/hours,hours,samples:unique.length,start:first.observedAt,end:last.observedAt};
}
/** Select only the final contiguous identity/cycle segment of existing host
 * observations. Never join separated points across an account/reset transition. */
export function diagnosticCurrentQuotaRate(input:readonly WeeklyQuotaObservation[],now:number):DiagnosticRate {
  if(!input.length)return {status:'samples',value:null};
  const sorted=[...input].sort((a,b)=>a.observedAt-b.observedAt);
  const last=sorted[sorted.length-1];
  const compatible=(row:WeeklyQuotaObservation):boolean=>row.provider===last.provider&&
    row.seriesKey===last.seriesKey&&row.windowId===last.windowId&&row.resetAt===last.resetAt;
  let first=sorted.length-1;
  while(first>0&&compatible(sorted[first-1]))first--;
  // Equal original timestamps cannot be ordered into a safe transition.
  if(first>0&&sorted[first-1].observedAt===sorted[first].observedAt)return {status:'conflict',value:null};
  return diagnosticQuotaRate(sorted.slice(first),now);
}

export function adaptClaudeDiagnosticDays(rows:readonly {date:string;data:UsageData}[],complete:boolean):DiagnosticDay[] {
  return rows.map(({date,data})=>({day:date,output:data.totalOutputTokens,
    processed:data.totalInputTokens+data.totalOutputTokens+data.totalCacheCreationTokens+data.totalCacheReadTokens,
    coverage:complete?'complete' as const:'partial' as const,
    models:Object.fromEntries(Object.entries(data.modelBreakdown).map(([model,value])=>[model,value.outputTokens]))}));
}
/** Preserve missing days as unknown. Only an upstream census can supply known
 * zero days. Pure rolling statistics are not an achievement/receipt mutation. */
export function diagnosticSevenDayPeak(days:readonly DiagnosticDay[],asOfDay:string):RollingSevenDayResult|null {
  const valid=days.filter(d=>ordinal(d.day)!==null&&d.day<=asOfDay);
  if(!valid.length||ordinal(asOfDay)===null)return null;
  try{return rollingSevenDay({asOfDay,historyStartDay:valid.reduce((first,d)=>d.day<first?d.day:first,asOfDay),
    days:valid.map(d=>d.coverage==='unknown'||!count(d.processed)?{day:d.day,coverage:'unknown' as const}:{day:d.day,coverage:d.coverage,units:BigInt(d.processed)})});}catch{return null;}
}
