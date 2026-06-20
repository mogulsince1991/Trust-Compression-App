"use client";

import {
  Archive,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Route,
  Save,
  Send,
  Share2,
  Trash2,
  Wand2
} from "lucide-react";
import { useState } from "react";
import {
  buildOptions,
  formatDuration,
  formatPlatformLabel,
  formatPublishedLabel,
  type ContactRow,
  type DbVideo,
  type FolderRow,
  type JourneyDraft,
  type JourneySummary,
  type SmartGroup,
  type VideoContext
} from "@/components/trust-app-shared";

export function LibraryConfigurator({
  videos,
  selected,
  saving,
  options,
  onSelect,
  onAdd,
  onArchive,
  onSaveContext
}: {
  videos: DbVideo[];
  selected: DbVideo | null;
  saving: boolean;
  options: ReturnType<typeof buildOptions>;
  onSelect: (video: DbVideo) => void;
  onAdd: (video: DbVideo) => void;
  onArchive: (video: DbVideo) => void;
  onSaveContext: (video: DbVideo, context: VideoContext) => void;
}) {
  if (!videos.length) {
    return (
      <section className="prospect-brief">
        <span>No videos yet</span>
        <h2>Start by importing a public source.</h2>
        <p>Paste a YouTube video or a public Drive folder to build the library.</p>
      </section>
    );
  }

  return (
    <section className="library-configurator">
      <div className="config-topline">
        <span>{videos.length} videos</span>
        <p>Browse the newest proof first, select a video, then shape the searchable context or add it to a journey.</p>
      </div>
      <section className="library-shelf">
        <section className="library-strip" aria-label="Video library selector">
          {videos.map((video) => (
            <button className={selected?.id === video.id ? "strip-card is-selected" : "strip-card"} key={video.id} onClick={() => onSelect(video)}>
              <span className="strip-thumb" style={{ backgroundImage: `url(${video.thumbnail_url ?? ""})` }} />
              <div className="strip-card-body">
                <strong>{video.title}</strong>
                <small>{video.sales_category ?? video.source_platform}</small>
                <small>{formatPublishedLabel(video)}</small>
              </div>
            </button>
          ))}
        </section>
      </section>
      <BottomPlayer selected={selected} saving={saving} options={options} onAdd={onAdd} onArchive={onArchive} onSaveContext={onSaveContext} />
    </section>
  );
}

export function JourneysView({
  journeys,
  folders,
  draftVideos,
  groups,
  videos,
  shareUrl,
  onEdit,
  onAdd
}: {
  journeys: JourneySummary[];
  folders: FolderRow[];
  draftVideos: DbVideo[];
  groups: SmartGroup[];
  videos: DbVideo[];
  shareUrl?: string;
  onEdit: (journey: JourneySummary) => void;
  onAdd: (video: DbVideo) => void;
}) {
  return (
    <section className="journey-workspace">
      <aside className="saved-journeys">
        <div className="mini-head">
          <span>Saved journeys</span>
          <strong>{journeys.length}</strong>
        </div>
        {journeys.map((journey) => (
          <article className="saved-journey" key={journey.id}>
            <div>
              <span>{folders.find((folder) => folder.id === journey.folderId)?.name ?? "Unfoldered"}</span>
              <strong>{journey.title}</strong>
              <small>
                {journey.videoIds.length} videos / {journey.isPublic ? "Published" : "Draft"}
              </small>
            </div>
            <button className="text-button compact" onClick={() => onEdit(journey)}>
              Edit
            </button>
          </article>
        ))}
      </aside>
      <SequenceView title={draftVideos.length ? "Current journey" : "Journey draft"} groups={groups} videos={draftVideos.length ? draftVideos : videos.slice(0, 6)} onAdd={onAdd} shareUrl={shareUrl} />
    </section>
  );
}

