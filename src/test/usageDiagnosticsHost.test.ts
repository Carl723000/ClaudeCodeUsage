import {test} from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import * as os from 'node:os';
import {fingerprintForStableIdentity} from '../quotaObservationStore';
const loader=require('node:module'),originalLoad=loader._load;
const noop=()=>undefined;
const vscode={window:{state:{focused:false},createOutputChannel:()=>({appendLine:noop,dispose:noop})},workspace:{workspaceFolders:[]},env:{}};
loader._load=function(name:string,...args:unknown[]){return name==='vscode'?vscode:originalLoad.call(this,name,...args);};
const View=require('../webview').UsageWebviewProvider;
loader._load=function(name:string,...args:any[]){
 if(name==='vscode')return vscode;
 if(name==='./statusBar')return{StatusBarManager:class {}};
 if(name==='./webview')return{UsageWebviewProvider:class {constructor(context:any){return Object.assign(Object.create(View.prototype),{context,setAchievementWindowFocused:noop});}}};
 return originalLoad.call(this,name,...args);
};
let Extension:any;try{Extension=require('../extension').ClaudeCodeUsageExtension;}finally{loader._load=originalLoad;}
const T=20_000_000,R=T+86_400_000,SALT='synthetic-salt';
function host(run:(e:any,settings:Map<string,unknown>)=>void):void {
 const settings=new Map<string,unknown>([['showQuotaDeclineRate',true],['dataDirectory',''],['usageLimitTracking',true]]);
 const overrides=['queueInitializationWrite','setupCommands','loadConfiguration','refreshQuotaObservationViews','startWindowFocusRefresh','maybeAnnounceWhatsNew','createCodexProvider'];
 const saved=overrides.map(key=>[key,Extension.prototype[key]]);
 overrides.forEach(key=>Extension.prototype[key]=noop);
 try{
  const e=new Extension({subscriptions:[],globalStorageUri:{fsPath:'/synthetic/diagnostics-test'},globalState:{get:()=>undefined,update:()=>Promise.resolve()},secrets:{get:async()=>undefined}},
    {get:(key:string)=>settings.get(key)}, {salt:SALT,repository:{},store:{schemaVersion:2,fingerprintAlgorithm:'hmac-sha256-v1',observations:[]}});
  const home=path.join(os.homedir(),'.codex');
  e.getConfiguration=()=>({dataDirectory:'',codexEnabled:true,codexOfficialQuotaEnabled:true,usageLimitTracking:true,codexDataDirectory:home});
  e.codexHome=()=>home;e.codexSnapshotHome=home;e.officialQuotaSource=home;e.officialQuotaStatus='ready';
  e.officialQuotaSample={accountScopeKey:'a'.repeat(64),observedAt:T,resetAt:R,usedPercent:46};
  const accountFingerprint=fingerprintForStableIdentity(SALT,'codex','official-account-scope-v1|'+'a'.repeat(64));
  e.quotaObservationStore.observations=[{observedAt:T-7200000,usedFraction:.4},{observedAt:T,usedFraction:.46}].map(row=>({...row,
   schemaVersion:2,provider:'codex',accountFingerprint,accountAttribution:'verified-local-signal',periodType:'seven-day',remainingFraction:1-row.usedFraction,resetAt:R,source:'codex-official-api',windowId:'private-window',providerWindowFingerprint:null,confidence:'high',captureReason:'refresh',flags:[]}));
  run(e,settings);
 }finally{for(const [key,value]of saved)Extension.prototype[key]=value;}
}
test('actual extension constructor registers view pull hook without additional collection',()=>host((e,settings)=>{
 let calls=0;e.officialQuotaReader=()=>{calls++;throw Error('network');};e.refreshOfficialCodexQuota=()=>{calls++;throw Error('collection');};
 const p=e.webviewProvider.getQuotaDiagnostics('codex',T);assert.equal(p.rate,3);assert.equal(calls,0);assert.doesNotMatch(JSON.stringify(p),/private|account|windowId|Fingerprint|source/);
 settings.set('showQuotaDeclineRate',false);Object.defineProperty(e.quotaObservationStore,'observations',{get(){throw Error('off read');}});
 assert.equal(e.webviewProvider.getQuotaDiagnostics('codex',T),null);assert.equal(calls,0);
}));
test('source/disable/clear/disposal gates cannot replay a previously ready projection',()=>host((e)=>{
 assert.equal(e.webviewProvider.getQuotaDiagnostics('codex',T).rate,3);
 for(const field of ['disposed','clearingAllLocalData','localDataClearedRequiresReload']){e[field]=true;assert.equal(e.webviewProvider.getQuotaDiagnostics('codex',T),null);e[field]=false;}
 e.weeklyEstimateClearedAt.set('codex',T);assert.equal(e.webviewProvider.getQuotaDiagnostics('codex',T),null);e.weeklyEstimateClearedAt.clear();
 e.codexSnapshotHome='/another-source';assert.equal(e.webviewProvider.getQuotaDiagnostics('codex',T),null);e.codexSnapshotHome=e.officialQuotaSource;
 e.officialQuotaStatus='disabled';assert.equal(e.webviewProvider.getQuotaDiagnostics('codex',T),null);e.officialQuotaStatus='ready';
 const base=e.getConfiguration();e.getConfiguration=()=>({...base,codexOfficialQuotaEnabled:false});assert.equal(e.webviewProvider.getQuotaDiagnostics('codex',T),null);
}));
test('host getter honors stale samples, reset boundaries and identity isolation',()=>host((e)=>{
 assert.equal(e.webviewProvider.getQuotaDiagnostics('codex',T+1800001).status,'stale');
 e.quotaObservationStore.observations[0]={...e.quotaObservationStore.observations[0],windowId:'other-window'};
 e.quotaObservationStore.observations=[...e.quotaObservationStore.observations];assert.equal(e.webviewProvider.getQuotaDiagnostics('codex',T).rate,null);
 e.officialQuotaSample={...e.officialQuotaSample,accountScopeKey:'b'.repeat(64)};assert.equal(e.webviewProvider.getQuotaDiagnostics('codex',T).status,'identity');
}));

