"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CALENDAR_EVENT_AUDIENCES, labelForCalendarEventAudience } from "@/lib/calendar-events-shared";

type CalendarEvent = {
  _id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  targetAudience?: string;
  createdByUsername: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

function buildEventsByIso(year: number, month1: number, events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  const dim = daysInMonth(year, month1);
  for (let d = 1; d <= dim; d++) {
    const iso = `${year}-${pad2(month1)}-${pad2(d)}`;
    for (const ev of events) {
      if (iso >= ev.startDate && iso <= ev.endDate) {
        const arr = map.get(iso) ?? [];
        if (!arr.some((x) => x._id === ev._id)) arr.push(ev);
        map.set(iso, arr);
      }
    }
  }
  return map;
}

function calendarGrid(year: number, month1: number): Array<{ key: string; iso: string | null; dayNum: number | null }> {
  const first = new Date(year, month1 - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const dim = daysInMonth(year, month1);
  const cells: Array<{ key: string; iso: string | null; dayNum: number | null }> = [];
  for (let i = 0; i < lead; i++) {
    cells.push({ key: `pad-${i}`, iso: null, dayNum: null });
  }
  for (let d = 1; d <= dim; d++) {
    cells.push({
      key: `d-${d}`,
      iso: `${year}-${pad2(month1)}-${pad2(d)}`,
      dayNum: d,
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ key: `trail-${cells.length}`, iso: null, dayNum: null });
  }
  return cells;
}

export function AdminEventsPanel({ refreshKey }: { refreshKey: number }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formAudience, setFormAudience] = useState<string>("all");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/events?year=${year}&month=${month}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not load events");
        setEvents([]);
        return;
      }
      setEvents(data.events ?? []);
    } catch {
      setError("Could not load events");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const byIso = useMemo(() => buildEventsByIso(year, month, events), [year, month, events]);
  const grid = useMemo(() => calendarGrid(year, month), [year, month]);

  const monthLabel = new Date(year, month - 1, 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle,
          startDate: formStart,
          endDate: formEnd.trim() || undefined,
          description: formDesc.trim() || undefined,
          targetAudience: formAudience,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create event");
        return;
      }
      setFormTitle("");
      setFormStart("");
      setFormEnd("");
      setFormDesc("");
      setFormAudience("all");
      await load();
    } catch {
      setError("Could not create event");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this event from the calendar?")) return;
    setDeletingId(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/events?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Delete failed");
        return;
      }
      await load();
    } catch {
      setError("Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  const todayIso = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

  return (
    <section className="animate-fade-in rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-zinc-900">Events calendar</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            HR and Admin can schedule company events. Choose who can see each event on their dashboard calendar
            (employees/managers use the Attendance Calendar; HR/Admin use this Events screen). Multi-day ranges are
            supported.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className="text-xs font-medium text-zinc-600">
              Month
              <select
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value, 10))}
                className="ml-2 rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
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
                min={2020}
                max={2100}
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value, 10) || year)}
                className="ml-2 w-24 rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
              />
            </label>
          </div>

          {loading ? <p className="mt-4 text-sm text-zinc-600">Loading…</p> : null}
          {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}

          <div className="mt-4">
            <p className="mb-2 text-center text-sm font-semibold text-zinc-800">{monthLabel}</p>
            <div className="grid grid-cols-7 gap-1.5 text-center text-xs sm:text-sm">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d} className="rounded bg-teal-500 py-2 font-semibold text-white">
                  {d}
                </div>
              ))}
              {grid.map((cell) => {
                if (!cell.iso || cell.dayNum === null) {
                  return (
                    <div
                      key={cell.key}
                      className="min-h-[72px] rounded border border-zinc-100 bg-zinc-50/50 sm:min-h-[88px]"
                    />
                  );
                }
                const dayEvents = byIso.get(cell.iso) ?? [];
                const isToday = cell.iso === todayIso;
                return (
                  <div
                    key={cell.key}
                    className={`min-h-[72px] rounded border p-1 text-left sm:min-h-[88px] ${
                      isToday ? "border-teal-400 bg-teal-50/60" : "border-zinc-200 bg-zinc-50"
                    }`}
                  >
                    <div className="text-xs font-semibold text-zinc-800 sm:text-sm">{cell.dayNum}</div>
                    <div className="mt-0.5 space-y-0.5">
                      {dayEvents.map((ev) => (
                        <div
                          key={ev._id}
                          title={`${ev.title}${ev.description ? `\n${ev.description}` : ""}\nAudience: ${labelForCalendarEventAudience(ev.targetAudience)}`}
                          className="truncate rounded bg-white/90 px-0.5 text-[10px] font-medium leading-tight text-teal-900 ring-1 ring-teal-200/80 sm:text-[11px]"
                        >
                          {ev.title}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="w-full shrink-0 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 xl:max-w-sm">
          <h3 className="text-sm font-semibold text-zinc-900">Add event</h3>
          <form onSubmit={handleCreate} className="mt-3 space-y-3">
            <label className="block text-xs font-medium text-zinc-700">
              Title
              <input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                required
              />
            </label>
            <label className="block text-xs font-medium text-zinc-700">
              Start date
              <input
                type="date"
                value={formStart}
                onChange={(e) => setFormStart(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                required
              />
            </label>
            <label className="block text-xs font-medium text-zinc-700">
              End date (optional)
              <input
                type="date"
                value={formEnd}
                onChange={(e) => setFormEnd(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-zinc-700">
              Target audience
              <select
                value={formAudience}
                onChange={(e) => setFormAudience(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                required
              >
                {CALENDAR_EVENT_AUDIENCES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-zinc-700">
              Description (optional)
              <textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-md bg-teal-600 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Add to calendar"}
            </button>
          </form>

          <div className="mt-6 border-t border-zinc-200 pt-4">
            <h3 className="text-sm font-semibold text-zinc-900">This month</h3>
            <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-sm">
              {events.map((ev) => (
                <li
                  key={ev._id}
                  className="flex items-start justify-between gap-2 rounded border border-zinc-200 bg-white px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900">{ev.title}</p>
                    <p className="text-xs text-zinc-500">
                      {ev.startDate}
                      {ev.endDate !== ev.startDate ? ` → ${ev.endDate}` : ""} · @{ev.createdByUsername}
                    </p>
                    <p className="mt-0.5 text-[10px] text-violet-700">
                      {labelForCalendarEventAudience(ev.targetAudience)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={deletingId === ev._id}
                    onClick={() => void handleDelete(ev._id)}
                    className="shrink-0 rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                  >
                    {deletingId === ev._id ? "…" : "Remove"}
                  </button>
                </li>
              ))}
              {!events.length ? <li className="text-xs text-zinc-500">No events this month.</li> : null}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
