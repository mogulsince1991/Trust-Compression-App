const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync('components/journey-viewer.tsx','utf8');
const handler = source.slice(source.indexOf('    function ended() {'), source.indexOf('    function visibility()'));
let advances = 0, activated, completed = 0;
const positions = { current: new Map([['first', 120]]) };
const context = { disposed: false, endedThisPlayback: false, playedThisPlayback: true, preview: false,
  asset: { id: 'first' }, active: 0, journey: { assets: [{ id: 'first' }, { id: 'second' }] },
  clock: { started: true, completed: false }, positions, storageKey: 'test',
  flush() {}, setStarted() {}, emit() { completed++; }, setActivatedId(id) { activated=id; },
  setLoadedId() {}, setFinished() {}, localStorage: { removeItem() {} },
  setActive(fn) { assert.equal(fn(0),1); advances++; }
};
vm.createContext(context);
vm.runInContext(handler + '\nended(); ended();', context);
assert.equal(advances,1);
assert.equal(completed,1);
assert.equal(activated,'second');
assert.equal(positions.current.get('first'),0);
assert.match(source,/if \(disposed \|\| endedThisPlayback\) return;/);
assert.match(source,/url.searchParams.set\("loop", "0"\)/);
assert.match(source,/"playlist", "list", "listType", "index", "start", "end", "t"/);
context.endedThisPlayback=false; context.playedThisPlayback=false;
vm.runInContext('ended();',context);
assert.equal(advances,1,'An initial ended state must not skip an unplayed video');
console.log('Playback end: one advance, replay position reset, stale end ignored, YouTube loop settings removed.');
