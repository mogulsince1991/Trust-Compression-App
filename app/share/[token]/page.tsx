import { notFound } from "next/navigation";
import { JourneyViewer, type PublicJourney } from "@/components/journey-viewer";
import { createPublicSupabaseClient } from "@/lib/supabase";

type SharePageProps = {
  params: {
    token: string;
  };
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

export default async function SharePage({ params }: SharePageProps) {
  const supabase = createPublicSupabaseClient();
  if (!supabase) notFound();

  const { data: journey, error: journeyError } = await supabase
    .from("journeys")
    .select("id,title,heading,description,cta_label,cta_url")
    .eq("share_token", params.token)
    .eq("is_public", true)
    .maybeSingle();

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
      journey={{
        title: row.title,
        heading: row.heading,
        description: row.description,
        cta_label: row.cta_label,
        cta_url: row.cta_url,
        videos: orderedVideos
      }}
    />
  );
}
