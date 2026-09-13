// Local-only visual fixture. No production data or analytics writes.
const http = require('node:http');
const fs = require('node:fs');
const ts = require('typescript');
const files = { viewer: 'components/journey-viewer.tsx', clock: 'lib/playback-clock.ts', youtube: 'lib/youtube-player.ts' };
const modules = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText]));
const html = `<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:Arial,sans-serif}button{font:inherit}a{color:inherit}${fs.readFileSync('app/journey-experience.css','utf8')}</style><div id="root"></div><script src="/react.js"></script><script src="/react-dom.js"></script><script>
const modules=${JSON.stringify(modules)};
const cache={}; function load(key){if(cache[key])return cache[key];const exports={};cache[key]=exports;new Function('exports','require',modules[key])(exports,require);return exports;}
function require(name){if(name==='react')return React;if(name==='lucide-react')return new Proxy({}, {get:(_,key)=>props=>React.createElement('span',{'aria-hidden':true},({Play:'▶',FileText:'▤',List:'☰',ChevronLeft:'‹',ChevronRight:'›',Maximize2:'⛶',X:'×',ExternalLink:'↗',ArrowRight:'→',RotateCcw:'↻'})[key]||'')});if(name.includes('trust-app-shared'))return {formatJourneyAssetLabel:a=>a.assetType==='video'?'Video':'Document'};return load(name.includes('playback-clock')?'clock':'youtube');}
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#9db5a0"/><stop offset="1" stop-color="#263c2d"/></linearGradient></defs><rect width="540" height="960" fill="url(#g)"/><path d="M60 400L270 230l210 170v320H60Z" fill="#e8e6d9"/><path d="M30 400l240-190 240 190" fill="none" stroke="#28332b" stroke-width="32"/><rect x="215" y="520" width="110" height="200" fill="#597861"/><text x="270" y="840" text-anchor="middle" fill="white" font-size="24">A home worth coming back to.</text></svg>';
const asset={id:'portrait',title:'A closer look at your next project',assetType:'video',sourcePlatform:'google_drive',sourceUrl:'https://drive.google.com/file/d/fixture-only-id/view',embedUrl:'https://drive.google.com/file/d/fixture-only-id/preview',thumbnailUrl:'data:image/svg+xml,'+encodeURIComponent(svg),metadata:{width:540,height:960},durationSeconds:90,note:'See the details, craftsmanship, and decisions that made this renovation work.'};
const assets=[asset,{...asset,id:'landscape',title:'Meet the people behind the work',metadata:{width:1920,height:1080}},{...asset,id:'document',title:'Your project planning guide',assetType:'document',embedUrl:location.origin+'/document',sourceUrl:location.origin+'/document',thumbnailUrl:null}];
const embeddedFixture=location.pathname.startsWith('/embed/journey/');
const variant=embeddedFixture||new URLSearchParams(location.search).get('mode')==='embed'?'embed':'share';
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(load('viewer').JourneyViewer,{preview:!embeddedFixture,variant,journey:{id:'fixture',share_token:'fixture',title:'Your project, with confidence',description:'Proof that helps you choose with confidence.',cta_label:'Talk about your project',cta_url:'https://example.com',assets}}));
</script></html>`;
http.createServer((req,res)=>{
  if(req.url==='/api/journey-events'){res.setHeader('Content-Type','application/json');return res.end('{}');}
  if(req.url==='/trusttale-embed.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');return res.end(fs.readFileSync('public/trusttale-embed.js'));}
  if(req.url==='/react.js'||req.url==='/react-dom.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(req.url==='/react.js'?'node_modules/react/umd/react.development.js':'node_modules/react-dom/umd/react-dom.development.js'));}
  res.setHeader('Content-Type','text/html; charset=utf-8');
  if(req.url==='/document')return res.end('<h1>Project planning guide</h1>'+('<p>Document reading stays inside this viewer.</p>'.repeat(80)));
  res.end(html);
}).listen(3132,'127.0.0.1',()=>console.log('Journey visual fixture: http://127.0.0.1:3132'));
http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:sans-serif}main{max-width:800px;margin:auto;padding:12px}iframe{border:0;display:block;width:100%}</style><main><h1>Client landing page</h1><iframe data-trusttale-embed src="http://127.0.0.1:3132/embed/journey/fixture" title="Journey" height="760" allow="autoplay; fullscreen"></iframe><p id="after">Content after the journey</p><script async src="http://127.0.0.1:3132/trusttale-embed.js"></script></main>`);}).listen(3133,'127.0.0.1',()=>console.log('Cross-origin embed host: http://127.0.0.1:3133'));