test('turning quota diagnostics off releases its host numeric cache',()=>host((e,settings)=>{
 const before=e.webviewProvider.getQuotaDiagnostics('codex',T);
 settings.set('showQuotaDeclineRate',false);assert.equal(e.webviewProvider.getQuotaDiagnostics('codex',T),null);
 settings.set('showQuotaDeclineRate',true);assert.notStrictEqual(e.webviewProvider.getQuotaDiagnostics('codex',T),before);
}));
test('Claude hook requires the active verified API fetch and immediately rejects profile changes',()=>host((e)=>{
 const signal='synthetic-verified-account';const fingerprint=fingerprintForStableIdentity(SALT,'claude',signal);
 e.apiClient.getLastQuotaIdentitySignal=()=>signal;e.activeClaudeQuotaFingerprint=fingerprint;
 e.claudeUsageSource='<auto>';e.cache.usageLimits={};e.cache.usageLimitsLastUpdate=new Date(T);
 e.quotaObservationStore.observations=e.quotaObservationStore.observations.map((row:any)=>({...row,provider:'claude',source:'claude-official-api',accountFingerprint:fingerprint}));
 assert.equal(e.webviewProvider.getQuotaDiagnostics('claude',T).rate,3);
 const config=e.getConfiguration();e.getConfiguration=()=>({...config,dataDirectory:'/changed-profile'});
 assert.equal(e.webviewProvider.getQuotaDiagnostics('claude',T),null);e.getConfiguration=()=>config;
 e.apiClient.getLastQuotaIdentitySignal=()=>null;assert.equal(e.webviewProvider.getQuotaDiagnostics('claude',T),null);
}));
test('actual Codex source revocation prevents switching back from reviving old diagnostics',()=>host((e)=>{
 assert.equal(e.webviewProvider.getQuotaDiagnostics('codex',T).rate,3);
 const home=e.officialQuotaSource;e.tryProviderUiUpdate=()=>undefined;
 e.selectCodexSnapshotHome('/changed-home');assert.equal(e.webviewProvider.getQuotaDiagnostics('codex',T),null);
 e.selectCodexSnapshotHome(home);assert.equal(e.webviewProvider.getQuotaDiagnostics('codex',T),null);
}));
test('actual snapshot adoption preserves display identity while promoting and withdrawing hidden diagnostic proof',()=>host((e)=>{
 const {snapshotFixture}=require('./codexFixtures');const snapshot=snapshotFixture();
 snapshot.files=[snapshot.files[0]];snapshot.currentManifestVerified=true;
 snapshot.coverage.complete=true;snapshot.coverage.identity.complete=true;snapshot.coverage.period.last30Days.complete=true;
 const config=e.getConfiguration();e.getConfiguration=()=>({...config,enableAchievements:false});e.recordCodexQuotaObservations=async()=>undefined;
 e.applyCodexSnapshot(snapshot);const retained=e.codexView,insights=e.codexInsights;assert.deepEqual(retained.diagnosticDays(),[]);
 const fresh=structuredClone(snapshot);fresh.files[0].period.lineageVersion=1;fresh.files[0].period.lineagePrefixEvents=0;
 e.applyCodexSnapshot(fresh);assert.equal(e.codexView,retained);assert.equal(e.codexInsights,insights);
 assert.ok(e.codexView.diagnosticDays().some((day:any)=>day.output>0),'new source proof must reach the retained view');
 const retired=structuredClone(fresh);delete retired.files[0].period.lineageVersion;e.applyCodexSnapshot(retired);
 assert.equal(e.codexView,retained);assert.deepEqual(e.codexView.diagnosticDays(),[],'withdrawn proof must not remain cached');
}));
