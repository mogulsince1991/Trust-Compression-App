"use client";

import {
  ArrowUpRight,
  Building2,
  Check,
  Copy,
  Import,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import type { DbVideo, LibraryAssetRow, LibraryFilters, SocialProfileRow, SourceRow, WorkspaceInviteRow, WorkspaceMemberRow, WorkspaceRow } from "@/components/trust-app-shared";
import {
  buildOptions,
  formatDateTime,
  formatPlatformLabel,
  formatSourceStatus,
  type SocialProfileDraft,
} from "@/components/trust-app-shared";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export type RoleId = "libraryManager" | "salesRep" | "owner" | "prospect";
export type ViewId = "sources" | "library" | "socialProfiles" | "tracking" | "journeys" | "metrics" | "workspace";

export type RoleDefinition = {
  label: string;
  title: string;
  description: string;
  view: ViewId;
  placeholder: string;
};

const noMagicLinkEmails = new Set(["admin@unmarked.media"]);

export function RoleGate({
  onChoose,
  roles,
}: {
  onChoose: (role: RoleId) => void;
  roles: Record<RoleId, RoleDefinition>;
}) {
  return (
    <main className="role-gate">
      <section className="gate-intro">
        <span>Trust Library</span>
        <h1>Choose your workspace.</h1>
        <p>Start with sources, then turn imported videos into proof journeys.</p>
      </section>
      <section className="role-grid">
        {(Object.keys(roles) as RoleId[]).map((id) => (
          <button className="role-card" key={id} onClick={() => onChoose(id)}>
            <span>{roles[id].label}</span>
            <h2>{roles[id].title}</h2>
            <p>{roles[id].description}</p>
            <i>
              Open <ArrowUpRight />
            </i>
          </button>
        ))}
      </section>
    </main>
  );
}

export function AuthGate({
  role,
  supabase,
  onBack,
}: {
  role: RoleDefinition;
  supabase: ReturnType<typeof createBrowserSupabaseClient>;
  onBack: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [sending, setSending] = useState(false);

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !email) return;
    if (noMagicLinkEmails.has(email.trim().toLowerCase())) {
      setIsError(true);
      setMessage("Use password login for this admin account. No magic-link email was sent.");
      return;
    }
    setSending(true);
    setIsError(false);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    setIsError(Boolean(error));
    setMessage(error ? error.message : "Check your email. The sign-in link has been sent.");
    setSending(false);
  }

  async function signInWithPassword() {
    if (!supabase || !email || !password) return;
    setSending(true);
    setIsError(false);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsError(Boolean(error));
    setMessage(error ? error.message : "Signed in. Opening your workspace...");
    setSending(false);
  }

  return (
    <main className="role-gate">
      <button className="text-button" onClick={onBack}>
        Back
      </button>
      <section className="gate-intro">
        <span>{role.label}</span>
        <h1>Sign in.</h1>
        <p>{role.description}</p>
      </section>
      <form className="prospect-brief" onSubmit={sendMagicLink}>
        <div className="brief-grid">
          <label className="wide-field">
            <span>Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required />
          </label>
          <label className="wide-field">
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password login" minLength={6} />
          </label>
        </div>
        <button className="wide-action" disabled={sending}>
          {sending ? <Loader2 className="spin" /> : <ArrowUpRight />}
          Send magic link
        </button>
        <button className="text-button" type="button" disabled={sending || !email || password.length < 6} onClick={signInWithPassword} style={{ marginTop: 12 }}>
          Sign in with password
        </button>
        {message && <p style={{ border: "1px solid rgba(255,255,255,.16)", color: isError ? "#ffd4d4" : "#e9e2d6", marginTop: 16, padding: "14px 16px" }}>{message}</p>}
      </form>
    </main>
  );
}

