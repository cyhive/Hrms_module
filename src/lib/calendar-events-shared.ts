import { usesAdminPortal, usesEmployeePortal } from "./roles";
import type { Role } from "./types";

export interface CalendarEventRecord {
  _id: string;
  title: string;
  description?: string;
  /** Inclusive YYYY-MM-DD */
  startDate: string;
  /** Inclusive YYYY-MM-DD, same as startDate for a single day */
  endDate: string;
  /**
   * Who may see this event on their dashboard calendar.
   * Missing / legacy documents are treated as `all`.
   */
  targetAudience?: CalendarEventAudience;
  createdAt: string;
  createdByUserId: string;
  createdByUsername: string;
}

/** Values stored on `calendar_events.targetAudience`. */
export const CALENDAR_EVENT_AUDIENCES = [
  { value: "all", label: "Everyone (all roles)" },
  { value: "employee_portal", label: "Employee dashboard — employees & managers" },
  { value: "admin_portal", label: "HR / Admin dashboard only" },
  { value: "employee", label: "Employees only" },
  { value: "manager", label: "Managers only" },
  { value: "hr", label: "HR only" },
  { value: "admin", label: "Admin only" },
] as const;

export type CalendarEventAudience = (typeof CALENDAR_EVENT_AUDIENCES)[number]["value"];

export const CALENDAR_EVENT_AUDIENCE_SET = new Set<string>(CALENDAR_EVENT_AUDIENCES.map((a) => a.value));

export function labelForCalendarEventAudience(value: string | undefined): string {
  const v = (value ?? "all").trim() || "all";
  const row = CALENDAR_EVENT_AUDIENCES.find((a) => a.value === v);
  return row?.label ?? v;
}

/** Whether a user with `role` should see this event on their calendar. */
export function eventVisibleToRole(targetAudience: string | undefined, role: Role): boolean {
  const t = (targetAudience ?? "all").trim() || "all";
  if (t === "all") return true;
  if (t === "employee_portal") return usesEmployeePortal(role);
  if (t === "admin_portal") return usesAdminPortal(role);
  if (t === "employee" || t === "manager" || t === "hr" || t === "admin") return role === t;
  return true;
}
