import { NextRequest, NextResponse } from "next/server";
import { recordActivity } from "@/lib/activity-repo";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { hrUpdateApprovedWfhRequest } from "@/lib/hr-repo";
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
  const fromDate =
    typeof body === "object" && body !== null && "fromDate" in body
      ? String((body as { fromDate: unknown }).fromDate)
      : "";
  const toDate =
    typeof body === "object" && body !== null && "toDate" in body
      ? String((body as { toDate: unknown }).toDate)
      : "";
  const reason =
    typeof body === "object" && body !== null && "reason" in body
      ? String((body as { reason: unknown }).reason)
      : "";

  if (!requestId || !fromDate || !toDate || !reason.trim()) {
    return NextResponse.json(
      { error: "requestId, fromDate, toDate and reason are required" },
      { status: 400 },
    );
  }

  try {
    const updated = await hrUpdateApprovedWfhRequest({
      requestId,
      fromDate,
      toDate,
      reason,
      actor: { id: user.id, role: user.role },
    });
    void recordActivity({
      actorUserId: user.id,
      actorUsername: user.username,
      kind: "wfh.hr-edit",
      message: `Updated approved WFH request (${requestId.slice(0, 8)}…)`,
    });
    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
