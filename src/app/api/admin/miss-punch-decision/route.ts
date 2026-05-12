import { NextRequest, NextResponse } from "next/server";
import { recordActivity } from "@/lib/activity-repo";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { decideMissPunchRequest } from "@/lib/hr-repo";
import { usesAdminPortal } from "@/lib/roles";

export async function POST(req: NextRequest) {
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
  const decisionRaw =
    typeof body === "object" && body !== null && "decision" in body
      ? String((body as { decision: unknown }).decision)
      : "";

  if (!requestId) {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }
  if (decisionRaw !== "approve" && decisionRaw !== "reject") {
    return NextResponse.json({ error: "decision must be approve or reject" }, { status: 400 });
  }

  try {
    const updated = await decideMissPunchRequest({
      requestId,
      decision: decisionRaw,
      actor: { id: user.id, role: user.role },
    });
    void recordActivity({
      actorUserId: user.id,
      actorUsername: user.username,
      kind: "misspunch.decision",
      message: `${decisionRaw === "approve" ? "Approved" : "Rejected"} miss punch (${requestId.slice(0, 8)}…)`,
    });
    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

