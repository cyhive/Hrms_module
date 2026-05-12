"use client";

import { useCallback, useEffect, useState } from "react";

type DayRow = {
  userId: string;
  employeeName: string;
  username: string;
  date: string;
  workedHours: number | null;
  status: string | null;
  punchIn: string | null;
  punchOut: string | null;
  hasRecord: boolean;
};

type RangeRow = {
  _id: string;
  userId: string;
  employeeName: string;
  username: string;
  date: string;
  workedHours: number;
  status: string;
  punchIn?: string;
  punchOut?: string;
};

function localIsoToday(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function AdminAttendancePanel() {
  const [from, setFrom] = useState(localIsoToday);
  const [to, setTo] = useState(localIsoToday);
  const [nameInput, setNameInput] = useState("");
  const [appliedName, setAppliedName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<
    | { view: "day"; date: string; rows: DayRow[] }
    | { view: "range"; rows: RangeRow[] }
    | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ from, to });
      const n = appliedName.trim();
      if (n) qs.set("name", n);
      const res = await fetch(`/api/admin/attendance?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not load attendance");
        setPayload(null);
        return;
      }
      setPayload(data);
    } catch {
      setError("Could not load attendance");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, appliedName]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyNameFilter() {
    setAppliedName(nameInput.trim());
  }

  const isSingleDay = from === to;
  const dayRows = payload?.view === "day" ? payload.rows : [];
  const rangeRows = payload?.view === "range" ? payload.rows : [];

  return (
    <section className="animate-fade-in rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-zinc-900">Attendance Management</h2>
      <p className="mt-1 text-sm text-zinc-600">
        By default this shows <span className="font-medium text-zinc-800">today</span> for every
        employee. Use a date range to load historical punches; filter by name to narrow the list.
      </p>

      <div className="mt-4 flex flex-col gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="text-xs font-medium text-zinc-600">
          From
          <input
            type="date"
            className="mt-1 block rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-xs font-medium text-zinc-600">
          To
          <input
            type="date"
            className="mt-1 block rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className="min-w-[200px] flex-1 text-xs font-medium text-zinc-600">
          Employee name
          <input
            type="search"
            placeholder="Search name or username…"
            className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyNameFilter();
            }}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              applyNameFilter();
            }}
            className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            Apply filters
          </button>
          <button
            type="button"
            onClick={() => {
              const t = localIsoToday();
              setFrom(t);
              setTo(t);
              setNameInput("");
              setAppliedName("");
            }}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100"
          >
            Today (all staff)
          </button>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <p className="mt-3 text-sm text-zinc-700">
        {loading ? (
          "Loading…"
        ) : isSingleDay ? (
          <>
            <span className="font-medium text-zinc-900">Day roster</span> — {from}:{" "}
            {dayRows.length} employee{dayRows.length === 1 ? "" : "s"},{" "}
            {dayRows.filter((r) => r.hasRecord).length} with a punch record.
          </>
        ) : (
          <>
            <span className="font-medium text-zinc-900">Date range</span> — {from} to {to}:{" "}
            {rangeRows.length} record{rangeRows.length === 1 ? "" : "s"}.
          </>
        )}
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="border-b border-zinc-200 text-zinc-700">
            <tr>
              <th className="py-2 pr-2">Employee</th>
              <th className="py-2 pr-2">Username</th>
              <th className="py-2 pr-2">Date</th>
              <th className="py-2 pr-2">Punch in</th>
              <th className="py-2 pr-2">Punch out</th>
              <th className="py-2 pr-2">Hours</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="py-8 text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : null}
            {!loading && payload?.view === "day"
              ? dayRows.map((row) => (
                  <tr key={row.userId} className="border-b border-zinc-100">
                    <td className="py-2 pr-2 text-zinc-800">{row.employeeName}</td>
                    <td className="py-2 pr-2 text-zinc-600">{row.username}</td>
                    <td className="py-2 pr-2 font-mono text-zinc-800">{row.date}</td>
                    <td className="py-2 pr-2 text-zinc-700">{formatTime(row.punchIn)}</td>
                    <td className="py-2 pr-2 text-zinc-700">{formatTime(row.punchOut)}</td>
                    <td className="py-2 pr-2 text-zinc-800">
                      {row.hasRecord ? row.workedHours : "—"}
                    </td>
                    <td className="py-2">
                      {row.hasRecord ? (
                        <span className="capitalize text-zinc-800">{row.status}</span>
                      ) : (
                        <span className="text-zinc-500">No record</span>
                      )}
                    </td>
                  </tr>
                ))
              : null}
            {!loading && payload?.view === "range"
              ? rangeRows.map((row) => (
                  <tr key={row._id} className="border-b border-zinc-100">
                    <td className="py-2 pr-2 text-zinc-800">{row.employeeName}</td>
                    <td className="py-2 pr-2 text-zinc-600">{row.username}</td>
                    <td className="py-2 pr-2 font-mono text-zinc-800">{row.date}</td>
                    <td className="py-2 pr-2 text-zinc-700">{formatTime(row.punchIn)}</td>
                    <td className="py-2 pr-2 text-zinc-700">{formatTime(row.punchOut)}</td>
                    <td className="py-2 pr-2 text-zinc-800">{row.workedHours}</td>
                    <td className="py-2 capitalize text-zinc-800">{row.status}</td>
                  </tr>
                ))
              : null}
            {!loading && payload?.view === "day" && !dayRows.length ? (
              <tr>
                <td colSpan={7} className="py-8 text-zinc-500">
                  No employees match this filter.
                </td>
              </tr>
            ) : null}
            {!loading && payload?.view === "range" && !rangeRows.length ? (
              <tr>
                <td colSpan={7} className="py-8 text-zinc-500">
                  No attendance records in this range.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
