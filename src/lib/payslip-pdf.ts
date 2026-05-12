import { jsPDF } from "jspdf";
import type { PayslipSnapshot } from "./types";

function money(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Basic A4 payslip PDF (single page). */
export function buildPayslipPdf(snapshot: PayslipSnapshot): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = margin;

  const title = (text: string, size = 14) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.text(text, margin, y);
    y += size + 8;
    doc.setFont("helvetica", "normal");
  };
  const line = (text: string, size = 10) => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, pageW - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * (size + 4);
  };
  const row = (left: string, right: string, size = 10) => {
    doc.setFontSize(size);
    doc.text(left, margin, y);
    doc.text(right, pageW - margin, y, { align: "right" });
    y += size + 6;
  };

  title(snapshot.companyName, 18);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Payslip — ${snapshot.periodLabel}`, margin, y);
  y += 22;
  line(`Generated: ${new Date(snapshot.generatedAt).toLocaleString()}`, 9);
  y += 8;

  title("Employee", 12);
  line(`${snapshot.employee.displayName} (@${snapshot.employee.username})`);
  line(`Role: ${snapshot.employee.role}`);
  if (snapshot.employee.department) line(`Department: ${snapshot.employee.department}`);
  if (snapshot.employee.designation) line(`Designation: ${snapshot.employee.designation}`);
  if (snapshot.employee.joiningDate) line(`Joining: ${snapshot.employee.joiningDate}`);
  y += 6;

  title("Earnings", 12);
  for (const e of snapshot.earnings) {
    row(e.label, money(e.amount));
  }
  y += 4;

  title("Deductions", 12);
  if (!snapshot.deductions.length) {
    line("None", 10);
  } else {
    for (const d of snapshot.deductions) {
      row(d.label, money(d.amount));
    }
  }
  y += 8;

  doc.setDrawColor(40);
  doc.line(margin, y, pageW - margin, y);
  y += 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  row("Net pay (computed)", money(snapshot.computedNet));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (snapshot.storedNetPay !== null) {
    y += 4;
    line(`Stored net on record: ${money(snapshot.storedNetPay)}`, 9);
  }
  if (snapshot.salaryRecord?.notes) {
    y += 6;
    line(`Notes: ${snapshot.salaryRecord.notes}`, 9);
  }

  if (snapshot.attendance) {
    y += 14;
    title("Attendance summary", 11);
    const a = snapshot.attendance;
    line(
      `Payable days: ${a.payableWorkingDays} · Daily rate: ${money(a.dailyRate)} · Paid leave days: ${a.paidLeaveWorkingDays} · Unpaid leave days: ${a.unpaidLeaveWorkingDays} · LOP days: ${a.lopDays}`,
      9,
    );
  }

  const buf = doc.output("arraybuffer");
  return new Uint8Array(buf);
}
