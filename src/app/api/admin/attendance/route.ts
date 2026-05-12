import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getAdminAttendance } from "@/lib/hr-repo";
import { usesAdminPortal } from "@/lib/roles";

function localIsoToday(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesAdminPortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const today = localIsoToday();
  const fromDate = searchParams.get("from") ?? today;
  const toDate = searchParams.get("to") ?? today;
  const nameQuery = searchParams.get("name") ?? "";

  try {
    const data = await getAdminAttendance({ fromDate, toDate, nameQuery });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 },
    );
  }
}
