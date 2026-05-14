import { randomUUID } from "crypto";
import { Collection } from "mongodb";
import { getDb } from "./mongodb";
import type { MonthAttendancePayrollBreakdown, Role } from "./types";
import { usesEmployeePortal, usesSelfAttendance } from "./roles";
import { findUserById, listEmployees } from "./user-repo";
import {
  defaultHolidayByDate,
  listDefaultHolidaysInMonth,
} from "./public-holiday-catalog";

interface AttendanceRecord {
  _id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  punchIn?: string;
  punchOut?: string;
  workedHours: number;
  status: "present" | "off" | "miss-punch";
  createdAt: string;
  updatedAt: string;
}

interface MissPunchRequest {
  _id: string;
  userId: string;
  date: string;
  type: "punch-in" | "punch-out";
  reason: string;
  managerId?: string;
  managerApprovalAt?: string;
  managerApprovalBy?: string;
  hrApprovalAt?: string;
  hrApprovalBy?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

interface LeaveRequest {
  _id: string;
  userId: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  compensation: "paid" | "unpaid";
  managerId?: string;
  managerApprovalAt?: string;
  managerApprovalBy?: string;
  hrApprovalAt?: string;
  hrApprovalBy?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

interface WfhRequest {
  _id: string;
  userId: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  managerId?: string;
  managerApprovalAt?: string;
  managerApprovalBy?: string;
  hrApprovalAt?: string;
  hrApprovalBy?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

interface LeaveBalance {
  _id: string; // userId
  /** Available days = accrued (from joining) − approved − pending. */
  annualLeave: number;
  /** Unused balance rolled from completed leave years before the current joining-date year. */
  carryForward: number;
  /** Start date (YYYY-MM-DD) of the current leave year (joining-date anniversary cycle). */
  lastCarryForwardMonth: string;
}

interface HolidayOverride {
  _id: string;
  date: string;
  treatment: "working";
  updatedAt: string;
}

interface AssetCatalogItem {
  _id: string;
  name: string;
  category: string;
  value: number; // amount employee pays if not returned
  details?: string;
  imageUrl?: string;
  totalQty: number;
  availableQty: number;
  createdAt: string;
}

interface AssetRequest {
  _id: string;
  userId: string;
  assetId: string;
  qty: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  decidedAt?: string;
  decisionReason?: string;
}

interface AssetAssignment {
  _id: string;
  userId: string;
  assetId: string;
  qty: number;
  assignedAt: string;
  status: "assigned" | "returned" | "paid";
  resolvedAt?: string;
  offboardingRequestId?: string;
}

interface OffboardingAssetClearance {
  assetId: string;
  assetName: string;
  actionRequired: "return" | "pay";
  amountDue: number;
  cleared: boolean;
  clearedAt?: string;
}

interface OffboardingRequest {
  _id: string;
  userId: string;
  type: "resignation" | "termination";
  lastWorkingDay: string; // YYYY-MM-DD
  reason: string;
  managerId?: string;
  managerApprovalAt?: string;
  managerApprovalBy?: string;
  hrApprovalAt?: string;
  hrApprovalBy?: string;
  status: "pending" | "approved" | "rejected";
  initiatedBy: "employee" | "admin";
  createdAt: string;
  decidedAt?: string;
  decisionReason?: string;
  assetClearance: OffboardingAssetClearance[];
}

async function attendanceCollection(): Promise<Collection<AttendanceRecord>> {
  const db = await getDb();
  return db.collection<AttendanceRecord>("attendance");
}

async function missPunchCollection(): Promise<Collection<MissPunchRequest>> {
  const db = await getDb();
  return db.collection<MissPunchRequest>("miss_punch_requests");
}

async function leaveRequestCollection(): Promise<Collection<LeaveRequest>> {
  const db = await getDb();
  return db.collection<LeaveRequest>("leave_requests");
}

async function wfhRequestCollection(): Promise<Collection<WfhRequest>> {
  const db = await getDb();
  return db.collection<WfhRequest>("wfh_requests");
}

async function leaveBalanceCollection(): Promise<Collection<LeaveBalance>> {
  const db = await getDb();
  return db.collection<LeaveBalance>("leave_balances");
}

async function holidayOverridesCollection(): Promise<Collection<HolidayOverride>> {
  const db = await getDb();
  return db.collection<HolidayOverride>("holiday_overrides");
}

async function assetsCollection(): Promise<Collection<AssetCatalogItem>> {
  const db = await getDb();
  return db.collection<AssetCatalogItem>("assets");
}

async function offboardingCollection(): Promise<Collection<OffboardingRequest>> {
  const db = await getDb();
  return db.collection<OffboardingRequest>("offboarding_requests");
}

async function assetRequestsCollection(): Promise<Collection<AssetRequest>> {
  const db = await getDb();
  return db.collection<AssetRequest>("asset_requests");
}

async function assetAssignmentsCollection(): Promise<Collection<AssetAssignment>> {
  const db = await getDb();
  return db.collection<AssetAssignment>("asset_assignments");
}

/** Calendar date in local timezone (avoids UTC shift from toISOString). */
function toLocalIsoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD as a local calendar date (no UTC-only parsing of date-only strings). */
function parseLocalIsoDateOnly(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return new Date(NaN);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

type DbUser = NonNullable<Awaited<ReturnType<typeof findUserById>>>;

/** Joining date from profile, else account created date (local calendar). */
function effectiveJoinDate(user: DbUser): Date {
  const jd = user.profile?.joiningDate?.trim();
  if (jd && /^\d{4}-\d{2}-\d{2}$/.test(jd)) {
    const j = parseLocalIsoDateOnly(jd);
    if (!Number.isNaN(j.getTime())) return j;
  }
  const c = new Date(user.createdAt);
  if (!Number.isNaN(c.getTime())) {
    return new Date(c.getFullYear(), c.getMonth(), c.getDate(), 12, 0, 0);
  }
  return new Date();
}

function addCalendarYears(d: Date, years: number): Date {
  return new Date(d.getFullYear() + years, d.getMonth(), d.getDate(), 12, 0, 0);
}

/** Full calendar months completed between start and end (inclusive end day). */
function completedCalendarMonths(start: Date, end: Date): number {
  if (end < start) return 0;
  let months =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}

function currentLeaveYearStart(join: Date, asOf: Date): Date {
  if (asOf < join) return join;
  let start = new Date(join);
  for (;;) {
    const next = addCalendarYears(start, 1);
    if (asOf < next) return start;
    start = next;
  }
}

/** Last calendar day of the leave year that starts at `nextLeaveYearStart`. */
function endOfLeaveYearBefore(nextLeaveYearStart: Date): Date {
  return new Date(
    nextLeaveYearStart.getFullYear(),
    nextLeaveYearStart.getMonth(),
    nextLeaveYearStart.getDate() - 1,
    12,
    0,
    0,
  );
}

/**
 * Leave accrual from joining date: within each joining-date leave year, up to 12 days,
 * accruing 1 day per completed calendar month of service in that year (same rule each year).
 */
function totalAccruedLeaveDaysBetween(join: Date, asOf: Date): number {
  if (Number.isNaN(join.getTime()) || asOf < join) return 0;
  let total = 0;
  let periodStart = new Date(join);
  for (;;) {
    const nextStart = addCalendarYears(periodStart, 1);
    const segmentEnd = asOf < nextStart ? asOf : endOfLeaveYearBefore(nextStart);
    const months = completedCalendarMonths(periodStart, segmentEnd);
    total += Math.min(12, months);
    if (asOf < nextStart) break;
    periodStart = nextStart;
  }
  return total;
}

async function sumLeaveDaysByStatus(
  userId: string,
  statuses: LeaveRequest["status"][],
  options?: { fromDateLt?: string; compensation?: "paid" | "unpaid" },
): Promise<number> {
  const col = await leaveRequestCollection();
  const filter: Record<string, unknown> = { userId, status: { $in: statuses } };
  if (options?.fromDateLt) filter.fromDate = { $lt: options.fromDateLt };
  if (options?.compensation === "unpaid") {
    filter.compensation = "unpaid";
  } else if (options?.compensation === "paid") {
    // Backward compatibility: old leave records without compensation are treated as paid.
    filter.$or = [{ compensation: "paid" }, { compensation: { $exists: false } }];
  }
  const agg = await col
    .aggregate<{ total: number }>([
      { $match: filter },
      { $group: { _id: null, total: { $sum: "$days" } } },
    ])
    .toArray();
  return agg[0]?.total ?? 0;
}

/** Balance carried from completed leave years before the current joining-date year. */
async function computeCarryForward(userId: string, join: Date, asOf: Date): Promise<number> {
  const leyStart = currentLeaveYearStart(join, asOf);
  if (leyStart.getTime() === join.getTime()) return 0;
  const endPrev = new Date(leyStart.getFullYear(), leyStart.getMonth(), leyStart.getDate() - 1, 12, 0, 0);
  const earnedThroughPrior = totalAccruedLeaveDaysBetween(join, endPrev);
  const leyStartIso = toLocalIsoDate(leyStart);
  const usedBefore = await sumLeaveDaysByStatus(userId, ["approved"], {
    fromDateLt: leyStartIso,
    compensation: "paid",
  });
  return Math.max(0, earnedThroughPrior - usedBefore);
}

async function syncLeaveBalanceFromJoining(userId: string): Promise<LeaveBalance> {
  const user = await findUserById(userId);
  if (!user || !usesEmployeePortal(user.role)) {
    throw new Error("Employee not found");
  }
  const join = effectiveJoinDate(user);
  const asOf = new Date();
  const totalAccrued = totalAccruedLeaveDaysBetween(join, asOf);
  const approvedDays = await sumLeaveDaysByStatus(userId, ["approved"], { compensation: "paid" });
  const pendingDays = await sumLeaveDaysByStatus(userId, ["pending"], { compensation: "paid" });
  const available = Math.max(0, totalAccrued - approvedDays - pendingDays);
  const carryForward = await computeCarryForward(userId, join, asOf);
  const leyStart = currentLeaveYearStart(join, asOf);
  const doc: LeaveBalance = {
    _id: userId,
    annualLeave: available,
    carryForward,
    lastCarryForwardMonth: toLocalIsoDate(leyStart),
  };
  const balances = await leaveBalanceCollection();
  await balances.updateOne({ _id: userId }, { $set: doc }, { upsert: true });
  return doc;
}

async function fetchOverrideWorkingDates(dates: string[]): Promise<Set<string>> {
  const inCatalog = dates.filter((d) => defaultHolidayByDate.has(d));
  if (!inCatalog.length) return new Set();
  const col = await holidayOverridesCollection();
  const docs = await col.find({ date: { $in: inCatalog }, treatment: "working" }).toArray();
  return new Set(docs.map((d) => d.date));
}

function effectivePHTreatment(iso: string, workingOverrideDates: Set<string>): "holiday" | "working" | null {
  if (!defaultHolidayByDate.has(iso)) return null;
  return workingOverrideDates.has(iso) ? "working" : "holiday";
}

/**
 * Off day for attendance: weekend / second Saturday, or a public holiday kept as holiday.
 * A catalog holiday marked "working" is treated like a normal workday (must punch in).
 */
function isOffDayWithWorkingOverrides(date: Date, workingPH: Set<string>): boolean {
  const isoDate = toLocalIsoDate(date);
  const ph = effectivePHTreatment(isoDate, workingPH);
  if (ph === "holiday") return true;
  if (ph === "working") return false;

  const weekday = date.getDay();
  if (weekday === 0) return true; // Sunday off
  if (weekday === 6) {
    const saturdayIndex = Math.ceil(date.getDate() / 7);
    return saturdayIndex === 2; // second saturday off
  }
  return false;
}

export async function listAdminHolidaysForMonth(year: number, monthIndex: number) {
  const rows = listDefaultHolidaysInMonth(year, monthIndex);
  const workingPH = await fetchOverrideWorkingDates(rows.map((r) => r.date));
  return rows.map((r) => ({
    date: r.date,
    name: r.name,
    treatment: workingPH.has(r.date) ? ("working" as const) : ("holiday" as const),
  }));
}

export async function setHolidayTreatment(date: string, treatment: "holiday" | "working") {
  if (!defaultHolidayByDate.has(date)) {
    throw new Error("That date is not in the configured public holiday list");
  }
  const col = await holidayOverridesCollection();
  if (treatment === "holiday") {
    await col.deleteOne({ date });
    return;
  }
  const nowIso = new Date().toISOString();
  await col.updateOne(
    { date },
    {
      $set: { date, treatment: "working", updatedAt: nowIso },
      $setOnInsert: { _id: randomUUID() },
    },
    { upsert: true },
  );
}

async function calculateLeaveDays(fromDate: string, toDate: string): Promise<number> {
  const start = parseLocalIsoDateOnly(fromDate);
  const end = parseLocalIsoDateOnly(toDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid date");
  }
  if (start > end) throw new Error("From date cannot be after to date");

  const rangeIsos: string[] = [];
  for (
    let d = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12, 0, 0);
    d <= end;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12, 0, 0)
  ) {
    rangeIsos.push(toLocalIsoDate(d));
  }
  const workingPH = await fetchOverrideWorkingDates(rangeIsos);

