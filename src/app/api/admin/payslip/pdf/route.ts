import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { buildPayslipPdf } from "@/lib/payslip-pdf";
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
    const snapshot = await getPayslipSnapshot(userId, period);
    const pdf = buildPayslipPdf(snapshot);
    const filename = `payslip-${snapshot.employee.username}-${period}.pdf`;
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not build PDF" },
      { status: 400 },
    );
  }
}
