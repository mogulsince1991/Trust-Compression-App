// Deliberately a raw HTML response: no app layout, styles, React or event handlers.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(params.id)) return new Response("Invalid Drive file", { status: 400 });
  const url = `https://drive.google.com/file/d/${params.id}`;
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Drive player comparison</title></head>
<body>
<h1>Drive player comparison</h1>
<p>This is the same Google player, without TrustTale styling, overlays, resizing, or gesture handling. This test does not record journey activity.</p>
<p>Play for at least 10 seconds without touching the screen. Do the controls disappear?</p>
<iframe src="${url}/preview" title="Plain Google Drive video player" width="100%" height="600" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
<p><a href="${url}/preview" target="_blank" rel="noopener noreferrer">Open the same web player outside an iframe</a></p>
<p><a href="${url}/view" target="_blank" rel="noopener noreferrer">Open original in Drive</a> (this may launch the Drive app, which uses a different player).</p>
<p>Report which works: journey, plain iframe, standalone web player, or Drive app. Use the same iPhone browser for the first three.</p>
</body></html>`, { headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-src https://drive.google.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff"
  } });
}