export function SourcesView({
  sources,
  importing,
  onImport,
  onReimport,
  onDelete,
}: {
  sources: SourceRow[];
  importing: boolean;
  onImport: (event: FormEvent<HTMLFormElement>) => void;
  onReimport: (source: SourceRow) => void;
  onDelete: (source: SourceRow) => void;
}) {
  return (
    <section className="sources-grid">
      <section className="browse">
        <div className="collection-top">
          <div>
            <span>Sources</span>
            <h1>Import public video sources</h1>
          </div>
          <p>YouTube works now. Public Drive folders work when GOOGLE_DRIVE_API_KEY is set in Vercel.</p>
        </div>
        <form className="prospect-brief" onSubmit={onImport}>
          <div className="brief-grid">
            <label className="wide-field">
              <span>Public source URL</span>
              <input name="sourceUrl" required placeholder="YouTube channel, playlist, video, or public Drive folder URL" />
            </label>
          </div>
          <button className="wide-action" disabled={importing}>
            {importing ? <Loader2 className="spin" /> : <Import />}
            Import source
          </button>
        </form>
      </section>
      <aside className="source-panel">
        <div className="mini-head">
          <span>Connected sources</span>
          <strong>{sources.length}</strong>
        </div>
        <div className="source-list">
          {sources.map((source) => (
            <article className="source-card" key={source.id}>
              <div className="source-card-copy">
                <div className="source-card-heading">
                  <span>{formatPlatformLabel(source.platform)}</span>
                  <strong>{source.account_label ?? formatPlatformLabel(source.platform)}</strong>
                </div>
                <div className="source-card-meta">
                  <small>{formatSourceStatus(source.status)}</small>
                  <small>{source.last_synced_at ? `Updated ${formatDateTime(source.last_synced_at)}` : "Waiting for first sync"}</small>
                </div>
                {source.error && <p>{source.error}</p>}
                <div className="source-stats">
                  <div>
                    <small>Imported</small>
                    <strong>{String(source.metadata?.imported ?? 0)}</strong>
                  </div>
                  <div>
                    <small>Updated</small>
                    <strong>{String(source.metadata?.updated ?? 0)}</strong>
                  </div>
                  <div>
                    <small>Flagged</small>
                    <strong>{String(source.metadata?.duplicateCandidates ?? 0)}</strong>
                  </div>
                </div>
              </div>
              <div className="source-card-actions">
                <button className="icon-mini" disabled={importing} onClick={() => onReimport(source)} aria-label="Reimport source">
                  <RefreshCw />
                </button>
                <button className="icon-mini danger" disabled={importing} onClick={() => onDelete(source)} aria-label="Delete source">
                  <Trash2 />
                </button>
              </div>
            </article>
          ))}
        </div>
      </aside>
    </section>
  );
}

