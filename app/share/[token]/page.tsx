import { ArrowRight, Play } from "lucide-react";
import { videos } from "@/lib/mock-data";

type SharePageProps = {
  params: {
    token: string;
  };
};

export default function SharePage({ params }: SharePageProps) {
  return (
    <main className="share-page">
      <section className="share-hero">
        <div>
          <span>Private journey</span>
          <h1>Kitchen Remodel Confidence</h1>
          <p>A calm sequence to help you understand pricing, process, project experience, and next steps before the conversation.</p>
        </div>
        <small>Share token: {params.token}</small>
      </section>

      <section className="share-sequence">
        {videos.slice(0, 6).map((video, index) => (
          <article className="share-video" key={video.id}>
            <div className="share-thumb" style={{ backgroundImage: `url(${video.image})` }}>
              <button aria-label={`Play ${video.title}`}><Play size={18} /></button>
            </div>
            <div>
              <span>{index + 1}. {video.type} / {video.duration}</span>
              <h2>{video.title}</h2>
              <p>{video.summary}</p>
            </div>
          </article>
        ))}
      </section>

      <a className="share-cta" href="mailto:sales@example.com">Continue the conversation <ArrowRight size={18} /></a>
    </main>
  );
}
