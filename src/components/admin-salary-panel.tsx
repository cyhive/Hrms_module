"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { MonthEndPayrollRow, SalaryRecord } from "@/lib/types";
import type { EmployeeRow } from "./employee-profile-modal";
import { PayslipModal } from "./payslip-modal";

function defaultPeriod(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function AdminSalaryPanel({ refreshKey }: { refreshKey: number }) {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [records, setRecords] = useState<SalaryRecord[]>([]);
  const [filterUserId, setFilterUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [userId, setUserId] = useState("");
  const [period, setPeriod] = useState(defaultPeriod);
  const [basePay, setBasePay] = useState("");
  const [deductions, setDeductions] = useState("");
  const [netPay, setNetPay] = useState("");
  const [notes, setNotes] = useState("");

  const [settlements, setSettlements] = useState<MonthEndPayrollRow[]>([]);
  const [settlementLoading, setSettlementLoading] = useState(false);
  const [settlementError, setSettlementError] = useState("");

  const [payslipOpen, setPayslipOpen] = useState(false);
  const [payslipUserId, setPayslipUserId] = useState("");
  const [payrollDeptFilter, setPayrollDeptFilter] = useState("");
  const [payrollEmpFilter, setPayrollEmpFilter] = useState("");

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees) {
      m.set(e.id, e.profile?.fullName?.trim() || e.username);
    }
    return m;
  }, [employees]);

  const payrollDepartmentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of employees) {
      const d = e.profile?.department?.trim();
      if (d) set.add(d);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [employees]);

  const employeesHaveBlankDept = useMemo(
    () => employees.some((e) => !(e.profile?.department ?? "").trim()),
    [employees],
  );

  const sortedEmployeesForPayrollFilter = useMemo(() => {
    return [...employees].sort((a, b) => {
      const an = (a.profile?.fullName ?? a.username).toLowerCase();
      const bn = (b.profile?.fullName ?? b.username).toLowerCase();
      return an.localeCompare(bn, undefined, { sensitivity: "base" });
    });
  }, [employees]);

  const loadEmployees = useCallback(async () => {
    const res = await fetch("/api/admin/employees");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not load staff");
    const rows = (data.employees ?? []) as EmployeeRow[];
    setEmployees(rows);
    return rows;
  }, []);

  const loadRecords = useCallback(async (uid?: string) => {
    const q = uid?.trim() ? `?userId=${encodeURIComponent(uid.trim())}` : "";
    const res = await fetch(`/api/admin/salary-records${q}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not load records");
    setRecords(data.records ?? []);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await loadEmployees();
      await loadRecords(filterUserId || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [filterUserId, loadEmployees, loadRecords]);

  const loadSettlements = useCallback(async () => {
    setSettlementLoading(true);
    setSettlementError("");
    try {
      const params = new URLSearchParams();
      params.set("period", period);
      if (payrollEmpFilter.trim()) params.set("userId", payrollEmpFilter.trim());
      if (payrollDeptFilter === "__none__") params.set("department", "__none__");
      else if (payrollDeptFilter.trim()) params.set("department", payrollDeptFilter.trim());

      const res = await fetch(`/api/admin/salary-records/settlement?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSettlementError(typeof data.error === "string" ? data.error : "Could not load settlement");
        setSettlements([]);
        return;
      }
      setSettlements(data.settlements ?? []);
    } catch {
      setSettlementError("Could not load settlement");
      setSettlements([]);
    } finally {
      setSettlementLoading(false);
    }
  }, [period, refreshKey, payrollDeptFilter, payrollEmpFilter]);

  useEffect(() => {
    void loadSettlements();
  }, [loadSettlements]);

  useEffect(() => {
    void loadAll();
  }, [loadAll, refreshKey]);

  function applyNetFromBaseDeductions() {
    const b = Number(basePay);
    const d = Number(deductions);
    if (!Number.isFinite(b) || !Number.isFinite(d)) return;
    setNetPay(String(Math.round((b - d) * 100) / 100));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!userId.trim()) {
      setError("Select an employee");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/salary-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userId.trim(),
          period: period.trim(),
          basePay: basePay.trim() === "" ? 0 : Number(basePay),
          deductions: deductions.trim() === "" ? 0 : Number(deductions),
          netPay: netPay.trim() === "" ? 0 : Number(netPay),
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Save failed");
        return;
      }
      await loadRecords(filterUserId || undefined);
      await loadSettlements();
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="animate-fade-in space-y-6">
      <PayslipModal
        open={payslipOpen && !!payslipUserId}
        onClose={() => {
          setPayslipOpen(false);
          setPayslipUserId("");
        }}
        jsonUrl={`/api/admin/payslip?userId=${encodeURIComponent(payslipUserId)}&period=${encodeURIComponent(period)}`}
        pdfUrl={`/api/admin/payslip/pdf?userId=${encodeURIComponent(payslipUserId)}&period=${encodeURIComponent(period)}`}
      />
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-xl font-semibold text-zinc-900">Salary records</h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600">
          HR and Admin can record monthly payroll per person: base pay, deductions, and net pay. Period is
          always <span className="font-medium text-zinc-800">YYYY-MM</span>. Saving again for the same employee
          and month updates the row.
        </p>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <form onSubmit={handleSubmit} className="mt-4 grid gap-3 border-t border-zinc-100 pt-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-medium text-zinc-600 md:col-span-2 lg:col-span-1">
            Employee
            <select
              required
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900"
              value={userId}
              onChange={(ev) => setUserId(ev.target.value)}
            >
              <option value="">— Select —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.profile?.fullName?.trim() || emp.username} ({emp.role})
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Pay period (month)
            <input
              type="month"
              required
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900"
              value={period}
              onChange={(ev) => setPeriod(ev.target.value)}
            />
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Base pay
            <input
              type="number"
              min={0}
              step="0.01"
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900"
              value={basePay}
              onChange={(ev) => setBasePay(ev.target.value)}
            />
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Deductions
            <input
              type="number"
              min={0}
              step="0.01"
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900"
              value={deductions}
              onChange={(ev) => setDeductions(ev.target.value)}
            />
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Net pay
            <input
              type="number"
              min={0}
              step="0.01"
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900"
              value={netPay}
              onChange={(ev) => setNetPay(ev.target.value)}
            />
          </label>
          <label className="text-xs font-medium text-zinc-600 md:col-span-2">
            Notes (optional)
            <input
              type="text"
              maxLength={500}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900"
              value={notes}
              onChange={(ev) => setNotes(ev.target.value)}
              placeholder="e.g. bonus line, tax detail reference"
            />
          </label>
          <div className="flex flex-wrap items-end gap-2 md:col-span-2 lg:col-span-3">
            <button
              type="button"
              onClick={applyNetFromBaseDeductions}
              className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100"
            >
              Set net = base − deductions
            </button>
            <button
              type="submit"
              disabled={saving || loading}
              className="rounded-md bg-gradient-to-r from-zinc-900 to-zinc-700 px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save record"}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-zinc-900">Month-end payroll list</h3>
        <p className="mt-1 max-w-4xl text-sm text-zinc-600">
          Use the filters below (month, department, employee) to narrow the list. Figures use each person&apos;s{" "}
          <span className="font-medium text-zinc-800">base pay</span> from saved salary records for that month.{" "}
          <span className="font-medium">Paid</span> approved leave does not reduce pay;{" "}
          <span className="font-medium">unpaid</span> leave and <span className="font-medium">LOP</span> deduct at
          the daily rate. HR-approved miss punch sets attendance to <span className="font-medium">present</span> and
          removes LOP for that day. Changing <span className="font-medium">Pay period</span> in the form above also
          updates the month used here.
        </p>
        <div className="no-print mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-100 bg-zinc-50/90 p-3">
          <p className="w-full text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Payroll list filters
          </p>
          <label className="text-xs font-medium text-zinc-600">
            Month
            <input
              type="month"
              className="mt-1 block rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900"
              value={period}
              onChange={(ev) => setPeriod(ev.target.value)}
            />
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Department
            <select
              className="mt-1 min-w-[160px] rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900"
              value={payrollDeptFilter}
              onChange={(ev) => setPayrollDeptFilter(ev.target.value)}
            >
              <option value="">All departments</option>
              {employeesHaveBlankDept ? (
                <option value="__none__">(No department)</option>
              ) : null}
              {payrollDepartmentOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Employee
            <select
              className="mt-1 min-w-[220px] max-w-[min(100vw,320px)] rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900"
              value={payrollEmpFilter}
              onChange={(ev) => setPayrollEmpFilter(ev.target.value)}
            >
              <option value="">All employees</option>
              {sortedEmployeesForPayrollFilter.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.profile?.fullName?.trim() || e.username} ({e.role})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
            onClick={() => {
              setPayrollDeptFilter("");
              setPayrollEmpFilter("");
            }}
          >
            Clear department &amp; employee
          </button>
        </div>
        {settlementError ? <p className="mt-2 text-sm text-red-600">{settlementError}</p> : null}
        {!settlementLoading && !settlementError ? (
          <p className="mt-2 text-xs text-zinc-500">
            {settlements.length} row{settlements.length === 1 ? "" : "s"} for{" "}
            <span className="font-medium text-zinc-700">{period}</span>
          </p>
        ) : null}
        {settlementLoading ? (
          <p className="mt-3 text-sm text-zinc-500">Loading settlement…</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="border-b border-zinc-200 text-zinc-700">
                <tr>
                  <th className="py-2 pr-2">Employee</th>
                  <th className="py-2 pr-2">Role</th>
                  <th className="py-2 pr-2">Dept</th>
                  <th className="py-2 pr-2 text-right">Base</th>
                  <th className="py-2 pr-2 text-right">Payable days</th>
                  <th className="py-2 pr-2 text-right">Daily rate</th>
                  <th className="py-2 pr-2 text-right" title="Approved paid leave (no deduction)">
                    Paid L
                  </th>
                  <th className="py-2 pr-2 text-right" title="Approved unpaid leave days">
                    Unpaid L
                  </th>
                  <th className="py-2 pr-2 text-right" title="LOP: no present / WFH / leave">
                    LOP
                  </th>
                  <th className="py-2 pr-2 text-right">Unpaid −</th>
                  <th className="py-2 pr-2 text-right">LOP −</th>
                  <th className="py-2 pr-2 text-right">Other −</th>
                  <th className="py-2 pr-2 text-right font-medium text-zinc-900">Computed net</th>
                  <th className="py-2 text-right text-zinc-600">Stored net</th>
                  <th className="no-print py-2 pr-2 text-right">Payslip</th>
                </tr>
              </thead>
              <tbody>
                {settlements.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="py-8 text-center text-zinc-500">
                      No rows match these filters (or no staff yet).
                    </td>
                  </tr>
                ) : (
                  settlements.map((row) => {
                  const a = row.attendance;
                  return (
                    <tr key={row.userId} className="border-b border-zinc-100">
                      <td className="py-2 pr-2 font-medium text-zinc-900">{row.displayName}</td>
                      <td className="py-2 pr-2 text-zinc-600">{row.role}</td>
                      <td className="max-w-[140px] truncate py-2 pr-2 text-zinc-600" title={row.department ?? ""}>
                        {row.department?.trim() ? row.department : "—"}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">{formatMoney(row.basePay)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {a ? a.payableWorkingDays : "—"}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">{a ? formatMoney(a.dailyRate) : "—"}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{a ? a.paidLeaveWorkingDays : "—"}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{a ? a.unpaidLeaveWorkingDays : "—"}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{a ? a.lopDays : "—"}</td>
                      <td className="py-2 pr-2 text-right tabular-nums text-amber-800">
                        {a ? formatMoney(a.unpaidLeaveDeduction) : "—"}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums text-amber-800">
                        {a ? formatMoney(a.lopDeduction) : "—"}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">{formatMoney(row.otherDeductions)}</td>
                      <td className="py-2 pr-2 text-right font-semibold tabular-nums text-emerald-800">
                        {formatMoney(row.computedNet)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-zinc-500">
                        {row.storedNetPay === null ? "—" : formatMoney(row.storedNetPay)}
                      </td>
                      <td className="no-print py-2 pr-2 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setPayslipUserId(row.userId);
                            setPayslipOpen(true);
                          }}
                          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-teal-800 hover:bg-teal-50"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h3 className="text-lg font-semibold text-zinc-900">History</h3>
          <label className="text-xs font-medium text-zinc-600">
            Filter by employee
            <select
              className="ml-2 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              value={filterUserId}
              onChange={(ev) => setFilterUserId(ev.target.value)}
            >
              <option value="">All staff</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.profile?.fullName?.trim() || emp.username}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-zinc-500">Loading…</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-zinc-200 text-zinc-700">
                <tr>
                  <th className="py-2 pr-2">Period</th>
                  <th className="py-2 pr-2">Employee</th>
                  <th className="py-2 pr-2 text-right">Base</th>
                  <th className="py-2 pr-2 text-right">Deductions</th>
                  <th className="py-2 pr-2 text-right">Net</th>
                  <th className="py-2 pr-2">Notes</th>
                  <th className="py-2">Updated</th>
                  <th className="no-print py-2 pr-2 text-right">Payslip</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-zinc-500">
                      No salary records yet.
                    </td>
                  </tr>
                ) : (
                  records.map((r) => {
                    const when = new Date(r.updatedAt);
                    const whenStr = Number.isNaN(when.getTime())
                      ? "—"
                      : when.toLocaleString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        });
                    return (
                      <tr key={r.id} className="border-b border-zinc-100">
                        <td className="py-2 pr-2 font-medium text-zinc-900">{r.period}</td>
                        <td className="py-2 pr-2 text-zinc-800">{nameById.get(r.userId) ?? r.userId}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{formatMoney(r.basePay)}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{formatMoney(r.deductions)}</td>
                        <td className="py-2 pr-2 text-right font-medium tabular-nums text-zinc-900">
                          {formatMoney(r.netPay)}
                        </td>
                        <td className="max-w-[200px] truncate py-2 pr-2 text-zinc-600">{r.notes ?? "—"}</td>
                        <td className="py-2 text-zinc-500">{whenStr}</td>
                        <td className="no-print py-2 pr-2 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setPayslipUserId(r.userId);
                              setPayslipOpen(true);
                              setPeriod(r.period);
                            }}
                            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-teal-800 hover:bg-teal-50"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