export function JourneyTray({
  draft,
  videos,
  working,
  shareUrl,
  contacts,
  selectedJourneyId,
  options,
  onDraftChange,
  onGenerate,
  onPublish,
  onMove,
  onRemove,
  onCreateContactShare
}: {
  draft: JourneyDraft;
  videos: DbVideo[];
  working: boolean;
  shareUrl: string;
  contacts: ContactRow[];
  selectedJourneyId: string | null;
  options: ReturnType<typeof buildOptions>;
  onDraftChange: (draft: JourneyDraft) => void;
  onGenerate: () => void;
  onPublish: () => void;
  onMove: (videoId: string, direction: -1 | 1) => void;
  onRemove: (videoId: string) => void;
  onCreateContactShare: (contact: { contactId?: string; name?: string; email?: string; company?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [contactId, setContactId] = useState("");
  const [contact, setContact] = useState({ name: "", email: "", company: "" });

  return (
    <aside className={open ? "journey-tray is-open" : "journey-tray"}>
      <button className="tray-tab" onClick={() => setOpen((current) => !current)}>
        <Route />
        <span>{videos.length} in journey</span>
      </button>
      <div className="tray-body">
        <Datalists options={options} />
        <div className="mini-head">
          <span>{selectedJourneyId ? "Edit journey" : "Draft journey"}</span>
          <button className="icon-mini" onClick={() => setOpen(false)} aria-label="Close journey tray">
            <ChevronDown />
          </button>
        </div>
        <label>
          <span>Title</span>
          <input value={draft.title} onChange={(event) => onDraftChange({ ...draft, title: event.target.value })} placeholder="Proof journey" />
        </label>
        <label>
          <span>Folder</span>
          <input list="folders" value={draft.folderName} onChange={(event) => onDraftChange({ ...draft, folderName: event.target.value })} placeholder="Pricing objections" />
        </label>
        <label>
          <span>Heading</span>
          <input value={draft.heading} onChange={(event) => onDraftChange({ ...draft, heading: event.target.value })} placeholder="A focused proof path." />
        </label>
        <label>
          <span>Description</span>
          <textarea value={draft.description} onChange={(event) => onDraftChange({ ...draft, description: event.target.value })} placeholder="What this journey helps the viewer understand." />
        </label>
        <div className="brief-grid">
          <label>
            <span>CTA</span>
            <input value={draft.ctaLabel} onChange={(event) => onDraftChange({ ...draft, ctaLabel: event.target.value })} />
          </label>
          <label>
            <span>CTA URL</span>
            <input value={draft.ctaUrl} onChange={(event) => onDraftChange({ ...draft, ctaUrl: event.target.value })} placeholder="https://..." />
          </label>
        </div>
        <div className="tray-list">
          {videos.map((video, index) => (
            <article className="tray-item" key={video.id}>
              <span>{index + 1}</span>
              <strong>{video.title}</strong>
              <button className="icon-mini" disabled={index === 0} onClick={() => onMove(video.id, -1)} aria-label="Move up">
                <ChevronUp />
              </button>
              <button className="icon-mini" disabled={index === videos.length - 1} onClick={() => onMove(video.id, 1)} aria-label="Move down">
                <ChevronDown />
              </button>
              <button className="icon-mini" onClick={() => onRemove(video.id)} aria-label="Remove video">
                <Trash2 />
              </button>
            </article>
          ))}
        </div>
        <div className="tray-actions">
          <button className="seed-button" disabled={working || !videos.length} onClick={onGenerate}>
            {working ? <Loader2 className="spin" /> : <Wand2 />}
            Generate
          </button>
          <button className="wide-action" disabled={working || !videos.length} onClick={onPublish}>
            {working ? <Loader2 className="spin" /> : <Share2 />}
            {selectedJourneyId ? "Update" : "Publish"}
          </button>
        </div>
        {selectedJourneyId && (
          <section className="contact-share">
            <span>Send to contact</span>
            <select value={contactId} onChange={(event) => setContactId(event.target.value)}>
              <option value="">New contact</option>
              {contacts.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name || item.email || "Unnamed"}
                </option>
              ))}
            </select>
            {!contactId && (
              <>
                <input value={contact.name} onChange={(event) => setContact({ ...contact, name: event.target.value })} placeholder="Contact name" />
                <input value={contact.email} onChange={(event) => setContact({ ...contact, email: event.target.value })} placeholder="email@company.com" />
                <input value={contact.company} onChange={(event) => setContact({ ...contact, company: event.target.value })} placeholder="Company" />
              </>
            )}
            <button className="seed-button" disabled={working} onClick={() => onCreateContactShare(contactId ? { contactId } : contact)}>
              <Send />
              Create link
            </button>
          </section>
        )}
        {shareUrl && (
          <a className="share-link" href={shareUrl} target="_blank" rel="noreferrer">
            {shareUrl}
          </a>
        )}
      </div>
    </aside>
  );
}

