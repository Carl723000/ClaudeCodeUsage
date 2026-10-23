import * as fs from 'fs';
import * as path from 'path';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';

test('presentation toggles refresh dashboard UI without rebuilding providers', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'extension.ts'),
    'utf8',
  );

  assert.match(
    source,
    /DASHBOARD_ONLY_SETTINGS\s*=\s*new Set\(\[[\s\S]*?'showWeeklyEquivalentValue'[\s\S]*?'showProjectUsageMatrix'[\s\S]*?\]\)/,
  );
  assert.match(
    source,
    /DASHBOARD_ONLY_SETTINGS\.has\(key\)[\s\S]*?this\.syncProviderUi\(\);[\s\S]*?return;/,
  );
});

test('currency display settings reformat materialized data without rebuilding providers', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'extension.ts'),
    'utf8',
  );

  assert.match(
    source,
    /COST_DISPLAY_SETTINGS\s*=\s*new Set\(\[[\s\S]*?'decimalPlaces'[\s\S]*?'displayCurrency'[\s\S]*?\]\)/,
  );
  assert.doesNotMatch(
    source.match(/COST_DISPLAY_SETTINGS\s*=\s*new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? '',
    /usdConversionRate/,
  );
  const branch = source.match(
    /if \(key && ClaudeCodeUsageExtension\.COST_DISPLAY_SETTINGS\.has\(key\)\) \{([\s\S]*?)\n    \}/,
  )?.[1] ?? '';
  assert.match(branch, /this\.applyFormattingConfiguration\(config\)/);
  assert.match(branch, /this\.webviewProvider\.invalidateShareCardPreview\(\)/);
  assert.match(branch, /this\.syncProviderUi\(\)/);
  assert.match(branch, /return;/);
  assert.doesNotMatch(branch, /restart|createCodexProvider|startWatcher|scan/i);
});

test('pricing changes also invalidate sharing projections before a dashboard refresh', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'extension.ts'),
    'utf8',
  );
  assert.match(
    source,
    /private async refreshPricing\(\)[\s\S]*?this\.invalidateClaudeUsagePricingCache\(\);\s*this\.webviewProvider\.invalidateShareCardPreview\(\{\s*pricingChanged:\s*true\s*\}\);/,
  );
  assert.match(
    source,
    /if \(pricingBackendChanged\) \{\s*this\.invalidateClaudeUsagePricingCache\(\);\s*this\.webviewProvider\.invalidateShareCardPreview\(\{\s*pricingChanged:\s*true\s*\}\);/,
  );
});


test('real host routes each diagnostic switch to UI only, never source or official refresh',()=>{
 const Module=require('node:module'),load=Module._load;
 Module._load=function(name:string,...args:unknown[]){return name==='vscode'?{env:{}}:load.call(this,name,...args);};
 let Extension:any;try{Extension=require('../extension').ClaudeCodeUsageExtension;}finally{Module._load=load;}
 const owner:any=Object.create(Extension.prototype);let ui=0;
 owner.disposed=false;owner.syncProviderUi=()=>ui++;
 for(const method of ['refreshData','refreshOfficialCodexQuota','onConfigurationChanged','createCodexProvider','startWatcher'])owner[method]=()=>{throw Error('Forbidden source work '+method);};
 for(const key of ['showUsageThroughput','showUsageChange','showQuotaDeclineRate'])owner.onSettingsChangedFromPanel(key);
 assert.equal(ui,3);
});
