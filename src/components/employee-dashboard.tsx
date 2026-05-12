"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SafeUser } from "@/lib/types";
import { EmployeePasswordForm } from "./employee-password-form";
import { EmployeePayslipPanel } from "./employee-payslip-panel";
import { LogoutButton } from "./logout-button";
import { EmployeeDocument, EmployeeDocumentType, EmployeeProfile } from "@/lib/types";
import { EmployeeProfileModal, type EmployeeRow } from "./employee-profile-modal";

/** Calendar YYYY-MM-DD from a local Date (never use toISOString() for calendar keys). */
function localIsoFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Map YYYY-MM-DD → company events for employee calendar cells (current month). */
function companyEventsForMonthCells(
  year: number,
  month0: number,
  events: Array<{ _id: string; title: string; startDate: string; endDate: string }>,
): Map<string, Array<{ _id: string; title: string }>> {
  const map = new Map<string, Array<{ _id: string; title: string }>>();
  const dim = new Date(year, month0 + 1, 0).getDate();
  for (let day = 1; day <= dim; day += 1) {
    const iso = localIsoFromDate(new Date(year, month0, day));
    for (const ev of events) {
      if (iso >= ev.startDate && iso <= ev.endDate) {
        const arr = map.get(iso) ?? [];
        if (!arr.some((x) => x._id === ev._id)) arr.push({ _id: ev._id, title: ev.title });
        map.set(iso, arr);
      }
    }
  }
  return map;
}

