import { notFound } from "next/navigation";
import { HistoricalJourneyComparison } from "@/components/historical/journey-comparison";
import { JourneyViewer, type PublicJourney } from "@/components/journey-viewer";
import type { JourneyAssetType } from "@/lib/journey-embeds";
import { createPublicSupabaseClient } from "@/lib/supabase";

type SharePageProps = {
  params: { token: string };
  searchParams?: { player?: string; asset?: string };
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

export default async function SharePage({ params, searchParams }: SharePageProps) {
  const supabase = createPublicSupabaseClient();
  if (!supabase) notFound();

  let send: JourneySendRow | null = null;
  const { data: sendRow } = await supabase.from("journey_sends").select("id,journey_id,contact_id,share_token").eq("share_token", params.token).maybeSingle();
  send = (sendRow as JourneySendRow | null) ?? null;

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

  if (searchParams?.player === "june-13") {
    const videos = orderedAssets.filter(asset => asset.assetType === "video");
    const selected = videos.findIndex(asset => asset.id === searchParams.asset);
    const ordered = selected > 0 ? [...videos.slice(selected), ...videos.slice(0, selected)] : videos;
    if (!ordered.length) notFound();
    return <HistoricalJourneyComparison journey={{ ...row, videos: ordered.map(asset => ({
      id: asset.id, title: asset.title, summary: asset.summary, source_platform: asset.sourcePlatform,
      source_url: asset.sourceUrl, embed_url: asset.embedUrl && /^https?:\/\//i.test(asset.embedUrl) ? asset.embedUrl : null,
      thumbnail_url: asset.thumbnailUrl, duration_seconds: null
    })) }} />;
  }

  return (
    <JourneyViewer
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
  );
}
