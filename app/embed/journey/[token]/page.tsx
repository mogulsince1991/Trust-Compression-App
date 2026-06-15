import { notFound } from "next/navigation";
import { JourneyViewer, type PublicJourney } from "@/components/journey-viewer";
import { createPublicSupabaseClient } from "@/lib/supabase";

type EmbedPageProps = {
  params: { token: string };
};

type JourneyRow = {
  id: string;
  title: string;
  heading: string | null;
  description: string | null;
  cta_label: string | null;
  cta_url: string | null;
};

type JourneyVideoRow = {
  video_id: string;
  position: number;
};

type JourneySendRow = {
  id: string;
  journey_id: string;
  contact_id: string | null;
  share_token: string;
};

export default async function EmbedJourneyPage({ params }: EmbedPageProps) {
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
    .from("journey_videos")
    .select("video_id,position")
    .eq("journey_id", row.id)
    .order("position", { ascending: true });

  if (sequenceError || !sequence?.length) notFound();

  const orderedRows = sequence as JourneyVideoRow[];
  const ids = orderedRows.map((item) => item.video_id);
  const { data: videos, error: videosError } = await supabase
    .from("videos")
    .select("id,title,summary,source_platform,source_url,embed_url,thumbnail_url,duration_seconds")
    .in("id", ids);

  if (videosError || !videos?.length) notFound();

  const videoMap = new Map((videos as PublicJourney["videos"]).map((video) => [video.id, video]));
  const orderedVideos = orderedRows.map((item) => videoMap.get(item.video_id)).filter(Boolean) as PublicJourney["videos"];

  if (!orderedVideos.length) notFound();

  return (
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
        videos: orderedVideos
      }}
    />
  );
}
