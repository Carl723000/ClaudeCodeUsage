import {test} from 'node:test';
import * as assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,appendFile,rm} from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {createEmptyCodexIndex,updateCodexIndex,saveCodexIndexAtomic,loadCodexIndex} from '../providers/codex/codexIndex';
import {scanCodexManifest} from '../providers/codex/codexManifest';
import {CodexProvider} from '../providers/codex/codexProvider';
import {buildCodexUsageView} from '../providers/codex/codexUsage';
import {formatCodexStatus} from '../codexStatus';
const now=Date.parse('2026-07-20T12:00:00Z'),salt='synthetic-cache-availability';
const line=(cache:unknown,ordinal=0,extra={})=>JSON.stringify({type:'event_msg',timestamp:new Date(now-1000+ordinal).toISOString(),payload:{type:'token_count',info:{last_token_usage:{input_tokens:100,output_tokens:20,...(cache===undefined?{}:{cached_input_tokens:cache}),...extra}}}})+'\n';
for(const [label,body,expected] of [
 ['missing',line(undefined),'100 — —%'],
 ['mixed',line(undefined)+line(50,1),'200 — —%'],
 ['unknown cumulative baseline',JSON.stringify({type:'event_msg',timestamp:new Date(now-1000).toISOString(),payload:{type:'token_count',info:{last_token_usage:{input_tokens:100,cached_input_tokens:80,output_tokens:20},total_token_usage:{input_tokens:100,output_tokens:20}}}})+'\n'+JSON.stringify({type:'event_msg',timestamp:new Date(now-500).toISOString(),payload:{type:'token_count',info:{total_token_usage:{input_tokens:200,cached_input_tokens:90,output_tokens:40}}}})+'\n','200 — —%'],
 ['explicit zero',line(0),'100 0 0%'],
 ['known',line(50),'100 50 50%'],
 ['invalid primary with ignored alias',line(101,0,{cache_read_input_tokens:50}),'100 — —%'],
] as const) test('real parser/index/checkpoint/view status cache evidence: '+label,async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'ccu-cache-evidence-'));let provider:CodexProvider|undefined;
 try{
  await mkdir(path.join(root,'sessions'));await writeFile(path.join(root,'sessions/one.jsonl'),body);
  const current=await updateCodexIndex(createEmptyCodexIndex('UTC'),await scanCodexManifest(root,salt),{salt,timeZone:'UTC',now:()=>now,allowAchievementHourProof:false});
  const indexPath=path.join(root,'index.json');await saveCodexIndexAtomic(indexPath,current.index);
  const loaded=await loadCodexIndex(indexPath);
  assert.equal(Object.values(loaded.files)[0].parserState.cacheInputComplete,label==='known'||label==='explicit zero');
  provider=new CodexProvider({enabled:true,codexHome:root,indexPath,salt,timeZone:'UTC'});
  const snapshot=await provider.loadPersistedSnapshot();assert.ok(snapshot);
  const view=buildCodexUsageView(snapshot,now);
  const text=formatCodexStatus(view.today,'processed',null,now,{usageFormat:'{input} {cachedInput} {cacheHitRate}%'}).text;
  assert.equal(text.replace(/\*$/,''),expected);
  const warm=await updateCodexIndex(loaded,await scanCodexManifest(root,salt),{salt,timeZone:'UTC',now:()=>now,allowHistoricalBackfill:false,allowAchievementHourProof:false});
  assert.equal(warm.bodyReads,0,'availability does not add unchanged body reads');
  if(label==='known'){
   const file=Object.values(loaded.files)[0];delete file.parserState.cacheInputComplete;
   await appendFile(path.join(root,'sessions/one.jsonl'),line(25,2));
   const appended=await updateCodexIndex(loaded,await scanCodexManifest(root,salt),{salt,timeZone:'UTC',now:()=>now,allowHistoricalBackfill:false,allowAchievementHourProof:false});
   assert.equal(Object.values(appended.index.files)[0].parserState.cacheInputComplete,false,'an old unknown prefix cannot be certified by a known tail');
   assert.equal(Object.values(appended.index.files)[0].aggregate.total.inputTotal,200);
  }
 }finally{await provider?.dispose();await rm(root,{recursive:true,force:true});}
});
