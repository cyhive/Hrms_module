import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { savePunch } from "@/lib/hr-repo";
import { usesSelfAttendance } from "@/lib/roles";

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesSelfAttendance(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const action = body.action as "in" | "out";
  if (!action || !["in", "out"].includes(action)) {
    return NextResponse.json({ error: "Invalid punch action" }, { status: 400 });
  }

  try {
    const attendance = await savePunch(user.id, action);
    return NextResponse.json({ attendance });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Punch failed" },
      { status: 400 },
    );
  }
}
