import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getAdminOverview } from "@/lib/hr-repo";
import { usesAdminPortal } from "@/lib/roles";

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesAdminPortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await getAdminOverview();
  return NextResponse.json(data);
}
