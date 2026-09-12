import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeJourneyEmbed } from "@/lib/journey-embeds";

type AssetInput = { video_id?: string; library_asset_id?: string; source_url?: string; title?: string; note?: string };

export async function searchIntegrationLibrary(supabase: SupabaseClient, workspaceId: string, query: string, limit = 20) {
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const term = query.trim().replace(/[,%()]/g, " ").slice(0, 120);
  const [videos, assets] = await Promise.all([
    supabase.from("videos").select("id,title,summary,proof_type,buying_stage,tags,source_platform,source_url,thumbnail_url").eq("workspace_id", workspaceId).is("archived_at", null).or(`title.ilike.%${term}%,summary.ilike.%${term}%,proof_type.ilike.%${term}%`).limit(safeLimit),
    supabase.from("library_assets").select("id,title,summary,asset_type,source_platform,source_url,thumbnail_url,metadata").eq("workspace_id", workspaceId).is("archived_at", null).or(`title.ilike.%${term}%,summary.ilike.%${term}%`).limit(safeLimit),
  ]);
  if (videos.error) throw videos.error;
  if (assets.error) throw assets.error;
  return [...(videos.data ?? []).map((row) => ({ ...row, kind: "video", video_id: row.id })), ...(assets.data ?? []).map((row) => ({ ...row, kind: "library_asset", library_asset_id: row.id }))].slice(0, safeLimit);
}

export async function listIntegrationJourneys(supabase: SupabaseClient, workspaceId: string, query = "") {
  let request = supabase.from("journeys").select("id,title,heading,description,is_public,share_token,created_at,updated_at,journey_assets(id,video_id,library_asset_id,title,position)").eq("workspace_id", workspaceId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(50);
  if (query.trim()) request = request.ilike("title", `%${query.trim()}%`);
  const { data, error } = await request;
  if (error) throw error;
  return data ?? [];
}

export async function createIntegrationJourney(supabase: SupabaseClient, workspaceId: string, input: Record<string, any>) {
  const assets = await resolveAssets(supabase, workspaceId, Array.isArray(input.assets) ? input.assets : []);
  if (!assets.length) throw new Error("At least one valid library asset is required.");
  const { data: journey, error } = await supabase.from("journeys").insert({ workspace_id: workspaceId, title: String(input.title || "Untitled journey").trim(), heading: String(input.heading || input.title || "A focused proof journey").trim(), description: clean(input.description), cta_label: clean(input.cta_label) || "Continue the conversation", cta_url: clean(input.cta_url), cover_url: assets[0]?.thumbnail_url ?? null, is_public: input.publish === true, published_at: input.publish === true ? new Date().toISOString() : null }).select("id,title,share_token,is_public").single();
  if (error || !journey) throw error ?? new Error("Could not create journey.");
  const { error: assetError } = await supabase.from("journey_assets").insert(assets.map((asset, index) => ({ ...asset, journey_id: journey.id, position: index + 1 })));
  if (assetError) throw assetError;
  return { ...journey, share_url: `/share/${journey.share_token}`, asset_count: assets.length };
}

export async function updateIntegrationJourney(supabase: SupabaseClient, workspaceId: string, journeyId: string, input: Record<string, any>) {
  if (!journeyId.trim()) throw new Error("journey_id is required.");
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) patch.title = String(input.title).trim() || "Untitled journey";
  if (input.heading !== undefined) patch.heading = String(input.heading).trim() || "A focused proof journey";
  if (input.description !== undefined) patch.description = clean(input.description);
  if (input.cta_label !== undefined) patch.cta_label = clean(input.cta_label) || "Continue the conversation";
  if (input.cta_url !== undefined) patch.cta_url = clean(input.cta_url);
  if (input.publish !== undefined) { patch.is_public = input.publish === true; patch.published_at = input.publish === true ? new Date().toISOString() : null; }
  const { data, error } = await supabase.from("journeys").update(patch).eq("id", journeyId).eq("workspace_id", workspaceId).is("deleted_at", null).select("id,title,share_token,is_public").single();
  if (error || !data) throw error ?? new Error("Journey was not found.");
  if (Array.isArray(input.assets)) {
    const assets = await resolveAssets(supabase, workspaceId, input.assets);
    const { error: deleteError } = await supabase.from("journey_assets").delete().eq("journey_id", journeyId);
    if (deleteError) throw deleteError;
    if (assets.length) { const { error: assetError } = await supabase.from("journey_assets").insert(assets.map((asset, index) => ({ ...asset, journey_id: journeyId, position: index + 1 }))); if (assetError) throw assetError; }
  }
  return { ...data, share_url: `/share/${data.share_token}` };
}

export async function archiveIntegrationJourney(supabase: SupabaseClient, workspaceId: string, journeyId: string) {
  if (!journeyId.trim()) throw new Error("journey_id is required.");
  const { data, error } = await supabase.from("journeys").update({ deleted_at: new Date().toISOString(), is_public: false, updated_at: new Date().toISOString() }).eq("id", journeyId).eq("workspace_id", workspaceId).is("deleted_at", null).select("id,title").single();
  if (error || !data) throw error ?? new Error("Journey was not found.");
  return data;
}

async function resolveAssets(supabase: SupabaseClient, workspaceId: string, inputs: AssetInput[]) {
  const results: Record<string, unknown>[] = [];
  for (const input of inputs.slice(0, 50)) {
    if (input.video_id) {
      const { data } = await supabase.from("videos").select("id,title,source_platform,source_url,embed_url,thumbnail_url,summary,metadata").eq("workspace_id", workspaceId).eq("id", input.video_id).is("archived_at", null).maybeSingle();
      if (data) results.push({ library_asset_id: null, video_id: data.id, asset_type: "video", source_platform: data.source_platform, title: data.title, source_url: data.source_url, embed_url: data.embed_url || data.source_url, thumbnail_url: data.thumbnail_url, summary: data.summary, note: clean(input.note), metadata: data.metadata ?? {} });
    } else if (input.library_asset_id) {
      const { data } = await supabase.from("library_assets").select("id,title,asset_type,source_platform,source_url,embed_url,thumbnail_url,summary,metadata").eq("workspace_id", workspaceId).eq("id", input.library_asset_id).is("archived_at", null).maybeSingle();
      if (data) results.push({ library_asset_id: data.id, video_id: null, asset_type: data.asset_type, source_platform: data.source_platform, title: data.title, source_url: data.source_url, embed_url: data.embed_url, thumbnail_url: data.thumbnail_url, summary: data.summary, note: clean(input.note), metadata: data.metadata ?? {} });
    } else if (input.source_url) {
      const value = normalizeJourneyEmbed({ url: input.source_url, title: input.title || "" });
      results.push({ library_asset_id: null, video_id: null, asset_type: value.assetType, source_platform: value.sourcePlatform, title: value.title, source_url: value.sourceUrl, embed_url: value.embedUrl, thumbnail_url: value.thumbnailUrl, summary: null, note: clean(input.note), metadata: value.metadata });
    }
  }
  return results;
}

function clean(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
