import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { listAdminHolidaysForMonth, setHolidayTreatment } from "@/lib/hr-repo";
import { usesAdminPortal } from "@/lib/roles";

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesAdminPortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const yearRaw = searchParams.get("year");
  const monthRaw = searchParams.get("month");
  const now = new Date();
  const year = yearRaw ? Number(yearRaw) : now.getFullYear();
  const month = monthRaw ? Number(monthRaw) - 1 : now.getMonth();
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }
  if (!Number.isFinite(month) || month < 0 || month > 11) {
    return NextResponse.json({ error: "Invalid month (use 1–12)" }, { status: 400 });
  }

  const holidays = await listAdminHolidaysForMonth(year, month);
  return NextResponse.json({ year, month: month + 1, holidays });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesAdminPortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const date = String(body.date ?? "");
  const treatment = body.treatment as "holiday" | "working";
  if (!date || !["holiday", "working"].includes(treatment)) {
    return NextResponse.json(
      { error: "Body must include date (YYYY-MM-DD) and treatment (holiday | working)" },
      { status: 400 },
    );
  }

  try {
    await setHolidayTreatment(date, treatment);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed" },
      { status: 400 },
    );
  }
}
