"use client";

import { useState } from "react";
import { PayslipModal } from "./payslip-modal";

function defaultPeriod(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function EmployeePayslipPanel() {
  const [period, setPeriod] = useState(defaultPeriod);
  const [open, setOpen] = useState(false);

  const jsonUrl = `/api/employee/payslip?period=${encodeURIComponent(period)}`;
  const pdfUrl = `/api/employee/payslip/pdf?period=${encodeURIComponent(period)}`;

  return (
    <section className="animate-fade-in rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">Payslip</h2>
      <p className="mt-1 max-w-2xl text-sm text-zinc-600">
        View your monthly payslip on screen, print it, or download a basic PDF. Amounts follow the same rules as
        HR month-end payroll (base from your salary record, unpaid leave and LOP deductions, paid leave excluded).
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-zinc-600">
          Pay period
          <input
            type="month"
            className="mt-1 block rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md bg-gradient-to-r from-zinc-900 to-zinc-700 px-4 py-2 text-sm font-medium text-white hover:brightness-110"
        >
          View payslip
        </button>
      </div>
      <PayslipModal open={open} onClose={() => setOpen(false)} jsonUrl={jsonUrl} pdfUrl={pdfUrl} />
    </section>
  );
}
