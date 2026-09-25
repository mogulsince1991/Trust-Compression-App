const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;

let clients = 0;
const moduleContext = { exports: {}, process: { env: {} }, window: {}, require: () => ({ createClient: () => ({ id: ++clients }) }) };
vm.runInNewContext(compile(fs.readFileSync('lib/supabase.ts', 'utf8')), moduleContext);
assert.equal(moduleContext.exports.createBrowserSupabaseClient(), moduleContext.exports.createBrowserSupabaseClient());
delete moduleContext.window;
assert.notEqual(moduleContext.exports.createBrowserSupabaseClient(), moduleContext.exports.createBrowserSupabaseClient());

const source = fs.readFileSync('components/trust-app-ingestion.tsx', 'utf8');
const add = source.slice(source.indexOf('  function addLibraryItems('), source.indexOf('  async function signOut()'));
const stored = new Map();
const context = {
  draftKey: 'user-a:workspace-a', draftReady: 'user-a:workspace-a', draftAssets: [], draft: { title: '' },
  selectedJourneyId: null, shareUrl: '', savedDraft: '',
  sessionStorage: { setItem: (key, value) => stored.set(key, value) },
  setError: value => { context.error = value; },
  setDraftAssets: value => { context.draftAssets = value; },
  setDraft: value => { context.draft = value; },
  setNotice: value => { context.notice = value; },
  setView: value => { assert.ok(stored.has(context.draftKey)); context.view = value; }
};
vm.runInNewContext(compile(add), context);
context.addLibraryItems([{ id: 'one', videoId: 'video-1' }, { id: 'two', libraryAssetId: 'doc-1' }]);
assert.equal(context.draftAssets.length, 2);
assert.equal(context.draft.title, 'Proof journey');
assert.equal(JSON.parse(stored.get(context.draftKey)).assets.length, 2);
context.addLibraryItems([{ id: 'one', videoId: 'video-1' }]);
assert.equal(context.draftAssets.length, 2);
context.draftReady = 'another-workspace'; context.view = null;
context.addLibraryItems([{ id: 'three', videoId: 'video-3' }]);
assert.equal(context.view, null);
assert.equal(context.draftAssets.length, 2);
context.draftReady = context.draftKey;
context.sessionStorage.setItem = () => { throw new Error('storage unavailable'); };
context.addLibraryItems([{ id: 'three', videoId: 'video-3' }]);
assert.equal(context.view, null);
assert.equal(context.draftAssets.length, 2);
console.log('Shared browser auth client, server isolation, draft navigation, deduplication and storage failures passed.');
