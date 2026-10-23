const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(path, requireMock) { const exports={}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URL,require:requireMock}); return exports; }
const rules=load('lib/report-access.ts');
const enabled='bef4c5ad-5ead-4f2a-934c-f1238f614589';
assert.equal(rules.reportsEnabled(enabled),true);
for(const id of ['',null,'MI Remodelers','another-workspace']) assert.equal(rules.reportsEnabled(id),false);
let membership=true;
const db={from(){return {select(){return this},eq(){return this},maybeSingle:async()=>({data:membership?{role:'owner'}:null})}}};
const auth=load('lib/server/route-auth.ts', name=>name.includes('report-access')?rules:{createUserSupabaseClient:()=>({auth:{getUser:async()=>({data:{user:{id:'user'}}})}}),createServiceSupabaseClient:()=>db});
const request={url:'https://trusttale.co/api/metrics/contractor/report',headers:{get:()=> 'Bearer test'}};
(async()=>{
 await auth.requireWorkspaceAccess(request,enabled);
 await assert.rejects(auth.requireWorkspaceAccess(request,'other'),{status:403,message:rules.REPORT_UPGRADE_MESSAGE});
 await auth.requireWorkspaceAccess({...request,url:'https://trusttale.co/api/library-assets'},'other');
 membership=false; await assert.rejects(auth.requireWorkspaceAccess(request,enabled),{status:403});
 console.log('Reporting entitlement, membership and unrelated workspace access passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
