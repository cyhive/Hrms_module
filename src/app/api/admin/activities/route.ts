import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { listRecentActivities } from "@/lib/activity-repo";
import { usesAdminPortal } from "@/lib/roles";

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesAdminPortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const raw = req.nextUrl.searchParams.get("limit");
  const limit = raw ? Math.min(200, Math.max(1, parseInt(raw, 10) || 80)) : 80;
  const activities = await listRecentActivities(limit);
  return NextResponse.json({ activities });
}