  let count = 0;
  for (
    let d = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12, 0, 0);
    d <= end;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12, 0, 0)
  ) {
    if (!isOffDayWithWorkingOverrides(d, workingPH)) count += 1;
  }
  return count;
}

async function resolveReportingManagerId(userId: string): Promise<string | undefined> {
  const user = await findUserById(userId);
  if (!user) return undefined;
  const managerId = user.profile?.managerId?.trim();
  return managerId || undefined;
}

async function assertDecisionAllowed(
  req: { userId: string; status: string; managerId?: string; managerApprovalAt?: string },
  actor: { id: string; role: Role },
  decision: "approve" | "reject",
) {
  if (req.status !== "pending") throw new Error("This request is no longer pending");
  if (actor.role === "admin" || actor.role === "hr") return;
  if (actor.role === "manager") {
    const managerId = req.managerId || (await resolveReportingManagerId(req.userId));
    if (!managerId || managerId !== actor.id) {
      throw new Error("Only the assigned manager can decide this request");
    }
    if (decision === "approve" && req.managerApprovalAt) {
      throw new Error("Manager already approved this request");
    }
    return;
  }
  throw new Error("Forbidden");
}

export async function savePunch(userId: string, action: "in" | "out") {
  const user = await findUserById(userId);
  if (!user || !usesSelfAttendance(user.role)) {
    throw new Error("Employee not found");
  }

  const now = new Date();
  const dateKey = toLocalIsoDate(now);
  const attendance = await attendanceCollection();
  const existing = await attendance.findOne({ userId, date: dateKey });
  const nowIso = now.toISOString();
  const workingPH = await fetchOverrideWorkingDates([dateKey]);

  if (existing?.punchIn && existing?.punchOut) {
    throw new Error("Already completed punch in and out for today.");
  }

  if (!existing) {
    const newRecord: AttendanceRecord = {
      _id: randomUUID(),
      userId,
      date: dateKey,
      punchIn: action === "in" ? nowIso : undefined,
      punchOut: action === "out" ? nowIso : undefined,
      workedHours: 0,
      status: isOffDayWithWorkingOverrides(now, workingPH)
        ? "off"
        : action === "out"
          ? "miss-punch"
          : "present",
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await attendance.insertOne(newRecord);
    return newRecord;
  }

  const update: Partial<AttendanceRecord> = {
    updatedAt: nowIso,
  };

  if (action === "in") {
    if (existing.punchIn && !existing.punchOut) {
      throw new Error("Already punched in for today. Punch out before recording another punch in.");
    }
    update.punchIn = nowIso;
  } else {
    update.punchOut = nowIso;
    if (existing.punchIn) {
      const diffMs = now.getTime() - new Date(existing.punchIn).getTime();
      update.workedHours = Math.max(0, Number((diffMs / (1000 * 60 * 60)).toFixed(2)));
      update.status = "present";
    } else {
      update.status = "miss-punch";
    }
  }

  await attendance.updateOne({ _id: existing._id }, { $set: update });
  const updated = await attendance.findOne({ _id: existing._id });
  return updated;
}

async function ensureLeaveBalance(userId: string): Promise<LeaveBalance> {
  return syncLeaveBalanceFromJoining(userId);
}

/** Recomputes leave balance from joining date, accrual, usage, and carry-forward; persists to `leave_balances`. */
export async function applyMonthlyLeaveCarryForward(userId: string): Promise<LeaveBalance> {
  return syncLeaveBalanceFromJoining(userId);
}

export async function createLeaveRequest(input: {
  userId: string;
  fromDate: string;
  toDate: string;
  reason: string;
}) {
  const days = await calculateLeaveDays(input.fromDate, input.toDate);
  if (days <= 0) throw new Error("Selected dates contain only off days");

  const balance = await syncLeaveBalanceFromJoining(input.userId);
  const compensation: LeaveRequest["compensation"] = days > balance.annualLeave ? "unpaid" : "paid";
  const managerId = await resolveReportingManagerId(input.userId);

  const requests = await leaveRequestCollection();
  const doc: LeaveRequest = {
    _id: randomUUID(),
    userId: input.userId,
    fromDate: input.fromDate,
    toDate: input.toDate,
    days,
    reason: input.reason,
    compensation,
    managerId,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  await requests.insertOne(doc);
  await syncLeaveBalanceFromJoining(input.userId);
  return doc;
}

export async function updateOwnPendingLeaveRequest(input: {
  userId: string;
  requestId: string;
  fromDate: string;
  toDate: string;
  reason: string;
}): Promise<LeaveRequest> {
  const requests = await leaveRequestCollection();
  const existing = await requests.findOne({ _id: input.requestId, userId: input.userId });
  if (!existing) throw new Error("Leave request not found");
  if (existing.status !== "pending") throw new Error("Only pending requests can be edited");

  const days = await calculateLeaveDays(input.fromDate, input.toDate);
  if (days <= 0) throw new Error("Selected dates contain only off days");

  const balance = await syncLeaveBalanceFromJoining(input.userId);
  const allowed =
    balance.annualLeave + (existing.compensation === "paid" ? existing.days : 0);
  const compensation: LeaveRequest["compensation"] = days > allowed ? "unpaid" : "paid";

  await requests.updateOne(
    { _id: existing._id },
    {
      $set: {
        fromDate: input.fromDate,
        toDate: input.toDate,
        days,
        reason: input.reason.trim(),
        compensation,
      },
    },
  );
  await syncLeaveBalanceFromJoining(input.userId);
  const updated = await requests.findOne({ _id: existing._id });
  if (!updated) throw new Error("Leave request not found after update");
  return updated;
}

export async function deleteOwnPendingLeaveRequest(input: {
  userId: string;
  requestId: string;
}): Promise<void> {
  const requests = await leaveRequestCollection();
  const existing = await requests.findOne({ _id: input.requestId, userId: input.userId });
  if (!existing) throw new Error("Leave request not found");
  if (existing.status !== "pending") throw new Error("Only pending requests can be deleted");
  await requests.deleteOne({ _id: existing._id });
  await syncLeaveBalanceFromJoining(input.userId);
}

export async function createMissPunchRequest(input: {
  userId: string;
  date: string;
  type: "punch-in" | "punch-out";
  reason: string;
}) {
  const requests = await missPunchCollection();
  const managerId = await resolveReportingManagerId(input.userId);
  const doc: MissPunchRequest = {
    _id: randomUUID(),
    userId: input.userId,
    date: input.date,
    type: input.type,
    reason: input.reason,
    managerId,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  await requests.insertOne(doc);
  return doc;
}

export async function updateOwnPendingMissPunchRequest(input: {
  userId: string;
  requestId: string;
  date: string;
  type: "punch-in" | "punch-out";
  reason: string;
}): Promise<MissPunchRequest> {
  const requests = await missPunchCollection();
  const existing = await requests.findOne({ _id: input.requestId, userId: input.userId });
  if (!existing) throw new Error("Miss punch request not found");
  if (existing.status !== "pending") throw new Error("Only pending requests can be edited");
  await requests.updateOne(
    { _id: existing._id },
    { $set: { date: input.date, type: input.type, reason: input.reason.trim() } },
  );
  const updated = await requests.findOne({ _id: existing._id });
  if (!updated) throw new Error("Miss punch request not found after update");
  return updated;
}

export async function deleteOwnPendingMissPunchRequest(input: {
  userId: string;
  requestId: string;
}): Promise<void> {
  const requests = await missPunchCollection();
  const existing = await requests.findOne({ _id: input.requestId, userId: input.userId });
  if (!existing) throw new Error("Miss punch request not found");
  if (existing.status !== "pending") throw new Error("Only pending requests can be deleted");
  await requests.deleteOne({ _id: existing._id });
}

export async function createWfhRequest(input: {
  userId: string;
  fromDate: string;
  toDate: string;
  reason: string;
}) {
  const days = await calculateLeaveDays(input.fromDate, input.toDate);
  if (days <= 0) throw new Error("Selected dates contain only off days");
  const managerId = await resolveReportingManagerId(input.userId);

  const requests = await wfhRequestCollection();
  const doc: WfhRequest = {
    _id: randomUUID(),
    userId: input.userId,
    fromDate: input.fromDate,
    toDate: input.toDate,
    days,
    reason: input.reason,
    managerId,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  await requests.insertOne(doc);
  return doc;
}

export async function updateOwnPendingWfhRequest(input: {
  userId: string;
  requestId: string;
  fromDate: string;
  toDate: string;
  reason: string;
}): Promise<WfhRequest> {
  const requests = await wfhRequestCollection();
  const existing = await requests.findOne({ _id: input.requestId, userId: input.userId });
  if (!existing) throw new Error("WFH request not found");
  if (existing.status !== "pending") throw new Error("Only pending requests can be edited");
  const days = await calculateLeaveDays(input.fromDate, input.toDate);
  if (days <= 0) throw new Error("Selected dates contain only off days");
  await requests.updateOne(
    { _id: existing._id },
    { $set: { fromDate: input.fromDate, toDate: input.toDate, days, reason: input.reason.trim() } },
  );
  const updated = await requests.findOne({ _id: existing._id });
  if (!updated) throw new Error("WFH request not found after update");
  return updated;
}

export async function deleteOwnPendingWfhRequest(input: {
  userId: string;
  requestId: string;
}): Promise<void> {
  const requests = await wfhRequestCollection();
  const existing = await requests.findOne({ _id: input.requestId, userId: input.userId });
  if (!existing) throw new Error("WFH request not found");
  if (existing.status !== "pending") throw new Error("Only pending requests can be deleted");
  await requests.deleteOne({ _id: existing._id });
}

export async function getEmployeeWorkingSummary(userId: string) {
  const user = await findUserById(userId);
  if (!user || !usesSelfAttendance(user.role)) {
    throw new Error("User not found");
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const attendance = await attendanceCollection();
  const leaveRequests = await leaveRequestCollection();
  const leaveBalance = usesEmployeePortal(user.role)
    ? await syncLeaveBalanceFromJoining(userId)
    : { annualLeave: 0, carryForward: 0 };

  const records = await attendance
    .find({ userId, date: { $gte: monthStart, $lte: monthEnd } })
    .toArray();

  const catalogRows = listDefaultHolidaysInMonth(year, month);
  const workingPH = await fetchOverrideWorkingDates(catalogRows.map((r) => r.date));

  const holidayCalendar = catalogRows.map((r) => ({
    date: r.date,
    name: r.name,
    treatment: workingPH.has(r.date) ? ("working" as const) : ("holiday" as const),
  }));

  let plannedWorkingDays = 0;
  let weekendOffDays = 0;
  let holidayOffDays = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const d = new Date(year, month, day);
    const iso = toLocalIsoDate(d);
    const weekday = d.getDay();
    const phTreat = effectivePHTreatment(iso, workingPH);
    const secondSat = weekday === 6 && Math.ceil(day / 7) === 2;
    if (weekday === 0 || secondSat) weekendOffDays += 1;
    if (phTreat === "holiday") holidayOffDays += 1;
    if (!isOffDayWithWorkingOverrides(d, workingPH)) plannedWorkingDays += 1;
  }

  const totalWorkedHours = Number(
    records.reduce((sum, r) => sum + (r.workedHours || 0), 0).toFixed(2),
  );
  const presentDays = records.filter((r) => r.status === "present").length;

  const approvedLeaveInMonth = await leaveRequests
    .find({
      userId,
      status: "approved",
      fromDate: { $lte: monthEnd },
      toDate: { $gte: monthStart },
    })
    .toArray();

  const wfhCol = await wfhRequestCollection();
  const approvedWfhInMonth = await wfhCol
    .find({
      userId,
      status: "approved",
      fromDate: { $lte: monthEnd },
      toDate: { $gte: monthStart },
    })
    .toArray();

  const attendanceByDate = new Map(records.map((r) => [r.date, r]));
  function isoOnApprovedRange(iso: string, from: string, to: string): boolean {
    return iso >= from && iso <= to;
  }

  let offWithoutPunch = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const d = new Date(year, month, day);
    if (isOffDayWithWorkingOverrides(d, workingPH)) continue;
    const iso = toLocalIsoDate(d);
    const rec = attendanceByDate.get(iso);
    if (rec?.status === "present") continue;
    if (approvedLeaveInMonth.some((l) => isoOnApprovedRange(iso, l.fromDate, l.toDate))) continue;
    if (approvedWfhInMonth.some((w) => isoOnApprovedRange(iso, w.fromDate, w.toDate))) continue;
    offWithoutPunch += 1;
  }

  const myLeaves = await leaveRequests
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();

  const myWfh = await wfhCol.find({ userId }).sort({ createdAt: -1 }).limit(20).toArray();

  const missCol = await missPunchCollection();
  const myMissPunch = await missCol.find({ userId }).sort({ createdAt: -1 }).limit(20).toArray();

  const publicHolidays = holidayCalendar.filter((h) => h.treatment === "holiday").map((h) => h.date);

  return {
    plannedWorkingDays,
    weekendOffDays,
    holidayOffDays,
    presentDays,
    offWithoutPunch,
    totalWorkedHours,
    leaveBalance,
    recentLeaves: myLeaves,
    recentWfh: myWfh,
    recentMissPunches: myMissPunch,
    attendance: records.sort((a, b) => (a.date < b.date ? 1 : -1)),
    publicHolidays,
    holidayCalendar,
  };
}

function isoOnRange(iso: string, from: string, to: string): boolean {
  return iso >= from && iso <= to;
}

const PERIOD_YM = /^(\d{4})-(\d{2})$/;

/**
 * Month-end attendance payroll: unpaid approved leave reduces pay; paid approved leave does not.
 * HR-approved miss punch updates attendance to `present`, so those days stop counting as LOP here.
 */
export async function computeEmployeeMonthAttendancePayroll(
  userId: string,
  period: string,
  basePay: number,
): Promise<MonthAttendancePayrollBreakdown | null> {
  const user = await findUserById(userId);
  if (!user || !usesEmployeePortal(user.role)) return null;

  const pm = PERIOD_YM.exec(period.trim());
  if (!pm) throw new Error("Period must be YYYY-MM");

  const year = Number(pm[1]);
  const month = Number(pm[2]) - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthStart = `${pm[1]}-${pm[2]}-01`;
  const monthEnd = `${pm[1]}-${pm[2]}-${String(daysInMonth).padStart(2, "0")}`;

  const join = effectiveJoinDate(user);
  const joinIso = toLocalIsoDate(join);

  const attendance = await attendanceCollection();
  const leaveRequests = await leaveRequestCollection();
  const wfhCol = await wfhRequestCollection();

  const records = await attendance
    .find({ userId, date: { $gte: monthStart, $lte: monthEnd } })
    .toArray();
  const attendanceByDate = new Map(records.map((r) => [r.date, r]));

  const catalogRows = listDefaultHolidaysInMonth(year, month);
  const workingPH = await fetchOverrideWorkingDates(catalogRows.map((r) => r.date));

  let plannedWorkingDaysInMonth = 0;
  let payableWorkingDays = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const d = new Date(year, month, day, 12, 0, 0);
    const iso = toLocalIsoDate(d);
    if (!isOffDayWithWorkingOverrides(d, workingPH)) {
      plannedWorkingDaysInMonth += 1;
      if (iso >= joinIso) payableWorkingDays += 1;
    }
  }

  const approvedLeaves = await leaveRequests
    .find({
      userId,
      status: "approved",
      fromDate: { $lte: monthEnd },
      toDate: { $gte: monthStart },
    })
    .toArray();

  const paidLeaveDates = new Set<string>();
  const unpaidLeaveDates = new Set<string>();

  const leavesSorted = [...approvedLeaves].sort(
    (a, b) => (a.compensation === "unpaid" ? 0 : 1) - (b.compensation === "unpaid" ? 0 : 1),
  );

  for (const leave of leavesSorted) {
    const from = leave.fromDate > monthStart ? leave.fromDate : monthStart;
    const to = leave.toDate < monthEnd ? leave.toDate : monthEnd;
    const isUnpaid = leave.compensation === "unpaid";
    let cursor = parseLocalIsoDateOnly(from);
    const endD = parseLocalIsoDateOnly(to);
    if (Number.isNaN(cursor.getTime()) || Number.isNaN(endD.getTime())) continue;
    for (; cursor <= endD; cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, 12, 0, 0)) {
      const iso = toLocalIsoDate(cursor);
      if (iso < joinIso) continue;
      if (!isOffDayWithWorkingOverrides(cursor, workingPH)) {
        if (isUnpaid) {
          unpaidLeaveDates.add(iso);
          paidLeaveDates.delete(iso);
        } else if (!unpaidLeaveDates.has(iso)) {
          paidLeaveDates.add(iso);
        }
      }
    }
  }

  const approvedWfh = await wfhCol
    .find({
      userId,
      status: "approved",
      fromDate: { $lte: monthEnd },
      toDate: { $gte: monthStart },
    })
    .toArray();

  let paidLeaveWorkingDays = 0;
  let unpaidLeaveWorkingDays = 0;
  let lopDays = 0;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const d = new Date(year, month, day, 12, 0, 0);
    if (isOffDayWithWorkingOverrides(d, workingPH)) continue;
    const iso = toLocalIsoDate(d);
    if (iso < joinIso) continue;

    if (unpaidLeaveDates.has(iso)) {
      unpaidLeaveWorkingDays += 1;
      continue;
    }
    if (paidLeaveDates.has(iso)) {
      paidLeaveWorkingDays += 1;
      continue;
    }

    const rec = attendanceByDate.get(iso);
    if (rec?.status === "present") continue;

    const onWfh = approvedWfh.some((w) => isoOnRange(iso, w.fromDate, w.toDate));
    if (onWfh) continue;

    lopDays += 1;
  }

  const base = Math.max(0, Number(basePay) || 0);
  const dailyRate =
    payableWorkingDays > 0 ? Math.round((base / payableWorkingDays) * 100) / 100 : 0;
  const unpaidLeaveDeduction = Math.round(unpaidLeaveWorkingDays * dailyRate * 100) / 100;
  const lopDeduction = Math.round(lopDays * dailyRate * 100) / 100;

  return {
    period: period.trim(),
    userId,
    plannedWorkingDaysInMonth,
    payableWorkingDays,
    paidLeaveWorkingDays,
    unpaidLeaveWorkingDays,
    lopDays,
    dailyRate,
    unpaidLeaveDeduction,
    lopDeduction,
  };
}

