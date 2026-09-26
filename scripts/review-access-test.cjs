const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function load(path, context = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: () => ({}), Date, ...context });
  return exports;
}
const helpers = load("lib/review-access.ts");
assert(helpers.isReviewUser({ role: "tt_reviewer" }));
assert(!helpers.isReviewUser({ role: "authenticated", user_metadata: { review_account: true } }));
assert(helpers.reviewRequestAllowed("GET", "/api/journeys", "unmarked", "unmarked"));
assert(!helpers.reviewRequestAllowed("GET", "/api/journeys", "other", "unmarked"));
assert(!helpers.reviewRequestAllowed("POST", "/api/journeys", "unmarked", "unmarked"));
assert(!helpers.reviewRequestAllowed("GET", "/api/connect/google-drive/start", "unmarked", "unmarked"));
assert(!helpers.reviewRequestAllowed("GET", "/api/new-unreviewed-endpoint", null, "unmarked"));
const grant = { user_id: "review", workspace_id: "unmarked", expires_at: new Date(Date.now() + 14400000).toISOString(), revoked_at: null };
assert(helpers.reviewGrantActive(grant, "review"));
assert(!helpers.reviewGrantActive(grant, "old-review"));
assert(!helpers.reviewGrantActive({ ...grant, revoked_at: new Date().toISOString() }, "review"));
assert(!helpers.reviewGrantActive(grant, "review", Date.parse(grant.expires_at)));
assert(!helpers.reviewGrantActive({ ...grant, expires_at: "bad" }, "review"));
let activeGrant = grant, validUser = true;
const middleware = load("middleware.ts", { atob, URLSearchParams, AbortSignal, fetch: async url => String(url).includes("/auth/v1/user") ? Response.json(validUser ? { id: "review", role: "tt_reviewer" } : {}, { status: validUser ? 200 : 401 }) : Response.json([activeGrant]), process: { env: { SUPABASE_SERVICE_ROLE_KEY: "test-only" } }, require: name => {
  if (name.includes("review-access")) return helpers;
  if (name === "next/server") return { NextResponse: { next: () => new Response(null, { status: 200 }), json: (value, init) => Response.json(value, init) } };
  return { createClient: () => ({
    auth: { getUser: async () => ({ data: { user: validUser ? { id: "review", role: "tt_reviewer" } : null }, error: validUser ? null : new Error("Invalid signature") }) },
    from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: activeGrant }) }; return q; }
  }) };
} });
const token = "header." + Buffer.from(JSON.stringify({ role: "tt_reviewer" })).toString("base64url") + ".signature";
const request = (path, method = "GET") => ({ method, headers: new Headers({ Authorization: "Bearer " + token }), nextUrl: new URL("https://app.trusttale.co" + path) });
(async () => {
  assert.equal((await middleware.middleware(request("/api/journeys?workspaceId=unmarked"))).status, 200);
  assert.equal((await middleware.middleware(request("/api/journeys?workspaceId=other"))).status, 403);
  assert.equal((await middleware.middleware(request("/api/journeys", "POST"))).status, 403);
  assert.equal((await middleware.middleware(request("/api/admin/review-access", "POST"))).status, 403);
  assert.equal((await middleware.middleware(request("/mcp", "POST"))).status, 403);
  validUser = false;
  assert.equal((await middleware.middleware(request("/api/workspaces"))).status, 401);
  validUser = true; activeGrant = { ...grant, expires_at: new Date(0).toISOString() };
  assert.equal((await middleware.middleware(request("/api/workspaces"))).status, 401);
  activeGrant = { ...grant, user_id: "replacement" };
  assert.equal((await middleware.middleware(request("/api/workspaces"))).status, 401);
  console.log("Review access: exact expiry, revocation, replaced sessions, forged tokens, workspace isolation, write denial and API default-deny passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
