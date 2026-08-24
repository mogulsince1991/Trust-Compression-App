import { NextResponse } from "next/server";
import { requireIntegrationKey, requireIntegrationScope } from "@/lib/server/integration-auth";
import { importLibrarySource } from "@/lib/server/library-import";

type JsonRpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, any> };

const tool = {
  name: "import_library_source",
  description: "Import a YouTube video/channel/playlist or save an embeddable Google Drive, Docs, Sheets, Slides, PDF, or cloud asset in the Trust Compression library.",
  inputSchema: {
    type: "object",
    properties: {
      source_url: { type: "string", description: "The public or shareable source URL selected by the connected software." },
      title: { type: "string", description: "Optional display title from the source system." },
      summary: { type: "string", description: "Optional sales context or description." },
      mime_type: { type: "string", description: "Optional MIME type, especially useful for Google Drive files." },
      sharing: { type: "string", enum: ["anyone_with_link", "public", "unverified"], description: "Whether an anonymous prospect can open the asset." },
      source_system: { type: "string", description: "Name of the calling software, such as Viktor." },
      metadata: { type: "object", description: "Optional non-sensitive source metadata." },
    },
    required: ["source_url"],
    additionalProperties: false,
  },
};

export async function GET() {
  return NextResponse.json({ name: "Trust Compression MCP", transport: "streamable-http", endpoint: "/mcp", tools: [tool.name] });
}

export async function POST(request: Request) {
  let rpc: JsonRpcRequest | null = null;
  try {
    rpc = (await request.json()) as JsonRpcRequest;
    const { serviceSupabase, key } = await requireIntegrationKey(request);
    const id = rpc.id ?? null;

    if (rpc.method === "initialize") {
      return rpcResult(id, { protocolVersion: "2025-03-26", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "trust-compression", version: "1.0.0" } });
    }
    if (rpc.method === "notifications/initialized") return new NextResponse(null, { status: 202 });
    if (rpc.method === "ping") return rpcResult(id, {});
    if (rpc.method === "tools/list") return rpcResult(id, { tools: [tool] });
    if (rpc.method !== "tools/call") return rpcError(id, -32601, `Method ${rpc.method ?? "unknown"} is not supported.`);
    if (rpc.params?.name !== tool.name) return rpcError(id, -32602, "Unknown tool name.");

    requireIntegrationScope(key.scopes, "library:import");
    const args = (rpc.params?.arguments ?? {}) as Record<string, any>;
    if (typeof args.source_url !== "string" || !args.source_url.trim()) return rpcError(id, -32602, "source_url is required.");

    const result = await importLibrarySource(serviceSupabase, {
      workspaceId: key.workspace_id,
      sourceUrl: args.source_url,
      userId: null,
      title: typeof args.title === "string" ? args.title : undefined,
      summary: typeof args.summary === "string" ? args.summary : undefined,
      mimeType: typeof args.mime_type === "string" ? args.mime_type : undefined,
      sharing: typeof args.sharing === "string" ? args.sharing : undefined,
      sourceSystem: typeof args.source_system === "string" ? args.source_system : key.name || "mcp",
      metadata: args.metadata && typeof args.metadata === "object" && !Array.isArray(args.metadata) ? args.metadata : undefined,
    });
    return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: false });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error && typeof (error as any).status === "number" ? (error as any).status : 400;
    return rpcError(rpc?.id ?? null, status === 401 ? -32001 : -32000, error instanceof Error ? error.message : "MCP request failed.", status);
  }
}

function rpcResult(id: JsonRpcRequest["id"], result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function rpcError(id: JsonRpcRequest["id"], code: number, message: string, status = 200) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status });
}

