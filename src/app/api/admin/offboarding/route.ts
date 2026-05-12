import { NextRequest, NextResponse } from "next/server";
import { recordActivity } from "@/lib/activity-repo";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { usesAdminPortal } from "@/lib/roles";
import {
  clearOffboardingAsset,
  createTerminationRequest,
  decideOffboardingRequest,
  listAdminAssets,
  listAdminOffboardingRequests,
  setOffboardingAssetAction,
} from "@/lib/hr-repo";

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesAdminPortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const offboarding = await listAdminOffboardingRequests();
  const assets = await listAdminAssets();
  return NextResponse.json({ offboarding, assets });
}

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

  const kind =
    typeof body === "object" && body !== null && "kind" in body
      ? String((body as { kind: unknown }).kind)
      : "";

  try {
    if (kind === "terminate") {
      const userId = String((body as any).userId ?? "").trim();
      const lastWorkingDay = String((body as any).lastWorkingDay ?? "").trim();
      const reason = String((body as any).reason ?? "").trim();
      if (!userId || !lastWorkingDay || !reason) {
        return NextResponse.json({ error: "userId, lastWorkingDay and reason are required" }, { status: 400 });
      }
      const request = await createTerminationRequest({ userId, lastWorkingDay, reason });
      void recordActivity({
        actorUserId: user.id,
        actorUsername: user.username,
        kind: "offboarding.terminate",
        message: `Created termination request for user ${userId.slice(0, 8)}…`,
      });
      return NextResponse.json({ request }, { status: 201 });
    }

    if (kind === "asset-action") {
      const requestId = String((body as any).requestId ?? "").trim();
      const assetId = String((body as any).assetId ?? "").trim();
      const actionRequired = String((body as any).actionRequired ?? "").trim();
      if (!requestId || !assetId || !["return", "pay"].includes(actionRequired)) {
        return NextResponse.json({ error: "Invalid asset action fields" }, { status: 400 });
      }
      const updated = await setOffboardingAssetAction({
        requestId,
        assetId,
        actionRequired: actionRequired as "return" | "pay",
      });
      return NextResponse.json({ request: updated });
    }

    if (kind === "asset-clear") {
      const requestId = String((body as any).requestId ?? "").trim();
      const assetId = String((body as any).assetId ?? "").trim();
      const clearAs = String((body as any).clearAs ?? "").trim();
      if (!requestId || !assetId || !["returned", "paid"].includes(clearAs)) {
        return NextResponse.json({ error: "Invalid asset clear fields" }, { status: 400 });
      }
      const updated = await clearOffboardingAsset({
        requestId,
        assetId,
        clearAs: clearAs as "returned" | "paid",
      });
      return NextResponse.json({ request: updated });
    }

    if (kind === "decide") {
      const requestId = String((body as any).requestId ?? "").trim();
      const decision = String((body as any).decision ?? "").trim();
      const decisionReason = String((body as any).decisionReason ?? "").trim();
      if (!requestId || !["approve", "reject"].includes(decision)) {
        return NextResponse.json({ error: "Invalid decision fields" }, { status: 400 });
      }
      const updated = await decideOffboardingRequest({
        requestId,
        decision: decision as "approve" | "reject",
        actor: { id: user.id, role: user.role },
        decisionReason: decisionReason || undefined,
      });
      void recordActivity({
        actorUserId: user.id,
        actorUsername: user.username,
        kind: "offboarding.decide",
        message: `${decision === "approve" ? "Approved" : "Rejected"} offboarding (${requestId.slice(0, 8)}…)`,
      });
      return NextResponse.json({ request: updated });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Request failed" },
      { status: 400 },
    );
  }
}

