import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { listEventsOverlappingMonth } from "@/lib/events-repo";
import { usesEmployeePortal } from "@/lib/roles";

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesEmployeePortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const yRaw = req.nextUrl.searchParams.get("year");
  const mRaw = req.nextUrl.searchParams.get("month");
  const year = yRaw ? parseInt(yRaw, 10) : new Date().getFullYear();
  const month = mRaw ? parseInt(mRaw, 10) : new Date().getMonth() + 1;
  if (!Number.isFinite(year) || year < 1970 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  const events = await listEventsOverlappingMonth(year, month, { visibleToRole: user.role });
  return NextResponse.json({ events });
}
