"use client";

import { useCallback, useEffect, useState } from "react";

type HolidayRow = { date: string; name: string; treatment: "holiday" | "working" };

export function AdminHolidaysPanel() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<HolidayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingDate, setSavingDate] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/holidays?year=${year}&month=${month}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not load holidays");
        setRows([]);
        return;
      }
      setRows(data.holidays ?? []);
    } catch {
      setError("Could not load holidays");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateTreatment(date: string, treatment: "holiday" | "working") {
    setSavingDate(date);
    setError("");
    try {
      const res = await fetch("/api/admin/holidays", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, treatment }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Update failed");
        return;
      }
      await load();
    } catch {
      setError("Update failed");
    } finally {
      setSavingDate(null);
    }
  }

  const monthLabel = new Date(year, month - 1, 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  return (
    <section className="animate-fade-in rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">Public holidays</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            Holidays listed for each month follow the company calendar. Mark a day as{" "}
            <span className="font-medium text-zinc-800">Working</span> when everyone must attend
            (for example a working Saturday); employees see this on their calendar and attendance
            counts that day like a normal workday.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-zinc-600">
            Month
            <select
              className="ml-1 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {new Date(2000, m - 1, 1).toLocaleString("default", { month: "long" })}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Year
            <input
              type="number"
              min={2024}
              max={2035}
              className="ml-1 w-24 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </label>
        </div>
      </div>

      <p className="mt-3 text-sm font-medium text-zinc-800">{monthLabel}</p>

      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-zinc-200 text-zinc-700">
            <tr>
              <th className="py-2 pr-2">#</th>
              <th className="py-2 pr-2">Weekday</th>
              <th className="py-2 pr-2">Date</th>
              <th className="py-2 pr-2">Name</th>
              <th className="py-2">Type</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-6 text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : null}
            {!loading && !rows.length ? (
              <tr>
                <td colSpan={6} className="py-6 text-zinc-500">
                  No public holidays in the default list for this month. Add dates to{" "}
                  <code className="rounded bg-zinc-100 px-1 text-xs">public-holiday-catalog.ts</code>{" "}
                  if needed.
                </td>
              </tr>
            ) : null}
            {!loading
              ? rows.map((row, idx) => {
                  const d = new Date(row.date + "T12:00:00");
                  const weekday = d.toLocaleString("default", { weekday: "long" });
                  const displayDate = d.toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  });
                  const busy = savingDate === row.date;
                  return (
                    <tr key={row.date} className="border-b border-zinc-100">
                      <td className="py-2 pr-2 text-zinc-700">{idx + 1}</td>
                      <td className="py-2 pr-2 text-zinc-800">{weekday}</td>
                      <td className="py-2 pr-2 font-mono text-zinc-800">{displayDate}</td>
                      <td className="py-2 pr-2 text-zinc-800">{row.name}</td>
                      <td className="py-2 pr-2">
                        {row.treatment === "holiday" ? (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-800">
                            Holiday (off)
                          </span>
                        ) : (
                          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-900">
                            Working day
                          </span>
                        )}
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy || row.treatment === "holiday"}
                            onClick={() => void updateTreatment(row.date, "holiday")}
                            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-40"
                          >
                            Set holiday
                          </button>
                          <button
                            type="button"
                            disabled={busy || row.treatment === "working"}
                            onClick={() => void updateTreatment(row.date, "working")}
                            className="rounded-md bg-teal-600 px-2 py-1 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-40"
                          >
                            Set working
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
