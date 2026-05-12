"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AdminDashboardStats } from "@/lib/hr-repo";
import { useHrDisplayCurrency } from "@/lib/use-hr-display-currency";
import { HR_DISPLAY_CURRENCIES, type HrDisplayCurrency } from "@/lib/display-currency";
import { SafeUser } from "@/lib/types";
import { LogoutButton } from "./logout-button";
import { AdminCreateEmployeeForm } from "./admin-create-employee-form";
import { EmployeePasswordForm } from "./employee-password-form";
import { AdminAttendancePanel } from "./admin-attendance-panel";
import { AdminHolidaysPanel } from "./admin-holidays-panel";
import { EmployeeList } from "./employee-list";
import { AdminEventsPanel } from "./admin-events-panel";
import { AdminProjectsPanel } from "./admin-projects-panel";
import { AdminSalaryPanel } from "./admin-salary-panel";
import { SalaryTrendChart } from "./salary-trend-chart";

const navItems = [
  { key: "dashboard", label: "HR Dashboard" },
  { key: "create-employee", label: "Create Employee" },
  { key: "employee-list", label: "Employees" },
  { key: "salary", label: "Salary" },
  { key: "projects", label: "Projects" },
  { key: "holidays", label: "Holidays" },
  { key: "events", label: "Events" },
  { key: "activities", label: "Activities" },
  { key: "users", label: "Users" },
  { key: "attendance", label: "Attendance" },
  { key: "assets", label: "Assets" },
  { key: "leave-requests", label: "Leave Requests" },
  { key: "wfh-requests", label: "WFH Requests" },
  { key: "miss-punch", label: "Miss Punch" },
  { key: "offboarding", label: "Offboarding" },
] as const;

type AdminTab = (typeof navItems)[number]["key"];

const ADMIN_TAB_KEYS = new Set<string>(navItems.map((item) => item.key));

function parseAdminTab(raw: string | null): AdminTab {
  if (raw && ADMIN_TAB_KEYS.has(raw)) return raw as AdminTab;
  return "dashboard";
}

const navIcons: Record<AdminTab, string> = {
  dashboard: "🏠",
  "create-employee": "➕",
  "employee-list": "👥",
  salary: "💰",
  projects: "📁",
  holidays: "🎉",
  events: "📅",
  activities: "📌",
  users: "🧑",
  attendance: "🕒",
  assets: "💼",
  "leave-requests": "📝",
  "wfh-requests": "💻",
  "miss-punch": "⚠️",
  offboarding: "📤",
};

type RequestKind = "leave" | "wfh" | "miss-punch";

function payrollPeriodLabel(period: string | null): string {
  if (!period) return "";
  const m = /^(\d{4})-(\d{2})$/.exec(period.trim());
  if (!m) return period;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  if (Number.isNaN(d.getTime())) return period;
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}

function chartPeriodShort(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period.trim());
  if (!m) return period;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  if (Number.isNaN(d.getTime())) return period;
  return d.toLocaleString(undefined, { month: "short", year: "numeric" });
}

