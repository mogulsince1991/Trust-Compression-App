import { NextResponse } from "next/server";
import { createUserSupabaseClient } from "@/lib/supabase";

type RouteContext = {
  params: { id: string };
};

type SendRequest = {
  workspaceId?: string;
  contactId?: string;
  contact?: {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
  };
};

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in before creating journey links." }, { status: 401 });

    const body = (await request.json()) as SendRequest;
    const workspaceId = body.workspaceId?.trim();
    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });

    const supabase = createUserSupabaseClient(token);
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const { data: journey, error: journeyError } = await supabase.from("journeys").select("id,share_token").eq("id", params.id).eq("workspace_id", workspaceId).single();
    if (journeyError || !journey) return NextResponse.json({ error: journeyError?.message ?? "Journey was not found." }, { status: 404 });

    const contactId = body.contactId?.trim() || (body.contact ? await upsertContact(supabase, workspaceId, user.id, body.contact) : null);
    const { data: send, error: sendError } = await supabase
      .from("journey_sends")
      .insert({ workspace_id: workspaceId, journey_id: params.id, contact_id: contactId, sent_by: user.id })
      .select("id,share_token")
      .single();

    if (sendError || !send) return NextResponse.json({ error: sendError?.message ?? "Could not create journey link." }, { status: 500 });
    return NextResponse.json({ id: send.id, contactId, shareToken: send.share_token, shareUrl: `/share/${send.share_token}` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create journey send." }, { status: 400 });
  }
}

async function upsertContact(supabase: ReturnType<typeof createUserSupabaseClient>, workspaceId: string, userId: string, contact: NonNullable<SendRequest["contact"]>) {
  const email = contact.email?.trim().toLowerCase() || null;
  const payload = {
    workspace_id: workspaceId,
    name: contact.name?.trim() || null,
    email,
    phone: contact.phone?.trim() || null,
    company: contact.company?.trim() || null,
    crm_source: "manual",
    created_by: userId,
    updated_at: new Date().toISOString()
  };

  if (email) {
    const { data, error } = await supabase.from("contacts").upsert(payload, { onConflict: "workspace_id,email" }).select("id").single();
    if (error || !data) throw new Error(error?.message ?? "Could not save contact.");
    return data.id as string;
  }

  const { data, error } = await supabase.from("contacts").insert(payload).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Could not save contact.");
  return data.id as string;
}
