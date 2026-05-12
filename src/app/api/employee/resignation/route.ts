import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { usesEmployeePortal } from "@/lib/roles";
import { createResignationRequest, getMyOffboardingRequest, listMyAssignedAssets } from "@/lib/hr-repo";

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesEmployeePortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const request = await getMyOffboardingRequest(user.id);
  const assets = await listMyAssignedAssets(user.id);
  return NextResponse.json({ request, assets });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesEmployeePortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const lastWorkingDay =
    typeof body === "object" && body !== null && "lastWorkingDay" in body
      ? String((body as { lastWorkingDay: unknown }).lastWorkingDay)
      : "";
  const reason =
    typeof body === "object" && body !== null && "reason" in body
      ? String((body as { reason: unknown }).reason).trim()
      : "";

  if (!lastWorkingDay || !reason) {
    return NextResponse.json({ error: "Last working day and reason are required" }, { status: 400 });
  }

  try {
    const request = await createResignationRequest({ userId: user.id, lastWorkingDay, reason });
    return NextResponse.json({ request }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Resignation failed" },
      { status: 400 },
    );
  }
}