export function WorkspaceView({
  workspace,
  workspaces,
  members,
  invites,
  canManage,
  working,
  createName,
  renameName,
  inviteDraft,
  onCreateNameChange,
  onRenameNameChange,
  onInviteDraftChange,
  onCreate,
  onRename,
  onInvite,
  onSwitch,
  onMemberRoleChange,
  onRemoveMember,
  onRevokeInvite,
}: {
  workspace: WorkspaceRow | null;
  workspaces: WorkspaceRow[];
  members: WorkspaceMemberRow[];
  invites: WorkspaceInviteRow[];
  canManage: boolean;
  working: boolean;
  createName: string;
  renameName: string;
  inviteDraft: { email: string; role: string };
  onCreateNameChange: (value: string) => void;
  onRenameNameChange: (value: string) => void;
  onInviteDraftChange: (draft: { email: string; role: string }) => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onRename: (event: FormEvent<HTMLFormElement>) => void;
  onInvite: (event: FormEvent<HTMLFormElement>) => void;
  onSwitch: (workspaceId: string) => void;
  onMemberRoleChange: (member: WorkspaceMemberRow, role: string) => void;
  onRemoveMember: (member: WorkspaceMemberRow) => void;
  onRevokeInvite: (invite: WorkspaceInviteRow) => void;
}) {
  const activeInvites = invites.filter((invite) => invite.status === "pending");

  return (
    <section className="workspace-management">
      <header className="workspace-hero">
        <div>
          <span>Company workspace</span>
          <h1>{workspace?.name ?? "Workspace"}</h1>
          <p>One shared home for the company library, journeys, attribution, CRM connections, and reporting.</p>
        </div>
        <div className="workspace-identity">
          <Building2 />
          <div><small>Workspace ID</small><strong>{workspace?.id ?? "Not ready"}</strong></div>
          <div><small>Your role</small><strong>{formatRole(workspace?.role ?? "member")}</strong></div>
        </div>
      </header>

      <section className="workspace-grid">
        <article className="workspace-panel">
          <div className="mini-head"><span>Available workspaces</span><strong>{workspaces.length}</strong></div>
          <div className="workspace-list">
            {workspaces.map((item) => (
              <button className={item.id === workspace?.id ? "workspace-list-item is-active" : "workspace-list-item"} key={item.id} onClick={() => onSwitch(item.id)}>
                <span><Building2 /></span>
                <div><strong>{item.name}</strong><small>{formatRole(item.role)} Â· {item.slug}</small></div>
                {item.id === workspace?.id && <Check />}
              </button>
            ))}
          </div>
          <form className="workspace-inline-form" onSubmit={onCreate}>
            <label><span>Create another workspace</span><input value={createName} onChange={(event) => onCreateNameChange(event.target.value)} placeholder="Company or client name" minLength={2} maxLength={80} required /></label>
            <button className="wide-action" disabled={working}><Plus />Create workspace</button>
          </form>
        </article>

        <article className="workspace-panel">
          <div className="mini-head"><span>Workspace settings</span><ShieldCheck /></div>
          <p>Owners and admins control the company name and team access. Workspace IDs stay permanent even when the name changes.</p>
          <form className="workspace-inline-form" onSubmit={onRename}>
            <label><span>Workspace name</span><input value={renameName} onChange={(event) => onRenameNameChange(event.target.value)} minLength={2} maxLength={80} disabled={!canManage} required /></label>
            <button className="wide-action" disabled={working || !canManage}><Check />Save name</button>
          </form>
          {!canManage && <p className="workspace-permission-note">Only workspace owners and admins can edit company settings or manage teammates.</p>}
        </article>
      </section>

      <section className="workspace-panel workspace-team-panel">
        <div className="mini-head"><span>Team members</span><strong>{members.length}</strong></div>
        <div className="workspace-member-list">
          {members.map((member) => (
            <article className="workspace-member" key={member.id}>
              <div className="workspace-avatar">{initials(member.displayName || member.email)}</div>
              <div className="workspace-member-copy"><strong>{member.displayName}</strong><small>{member.email}</small></div>
              {canManage && member.role !== "owner" ? (
                <select value={member.role} disabled={working} onChange={(event) => onMemberRoleChange(member, event.target.value)}>
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                  <option value="sales_rep">Sales rep</option>
                  <option value="library_manager">Library manager</option>
                  <option value="viewer">Viewer</option>
                </select>
              ) : <span className="workspace-role-pill">{formatRole(member.role)}</span>}
              {canManage && member.role !== "owner" && <button className="icon-mini danger" onClick={() => onRemoveMember(member)} aria-label={`Remove ${member.displayName}`}><Trash2 /></button>}
            </article>
          ))}
        </div>
      </section>

      {canManage && (
        <section className="workspace-grid">
          <article className="workspace-panel">
            <div className="mini-head"><span>Invite a teammate</span><UserPlus /></div>
            <form className="workspace-inline-form" onSubmit={onInvite}>
              <label><span>Email</span><input type="email" value={inviteDraft.email} onChange={(event) => onInviteDraftChange({ ...inviteDraft, email: event.target.value })} placeholder="teammate@company.com" required /></label>
              <label><span>Role</span><select value={inviteDraft.role} onChange={(event) => onInviteDraftChange({ ...inviteDraft, role: event.target.value })}>
                <option value="member">Member</option>
                <option value="sales_rep">Sales rep</option>
                <option value="library_manager">Library manager</option>
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select></label>
              <button className="wide-action" disabled={working}><UserPlus />Create invitation</button>
            </form>
          </article>

          <article className="workspace-panel">
            <div className="mini-head"><span>Pending invitations</span><strong>{activeInvites.length}</strong></div>
            <div className="workspace-invite-list">
              {activeInvites.length ? activeInvites.map((invite) => (
                <article className="workspace-invite" key={invite.id}>
                  <div><strong>{invite.email}</strong><small>{formatRole(invite.role)} Â· expires {invite.expiresAt ? formatDateTime(invite.expiresAt) : "soon"}</small></div>
                  <button className="icon-mini" onClick={() => void navigator.clipboard.writeText(invite.inviteUrl)} aria-label="Copy invitation link"><Copy /></button>
                  <button className="icon-mini danger" onClick={() => onRevokeInvite(invite)} aria-label="Revoke invitation"><X /></button>
                </article>
              )) : <div className="workspace-empty"><Users /><p>No pending invitations.</p></div>}
            </div>
          </article>
        </section>
      )}
    </section>
  );
}