/** Parse YYYY-MM-DD as a local calendar day (avoids UTC-only parsing of date-only strings). */
function localDateFromIso(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return new Date(NaN);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Local punch-out time strictly before 5:00 PM counts as an early punch-out (HR may need a miss-punch note). */
const STANDARD_WORKDAY_END_HOUR = 17;

function isEarlyPunchOut(punchOutIso: string | undefined): boolean {
  if (!punchOutIso) return false;
  const t = new Date(punchOutIso);
  if (Number.isNaN(t.getTime())) return false;
  return t.getHours() * 60 + t.getMinutes() < STANDARD_WORKDAY_END_HOUR * 60;
}

function formatIsoUtc(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toISOString().slice(0, 16).replace("T", " ")}Z`;
}

const employeeNavItems = [
  { key: "overview", label: "Overview" },
  { key: "punch", label: "Punch In / Out" },
  { key: "working-days", label: "Working Days" },
  { key: "calendar", label: "Attendance Calendar" },
  { key: "leave-request", label: "Leave Request" },
  { key: "wfh-request", label: "WFH Request" },
  { key: "miss-punch", label: "Miss Punch Request" },
  { key: "team-approvals", label: "Team Approvals" },
  { key: "resignation", label: "Resignation" },
  { key: "profile-edit", label: "Profile Edit" },
  { key: "request-assets", label: "Request Assets" },
  { key: "payslip", label: "Payslip" },
  { key: "change-password", label: "Change Password" },
] as const;

const employeeNavIcons: Record<(typeof employeeNavItems)[number]["key"], string> = {
  overview: "🏠",
  punch: "⏱️",
  "working-days": "📊",
  calendar: "📅",
  "leave-request": "📝",
  "wfh-request": "💻",
  "miss-punch": "⚠️",
  "team-approvals": "✅",
  resignation: "📤",
  "profile-edit": "👤",
  "request-assets": "💼",
  payslip: "💵",
  "change-password": "🔒",
};

type EmployeeTab = (typeof employeeNavItems)[number]["key"];

const EMPLOYEE_TAB_KEYS = new Set<string>(employeeNavItems.map((item) => item.key));

function parseEmployeeTab(raw: string | null): EmployeeTab {
  if (raw && EMPLOYEE_TAB_KEYS.has(raw)) return raw as EmployeeTab;
  return "overview";
}

function EmployeeDashboardShell({
  user,
  profile,
  managerDisplay,
}: {
  user: SafeUser;
  profile: EmployeeProfile | null;
  managerDisplay: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTabState] = useState<EmployeeTab>(() => parseEmployeeTab(tabParam));

  useEffect(() => {
    setActiveTabState(parseEmployeeTab(searchParams.get("tab")));
  }, [searchParams]);

  const [missPunchPrefill, setMissPunchPrefill] = useState<{
    date: string;
    type: "punch-in" | "punch-out";
    reason?: string;
  } | null>(null);
  const [showEarlyPunchOutCue, setShowEarlyPunchOutCue] = useState(false);
  const [earlyPunchSuggest, setEarlyPunchSuggest] = useState<{ date: string } | null>(null);

  const setActiveTab = useCallback(
    (
      tab: EmployeeTab,
      options?: { missPunchPrefill?: { date: string; type: "punch-in" | "punch-out"; reason?: string } | null },
    ) => {
      if (options && "missPunchPrefill" in options) {
        setMissPunchPrefill(options.missPunchPrefill ?? null);
      } else {
        setMissPunchPrefill(null);
      }
      setActiveTabState(tab);
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "overview") params.delete("tab");
      else params.set("tab", tab);
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const [lastPunchTime, setLastPunchTime] = useState<string | null>(null);
  const [punchStatusLabel, setPunchStatusLabel] = useState<
    "Not punched yet" | "Punched In" | "Punched Out"
  >("Not punched yet");
  const [punchMessage, setPunchMessage] = useState("");
  const [workingSummary, setWorkingSummary] = useState<{
    plannedWorkingDays: number;
    weekendOffDays: number;
    holidayOffDays: number;
    presentDays: number;
    offWithoutPunch: number;
    totalWorkedHours: number;
    leaveBalance?: { annualLeave: number; carryForward: number };
    attendance: Array<{
      _id: string;
      date: string;
      punchIn?: string;
      punchOut?: string;
      workedHours: number;
      status: string;
    }>;
    recentLeaves: Array<{
      _id: string;
      fromDate: string;
      toDate: string;
      days: number;
      status: string;
      reason?: string;
      compensation?: "paid" | "unpaid";
    }>;
    recentWfh: Array<{
      _id: string;
      fromDate: string;
      toDate: string;
      days: number;
      status: string;
      reason?: string;
    }>;
    recentMissPunches: Array<{
      _id: string;
      date: string;
      type: string;
      status: string;
      reason?: string;
      createdAt?: string;
    }>;
    publicHolidays: string[];
    holidayCalendar?: Array<{ date: string; name: string; treatment: "holiday" | "working" }>;
  } | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [staffCalendarEvents, setStaffCalendarEvents] = useState<
    Array<{ _id: string; title: string; startDate: string; endDate: string }>
  >([]);

  const [leaveMessage, setLeaveMessage] = useState("");
  const [leaveError, setLeaveError] = useState("");
  const [wfhMessage, setWfhMessage] = useState("");
  const [wfhError, setWfhError] = useState("");
  const [missPunchMessage, setMissPunchMessage] = useState("");
  const [missPunchError, setMissPunchError] = useState("");
  const [leaveFormKey, setLeaveFormKey] = useState(0);
  const [wfhFormKey, setWfhFormKey] = useState(0);
  const [missPunchFormKey, setMissPunchFormKey] = useState(0);
  const [leaveEditId, setLeaveEditId] = useState<string | null>(null);
  const [wfhEditId, setWfhEditId] = useState<string | null>(null);
  const [missPunchEditId, setMissPunchEditId] = useState<string | null>(null);
  const [leavePrefill, setLeavePrefill] = useState<{ fromDate: string; toDate: string; reason: string } | null>(null);
  const [wfhPrefill, setWfhPrefill] = useState<{ fromDate: string; toDate: string; reason: string } | null>(null);
  const goToMissPunchForm = useCallback(
    (prefill: { date: string; type: "punch-in" | "punch-out"; reason?: string }) => {
      setMissPunchFormKey((k) => k + 1);
      setActiveTab("miss-punch", { missPunchPrefill: prefill });
    },
    [setActiveTab],
  );
  const [assetMessage, setAssetMessage] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [displayProfile, setDisplayProfile] = useState<EmployeeProfile | null>(profile);
  const [quickName, setQuickName] = useState(profile?.fullName ?? "");
  const [quickPhone, setQuickPhone] = useState(profile?.phone ?? "");
  const [quickProfileBusy, setQuickProfileBusy] = useState(false);
  const [quickProfileError, setQuickProfileError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [docUploadKey, setDocUploadKey] = useState(0);
  const [photoUploadKey, setPhotoUploadKey] = useState(0);
  const [localPhotoUrl, setLocalPhotoUrl] = useState<string | null>(profile?.profilePhotoUrl ?? null);
  const [localDocs, setLocalDocs] = useState<EmployeeDocument[]>(profile?.documents ?? []);
  const [resignationMessage, setResignationMessage] = useState<string | null>(null);
  const [resignationError, setResignationError] = useState<string | null>(null);
  const [resignationData, setResignationData] = useState<{
    request: any | null;
    assets: Array<{ assetId: string; name: string; category: string; value: number; qty: number }>;
  } | null>(null);
  const [resignationFormKey, setResignationFormKey] = useState(0);
  const [assetCatalog, setAssetCatalog] = useState<
    Array<{
      _id: string;
      name: string;
      category: string;
      value: number;
      details?: string;
      imageUrl?: string;
      availableQty: number;
    }>
  >([]);
  const [assetRequests, setAssetRequests] = useState<
    Array<{ _id: string; assetId: string; qty: number; reason: string; status: string; createdAt: string }>
  >([]);
  const [assetRequestMessage, setAssetRequestMessage] = useState<string | null>(null);
  const [assetRequestError, setAssetRequestError] = useState<string | null>(null);
  const [assetRequestKey, setAssetRequestKey] = useState(0);
  const [teamRequests, setTeamRequests] = useState<{
    employees: Array<{ id: string; username: string; profile?: { fullName?: string } }>;
    leaveRequests: Array<any>;
    wfhRequests: Array<any>;
    missPunchRequests: Array<any>;
    offboardingRequests?: Array<any>;
    leaveBalances?: Array<{ userId: string; annualLeave: number; carryForward: number }>;
  } | null>(null);
  const [teamRequestBusy, setTeamRequestBusy] = useState<string | null>(null);
  const [teamRequestError, setTeamRequestError] = useState<string | null>(null);
  const [teamProfileEmployee, setTeamProfileEmployee] = useState<EmployeeRow | null>(null);

  useEffect(() => {
    setDisplayProfile(profile);
    setQuickName(profile?.fullName ?? "");
    setQuickPhone(profile?.phone ?? "");
  }, [profile]);

  const loadAssetRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/employee/asset-requests");
      const data = await res.json();
      if (!res.ok) return;
      setAssetCatalog(data.catalog ?? []);
      setAssetRequests(data.myRequests ?? []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (activeTab === "request-assets") void loadAssetRequests();
  }, [activeTab, loadAssetRequests]);

  const loadStaffCalendarEvents = useCallback(async () => {
    const n = new Date();
    const y = n.getFullYear();
    const m = n.getMonth() + 1;
    try {
      const res = await fetch(`/api/employee/events?year=${y}&month=${m}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStaffCalendarEvents([]);
        return;
      }
      setStaffCalendarEvents(data.events ?? []);
    } catch {
      setStaffCalendarEvents([]);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "calendar" && activeTab !== "overview") return;
    void loadStaffCalendarEvents();
  }, [activeTab, loadStaffCalendarEvents]);

  useEffect(() => {
    if (activeTab !== "team-approvals" || user.role !== "manager") return;
    async function loadTeamRequests() {
      setTeamRequestError(null);
      const res = await fetch("/api/employee/team-requests");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTeamRequestError(data.error ?? "Could not load team requests");
        return;
      }
      setTeamRequests(data);
    }
    void loadTeamRequests();
  }, [activeTab, user.role]);

  const loadSummary = useCallback(async () => {
    try {
      setSummaryError("");
      const res = await fetch("/api/employee/working-summary");
      const data = await res.json();
      if (!res.ok) {
        setSummaryError(data.error ?? "Could not load working summary");
        return;
      }
      setWorkingSummary(data);

      const today = localIsoFromDate(new Date());
      const todayAttendance = (data.attendance ?? []).find(
        (a: { date: string; punchIn?: string; punchOut?: string }) => a.date === today,
      );

      if (!todayAttendance) {
        setPunchStatusLabel("Not punched yet");
        setLastPunchTime(null);
        setEarlyPunchSuggest(null);
        setShowEarlyPunchOutCue(false);
      } else if (todayAttendance.punchIn && !todayAttendance.punchOut) {
        setPunchStatusLabel("Punched In");
        setLastPunchTime(new Date(todayAttendance.punchIn).toLocaleTimeString());
        setEarlyPunchSuggest(null);
        setShowEarlyPunchOutCue(false);
      } else if (todayAttendance.punchOut) {
        setPunchStatusLabel("Punched Out");
        setLastPunchTime(new Date(todayAttendance.punchOut).toLocaleTimeString());
        if (isEarlyPunchOut(todayAttendance.punchOut)) {
          setEarlyPunchSuggest({ date: todayAttendance.date });
          setShowEarlyPunchOutCue(true);
        } else {
          setEarlyPunchSuggest(null);
          setShowEarlyPunchOutCue(false);
        }
      } else {
        setPunchStatusLabel("Not punched yet");
        setLastPunchTime(null);
        setEarlyPunchSuggest(null);
        setShowEarlyPunchOutCue(false);
      }
    } catch {
      setSummaryError("Could not load working summary");
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  async function handlePunchIn() {
    setPunchMessage("");
    const res = await fetch("/api/employee/punch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "in" }),
    });
    const data = await res.json();
    if (res.ok) {
      setPunchStatusLabel("Punched In");
      setLastPunchTime(new Date(data.attendance?.punchIn ?? Date.now()).toLocaleTimeString());
      setPunchMessage("Punch in recorded.");
      setEarlyPunchSuggest(null);
      setShowEarlyPunchOutCue(false);
      await loadSummary();
    } else {
      setPunchMessage(data.error ?? "Punch in failed.");
    }
  }

  async function handlePunchOut() {
    setPunchMessage("");
    const res = await fetch("/api/employee/punch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "out" }),
    });
    const data = await res.json();
    if (res.ok) {
      setPunchStatusLabel("Punched Out");
      setLastPunchTime(new Date(data.attendance?.punchOut ?? Date.now()).toLocaleTimeString());
      setWorkingSummary((prev) =>
        prev
          ? { ...prev, totalWorkedHours: Number((prev.totalWorkedHours + (data.attendance?.workedHours ?? 0)).toFixed(2)) }
          : prev,
      );
      setPunchMessage("Punch out recorded.");
      await loadSummary();
      const po = data.attendance?.punchOut as string | undefined;
      const dateKey = data.attendance?.date as string | undefined;
      if (po && dateKey && isEarlyPunchOut(po)) {
        setEarlyPunchSuggest({ date: dateKey });
        setShowEarlyPunchOutCue(true);
      } else {
        setEarlyPunchSuggest(null);
        setShowEarlyPunchOutCue(false);
      }
    } else {
      setPunchMessage(data.error ?? "Punch out failed.");
    }
  }

  async function handleLeaveSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLeaveMessage("");
    setLeaveError("");
    const formData = new FormData(event.currentTarget);
    const fromDate = String(formData.get("fromDate") ?? "");
    const toDate = String(formData.get("toDate") ?? "");
    const reason = String(formData.get("reason") ?? "");

    const res = await fetch("/api/employee/leave-request", {
      method: leaveEditId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        leaveEditId ? { requestId: leaveEditId, fromDate, toDate, reason } : { fromDate, toDate, reason },
      ),
    });
    const data = await res.json();
    if (res.ok) {
      const compensation = data?.request?.compensation as string | undefined;
      if (compensation === "unpaid") {
        setLeaveMessage(
          leaveEditId
            ? "Leave request updated as Unpaid Leave."
            : "Leave request submitted as Unpaid Leave.",
        );
      } else {
        setLeaveMessage(leaveEditId ? "Leave request updated successfully." : "Leave request submitted successfully.");
      }
      setLeaveFormKey((k) => k + 1);
      setLeaveEditId(null);
      setLeavePrefill(null);
      await loadSummary();
    } else {
      setLeaveError(data.error ?? "Leave request failed");
    }
  }

  async function handleWfhSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWfhMessage("");
    setWfhError("");
    const formData = new FormData(event.currentTarget);
    const fromDate = String(formData.get("fromDate") ?? "");
    const toDate = String(formData.get("toDate") ?? "");
    const reason = String(formData.get("reason") ?? "");

    const res = await fetch("/api/employee/wfh-request", {
      method: wfhEditId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        wfhEditId ? { requestId: wfhEditId, fromDate, toDate, reason } : { fromDate, toDate, reason },
      ),
    });
    const data = await res.json();
    if (res.ok) {
      setWfhMessage(wfhEditId ? "WFH request updated successfully." : "Work from home request submitted successfully.");
      setWfhFormKey((k) => k + 1);
      setWfhEditId(null);
      setWfhPrefill(null);
      await loadSummary();
    } else {
      setWfhError(data.error ?? "WFH request failed");
    }
  }

  function handleAssetSubmit(event: FormEvent) {
    event.preventDefault();
    setAssetMessage("Asset request submitted successfully.");
  }

  async function handleAssetRequestSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAssetRequestMessage(null);
    setAssetRequestError(null);
    const formData = new FormData(event.currentTarget);
    const assetId = String(formData.get("assetId") ?? "");
    const qty = Number(formData.get("qty") ?? 1);
    const reason = String(formData.get("reason") ?? "").trim();
    const res = await fetch("/api/employee/asset-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId, qty, reason }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAssetRequestError(typeof data.error === "string" ? data.error : "Request failed");
      return;
    }
    setAssetRequestMessage("Asset request submitted successfully.");
    setAssetRequestKey((k) => k + 1);
    await loadAssetRequests();
  }

  function handleProfileUpdate(event: FormEvent) {
    event.preventDefault();
    setProfileMessage("Profile update request submitted.");
  }

  async function handleOverviewQuickSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuickProfileError(null);
    setProfileMessage("");
    setQuickProfileBusy(true);
    try {
      const res = await fetch("/api/employee/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: quickName, phone: quickPhone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setQuickProfileError(typeof data.error === "string" ? data.error : "Update failed");
        return;
      }
      setDisplayProfile((prev) => ({
        ...(prev ?? ({} as EmployeeProfile)),
        ...(data.profile ?? {}),
      }));
      setProfileMessage("Profile updated successfully.");
    } finally {
      setQuickProfileBusy(false);
    }
  }

  async function handleProfilePhotoUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploadError(null);
    setUploadMessage(null);
    setUploading(true);
    try {
      const formData = new FormData(event.currentTarget);
      const res = await fetch("/api/employee/upload-profile-photo", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadError(typeof data.error === "string" ? data.error : "Upload failed");
        return;
      }
      const url = String(data.url ?? "");
      setLocalPhotoUrl(url ? `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}` : null);
      setPhotoUploadKey((k) => k + 1);
      setUploadMessage("Profile photo uploaded successfully.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDocumentUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploadError(null);
    setUploadMessage(null);
    setUploading(true);
    try {
      const formData = new FormData(event.currentTarget);
      const res = await fetch("/api/employee/upload-document", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadError(typeof data.error === "string" ? data.error : "Upload failed");
        return;
      }
      const doc = data.document as EmployeeDocument | undefined;
      if (doc?.id) {
        setLocalDocs((prev) => [doc, ...prev]);
      }
      setDocUploadKey((k) => k + 1);
      setUploadMessage("Document uploaded successfully.");
    } finally {
      setUploading(false);
    }
  }

  async function handleMissPunchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMissPunchMessage("");
    setMissPunchError("");
    const formData = new FormData(event.currentTarget);
    const date = String(formData.get("date") ?? "");
    const type = String(formData.get("type") ?? "");
    const reason = String(formData.get("reason") ?? "");

    const res = await fetch("/api/employee/miss-punch", {
      method: missPunchEditId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        missPunchEditId
          ? { requestId: missPunchEditId, date, type, reason }
          : { date, type, reason },
      ),
    });
    const data = await res.json();
    if (res.ok) {
      setMissPunchMessage(
        missPunchEditId ? "Miss punch request updated successfully." : "Miss punch request submitted successfully.",
      );
      setMissPunchFormKey((k) => k + 1);
      setMissPunchEditId(null);
      setMissPunchPrefill(null);
      setEarlyPunchSuggest(null);
      setShowEarlyPunchOutCue(false);
      await loadSummary();
    } else {
      setMissPunchError(data.error ?? "Miss punch request failed");
    }
  }

  const loadResignation = useCallback(async () => {
    try {
      const res = await fetch("/api/employee/resignation");
      const data = await res.json();
      if (!res.ok) return;
      setResignationData(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (activeTab === "resignation") void loadResignation();
  }, [activeTab, loadResignation]);

  async function handleResignationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResignationMessage(null);
    setResignationError(null);
    const formData = new FormData(event.currentTarget);
    const lastWorkingDay = String(formData.get("lastWorkingDay") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();
    const res = await fetch("/api/employee/resignation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lastWorkingDay, reason }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setResignationError(typeof data.error === "string" ? data.error : "Resignation failed");
      return;
    }
    setResignationMessage("Resignation submitted successfully.");
    setResignationFormKey((k) => k + 1);
    await loadResignation();
  }

  async function handleDeleteLeaveRequest(requestId: string) {
    setLeaveMessage("");
    setLeaveError("");
    const res = await fetch("/api/employee/leave-request", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLeaveError(typeof data.error === "string" ? data.error : "Delete failed");
      return;
    }
    if (leaveEditId === requestId) {
      setLeaveEditId(null);
      setLeavePrefill(null);
      setLeaveFormKey((k) => k + 1);
    }
    setLeaveMessage("Leave request deleted.");
    await loadSummary();
  }

  async function handleDeleteWfhRequest(requestId: string) {
    setWfhMessage("");
    setWfhError("");
    const res = await fetch("/api/employee/wfh-request", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setWfhError(typeof data.error === "string" ? data.error : "Delete failed");
      return;
    }
    if (wfhEditId === requestId) {
      setWfhEditId(null);
      setWfhPrefill(null);
      setWfhFormKey((k) => k + 1);
    }
    setWfhMessage("WFH request deleted.");
    await loadSummary();
  }

  async function handleDeleteMissPunchRequest(requestId: string) {
    setMissPunchMessage("");
    setMissPunchError("");
    const res = await fetch("/api/employee/miss-punch", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMissPunchError(typeof data.error === "string" ? data.error : "Delete failed");
      return;
    }
    if (missPunchEditId === requestId) {
      setMissPunchEditId(null);
      setMissPunchPrefill(null);
      setMissPunchFormKey((k) => k + 1);
    }
    setMissPunchMessage("Miss punch request deleted.");
    await loadSummary();
  }

  function renderContent() {
    if (activeTab === "overview") {
      const uploadedCertificateDocs = localDocs.filter((d) =>
        ["certificate", "sslc", "plus2", "degree", "experience"].includes(d.type),
      );
      const profileCertificateLabels = displayProfile?.certificates ?? [];
      const certificateItems = [
        ...uploadedCertificateDocs.map((d) => ({
          key: `doc:${d.id}`,
          label: d.label || d.fileName,
          url: d.url,
        })),
        ...profileCertificateLabels
          .filter(
            (label) =>
              !uploadedCertificateDocs.some((d) => (d.label || d.fileName).toLowerCase() === label.toLowerCase()),
          )
          .map((label) => ({ key: `text:${label}`, label, url: null as string | null })),
      ];
      const eventsMonthLabel = new Date().toLocaleString("default", { month: "long", year: "numeric" });
      return (
        <div className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-[1.6fr,1fr]">
          <section className="animate-fade-in rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Onboarding Profile</h2>
                <p className="mt-1 text-xs text-zinc-500">Quick update: name and phone</p>
              </div>
              <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold capitalize text-teal-700">
                {user.role}
              </span>
            </div>

            <form onSubmit={handleOverviewQuickSave} className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-zinc-700">
                Full name
                <input
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  required
                />
              </label>
              <label className="block text-xs font-medium text-zinc-700">
                Phone number
                <input
                  value={quickPhone}
                  onChange={(e) => setQuickPhone(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  required
                />
              </label>
              <button
                type="submit"
                disabled={quickProfileBusy}
                className="w-fit rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 sm:col-span-2"
              >
                {quickProfileBusy ? "Saving..." : "Save changes"}
              </button>
            </form>
            {quickProfileError ? <p className="mt-3 text-sm text-red-700">{quickProfileError}</p> : null}
            {profileMessage ? <p className="mt-3 text-sm text-emerald-700">{profileMessage}</p> : null}

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Department</p>
                <p className="mt-1 text-zinc-900">{displayProfile?.department ?? "-"}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Designation</p>
                <p className="mt-1 text-zinc-900">{displayProfile?.designation ?? "-"}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Email</p>
                <p className="mt-1 break-all text-zinc-900">{displayProfile?.email ?? "-"}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Joining Date</p>
                <p className="mt-1 text-zinc-900">{displayProfile?.joiningDate ?? "-"}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm sm:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Manager</p>
                <p className="mt-1 text-zinc-900">{managerDisplay ?? "—"}</p>
              </div>
            </div>
          </section>
          <section className="animate-fade-in rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">Certificates</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-700">
              {certificateItems.length ? (
                certificateItems.map((item) => (
                  <li key={item.key} className="flex items-center gap-2">
                    <span>{item.label}</span>
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-blue-700 underline hover:text-blue-900"
                      >
                        View
                      </a>
                    ) : null}
                  </li>
                ))
              ) : (
                <li>No certificates uploaded yet.</li>
              )}
            </ul>
          </section>
        </div>
        <section className="animate-fade-in rounded-2xl border border-violet-200 bg-violet-50/50 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Company events</h2>
          <p className="mt-1 text-xs text-zinc-600">
            Events HR schedules for your role in <span className="font-medium">{eventsMonthLabel}</span>. Day-by-day
            view is on <span className="font-medium">Attendance Calendar</span>.
          </p>
          <ul className="mt-3 divide-y divide-violet-100 rounded-lg border border-violet-100 bg-white text-sm">
            {staffCalendarEvents.length ? (
              staffCalendarEvents.map((ev) => (
                <li key={ev._id} className="px-3 py-2.5">
                  <p className="font-medium text-violet-950">{ev.title}</p>
                  <p className="mt-0.5 text-xs text-zinc-600">
                    {ev.startDate === ev.endDate ? ev.startDate : `${ev.startDate} → ${ev.endDate}`}
                  </p>
                </li>
              ))
            ) : (
              <li className="px-3 py-3 text-zinc-500">No company events for you this calendar month.</li>
            )}
          </ul>
        </section>
        </div>
      );
    }

    if (activeTab === "punch") {
      return (
        <section className="animate-fade-in rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Punch In / Punch Out</h2>
          <p className="mt-2 text-sm text-zinc-700">
            Current status:{" "}
            <span
              className={
                punchStatusLabel === "Punched In"
                  ? "font-semibold text-emerald-700"
                  : punchStatusLabel === "Punched Out"
                    ? "font-semibold text-rose-700"
                    : "font-semibold text-zinc-700"
              }
            >
              {punchStatusLabel}
            </span>
          </p>
          <p className="text-sm text-zinc-600">
            Last update: {lastPunchTime ?? "No punch activity yet"}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handlePunchIn}
              disabled={punchStatusLabel === "Punched In" || punchStatusLabel === "Punched Out"}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Punch In
            </button>
            <button
              type="button"
              onClick={handlePunchOut}
              disabled={punchStatusLabel === "Punched Out"}
              className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Punch Out
            </button>
          </div>
          {punchStatusLabel === "Punched Out" ? (
            <p className="mt-3 text-xs text-zinc-500">
              Today&apos;s attendance is complete. Further punches require HR via a miss punch request if something was wrong.
            </p>
          ) : null}
          {punchMessage ? <p className="mt-3 text-sm text-zinc-700">{punchMessage}</p> : null}
          {showEarlyPunchOutCue && earlyPunchSuggest ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <p className="font-medium">Early punch-out (before 5:00 PM)</p>
              <p className="mt-1 text-amber-900">
                If you left early with permission, or need HR to adjust your punch-out time, send a miss punch request
                for that date.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    goToMissPunchForm({ date: earlyPunchSuggest.date, type: "punch-out" });
                    setShowEarlyPunchOutCue(false);
                  }}
                  className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800"
                >
                  Open miss punch form
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEarlyPunchOutCue(false);
                    setEarlyPunchSuggest(null);
                  }}
                  className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}
        </section>
      );
    }

    if (activeTab === "working-days") {
      return (
        <section className="animate-fade-in rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Working Days Summary</h2>
          <p className="mt-2 text-sm text-zinc-700">
            Policy applied: second Saturday off, all other Saturdays working, Sundays off, and
            public holidays off unless HR marks a listed holiday as a working day (then it counts
            like a normal workday, including for attendance). Leave accrues from your joining date
            (each joining-date year up to 12 days, 1 day per completed month in that year); balance
            is reduced by approved and pending requests. Carry forward is unused balance from
            completed leave years before your current joining-date year.
          </p>
          {summaryError ? <p className="mt-2 text-sm text-red-700">{summaryError}</p> : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-zinc-200 bg-blue-50 p-4">
              <p className="text-sm text-zinc-700">Planned Working Days</p>
              <p className="text-2xl font-bold text-zinc-900">{workingSummary?.plannedWorkingDays ?? "-"}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-amber-50 p-4">
              <p className="text-sm text-zinc-700">Weekend Off Days</p>
              <p className="text-2xl font-bold text-zinc-900">{workingSummary?.weekendOffDays ?? "-"}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-emerald-50 p-4">
              <p className="text-sm text-zinc-700">Public Holiday Offs</p>
              <p className="text-2xl font-bold text-zinc-900">{workingSummary?.holidayOffDays ?? "-"}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-purple-50 p-4">
              <p className="text-sm text-zinc-700">Total Working Hours</p>
              <p className="text-2xl font-bold text-zinc-900">{workingSummary?.totalWorkedHours ?? "-"}</p>
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
              Present Days: <span className="font-semibold">{workingSummary?.presentDays ?? "-"}</span>
            </div>
            <div
              className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700"
              title="Planned workdays with no present punch, excluding days covered by approved leave or approved WFH."
            >
              Off Without Punch: <span className="font-semibold">{workingSummary?.offWithoutPunch ?? "-"}</span>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
              Leave available:{" "}
              <span className="font-semibold">{workingSummary?.leaveBalance?.annualLeave ?? "-"}</span>
              <span className="mx-1 text-zinc-400">·</span>
              Carry forward:{" "}
              <span className="font-semibold">{workingSummary?.leaveBalance?.carryForward ?? "-"}</span>
            </div>
          </div>

          <div className="mt-5">
            <h3 className="text-md mb-2 font-semibold text-zinc-900">
              Day-wise Attendance (Punch In / Punch Out)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-zinc-200 text-zinc-700">
                  <tr>
                    <th className="py-2">Date</th>
                    <th className="py-2">Punch In</th>
                    <th className="py-2">Punch Out</th>
                    <th className="py-2">Worked Hours</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Miss punch</th>
                  </tr>
                </thead>
                <tbody>
                  {(workingSummary?.attendance ?? []).map((row) => {
                    const needsOut = row.punchIn && !row.punchOut;
                    const earlyOut = row.punchOut && isEarlyPunchOut(row.punchOut);
                    return (
                      <tr key={row._id} className="border-b border-zinc-100">
                        <td className="py-2 text-zinc-800">{row.date}</td>
                        <td className="py-2 text-zinc-800">
                          {row.punchIn ? new Date(row.punchIn).toLocaleTimeString() : "-"}
                        </td>
                        <td className="py-2 text-zinc-800">
                          {row.punchOut ? new Date(row.punchOut).toLocaleTimeString() : "-"}
                        </td>
                        <td className="py-2 text-zinc-800">{row.workedHours ?? 0}</td>
                        <td className="py-2 text-zinc-800">{row.status}</td>
                        <td className="py-2">
                          {needsOut || earlyOut ? (
                            <button
                              type="button"
                              onClick={() =>
                                goToMissPunchForm({
                                  date: row.date,
                                  type: "punch-out",
                                })
                              }
                              className="text-xs font-medium text-orange-700 underline hover:text-orange-900"
                            >
                              {needsOut ? "Missing punch out" : "Early punch out"}
                            </button>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!workingSummary?.attendance?.length ? (
                    <tr>
                      <td className="py-3 text-zinc-500" colSpan={6}>
                        No attendance records yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-5">
            <h3 className="text-md mb-2 font-semibold text-zinc-900">Leave History</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-zinc-200 text-zinc-700">
                  <tr>
                    <th className="py-2">From</th>
                    <th className="py-2">To</th>
                    <th className="py-2">Days</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {(workingSummary?.recentLeaves ?? []).map((leave) => (
                    <tr key={leave._id} className="border-b border-zinc-100">
                      <td className="py-2 text-zinc-800">{leave.fromDate}</td>
                      <td className="py-2 text-zinc-800">{leave.toDate}</td>
                      <td className="py-2 text-zinc-800">{leave.days}</td>
                      <td className="py-2 capitalize text-zinc-800">{leave.status}</td>
                      <td className="max-w-[180px] truncate py-2 text-zinc-700" title={leave.reason}>
                        {leave.reason ?? "—"}
                      </td>
                    </tr>
                  ))}
                  {!workingSummary?.recentLeaves?.length ? (
                    <tr>
                      <td className="py-3 text-zinc-500" colSpan={5}>
                        No leave records found.
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

    if (activeTab === "calendar") {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const monthLabel = now.toLocaleString("default", { month: "long", year: "numeric" });

      const attendanceByDate = new Map(
        (workingSummary?.attendance ?? []).map((a) => [a.date, a]),
      );
      const holidayByDate = new Map(
        (workingSummary?.holidayCalendar ?? []).map((h) => [h.date, h]),
      );
      const leaveDates = new Set<string>();
      (workingSummary?.recentLeaves ?? []).forEach((leave) => {
        if (leave.status === "rejected") return;
        const start = localDateFromIso(leave.fromDate);
        const end = localDateFromIso(leave.toDate);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
        for (
          let d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
          d <= end;
          d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
        ) {
          leaveDates.add(localIsoFromDate(d));
        }
      });

      const cells: Array<{ date: string | null }> = [];
      const mondayBasedOffset = firstDay === 0 ? 6 : firstDay - 1;
      for (let i = 0; i < mondayBasedOffset; i += 1) cells.push({ date: null });
      for (let day = 1; day <= daysInMonth; day += 1) {
        cells.push({ date: localIsoFromDate(new Date(year, month, day)) });
      }
      while (cells.length % 7 !== 0) cells.push({ date: null });

      const companyByDate = companyEventsForMonthCells(year, month, staffCalendarEvents);

      return (
        <section className="animate-fade-in rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Attendance & Holiday Calendar</h2>
          <p className="mt-1 text-sm text-zinc-700">{monthLabel}</p>
          <p className="mt-1 text-xs text-zinc-500">
            Violet lines under a day are company events visible to your role (same list as on Overview).
          </p>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-rose-400" /> Holiday (off)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-sky-400" /> Public holiday — working
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-violet-500" /> Company event
            </span>
          </p>

          <div className="mt-3 grid grid-cols-7 gap-2 text-center text-xs font-semibold text-zinc-600">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="rounded bg-zinc-100 py-2">{d}</div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-2">
            {cells.map((cell, idx) => {
              if (!cell.date) {
                return (
                  <div key={`blank-${idx}`} className="min-h-[5.5rem] rounded border border-transparent" />
                );
              }
              const dayNum = Number(cell.date.split("-")[2]);
              const attendance = attendanceByDate.get(cell.date);
              const ph = holidayByDate.get(cell.date);
              const isLeave = leaveDates.has(cell.date);
              const companyList = companyByDate.get(cell.date) ?? [];

              let badge = "";
              let tone = "bg-white";
              if (ph?.treatment === "holiday") {
                badge = "Holiday";
                tone = "bg-rose-50 border-rose-200";
              } else if (ph?.treatment === "working") {
                badge = "Work (PH)";
                tone = "bg-sky-50 border-sky-200";
              } else if (isLeave) {
                badge = "Leave";
                tone = "bg-amber-50 border-amber-200";
              } else if (attendance?.status === "present") {
                badge = "Present";
                tone = "bg-emerald-50 border-emerald-200";
              } else if (attendance?.status === "miss-punch") {
                badge = "Miss";
                tone = "bg-orange-50 border-orange-200";
              }

              return (
                <div key={cell.date} className={`flex min-h-[5.5rem] flex-col rounded border p-2 text-xs ${tone}`}>
                  <div className="font-semibold text-zinc-800">{dayNum}</div>
                  {badge ? <div className="mt-1 text-zinc-700">{badge}</div> : null}
                  {companyList.length ? (
                    <div className="mt-1 space-y-0.5 border-t border-violet-100 pt-1">
                      {companyList.map((ev) => (
                        <div
                          key={ev._id}
                          className="truncate text-[9px] font-medium leading-tight text-violet-900"
                          title={ev.title}
                        >
                          {ev.title}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {attendance?.punchIn ? (
                    <div className="mt-auto pt-1 text-[10px] text-zinc-600">
                      In: {new Date(attendance.punchIn).toLocaleTimeString()}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      );
    }

    if (activeTab === "leave-request") {
      return (
        <section className="animate-fade-in rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Leave request</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Submit dates and a reason. Working days in the range count against your balance; pending
            requests reserve days until HR approves or rejects.
          </p>
          <form
            key={`${leaveFormKey}-${leaveEditId ?? "new"}`}
            onSubmit={handleLeaveSubmit}
            className="mt-4 space-y-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-zinc-600">
                From
                <input
                  name="fromDate"
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
                  type="date"
                  required
                  defaultValue={leavePrefill?.fromDate ?? ""}
                />
              </label>
              <label className="block text-xs font-medium text-zinc-600">
                To
                <input
                  name="toDate"
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
                  type="date"
                  required
                  defaultValue={leavePrefill?.toDate ?? ""}
                />
              </label>
            </div>
            <label className="block text-xs font-medium text-zinc-600">
              Reason
              <textarea
                name="reason"
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
                placeholder="Reason for leave"
                rows={4}
                required
                defaultValue={leavePrefill?.reason ?? ""}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                {leaveEditId ? "Update leave request" : "Send leave request"}
              </button>
              {leaveEditId ? (
                <button
                  type="button"
                  onClick={() => {
                    setLeaveEditId(null);
                    setLeavePrefill(null);
                    setLeaveFormKey((k) => k + 1);
                  }}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
          {leaveMessage ? <p className="mt-3 text-sm text-emerald-700">{leaveMessage}</p> : null}
          {leaveError ? <p className="mt-3 text-sm text-red-700">{leaveError}</p> : null}

          <div className="mt-8 border-t border-zinc-100 pt-6">
            <h3 className="text-md font-semibold text-zinc-900">Your recent leave requests</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-zinc-200 text-zinc-700">
                  <tr>
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
                  {(workingSummary?.recentLeaves ?? []).map((row) => {
                    const pending = row.status === "pending";
                    return (
                      <tr key={row._id} className="border-b border-zinc-100">
                        <td className="py-2 text-zinc-800">{row.fromDate}</td>
                        <td className="py-2 text-zinc-800">{row.toDate}</td>
                        <td className="py-2 text-zinc-800">{row.days}</td>
                        <td className="py-2 capitalize text-zinc-800">
                          {row.compensation === "unpaid" ? "Unpaid" : "Paid"}
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
                                onClick={() => {
                                  setLeaveEditId(row._id);
                                  setLeavePrefill({
                                    fromDate: row.fromDate,
                                    toDate: row.toDate,
                                    reason: row.reason ?? "",
                                  });
                                  setLeaveFormKey((k) => k + 1);
                                }}
                                className="text-xs font-medium text-blue-700 underline hover:text-blue-900"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteLeaveRequest(row._id)}
                                className="text-xs font-medium text-red-700 underline hover:text-red-900"
                              >
                                Delete
                              </button>
                            </div>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!workingSummary?.recentLeaves?.length ? (
                    <tr>
                      <td className="py-3 text-zinc-500" colSpan={7}>
                        No leave requests yet.
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

    if (activeTab === "wfh-request") {
      return (
        <section className="animate-fade-in rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Work from home request</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Request WFH for a date range. Only working days in the range are counted for HR review.
          </p>
          <form
            key={`${wfhFormKey}-${wfhEditId ?? "new"}`}
            onSubmit={handleWfhSubmit}
            className="mt-4 space-y-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-zinc-600">
                From
                <input
                  name="fromDate"
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
                  type="date"
                  required
                  defaultValue={wfhPrefill?.fromDate ?? ""}
                />
              </label>
              <label className="block text-xs font-medium text-zinc-600">
                To
                <input
                  name="toDate"
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
                  type="date"
                  required
                  defaultValue={wfhPrefill?.toDate ?? ""}
                />
              </label>
            </div>
            <label className="block text-xs font-medium text-zinc-600">
              Reason
              <textarea
                name="reason"
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
                placeholder="Reason for working from home"
                rows={4}
                required
                defaultValue={wfhPrefill?.reason ?? ""}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
              >
                {wfhEditId ? "Update WFH request" : "Send WFH request"}
              </button>
              {wfhEditId ? (
                <button
                  type="button"
                  onClick={() => {
                    setWfhEditId(null);
                    setWfhPrefill(null);
                    setWfhFormKey((k) => k + 1);
                  }}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
          {wfhMessage ? <p className="mt-3 text-sm text-emerald-700">{wfhMessage}</p> : null}
          {wfhError ? <p className="mt-3 text-sm text-red-700">{wfhError}</p> : null}

          <div className="mt-8 border-t border-zinc-100 pt-6">
            <h3 className="text-md font-semibold text-zinc-900">Your recent WFH requests</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-zinc-200 text-zinc-700">
                  <tr>
                    <th className="py-2">From</th>
                    <th className="py-2">To</th>
                    <th className="py-2">Days</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Reason</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(workingSummary?.recentWfh ?? []).map((row) => {
                    const pending = row.status === "pending";
                    return (
                      <tr key={row._id} className="border-b border-zinc-100">
                        <td className="py-2 text-zinc-800">{row.fromDate}</td>
                        <td className="py-2 text-zinc-800">{row.toDate}</td>
                        <td className="py-2 text-zinc-800">{row.days}</td>
                        <td className="py-2 capitalize text-zinc-800">{row.status}</td>
                        <td className="max-w-[220px] truncate py-2 text-zinc-700" title={row.reason}>
                          {row.reason ?? "—"}
                        </td>
                        <td className="py-2">
                          {pending ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setWfhEditId(row._id);
                                  setWfhPrefill({
                                    fromDate: row.fromDate,
                                    toDate: row.toDate,
                                    reason: row.reason ?? "",
                                  });
                                  setWfhFormKey((k) => k + 1);
                                }}
                                className="text-xs font-medium text-blue-700 underline hover:text-blue-900"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteWfhRequest(row._id)}
                                className="text-xs font-medium text-red-700 underline hover:text-red-900"
                              >
                                Delete
                              </button>
                            </div>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!workingSummary?.recentWfh?.length ? (
                    <tr>
                      <td className="py-3 text-zinc-500" colSpan={6}>
                        No WFH requests yet.
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

    if (activeTab === "miss-punch") {
      return (
        <section className="animate-fade-in rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Miss punch request</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Use this if you forgot to punch in or out, left before the end of the standard day (before 5:00 PM) and
            need HR to note an early punch-out, or need a time correction. Requests appear in the admin Miss Punch
            list.
          </p>
          <form
            key={`${missPunchFormKey}-${missPunchEditId ?? "new"}-${missPunchPrefill?.date ?? ""}-${missPunchPrefill?.type ?? ""}`}
            onSubmit={handleMissPunchSubmit}
            className="mt-4 space-y-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-zinc-600">
                Date
                <input
                  name="date"
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
                  type="date"
                  required
                  defaultValue={missPunchPrefill?.date ?? ""}
                />
              </label>
              <label className="block text-xs font-medium text-zinc-600">
                Missing / correction
                <select
                  name="type"
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
                  required
                  defaultValue={missPunchPrefill?.type ?? "punch-in"}
                >
                  <option value="punch-in">Punch in</option>
                  <option value="punch-out">Punch out</option>
                </select>
              </label>
            </div>
            <label className="block text-xs font-medium text-zinc-600">
              Reason
              <textarea
                name="reason"
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
                placeholder="What happened?"
                rows={4}
                required
                defaultValue={missPunchPrefill?.reason ?? ""}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
              >
                {missPunchEditId ? "Update miss punch request" : "Send miss punch request"}
              </button>
              {missPunchEditId ? (
                <button
                  type="button"
                  onClick={() => {
                    setMissPunchEditId(null);
                    setMissPunchPrefill(null);
                    setMissPunchFormKey((k) => k + 1);
                  }}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
          {missPunchMessage ? <p className="mt-3 text-sm text-emerald-700">{missPunchMessage}</p> : null}
          {missPunchError ? <p className="mt-3 text-sm text-red-700">{missPunchError}</p> : null}

          <div className="mt-8 border-t border-zinc-100 pt-6">
            <h3 className="text-md font-semibold text-zinc-900">Your recent miss punch requests</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-zinc-200 text-zinc-700">
                  <tr>
                    <th className="py-2">Submitted</th>
                    <th className="py-2">Date</th>
                    <th className="py-2">Type</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Reason</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(workingSummary?.recentMissPunches ?? []).map((row) => {
                    const pending = row.status === "pending";
                    return (
                      <tr key={row._id} className="border-b border-zinc-100">
                        <td className="py-2 text-zinc-700">{formatIsoUtc(row.createdAt)}</td>
                        <td className="py-2 text-zinc-800">{row.date}</td>
                        <td className="py-2 text-zinc-800">{row.type === "punch-out" ? "Punch out" : "Punch in"}</td>
                        <td className="py-2 capitalize text-zinc-800">{row.status}</td>
                        <td className="max-w-[240px] truncate py-2 text-zinc-700" title={row.reason}>
                          {row.reason ?? "—"}
                        </td>
                        <td className="py-2">
                          {pending ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setMissPunchEditId(row._id);
                                  setMissPunchPrefill({
                                    date: row.date,
                                    type: (row.type as "punch-in" | "punch-out"),
                                    reason: row.reason ?? "",
                                  });
                                  setMissPunchFormKey((k) => k + 1);
                                }}
                                className="text-xs font-medium text-blue-700 underline hover:text-blue-900"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteMissPunchRequest(row._id)}
                                className="text-xs font-medium text-red-700 underline hover:text-red-900"
                              >
                                Delete
                              </button>
                            </div>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!workingSummary?.recentMissPunches?.length ? (
                    <tr>
                      <td className="py-3 text-zinc-500" colSpan={6}>
                        No miss punch requests yet.
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

    if (activeTab === "team-approvals" && user.role === "manager") {
      const byId = new Map((teamRequests?.employees ?? []).map((e) => [e.id, e]));
      const resolveName = (userId: string) => {
        const e = byId.get(userId);
        if (!e) return userId;
        return e.profile?.fullName || e.username;
      };
      const decision = async (
        kind: "leave" | "wfh" | "miss-punch" | "resignation",
        requestId: string,
        action: "approve" | "reject",
      ) => {
        setTeamRequestError(null);
        setTeamRequestBusy(requestId);
        const res = await fetch("/api/employee/team-request-decision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, requestId, decision: action }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setTeamRequestError(data.error ?? "Decision failed");
          setTeamRequestBusy(null);
          return;
        }
        setTeamRequestBusy(null);
        const refresh = await fetch("/api/employee/team-requests");
        const next = await refresh.json().catch(() => ({}));
        if (refresh.ok) setTeamRequests(next);
      };
      const leaves = teamRequests?.leaveRequests ?? [];
      const wfh = teamRequests?.wfhRequests ?? [];
      const miss = teamRequests?.missPunchRequests ?? [];
      const resignations = teamRequests?.offboardingRequests ?? [];
      const teamBalances = teamRequests?.leaveBalances ?? [];
      const teamStaff = (teamRequests?.employees ?? []) as EmployeeRow[];
      return (
        <section className="animate-fade-in rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Team Approvals</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Approve direct-report requests. After your approval, HR/Admin can finalize. HR/Admin can also directly finalize.
          </p>
          {teamRequestError ? <p className="mt-3 text-sm text-red-700">{teamRequestError}</p> : null}
          <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <h3 className="mb-2 text-sm font-semibold text-zinc-900">Team leave balance tracking</h3>
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="border-b border-zinc-200 text-zinc-700">
                <tr>
                  <th className="py-2">Employee</th>
                  <th className="py-2">Available Leave</th>
                  <th className="py-2">Carry Forward</th>
                </tr>
              </thead>
              <tbody>
                {teamBalances.map((b) => (
                  <tr key={b.userId} className="border-b border-zinc-100">
                    <td className="py-2 text-zinc-800">{resolveName(b.userId)}</td>
                    <td className="py-2 text-zinc-800">{b.annualLeave}</td>
                    <td className="py-2 text-zinc-700">{b.carryForward}</td>
                  </tr>
                ))}
                {!teamBalances.length ? (
                  <tr>
                    <td className="py-2 text-zinc-500" colSpan={3}>No leave balances available.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="mt-5 overflow-x-auto">
            <h3 className="mb-2 text-sm font-semibold text-zinc-900">Leave requests</h3>
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-zinc-200 text-zinc-700">
                <tr>
                  <th className="py-2">Employee</th>
                  <th className="py-2">From</th>
                  <th className="py-2">To</th>
                  <th className="py-2">Days</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {leaves.map((r) => (
                  <tr key={r._id} className="border-b border-zinc-100">
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() =>
                          setTeamProfileEmployee(teamStaff.find((e) => e.id === r.userId) ?? null)
                        }
                        className="text-left text-sky-700 underline hover:text-sky-900"
                      >
                        {resolveName(r.userId)}
                      </button>
                    </td>
                    <td className="py-2">{r.fromDate}</td>
                    <td className="py-2">{r.toDate}</td>
                    <td className="py-2">{r.days}</td>
                    <td className="py-2">{r.managerApprovalAt ? "Pending HR" : "Pending Manager"}</td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={teamRequestBusy === r._id || !!r.managerApprovalAt}
                          onClick={() => void decision("leave", r._id, "approve")}
                          className="rounded bg-emerald-600 px-3 py-1 text-xs text-white disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={teamRequestBusy === r._id || !!r.managerApprovalAt}
                          onClick={() => void decision("leave", r._id, "reject")}
                          className="rounded border border-red-300 px-3 py-1 text-xs text-red-700 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!leaves.length ? (
                  <tr>
                    <td className="py-3 text-zinc-500" colSpan={6}>No pending leave requests from your team.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="mt-6 overflow-x-auto">
            <h3 className="mb-2 text-sm font-semibold text-zinc-900">WFH requests</h3>
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-zinc-200 text-zinc-700">
                <tr>
                  <th className="py-2">Employee</th>
                  <th className="py-2">From</th>
                  <th className="py-2">To</th>
                  <th className="py-2">Days</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {wfh.map((r) => (
                  <tr key={r._id} className="border-b border-zinc-100">
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() =>
                          setTeamProfileEmployee(teamStaff.find((e) => e.id === r.userId) ?? null)
                        }
                        className="text-left text-sky-700 underline hover:text-sky-900"
                      >
                        {resolveName(r.userId)}
                      </button>
                    </td>
                    <td className="py-2">{r.fromDate}</td>
                    <td className="py-2">{r.toDate}</td>
                    <td className="py-2">{r.days}</td>
                    <td className="py-2">{r.managerApprovalAt ? "Pending HR" : "Pending Manager"}</td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={teamRequestBusy === r._id || !!r.managerApprovalAt}
                          onClick={() => void decision("wfh", r._id, "approve")}
                          className="rounded bg-emerald-600 px-3 py-1 text-xs text-white disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={teamRequestBusy === r._id || !!r.managerApprovalAt}
                          onClick={() => void decision("wfh", r._id, "reject")}
                          className="rounded border border-red-300 px-3 py-1 text-xs text-red-700 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!wfh.length ? (
                  <tr>
                    <td className="py-3 text-zinc-500" colSpan={6}>No pending WFH requests from your team.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="mt-6 overflow-x-auto">
            <h3 className="mb-2 text-sm font-semibold text-zinc-900">Miss punch requests</h3>
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-zinc-200 text-zinc-700">
                <tr>
                  <th className="py-2">Employee</th>
                  <th className="py-2">Date</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {miss.map((r) => (
                  <tr key={r._id} className="border-b border-zinc-100">
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() =>
                          setTeamProfileEmployee(teamStaff.find((e) => e.id === r.userId) ?? null)
                        }
                        className="text-left text-sky-700 underline hover:text-sky-900"
                      >
                        {resolveName(r.userId)}
                      </button>
                    </td>
                    <td className="py-2">{r.date}</td>
                    <td className="py-2">{r.type}</td>
                    <td className="py-2">{r.managerApprovalAt ? "Pending HR" : "Pending Manager"}</td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={teamRequestBusy === r._id || !!r.managerApprovalAt}
                          onClick={() => void decision("miss-punch", r._id, "approve")}
                          className="rounded bg-emerald-600 px-3 py-1 text-xs text-white disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={teamRequestBusy === r._id || !!r.managerApprovalAt}
                          onClick={() => void decision("miss-punch", r._id, "reject")}
                          className="rounded border border-red-300 px-3 py-1 text-xs text-red-700 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!miss.length ? (
                  <tr>
                    <td className="py-3 text-zinc-500" colSpan={5}>No pending miss punch requests from your team.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="mt-6 overflow-x-auto">
            <h3 className="mb-2 text-sm font-semibold text-zinc-900">Resignation requests</h3>
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-zinc-200 text-zinc-700">
                <tr>
                  <th className="py-2">Employee</th>
                  <th className="py-2">Last working day</th>
                  <th className="py-2">Reason</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {resignations.map((r) => (
                  <tr key={r._id} className="border-b border-zinc-100">
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() =>
                          setTeamProfileEmployee(teamStaff.find((e) => e.id === r.userId) ?? null)
                        }
                        className="text-left text-sky-700 underline hover:text-sky-900"
                      >
                        {resolveName(r.userId)}
                      </button>
                    </td>
                    <td className="py-2">{r.lastWorkingDay}</td>
                    <td className="max-w-[280px] truncate py-2" title={r.reason}>
                      {r.reason}
                    </td>
                    <td className="py-2">{r.managerApprovalAt ? "Pending HR" : "Pending Manager"}</td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={teamRequestBusy === r._id || !!r.managerApprovalAt}
                          onClick={() => void decision("resignation", r._id, "approve")}
                          className="rounded bg-emerald-600 px-3 py-1 text-xs text-white disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={teamRequestBusy === r._id || !!r.managerApprovalAt}
                          onClick={() => void decision("resignation", r._id, "reject")}
                          className="rounded border border-red-300 px-3 py-1 text-xs text-red-700 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!resignations.length ? (
                  <tr>
                    <td className="py-3 text-zinc-500" colSpan={5}>
                      No pending resignation requests from your team.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <EmployeeProfileModal
            employee={teamProfileEmployee}
            allStaff={teamStaff}
            onClose={() => setTeamProfileEmployee(null)}
          />
        </section>
      );
    }

    if (activeTab === "resignation") {
      const req = resignationData?.request;
      const assets = resignationData?.assets ?? [];
      const pending = req?.status === "pending";
      return (
        <section className="animate-fade-in rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Resignation</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Submit your resignation. If you have company assets assigned, you must return them or pay the asset value
            before HR can approve your exit.
          </p>

          {req ? (
            <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm">
              <p className="text-zinc-800">
                Current request: <span className="font-semibold capitalize">{req.type}</span> · Status:{" "}
                <span className="font-semibold capitalize">{req.status}</span>
              </p>
              <p className="mt-1 text-zinc-700">Last working day: {req.lastWorkingDay}</p>
              {req.decisionReason ? <p className="mt-1 text-zinc-700">Note: {req.decisionReason}</p> : null}
              {pending ? (
                <p className="mt-2 text-amber-700">
                  HR will review your request after asset clearance is completed.
                </p>
              ) : null}
            </div>
          ) : null}

          {!req || !pending ? (
            <form
              key={resignationFormKey}
              onSubmit={handleResignationSubmit}
              className="mt-4 space-y-3"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-zinc-600">
                  Last working day
                  <input
                    name="lastWorkingDay"
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
                    type="date"
                    required
                  />
                </label>
              </div>
              <label className="block text-xs font-medium text-zinc-600">
                Reason
                <textarea
                  name="reason"
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
                  rows={4}
                  required
                />
              </label>
              <button
                type="submit"
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
              >
                Submit resignation
              </button>
            </form>
          ) : null}

          {resignationMessage ? <p className="mt-3 text-sm text-emerald-700">{resignationMessage}</p> : null}
          {resignationError ? <p className="mt-3 text-sm text-red-700">{resignationError}</p> : null}

          <div className="mt-6 border-t border-zinc-100 pt-5">
            <h3 className="text-sm font-semibold text-zinc-900">Your assigned assets</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-zinc-200 text-zinc-700">
                  <tr>
                    <th className="py-2">Asset</th>
                    <th className="py-2">Category</th>
                    <th className="py-2">Qty</th>
                    <th className="py-2">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a) => (
                    <tr key={a.assetId} className="border-b border-zinc-100">
                      <td className="py-2 text-zinc-800">{a.name}</td>
                      <td className="py-2 text-zinc-700">{a.category}</td>
                      <td className="py-2 text-zinc-700">{a.qty}</td>
                      <td className="py-2 text-zinc-700">{a.value}</td>
                    </tr>
                  ))}
                  {!assets.length ? (
                    <tr>
                      <td className="py-4 text-center text-zinc-500" colSpan={4}>
                        No assets assigned.
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

    if (activeTab === "profile-edit") {
      return (
        <section className="animate-fade-in rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Documents & Profile Photo</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Upload your profile photo and documents (SSLC, +2, Aadhaar, certificates, etc.). These are stored for HR
            reference.
          </p>

          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <h3 className="text-sm font-semibold text-zinc-900">Profile photo</h3>
              <div className="mt-3 flex items-center gap-4">
                <div className="h-16 w-16 overflow-hidden rounded-full border border-zinc-200 bg-white">
                  {localPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={localPhotoUrl}
                      alt="Profile"
                      className="h-full w-full object-cover"
                      onError={() => {
                        setLocalPhotoUrl(null);
                        setUploadError("Photo uploaded, but it could not be loaded. Please refresh and try again.");
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-sm font-semibold text-zinc-600">
                      {(profile?.fullName ?? user.username).slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
                <form
                  key={photoUploadKey}
                  onSubmit={handleProfilePhotoUpload}
                  className="flex flex-1 flex-col gap-2"
                >
                  <input name="file" type="file" accept="image/*" required />
                  <button
                    type="submit"
                    disabled={uploading}
                    className="w-fit rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                  >
                    {uploading ? "Uploading…" : "Upload photo"}
                  </button>
                  {localPhotoUrl ? (
                    <a
                      href={localPhotoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-blue-700 underline hover:text-blue-900"
                    >
                      Open uploaded photo
                    </a>
                  ) : null}
                </form>
              </div>
              <p className="mt-2 text-xs text-zinc-600">Max size: 5MB. Supported: JPG, PNG, WebP.</p>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <h3 className="text-sm font-semibold text-zinc-900">Upload document</h3>
              <form
                key={docUploadKey}
                onSubmit={handleDocumentUpload}
                className="mt-3 grid gap-3 sm:grid-cols-2"
              >
                <label className="block text-xs font-medium text-zinc-700">
                  Type
                  <select
                    name="type"
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                    defaultValue={"aadhaar" satisfies EmployeeDocumentType}
                    required
                  >
                    <option value="aadhaar">Aadhaar card</option>
                    <option value="pan">PAN card</option>
                    <option value="sslc">SSLC</option>
                    <option value="plus2">+2</option>
                    <option value="degree">Degree</option>
                    <option value="experience">Experience letter</option>
                    <option value="certificate">Certificate</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="block text-xs font-medium text-zinc-700">
                  Label
                  <input
                    name="label"
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                    placeholder="e.g. SSLC Marksheet, AWS Certificate"
                    required
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-700 sm:col-span-2">
                  File
                  <input name="file" type="file" className="mt-1 w-full" required />
                </label>
                <button
                  type="submit"
                  disabled={uploading}
                  className="w-fit rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 sm:col-span-2"
                >
                  {uploading ? "Uploading…" : "Upload document"}
                </button>
              </form>
              <p className="mt-2 text-xs text-zinc-600">Max size: 10MB. Any file type is allowed.</p>
            </div>
          </div>

          {uploadMessage ? <p className="mt-4 text-sm text-emerald-700">{uploadMessage}</p> : null}
          {uploadError ? <p className="mt-4 text-sm text-red-700">{uploadError}</p> : null}

          <div className="mt-6 border-t border-zinc-100 pt-5">
            <h3 className="text-sm font-semibold text-zinc-900">Your uploaded documents</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-zinc-200 text-zinc-700">
                  <tr>
                    <th className="py-2">Uploaded</th>
                    <th className="py-2">Type</th>
                    <th className="py-2">Label</th>
                    <th className="py-2">File</th>
                    <th className="py-2">Size</th>
                    <th className="py-2">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {localDocs.map((d) => (
                    <tr key={d.id} className="border-b border-zinc-100">
                      <td className="py-2 text-zinc-700">{formatIsoUtc(d.uploadedAt)}</td>
                      <td className="py-2 text-zinc-800">{d.type}</td>
                      <td className="py-2 text-zinc-800">{d.label}</td>
                      <td className="max-w-[260px] truncate py-2 text-zinc-700" title={d.fileName}>
                        {d.fileName}
                      </td>
                      <td className="py-2 text-zinc-700">{Math.ceil(d.size / 1024)} KB</td>
                      <td className="py-2">
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-blue-700 underline hover:text-blue-900"
                        >
                          View / download
                        </a>
                      </td>
                    </tr>
                  ))}
                  {!localDocs.length ? (
                    <tr>
                      <td className="py-4 text-center text-zinc-500" colSpan={6}>
                        No documents uploaded yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          {/* keep old stub until a full profile editor is implemented */}
          <form onSubmit={handleProfileUpdate} className="mt-6 hidden">
            <button type="submit">Save</button>
          </form>
          {profileMessage ? <p className="mt-3 text-sm text-emerald-700">{profileMessage}</p> : null}
        </section>
      );
    }

    if (activeTab === "request-assets") {
      const byId = new Map(assetCatalog.map((a) => [a._id, a]));
      return (
        <section className="animate-fade-in rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Request Assets</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Choose an asset from the company catalog. HR/Admin will approve or reject based on availability.
          </p>

          <form
            key={assetRequestKey}
            onSubmit={handleAssetRequestSubmit}
            className="mt-4 grid gap-3 sm:grid-cols-2"
          >
            <label className="block text-xs font-medium text-zinc-700">
              Asset
              <select
                name="assetId"
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                required
              >
                <option value="" disabled selected>
                  Select asset
                </option>
                {assetCatalog.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name} ({a.category}) — available {a.availableQty}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-zinc-700">
              Quantity
              <input
                name="qty"
                type="number"
                min={1}
                defaultValue={1}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block text-xs font-medium text-zinc-700 sm:col-span-2">
              Reason
              <textarea
                name="reason"
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                rows={3}
                required
              />
            </label>
            <button
              type="submit"
              className="w-fit rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 sm:col-span-2"
            >
              Submit asset request
            </button>
          </form>

          {assetRequestMessage ? <p className="mt-3 text-sm text-emerald-700">{assetRequestMessage}</p> : null}
          {assetRequestError ? <p className="mt-3 text-sm text-red-700">{assetRequestError}</p> : null}

          <div className="mt-6 border-t border-zinc-100 pt-5">
            <h3 className="text-sm font-semibold text-zinc-900">Your recent asset requests</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-zinc-200 text-zinc-700">
                  <tr>
                    <th className="py-2">Submitted</th>
                    <th className="py-2">Asset</th>
                    <th className="py-2">Qty</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {assetRequests.map((r) => {
                    const a = byId.get(r.assetId);
                    return (
                      <tr key={r._id} className="border-b border-zinc-100">
                        <td className="py-2 text-zinc-700">{formatIsoUtc(r.createdAt)}</td>
                        <td className="py-2 text-zinc-800">
                          {a ? (
                            <div className="flex items-center gap-2">
                              {a.imageUrl ? (
                                <img
                                  src={a.imageUrl}
                                  alt={a.name}
                                  className="h-8 w-8 rounded border border-zinc-200 object-cover"
                                />
                              ) : null}
                              <span>{`${a.name} (${a.category})`}</span>
                            </div>
                          ) : (
                            r.assetId
                          )}
                        </td>
                        <td className="py-2 text-zinc-700">{r.qty}</td>
                        <td className="py-2 capitalize text-zinc-700">{r.status}</td>
                        <td className="max-w-[320px] truncate py-2 text-zinc-700" title={r.reason}>
                          {r.reason}
                        </td>
                      </tr>
                    );
                  })}
                  {!assetRequests.length ? (
                    <tr>
                      <td className="py-4 text-center text-zinc-500" colSpan={5}>
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

    if (activeTab === "payslip") {
      return <EmployeePayslipPanel />;
    }

    return (
      <section className="animate-fade-in rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <EmployeePasswordForm />
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
            <p className="text-sm font-semibold text-zinc-900">{profile?.fullName ?? user.username}</p>
            <p className="mt-0.5 text-xs capitalize text-zinc-500">Role: {user.role}</p>
          </div>
          <div className="px-3 py-2">
            <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              Menu
            </p>
          </div>
          <nav className="space-y-1 px-2 pb-4">
            {employeeNavItems.map((item) => {
              if (item.key === "team-approvals" && user.role !== "manager") return null;
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveTab(item.key)}
                  className={`flex w-full items-center gap-2.5 rounded px-3 py-2 text-left text-[13px] transition ${
                    isActive
                      ? "bg-teal-50 text-teal-800"
                      : "text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  <span className="flex w-7 shrink-0 justify-center text-base leading-none" aria-hidden>
                    {employeeNavIcons[item.key]}
                  </span>
                  <span className="min-w-0 leading-snug">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-3">
              <h1 className="text-[22px] font-semibold tracking-tight text-zinc-900">
                Employee Dashboard
              </h1>
              <p className="hidden text-xs text-zinc-600 md:block">
                /{" "}
                {employeeNavItems.find((i) => i.key === activeTab)?.label ?? activeTab}
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
            <p className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
              You are using a temporary password. Please change it now.
            </p>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#f2f4f8] p-4">
            {renderContent()}
          </div>
        </section>
      </div>
    </main>
  );
}

export function EmployeeDashboard(props: {
  user: SafeUser;
  profile: EmployeeProfile | null;
  managerDisplay: string | null;
}) {
  return (
    <Suspense
      fallback={
        <main className="dashboard-shell mx-auto flex min-h-screen w-full max-w-[1600px] items-center justify-center bg-[#f2f4f8] text-zinc-900">
          <p className="text-sm text-zinc-600">Loading dashboard…</p>
        </main>
      }
    >
      <EmployeeDashboardShell {...props} />
    </Suspense>
  );
}
