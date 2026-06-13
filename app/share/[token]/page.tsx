import { notFound } from "next/navigation";
import { JourneyViewer, type PublicJourney } from "@/components/journey-viewer";
import { createServiceSupabaseClient } from "@/lib/supabase";

type SharePageProps = {
  params: {
    token: string;
  };
};

type JoinedVideo = PublicJourney["videos"][number] | PublicJourney["videos"] | null;

type JourneyRow = {
  title: string;
  heading: string | null;
  description: string | null;
  cta_label: string | null;
  cta_url: string | null;
  journey_videos: Array<{
    position: number;
    videos: JoinedVideo;
  }>;
};

export default async function SharePage({ params }: SharePageProps) {
  const supabase = createServiceSupabaseClient();
  if (!supabase) notFound();

  const { data, error } = await supabase
    .from("journeys")
    .select(
      "title,heading,description,cta_label,cta_url,journey_videos(position,videos(id,title,summary,source_platform,source_url,embed_url,thumbnail_url,duration_seconds))"
    )
    .eq("share_token", params.token)
    .eq("is_public", true)
    .maybeSingle();

  if (error || !data) notFound();

  const row = data as unknown as JourneyRow;
  const videos = row.journey_videos
    .sort((a, b) => a.position - b.position)
    .flatMap((item) => {
      if (!item.videos) return [];
      return Array.isArray(item.videos) ? item.videos : [item.videos];
    });

  if (!videos.length) notFound();

  return (
    <JourneyViewer
      journey={{
        title: row.title,
        heading: row.heading,
        description: row.description,
        cta_label: row.cta_label,
        cta_url: row.cta_url,
        videos
      }}
    />
  );
}
