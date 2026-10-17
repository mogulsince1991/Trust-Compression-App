const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { createHash } = require('node:crypto');
const bytes = Buffer.from('photo bytes');
const checksum = createHash('md5').update(bytes).digest('hex');
const file = { id: 'drive_file_12345', size: String(bytes.length), md5Checksum: checksum };
let calls = [];
let responses = [];
const exported = {};
const code = ts.transpileModule(fs.readFileSync('lib/server/google-photos-drive.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { exports: exported, require, URL, URLSearchParams, AbortSignal, Uint8Array,
  fetch: async (url, options) => { calls.push({ url: String(url), options }); assert.equal(options.redirect, 'error'); const next = responses.shift(); assert.ok(next, 'Unexpected fetch'); return next; },
});
const json = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const upload = () => exported.uploadPhotoToDrive('token','workspace','asset-id','Kitchen.jpg',bytes,'image/jpeg');
(async () => {
  responses = [json({files:[]}), json({files:[{id:'folder'}]}), new Response('',{headers:{location:'https://www.googleapis.com/upload/drive/v3/files?upload_id=test'}}), json(file), json(file), json({permissions:[]}), json({id:'permission'})];
  assert.equal(await upload(), file.id);
  assert.equal(calls[3].options.method,'PUT');
  assert.equal(Buffer.from(calls[3].options.body).toString(), bytes.toString());
  assert.ok(calls[4].url.includes('md5Checksum'), 'Persisted bytes must be verified');
  assert.equal(JSON.parse(calls[6].options.body).allowFileDiscovery, false);
  calls = []; responses = [json({files:[file]}), json(file), json({permissions:[{type:'anyone',role:'reader'}]})];
  assert.equal(await upload(), file.id);
  assert.equal(calls.length,3,'Retry must reuse existing Drive copy');
  calls = []; responses = [json({files:[file]}), json({...file,md5Checksum:'bad'})];
  await assert.rejects(upload(),/verification failed/);
  assert.equal(calls.length,2,'Bad upload must not be shared');
  calls = []; responses = [json({files:[]}), json({files:[{id:'folder'}]}), new Response('',{headers:{location:'https://evil.test/upload'}})];
  await assert.rejects(upload(),/Invalid Drive upload address/);
  calls = []; responses = [json({files:[file]}), json(file), json({permissions:[]}), new Response('',{status:403})];
  await assert.rejects(upload(),/sharing restrictions/);
  const route = fs.readFileSync('app/api/import/google-photos/route.ts','utf8');
  assert.ok(!route.includes('.upload('),'No Supabase storage upload path allowed');
  assert.ok(route.indexOf('await uploadPhotoToDrive') < route.indexOf('await removeLegacyCopy(serviceSupabase, workspaceId, id, payload.metadata)'));
  const endpoint = {};
  let events = [], failure = '';
  const metadata = { provider:'google_photos', photoKey:'a'.repeat(64), storagePath:'workspace/'+'a'.repeat(64) };
  const db = {
    from() { const query = { select() {return this;}, eq() {return this;}, maybeSingle:async()=>({data:{id:'asset',metadata},error:null}), update(payload) { events.push('save'); return { eq() {return this;}, then(resolve) {resolve({error:failure==='save'?{message:'failed'}:null});} }; } }; return query; },
    storage: { from() {return {remove:async paths=>{assert.equal(paths[0],metadata.storagePath);events.push('remove');return {error:failure==='cleanup'?{message:'failed'}:null};}}} },
  };
  vm.runInNewContext(ts.transpileModule(route, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {
    exports:endpoint, URL, Date, process:{env:{SUPABASE_SERVICE_ROLE_KEY:'secret'}},
    require:name=> name==='next/server'?{NextResponse:{json:(body,options)=>({body,...options})}}:
      name==='@/lib/server/route-auth'?{httpError:(status,message)=>Object.assign(Error(message),{status}),requireWorkspaceAccess:async()=>({serviceSupabase:db,user:{id:'user'}}),requireWorkspaceManager:c=>c}:
      name==='@/lib/server/google-photos'?{PHOTOS_BUCKET:'library-photos',photoAssetId:()=> 'asset',verifyPhoto:()=>({id:'photo',mediaFile:{filename:'photo.jpg'}}),downloadPhoto:async()=>({bytes,mime:'image/jpeg'})}:
      name==='@/lib/server/google-photos-drive'?{uploadPhotoToDrive:async()=>{events.push('drive');if(failure==='drive')throw Error('Drive failed');return file.id;}}:
      name==='@/lib/server/workspace-photo-storage'?{requirePhotoWriter:c=>c,workspacePhotoToken:async()=>({token:'workspace-token',connection:{folder_id:'folder'}})}:require(name),
  });
  const req = {url:'https://app.trusttale.co/api/import/google-photos',text:async()=>JSON.stringify({workspaceId:'workspace',action:'import',googleToken:'token',consent:true,driveSharingConsent:true,ticket:'ticket'})};
  assert.equal((await endpoint.POST(req)).status,200);
  assert.deepEqual(events,['drive','save','remove','save']);
  failure='drive'; events=[]; assert.equal((await endpoint.POST(req)).status,400); assert.deepEqual(events,['drive']);
  failure='save'; events=[]; assert.equal((await endpoint.POST(req)).status,500); assert.deepEqual(events,['drive','save']);
  failure='cleanup'; events=[]; assert.equal((await endpoint.POST(req)).status,500); assert.deepEqual(events,['drive','save','remove']);
  console.log('Drive transfer: upload, checksum verification, retry reuse, sharing failure and unsafe redirects passed; no Supabase upload path.');
  console.log('Legacy cleanup: deletes only after verified upload and saved reference; upload/save/cleanup failures handled safely.');
})().catch(error => { console.error(error); process.exitCode = 1; });