export function LibraryFiltersBar({
  filters,
  options,
  onChange,
}: {
  filters: LibraryFilters;
  options: ReturnType<typeof buildOptions>;
  onChange: (filters: LibraryFilters) => void;
}) {
  return (
    <section className="filter-bar">
      <FilterSelect label="Source" value={filters.platform} options={options.platforms} onChange={(platform) => onChange({ ...filters, platform })} />
      <FilterSelect label="Date" value={filters.date} options={["last_7", "last_30", "older"]} labels={{ last_7: "Last 7 days", last_30: "Last 30 days", older: "Older" }} onChange={(date) => onChange({ ...filters, date })} />
      <FilterSelect label="Category" value={filters.category} options={options.categories} onChange={(category) => onChange({ ...filters, category })} />
      <FilterSelect label="Funnel" value={filters.funnelStage} options={options.funnelStages} onChange={(funnelStage) => onChange({ ...filters, funnelStage })} />
      <FilterSelect label="Proof" value={filters.proofType} options={options.proofTypes} onChange={(proofType) => onChange({ ...filters, proofType })} />
      <FilterSelect label="Offer" value={filters.offer} options={options.offers} onChange={(offer) => onChange({ ...filters, offer })} />
      <FilterSelect label="Buyer" value={filters.buyer} options={options.buyers} onChange={(buyer) => onChange({ ...filters, buyer })} />
      <button className="text-button compact" onClick={() => onChange({ platform: "all", category: "all", funnelStage: "all", proofType: "all", offer: "all", buyer: "all", date: "all" })}>
        Clear
      </button>
    </section>
  );
}

function FilterSelect({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  labels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="filter-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {labels?.[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SimpleGate({ title, body, onBack }: { title: string; body: string; onBack: () => void }) {
  return (
    <main className="role-gate">
      <button className="text-button" onClick={onBack}>
        Back
      </button>
      <section className="gate-intro">
        <span>Setup</span>
        <h1>{title}</h1>
        <p>{body}</p>
      </section>
    </main>
  );
}

export function mapSocialProfileRow(row: Record<string, any>): SocialProfileRow {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    userId: row.user_id ?? null,
    businessProfileId: row.business_profile_id ?? null,
    businessProfileLabel: row.business_profile_label ?? null,
    platform: row.platform ?? "other",
    username: row.username ?? null,
    profileUrl: row.profile_url ?? null,
    profileKey: row.profile_key ?? "",
    displayName: row.display_name ?? null,
    avatarUrl: row.avatar_url ?? null,
    latestCachedMetrics: row.latest_cached_metrics ?? null,
    lastAnalyzedAt: row.last_analyzed_at ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function mapLibraryAssetRow(row: Record<string, any>): LibraryAssetRow {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    assetType: row.asset_type,
    sourcePlatform: row.source_platform ?? "manual",
    title: row.title ?? "Untitled asset",
    sourceUrl: row.source_url ?? null,
    embedUrl: row.embed_url ?? null,
    thumbnailUrl: row.thumbnail_url ?? null,
    summary: row.summary ?? null,
    metadata: row.metadata ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    archivedAt: row.archived_at ?? null,
  };
}

export function mapWorkspaceRow(row: Record<string, any>): WorkspaceRow {
  return {
    id: String(row.id),
    name: row.name ?? "Workspace",
    slug: row.slug ?? "",
    role: row.role ?? "member",
    settings: row.settings ?? {},
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function mapWorkspaceInviteRow(row: Record<string, any>): WorkspaceInviteRow {
  return {
    id: String(row.id),
    email: row.email ?? "",
    role: row.role ?? "member",
    status: row.status ?? "pending",
    token: row.token ?? "",
    inviteUrl: row.inviteUrl ?? "",
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

export function mapWorkspaceMemberRow(row: Record<string, any>): WorkspaceMemberRow {
  return {
    id: String(row.id),
    userId: String(row.userId ?? row.user_id ?? ""),
    email: row.email ?? "Unknown user",
    displayName: row.displayName ?? row.display_name ?? row.email ?? "Member",
    role: row.role ?? "member",
    createdAt: row.createdAt ?? row.created_at ?? null,
    updatedAt: row.updatedAt ?? row.updated_at ?? null,
  };
}

function formatRole(role: string) {
  return role.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "TC";
}

export function rememberWorkspaceId(workspaceId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("trust-compression.workspace-id", workspaceId);
}

export function readRememberedWorkspaceId(workspaces: WorkspaceRow[]) {
  if (!workspaces.length) return null;
  if (typeof window === "undefined") return workspaces[0]?.id ?? null;
  const savedId = window.localStorage.getItem("trust-compression.workspace-id");
  return workspaces.find((workspace) => workspace.id === savedId)?.id ?? workspaces[0]?.id ?? null;
}

