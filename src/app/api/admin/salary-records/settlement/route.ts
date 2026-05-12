import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { usesAdminPortal } from "@/lib/roles";
import { listMonthEndPayrollRows } from "@/lib/salary-repo";

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesAdminPortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const period = req.nextUrl.searchParams.get("period")?.trim() ?? "";
  if (!period) {
    return NextResponse.json({ error: "period query is required (YYYY-MM)" }, { status: 400 });
  }

  const userId = req.nextUrl.searchParams.get("userId")?.trim();
  const departmentRaw = req.nextUrl.searchParams.get("department");
  const filters: { userId?: string; department?: string } = {};
  if (userId) filters.userId = userId;
  if (departmentRaw !== null && departmentRaw !== "") {
    filters.department = departmentRaw.trim();
  }

  try {
    const settlements = await listMonthEndPayrollRows(
      period,
      Object.keys(filters).length ? filters : undefined,
    );
    return NextResponse.json({ settlements });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not compute settlement" },
      { status: 400 },
    );
  }
}
