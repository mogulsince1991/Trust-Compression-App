// Deliberately a raw HTML response: no app layout, styles, React or event handlers.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(params.id)) return new Response("Invalid Drive file", { status: 400 });
  const url = `https://drive.google.com/file/d/${params.id}`;
  const query = new URL(request.url).searchParams;
  const size = query.get("size") === "50" ? 50 : query.get("size") === "75" ? 75 : 100;
  const shape = query.get("shape") === "landscape" ? "landscape" : "portrait";
  const sizeLinks = [100, 75, 50].map(value => `<a href="?size=${value}&amp;shape=${shape}"${size === value ? ' aria-current="page"' : ""}>${value === 100 ? "Normal" : `${value}% scale`}</a>`).join(" ");
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Drive player comparison</title>
<style>
* { box-sizing: border-box; } body { margin: 0; background: #151515; color: #f5f5f5; font: 16px/1.5 sans-serif; }
header, footer { max-width: 720px; margin: auto; padding: 16px; } h1 { font-size: 22px; margin: 0; }
nav { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; } a { color: #f5f5f5; }
nav a { padding: 10px 14px; border: 1px solid #777; border-radius: 8px; text-decoration: none; } [aria-current="page"] { background: #f5f5f5; color: #151515; }
.frame { position: relative; width: 100%; max-width: ${shape === "portrait" ? "480px" : "960px"}; aspect-ratio: ${shape === "portrait" ? "9 / 16" : "16 / 9"}; margin: auto; background: black; overflow: hidden; }
/* Scale the entire Google viewport, not a cropped section of the video. */
iframe { position: absolute; inset: 0; border: 0; width: ${10000 / size}%; height: ${10000 / size}%; transform: scale(${size / 100}); transform-origin: top left; }
</style></head>
<body>
<header>
<h1>Drive player comparison</h1>
<p>Same Drive video, no custom playback or stored copy. Smaller scales give Google a larger internal viewport, then shrink the entire player to fit.</p>
<nav aria-label="Player scale">${sizeLinks}</nav>
<nav aria-label="Video shape"><a href="?size=${size}&amp;shape=portrait"${shape === "portrait" ? ' aria-current="page"' : ""}>Portrait</a><a href="?size=${size}&amp;shape=landscape"${shape === "landscape" ? ' aria-current="page"' : ""}>Landscape</a></nav>
<p>Play for 10 seconds without touching, then tap away from the buttons inside the video. Check whether the bar hides, covers less video, and remains usable. Changing options restarts playback.</p>
</header>
<div class="frame"><iframe src="${url}/preview" title="Google Drive video player at ${size}% scale" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>
<footer><p>Experimental: Google may adapt its controls differently instead of simply shrinking them. No journey activity is recorded here.</p>
<p><a href="${url}/preview" target="_blank" rel="noopener noreferrer">Open the same web player outside an iframe</a></p>
<p><a href="${url}/view" target="_blank" rel="noopener noreferrer">Open original in Drive</a> (this may launch the Drive app, which uses a different player).</p>
<p>Report which works: journey, plain iframe, standalone web player, or Drive app. Use the same iPhone browser for the first three.</p>
</footer></body></html>`, { headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-src https://drive.google.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff"
  } });
}
