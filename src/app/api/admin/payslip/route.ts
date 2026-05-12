import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { usesAdminPortal } from "@/lib/roles";
import { getPayslipSnapshot } from "@/lib/salary-repo";

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesAdminPortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = req.nextUrl.searchParams.get("userId")?.trim() ?? "";
  const period = req.nextUrl.searchParams.get("period")?.trim() ?? "";
  if (!userId || !period) {
    return NextResponse.json({ error: "userId and period are required" }, { status: 400 });
  }

  try {
    const payslip = await getPayslipSnapshot(userId, period);
    return NextResponse.json({ payslip });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load payslip" },
      { status: 400 },
    );
  }
}
