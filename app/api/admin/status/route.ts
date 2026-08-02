import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/platform-admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { role } = await requirePlatformAdmin(request);
    return NextResponse.json({ isAdmin: true, role });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ isAdmin: false, error: error instanceof Error ? error.message : "Access check failed." }, { status });
  }
}
