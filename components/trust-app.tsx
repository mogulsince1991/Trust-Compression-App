"use client";

import {
  ArrowUpRight,
  Clapperboard,
  MoreHorizontal,
  Play,
  Plug,
  Route,
  Search,
  Settings,
  Sparkles,
  Users
} from "lucide-react";
import { useMemo, useState } from "react";
import { videos, type Video } from "@/lib/mock-data";

type RoleId = "libraryManager" | "salesRep" | "owner" | "prospect";
type ViewId = "library" | "prospects" | "journeys" | "sources";

const roles: Record<
  RoleId,
  {
    label: string;
    title: string;
    description: string;
    placeholder: string;
    collectionTitle: string;
    collectionMeta: string;
    view: ViewId;
    actions: [string, string, string][];
  }
> = {
  libraryManager: {
    label: "Library Manager",
    title: "Organize the proof library.",
    description: "Review imports, approve AI summaries, and keep every video easy to find.",
    placeholder: "Find imports, transcripts, missing tags, summaries...",
    collectionTitle: "All videos",
    collectionMeta: "128 indexed assets",
    view: "library",
    actions: [
      ["1", "Review new imports", "18 videos need summaries"],
      ["2", "Clean transcript gaps", "4 clips need attention"],
      ["3", "Approve sales tags", "Pricing, proof, process"]
    ]
  },
  salesRep: {
    label: "Sales Rep",
    title: "Send the right proof now.",
    description: "Create a prospect brief, review a recommended sequence, then share a clean trust journey.",
    placeholder: "Search by prospect concern, service, objection, or buying stage...",
    collectionTitle: "Kitchen remodel prospect",
    collectionMeta: "6 suggested videos",
    view: "prospects",
    actions: [
      ["1", "New prospect brief", "Kitchen remodel, pricing concern"],
      ["2", "Review sequence", "6 videos, 11 minutes"],
      ["3", "Share private link", "Ready before the call"]
    ]
  },
  owner: {
    label: "Owner",
    title: "See what proof is working.",
    description: "Understand which videos create confidence and what content should be produced next.",
    placeholder: "Find top assets, content gaps, team usage, objections...",
    collectionTitle: "Most useful proof",
    collectionMeta: "37 proof assets",
    view: "library",
    actions: [
      ["1", "Top trust assets", "Pricing explainer leads"],
      ["2", "Content gaps", "Financing video missing"],
      ["3", "Team usage", "23 journeys sent this week"]
    ]
  },
  prospect: {
    label: "Prospect",
    title: "Experience the proof.",
    description: "A private, distraction-free page that helps the buyer understand before the conversation.",
    placeholder: "Search within this journey...",
    collectionTitle: "What to watch before we talk",
    collectionMeta: "6 videos in sequence",
    view: "journeys",
    actions: [
      ["1", "Start with context", "Why this matters"],
      ["2", "Watch the sequence", "Proof, process, pricing"],
      ["3", "Take next step", "Book or reply"]
    ]
  }
};

const filters = ["All", "Testimonials", "Pricing", "Process", "Objections", "Founder"];

