import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import {
  createLeaveRequest,
  deleteOwnPendingLeaveRequest,
  updateOwnPendingLeaveRequest,
} from "@/lib/hr-repo";
import { usesEmployeePortal } from "@/lib/roles";

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesEmployeePortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const fromDate = String(body.fromDate ?? "");
  const toDate = String(body.toDate ?? "");
  const reason = String(body.reason ?? "").trim();

  if (!fromDate || !toDate || !reason) {
    return NextResponse.json(
      { error: "From date, to date and reason are required" },
      { status: 400 },
    );
  }

  try {
    const request = await createLeaveRequest({
      userId: user.id,
      fromDate,
      toDate,
      reason,
    });
    return NextResponse.json({ request }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Leave request failed" },
      { status: 400 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesEmployeePortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const requestId = String(body.requestId ?? "");
  const fromDate = String(body.fromDate ?? "");
  const toDate = String(body.toDate ?? "");
  const reason = String(body.reason ?? "").trim();
  if (!requestId || !fromDate || !toDate || !reason) {
    return NextResponse.json({ error: "requestId, fromDate, toDate and reason are required" }, { status: 400 });
  }
  try {
    const request = await updateOwnPendingLeaveRequest({
      userId: user.id,
      requestId,
      fromDate,
      toDate,
      reason,
    });
    return NextResponse.json({ request });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Leave request update failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesEmployeePortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const requestId = String(body.requestId ?? "");
  if (!requestId) {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }
  try {
    await deleteOwnPendingLeaveRequest({ userId: user.id, requestId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Leave request delete failed" },
      { status: 400 },
    );
  }
}
