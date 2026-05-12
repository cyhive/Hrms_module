import { NextRequest, NextResponse } from "next/server";
import { recordActivity } from "@/lib/activity-repo";
import { getCurrentUserFromRequest } from "@/lib/auth";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  listEventsOverlappingMonth,
} from "@/lib/events-repo";
import { usesAdminPortal } from "@/lib/roles";

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesAdminPortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const yRaw = req.nextUrl.searchParams.get("year");
  const mRaw = req.nextUrl.searchParams.get("month");
  const year = yRaw ? parseInt(yRaw, 10) : new Date().getFullYear();
  const month = mRaw ? parseInt(mRaw, 10) : new Date().getMonth() + 1;
  if (!Number.isFinite(year) || year < 1970 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }
  const events = await listEventsOverlappingMonth(year, month);
  return NextResponse.json({ events });
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
  const title =
    typeof body === "object" && body !== null && "title" in body
      ? String((body as { title: unknown }).title)
      : "";
  const startDate =
    typeof body === "object" && body !== null && "startDate" in body
      ? String((body as { startDate: unknown }).startDate).trim()
      : "";
  const endDate =
    typeof body === "object" && body !== null && "endDate" in body
      ? String((body as { endDate: unknown }).endDate).trim()
      : "";
  const description =
    typeof body === "object" && body !== null && "description" in body
      ? String((body as { description: unknown }).description)
      : "";
  const targetAudience =
    typeof body === "object" && body !== null && "targetAudience" in body
      ? String((body as { targetAudience: unknown }).targetAudience).trim()
      : "all";

  try {
    const event = await createCalendarEvent({
      title,
      startDate,
      endDate: endDate || undefined,
      description: description.trim() || undefined,
      targetAudience: targetAudience || "all",
      createdByUserId: user.id,
      createdByUsername: user.username,
    });
    void recordActivity({
      actorUserId: user.id,
      actorUsername: user.username,
      kind: "event.create",
      message: `Scheduled event "${event.title}" (${event.startDate}${event.endDate !== event.startDate ? ` → ${event.endDate}` : ""})`,
    });
    return NextResponse.json({ event }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Create failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesAdminPortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "id query parameter is required" }, { status: 400 });
  }
  const ok = await deleteCalendarEvent(id);
  if (!ok) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  void recordActivity({
    actorUserId: user.id,
    actorUsername: user.username,
    kind: "event.delete",
    message: `Removed calendar event (${id.slice(0, 8)}…)`,
  });
  return NextResponse.json({ ok: true });
}
