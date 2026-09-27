import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { JourneyViewer, type PublicJourney } from "@/components/journey-viewer";
import type { JourneyAssetType } from "@/lib/journey-embeds";
import { createPublicSupabaseClient } from "@/lib/supabase";

type EmbedPageProps = {
  params: { token: string };
  searchParams?: { background?: string; text?: string; transparent?: string };
};

type JourneyRow = {
  id: string;
  title: string;
  heading: string | null;
  description: string | null;
  cta_label: string | null;
  cta_url: string | null;
};

type JourneyAssetRow = {
  id: string;
  video_id: string | null;
  asset_type: JourneyAssetType;
  source_platform: string;
  title: string;
  source_url: string | null;
  embed_url: string | null;
  thumbnail_url: string | null;
  summary: string | null;
  note: string | null;
  position: number;
  metadata: Record<string, unknown> | null;
};

type JourneySendRow = {
  id: string;
  journey_id: string;
  contact_id: string | null;
  share_token: string;
};

export default async function EmbedJourneyPage({ params, searchParams = {} }: EmbedPageProps) {
  const color = (value: string | undefined, fallback: string) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  const background = searchParams.transparent === "1" ? "transparent" : color(searchParams.background, "#171b18");
  const text = color(searchParams.text, "#f4f2eb");
  const supabase = createPublicSupabaseClient();
  if (!supabase) notFound();

  const { data: sendRow } = await supabase
    .from("journey_sends")
    .select("id,journey_id,contact_id,share_token")
    .eq("share_token", params.token)
    .maybeSingle();
  const send = (sendRow as JourneySendRow | null) ?? null;

  const journeyQuery = supabase.from("journeys").select("id,title,heading,description,cta_label,cta_url").eq("is_public", true);
  const { data: journey, error: journeyError } = send
    ? await journeyQuery.eq("id", send.journey_id).maybeSingle()
    : await journeyQuery.eq("share_token", params.token).maybeSingle();

  if (journeyError || !journey) notFound();

  const row = journey as JourneyRow;
  const { data: sequence, error: sequenceError } = await supabase
    .from("journey_assets")
    .select("id,video_id,asset_type,source_platform,title,source_url,embed_url,thumbnail_url,summary,note,position,metadata")
    .eq("journey_id", row.id)
    .order("position", { ascending: true });

  if (sequenceError || !sequence?.length) notFound();

  const orderedAssets = (sequence as JourneyAssetRow[]).map((item) => ({
    id: item.id,
    videoId: item.video_id,
    assetType: item.asset_type,
    sourcePlatform: item.source_platform,
    title: item.title,
    sourceUrl: item.source_url,
    embedUrl: item.embed_url,
    thumbnailUrl: item.thumbnail_url,
    durationSeconds: null,
    summary: item.summary,
    note: item.note,
    position: item.position,
    metadata: item.metadata
  }));

  return (
    <div className="journey-embed-host" style={{ "--embed-bg": background, "--embed-text": text } as CSSProperties}>
    <JourneyViewer
      variant="embed"
      journey={{
        id: row.id,
        title: row.title,
        heading: row.heading,
        description: row.description,
        cta_label: row.cta_label,
        cta_url: row.cta_url,
        send_id: send?.id ?? null,
        contact_id: send?.contact_id ?? null,
        share_token: params.token,
        assets: orderedAssets
      }}
    />
    </div>
  );
}
