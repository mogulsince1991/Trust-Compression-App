const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(path, context = {}, extra = "") {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path, "utf8") + extra, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  vm.runInNewContext(code, { exports, require: () => ({}), URL, URLSearchParams, AbortSignal, process: { env: {} }, ...context });
  return exports;
}
const rules = load("lib/source-refresh.ts");
const saved = { title: "New provider title", tags: ["Custom"], deleted_at: "yesterday", created_by: "owner", summary: "My copy", duration_seconds: 30, metadata: {} };
const update = rules.preserveCuratedFields(saved);
assert.equal(update.title, saved.title);
assert.equal(update.duration_seconds, 30);
for (const field of ["tags", "deleted_at", "created_by", "summary"]) assert.equal(field in update, false);
assert.equal(saved.tags[0], "Custom");

let mode = "youtube", calls = [];
const providers = load("lib/source-import.ts", { fetch: async (url, options) => {
  const u = new URL(url); calls.push(u);
  assert.equal(options.cache, "no-store");
  if (mode === "youtube") {
    if (u.pathname.endsWith("/playlistItems")) {
      const page = Number(u.searchParams.get("pageToken") || 0);
      return Response.json({ items: Array.from({ length: 50 }, (_, i) => ({ contentDetails: { videoId: "v" + (page * 50 + i) } })), nextPageToken: page < 11 ? String(page + 1) : undefined });
    }
    return Response.json({ items: u.searchParams.get("id").split(",").map(id => ({ id, snippet: { title: id }, status: { privacyStatus: "public" } })) });
  }
  const child = u.searchParams.get("q").includes("'child'");
  const page = u.searchParams.get("pageToken");
  if (mode === "limit") return Response.json({ files: Array.from({ length: 2501 }, (_, i) => ({ id: String(i), mimeType: "video/mp4" })) });
  return Response.json(child ? { files: [{ id: "nested", mimeType: "video/mp4" }] } :
    page ? { files: [{ id: "second", mimeType: "video/mp4" }] } :
      { nextPageToken: "next", files: [{ id: "first", mimeType: "video/mp4" }, { id: "child", name: "Projects", mimeType: "application/vnd.google-apps.folder" }] });
} });

(async () => {
  const playlist = providers.parseSourceUrl("https://youtube.com/playlist?list=PLtest");
  assert.equal((await providers.importSourceVideos(playlist, { youtubeApiKey: "test", fullRefresh: true })).length, 600);
  assert.equal((await providers.importSourceVideos(playlist, { youtubeApiKey: "test" })).length, 250);
  await assert.rejects(providers.importSourceVideos(providers.parseSourceUrl("https://youtube.com/@test"), { fullRefresh: true }), /entire channel/);
  mode = "drive"; calls = [];
  const folder = providers.parseSourceUrl("https://drive.google.com/drive/folders/root");
  const videos = await providers.importSourceVideos(folder, { driveApiKey: "test", fullRefresh: true });
  assert.equal(videos.length, 3);
  assert.equal(videos.find(video => video.externalId === "nested").metadata.folderPath, "Projects");
  assert.equal(calls.length, 3);
  mode = "limit";
  await assert.rejects(providers.importSourceVideos(folder, { driveApiKey: "test", fullRefresh: true }), /2,500/);

  let requests = 0;
  const db = { auth: { getSession: async () => ({ data: { session: { user: { id: "owner" }, access_token: "test" } } }) },
    from: () => { const query = { select: () => query, eq: () => query, order: () => query, range: async () => ({ data: [
      { id: "playlist", account_label: "Playlist", metadata: { kind: "youtube_playlist" } },
      { id: "folder", account_label: "Folder", metadata: { kind: "drive_private_folder" } },
      { id: "single", metadata: { kind: "youtube_video" } }
    ] }) }; return query; } };
  const client = load("components/library-source-refresh.tsx", {
    require: name => name.includes("supabase") ? { createBrowserSupabaseClient: () => db } : name.includes("source-refresh") ? rules : name.includes("source-import") ? providers : {},
    fetch: async (url, options) => { requests++; assert.equal(JSON.parse(options.body).fullRefresh, true); return Response.json(url.includes("folder") ? { error: "Reconnect Drive" } : {}, { status: url.includes("folder") ? 401 : 200 }); }
  }, "\nexport { refreshCollections as testRefresh };");
  const a = client.testRefresh("owner:workspace", "workspace");
  const b = client.testRefresh("owner:workspace", "workspace");
  assert.equal(a, b, "StrictMode/re-entry joins an active refresh");
  await a.done;
  assert.equal(requests, 2);
  assert.equal(a.progress.running, false);
  assert.equal(a.progress.completed, 2);
  assert.match(a.progress.errors[0], /Folder: Reconnect Drive/);
  await client.testRefresh("owner:workspace", "workspace").done;
  assert.equal(requests, 4, "A later library visit starts a fresh run");
  let source = { id: "source", workspace_id: "workspace", metadata: { kind: "youtube_playlist", sourceUrl: "https://youtube.com/playlist?list=PLtest" }, status: "connected" };
  let claimed = true, imported = 0, privateCalls = 0;
  const serverDb = {
    auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) },
    from: () => {
      let updating = false;
      const query = {
        select: () => query, eq: () => query, is: () => query,
        update: () => { updating = true; return query; },
        single: async () => ({ data: source }),
        maybeSingle: async () => ({ data: updating ? claimed ? { id: source.id } : null : source }),
        then: resolve => resolve({ error: null })
      };
      return query;
    }
  };
  const api = load("app/api/sources/[id]/reimport/route.ts", { Request, require: name => {
    if (name === "next/server") return { NextResponse: { json: (value, init) => Response.json(value, init) } };
    if (name.includes("supabase")) return { createUserSupabaseClient: () => serverDb };
    if (name.includes("import-runner")) return { runSourceImport: async input => { imported++; assert.equal(input.fullRefresh, true); assert.equal(input.workspaceId, "workspace"); return { total: 600 }; } };
    if (name.includes("private-folder")) return { POST: async request => { privateCalls++; const body = await request.json(); assert.equal(body.sourceId, "source"); assert.equal(body.connectedAccountId, "drive-account"); return Response.json({ total: 3 }); } };
    return {};
  } });
  const req = token => new Request("https://example.com/api/sources/source/reimport", { method: "POST", headers: token ? { Authorization: "Bearer test" } : {}, body: JSON.stringify({ workspaceId: "workspace", fullRefresh: true }) });
  const context = { params: { id: "source" } };
  assert.equal((await api.POST(req(false), context)).status, 401);
  assert.equal((await api.POST(req(true), context)).status, 200);
  assert.equal(imported, 1);
  source = { ...source, status: "syncing", metadata: { ...source.metadata, refreshStartedAt: new Date().toISOString() } };
  assert.equal((await api.POST(req(true), context)).status, 409);
  assert.equal(imported, 1);
  source = { ...source, status: "connected", connected_account_id: "drive-account", metadata: { kind: "drive_private_folder", sourceUrl: "https://drive.google.com/drive/folders/root" } };
  assert.equal((await api.POST(req(true), context)).status, 200);
  assert.equal(privateCalls, 1);
  claimed = false;
  assert.equal((await api.POST(req(true), context)).status, 409);
  console.log("Full pagination, nested Drive folders, explicit limits, curated field preservation, refresh deduplication and per-source failures passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