export async function getAdminOverview() {
  const employees = await listEmployees();
  const leaveRequests = await (await leaveRequestCollection())
    .find({})
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
  const missPunchRequests = await (await missPunchCollection())
    .find({})
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
  const wfhRequests = await (await wfhRequestCollection())
    .find({})
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();

  const leaveBalanceRows: Array<{ userId: string; annualLeave: number; carryForward: number }> = [];
  for (const e of employees) {
    if (!usesEmployeePortal(e.role)) continue;
    const b = await syncLeaveBalanceFromJoining(e.id);
    leaveBalanceRows.push({ userId: e.id, annualLeave: b.annualLeave, carryForward: b.carryForward });
  }

  return { employees, leaveRequests, missPunchRequests, wfhRequests, leaveBalances: leaveBalanceRows };
}

export async function getManagerTeamOverview(managerUserId: string) {
  const employees = await listEmployees();
  const teamIds = employees
    .filter((e) => e.profile?.managerId === managerUserId)
    .map((e) => e.id);
  if (!teamIds.length) {
    return {
      employees,
      leaveRequests: [],
      missPunchRequests: [],
      wfhRequests: [],
      offboardingRequests: [],
      leaveBalances: [],
    };
  }
  const leaveRequests = await (await leaveRequestCollection())
    .find({ userId: { $in: teamIds }, status: "pending" })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();
  const missPunchRequests = await (await missPunchCollection())
    .find({ userId: { $in: teamIds }, status: "pending" })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();
  const wfhRequests = await (await wfhRequestCollection())
    .find({ userId: { $in: teamIds }, status: "pending" })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();
  const offboardingRequests = await (await offboardingCollection())
    .find({ userId: { $in: teamIds }, initiatedBy: "employee", status: "pending" })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();

  const leaveBalanceRows: Array<{ userId: string; annualLeave: number; carryForward: number }> = [];
  for (const userId of teamIds) {
    const b = await syncLeaveBalanceFromJoining(userId);
    leaveBalanceRows.push({ userId, annualLeave: b.annualLeave, carryForward: b.carryForward });
  }

  return {
    employees,
    leaveRequests,
    missPunchRequests,
    wfhRequests,
    offboardingRequests,
    leaveBalances: leaveBalanceRows,
  };
}

