const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/server/claim-workspace-invites.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {exports:exportsObject,Date});
const user = {id:'u1', email:'CLIENT@example.com', email_confirmed_at:'2026-09-01',app_metadata:{}};
let queried = 0, accepted = [], member = false;
const service = {from(table) {
  queried++;
  const filters = {};
  const query = {select:()=>query,eq:(key,value)=>{filters[key]=value;return query;},gt:(key,value)=>{filters[key]=value;return query;},
    maybeSingle: async()=>({data:member?{role:'owner'}:null}),
    then(resolve){assert.equal(table,'workspace_invites');assert.equal(filters.email,'client@example.com');assert.equal(filters.status,'pending');assert.ok(Date.parse(filters.expires_at));resolve({data:[{token:'t1',workspace_id:'w1'},{token:'t2',workspace_id:'w2'}]});}
  };return query;
}};
const client={rpc:async(name,args)=>{assert.equal(name,'accept_workspace_invite');accepted.push(args.invite_token);return {data:'workspace'};}};
(async()=>{
  await exportsObject.claimWorkspaceInvites({...user,email_confirmed_at:null},service,client);
  await exportsObject.claimWorkspaceInvites({...user,app_metadata:{review_account:true}},service,client);
  assert.equal(queried,0,'Unverified and review accounts cannot claim invitations');
  await exportsObject.claimWorkspaceInvites(user,service,client);
  assert.deepEqual(accepted,['t1','t2'],'All matching workspace invitations are claimed');
  member=true;accepted=[];
  await exportsObject.claimWorkspaceInvites(user,service,client);
  assert.equal(accepted.length,0,'Existing roles are preserved');
  member=false;
  await assert.rejects(()=>exportsObject.claimWorkspaceInvites(user,service,{rpc:async()=>({error:{message:'expired'}})}),/could not be applied/);
  console.log('Verified-email invitation matching, multiple workspaces, existing roles, review restrictions and error propagation passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