export function TrustApp() {
  const [roleId, setRoleId] = useState<RoleId>("libraryManager");
  const [view, setView] = useState<ViewId>("library");
  const [selected, setSelected] = useState<Video>(videos[0]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");

  const role = roles[roleId];

  const filteredVideos = useMemo(() => {
    return videos.filter((video) => {
      const matchesFilter =
        filter === "All" ||
        video.type === filter ||
        (filter === "Testimonials" && video.type === "Testimonial") ||
        (filter === "Objections" && video.tags.includes("Objection"));
      const haystack = [video.title, video.source, video.type, video.summary, video.use, ...video.tags]
        .join(" ")
        .toLowerCase();
      return matchesFilter && (!query || haystack.includes(query.toLowerCase()));
    });
  }, [filter, query]);

  function chooseRole(nextRole: RoleId) {
    setRoleId(nextRole);
    setView(roles[nextRole].view);
  }

  return (
    <div className="app">
      <aside className="side" aria-label="Workspace">
        <a className="mark" href="#" aria-label="Trust Library">T</a>
        <nav className="side-nav">
          <button className={view === "library" ? "icon-button is-active" : "icon-button"} onClick={() => setView("library")} aria-label="Library"><Clapperboard /></button>
          <button className={view === "prospects" ? "icon-button is-active" : "icon-button"} onClick={() => setView("prospects")} aria-label="Prospects"><Users /></button>
          <button className={view === "journeys" ? "icon-button is-active" : "icon-button"} onClick={() => setView("journeys")} aria-label="Journeys"><Route /></button>
          <button className={view === "sources" ? "icon-button is-active" : "icon-button"} onClick={() => setView("sources")} aria-label="Sources"><Plug /></button>
        </nav>
        <button className="icon-button" aria-label="Settings"><Settings /></button>
      </aside>

      <main className="stage">
        <header className="command-bar">
          <div className="brand-line"><span>Trust Library</span><strong>Acme Remodel</strong></div>
          <label className="command-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={role.placeholder} /></label>
          <button className="connect-button" onClick={() => setView("sources")}><Plug />Source</button>
        </header>

        <section className="role-strip" aria-label="User modes">
          {(Object.keys(roles) as RoleId[]).map((id) => (
            <button className={roleId === id ? "role-tab is-active" : "role-tab"} key={id} onClick={() => chooseRole(id)}>{roles[id].label}</button>
          ))}
        </section>

        <section className="role-context" aria-label="Current workflow">
          <div><span>{role.label}</span><h2>{role.title}</h2><p>{role.description}</p></div>
          <div className="role-actions">
            {role.actions.map(([number, title, detail]) => (
              <div className="role-action" key={title}><i>{number}</i><div><strong>{title}</strong><small>{detail}</small></div></div>
            ))}
          </div>
        </section>

        {view === "library" && (
          <section className="library-shell">
            <section className="browse">
              <div className="collection-top"><div><span>Library</span><h1>{role.collectionTitle}</h1></div><p>{role.collectionMeta}</p></div>
              <div className="context-row">
                {filters.map((item) => <button className={filter === item ? "pill is-active" : "pill"} key={item} onClick={() => setFilter(item)}>{item}</button>)}
              </div>
              <div className="media-wall">
                {filteredVideos.map((video) => (
                  <button className={selected.id === video.id ? "media-card is-selected" : "media-card"} key={video.id} onClick={() => setSelected(video)}>
                    <div className="thumb" style={{ backgroundImage: `url(${video.image})` }} />
                    <div className="card-copy"><div className="meta-line"><span>{video.type}</span><span>{video.duration}</span></div><h3>{video.title}</h3></div>
                  </button>
                ))}
              </div>
            </section>
            <Inspector selected={selected} />
          </section>
        )}

        {view === "prospects" && <ProspectWorkflow />}
        {view === "journeys" && <JourneyView />}
        {view === "sources" && <SourcesView />}
      </main>
    </div>
  );
}

function Inspector({ selected }: { selected: Video }) {
  return (
    <aside className="focus-panel" aria-label="Selected video">
      <div className="panel-top"><span>Selected</span><button className="icon-mini" aria-label="More"><MoreHorizontal /></button></div>
      <div className="preview-frame" style={{ backgroundImage: `url(${selected.image})` }}><button className="play-button" aria-label={`Play ${selected.title}`}><Play /></button></div>
      <div className="focus-copy"><div className="meta-line"><span>{selected.source}</span><span>{selected.duration}</span></div><h2>{selected.title}</h2><p>{selected.summary}</p></div>
      <div className="trust-tags">{selected.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
      <div className="ai-note"><span>Recommended use</span><p>{selected.use}</p></div>
    </aside>
  );
}

function ProspectWorkflow() {
  return (
    <>
      <div className="workflow-shell">
        <section className="prospect-brief">
          <div className="collection-top"><div><span>Prospect Brief</span><h1>Kitchen remodel lead</h1></div><p>New inquiry</p></div>
          <div className="brief-grid">
            <label><span>Service</span><input defaultValue="Kitchen remodel" /></label>
            <label><span>Stage</span><input defaultValue="Before estimate call" /></label>
            <label className="wide-field"><span>Notes</span><textarea defaultValue="Concerned about price range, timeline disruption, and whether the design process is clear." /></label>
            <label><span>Objection</span><input defaultValue="Budget anxiety" /></label>
            <label><span>Goal</span><input defaultValue="Create confidence before call" /></label>
          </div>
          <button className="wide-action"><Sparkles />Recommend trust journey</button>
        </section>
        <aside className="workflow-panel">
          <div className="panel-top"><span>Sales workflow</span><button className="icon-mini" aria-label="More"><MoreHorizontal /></button></div>
          <div className="workflow-steps">
            {["Capture context", "Review recommendation", "Share private link", "Watch activity"].map((step, index) => (
              <article className={index === 0 ? "workflow-step is-done" : index === 1 ? "workflow-step is-active" : "workflow-step"} key={step}>
                <i>{index + 1}</i><div><strong>{step}</strong><p>{index === 1 ? "Six videos selected for pricing and process confidence." : "Keep the rep moving without CRM overhead."}</p></div>
              </article>
            ))}
          </div>
        </aside>
      </div>
      <section className="recommendation-board"><div className="mini-head"><span>Recommended sequence</span><button className="text-button">Create journey <ArrowUpRight /></button></div><Sequence /></section>
    </>
  );
}

function JourneyView() {
  return (
    <section className="journey-board">
      <section className="share-preview"><div className="cover-strip">{videos.slice(0, 3).map((video) => <div className="cover-tile" key={video.id} style={{ backgroundImage: `url(${video.image})` }} />)}</div><div className="share-copy"><span>Private page</span><h1>Kitchen Remodel Confidence</h1><p>A calm sequence that explains pricing, process, project experience, and next steps.</p></div></section>
      <aside className="journey-list"><div className="mini-head"><span>Sequence</span><button className="text-button">Publish <ArrowUpRight /></button></div><Sequence /></aside>
    </section>
  );
}

function Sequence() {
  return <div>{videos.slice(0, 6).map((video, index) => <div className="sequence-item" key={video.id}><span>{index + 1}</span><div><strong>{video.title}</strong><small>{video.type} / {video.duration}</small></div></div>)}</div>;
}

function SourcesView() {
  const sources = [
    ["Instagram Business", "Reels, captions, thumbnails, dates, comments, and approved insights.", "Connected"],
    ["Facebook Pages", "Page videos, captions, thumbnails, engagement, and post metadata.", "Connect"],
    ["YouTube", "Channel videos, descriptions, transcripts, playlists, and public links.", "Connect"],
    ["Upload", "Private video files, transcripts, and finished production assets.", "Import"]
  ];

  return (
    <section className="sources-layout">
      <header><span>Sources</span><h1>Connect only the channels this business owns.</h1></header>
      <div className="source-stack">
        {sources.map(([title, description, action]) => (
          <article className={action === "Connected" ? "source-row is-connected" : "source-row"} key={title}><Plug /><div><h2>{title}</h2><p>{description}</p></div><button>{action}</button></article>
        ))}
      </div>
    </section>
  );
}
