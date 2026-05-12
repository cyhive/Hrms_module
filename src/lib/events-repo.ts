import { randomUUID } from "crypto";
import { Collection } from "mongodb";
import {
  type CalendarEventAudience,
  type CalendarEventRecord,
  CALENDAR_EVENT_AUDIENCE_SET,
  eventVisibleToRole,
} from "./calendar-events-shared";
import { getDb } from "./mongodb";
import type { Role } from "./types";

export type { CalendarEventAudience, CalendarEventRecord } from "./calendar-events-shared";
export {
  CALENDAR_EVENT_AUDIENCES,
  CALENDAR_EVENT_AUDIENCE_SET,
  eventVisibleToRole,
  labelForCalendarEventAudience,
} from "./calendar-events-shared";

async function eventsCollection(): Promise<Collection<CalendarEventRecord>> {
  const db = await getDb();
  return db.collection<CalendarEventRecord>("calendar_events");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function lastDayOfMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

function monthRangeIso(year: number, month1: number): { start: string; end: string } {
  const start = `${year}-${pad2(month1)}-01`;
  const end = `${year}-${pad2(month1)}-${pad2(lastDayOfMonth(year, month1))}`;
  return { start, end };
}

export async function listEventsOverlappingMonth(
  year: number,
  month1: number,
  options?: { visibleToRole?: Role },
): Promise<CalendarEventRecord[]> {
  const { start, end } = monthRangeIso(year, month1);
  const col = await eventsCollection();
  const rows = await col
    .find({
      startDate: { $lte: end },
      endDate: { $gte: start },
    })
    .sort({ startDate: 1, title: 1 })
    .toArray();
  const visibleToRole = options?.visibleToRole;
  if (!visibleToRole) return rows;
  return rows.filter((ev) => eventVisibleToRole(ev.targetAudience, visibleToRole));
}

export async function createCalendarEvent(input: {
  title: string;
  description?: string;
  startDate: string;
  endDate?: string;
  targetAudience?: string;
  createdByUserId: string;
  createdByUsername: string;
}): Promise<CalendarEventRecord> {
  const title = input.title.trim();
  if (!title) throw new Error("Title is required");
  const startDate = input.startDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error("startDate must be YYYY-MM-DD");
  const endDate = (input.endDate?.trim() || startDate).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new Error("endDate must be YYYY-MM-DD");
  if (endDate < startDate) throw new Error("endDate must be on or after startDate");

  const rawAudience = (input.targetAudience ?? "all").trim() || "all";
  if (!CALENDAR_EVENT_AUDIENCE_SET.has(rawAudience)) {
    throw new Error("Invalid target audience");
  }
  const targetAudience = rawAudience as CalendarEventAudience;

  const col = await eventsCollection();
  const doc: CalendarEventRecord = {
    _id: randomUUID(),
    title,
    description: input.description?.trim() || undefined,
    startDate,
    endDate,
    targetAudience,
    createdAt: new Date().toISOString(),
    createdByUserId: input.createdByUserId,
    createdByUsername: input.createdByUsername,
  };
  await col.insertOne(doc);
  return doc;
}

export async function deleteCalendarEvent(eventId: string): Promise<boolean> {
  const col = await eventsCollection();
  const r = await col.deleteOne({ _id: eventId });
  return r.deletedCount === 1;
}
