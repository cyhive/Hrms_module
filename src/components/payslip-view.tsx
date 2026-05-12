"use client";

import type { PayslipSnapshot } from "@/lib/types";

function money(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PayslipView({ snapshot }: { snapshot: PayslipSnapshot }) {
  const gen = new Date(snapshot.generatedAt);
  const genStr = Number.isNaN(gen.getTime())
    ? snapshot.generatedAt
    : gen.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="payslip-print-area space-y-5 text-zinc-900">
      <header className="border-b border-zinc-200 pb-4">
        <p className="text-xl font-bold tracking-wide text-zinc-800">{snapshot.companyName}</p>
        <h2 className="mt-1 text-lg font-semibold text-zinc-900">Payslip — {snapshot.periodLabel}</h2>
        <p className="mt-1 text-xs text-zinc-500">Generated {genStr}</p>
      </header>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Employee</h3>
        <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Name</dt>
            <dd className="font-medium">{snapshot.employee.displayName}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Username</dt>
            <dd>@{snapshot.employee.username}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Role</dt>
            <dd className="capitalize">{snapshot.employee.role}</dd>
          </div>
          {snapshot.employee.department ? (
            <div>
              <dt className="text-zinc-500">Department</dt>
              <dd>{snapshot.employee.department}</dd>
            </div>
          ) : null}
          {snapshot.employee.designation ? (
            <div>
              <dt className="text-zinc-500">Designation</dt>
              <dd>{snapshot.employee.designation}</dd>
            </div>
          ) : null}
          {snapshot.employee.joiningDate ? (
            <div>
              <dt className="text-zinc-500">Joining date</dt>
              <dd>{snapshot.employee.joiningDate}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Earnings</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {snapshot.earnings.map((e) => (
              <li key={e.label} className="flex justify-between gap-4">
                <span className="text-zinc-700">{e.label}</span>
                <span className="tabular-nums font-medium">{money(e.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-zinc-200 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-800">Deductions</h3>
          {snapshot.deductions.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">None</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {snapshot.deductions.map((d) => (
                <li key={d.label} className="flex justify-between gap-4">
                  <span className="text-zinc-700">{d.label}</span>
                  <span className="tabular-nums font-medium text-amber-900">−{money(d.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {snapshot.attendance ? (
        <section className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-xs text-zinc-700">
          <h3 className="font-semibold text-zinc-800">Attendance basis</h3>
          <p className="mt-1 leading-relaxed">
            Payable days: <strong>{snapshot.attendance.payableWorkingDays}</strong> · Daily rate:{" "}
            <strong>{money(snapshot.attendance.dailyRate)}</strong> · Paid leave (days):{" "}
            <strong>{snapshot.attendance.paidLeaveWorkingDays}</strong> · Unpaid leave (days):{" "}
            <strong>{snapshot.attendance.unpaidLeaveWorkingDays}</strong> · LOP (days):{" "}
            <strong>{snapshot.attendance.lopDays}</strong>
          </p>
        </section>
      ) : null}

      <footer className="border-t border-zinc-200 pt-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase text-zinc-500">Net pay (computed)</p>
            <p className="text-2xl font-bold text-emerald-800">{money(snapshot.computedNet)}</p>
          </div>
          {snapshot.storedNetPay !== null ? (
            <p className="text-xs text-zinc-500">
              Stored net on salary record: <span className="font-medium text-zinc-700">{money(snapshot.storedNetPay)}</span>
            </p>
          ) : null}
        </div>
        {snapshot.salaryRecord?.notes ? (
          <p className="mt-3 text-xs text-zinc-600">
            <span className="font-medium text-zinc-700">Notes:</span> {snapshot.salaryRecord.notes}
          </p>
        ) : null}
      </footer>
    </div>
  );
}