export async function decideLeaveRequest(input: {
  requestId: string;
  decision: "approve" | "reject";
  actor: { id: string; role: Role };
}): Promise<LeaveRequest> {
  const col = await leaveRequestCollection();
  const doc = await col.findOne({ _id: input.requestId });
  if (!doc) throw new Error("Leave request not found");
  await assertDecisionAllowed(doc, input.actor, input.decision);
  const nowIso = new Date().toISOString();

  if (input.decision === "reject") {
    const rejectPatch =
      input.actor.role === "manager"
        ? { status: "rejected" as const, managerApprovalBy: input.actor.id, managerApprovalAt: nowIso }
        : { status: "rejected" as const, hrApprovalBy: input.actor.id, hrApprovalAt: nowIso };
    await col.updateOne({ _id: input.requestId }, { $set: rejectPatch });
    await syncLeaveBalanceFromJoining(doc.userId);
    return { ...doc, ...rejectPatch };
  }

  if (input.actor.role === "manager") {
    const managerPatch = { managerApprovalBy: input.actor.id, managerApprovalAt: nowIso };
    await col.updateOne({ _id: input.requestId }, { $set: managerPatch });
    return { ...doc, ...managerPatch };
  }

  const finalPatch = { status: "approved" as const, hrApprovalBy: input.actor.id, hrApprovalAt: nowIso };
  await col.updateOne({ _id: input.requestId }, { $set: finalPatch });
  await syncLeaveBalanceFromJoining(doc.userId);
  return { ...doc, ...finalPatch };
}

