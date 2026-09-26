const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
function compile(file) { return ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText; }
const clockExports = {};
vm.runInNewContext(compile('lib/playback-clock.ts'), { exports: clockExports });

async function mount(provider, activated = true, preview = false) {
  let now = 0;
  const effects = [], intervals = new Set(), requests = [], states = [], listeners = new Map();
  const react = {
    createElement: (tag, props, ...children) => ({ tag, props, children }),
    useMemo: (fn) => fn(), useRef: (current) => ({ current }),
    useState: (initial) => { const index = states.push(initial) - 1; if (index === 2 && activated) states[index] = 'asset'; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useEffect: (fn) => effects.push(fn)
  };
  const video = { currentTime: 0, duration: 30, paused: true, ended: false, seeking: false, readyState: 4, playbackRate: 1,
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name) };
  let youtubeState = -1, youtubePosition = 0, youtubeHandler;
  const youtube = { getCurrentTime: () => youtubePosition, getDuration: () => 30, getPlayerState: () => youtubeState, getPlaybackRate: () => 1, destroy() {} };
  const document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {}, createElement: () => ({}) };
  const window = { location: { origin: 'https://test.example', search: '' }, navigator: { userAgent: 'test' }, localStorage: { getItem: () => 'test-viewer' },
    setTimeout: () => 1, clearTimeout() {}, setInterval: (fn) => { intervals.add(fn); return fn; }, clearInterval: (fn) => intervals.delete(fn),
    addEventListener() {}, removeEventListener() {} };
  const exports = {};
  vm.runInNewContext(compile('components/journey-viewer.tsx'), { exports, React: react, URL, URLSearchParams, window, document, performance: { now: () => now }, crypto: { randomUUID: () => 'session' },
    fetch: async (_url, options) => { requests.push(JSON.parse(options.body)); return {}; },
    require: (name) => {
      if (name === 'react') return react;
      if (name === 'lucide-react') return {};
      if (name.includes('supabase')) return { createBrowserSupabaseClient: () => null };
      if (name.includes('analytics-preferences')) return { browserExcluded: () => false };
      if (name.includes('asset-thumbnail')) return { assetThumbnailUrl: () => null };
      if (name.includes('vimeo-player')) return {};
      if (name.includes('trust-app-shared')) return { formatJourneyAssetLabel: () => 'Video' };
      if (name.includes('playback-clock')) return clockExports;
      if (name.includes('youtube-player')) return { loadYouTubePlayer: async () => ({ Player: function (_frame, options) { youtubeHandler = options.events.onStateChange; return youtube; } }) };
      throw new Error(name);
    }
  });
  const asset = { id: 'asset', videoId: 'video', title: 'Clip', assetType: 'video', sourcePlatform: provider,
    embedUrl: provider === 'native' ? 'https://example.com/video.mp4' : provider === 'youtube' ? 'https://www.youtube.com/embed/example' : 'https://example.com/embed', durationSeconds: 30 };
  const tree = exports.JourneyViewer({ preview, journey: { id: 'journey', title: 'Test', assets: [asset, { ...asset, id: 'second' }] } });
  function attach(node) {
    if (!node || typeof node !== 'object') return;
    if (node.props?.ref) node.props.ref.current = node.tag === 'video' ? video : node.props.className === 'jx-youtube' ? { replaceChildren() {} } : { querySelector: () => null };
    node.children?.flat(Infinity).forEach(attach);
  }
  attach(tree);
  const cleanup = effects.map(fn => fn());
  await Promise.resolve(); await Promise.resolve();
  function tick(position) { now += 1000; video.currentTime = position; youtubePosition = position; [...intervals].forEach(fn => fn()); }
  function play() { video.paused = false; youtubeState = 1; provider === 'native' ? listeners.get('playing')() : youtubeHandler({ data: 1 }); }
  function pause() { video.paused = true; youtubeState = 2; provider === 'native' ? listeners.get('pause')() : youtubeHandler({ data: 2 }); }
  if (preview) {
    play(); tick(1); tick(2); pause(); assert.equal(requests.length, 0, 'editor preview emits no analytics');
  } else if (provider === 'unsupported' || !activated) {
    tick(10); assert.deepEqual(requests.map(r => r.eventType), ['opened']);
  } else {
    tick(0); assert.equal(requests.filter(r => r.eventType === 'asset_started').length, 0);
    play(); tick(1); tick(2); pause(); tick(2); tick(2);
    await Promise.resolve(); await Promise.resolve();
    assert.equal(requests.filter(r => r.eventType === 'asset_started').length, 1);
    assert.equal(requests.filter(r => r.eventType === 'asset_progress').at(-1).metadata.secondsWatched, 2);
    play(); tick(20); tick(21); pause();
    await Promise.resolve(); await Promise.resolve();
    assert.equal(requests.filter(r => r.eventType === 'asset_progress').at(-1).metadata.secondsWatched, 3);
    assert.equal(states[0], 0, 'does not advance on elapsed time');
    play(); tick(22);
    video.ended = true; youtubeState = 0;
    provider === 'native' ? listeners.get('ended')() : youtubeHandler({ data: 0 });
    await Promise.resolve(); await Promise.resolve();
    assert.equal(states[0], 1, 'actual ended advances');
    assert.equal(requests.filter(r => r.eventType === 'asset_completed').length, 1);
    assert.equal(requests.filter(r => r.eventType === 'asset_completed')[0].metadata.percentWatched, 13, 'ending does not imply all content watched');
  }
  cleanup.forEach(fn => fn?.());
  assert.equal(intervals.size, 0);
  console.log(`${provider} activated=${activated} preview=${preview}: player lifecycle and event payloads passed`);
}
(async () => { await mount('native'); await mount('youtube'); await mount('unsupported'); await mount('native', false); await mount('youtube', false); await mount('native', true, true); })().catch(error => { console.error(error); process.exitCode = 1; });
