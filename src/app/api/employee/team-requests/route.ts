import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getManagerTeamOverview } from "@/lib/hr-repo";

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || user.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const data = await getManagerTeamOverview(user.id);
  return NextResponse.json(data);
}