export async function decideWfhRequest(input: {
  requestId: string;
  decision: "approve" | "reject";
  actor: { id: string; role: Role };
}): Promise<WfhRequest> {
  const col = await wfhRequestCollection();
  const doc = await col.findOne({ _id: input.requestId });
  if (!doc) throw new Error("WFH request not found");
  await assertDecisionAllowed(doc, input.actor, input.decision);
  const nowIso = new Date().toISOString();

  if (input.decision === "reject") {
    const rejectPatch =
      input.actor.role === "manager"
        ? { status: "rejected" as const, managerApprovalBy: input.actor.id, managerApprovalAt: nowIso }
        : { status: "rejected" as const, hrApprovalBy: input.actor.id, hrApprovalAt: nowIso };
    await col.updateOne({ _id: input.requestId }, { $set: rejectPatch });
    return { ...doc, ...rejectPatch };
  }

  if (input.actor.role === "manager") {
    const managerPatch = { managerApprovalBy: input.actor.id, managerApprovalAt: nowIso };
    await col.updateOne({ _id: input.requestId }, { $set: managerPatch });
    return { ...doc, ...managerPatch };
  }

  const finalPatch = { status: "approved" as const, hrApprovalBy: input.actor.id, hrApprovalAt: nowIso };
  await col.updateOne({ _id: input.requestId }, { $set: finalPatch });
  return { ...doc, ...finalPatch };
}

