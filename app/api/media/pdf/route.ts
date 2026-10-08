import { NextResponse } from "next/server";
import { createPublicSupabaseClient, createUserSupabaseClient } from "@/lib/supabase";
import { allowedPdfSource } from "@/lib/pdf-source";

export const dynamic = "force-dynamic";
const MAX_BYTES = 25 * 1024 * 1024;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const assetId = params.get("asset") || "";
  const token = params.get("token");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer /i, "");
  if (!/^[\da-f-]{36}$/i.test(assetId)) return new NextResponse("Document not found", { status: 404 });
  const client = bearer && !token ? createUserSupabaseClient(bearer) : createPublicSupabaseClient();
  if (!client) return new NextResponse("Unavailable", { status: 503 });
  const { data: asset } = await client.from("journey_assets").select("journey_id,source_url,embed_url,asset_type").eq("id", assetId).maybeSingle();
  if (!asset || asset.asset_type !== "pdf") return new NextResponse("Document not found", { status: 404 });
  const { data: journey } = await client.from("journeys").select("id,workspace_id,is_public,share_token").eq("id", asset.journey_id).is("deleted_at", null).maybeSingle();
  if (!journey) return new NextResponse("Document not found", { status: 404 });
  if (token) {
    if (!journey.is_public) return new NextResponse("Document not found", { status: 404 });
    if (journey.share_token !== token) {
      const { data: send } = await client.from("journey_sends").select("id").eq("journey_id", journey.id).eq("share_token", token).maybeSingle();
      if (!send) return new NextResponse("Document not found", { status: 404 });
    }
  } else {
    if (!bearer) return new NextResponse("Sign in required", { status: 401 });
    const { data: { user } } = await client.auth.getUser(bearer);
    if (!user) return new NextResponse("Sign in required", { status: 401 });
    const { data: member } = await client.from("workspace_members").select("user_id").eq("workspace_id", journey.workspace_id).eq("user_id", user.id).maybeSingle();
    if (!member) return new NextResponse("Document not found", { status: 404 });
  }
  let url = asset.source_url || asset.embed_url;
  const storage = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://boswlaonbdxugkocquzv.supabase.co";
  if (!allowedPdfSource(url, storage)) return new NextResponse("Use direct source", { status: 422 });
  try {
    const signal = AbortSignal.timeout(20000);
    for (let redirects = 0; redirects <= 3; redirects++) {
      if (!allowedPdfSource(url, storage)) throw Error("Unsupported redirect");
      const response = await fetch(url, { redirect: "manual", cache: "no-store", signal });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) throw Error("Missing redirect");
        url = new URL(location, url).href;
        continue;
      }
      if (!response.ok || !response.body) throw Error("Source unavailable");
      if (Number(response.headers.get("content-length")) > MAX_BYTES) { await response.body.cancel(); return new NextResponse("PDF too large", { status: 413 }); }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (size < 1024) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) { await reader.cancel(); return new NextResponse("PDF too large", { status: 413 }); }
        chunks.push(value);
      }
      const data = Buffer.concat(chunks);
      if (!data.subarray(0, 1024).includes(Buffer.from("%PDF-"))) { await reader.cancel(); throw Error("Not a PDF"); }
      const body = new ReadableStream({
        start(controller) { controller.enqueue(data); },
        async pull(controller) {
          try {
            const { done, value } = await reader.read();
            if (done) { controller.close(); return; }
            size += value.byteLength;
            if (size > MAX_BYTES) { await reader.cancel(); controller.error(Error("PDF too large")); return; }
            controller.enqueue(value);
          } catch (error) { controller.error(error); }
        },
        cancel() { return reader.cancel(); }
      });
      return new NextResponse(body, { headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }
    throw Error("Too many redirects");
  } catch { return NextResponse.json({ error: "The source PDF is unavailable or its link has expired." }, { status: 502 }); }
}
