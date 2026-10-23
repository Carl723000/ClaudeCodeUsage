import {test} from 'node:test';
import * as assert from 'node:assert/strict';
const subject=():any=>require('../usageDiagnosticsQuota');
const now=20_000_000;
const row=(observedAt:number,usedFraction:number,extra:any={})=>({schemaVersion:2,provider:'codex',accountFingerprint:'secret-account-hmac',accountAttribution:'verified-local-signal',observedAt,periodType:'seven-day',usedFraction,remainingFraction:1-usedFraction,resetAt:now+86_400_000,source:'codex-official-api',windowId:'secret-window-hmac',providerWindowFingerprint:null,confidence:'high',captureReason:'refresh',flags:[],...extra});
const context={provider:'codex',accountFingerprint:'secret-account-hmac',observedAt:now,resetAt:now+86_400_000,now};
test('P2 projector emits a numeric historical DTO only and excludes local events',()=>{const m=subject();const p=m.projectQuotaDiagnostics([row(now-7200000,.4),row(now-3600000,.43,{source:'codex-local-structured-event',accountAttribution:'unattributed'}),row(now,.46)],context);assert.equal(p.rate,3);assert.equal(p.count,2);assert.equal(p.scope,'historical-interval');assert.doesNotMatch(JSON.stringify(p),/secret|Fingerprint|windowId|source/);});
test('P2 projector rejects foreign current identity, official regression and stale latest sample',()=>{const m=subject();const rows=[row(now-7200000,.4),row(now,.46)];assert.equal(m.projectQuotaDiagnostics(rows,{...context,accountFingerprint:'other'}).rate,null);assert.equal(m.projectQuotaDiagnostics([rows[0],row(now,.3)],context).status,'regression');assert.equal(m.projectQuotaDiagnostics(rows,{...context,now:now+1_800_001}).status,'stale');});
test('P2 numeric cache reuses unchanged evidence and expires/clears without reading hidden sources',()=>{const owner=new (subject().QuotaDiagnosticsProjector)();const rows=[row(now-7200000,.4),row(now,.46)];const first=owner.project(rows,context);assert.strictEqual(owner.project(rows,{...context,now:now+1}),first);assert.equal(owner.project(rows,{...context,now:now+1_800_001}).status,'stale');owner.clear();assert.notStrictEqual(owner.project(rows,context),first);});
test('approximate reset-boundary evidence cannot establish an exact same-cycle rate',()=>{
 const m=subject();assert.equal(m.projectQuotaDiagnostics([row(now-7200000,.4,{flags:['approximate-boundary']}),row(now,.46)],context).rate,null);
});
