import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
const toolsRoot=resolve(import.meta.dirname,'../build-tools');
const manifest=JSON.parse(readFileSync(resolve(toolsRoot,'package.json'),'utf8'));
const lock=JSON.parse(readFileSync(resolve(toolsRoot,'package-lock.json'),'utf8'));
const requireTool=createRequire(resolve(toolsRoot,'package.json'));

test('build-only Identity uses the patched exact MSAL without relaxing the audit gate',()=>{
  assert.equal(manifest.overrides?.['@azure/identity']?.['@azure/msal-node'],'7.1.1');
  const matches=Object.entries(lock.packages).filter(([key])=>key.endsWith('node_modules/@azure/msal-node'));
  assert.ok(matches.length>0);
  for(const [,entry] of matches){assert.equal(entry.version,'7.1.1');assert.match(entry.integrity,/^sha512-/);}
});

test('Azure Identity authenticates through the patched MSAL with synthetic HTTP only',
  {skip: !existsSync(resolve(toolsRoot,'node_modules/@azure/identity/package.json')) && !process.env.CI
    ? 'Install the locked build tools to run this offline compatibility check' : false}, async()=>{
  const {ClientSecretCredential}=requireTool('@azure/identity');
  const tenant='11111111-1111-1111-1111-111111111111';
  const authority='https://login.microsoftonline.com/'+tenant;
  const requests=[];
  const credential=new ClientSecretCredential(tenant,'22222222-2222-2222-2222-222222222222','synthetic-build-only-secret',{
    authorityHost:'https://login.microsoftonline.com',disableInstanceDiscovery:true,
    httpClient:{sendRequest:async request=>{
      const url=new URL(request.url);requests.push(url);
      assert.equal(url.origin,'https://login.microsoftonline.com','never contact an untrusted authority');
      let body;
      if(url.pathname.endsWith('/.well-known/openid-configuration'))body={
        issuer:authority+'/v2.0',authorization_endpoint:authority+'/oauth2/v2.0/authorize',
        token_endpoint:authority+'/oauth2/v2.0/token',end_session_endpoint:authority+'/oauth2/v2.0/logout',
        jwks_uri:authority+'/discovery/v2.0/keys',};
      else if(url.pathname===`/${tenant}/oauth2/v2.0/token`){
        assert.equal(request.method,'POST');
        assert.match(String(request.body),/grant_type=client_credentials/);
        body={access_token:'synthetic-access-token',token_type:'Bearer',expires_in:3600};
      }else assert.fail('Unexpected synthetic authentication request path');
      return {request,status:200,headers:requireTool('@azure/core-rest-pipeline').createHttpHeaders(),bodyAsText:JSON.stringify(body)};
    }},
  });
  const token=await credential.getToken('https://marketplace.visualstudio.com/.default');
  assert.equal(token.token,'synthetic-access-token');
  assert.ok(requests.some(url=>url.pathname.endsWith('/oauth2/v2.0/token')));
});
