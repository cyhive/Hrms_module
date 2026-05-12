import { randomUUID } from "crypto";
import { Collection } from "mongodb";
import { computeEmployeeMonthAttendancePayroll } from "./hr-repo";
import { getDb } from "./mongodb";
import { usesEmployeePortal } from "./roles";
import type { MonthEndPayrollRow, PayslipSnapshot, SalaryRecord } from "./types";
import { findUserById, listEmployees } from "./user-repo";

interface SalaryRecordDoc {
  _id: string;
  userId: string;
  period: string;
  basePay: number;
  deductions: number;
  netPay: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
}

async function salaryCollection(): Promise<Collection<SalaryRecordDoc>> {
  const db = await getDb();
  const col = db.collection<SalaryRecordDoc>("salary_records");
  await col.createIndex({ userId: 1, period: 1 }, { unique: true });
  return col;
}

function toPublic(doc: SalaryRecordDoc): SalaryRecord {
  return {
    id: doc._id,
    userId: doc.userId,
    period: doc.period,
    basePay: doc.basePay,
    deductions: doc.deductions,
    netPay: doc.netPay,
    ...(doc.notes ? { notes: doc.notes } : {}),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    createdByUserId: doc.createdByUserId,
  };
}

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function parseMoney(raw: unknown, field: string): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw < 0) throw new Error(`${field} cannot be negative`);
    return Math.round(raw * 100) / 100;
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${field} must be a non-negative number`);
    return Math.round(n * 100) / 100;
  }
  throw new Error(`${field} is required`);
}

export async function listSalaryRecords(options: {
  userId?: string;
  limit?: number;
}): Promise<SalaryRecord[]> {
  const col = await salaryCollection();
  const filter = options.userId?.trim() ? { userId: options.userId.trim() } : {};
  const limit = Math.min(Math.max(options.limit ?? 500, 1), 1000);
  const rows = await col.find(filter).sort({ period: -1, userId: 1 }).limit(limit).toArray();
  return rows.map(toPublic);
}

export async function upsertSalaryRecord(input: {
  userId: string;
  period: string;
  basePay: unknown;
  deductions: unknown;
  netPay: unknown;
  notes?: unknown;
  actorUserId: string;
}): Promise<SalaryRecord> {
  const period = String(input.period ?? "").trim();
  if (!PERIOD_RE.test(period)) {
    throw new Error("Period must be YYYY-MM (e.g. 2026-05)");
  }
  const userId = String(input.userId ?? "").trim();
  if (!userId) throw new Error("userId is required");

  const user = await findUserById(userId);
  if (!user) throw new Error("User not found");

  const basePay = parseMoney(input.basePay, "basePay");
  const deductions = parseMoney(input.deductions, "deductions");
  const netPay = parseMoney(input.netPay, "netPay");

  const notesRaw = input.notes === undefined || input.notes === null ? "" : String(input.notes);
  const notes = notesRaw.trim().slice(0, 500);

  const col = await salaryCollection();
  const now = new Date().toISOString();
  const existing = await col.findOne({ userId, period });
  const _id = existing?._id ?? randomUUID();
  const createdAt = existing?.createdAt ?? now;
  const createdByUserId = existing?.createdByUserId ?? input.actorUserId;

  const doc: SalaryRecordDoc = {
    _id,
    userId,
    period,
    basePay,
    deductions,
    netPay,
    notes,
    createdAt,
    updatedAt: now,
    createdByUserId,
  };

  await col.replaceOne({ userId, period }, doc, { upsert: true });

  const saved = await col.findOne({ userId, period });
  if (!saved) throw new Error("Could not save salary record");
  return toPublic(saved);
}

export async function findSalaryRecordByUserPeriod(
  userId: string,
  period: string,
): Promise<SalaryRecord | null> {
  const p = period.trim();
  if (!PERIOD_RE.test(p)) return null;
  const col = await salaryCollection();
  const doc = await col.findOne({ userId: userId.trim(), period: p });
  return doc ? toPublic(doc) : null;
}

export async function listMonthEndPayrollRows(
  period: string,
  filters?: { userId?: string; department?: string },
): Promise<MonthEndPayrollRow[]> {
  const p = period.trim();
  if (!PERIOD_RE.test(p)) {
    throw new Error("Period must be YYYY-MM (e.g. 2026-05)");
  }
  const staff = await listEmployees();
  const rows: MonthEndPayrollRow[] = [];

  for (const e of staff) {
    const rec = await findSalaryRecordByUserPeriod(e.id, p);
    const basePay = rec?.basePay ?? 0;
    const otherDeductions = rec?.deductions ?? 0;

    const attendance = usesEmployeePortal(e.role)
      ? await computeEmployeeMonthAttendancePayroll(e.id, p, basePay)
      : null;

    const attendanceTotalDeduction =
      (attendance?.unpaidLeaveDeduction ?? 0) + (attendance?.lopDeduction ?? 0);
    const computedNet =
      Math.round((basePay - otherDeductions - attendanceTotalDeduction) * 100) / 100;

    rows.push({
      period: p,
      userId: e.id,
      username: e.username,
      displayName: e.profile?.fullName?.trim() || e.username,
      role: e.role,
      department: e.profile?.department?.trim() || undefined,
      basePay,
      otherDeductions,
      storedNetPay: rec ? rec.netPay : null,
      attendance,
      computedNet,
    });
  }

  rows.sort((a, b) =>
    (a.displayName || a.username).localeCompare(b.displayName || b.username, undefined, {
      sensitivity: "base",
    }),
  );

  let out = rows;
  const uid = filters?.userId?.trim();
  if (uid) {
    out = out.filter((r) => r.userId === uid);
  }
  const dept = filters?.department;
  if (dept !== undefined && dept !== "") {
    const raw = dept.trim();
    if (raw === "__none__") {
      out = out.filter((r) => !(r.department ?? "").trim());
    } else {
      const want = raw.toLowerCase();
      out = out.filter((r) => (r.department ?? "").trim().toLowerCase() === want);
    }
  }

  return out;
}

function periodDisplayLabel(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period.trim());
  if (!m) return period;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  if (Number.isNaN(d.getTime())) return period;
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}

export async function getPayslipSnapshot(userId: string, period: string): Promise<PayslipSnapshot> {
  const uid = userId.trim();
  const p = period.trim();
  if (!uid) throw new Error("userId is required");
  if (!PERIOD_RE.test(p)) throw new Error("Period must be YYYY-MM (e.g. 2026-05)");

  const user = await findUserById(uid);
  if (!user) throw new Error("User not found");

  const rec = await findSalaryRecordByUserPeriod(uid, p);
  const basePay = rec?.basePay ?? 0;
  const otherDeductions = rec?.deductions ?? 0;

  const attendance = usesEmployeePortal(user.role)
    ? await computeEmployeeMonthAttendancePayroll(uid, p, basePay)
    : null;

  const attendanceTotalDeduction =
    (attendance?.unpaidLeaveDeduction ?? 0) + (attendance?.lopDeduction ?? 0);
  const computedNet =
    Math.round((basePay - otherDeductions - attendanceTotalDeduction) * 100) / 100;

  const prof = user.profile;
  const displayName = prof?.fullName?.trim() || user.username;

  const earnings: PayslipSnapshot["earnings"] = [];
  if (basePay > 0) earnings.push({ label: "Base salary", amount: basePay });
  else earnings.push({ label: "Base salary (not set for this month)", amount: 0 });

  const deductions: PayslipSnapshot["deductions"] = [];
  if (attendance) {
    if (attendance.unpaidLeaveDeduction > 0) {
      deductions.push({
        label: `Unpaid leave (${attendance.unpaidLeaveWorkingDays} day(s) × daily rate)`,
        amount: attendance.unpaidLeaveDeduction,
      });
    }
    if (attendance.lopDeduction > 0) {
      deductions.push({
        label: `LOP / attendance (${attendance.lopDays} day(s) × daily rate)`,
        amount: attendance.lopDeduction,
      });
    }
  }
  if (otherDeductions > 0) {
    deductions.push({ label: "Other deductions (from salary record)", amount: otherDeductions });
  }

  return {
    companyName: "LUCID",
    period: p,
    periodLabel: periodDisplayLabel(p),
    generatedAt: new Date().toISOString(),
    employee: {
      userId: uid,
      username: user.username,
      displayName,
      role: user.role,
      ...(prof?.email ? { email: prof.email } : {}),
      ...(prof?.phone ? { phone: prof.phone } : {}),
      ...(prof?.department ? { department: prof.department } : {}),
      ...(prof?.designation ? { designation: prof.designation } : {}),
      ...(prof?.joiningDate ? { joiningDate: prof.joiningDate } : {}),
    },
    salaryRecord: rec,
    basePay,
    otherDeductions,
    storedNetPay: rec ? rec.netPay : null,
    attendance,
    computedNet,
    earnings,
    deductions,
  };
}