function formatIsoUtc(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toISOString().slice(0, 16).replace("T", " ")}Z`;
}

function localIsoFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function AdminDashboardShell({ user }: { user: SafeUser }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTabState] = useState<AdminTab>(() => parseAdminTab(tabParam));

  useEffect(() => {
    setActiveTabState(parseAdminTab(searchParams.get("tab")));
  }, [searchParams]);

  const setActiveTab = useCallback(
    (tab: AdminTab) => {
      setActiveTabState(tab);
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "dashboard") params.delete("tab");
      else params.set("tab", tab);
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const { currency, setCurrency, formatInt, formatAvg, labels } = useHrDisplayCurrency();

  const [refreshKey, setRefreshKey] = useState(0);
  const [requestDecisionError, setRequestDecisionError] = useState<string | null>(null);
  const [actingRequest, setActingRequest] = useState<{ kind: RequestKind; id: string } | null>(null);
  const [overview, setOverview] = useState<{
    employees: Array<{
      id: string;
      username: string;
      profile?: { fullName?: string };
    }>;
    leaveRequests: Array<{
      _id: string;
      userId: string;
      fromDate: string;
      toDate: string;
      days: number;
      status: string;
      reason?: string;
      compensation?: "paid" | "unpaid";
    }>;
    missPunchRequests: Array<{
      _id: string;
      userId: string;
      date: string;
      type: string;
      status: string;
      reason?: string;
      createdAt?: string;
    }>;
    wfhRequests: Array<{
      _id: string;
      userId: string;
      fromDate: string;
      toDate: string;
      days: number;
      status: string;
      reason?: string;
    }>;
    leaveBalances?: Array<{ userId: string; annualLeave: number; carryForward: number }>;
  } | null>(null);

  const [offboarding, setOffboarding] = useState<{
    offboarding: Array<any>;
    assets: Array<any>;
  } | null>(null);
  const [offboardingError, setOffboardingError] = useState<string | null>(null);
  const [offboardingBusy, setOffboardingBusy] = useState<string | null>(null);

  const [assetsData, setAssetsData] = useState<{
    assets: Array<any>;
    requests: Array<any>;
  } | null>(null);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [assetsBusy, setAssetsBusy] = useState<string | null>(null);
  const [createAssetFormKey, setCreateAssetFormKey] = useState(0);

  type UsersTabRow = {
    id: string;
    username: string;
    role: string;
    mustChangePassword: boolean;
    createdAt: string;
    profile?: {
      fullName?: string;
      email?: string;
      managerId?: string;
      projectId?: string;
    };
    annualLeave?: number;
    carryForward?: number;
  };
  const [usersTabRows, setUsersTabRows] = useState<UsersTabRow[]>([]);
  const [usersTabProjects, setUsersTabProjects] = useState<Array<{ _id: string; name: string }>>([]);
  const [usersTabLoading, setUsersTabLoading] = useState(false);
  const [usersTabError, setUsersTabError] = useState<string | null>(null);

  type ActivityRow = {
    _id: string;
    createdAt: string;
    actorUserId: string;
    actorUsername: string;
    message: string;
    kind?: string;
  };
  const [activitiesTabRows, setActivitiesTabRows] = useState<ActivityRow[]>([]);
  const [activitiesTabLoading, setActivitiesTabLoading] = useState(false);
  const [activitiesTabError, setActivitiesTabError] = useState<string | null>(null);

  const [dashboardStats, setDashboardStats] = useState<AdminDashboardStats | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const [hrPunchStatus, setHrPunchStatus] = useState<"Not punched yet" | "Punched In" | "Punched Out">(
    "Not punched yet",
  );
  const [hrLastPunchTime, setHrLastPunchTime] = useState<string | null>(null);
  const [hrPunchMessage, setHrPunchMessage] = useState("");

  const loadHrAttendance = useCallback(async () => {
    if (user.role !== "hr") return;
    try {
      const res = await fetch("/api/employee/working-summary");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const today = localIsoFromDate(new Date());
      const todayAttendance = (data.attendance ?? []).find(
        (a: { date: string; punchIn?: string; punchOut?: string }) => a.date === today,
      );
      if (!todayAttendance) {
        setHrPunchStatus("Not punched yet");
        setHrLastPunchTime(null);
      } else if (todayAttendance.punchIn && !todayAttendance.punchOut) {
        setHrPunchStatus("Punched In");
        setHrLastPunchTime(new Date(todayAttendance.punchIn).toLocaleTimeString());
      } else if (todayAttendance.punchOut) {
        setHrPunchStatus("Punched Out");
        setHrLastPunchTime(new Date(todayAttendance.punchOut).toLocaleTimeString());
      } else {
        setHrPunchStatus("Not punched yet");
        setHrLastPunchTime(null);
      }
    } catch {
      // ignore
    }
  }, [user.role]);

  useEffect(() => {
    if (user.role !== "hr") return;
    void loadHrAttendance();
  }, [user.role, refreshKey, loadHrAttendance]);

  async function handleHrPunchIn() {
    setHrPunchMessage("");
    const res = await fetch("/api/employee/punch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "in" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setHrPunchMessage(typeof data.error === "string" ? data.error : "Punch in failed");
      return;
    }
    setHrPunchStatus("Punched In");
    setHrLastPunchTime(new Date(data.attendance?.punchIn ?? Date.now()).toLocaleTimeString());
    setHrPunchMessage("Punch in recorded.");
    await loadHrAttendance();
  }

  async function handleHrPunchOut() {
    setHrPunchMessage("");
    const res = await fetch("/api/employee/punch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "out" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setHrPunchMessage(typeof data.error === "string" ? data.error : "Punch out failed");
      return;
    }
    setHrPunchStatus("Punched Out");
    setHrLastPunchTime(new Date(data.attendance?.punchOut ?? Date.now()).toLocaleTimeString());
    setHrPunchMessage("Punch out recorded.");
    await loadHrAttendance();
  }

  useEffect(() => {
    if (activeTab !== "activities") return;
    async function loadActivities() {
      setActivitiesTabLoading(true);
      setActivitiesTabError(null);
      try {
        const res = await fetch("/api/admin/activities?limit=100");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setActivitiesTabError(typeof data.error === "string" ? data.error : "Could not load activity");
          setActivitiesTabRows([]);
          return;
        }
        setActivitiesTabRows(data.activities ?? []);
      } catch {
        setActivitiesTabError("Could not load activity");
        setActivitiesTabRows([]);
      } finally {
        setActivitiesTabLoading(false);
      }
    }
    void loadActivities();
  }, [activeTab, refreshKey]);

  useEffect(() => {
    async function loadDashboardStats() {
      setDashboardLoading(true);
      setDashboardError(null);
      try {
        const res = await fetch("/api/admin/dashboard-stats");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setDashboardStats(null);
          setDashboardError(typeof data.error === "string" ? data.error : "Could not load dashboard");
          return;
        }
        setDashboardStats(data as AdminDashboardStats);
      } catch {
        setDashboardStats(null);
        setDashboardError("Could not load dashboard");
      } finally {
        setDashboardLoading(false);
      }
    }
    void loadDashboardStats();
  }, [refreshKey]);

  useEffect(() => {
    if (activeTab !== "users") return;
    async function loadUsersTab() {
      setUsersTabLoading(true);
      setUsersTabError(null);
      try {
        const [empRes, projRes, ovRes] = await Promise.all([
          fetch("/api/admin/employees"),
          fetch("/api/admin/projects"),
          fetch("/api/admin/overview"),
        ]);
        const empData = await empRes.json().catch(() => ({}));
        if (!empRes.ok) {
          setUsersTabError(typeof empData.error === "string" ? empData.error : "Could not load users");
          setUsersTabRows([]);
          return;
        }
        const projData = await projRes.json().catch(() => ({}));
        const ovData = await ovRes.json().catch(() => ({}));
        const staff = (empData.employees ?? []) as UsersTabRow[];
        const leaveBalances = (ovData.leaveBalances ?? []) as Array<{
          userId: string;
          annualLeave: number;
          carryForward: number;
        }>;
        const leaveMap = new Map(leaveBalances.map((b) => [b.userId, b]));
        const merged = staff.map((s) => {
          const b = leaveMap.get(s.id);
          return {
            ...s,
            annualLeave: b?.annualLeave,
            carryForward: b?.carryForward,
          };
        });
        merged.sort((a, b) => {
          const an = (a.profile?.fullName ?? a.username).toLowerCase();
          const bn = (b.profile?.fullName ?? b.username).toLowerCase();
          return an.localeCompare(bn, undefined, { sensitivity: "base" });
        });
        setUsersTabRows(merged);
        setUsersTabProjects(projRes.ok ? (projData.projects ?? []) : []);
      } catch {
        setUsersTabError("Could not load users");
        setUsersTabRows([]);
      } finally {
        setUsersTabLoading(false);
      }
    }
    void loadUsersTab();
  }, [activeTab, refreshKey]);

  useEffect(() => {
    async function loadOverview() {
      const res = await fetch("/api/admin/overview");
      const data = await res.json();
      if (res.ok) setOverview(data);
    }
    void loadOverview();
  }, [refreshKey, activeTab]);

  useEffect(() => {
    if (activeTab !== "offboarding") return;
    async function loadOffboarding() {
      const res = await fetch("/api/admin/offboarding");
      const data = await res.json();
      if (res.ok) setOffboarding(data);
    }
    void loadOffboarding();
  }, [activeTab, refreshKey]);

  useEffect(() => {
    if (activeTab !== "assets") return;
    async function loadAssets() {
      const res = await fetch("/api/admin/assets");
      const data = await res.json();
      if (res.ok) setAssetsData(data);
    }
    void loadAssets();
  }, [activeTab, refreshKey]);

  useEffect(() => {
    setRequestDecisionError(null);
  }, [activeTab]);

  const submitRequestDecision = useCallback(
    async (kind: RequestKind, requestId: string, decision: "approve" | "reject") => {
      setRequestDecisionError(null);
      setActingRequest({ kind, id: requestId });
      const url =
        kind === "leave"
          ? "/api/admin/leave-request-decision"
          : kind === "wfh"
            ? "/api/admin/wfh-request-decision"
            : "/api/admin/miss-punch-decision";
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId, decision }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setRequestDecisionError(typeof data.error === "string" ? data.error : "Update failed");
          return;
        }
        setRefreshKey((k) => k + 1);
      } finally {
        setActingRequest(null);
      }
    },
    [],
  );

  function getEmployeeDisplayName(userId: string) {
    const employee = overview?.employees?.find((emp) => emp.id === userId);
    if (!employee) return userId;
    return employee.profile?.fullName || employee.username;
  }

  function renderContent() {
    if (activeTab === "dashboard") {
      const stats = dashboardStats;
      const trend = stats?.salaryTrend ?? [];

      const todoItems: Array<{ key: string; text: string; tone: string; tab?: AdminTab }> = [];
      if (stats) {
        if (stats.pendingLeave > 0) {
          todoItems.push({
            key: "leave",
            text: `${stats.pendingLeave} pending leave request(s) need a decision`,
            tone: "border-amber-200 bg-amber-50",
            tab: "leave-requests",
          });
        }
        if (stats.pendingWfh > 0) {
          todoItems.push({
            key: "wfh",
            text: `${stats.pendingWfh} pending WFH request(s)`,
            tone: "border-sky-200 bg-sky-50",
            tab: "wfh-requests",
          });
        }
        if (stats.pendingMissPunch > 0) {
          todoItems.push({
            key: "miss",
            text: `${stats.pendingMissPunch} pending miss punch request(s)`,
            tone: "border-orange-200 bg-orange-50",
            tab: "miss-punch",
          });
        }
        if (stats.pendingOffboarding > 0) {
          todoItems.push({
            key: "off",
            text: `${stats.pendingOffboarding} pending offboarding request(s)`,
            tone: "border-violet-200 bg-violet-50",
            tab: "offboarding",
          });
        }
        if (stats.newHires30d > 0) {
          todoItems.push({
            key: "newh",
            text: `${stats.newHires30d} employee or manager account(s) created in the last 30 days — review directory`,
            tone: "border-emerald-200 bg-emerald-50",
            tab: "employee-list",
          });
        }
      }
      if (!dashboardLoading && stats && todoItems.length === 0) {
        todoItems.push({
          key: "ok",
          text: "No pending approvals in leave, WFH, miss punch, or offboarding queues.",
          tone: "border-zinc-200 bg-zinc-50",
        });
      }
      if (!dashboardLoading && !stats && dashboardError && todoItems.length === 0) {
        todoItems.push({
          key: "err",
          text: "Unable to load live stats. Check the banner above or reload the page.",
          tone: "border-red-200 bg-red-50",
        });
      }

      const newHiresDisplay = dashboardLoading ? "…" : stats ? String(stats.newHires30d) : "—";
      const workforceDisplay = dashboardLoading ? "…" : stats ? String(stats.totalWorkforce) : "—";
      const totalSalaryDisplay =
        dashboardLoading || !stats
          ? "…"
          : stats.latestSalaryPeriod
            ? formatInt(stats.totalNetPayLatestPeriod)
            : "—";
      const avgSalaryDisplay =
        dashboardLoading || !stats
          ? "…"
          : stats.latestSalaryPeriod
            ? formatAvg(stats.avgNetPayLatestPeriod)
            : "—";

      return (
        <div className="space-y-4">
          {dashboardError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{dashboardError}</p>
          ) : null}
          <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
            <p className="max-w-xl text-xs text-zinc-600">
              Payroll figures use the symbol you pick below. Switching currency does not convert stored amounts—only
              the label changes.
            </p>
            <label className="flex flex-wrap items-center gap-2 text-sm text-zinc-700">
              <span className="font-medium">Display currency</span>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as HrDisplayCurrency)}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm font-medium text-zinc-900"
                aria-label="Display currency for salary figures on this dashboard"
              >
                {HR_DISPLAY_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c} — {labels[c]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-zinc-200 bg-gradient-to-br from-white to-sky-50 p-4 shadow-sm">
              <p className="text-sm font-medium text-zinc-700">New hires (30 days)</p>
              <p className="text-2xl font-bold text-zinc-950">{newHiresDisplay}</p>
              <p className="mt-1 text-xs text-zinc-500">Employee and manager accounts created recently</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-gradient-to-br from-white to-sky-50 p-4 shadow-sm">
              <p className="text-sm font-medium text-zinc-700">Workforce (employees + managers)</p>
              <p className="text-2xl font-bold text-zinc-950">{workforceDisplay}</p>
              <p className="mt-1 text-xs text-zinc-500">Excludes HR / Admin accounts</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-gradient-to-br from-white to-sky-50 p-4 shadow-sm">
              <p className="text-sm font-medium text-zinc-700">Total net pay (latest month)</p>
              <p className="text-2xl font-bold text-zinc-950">{totalSalaryDisplay}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {stats?.latestSalaryPeriod ? payrollPeriodLabel(stats.latestSalaryPeriod) : "No payroll rows yet"}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-gradient-to-br from-white to-sky-50 p-4 shadow-sm">
              <p className="text-sm font-medium text-zinc-700">Avg net pay (latest month)</p>
              <p className="text-2xl font-bold text-zinc-950">{avgSalaryDisplay}</p>
              <p className="mt-1 text-xs text-zinc-500">Mean across staff with a saved row for that month</p>
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-[1.5fr,1fr]">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h3 className="text-lg font-semibold text-zinc-900">Salary trend</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Total net pay per month from saved salary records (up to six recent months).
              </p>
              <div className="mt-4 rounded-lg border border-zinc-100 bg-zinc-50/80 p-3">
                {dashboardLoading ? (
                  <p className="py-16 text-center text-sm text-zinc-500">Loading chart…</p>
                ) : trend.length ? (
                  <SalaryTrendChart trend={trend} formatValue={formatInt} periodShort={chartPeriodShort} />
                ) : (
                  <p className="py-12 text-center text-sm text-zinc-600">
                    No salary data yet. Open the <span className="font-medium">Salary</span> tab and save monthly
                    payroll — totals will appear here automatically.
                  </p>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h3 className="text-lg font-semibold text-zinc-900">Action queue</h3>
              <p className="mt-1 text-xs text-zinc-500">Click an item to jump to the right screen.</p>
              <ul className="mt-4 space-y-3 text-sm">
                {dashboardLoading ? (
                  <li className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-zinc-600">Loading…</li>
                ) : (
                  todoItems.map((item) =>
                    item.tab ? (
                      <li key={item.key}>
                        <button
                          type="button"
                          onClick={() => setActiveTab(item.tab!)}
                          className={`w-full rounded-md border p-3 text-left text-zinc-800 transition hover:opacity-90 ${item.tone}`}
                        >
                          {item.text}
                        </button>
                      </li>
                    ) : (
                      <li key={item.key} className={`rounded-md border p-3 text-zinc-800 ${item.tone}`}>
                        {item.text}
                      </li>
                    ),
                  )
                )}
              </ul>
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === "create-employee") {
      return (
        <AdminCreateEmployeeForm
          refreshManagersKey={refreshKey}
          onCreated={() => setRefreshKey((k) => k + 1)}
        />
      );
    }
    if (activeTab === "employee-list") {
      return <EmployeeList refreshKey={refreshKey} />;
    }
    if (activeTab === "salary") {
      return <AdminSalaryPanel refreshKey={refreshKey} />;
    }
    if (activeTab === "projects") {
      return <AdminProjectsPanel refreshKey={refreshKey} />;
    }
    if (activeTab === "holidays") {
      return <AdminHolidaysPanel />;
    }
    if (activeTab === "events") {
      return <AdminEventsPanel refreshKey={refreshKey} />;
    }
    if (activeTab === "activities") {
      const formatWhen = (iso: string) => {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "—";
        return d.toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      };
      return (
        <section className="animate-fade-in rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-zinc-900">Activity timeline</h2>
              <p className="mt-1 max-w-2xl text-sm text-zinc-600">
                Recent actions by HR and Admin (new accounts, project changes, leave/WFH/miss punch and offboarding
                decisions, and more) are recorded automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Refresh
            </button>
          </div>
          {activitiesTabLoading ? <p className="mt-4 text-sm text-zinc-600">Loading activity…</p> : null}
          {activitiesTabError ? <p className="mt-4 text-sm text-red-700">{activitiesTabError}</p> : null}
          {!activitiesTabLoading && !activitiesTabError ? (
            <div className="mt-4 space-y-4 border-l-2 border-zinc-200 pl-4">
              {activitiesTabRows.map((row) => (
                <div
                  key={row._id}
                  className="relative rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800"
                >
                  <span className="absolute -left-[22px] top-4 h-3 w-3 rounded-full bg-teal-500" />
                  <p className="font-medium text-zinc-900">{row.message}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    <span className="font-medium text-zinc-600">@{row.actorUsername}</span>
                    {row.kind ? (
                      <span className="ml-2 rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-[10px] text-zinc-700">
                        {row.kind}
                      </span>
                    ) : null}
                    <span className="ml-2">{formatWhen(row.createdAt)}</span>
                  </p>
                </div>
              ))}
              {!activitiesTabRows.length ? (
                <p className="text-sm text-zinc-600">
                  No activity recorded yet. Create a project or employee, update reporting/project on the Employees tab,
                  or process leave and offboarding requests — entries will show up here.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      );
    }
    if (activeTab === "users") {
      const projectName = (id?: string) => {
        if (!id) return "—";
        return usersTabProjects.find((p) => p._id === id)?.name ?? "—";
      };
      const managerName = (managerId?: string) => {
        if (!managerId) return "—";
        const m = usersTabRows.find((u) => u.id === managerId);
        return m?.profile?.fullName?.trim() || m?.username || "—";
      };
      const formatCreated = (iso: string) => {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "—";
        return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
      };
      const roleLabels: Record<string, string> = {
        admin: "Admin",
        hr: "HR",
        manager: "Manager",
        employee: "Employee",
      };
      const roleLabel = (r: string) => roleLabels[r] ?? (r.charAt(0).toUpperCase() + r.slice(1));

      return (
        <section className="animate-fade-in rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-zinc-900">Users</h2>
              <p className="mt-1 max-w-2xl text-sm text-zinc-600">
                Live directory from your database (same accounts as Employees). Use the Employees tab to change manager
                or project; use Projects for team summaries.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Refresh
            </button>
          </div>
          {usersTabLoading ? <p className="mt-4 text-sm text-zinc-600">Loading users…</p> : null}
          {usersTabError ? <p className="mt-4 text-sm text-red-700">{usersTabError}</p> : null}
          {!usersTabLoading && !usersTabError ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="border-b border-zinc-200 text-zinc-700">
                  <tr>
                    <th className="py-2 pl-1">Name</th>
                    <th className="py-2">Username</th>
                    <th className="py-2">Email</th>
                    <th className="py-2">Role</th>
                    <th className="py-2">Manager</th>
                    <th className="py-2">Project</th>
                    <th className="py-2">Leave (ann. / carry.)</th>
                    <th className="py-2">Created</th>
                    <th className="py-2">Account</th>
                  </tr>
                </thead>
                <tbody>
                  {usersTabRows.map((u) => {
                    const name = u.profile?.fullName?.trim() || u.username;
                    const leaveCell =
                      u.annualLeave !== undefined && u.carryForward !== undefined
                        ? `${u.annualLeave} / ${u.carryForward}`
                        : "—";
                    return (
                      <tr key={u.id} className="border-b border-zinc-100">
                        <td className="py-2 pl-1 font-medium text-zinc-900">{name}</td>
                        <td className="py-2 text-zinc-800">{u.username}</td>
                        <td className="py-2 text-zinc-800">{u.profile?.email ?? "—"}</td>
                        <td className="py-2 capitalize text-zinc-800">{roleLabel(u.role)}</td>
                        <td className="py-2 text-zinc-800">{managerName(u.profile?.managerId)}</td>
                        <td className="py-2 text-zinc-800">{projectName(u.profile?.projectId)}</td>
                        <td className="py-2 text-zinc-800">{leaveCell}</td>
                        <td className="py-2 text-zinc-700">{formatCreated(u.createdAt)}</td>
                        <td className="py-2">
                          {u.mustChangePassword ? (
                            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-900">
                              Must set password
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-800">Active</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!usersTabRows.length ? (
                    <tr>
                      <td className="py-8 text-center text-zinc-500" colSpan={9}>
                        No users in the directory yet. Create accounts from Create Employee.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      );
    }

    if (activeTab === "attendance") {
      return <AdminAttendancePanel />;
    }

    if (activeTab === "assets") {
      const catalog = assetsData?.assets ?? [];
      const reqRows = assetsData?.requests ?? [];
      const byId = new Map(catalog.map((a: any) => [a._id, a]));
      return (
        <section className="animate-fade-in rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-xl font-semibold text-zinc-900">Assets</h2>
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Refresh
            </button>
          </div>
          <p className="mt-1 text-sm text-zinc-600">
            Admin creates asset catalog items with stock quantity. Employees can only request from this list.
          </p>
          {assetsError ? <p className="mt-3 text-sm text-red-700">{assetsError}</p> : null}

          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <h3 className="text-sm font-semibold text-zinc-900">Create asset</h3>
              <form
                key={createAssetFormKey}
                onSubmit={async (e) => {
                  e.preventDefault();
                  setAssetsError(null);
                  setAssetsBusy("create");
                  const fd = new FormData(e.currentTarget as HTMLFormElement);
                  fd.set("kind", "create");
                  const res = await fetch("/api/admin/assets", {
                    method: "POST",
                    body: fd,
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) setAssetsError(data.error ?? "Create failed");
                  else setCreateAssetFormKey((k) => k + 1);
                  setAssetsBusy(null);
                  setRefreshKey((k) => k + 1);
                }}
                className="mt-3 grid gap-3 sm:grid-cols-2"
              >
                <label className="block text-xs font-medium text-zinc-700">
                  Name
                  <input name="name" className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm" required />
                </label>
                <label className="block text-xs font-medium text-zinc-700">
                  Category
                  <input name="category" className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm" placeholder="Laptop, ID card, etc." required />
                </label>
                <label className="block text-xs font-medium text-zinc-700">
                  Value
                  <input name="value" type="number" min={0} step="1" className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm" required />
                </label>
                <label className="block text-xs font-medium text-zinc-700">
                  Quantity
                  <input name="totalQty" type="number" min={1} step="1" className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm" required />
                </label>
                <label className="block text-xs font-medium text-zinc-700 sm:col-span-2">
                  Details
                  <textarea name="details" className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm" rows={3} />
                </label>
                <label className="block text-xs font-medium text-zinc-700 sm:col-span-2">
                  Asset image (optional)
                  <input
                    name="image"
                    type="file"
                    accept="image/*"
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                  />
                </label>
                <button
                  type="submit"
                  disabled={assetsBusy === "create"}
                  className="w-fit rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 sm:col-span-2"
                >
                  {assetsBusy === "create" ? "Creating…" : "Create asset"}
                </button>
              </form>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <h3 className="text-sm font-semibold text-zinc-900">Catalog</h3>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="border-b border-zinc-200 text-zinc-700">
                    <tr>
                      <th className="py-2">Image</th>
                      <th className="py-2">Name</th>
                      <th className="py-2">Category</th>
                      <th className="py-2">Value</th>
                      <th className="py-2">Stock</th>
                      <th className="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.map((a: any) => {
                      const canDelete = a.availableQty === a.totalQty;
                      const busy = assetsBusy === `delete:${a._id}`;
                      return (
                      <tr key={a._id} className="border-b border-zinc-100">
                        <td className="py-2 text-zinc-800">
                          {a.imageUrl ? (
                            <img
                              src={a.imageUrl}
                              alt={a.name}
                              className="h-10 w-10 rounded-md border border-zinc-200 object-cover"
                            />
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="py-2 text-zinc-800">{a.name}</td>
                        <td className="py-2 text-zinc-700">{a.category}</td>
                        <td className="py-2 text-zinc-700">{a.value}</td>
                        <td className="py-2 text-zinc-700">
                          {a.availableQty}/{a.totalQty}
                        </td>
                        <td className="py-2">
                          <button
                            type="button"
                            disabled={!canDelete || busy}
                            onClick={async () => {
                              setAssetsError(null);
                              setAssetsBusy(`delete:${a._id}`);
                              const res = await fetch("/api/admin/assets", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ kind: "delete", assetId: a._id }),
                              });
                              const data = await res.json().catch(() => ({}));
                              if (!res.ok) setAssetsError(data.error ?? "Delete failed");
                              setAssetsBusy(null);
                              setRefreshKey((k) => k + 1);
                            }}
                            className="rounded-md border border-red-300 bg-white px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                            title={!canDelete ? "Cannot delete after stock is used" : undefined}
                          >
                            {busy ? "…" : "Delete"}
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                    {!catalog.length ? (
                      <tr>
                        <td className="py-4 text-center text-zinc-500" colSpan={6}>
                          No assets created yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="mt-7 border-t border-zinc-100 pt-6">
            <h3 className="text-sm font-semibold text-zinc-900">Employee asset requests</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b border-zinc-200 text-zinc-700">
                  <tr>
                    <th className="py-2">Submitted</th>
                    <th className="py-2">Employee</th>
                    <th className="py-2">Asset</th>
                    <th className="py-2">Qty</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Reason</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reqRows.map((r: any) => {
                    const a = byId.get(r.assetId);
                    const pending = r.status === "pending";
                    const busy = assetsBusy === r._id;
                    return (
                      <tr key={r._id} className="border-b border-zinc-100">
                        <td className="py-2 text-zinc-700">{formatIsoUtc(r.createdAt)}</td>
                        <td className="py-2 text-zinc-800">{getEmployeeDisplayName(r.userId)}</td>
                        <td className="py-2 text-zinc-700">{a ? `${a.name} (${a.category})` : r.assetId}</td>
                        <td className="py-2 text-zinc-700">{r.qty}</td>
                        <td className="py-2 capitalize text-zinc-700">{r.status}</td>
                        <td className="max-w-[240px] truncate py-2 text-zinc-700" title={r.reason}>
                          {r.reason}
                        </td>
                        <td className="py-2">
                          {pending ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={async () => {
                                  setAssetsError(null);
                                  setAssetsBusy(r._id);
                                  const res = await fetch("/api/admin/assets", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      kind: "decide-request",
                                      requestId: r._id,
                                      decision: "approve",
                                    }),
                                  });
                                  const data = await res.json().catch(() => ({}));
                                  if (!res.ok) setAssetsError(data.error ?? "Approve failed");
                                  setAssetsBusy(null);
                                  setRefreshKey((k) => k + 1);
                                }}
                                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                              >
                                {busy ? "…" : "Approve"}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={async () => {
                                  setAssetsError(null);
                                  setAssetsBusy(r._id);
                                  const res = await fetch("/api/admin/assets", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      kind: "decide-request",
                                      requestId: r._id,
                                      decision: "reject",
                                    }),
                                  });
                                  const data = await res.json().catch(() => ({}));
                                  if (!res.ok) setAssetsError(data.error ?? "Reject failed");
                                  setAssetsBusy(null);
                                  setRefreshKey((k) => k + 1);
                                }}
                                className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!reqRows.length ? (
                    <tr>
                      <td className="py-4 text-center text-zinc-500" colSpan={7}>
                        No asset requests yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      );
    }

    if (activeTab === "leave-requests") {
      const rows = (overview?.leaveRequests ?? []).slice(0, 30);
      const balances = overview?.leaveBalances ?? [];
      return (
        <section className="animate-fade-in rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-zinc-900">Leave Requests</h2>
          <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <h3 className="mb-2 text-sm font-semibold text-zinc-900">Leave balance tracking</h3>
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="border-b border-zinc-200 text-zinc-700">
                <tr>
                  <th className="py-2">Employee</th>
                  <th className="py-2">Available Leave</th>
                  <th className="py-2">Carry Forward</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={b.userId} className="border-b border-zinc-100">
                    <td className="py-2 text-zinc-800">{getEmployeeDisplayName(b.userId)}</td>
                    <td className="py-2 text-zinc-800">{b.annualLeave}</td>
                    <td className="py-2 text-zinc-700">{b.carryForward}</td>
                  </tr>
                ))}
                {!balances.length ? (
                  <tr>
                    <td className="py-2 text-zinc-500" colSpan={3}>No leave balances available.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {requestDecisionError ? (
            <p className="mt-3 text-sm text-red-700" role="alert">
              {requestDecisionError}
            </p>
          ) : null}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b border-zinc-200 text-zinc-700">
                <tr>
                  <th className="py-2">Employee</th>
                  <th className="py-2">From</th>
                  <th className="py-2">To</th>
                  <th className="py-2">Days</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Reason</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const pending = row.status === "pending";
                  const busy =
                    actingRequest?.kind === "leave" && actingRequest.id === row._id;
                  return (
                    <tr key={row._id} className="border-b border-zinc-100">
                      <td className="py-2 text-zinc-800">{getEmployeeDisplayName(row.userId)}</td>
                      <td className="py-2 text-zinc-800">{row.fromDate}</td>
                      <td className="py-2 text-zinc-800">{row.toDate}</td>
                      <td className="py-2 text-zinc-800">{row.days}</td>
                      <td className="py-2 capitalize text-zinc-800">
                        {row.compensation === "unpaid" ? "Unpaid" : "Paid"}
                      </td>
                      <td className="py-2 capitalize text-zinc-800">{row.status}</td>
                      <td className="max-w-[200px] truncate py-2 text-zinc-700" title={row.reason}>
                        {row.reason ?? "—"}
                      </td>
                      <td className="py-2">
                        {pending ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void submitRequestDecision("leave", row._id, "approve")}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {busy ? "…" : "Accept"}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void submitRequestDecision("leave", row._id, "reject")}
                              className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      );
    }

    if (activeTab === "miss-punch") {
      const missRows = (overview?.missPunchRequests ?? []).slice(0, 50);
      return (
        <section className="animate-fade-in rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-xl font-semibold text-zinc-900">Miss Punch Requests</h2>
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Refresh list
            </button>
          </div>
          <p className="mt-1 text-sm text-zinc-600">
            Employee miss punch submissions (including early punch-out notes) load from the server.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-zinc-200 text-zinc-700">
                <tr>
                  <th className="py-2">Submitted</th>
                  <th className="py-2">Employee</th>
                  <th className="py-2">Date</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Reason</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {missRows.map((row) => {
                  const pending = row.status === "pending";
                  const busy =
                    actingRequest?.kind === "miss-punch" && actingRequest.id === row._id;
                  return (
                    <tr key={row._id} className="border-b border-zinc-100">
                      <td className="py-2 text-zinc-700">{formatIsoUtc(row.createdAt)}</td>
                      <td className="py-2 text-zinc-800">{getEmployeeDisplayName(row.userId)}</td>
                      <td className="py-2 text-zinc-800">{row.date}</td>
                      <td className="py-2 text-zinc-800">
                        {row.type === "punch-out" ? "Punch out" : "Punch in"}
                      </td>
                      <td className="py-2 capitalize text-zinc-800">{row.status}</td>
                      <td className="max-w-[220px] truncate py-2 text-zinc-700" title={row.reason}>
                        {row.reason ?? "—"}
                      </td>
                      <td className="py-2">
                        {pending ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void submitRequestDecision("miss-punch", row._id, "approve")
                              }
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {busy ? "…" : "Accept"}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void submitRequestDecision("miss-punch", row._id, "reject")
                              }
                              className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!missRows.length ? (
                  <tr>
                    <td className="py-4 text-center text-zinc-500" colSpan={7}>
                      No miss punch requests yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      );
    }

    if (activeTab === "wfh-requests") {
      const rows = (overview?.wfhRequests ?? []).slice(0, 40);
      return (
        <section className="animate-fade-in rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-zinc-900">Work from home requests</h2>
          {requestDecisionError ? (
            <p className="mt-3 text-sm text-red-700" role="alert">
              {requestDecisionError}
            </p>
          ) : null}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b border-zinc-200 text-zinc-700">
                <tr>
                  <th className="py-2">Employee</th>
                  <th className="py-2">From</th>
                  <th className="py-2">To</th>
                  <th className="py-2">Days</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Reason</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const pending = row.status === "pending";
                  const busy = actingRequest?.kind === "wfh" && actingRequest.id === row._id;
                  return (
                    <tr key={row._id} className="border-b border-zinc-100">
                      <td className="py-2 text-zinc-800">{getEmployeeDisplayName(row.userId)}</td>
                      <td className="py-2 text-zinc-800">{row.fromDate}</td>
                      <td className="py-2 text-zinc-800">{row.toDate}</td>
                      <td className="py-2 text-zinc-800">{row.days}</td>
                      <td className="py-2 capitalize text-zinc-800">{row.status}</td>
                      <td className="max-w-[240px] truncate py-2 text-zinc-700" title={row.reason}>
                        {row.reason ?? "—"}
                      </td>
                      <td className="py-2">
                        {pending ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void submitRequestDecision("wfh", row._id, "approve")}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {busy ? "…" : "Accept"}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void submitRequestDecision("wfh", row._id, "reject")}
                              className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      );
    }

    if (activeTab === "offboarding") {
      const rows = offboarding?.offboarding ?? [];
      return (
        <section className="animate-fade-in rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-xl font-semibold text-zinc-900">Offboarding</h2>
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Refresh
            </button>
          </div>
          <p className="mt-1 text-sm text-zinc-600">
            Resignations and terminations require asset clearance (return or pay) before approval.
          </p>
          {offboardingError ? <p className="mt-3 text-sm text-red-700">{offboardingError}</p> : null}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="border-b border-zinc-200 text-zinc-700">
                <tr>
                  <th className="py-2">Submitted</th>
                  <th className="py-2">Employee</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Last day</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Assets</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => {
                  const busy = offboardingBusy === r._id;
                  const pending = r.status === "pending";
                  const clearedAll = !(r.assetClearance ?? []).some((a: any) => !a.cleared);
                  return (
                    <tr key={r._id} className="border-b border-zinc-100 align-top">
                      <td className="py-2 text-zinc-700">{formatIsoUtc(r.createdAt)}</td>
                      <td className="py-2 text-zinc-800">{getEmployeeDisplayName(r.userId)}</td>
                      <td className="py-2 text-zinc-700 capitalize">{r.type}</td>
                      <td className="py-2 text-zinc-700">{r.lastWorkingDay}</td>
                      <td className="py-2 text-zinc-700 capitalize">{r.status}</td>
                      <td className="py-2">
                        <div className="space-y-2">
                          {(r.assetClearance ?? []).map((a: any) => (
                            <div key={a.assetId} className="rounded border border-zinc-200 bg-zinc-50 p-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-medium text-zinc-800">{a.assetName}</p>
                                <span className={`text-[10px] font-semibold ${a.cleared ? "text-emerald-700" : "text-amber-700"}`}>
                                  {a.cleared ? "CLEARED" : "PENDING"}
                                </span>
                              </div>
                              <p className="mt-1 text-[11px] text-zinc-700">
                                Action: <span className="font-semibold">{a.actionRequired}</span> · Amount:{" "}
                                <span className="font-semibold">{a.amountDue}</span>
                              </p>
                              {pending && !a.cleared ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={async () => {
                                      setOffboardingError(null);
                                      setOffboardingBusy(r._id);
                                      const res = await fetch("/api/admin/offboarding", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                          kind: "asset-action",
                                          requestId: r._id,
                                          assetId: a.assetId,
                                          actionRequired: "return",
                                        }),
                                      });
                                      const data = await res.json().catch(() => ({}));
                                      if (!res.ok) setOffboardingError(data.error ?? "Update failed");
                                      setOffboardingBusy(null);
                                      setRefreshKey((k) => k + 1);
                                    }}
                                    className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium text-zinc-800 hover:bg-zinc-100 disabled:opacity-50"
                                  >
                                    Require return
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={async () => {
                                      setOffboardingError(null);
                                      setOffboardingBusy(r._id);
                                      const res = await fetch("/api/admin/offboarding", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                          kind: "asset-action",
                                          requestId: r._id,
                                          assetId: a.assetId,
                                          actionRequired: "pay",
                                        }),
                                      });
                                      const data = await res.json().catch(() => ({}));
                                      if (!res.ok) setOffboardingError(data.error ?? "Update failed");
                                      setOffboardingBusy(null);
                                      setRefreshKey((k) => k + 1);
                                    }}
                                    className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium text-zinc-800 hover:bg-zinc-100 disabled:opacity-50"
                                  >
                                    Require pay
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={async () => {
                                      setOffboardingError(null);
                                      setOffboardingBusy(r._id);
                                      const res = await fetch("/api/admin/offboarding", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                          kind: "asset-clear",
                                          requestId: r._id,
                                          assetId: a.assetId,
                                          clearAs: a.actionRequired === "pay" ? "paid" : "returned",
                                        }),
                                      });
                                      const data = await res.json().catch(() => ({}));
                                      if (!res.ok) setOffboardingError(data.error ?? "Clear failed");
                                      setOffboardingBusy(null);
                                      setRefreshKey((k) => k + 1);
                                    }}
                                    className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                  >
                                    Mark cleared
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ))}
                          {!(r.assetClearance ?? []).length ? (
                            <span className="text-xs text-zinc-500">No assets</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2">
                        {pending ? (
                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              disabled={busy || !clearedAll}
                              onClick={async () => {
                                setOffboardingError(null);
                                setOffboardingBusy(r._id);
                                const res = await fetch("/api/admin/offboarding", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ kind: "decide", requestId: r._id, decision: "approve" }),
                                });
                                const data = await res.json().catch(() => ({}));
                                if (!res.ok) setOffboardingError(data.error ?? "Approve failed");
                                setOffboardingBusy(null);
                                setRefreshKey((k) => k + 1);
                              }}
                              className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                              title={!clearedAll ? "Clear all assets first" : undefined}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                setOffboardingError(null);
                                setOffboardingBusy(r._id);
                                const res = await fetch("/api/admin/offboarding", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ kind: "decide", requestId: r._id, decision: "reject" }),
                                });
                                const data = await res.json().catch(() => ({}));
                                if (!res.ok) setOffboardingError(data.error ?? "Reject failed");
                                setOffboardingBusy(null);
                                setRefreshKey((k) => k + 1);
                              }}
                              className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!rows.length ? (
                  <tr>
                    <td className="py-6 text-center text-zinc-500" colSpan={7}>
                      No offboarding requests yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      );
    }

    const fallbackTitle = navItems.find((i) => i.key === activeTab)?.label ?? activeTab;

    return (
      <section className="animate-fade-in rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-zinc-900">{fallbackTitle}</h2>
        <p className="mt-2 text-sm text-zinc-700">
          This section is ready in the sidebar layout. Next, we can connect this to real APIs and tables for approvals, filters, and status updates.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-zinc-800">Pending Items</p>
            <p className="text-2xl font-bold text-zinc-900">0</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-zinc-800">Processed Today</p>
            <p className="text-2xl font-bold text-zinc-900">0</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <main className="dashboard-shell mx-auto flex h-screen max-h-screen w-full max-w-[1600px] flex-col overflow-hidden bg-[#f2f4f8] text-zinc-900">
      <div className="h-1 w-full shrink-0 bg-gradient-to-r from-teal-400 via-cyan-400 to-blue-500" />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-full max-w-[250px] shrink-0 flex-col overflow-y-auto border-r border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-4 py-3">
            <p className="text-xl font-bold tracking-wide text-zinc-800">LUCID</p>
          </div>
          <div className="border-b border-zinc-200 px-4 py-4">
            <p className="text-xs text-zinc-400">Welcome,</p>
            <p className="text-sm font-semibold text-zinc-900">{user.username}</p>
            <p className="mt-0.5 text-xs capitalize text-zinc-500">Role: {user.role}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div
                title="Average years since joining date (employees and managers with a valid joining date on file)."
              >
                <p className="text-sm font-semibold text-zinc-900">
                  {dashboardLoading && !dashboardStats
                    ? "…"
                    : dashboardStats?.sidebarAvgTenureYears != null
                      ? dashboardStats.sidebarAvgTenureYears
                      : "—"}
                </p>
                <p className="text-[10px] text-zinc-400">Avg. tenure</p>
              </div>
              <div title="Employees and managers in the directory (excludes HR/Admin accounts).">
                <p className="text-sm font-semibold text-zinc-900">
                  {dashboardLoading && !dashboardStats ? "…" : dashboardStats != null ? dashboardStats.totalWorkforce : "—"}
                </p>
                <p className="text-[10px] text-zinc-400">Employees</p>
              </div>
              <div title="Number of projects in the system (used here as active “clients”).">
                <p className="text-sm font-semibold text-zinc-900">
                  {dashboardLoading && !dashboardStats ? "…" : dashboardStats != null ? dashboardStats.sidebarProjectCount : "—"}
                </p>
                <p className="text-[10px] text-zinc-400">Clients</p>
              </div>
            </div>
          </div>
          {user.role === "hr" ? (
            <div className="border-b border-zinc-200 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">My punch</p>
              <p className="mt-1.5 text-xs text-zinc-600">
                Today:{" "}
                <span
                  className={
                    hrPunchStatus === "Punched In"
                      ? "font-semibold text-emerald-700"
                      : hrPunchStatus === "Punched Out"
                        ? "font-semibold text-zinc-800"
                        : "font-semibold text-zinc-600"
                  }
                >
                  {hrPunchStatus}
                </span>
                {hrLastPunchTime ? <span className="text-zinc-500"> · {hrLastPunchTime}</span> : null}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleHrPunchIn()}
                  disabled={hrPunchStatus === "Punched In" || hrPunchStatus === "Punched Out"}
                  className="flex-1 rounded-md bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Punch in
                </button>
                <button
                  type="button"
                  onClick={() => void handleHrPunchOut()}
                  disabled={hrPunchStatus === "Punched Out"}
                  className="flex-1 rounded-md bg-rose-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Punch out
                </button>
              </div>
              {hrPunchStatus === "Punched Out" ? (
                <p className="mt-1.5 text-[11px] text-zinc-500">Today&apos;s punches are complete.</p>
              ) : null}
              {hrPunchMessage ? (
                <p
                  className={`mt-1.5 text-xs ${hrPunchMessage.includes("recorded.") ? "text-emerald-700" : "text-red-700"}`}
                >
                  {hrPunchMessage}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="px-3 py-2">
            <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              HR
            </p>
          </div>
          <nav className="space-y-1 px-2 pb-4">
            {navItems.map((item) => {
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveTab(item.key)}
                  className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-[13px] transition ${
                    isActive
                      ? "bg-teal-50 text-teal-800"
                      : "text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  <span className="text-sm">{navIcons[item.key]}</span>
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-3">
              <h1 className="text-[22px] font-semibold tracking-tight text-zinc-900">
                {user.role === "hr" ? "HR Dashboard" : "Admin Dashboard"}
              </h1>
              <p className="hidden text-xs text-zinc-600 md:block">
                / {navItems.find((i) => i.key === activeTab)?.label ?? activeTab}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input
                placeholder="Search here..."
                className="hidden w-72 rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 md:block"
              />
              <LogoutButton />
            </div>
          </header>
          {user.mustChangePassword ? (
            <section className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-medium text-amber-900">Set a new password to continue.</p>
              <div className="mt-3 max-w-md">
                <EmployeePasswordForm />
              </div>
            </section>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#f2f4f8] p-4">
            <section className="rounded border border-zinc-200 bg-white p-4">{renderContent()}</section>
          </div>
        </section>
      </div>
    </main>
  );
}

export function AdminDashboard({ user }: { user: SafeUser }) {
  return (
    <Suspense
      fallback={
        <main className="dashboard-shell mx-auto flex min-h-screen w-full max-w-[1600px] items-center justify-center bg-[#f2f4f8] text-zinc-900">
          <p className="text-sm text-zinc-600">Loading dashboard…</p>
        </main>
      }
    >
      <AdminDashboardShell user={user} />
    </Suspense>
  );
}
