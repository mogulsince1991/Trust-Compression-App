import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/platform-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResourceRow = {
  id: string;
  workspace_id?: string | null;
  created_by?: string | null;
  user_id?: string | null;
  invited_by?: string | null;
  event_type?: string | null;
  status?: string | null;
  provider?: string | null;
  platform?: string | null;
  created_at?: string | null;
  occurred_at?: string | null;
  last_synced_at?: string | null;
  actor_user_id?: string | null;
  surface?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

type ActivityItem = {
  type: string;
  label: string;
  workspaceId: string | null;
  userId: string | null;
  occurredAt: string;
  source: "audit" | "historical";
};

export async function GET(request: Request) {
  try {
    const { role, serviceSupabase } = await requirePlatformAdmin(request);
    const url = new URL(request.url);
    const days = clamp(Number(url.searchParams.get("days") ?? 30), 1, 365);
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const [
      workspacesResult,
      membersResult,
      auditResult,
      journeysResult,
      videosResult,
      assetsResult,
      sourcesResult,
      linksResult,
      trackingResult,
      reportsResult,
      connectionsResult,
      invitesResult,
      socialResult,
      usersResult,
    ] = await Promise.all([
      serviceSupabase.from("workspaces").select("id,name,slug,created_at,updated_at").order("created_at", { ascending: false }),
      serviceSupabase.from("workspace_members").select("id,workspace_id,user_id,role,created_at"),
      serviceSupabase.from("app_activity_events").select("id,workspace_id,actor_user_id,event_type,entity_type,entity_id,surface,metadata,occurred_at").gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(1000),
      recent(serviceSupabase, "journeys", "id,workspace_id,created_by,created_at", since),
      recent(serviceSupabase, "videos", "id,workspace_id,created_by,created_at", since),
      recent(serviceSupabase, "library_assets", "id,workspace_id,created_by,created_at", since),
      recent(serviceSupabase, "sources", "id,workspace_id,platform,status,created_at,last_synced_at", since),
      recent(serviceSupabase, "tracking_links", "id,workspace_id,created_by,created_at", since),
      serviceSupabase.from("tracking_events").select("id,workspace_id,event_type,occurred_at,created_at").or(`occurred_at.gte.${since},created_at.gte.${since}`).order("created_at", { ascending: false }).limit(2000),
      recent(serviceSupabase, "contractor_report_runs", "id,workspace_id,created_by,status,created_at", since),
      serviceSupabase.from("connected_accounts").select("id,workspace_id,user_id,provider,status,created_at,updated_at"),
      recent(serviceSupabase, "workspace_invites", "id,workspace_id,invited_by,status,created_at", since),
      recent(serviceSupabase, "social_profiles", "id,workspace_id,user_id,platform,created_at", since),
      serviceSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    const queryError = [workspacesResult, membersResult, auditResult, journeysResult, videosResult, assetsResult, sourcesResult, linksResult, trackingResult, reportsResult, connectionsResult, invitesResult, socialResult]
      .find((result) => result.error)?.error;
    if (queryError) throw queryError;

    const workspaces = workspacesResult.data ?? [];
    const members = membersResult.data ?? [];
    const users = usersResult.data?.users ?? [];
    const userMap = new Map(users.map((user) => [user.id, user.email ?? "Unknown user"]));
    const workspaceMap = new Map(workspaces.map((workspace) => [workspace.id, workspace.name]));

    const resourceSets = [
      resource("journey_created", "Journey created", journeysResult.data),
      resource("video_imported", "Video imported", videosResult.data),
      resource("asset_added", "Library asset added", assetsResult.data),
      resource("source_connected", "Source added", sourcesResult.data),
      resource("tracking_link_created", "Tracking link created", linksResult.data),
      resource("report_generated", "Contractor report generated", reportsResult.data),
      resource("workspace_invite_created", "Workspace invitation created", invitesResult.data),
      resource("social_profile_saved", "Social profile saved", socialResult.data),
    ];

    const auditItems: ActivityItem[] = (auditResult.data ?? []).map((row: ResourceRow) => ({
      type: row.event_type ?? "activity",
      label: humanize(row.event_type ?? "activity"),
      workspaceId: row.workspace_id ?? null,
      userId: row.actor_user_id ?? null,
      occurredAt: row.occurred_at ?? new Date().toISOString(),
      source: "audit",
    }));
    const historicalItems = resourceSets.flat();
    const timeline = dedupe([...auditItems, ...historicalItems])
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
      .slice(0, 300)
      .map((item) => ({
        ...item,
        workspaceName: item.workspaceId ? workspaceMap.get(item.workspaceId) ?? "Unknown workspace" : "Platform",
        userEmail: item.userId ? userMap.get(item.userId) ?? "Unknown user" : "System / public",
      }));

    const trackingRows = trackingResult.data ?? [];
    const activeUserIds = new Set<string>();
    auditItems.forEach((item) => item.userId && activeUserIds.add(item.userId));
    historicalItems.forEach((item) => item.userId && activeUserIds.add(item.userId));
    users.forEach((user) => user.last_sign_in_at && user.last_sign_in_at >= since && activeUserIds.add(user.id));

    const dailyMap = new Map<string, { date: string; users: Set<string>; events: number; journeyOpens: number }>();
    for (let index = days - 1; index >= 0; index -= 1) {
      const date = new Date(Date.now() - index * 86400000).toISOString().slice(0, 10);
      dailyMap.set(date, { date, users: new Set(), events: 0, journeyOpens: 0 });
    }
    timeline.forEach((item) => {
      const bucket = dailyMap.get(item.occurredAt.slice(0, 10));
      if (!bucket) return;
      bucket.events += 1;
      if (item.userId) bucket.users.add(item.userId);
    });
    trackingRows.forEach((row: ResourceRow) => {
      const when = row.occurred_at ?? row.created_at;
      const bucket = when ? dailyMap.get(when.slice(0, 10)) : null;
      if (bucket && ["opened", "journey_opened"].includes(row.event_type ?? "")) bucket.journeyOpens += 1;
    });

    const workspaceRows = workspaces.map((workspace) => {
      const workspaceId = workspace.id;
      const relevant = timeline.filter((item) => item.workspaceId === workspaceId);
      const accountRows = (connectionsResult.data ?? []).filter((row) => row.workspace_id === workspaceId);
      return {
        id: workspaceId,
        name: workspace.name,
        slug: workspace.slug,
        members: members.filter((row) => row.workspace_id === workspaceId).length,
        activeUsers: new Set(relevant.map((item) => item.userId).filter(Boolean)).size,
        events: relevant.length,
        journeys: (journeysResult.data ?? []).filter((row) => row.workspace_id === workspaceId).length,
        imports: (videosResult.data ?? []).filter((row) => row.workspace_id === workspaceId).length,
        reports: (reportsResult.data ?? []).filter((row) => row.workspace_id === workspaceId).length,
        trackingEvents: trackingRows.filter((row) => row.workspace_id === workspaceId).length,
        connectedAccounts: accountRows.length,
        integrationIssues: accountRows.filter((row) => !["connected", "active"].includes(String(row.status).toLowerCase())).length,
        lastActiveAt: relevant[0]?.occurredAt ?? workspace.updated_at ?? workspace.created_at,
        createdAt: workspace.created_at,
      };
    }).sort((a, b) => Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt));

    const featureUsage = [
      { label: "Video imports", value: videosResult.data?.length ?? 0 },
      { label: "Journeys created", value: journeysResult.data?.length ?? 0 },
      { label: "Journey / link events", value: trackingRows.length },
      { label: "Reports generated", value: reportsResult.data?.length ?? 0 },
      { label: "Library assets", value: assetsResult.data?.length ?? 0 },
      { label: "Social profiles", value: socialResult.data?.length ?? 0 },
    ].sort((a, b) => b.value - a.value);

    return NextResponse.json({
      role,
      generatedAt: new Date().toISOString(),
      range: { days, since },
      summary: {
        totalUsers: users.length,
        activeUsers: activeUserIds.size,
        totalWorkspaces: workspaces.length,
        activeWorkspaces: workspaceRows.filter((row) => row.events > 0).length,
        journeysCreated: journeysResult.data?.length ?? 0,
        videosImported: videosResult.data?.length ?? 0,
        reportRuns: reportsResult.data?.length ?? 0,
        trackingEvents: trackingRows.length,
        integrationIssues: workspaceRows.reduce((sum, row) => sum + row.integrationIssues, 0),
      },
      daily: Array.from(dailyMap.values()).map((bucket) => ({ date: bucket.date, users: bucket.users.size, events: bucket.events, journeyOpens: bucket.journeyOpens })),
      featureUsage,
      workspaces: workspaceRows,
      users: users.map((user) => ({
        id: user.id,
        email: user.email ?? "Unknown user",
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at,
        workspaceCount: new Set(members.filter((row) => row.user_id === user.id).map((row) => row.workspace_id)).size,
      })).sort((a, b) => Date.parse(b.lastSignInAt ?? b.createdAt) - Date.parse(a.lastSignInAt ?? a.createdAt)),
      timeline,
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Platform activity could not be loaded." }, { status });
  }
}

function recent(client: any, table: string, columns: string, since: string) {
  return client.from(table).select(columns).gte("created_at", since).order("created_at", { ascending: false }).limit(2000);
}

function resource(type: string, label: string, rows: ResourceRow[] | null): ActivityItem[] {
  return (rows ?? []).map((row) => ({
    type,
    label,
    workspaceId: row.workspace_id ?? null,
    userId: row.created_by ?? row.user_id ?? row.invited_by ?? null,
    occurredAt: row.created_at ?? row.last_synced_at ?? new Date().toISOString(),
    source: "historical",
  }));
}

function dedupe(items: ActivityItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.type}:${item.workspaceId}:${item.userId}:${item.occurredAt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? Math.round(value) : minimum));
}

