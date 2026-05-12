import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import {
  createMissPunchRequest,
  deleteOwnPendingMissPunchRequest,
  updateOwnPendingMissPunchRequest,
} from "@/lib/hr-repo";
import { usesEmployeePortal } from "@/lib/roles";

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesEmployeePortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const date = String(body.date ?? "");
  const type = body.type as "punch-in" | "punch-out";
  const reason = String(body.reason ?? "").trim();

  if (!date || !type || !reason) {
    return NextResponse.json(
      { error: "Date, type and reason are required" },
      { status: 400 },
    );
  }

  if (!["punch-in", "punch-out"].includes(type)) {
    return NextResponse.json({ error: "Invalid miss punch type" }, { status: 400 });
  }

  const request = await createMissPunchRequest({
    userId: user.id,
    date,
    type,
    reason,
  });
  return NextResponse.json({ request }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesEmployeePortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const requestId = String(body.requestId ?? "");
  const date = String(body.date ?? "");
  const type = body.type as "punch-in" | "punch-out";
  const reason = String(body.reason ?? "").trim();
  if (!requestId || !date || !type || !reason) {
    return NextResponse.json({ error: "requestId, date, type and reason are required" }, { status: 400 });
  }
  if (!["punch-in", "punch-out"].includes(type)) {
    return NextResponse.json({ error: "Invalid miss punch type" }, { status: 400 });
  }
  try {
    const request = await updateOwnPendingMissPunchRequest({
      userId: user.id,
      requestId,
      date,
      type,
      reason,
    });
    return NextResponse.json({ request });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Miss punch request update failed" },
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
    await deleteOwnPendingMissPunchRequest({ userId: user.id, requestId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Miss punch request delete failed" },
      { status: 400 },
    );
  }
}
