import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getEmployeeWorkingSummary } from "@/lib/hr-repo";
import { usesSelfAttendance } from "@/lib/roles";

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesSelfAttendance(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const summary = await getEmployeeWorkingSummary(user.id);
  return NextResponse.json(summary);
}
