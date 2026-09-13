import { NextResponse } from "next/server";
import { requireIntegrationKey, requireIntegrationScope, resolveDirectMessageWorkspace } from "@/lib/server/integration-auth";
import { archiveIntegrationJourney, createIntegrationJourney, listIntegrationJourneys, searchIntegrationLibrary, updateIntegrationJourney } from "@/lib/server/integration-journeys";
import { importLibrarySource } from "@/lib/server/library-import";
import { recordActivity } from "@/lib/server/activity";

type Rpc = { id?: string | number | null; method?: string; params?: Record<string, any> };
const context = { sender_phone: { type: "string", description: "Direct-message sender phone number." }, message_channel: { type: "string", enum: ["direct_message"] }, workspace_hint: { type: "string", description: "Workspace name, slug, or ID when the sender can access multiple workspaces." }, source_contact_id: { type: "string" } };
const asset = { type: "object", properties: { video_id: { type: "string" }, library_asset_id: { type: "string" }, source_url: { type: "string" }, title: { type: "string" }, note: { type: "string" } }, additionalProperties: false };
const tools = [
  { name: "import_library_source", description: "Import a YouTube source or save an embeddable cloud asset.", inputSchema: { type: "object", properties: { source_url: { type: "string" }, title: { type: "string" }, summary: { type: "string" }, mime_type: { type: "string" }, sharing: { type: "string" }, source_system: { type: "string" }, metadata: { type: "object" } }, required: ["source_url"], additionalProperties: false } },
  { name: "search_library", description: "Search the workspace library for relevant sales assets.", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" }, ...context }, required: ["query", "sender_phone", "message_channel"], additionalProperties: false } },
  { name: "list_journeys", description: "List or find active workspace journeys.", inputSchema: { type: "object", properties: { query: { type: "string" }, ...context }, required: ["sender_phone", "message_channel"], additionalProperties: false } },
  { name: "create_journey", description: "Create a journey from selected assets.", inputSchema: { type: "object", properties: { title: { type: "string" }, heading: { type: "string" }, description: { type: "string" }, cta_label: { type: "string" }, cta_url: { type: "string" }, publish: { type: "boolean" }, assets: { type: "array", items: asset }, ...context }, required: ["title", "assets", "sender_phone", "message_channel"], additionalProperties: false } },
  { name: "update_journey", description: "Edit assets, copy, order, or publication state for a journey.", inputSchema: { type: "object", properties: { journey_id: { type: "string" }, title: { type: "string" }, heading: { type: "string" }, description: { type: "string" }, cta_label: { type: "string" }, cta_url: { type: "string" }, publish: { type: "boolean" }, assets: { type: "array", items: asset }, ...context }, required: ["journey_id", "sender_phone", "message_channel"], additionalProperties: false } },
  { name: "archive_journey", description: "Archive and unpublish a journey.", inputSchema: { type: "object", properties: { journey_id: { type: "string" }, ...context }, required: ["journey_id", "sender_phone", "message_channel"], additionalProperties: false } },
];

export async function GET() { return NextResponse.json({ name: "TrustTale MCP", transport: "streamable-http", endpoint: "/mcp", tools: tools.map((tool) => tool.name) }); }

export async function POST(request: Request) {
  let rpc: Rpc | null = null;
  try {
    rpc = await request.json() as Rpc;
    const { serviceSupabase, key } = await requireIntegrationKey(request);
    const id = rpc.id ?? null;
    if (rpc.method === "initialize") return ok(id, { protocolVersion: "2025-03-26", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "trusttale", version: "1.1.0" } });
    if (rpc.method === "notifications/initialized") return new NextResponse(null, { status: 202 });
    if (rpc.method === "ping") return ok(id, {});
    if (rpc.method === "tools/list") return ok(id, { tools });
    if (rpc.method !== "tools/call") return fail(id, -32601, `Method ${rpc.method ?? "unknown"} is not supported.`);
    const name = String(rpc.params?.name || "");
    const args = (rpc.params?.arguments ?? {}) as Record<string, any>;
    let result: unknown;
    if (name === "import_library_source") {
      requireIntegrationScope(key.scopes, "library:import");
      if (!String(args.source_url || "").trim()) return fail(id, -32602, "source_url is required.");
      result = await importLibrarySource(serviceSupabase, { workspaceId: key.workspace_id, sourceUrl: args.source_url, userId: null, title: args.title, summary: args.summary, mimeType: args.mime_type, sharing: args.sharing, sourceSystem: args.source_system || key.name || "mcp", metadata: args.metadata });
    } else {
      const route = await resolveDirectMessageWorkspace(serviceSupabase, key, { senderPhone: args.sender_phone, messageChannel: args.message_channel, workspaceHint: args.workspace_hint });
      if (name === "search_library") { requireIntegrationScope(key.scopes, "journeys:read"); result = await searchIntegrationLibrary(serviceSupabase, route.workspaceId, String(args.query || ""), Number(args.limit || 20)); }
      else if (name === "list_journeys") { requireIntegrationScope(key.scopes, "journeys:read"); result = await listIntegrationJourneys(serviceSupabase, route.workspaceId, String(args.query || "")); }
      else if (name === "create_journey") { requireIntegrationScope(key.scopes, "journeys:write"); result = await createIntegrationJourney(serviceSupabase, route.workspaceId, args); }
      else if (name === "update_journey") { requireIntegrationScope(key.scopes, "journeys:write"); result = await updateIntegrationJourney(serviceSupabase, route.workspaceId, String(args.journey_id || ""), args); }
      else if (name === "archive_journey") { requireIntegrationScope(key.scopes, "journeys:write"); result = await archiveIntegrationJourney(serviceSupabase, route.workspaceId, String(args.journey_id || "")); }
      else return fail(id, -32602, "Unknown tool name.");
      args._resolved_workspace_id = route.workspaceId;
    }
    await recordActivity(serviceSupabase, { workspaceId: typeof args._resolved_workspace_id === "string" ? args._resolved_workspace_id : key.workspace_id, eventType: `mcp_${name}`, entityType: name.includes("journey") ? "journey" : "integration", surface: "mcp", metadata: { connectorId: key.id, directMessage: args.message_channel === "direct_message" } });
    return ok(id, { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: false });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error && typeof (error as any).status === "number" ? (error as any).status : 400;
    return fail(rpc?.id ?? null, status === 401 ? -32001 : -32000, error instanceof Error ? error.message : "MCP request failed.", status);
  }
}
function ok(id: Rpc["id"], result: unknown) { return NextResponse.json({ jsonrpc: "2.0", id, result }); }
function fail(id: Rpc["id"], code: number, message: string, status = 200) { return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status }); }
