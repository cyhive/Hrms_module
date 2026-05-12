import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { usesEmployeePortal } from "@/lib/roles";
import { getPayslipSnapshot } from "@/lib/salary-repo";

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesEmployeePortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const period = req.nextUrl.searchParams.get("period")?.trim() ?? "";
  if (!period) {
    return NextResponse.json({ error: "period is required (YYYY-MM)" }, { status: 400 });
  }

  try {
    const payslip = await getPayslipSnapshot(user.id, period);
    return NextResponse.json({ payslip });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load payslip" },
      { status: 400 },
    );
  }
}
