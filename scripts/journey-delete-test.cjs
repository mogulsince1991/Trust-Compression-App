const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
let archived = true, permitted = true, failure = false, deletes = 0;
const db = {auth:{getUser:async()=>({data:{user:{id:'user'}}})},from(table){
  assert.equal(table,'journeys','Never delete child content separately');
  const filters={};
  const q={select:()=>q,eq:(k,v)=>{filters[k]=v;return q;},not:(k,op,v)=>{assert.equal(k,'deleted_at');return q;},
    single:async()=>({data:archived?{id:'journey'}:null}),delete:()=>{deletes++;return q;},
    then(resolve){assert.equal(filters.workspace_id,'workspace');assert.equal(filters.id,'journey');resolve({data:permitted?[{id:'journey'}]:[],error:failure?{message:'constraint'}:null});}};
  return q;
}};
const exported={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/journeys/[id]/purge/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exported,require:name=>name==='next/server'?{NextResponse:{json:(v,init)=>Response.json(v,init)}}:{createUserSupabaseClient:()=>db}});
const request=(signed=true)=>new Request('https://example.com/api/journeys/journey/purge',{method:'DELETE',headers:signed?{Authorization:'Bearer token'}:{},body:JSON.stringify({workspaceId:'workspace'})});
const context={params:{id:'journey'}};
(async()=>{
  assert.equal((await exported.DELETE(request(false),context)).status,401);
  archived=false;assert.equal((await exported.DELETE(request(),context)).status,409);assert.equal(deletes,0);
  archived=true;permitted=false;assert.equal((await exported.DELETE(request(),context)).status,403);
  permitted=true;failure=true;assert.equal((await exported.DELETE(request(),context)).status,409);
  failure=false;assert.equal((await exported.DELETE(request(),context)).status,200);
  console.log('Journey deletion: authentication, archive requirement, workspace scoping, permission failures and atomic delete passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
