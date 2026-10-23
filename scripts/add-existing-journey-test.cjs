const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('components/trust-app-ingestion.tsx', 'utf8');
const method = source.slice(source.indexOf('  function editJourney('), source.indexOf('  function hydrateJourneyDraft('));
const state = {};
const context = {
  draftSaved: true, draftAssets: [], draft: {}, draftKey: 'workspace-draft', draftReady: 'workspace-draft', folders: [],
  window: { confirm: () => false },
  sessionStorage: { setItem: (_, value) => { state.stored = JSON.parse(value); } },
};
for (const name of ['SelectedJourneyId', 'Draft', 'DraftAssets', 'ShareUrl', 'PersonalShareUrl', 'SavedDraft', 'View', 'Notice', 'Error']) context[`set${name}`] = value => { state[name] = value; };
vm.runInNewContext(ts.transpileModule(method, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
const journey = { id: 'existing', title: 'Existing journey', shareUrl: '/share/unchanged', assets: [{ id: 'old', videoId: 'video-1', position: 1 }] };
assert.equal(context.editJourney(journey, [{ videoId: 'video-1' }, { libraryAssetId: 'doc-1' }, { libraryAssetId: 'doc-1' }]), true);
assert.equal(state.DraftAssets.length, 2);
assert.equal(state.DraftAssets[1].position, 2);
assert.equal(state.stored.journeyId, journey.id);
assert.equal(state.stored.shareUrl, journey.shareUrl);
assert.equal(state.stored.assets.length, 2);
assert.equal(JSON.parse(state.SavedDraft).assets.length, 1);
context.draftSaved = false;
context.draft = { title: 'Unsaved' };
assert.equal(context.editJourney(journey, []), false);
context.draftSaved = true;
context.sessionStorage.setItem = () => { throw new Error('blocked'); };
assert.equal(context.editJourney(journey, []), false);
console.log('Existing journey additions preserve links, deduplicate, and handle cancellation/storage failure.');
