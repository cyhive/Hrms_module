import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import {
  decideLeaveRequest,
  decideMissPunchRequest,
  decideOffboardingRequest,
  decideWfhRequest,
} from "@/lib/hr-repo";

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || user.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const kind =
    typeof body === "object" && body !== null && "kind" in body
      ? String((body as { kind: unknown }).kind)
      : "";
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
  if (!["leave", "wfh", "miss-punch", "resignation"].includes(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  if (decisionRaw !== "approve" && decisionRaw !== "reject") {
    return NextResponse.json({ error: "decision must be approve or reject" }, { status: 400 });
  }

  try {
    const actor = { id: user.id, role: user.role };
    const updated =
      kind === "leave"
        ? await decideLeaveRequest({ requestId, decision: decisionRaw, actor })
        : kind === "wfh"
          ? await decideWfhRequest({ requestId, decision: decisionRaw, actor })
          : kind === "miss-punch"
            ? await decideMissPunchRequest({ requestId, decision: decisionRaw, actor })
            : await decideOffboardingRequest({ requestId, decision: decisionRaw, actor });
    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

