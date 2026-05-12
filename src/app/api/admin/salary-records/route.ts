import { NextRequest, NextResponse } from "next/server";
import { recordActivity } from "@/lib/activity-repo";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { usesAdminPortal } from "@/lib/roles";
import { listSalaryRecords, upsertSalaryRecord } from "@/lib/salary-repo";
import { findUserById } from "@/lib/user-repo";

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesAdminPortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const userId = req.nextUrl.searchParams.get("userId")?.trim() ?? "";
  try {
    const records = await listSalaryRecords({
      userId: userId || undefined,
    });
    return NextResponse.json({ records });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load salary records" },
      { status: 500 },
    );
  }
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
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  try {
    const record = await upsertSalaryRecord({
      userId: String(b.userId ?? ""),
      period: String(b.period ?? ""),
      basePay: b.basePay,
      deductions: b.deductions,
      netPay: b.netPay,
      notes: b.notes,
      actorUserId: user.id,
    });
    const target = await findUserById(record.userId);
    const label = target?.profile?.fullName?.trim() || target?.username || record.userId;
    void recordActivity({
      actorUserId: user.id,
      actorUsername: user.username,
      kind: "salary.upsert",
      message: `Salary ${record.period} for ${label}: base ${record.basePay}, deductions ${record.deductions}, net ${record.netPay}`,
    });
    return NextResponse.json({ record });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save salary record" },
      { status: 400 },
    );
  }
}
