"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usesEmployeePortal } from "@/lib/roles";
import { EmployeeProfile, SafeUser } from "@/lib/types";

export type EmployeeRow = SafeUser & { profile?: EmployeeProfile };

function initialsFrom(name: string | undefined, username: string): string {
  const n = (name ?? "").trim();
  if (n.length >= 2) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }
  const u = username.trim();
  if (u.length >= 2) return u.slice(0, 2).toUpperCase();
  return "??";
}

export function StaffAvatar({
  employee,
  size = "lg",
}: {
  employee: Pick<EmployeeRow, "username" | "profile">;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const name = employee.profile?.fullName;
  const initials = initialsFrom(name, employee.username);
  const url = employee.profile?.profilePhotoUrl?.trim();
  const sizeClass =
    size === "xl"
      ? "h-24 w-24 text-2xl"
      : size === "lg"
        ? "h-16 w-16 text-lg"
        : size === "md"
          ? "h-12 w-12 text-sm"
          : "h-9 w-9 text-xs";

  if (url) {
    return (
      <img
        src={url}
        alt=""
        className={`${sizeClass} shrink-0 rounded-full object-cover ring-2 ring-white shadow-md`}
      />
    );
  }
  return (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 font-semibold text-white shadow-md ring-2 ring-white`}
      aria-hidden
    >
      {initials}
    </div>
  );
}

function findStaff(all: EmployeeRow[], id: string | undefined): EmployeeRow | undefined {
  if (!id) return undefined;
  return all.find((e) => e.id === id);
}

/** Root → … → direct manager (for top-down reporting line). */
function reportingChainAbove(selected: EmployeeRow, all: EmployeeRow[]): EmployeeRow[] {
  const seen = new Set<string>();
  const upward: EmployeeRow[] = [];
  let id = selected.profile?.managerId;
  while (id) {
    if (seen.has(id)) break;
    seen.add(id);
    const m = findStaff(all, id);
    if (!m) break;
    upward.push(m);
    id = m.profile?.managerId;
  }
  upward.reverse();
  return upward;
}

function directReports(managerId: string, all: EmployeeRow[]): EmployeeRow[] {
  return all.filter((e) => e.profile?.managerId === managerId);
}

/** Same rules as onboarding: employees → staff managers; managers → HR/Admin only. */
function reportingManagerChoices(employee: EmployeeRow, all: EmployeeRow[]): EmployeeRow[] {
  if (!usesEmployeePortal(employee.role)) return [];
  if (employee.role === "manager") {
    return all.filter((e) => e.id !== employee.id && (e.role === "hr" || e.role === "admin"));
  }
  return all.filter(
    (e) =>
      e.id !== employee.id &&
      (e.role === "employee" || e.role === "manager" || e.role === "hr" || e.role === "admin"),
  );
}

export function EmployeeProfileModal({
  employee,
  allStaff,
  onClose,
  projects = [],
  onOrgPatch,
}: {
  employee: EmployeeRow | null;
  allStaff: EmployeeRow[];
  onClose: () => void;
  projects?: Array<{ _id: string; name: string }>;
  onOrgPatch?: (
    userId: string,
    patch: { managerId?: string; projectId?: string },
  ) => Promise<string | null>;
}) {
  const [draftManagerId, setDraftManagerId] = useState("");
  const [draftProjectId, setDraftProjectId] = useState("");
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  useEffect(() => {
    if (!employee) {
      setDraftManagerId("");
      setDraftProjectId("");
      setOrgError(null);
      return;
    }
    setDraftManagerId(employee.profile?.managerId ?? "");
    setDraftProjectId(employee.profile?.projectId ?? "");
    setOrgError(null);
  }, [employee]);

  useEffect(() => {
    if (!employee) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [employee, onClose]);

  useEffect(() => {
    if (!employee) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [employee]);

  if (!employee) return null;

  const p = employee.profile;
  const chain = reportingChainAbove(employee, allStaff);
  const directMgr = findStaff(allStaff, p?.managerId);
  const reports = directReports(employee.id, allStaff);

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-zinc-900/55 backdrop-blur-[2px]"
        aria-label="Close profile"
        onClick={onClose}
      />
      <div className="relative z-10 flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl max-h-[min(90dvh,calc(100vh-2rem))]">
        <div className="relative flex shrink-0 items-start gap-3 border-b border-zinc-100 bg-gradient-to-r from-teal-50/80 to-white px-5 py-4 pr-12">
          <div className="flex min-w-0 flex-1 gap-4">
            <StaffAvatar employee={employee} size="xl" />
            <div className="min-w-0 pt-1">
              <h2 id="profile-modal-title" className="text-xl font-semibold tracking-tight text-zinc-900">
                {p?.fullName ?? employee.username}
              </h2>
              <p className="mt-0.5 truncate text-sm text-zinc-600">{p?.designation ?? "—"}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium capitalize text-teal-900">
                  {employee.role}
                </span>
                {p?.department ? (
                  <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
                    {p.department}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-2 top-2 rounded-full p-2.5 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 sm:right-3 sm:top-3"
            aria-label="Close"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {onOrgPatch && employee && usesEmployeePortal(employee.role) ? (
            <section className="mb-6 rounded-xl border border-teal-200 bg-teal-50/40 p-4">
              <h3 className="text-sm font-semibold text-zinc-900">Reporting &amp; project (HR / Admin)</h3>
              <p className="mt-1 text-xs text-zinc-600">
                Update who this person reports to and which project they belong to. Managers must report to HR or Admin.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-zinc-700">
                  Reports to
                  <select
                    value={draftManagerId}
                    onChange={(e) => setDraftManagerId(e.target.value)}
                    disabled={orgSaving}
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900"
                  >
                    {employee.role === "manager" ? null : <option value="">No manager</option>}
                    {reportingManagerChoices(employee, allStaff).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.profile?.fullName?.trim()
                          ? `${m.profile.fullName} (${m.username}) [${m.role}]`
                          : `${m.username} [${m.role}]`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-zinc-700">
                  Project
                  <select
                    value={draftProjectId}
                    onChange={(e) => setDraftProjectId(e.target.value)}
                    disabled={orgSaving}
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900"
                  >
                    <option value="">No project</option>
                    {projects.map((pr) => (
                      <option key={pr._id} value={pr._id}>
                        {pr.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {orgError ? <p className="mt-2 text-sm text-red-700">{orgError}</p> : null}
              <button
                type="button"
                disabled={orgSaving}
                onClick={async () => {
                  if (!onOrgPatch || !employee) return;
                  setOrgSaving(true);
                  setOrgError(null);
                  const err = await onOrgPatch(employee.id, {
                    managerId: draftManagerId,
                    projectId: draftProjectId,
                  });
                  setOrgSaving(false);
                  if (err) setOrgError(err);
                }}
                className="mt-3 rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {orgSaving ? "Saving…" : "Save reporting & project"}
              </button>
            </section>
          ) : null}

          {/* Reporting hierarchy */}
          <section className="mb-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Reporting hierarchy</h3>
            <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4">
              <ol className="space-y-0">
                {chain.map((node, idx) => (
                  <li key={node.id} className="flex gap-3 border-l-2 border-teal-200 py-3 pl-4 first:pt-0">
                    <StaffAvatar employee={node} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">
                        Level {idx + 1}
                      </p>
                      <p className="font-semibold text-zinc-900">{node.profile?.fullName ?? node.username}</p>
                      <p className="text-xs capitalize text-zinc-600">{node.role}</p>
                      {node.profile?.designation ? (
                        <p className="text-xs text-zinc-500">{node.profile.designation}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
                {p?.managerId && chain.length === 0 ? (
                  <li className="flex gap-3 border-l-2 border-amber-300 py-3 pl-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-amber-300 bg-amber-50 text-sm font-semibold text-amber-800">
                      ?
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase text-amber-800">Unknown manager</p>
                      <p className="text-sm text-zinc-600">
                        Stored manager id is not in the staff directory.
                      </p>
                    </div>
                  </li>
                ) : null}
                {chain.length === 0 && !p?.managerId ? (
                  <li className="border-l-2 border-zinc-200 py-2 pl-4 text-sm text-zinc-600">
                    No managers above this person in the directory.
                  </li>
                ) : null}
                <li className="flex gap-3 border-l-2 border-zinc-900 py-3 pl-4">
                  <div className="ring-offset-2 shrink-0 rounded-full ring-2 ring-zinc-900 ring-offset-white">
                    <StaffAvatar employee={employee} size="md" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase text-zinc-500">This person</p>
                    <p className="font-semibold text-zinc-900">{p?.fullName ?? employee.username}</p>
                    <p className="text-xs capitalize text-zinc-600">{employee.role}</p>
                  </div>
                </li>
              </ol>
            </div>
          </section>

          {/* Direct manager detail */}
          <section className="mb-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Direct manager</h3>
            <div className="mt-2 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              {directMgr ? (
                <div className="flex gap-4">
                  <StaffAvatar employee={directMgr} size="lg" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-semibold text-zinc-900">{directMgr.profile?.fullName ?? directMgr.username}</p>
                    <p className="text-zinc-600">{directMgr.profile?.email ?? "—"}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      <span className="capitalize">{directMgr.role}</span>
                      {directMgr.profile?.designation ? ` · ${directMgr.profile.designation}` : ""}
                    </p>
                    <p className="text-xs text-zinc-500">{directMgr.profile?.department ?? ""}</p>
                  </div>
                </div>
              ) : p?.managerId ? (
                <p className="text-sm text-amber-800">
                  Manager record not found in the current staff list (id: <code className="rounded bg-zinc-100 px-1">{p.managerId}</code>).
                </p>
              ) : (
                <p className="text-sm text-zinc-600">No direct manager assigned.</p>
              )}
            </div>
          </section>

          {/* Direct reports */}
          <section className="mb-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Direct reports</h3>
            {reports.length ? (
              <ul className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
                {reports.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                    <StaffAvatar employee={r} size="sm" />
                    <div className="min-w-0 text-sm">
                      <p className="font-medium text-zinc-900">{r.profile?.fullName ?? r.username}</p>
                      <p className="truncate text-xs text-zinc-500 capitalize">{r.role}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-zinc-600">No direct reports in this directory.</p>
            )}
          </section>

          {/* Details grid */}
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Account &amp; contact</h3>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-100 bg-zinc-50/50 px-3 py-2">
                <dt className="text-xs font-medium text-zinc-500">Username</dt>
                <dd className="mt-0.5 text-sm text-zinc-900">{employee.username}</dd>
              </div>
              <div className="rounded-lg border border-zinc-100 bg-zinc-50/50 px-3 py-2">
                <dt className="text-xs font-medium text-zinc-500">Email</dt>
                <dd className="mt-0.5 break-all text-sm text-zinc-900">{p?.email ?? "—"}</dd>
              </div>
              <div className="rounded-lg border border-zinc-100 bg-zinc-50/50 px-3 py-2">
                <dt className="text-xs font-medium text-zinc-500">Phone</dt>
                <dd className="mt-0.5 text-sm text-zinc-900">{p?.phone ?? "—"}</dd>
              </div>
              <div className="rounded-lg border border-zinc-100 bg-zinc-50/50 px-3 py-2">
                <dt className="text-xs font-medium text-zinc-500">Joining date</dt>
                <dd className="mt-0.5 text-sm text-zinc-900">{p?.joiningDate ?? "—"}</dd>
              </div>
              <div className="rounded-lg border border-zinc-100 bg-zinc-50/50 px-3 py-2">
                <dt className="text-xs font-medium text-zinc-500">Password status</dt>
                <dd className="mt-0.5 text-sm text-zinc-900">
                  {employee.mustChangePassword ? "Must change password" : "Up to date"}
                </dd>
              </div>
              <div className="rounded-lg border border-zinc-100 bg-zinc-50/50 px-3 py-2">
                <dt className="text-xs font-medium text-zinc-500">User ID</dt>
                <dd className="mt-0.5 break-all font-mono text-xs text-zinc-700">{employee.id}</dd>
              </div>
            </dl>
          </section>

          <section className="mt-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Certificates</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {p?.certificates?.length ? (
                p.certificates.map((c) => (
                  <li
                    key={c}
                    className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-900"
                  >
                    {c}
                  </li>
                ))
              ) : (
                <li className="text-sm text-zinc-600">None on file.</li>
              )}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
