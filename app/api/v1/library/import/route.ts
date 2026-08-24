import { NextResponse } from "next/server";
import { requireIntegrationKey, requireIntegrationScope } from "@/lib/server/integration-auth";
import { importLibrarySource } from "@/lib/server/library-import";

type ImportRequest = {
  workspace_id?: string;
  source_url?: string;
  title?: string;
  summary?: string;
  mime_type?: string;
  sharing?: string;
  source_system?: string;
  metadata?: Record<string, unknown>;
};

export async function POST(request: Request) {
  try {
    const { serviceSupabase, key } = await requireIntegrationKey(request);
    requireIntegrationScope(key.scopes, "library:import");
    const body = (await request.json()) as ImportRequest;
    const workspaceId = body.workspace_id?.trim() || key.workspace_id;
    if (workspaceId !== key.workspace_id) return NextResponse.json({ error: "This integration key cannot access that workspace." }, { status: 403 });
    if (!body.source_url?.trim()) return NextResponse.json({ error: "source_url is required." }, { status: 400 });

    const result = await importLibrarySource(serviceSupabase, {
      workspaceId,
      sourceUrl: body.source_url,
      userId: null,
      title: body.title,
      summary: body.summary,
      mimeType: body.mime_type,
      sharing: body.sharing,
      sourceSystem: body.source_system || key.name || "external_api",
      metadata: body.metadata,
    });
    return NextResponse.json(result);
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error && typeof (error as any).status === "number" ? (error as any).status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Library import failed." }, { status });
  }
}