function BottomPlayer({
  selected,
  saving,
  options,
  onAdd,
  onArchive,
  onSaveContext
}: {
  selected: DbVideo | null;
  saving: boolean;
  options: ReturnType<typeof buildOptions>;
  onAdd: (video: DbVideo) => void;
  onArchive: (video: DbVideo) => void;
  onSaveContext: (video: DbVideo, context: VideoContext) => void;
}) {
  if (!selected) return null;

  return (
    <section className="library-player-dock">
      <div className="bottom-video">
        {selected.embed_url ? (
          <iframe src={selected.embed_url} title={selected.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
        ) : (
          <div style={{ backgroundImage: `url(${selected.thumbnail_url ?? ""})` }} />
        )}
      </div>
      <section className="bottom-context">
        <div className="mini-head">
          <span>{formatPlatformLabel(selected.source_platform)}</span>
          <div className="inline-actions">
            <button className="text-button compact" onClick={() => onAdd(selected)}>
              <Plus />
              Journey
            </button>
            <button className="text-button compact danger" onClick={() => onArchive(selected)}>
              <Archive />
              Archive
            </button>
          </div>
        </div>
        <div className="bottom-context-heading">
          <h2>{selected.title}</h2>
          <p>
            {formatPublishedLabel(selected)} / {formatDuration(selected.duration_seconds)}
          </p>
        </div>
        <ContextEditor key={selected.id} video={selected} saving={saving} options={options} onSave={onSaveContext} />
      </section>
    </section>
  );
}

function ContextEditor({
  video,
  saving,
  options,
  onSave
}: {
  video: DbVideo;
  saving: boolean;
  options: ReturnType<typeof buildOptions>;
  onSave: (video: DbVideo, context: VideoContext) => void;
}) {
  const context = video.metadata?.customContext ?? {};
  const [form, setForm] = useState<VideoContext>({
    notes: context.notes ?? "",
    targetBuyer: context.targetBuyer ?? "",
    objections: context.objections ?? "",
    offer: context.offer ?? "",
    suggestedUse: video.suggested_use ?? "",
    salesCategory: video.sales_category ?? video.proof_type ?? "Education",
    funnelStage: video.funnel_stage ?? video.buying_stage ?? "consideration",
    proofType: video.proof_type ?? video.sales_category ?? "",
    buyingStage: video.buying_stage ?? video.funnel_stage ?? "",
    tags: (video.tags ?? []).join(", ")
  });

  return (
    <form
      className="context-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(video, form);
      }}
    >
      <Datalists options={options} />
      <label className="wide-field">
        <span>Search context</span>
        <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="What this video proves, when to use it, and what a rep should search to find it." />
      </label>
      <div className="brief-grid compact-grid">
        <ContextInput label="Buyer" list="buyers" value={form.targetBuyer} onChange={(targetBuyer) => setForm({ ...form, targetBuyer })} />
        <ContextInput label="Objections" list="objections" value={form.objections} onChange={(objections) => setForm({ ...form, objections })} />
        <ContextInput label="Offer" list="offers" value={form.offer} onChange={(offer) => setForm({ ...form, offer })} />
        <ContextInput label="Use case" list="uses" value={form.suggestedUse} onChange={(suggestedUse) => setForm({ ...form, suggestedUse })} />
        <ContextInput label="Sales category" list="categories" value={form.salesCategory} onChange={(salesCategory) => setForm({ ...form, salesCategory })} />
        <ContextInput label="Funnel stage" list="funnelStages" value={form.funnelStage} onChange={(funnelStage) => setForm({ ...form, funnelStage })} />
      </div>
      <label className="wide-field">
        <span>Tags</span>
        <input list="tags" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="comma, separated, tags" />
      </label>
      <button className="wide-action" disabled={saving}>
        {saving ? <Loader2 className="spin" /> : <Save />}
        Save context
      </button>
    </form>
  );
}

function ContextInput({ label, list, value, onChange }: { label: string; list: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span>{label}</span>
      <input list={list} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Datalists({ options }: { options: ReturnType<typeof buildOptions> }) {
  const lists: Array<[string, string[]]> = [
    ["buyers", options.buyers],
    ["objections", options.objections],
    ["offers", options.offers],
    ["uses", options.uses],
    ["categories", options.categories],
    ["funnelStages", options.funnelStages],
    ["tags", options.tags],
    ["folders", options.folderNames]
  ];

  return (
    <>
      {lists.map(([id, values]) => (
        <datalist id={id} key={id}>
          {values.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
      ))}
    </>
  );
}

function SequenceView({
  title,
  videos,
  groups,
  onAdd,
  shareUrl
}: {
  title: string;
  videos: DbVideo[];
  groups: SmartGroup[];
  onAdd: (video: DbVideo) => void;
  shareUrl?: string;
}) {
  return (
    <section className="recommendation-board">
      <div className="mini-head">
        <span>{title}</span>
        {shareUrl && (
          <a className="text-link" href={shareUrl} target="_blank" rel="noreferrer">
            Open share link
          </a>
        )}
      </div>
      {groups.length > 0 && <SmartGroups groups={groups.slice(0, 3)} onSelect={() => undefined} onAdd={onAdd} compact />}
      <div>
        {videos.map((video, index) => (
          <div className="sequence-item" key={video.id}>
            <span>{index + 1}</span>
            <div>
              <strong>{video.title}</strong>
              <small>
                {video.sales_category ?? video.source_platform} / {formatDuration(video.duration_seconds)}
              </small>
            </div>
            <button className="icon-mini" onClick={() => onAdd(video)} aria-label={`Add ${video.title} to journey`}>
              <Plus />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function SmartGroups({
  groups,
  onSelect,
  onAdd,
  compact = false
}: {
  groups: SmartGroup[];
  onSelect: (video: DbVideo) => void;
  onAdd: (video: DbVideo) => void;
  compact?: boolean;
}) {
  return (
    <section className={compact ? "smart-groups is-compact" : "smart-groups"}>
      {groups.map((group) => (
        <article className="smart-group" key={group.key}>
          <div>
            <span>Recommended path</span>
            <h3>{group.title}</h3>
          </div>
          <div className="smart-strip">
            {group.videos.slice(0, 4).map((video) => (
              <button className="smart-video" key={video.id} onClick={() => onSelect(video)}>
                <span style={{ backgroundImage: `url(${video.thumbnail_url ?? ""})` }} />
                <strong>{video.title}</strong>
                <small>{video.funnel_stage ?? video.buying_stage ?? "Library"}</small>
                <i
                  onClick={(event) => {
                    event.stopPropagation();
                    onAdd(video);
                  }}
                >
                  <Plus />
                </i>
              </button>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}
