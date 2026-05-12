import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getAdminDashboardStats } from "@/lib/hr-repo";
import { usesAdminPortal } from "@/lib/roles";

export async function GET(_req: NextRequest) {
  const user = await getCurrentUserFromRequest(_req);
  if (!user || !usesAdminPortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const stats = await getAdminDashboardStats();
  return NextResponse.json(stats);
}