export async function decideMissPunchRequest(input: {
  requestId: string;
  decision: "approve" | "reject";
  actor: { id: string; role: Role };
}): Promise<MissPunchRequest> {
  const col = await missPunchCollection();
  const doc = await col.findOne({ _id: input.requestId });
  if (!doc) throw new Error("Miss punch request not found");
  await assertDecisionAllowed(doc, input.actor, input.decision);
  const nowIso = new Date().toISOString();

  if (input.decision === "reject") {
    const rejectPatch =
      input.actor.role === "manager"
        ? { status: "rejected" as const, managerApprovalBy: input.actor.id, managerApprovalAt: nowIso }
        : { status: "rejected" as const, hrApprovalBy: input.actor.id, hrApprovalAt: nowIso };
    await col.updateOne({ _id: input.requestId }, { $set: rejectPatch });
    return { ...doc, ...rejectPatch };
  }

  if (input.actor.role === "manager") {
    const managerPatch = { managerApprovalBy: input.actor.id, managerApprovalAt: nowIso };
    await col.updateOne({ _id: input.requestId }, { $set: managerPatch });
    return { ...doc, ...managerPatch };
  }

  const status: MissPunchRequest["status"] = "approved";
  const finalPatch = { status, hrApprovalBy: input.actor.id, hrApprovalAt: nowIso };
  await col.updateOne({ _id: input.requestId }, { $set: finalPatch });
  if (status === "approved") {
    await regularizeAttendanceForMissPunch(doc.userId, doc.date, doc.type, nowIso);
  }
  return { ...doc, ...finalPatch };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertHrActor(role: Role) {
  if (role !== "admin" && role !== "hr") throw new Error("Forbidden");
}

async function regularizeAttendanceForMissPunch(
  userId: string,
  date: string,
  type: "punch-in" | "punch-out",
  nowIso = new Date().toISOString(),
) {
  const attendance = await attendanceCollection();
  const existing = await attendance.findOne({ userId, date });
  const day = parseLocalIsoDateOnly(date);
  const defaultIn = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0, 0).toISOString();
  const defaultOut = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 18, 0, 0).toISOString();

  if (!existing) {
    await attendance.insertOne({
      _id: randomUUID(),
      userId,
      date,
      punchIn: defaultIn,
      punchOut: defaultOut,
      workedHours: 9,
      status: "present",
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    return;
  }

  const patch: Partial<AttendanceRecord> = { updatedAt: nowIso, status: "present" };
  if (type === "punch-in" && !existing.punchIn) {
    patch.punchIn = existing.punchOut
      ? new Date(new Date(existing.punchOut).getTime() - 9 * 60 * 60 * 1000).toISOString()
      : defaultIn;
  }
  if (type === "punch-out" && !existing.punchOut) {
    patch.punchOut = existing.punchIn
      ? new Date(new Date(existing.punchIn).getTime() + 9 * 60 * 60 * 1000).toISOString()
      : defaultOut;
  }

  const finalIn = patch.punchIn ?? existing.punchIn ?? defaultIn;
  const finalOut = patch.punchOut ?? existing.punchOut ?? defaultOut;
  const diffMs = Math.max(0, new Date(finalOut).getTime() - new Date(finalIn).getTime());
  patch.workedHours = Number((diffMs / (1000 * 60 * 60)).toFixed(2));

  await attendance.updateOne({ _id: existing._id }, { $set: patch });
}

export async function hrUpdateApprovedLeaveRequest(input: {
  requestId: string;
  fromDate: string;
  toDate: string;
  reason: string;
  actor: { id: string; role: Role };
}): Promise<LeaveRequest> {
  assertHrActor(input.actor.role);
  if (!ISO_DATE.test(input.fromDate) || !ISO_DATE.test(input.toDate)) {
    throw new Error("Dates must be YYYY-MM-DD");
  }
  const reason = input.reason.trim();
  if (!reason) throw new Error("Reason is required");

  const requests = await leaveRequestCollection();
  const existing = await requests.findOne({ _id: input.requestId });
  if (!existing) throw new Error("Leave request not found");
  if (existing.status !== "approved") throw new Error("Only approved leave requests can be edited by HR");

  const days = await calculateLeaveDays(input.fromDate, input.toDate);
  if (days <= 0) throw new Error("Selected dates contain only off days");

  const balance = await syncLeaveBalanceFromJoining(existing.userId);
  const allowed = balance.annualLeave + (existing.compensation === "paid" ? existing.days : 0);
  const compensation: LeaveRequest["compensation"] = days > allowed ? "unpaid" : "paid";

  await requests.updateOne(
    { _id: existing._id },
    {
      $set: {
        fromDate: input.fromDate,
        toDate: input.toDate,
        days,
        reason,
        compensation,
        hrUpdatedBy: input.actor.id,
        hrUpdatedAt: new Date().toISOString(),
      },
    },
  );
  await syncLeaveBalanceFromJoining(existing.userId);
  const updated = await requests.findOne({ _id: existing._id });
  if (!updated) throw new Error("Leave request not found after update");
  return updated;
}

export async function hrUpdateApprovedWfhRequest(input: {
  requestId: string;
  fromDate: string;
  toDate: string;
  reason: string;
  actor: { id: string; role: Role };
}): Promise<WfhRequest> {
  assertHrActor(input.actor.role);
  if (!ISO_DATE.test(input.fromDate) || !ISO_DATE.test(input.toDate)) {
    throw new Error("Dates must be YYYY-MM-DD");
  }
  const reason = input.reason.trim();
  if (!reason) throw new Error("Reason is required");

  const requests = await wfhRequestCollection();
  const existing = await requests.findOne({ _id: input.requestId });
  if (!existing) throw new Error("WFH request not found");
  if (existing.status !== "approved") throw new Error("Only approved WFH requests can be edited by HR");

  const days = await calculateLeaveDays(input.fromDate, input.toDate);
  if (days <= 0) throw new Error("Selected dates contain only off days");

  await requests.updateOne(
    { _id: existing._id },
    {
      $set: {
        fromDate: input.fromDate,
        toDate: input.toDate,
        days,
        reason,
        hrUpdatedBy: input.actor.id,
        hrUpdatedAt: new Date().toISOString(),
      },
    },
  );
  const updated = await requests.findOne({ _id: existing._id });
  if (!updated) throw new Error("WFH request not found after update");
  return updated;
}

export async function hrUpdateApprovedMissPunchRequest(input: {
  requestId: string;
  date: string;
  type: "punch-in" | "punch-out";
  reason: string;
  actor: { id: string; role: Role };
}): Promise<MissPunchRequest> {
  assertHrActor(input.actor.role);
  if (!ISO_DATE.test(input.date)) throw new Error("Date must be YYYY-MM-DD");
  const reason = input.reason.trim();
  if (!reason) throw new Error("Reason is required");

  const requests = await missPunchCollection();
  const existing = await requests.findOne({ _id: input.requestId });
  if (!existing) throw new Error("Miss punch request not found");
  if (existing.status !== "approved") throw new Error("Only approved miss punch requests can be edited by HR");

  const nowIso = new Date().toISOString();
  const attendanceChanged = existing.date !== input.date || existing.type !== input.type;

  await requests.updateOne(
    { _id: existing._id },
    {
      $set: {
        date: input.date,
        type: input.type,
        reason,
        hrUpdatedBy: input.actor.id,
        hrUpdatedAt: nowIso,
      },
    },
  );

  if (attendanceChanged) {
    await regularizeAttendanceForMissPunch(existing.userId, input.date, input.type, nowIso);
  }

  const updated = await requests.findOne({ _id: existing._id });
  if (!updated) throw new Error("Miss punch request not found after update");
  return updated;
}

export async function listMyAssignedAssets(userId: string): Promise<
  Array<{
    assignmentId: string;
    assetId: string;
    name: string;
    category: string;
    value: number;
    qty: number;
    assignedAt: string;
    status: AssetAssignment["status"];
  }>
> {
  const assigns = await assetAssignmentsCollection();
  const assets = await assetsCollection();
  const rows = await assigns
    .find({ userId, status: "assigned" })
    .sort({ assignedAt: -1 })
    .toArray();
  const assetIds = Array.from(new Set(rows.map((r) => r.assetId)));
  const assetDocs = await assets.find({ _id: { $in: assetIds } }).toArray();
  const byId = new Map(assetDocs.map((a) => [a._id, a]));
  return rows
    .map((r) => {
      const a = byId.get(r.assetId);
      if (!a) return null;
      return {
        assignmentId: r._id,
        assetId: r.assetId,
        name: a.name,
        category: a.category,
        value: a.value,
        qty: r.qty,
        assignedAt: r.assignedAt,
        status: r.status,
      };
    })
    .filter(Boolean) as any;
}

export async function listAdminAssets(): Promise<AssetCatalogItem[]> {
  const col = await assetsCollection();
  return col.find({}).sort({ createdAt: -1 }).toArray();
}

export async function createAsset(input: {
  name: string;
  category: string;
  value: number;
  details?: string;
  imageUrl?: string;
  totalQty: number;
}): Promise<AssetCatalogItem> {
  const col = await assetsCollection();
  const qty = Math.floor(Number(input.totalQty));
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantity must be at least 1");
  const doc: AssetCatalogItem = {
    _id: randomUUID(),
    name: input.name.trim(),
    category: input.category.trim(),
    value: Number(input.value),
    details: input.details?.trim() || undefined,
    imageUrl: input.imageUrl?.trim() || undefined,
    totalQty: qty,
    availableQty: qty,
    createdAt: new Date().toISOString(),
  };
  await col.insertOne(doc);
  return doc;
}

export async function createAssetRequest(input: {
  userId: string;
  assetId: string;
  qty: number;
  reason: string;
}): Promise<AssetRequest> {
  const assets = await assetsCollection();
  const asset = await assets.findOne({ _id: input.assetId });
  if (!asset) throw new Error("Asset not found");
  const qty = Math.floor(Number(input.qty));
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantity must be at least 1");
  if (qty > asset.availableQty) throw new Error("Requested quantity exceeds available stock");
  const col = await assetRequestsCollection();
  const doc: AssetRequest = {
    _id: randomUUID(),
    userId: input.userId,
    assetId: input.assetId,
    qty,
    reason: input.reason.trim(),
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  await col.insertOne(doc);
  return doc;
}

export async function listMyAssetRequests(userId: string): Promise<AssetRequest[]> {
  const col = await assetRequestsCollection();
  return col.find({ userId }).sort({ createdAt: -1 }).limit(30).toArray();
}

export async function listAdminAssetRequests(): Promise<AssetRequest[]> {
  const col = await assetRequestsCollection();
  return col.find({}).sort({ createdAt: -1 }).limit(100).toArray();
}

export async function decideAssetRequest(input: {
  requestId: string;
  decision: "approve" | "reject";
  decisionReason?: string;
}): Promise<AssetRequest> {
  const requests = await assetRequestsCollection();
  const assets = await assetsCollection();
  const assigns = await assetAssignmentsCollection();
  const req = await requests.findOne({ _id: input.requestId });
  if (!req) throw new Error("Asset request not found");
  if (req.status !== "pending") throw new Error("This request is no longer pending");

  if (input.decision === "reject") {
    await requests.updateOne(
      { _id: req._id },
      {
        $set: {
          status: "rejected",
          decidedAt: new Date().toISOString(),
          decisionReason: input.decisionReason,
        },
      },
    );
    return { ...req, status: "rejected" };
  }

  // Approve: ensure stock then assign
  const asset = await assets.findOne({ _id: req.assetId });
  if (!asset) throw new Error("Asset not found");
  if (req.qty > asset.availableQty) throw new Error("Insufficient available stock");

  await assets.updateOne({ _id: asset._id }, { $inc: { availableQty: -req.qty } });
  await assigns.insertOne({
    _id: randomUUID(),
    userId: req.userId,
    assetId: req.assetId,
    qty: req.qty,
    assignedAt: new Date().toISOString(),
    status: "assigned",
  });

  await requests.updateOne(
    { _id: req._id },
    {
      $set: {
        status: "approved",
        decidedAt: new Date().toISOString(),
        decisionReason: input.decisionReason,
      },
    },
  );
  return { ...req, status: "approved" };
}

export async function deleteAssetCatalogItem(assetId: string): Promise<void> {
  const assets = await assetsCollection();
  const assigns = await assetAssignmentsCollection();
  const requests = await assetRequestsCollection();

  const asset = await assets.findOne({ _id: assetId });
  if (!asset) throw new Error("Asset not found");

  const hasActiveAssignments = await assigns.countDocuments({ assetId, status: "assigned" });
  if (hasActiveAssignments > 0) {
    throw new Error("Cannot delete: asset is currently assigned to employees");
  }

  const hasPendingRequests = await requests.countDocuments({ assetId, status: "pending" });
  if (hasPendingRequests > 0) {
    throw new Error("Cannot delete: there are pending requests for this asset");
  }

  if (asset.availableQty !== asset.totalQty) {
    throw new Error("Cannot delete: stock has been used previously");
  }

  await assets.deleteOne({ _id: assetId });
}

async function buildAssetClearanceForUser(userId: string): Promise<OffboardingAssetClearance[]> {
  const assigns = await assetAssignmentsCollection();
  const assets = await assetsCollection();
  const rows = await assigns.find({ userId, status: "assigned" }).toArray();
  const assetIds = Array.from(new Set(rows.map((r) => r.assetId)));
  const assetDocs = await assets.find({ _id: { $in: assetIds } }).toArray();
  const byId = new Map(assetDocs.map((a) => [a._id, a]));
  return rows
    .map((r) => {
      const a = byId.get(r.assetId);
      if (!a) return null;
      return {
        assetId: r._id, // assignment id (unique per employee)
        assetName: `${a.name} × ${r.qty}`,
        actionRequired: "return" as const,
        amountDue: a.value * r.qty,
        cleared: false,
      };
    })
    .filter(Boolean) as any;
}

export async function createResignationRequest(input: {
  userId: string;
  lastWorkingDay: string;
  reason: string;
}): Promise<OffboardingRequest> {
  if (!ISO_DATE.test(input.lastWorkingDay)) throw new Error("Invalid last working day");
  const col = await offboardingCollection();
  const existing = await col.findOne({ userId: input.userId, status: "pending" });
  if (existing) throw new Error("You already have a pending offboarding request");

  const assetClearance = await buildAssetClearanceForUser(input.userId);
  const managerId = await resolveReportingManagerId(input.userId);
  const doc: OffboardingRequest = {
    _id: randomUUID(),
    userId: input.userId,
    type: "resignation",
    lastWorkingDay: input.lastWorkingDay,
    reason: input.reason.trim(),
    managerId,
    status: "pending",
    initiatedBy: "employee",
    createdAt: new Date().toISOString(),
    assetClearance,
  };
  await col.insertOne(doc);
  return doc;
}

export async function createTerminationRequest(input: {
  userId: string;
  lastWorkingDay: string;
  reason: string;
}): Promise<OffboardingRequest> {
  if (!ISO_DATE.test(input.lastWorkingDay)) throw new Error("Invalid last working day");
  const col = await offboardingCollection();
  const existing = await col.findOne({ userId: input.userId, status: "pending" });
  if (existing) throw new Error("Employee already has a pending offboarding request");

  const assetClearance = await buildAssetClearanceForUser(input.userId);
  const doc: OffboardingRequest = {
    _id: randomUUID(),
    userId: input.userId,
    type: "termination",
    lastWorkingDay: input.lastWorkingDay,
    reason: input.reason.trim(),
    status: "pending",
    initiatedBy: "admin",
    createdAt: new Date().toISOString(),
    assetClearance,
  };
  await col.insertOne(doc);
  return doc;
}

export async function getMyOffboardingRequest(userId: string): Promise<OffboardingRequest | null> {
  const col = await offboardingCollection();
  return col.find({ userId }).sort({ createdAt: -1 }).limit(1).next();
}

export async function listAdminOffboardingRequests(): Promise<OffboardingRequest[]> {
  const col = await offboardingCollection();
  return col.find({}).sort({ createdAt: -1 }).limit(100).toArray();
}

export async function setOffboardingAssetAction(input: {
  requestId: string;
  assetId: string;
  actionRequired: "return" | "pay";
}): Promise<OffboardingRequest> {
  const col = await offboardingCollection();
  const doc = await col.findOne({ _id: input.requestId });
  if (!doc) throw new Error("Offboarding request not found");
  if (doc.status !== "pending") throw new Error("This request is no longer pending");
  const next = doc.assetClearance.map((a) =>
    a.assetId === input.assetId ? { ...a, actionRequired: input.actionRequired } : a,
  );
  await col.updateOne({ _id: input.requestId }, { $set: { assetClearance: next } });
  const updated = await col.findOne({ _id: input.requestId });
  if (!updated) throw new Error("Offboarding request not found after update");
  return updated;
}

export async function clearOffboardingAsset(input: {
  requestId: string;
  assetId: string;
  clearAs: "returned" | "paid";
}): Promise<OffboardingRequest> {
  const col = await offboardingCollection();
  const doc = await col.findOne({ _id: input.requestId });
  if (!doc) throw new Error("Offboarding request not found");
  if (doc.status !== "pending") throw new Error("This request is no longer pending");

  const now = new Date().toISOString();
  const next = doc.assetClearance.map((a) =>
    a.assetId === input.assetId ? { ...a, cleared: true, clearedAt: now } : a,
  );
  await col.updateOne({ _id: input.requestId }, { $set: { assetClearance: next } });

  // When cleared, update the assignment and return stock if returned.
  const assigns = await assetAssignmentsCollection();
  const assetsCol = await assetsCollection();
  const assignment = await assigns.findOne({ _id: input.assetId, userId: doc.userId });
  if (assignment) {
    const status: AssetAssignment["status"] = input.clearAs === "returned" ? "returned" : "paid";
    await assigns.updateOne(
      { _id: assignment._id },
      { $set: { status, resolvedAt: now, offboardingRequestId: doc._id } },
    );
    if (status === "returned") {
      await assetsCol.updateOne({ _id: assignment.assetId }, { $inc: { availableQty: assignment.qty } });
    }
  }

  const updated = await col.findOne({ _id: input.requestId });
  if (!updated) throw new Error("Offboarding request not found after update");
  return updated;
}

export async function decideOffboardingRequest(input: {
  requestId: string;
  decision: "approve" | "reject";
  actor: { id: string; role: Role };
  decisionReason?: string;
}): Promise<OffboardingRequest> {
  const col = await offboardingCollection();
  const doc = await col.findOne({ _id: input.requestId });
  if (!doc) throw new Error("Offboarding request not found");
  if (doc.status !== "pending") throw new Error("This request is no longer pending");
  const nowIso = new Date().toISOString();

  if (input.actor.role === "manager") {
    const managerId = doc.managerId || (await resolveReportingManagerId(doc.userId));
    if (!managerId || managerId !== input.actor.id) {
      throw new Error("Only assigned manager can decide this resignation");
    }
    if (doc.managerApprovalAt) {
      throw new Error("Manager has already approved this resignation");
    }
    if (input.decision === "reject") {
      await col.updateOne(
        { _id: input.requestId },
        {
          $set: {
            status: "rejected",
            managerApprovalBy: input.actor.id,
            managerApprovalAt: nowIso,
            decisionReason: input.decisionReason,
          },
        },
      );
      return { ...doc, status: "rejected", managerApprovalBy: input.actor.id, managerApprovalAt: nowIso };
    }
    await col.updateOne(
      { _id: input.requestId },
      {
        $set: {
          managerApprovalBy: input.actor.id,
          managerApprovalAt: nowIso,
          decisionReason: input.decisionReason,
        },
      },
    );
    return { ...doc, managerApprovalBy: input.actor.id, managerApprovalAt: nowIso };
  }

  if (input.actor.role !== "admin" && input.actor.role !== "hr") {
    throw new Error("Forbidden");
  }

  if (input.decision === "approve") {
    const uncleared = doc.assetClearance.filter((a) => !a.cleared);
    if (uncleared.length) {
      throw new Error("Asset clearance is pending. Mark assets as returned/paid before approving.");
    }
  }

  const nextStatus: OffboardingRequest["status"] =
    input.decision === "approve" ? "approved" : "rejected";
  await col.updateOne(
    { _id: input.requestId },
    {
      $set: {
        status: nextStatus,
        hrApprovalBy: input.actor.id,
        hrApprovalAt: nowIso,
        decidedAt: nowIso,
        decisionReason: input.decisionReason,
      },
    },
  );
  const updated = await col.findOne({ _id: input.requestId });
  if (!updated) throw new Error("Offboarding request not found after update");
  return updated;
}

function matchesNameQuery(
  username: string,
  fullName: string | undefined,
  queryLower: string,
): boolean {
  if (!queryLower) return true;
  const u = username.toLowerCase();
  const n = (fullName ?? "").toLowerCase();
  return u.includes(queryLower) || n.includes(queryLower);
}

/** Single-day: one row per employee. Range: one row per attendance record. */
export async function getAdminAttendance(params: {
  fromDate: string;
  toDate: string;
  nameQuery: string;
}): Promise<
  | {
      view: "day";
      date: string;
      rows: Array<{
        userId: string;
        employeeName: string;
        username: string;
        date: string;
        workedHours: number | null;
        status: string | null;
        punchIn: string | null;
        punchOut: string | null;
        hasRecord: boolean;
      }>;
    }
  | {
      view: "range";
      rows: Array<{
        _id: string;
        userId: string;
        employeeName: string;
        username: string;
        date: string;
        workedHours: number;
        status: string;
        punchIn?: string;
        punchOut?: string;
      }>;
    }
> {
  const { fromDate, toDate, nameQuery } = params;
  if (!ISO_DATE.test(fromDate) || !ISO_DATE.test(toDate)) {
    throw new Error("Dates must be YYYY-MM-DD");
  }
  if (fromDate > toDate) {
    throw new Error("From date cannot be after to date");
  }

  const maxSpanDays = 400;
  const start = new Date(fromDate + "T12:00:00");
  const end = new Date(toDate + "T12:00:00");
  const span =
    Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (span > maxSpanDays) {
    throw new Error(`Date range cannot exceed ${maxSpanDays} days`);
  }

  const employees = await listEmployees();
  const q = nameQuery.trim().toLowerCase();

  if (fromDate === toDate) {
    const date = fromDate;
    const roster = employees
      .filter((e) => matchesNameQuery(e.username, e.profile?.fullName, q))
      .map((e) => ({
        userId: e.id,
        display: e.profile?.fullName?.trim() || e.username,
        username: e.username,
      }))
      .sort((a, b) => a.display.localeCompare(b.display, undefined, { sensitivity: "base" }));

    const attendance = await attendanceCollection();
    const records = await attendance.find({ date }).toArray();
    const byUser = new Map(records.map((r) => [r.userId, r]));

    const rows = roster.map((emp) => {
      const r = byUser.get(emp.userId);
      return {
        userId: emp.userId,
        employeeName: emp.display,
        username: emp.username,
        date,
        workedHours: r ? r.workedHours : null,
        status: r ? r.status : null,
        punchIn: r?.punchIn ?? null,
        punchOut: r?.punchOut ?? null,
        hasRecord: !!r,
      };
    });

    return { view: "day", date, rows };
  }

  const attendance = await attendanceCollection();
  const filter: { date: { $gte: string; $lte: string }; userId?: { $in: string[] } } = {
    date: { $gte: fromDate, $lte: toDate },
  };

  if (q) {
    const ids = employees
      .filter((e) => matchesNameQuery(e.username, e.profile?.fullName, q))
      .map((e) => e.id);
    if (!ids.length) {
      return { view: "range", rows: [] };
    }
    filter.userId = { $in: ids };
  }

  const recs = await attendance
    .find(filter)
    .sort({ date: -1, userId: 1 })
    .limit(2000)
    .toArray();

  const empMap = new Map(employees.map((e) => [e.id, e]));

  const rows = recs.map((r) => {
    const emp = empMap.get(r.userId);
    const employeeName = emp?.profile?.fullName?.trim() || emp?.username || r.userId;
    return {
      _id: r._id,
      userId: r.userId,
      employeeName,
      username: emp?.username ?? "",
      date: r.date,
      workedHours: r.workedHours,
      status: r.status,
      punchIn: r.punchIn,
      punchOut: r.punchOut,
    };
  });

  return { view: "range", rows };
}

interface Project {
  _id: string;
  name: string;
  description?: string;
  createdAt: string;
}

async function projectsCollection(): Promise<Collection<Project>> {
  const db = await getDb();
  return db.collection<Project>("projects");
}

export async function findProjectById(projectId: string): Promise<Project | null> {
  const col = await projectsCollection();
  return col.findOne({ _id: projectId });
}

export async function createProject(input: { name: string; description?: string }): Promise<Project> {
  const name = input.name.trim();
  if (!name) throw new Error("Project name is required");
  const col = await projectsCollection();
  const doc: Project = {
    _id: randomUUID(),
    name,
    description: input.description?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  await col.insertOne(doc);
  return doc;
}

export async function listProjectsWithMemberCounts(): Promise<
  Array<Project & { memberCount: number }>
> {
  const col = await projectsCollection();
  const projects = await col.find({}).sort({ name: 1 }).toArray();
  const db = await getDb();
  const usersCol = db.collection("users");
  const agg = await usersCol
    .aggregate<{ _id: string; count: number }>([
      {
        $match: {
          role: { $in: ["employee", "manager"] },
          "profile.projectId": { $exists: true, $nin: ["", null] },
        },
      },
      { $group: { _id: "$profile.projectId", count: { $sum: 1 } } },
    ])
    .toArray();
  const byId = new Map(agg.map((a) => [a._id, a.count]));
  return projects.map((p) => ({ ...p, memberCount: byId.get(p._id) ?? 0 }));
}

export async function getProjectTeamDashboard(projectId: string): Promise<{
  project: Project;
  monthLabel: string;
  members: Array<{
    userId: string;
    username: string;
    fullName: string;
    role: Role;
    annualLeave: number;
    carryForward: number;
    monthWorkedHours: number;
  }>;
}> {
  const project = await findProjectById(projectId);
  if (!project) throw new Error("Project not found");

  const employees = await listEmployees();
  const members = employees.filter(
    (e) => usesEmployeePortal(e.role) && e.profile?.projectId === projectId,
  );
  const ids = members.map((m) => m.id);

  const now = new Date();
  const y = now.getFullYear();
  const mo = now.getMonth();
  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  const monthStart = `${y}-${String(mo + 1).padStart(2, "0")}-01`;
  const monthEnd = `${y}-${String(mo + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const monthLabel = `${y}-${String(mo + 1).padStart(2, "0")}`;

  const attendance = await attendanceCollection();
  const recs = ids.length
    ? await attendance
        .find({ userId: { $in: ids }, date: { $gte: monthStart, $lte: monthEnd } })
        .toArray()
    : [];
  const hoursByUser = new Map<string, number>();
  for (const r of recs) {
    hoursByUser.set(r.userId, (hoursByUser.get(r.userId) ?? 0) + (r.workedHours || 0));
  }

  const rows: Array<{
    userId: string;
    username: string;
    fullName: string;
    role: Role;
    annualLeave: number;
    carryForward: number;
    monthWorkedHours: number;
  }> = [];
  for (const mem of members) {
    const b = await syncLeaveBalanceFromJoining(mem.id);
    const raw = hoursByUser.get(mem.id) ?? 0;
    rows.push({
      userId: mem.id,
      username: mem.username,
      fullName: mem.profile?.fullName?.trim() || mem.username,
      role: mem.role,
      annualLeave: b.annualLeave,
      carryForward: b.carryForward,
      monthWorkedHours: Number(raw.toFixed(2)),
    });
  }
  rows.sort((a, b) => a.fullName.localeCompare(b.fullName, undefined, { sensitivity: "base" }));

  return { project, monthLabel, members: rows };
}

/** HR home dashboard: headcount, salary rollups (from `salary_records`), and pending action counts. */
export interface AdminDashboardStats {
  totalWorkforce: number;
  /** Employee or manager accounts created in the last 30 days. */
  newHires30d: number;
  /** Mean years since `joiningDate` among staff with a valid date (employee + manager); null if none. */
  sidebarAvgTenureYears: number | null;
  /** Count of rows in `projects` (shown as “Clients” in the sidebar). */
  sidebarProjectCount: number;
  latestSalaryPeriod: string | null;
  totalNetPayLatestPeriod: number;
  avgNetPayLatestPeriod: number;
  /** Up to six most recent payroll months with data, oldest first (for charts). */
  salaryTrend: Array<{ period: string; totalNet: number }>;
  pendingLeave: number;
  pendingWfh: number;
  pendingMissPunch: number;
  pendingOffboarding: number;
}

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  const employees = await listEmployees();
  const workforce = employees.filter((e) => e.role === "employee" || e.role === "manager");
  const thirtyAgoMs = Date.now() - 30 * 86400000;
  const thirtyAgoIso = new Date(thirtyAgoMs).toISOString();
  const newHires30d = workforce.filter((e) => (e.createdAt ?? "") >= thirtyAgoIso).length;

  const YEAR_MS = 365.25 * 86400000;
  const tenureYears: number[] = [];
  for (const e of workforce) {
    const jd = (e.profile?.joiningDate ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(jd)) continue;
    const y = Number(jd.slice(0, 4));
    const mo = Number(jd.slice(5, 7)) - 1;
    const day = Number(jd.slice(8, 10));
    const join = new Date(y, mo, day);
    if (Number.isNaN(join.getTime())) continue;
    if (join.getTime() > Date.now()) continue;
    tenureYears.push((Date.now() - join.getTime()) / YEAR_MS);
  }
  const sidebarAvgTenureYears =
    tenureYears.length > 0
      ? Math.round((tenureYears.reduce((a, b) => a + b, 0) / tenureYears.length) * 10) / 10
      : null;

  const sidebarProjectCount = await (await projectsCollection()).countDocuments({});

  const db = await getDb();
  const salaryCol = db.collection<{ period: string; netPay: number }>("salary_records");
  const grouped = await salaryCol
    .aggregate<{ _id: string; totalNet: number; cnt: number }>([
      { $group: { _id: "$period", totalNet: { $sum: "$netPay" }, cnt: { $sum: 1 } } },
      { $sort: { _id: -1 } },
      { $limit: 12 },
    ])
    .toArray();

  const latest = grouped[0];
  const latestSalaryPeriod = latest?._id ?? null;
  const totalNet = latest?.totalNet ?? 0;
  const cnt = latest?.cnt ?? 0;
  const totalNetPayLatestPeriod = Math.round(totalNet * 100) / 100;
  const avgNetPayLatestPeriod = cnt > 0 ? Math.round((totalNet / cnt) * 100) / 100 : 0;

  const lastSixDesc = grouped.slice(0, 6);
  const salaryTrend = [...lastSixDesc].reverse().map((r) => ({
    period: r._id,
    totalNet: Math.round(r.totalNet * 100) / 100,
  }));

  const [leaveCol, wfhCol, missCol, offCol] = await Promise.all([
    leaveRequestCollection(),
    wfhRequestCollection(),
    missPunchCollection(),
    offboardingCollection(),
  ]);
  const [pendingLeave, pendingWfh, pendingMissPunch, pendingOffboarding] = await Promise.all([
    leaveCol.countDocuments({ status: "pending" }),
    wfhCol.countDocuments({ status: "pending" }),
    missCol.countDocuments({ status: "pending" }),
    offCol.countDocuments({ status: "pending" }),
  ]);

  return {
    totalWorkforce: workforce.length,
    newHires30d,
    sidebarAvgTenureYears,
    sidebarProjectCount,
    latestSalaryPeriod,
    totalNetPayLatestPeriod,
    avgNetPayLatestPeriod,
    salaryTrend,
    pendingLeave,
    pendingWfh,
    pendingMissPunch,
    pendingOffboarding,
  };
}
