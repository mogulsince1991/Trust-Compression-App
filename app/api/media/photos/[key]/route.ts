import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase";
import { PHOTOS_BUCKET } from "@/lib/server/google-photos";

export const dynamic = "force-dynamic";

// Unguessable share capability, like a journey link. The underlying bucket stays private.
export async function GET(_request: Request, { params }: { params: { key: string } }) {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  if (!/^[a-f0-9]{64}$/.test(params.key)) return new Response("Not found", { status: 404, headers });
  const db = createServiceSupabaseClient();
  if (!db) return new Response("Unavailable", { status: 503, headers });
  const { data, error } = await db.from("library_assets").select("metadata,workspace_id").eq("metadata->>photoKey", params.key).maybeSingle();
  if (error || !data?.metadata?.storagePath || data.metadata.provider !== "google_photos") return new Response("Not found", { status: 404, headers });
  if (data.metadata.storagePath !== `${data.workspace_id}/${params.key}`) return new Response("Not found", { status: 404, headers });
  const signed = await db.storage.from(PHOTOS_BUCKET).createSignedUrl(data.metadata.storagePath, 300);
  if (signed.error || !signed.data) return new Response("Unavailable", { status: 503, headers });
  return NextResponse.redirect(signed.data.signedUrl, { status: 307, headers });
}
