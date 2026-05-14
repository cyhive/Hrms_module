import { NextRequest, NextResponse } from "next/server";
import { recordActivity } from "@/lib/activity-repo";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { hrUpdateApprovedMissPunchRequest } from "@/lib/hr-repo";
import { usesAdminPortal } from "@/lib/roles";

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesAdminPortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const requestId =
    typeof body === "object" && body !== null && "requestId" in body
      ? String((body as { requestId: unknown }).requestId)
      : "";
  const date =
    typeof body === "object" && body !== null && "date" in body
      ? String((body as { date: unknown }).date)
      : "";
  const typeRaw =
    typeof body === "object" && body !== null && "type" in body
      ? String((body as { type: unknown }).type)
      : "";
  const reason =
    typeof body === "object" && body !== null && "reason" in body
      ? String((body as { reason: unknown }).reason)
      : "";

  if (!requestId || !date || !reason.trim()) {
    return NextResponse.json({ error: "requestId, date and reason are required" }, { status: 400 });
  }
  if (typeRaw !== "punch-in" && typeRaw !== "punch-out") {
    return NextResponse.json({ error: "type must be punch-in or punch-out" }, { status: 400 });
  }

  try {
    const updated = await hrUpdateApprovedMissPunchRequest({
      requestId,
      date,
      type: typeRaw,
      reason,
      actor: { id: user.id, role: user.role },
    });
    void recordActivity({
      actorUserId: user.id,
      actorUsername: user.username,
      kind: "misspunch.hr-edit",
      message: `Updated approved miss punch (${requestId.slice(0, 8)}…)`,
    });
    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
