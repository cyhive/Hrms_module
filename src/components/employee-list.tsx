"use client";

import { useEffect, useMemo, useState } from "react";
import { usesEmployeePortal } from "@/lib/roles";
import type { EmployeeProfile } from "@/lib/types";
import { EmployeeProfileModal, StaffAvatar, type EmployeeRow } from "./employee-profile-modal";

type ProjectOption = { _id: string; name: string };

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

function managerLabel(employees: EmployeeRow[], managerId?: string): string {
  if (!managerId) return "—";
  const mgr = employees.find((e) => e.id === managerId);
  if (!mgr) return "—";
  return mgr.profile?.fullName?.trim() || mgr.username;
}

export function EmployeeList({ refreshKey }: { refreshKey: number }) {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [profileModalEmployee, setProfileModalEmployee] = useState<EmployeeRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orgPatchUserId, setOrgPatchUserId] = useState<string | null>(null);
  const [orgPatchError, setOrgPatchError] = useState("");

  const projectLabel = useMemo(() => {
    const m = new Map(projects.map((p) => [p._id, p.name]));
    return (id?: string) => (id ? m.get(id) ?? id : "—");
  }, [projects]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [empRes, projRes] = await Promise.all([
          fetch("/api/admin/employees"),
          fetch("/api/admin/projects"),
        ]);
        const empData = await empRes.json();
        if (!empRes.ok) {
          setError(empData.error ?? "Could not load employees");
          return;
        }
        const rows = empData.employees ?? [];
        setEmployees(rows);
        setProfileModalEmployee(null);
        const projData = await projRes.json().catch(() => ({}));
        if (projRes.ok) setProjects(projData.projects ?? []);
      } catch {
        setError("Could not load employees");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [refreshKey]);

  async function patchEmployeeOrg(
    userId: string,
    patch: { projectId?: string; managerId?: string },
  ): Promise<string | null> {
    setOrgPatchError("");
    setOrgPatchUserId(userId);
    try {
      const body: Record<string, string> = { userId };
      if ("projectId" in patch) body.projectId = patch.projectId ?? "";
      if ("managerId" in patch) body.managerId = patch.managerId ?? "";
      const res = await fetch("/api/admin/employees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return typeof data.error === "string" ? data.error : "Update failed";
      }
      setEmployees((prev) =>
        prev.map((e) => {
          if (e.id !== userId) return e;
          const profile = { ...(e.profile ?? {}) } as EmployeeProfile;
          if ("projectId" in patch) {
            if (patch.projectId?.trim()) profile.projectId = patch.projectId.trim();
            else delete profile.projectId;
          }
          if ("managerId" in patch) {
            if (patch.managerId?.trim()) profile.managerId = patch.managerId.trim();
            else delete profile.managerId;
          }
          return { ...e, profile } as EmployeeRow;
        }),
      );
      setProfileModalEmployee((prev) => {
        if (!prev || prev.id !== userId) return prev;
        const profile = { ...(prev.profile ?? {}) } as EmployeeProfile;
        if ("projectId" in patch) {
          if (patch.projectId?.trim()) profile.projectId = patch.projectId.trim();
          else delete profile.projectId;
        }
        if ("managerId" in patch) {
          if (patch.managerId?.trim()) profile.managerId = patch.managerId.trim();
          else delete profile.managerId;
        }
        return { ...prev, profile } as EmployeeRow;
      });
      return null;
    } catch {
      return "Update failed";
    } finally {
      setOrgPatchUserId(null);
    }
  }

  if (loading) return <p className="text-sm text-zinc-600">Loading employees...</p>;
  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!employees.length) return <p className="text-sm text-zinc-600">No employees created yet.</p>;

  return (
    <div className="animate-fade-in rounded-2xl border border-zinc-200 bg-white/90 p-5 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h3 className="text-lg font-semibold text-zinc-900">Employee Accounts</h3>
        <p className="text-xs text-zinc-500">
          HR and Admin can change manager and project from the table or from the profile modal. Click a row for full
          details.
        </p>
      </div>
      {orgPatchError ? <p className="mb-2 text-sm text-red-700">{orgPatchError}</p> : null}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[1280px] text-left text-sm">
          <thead className="border-b border-zinc-200 text-zinc-700">
            <tr>
              <th className="py-2 pl-2">Name</th>
              <th className="py-2">Username</th>
              <th className="py-2">Email</th>
              <th className="py-2">Department</th>
              <th className="py-2">Designation</th>
              <th className="py-2">Role</th>
              <th className="py-2">Manager</th>
              <th className="py-2">Project</th>
              <th className="py-2">Password Status</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => {
              const isOpen = profileModalEmployee?.id === employee.id;
              const busy = orgPatchUserId === employee.id;
              const mgrChoices = reportingManagerChoices(employee, employees);
              return (
                <tr
                  key={employee.id}
                  tabIndex={0}
                  onClick={() => setProfileModalEmployee(employee)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setProfileModalEmployee(employee);
                    }
                  }}
                  className={`cursor-pointer border-b border-zinc-100 transition outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                    isOpen ? "bg-teal-50" : "hover:bg-zinc-50"
                  }`}
                >
                  <td className="py-2 pl-2">
                    <div className="flex items-center gap-2">
                      <StaffAvatar employee={employee} size="sm" />
                      <span className="font-medium text-zinc-900">
                        {employee.profile?.fullName ?? "—"}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 text-zinc-800">{employee.username}</td>
                  <td className="py-2 text-zinc-800">{employee.profile?.email ?? "-"}</td>
                  <td className="py-2 text-zinc-800">{employee.profile?.department ?? "-"}</td>
                  <td className="py-2 text-zinc-800">{employee.profile?.designation ?? "-"}</td>
                  <td className="py-2 text-zinc-800 capitalize">{employee.role}</td>
                  <td
                    className="py-2 text-zinc-800"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    {usesEmployeePortal(employee.role) ? (
                      <select
                        value={employee.profile?.managerId ?? ""}
                        disabled={busy}
                        onChange={(e) =>
                          void patchEmployeeOrg(employee.id, { managerId: e.target.value }).then((err) => {
                            if (err) setOrgPatchError(err);
                          })
                        }
                        className="max-w-[220px] rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900"
                      >
                        {employee.role === "manager" ? null : <option value="">No manager</option>}
                        {mgrChoices.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.profile?.fullName?.trim()
                              ? `${m.profile.fullName} (${m.username})`
                              : m.username}
                          </option>
                        ))}
                      </select>
                    ) : (
                      managerLabel(employees, employee.profile?.managerId)
                    )}
                  </td>
                  <td
                    className="py-2 text-zinc-800"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    {usesEmployeePortal(employee.role) ? (
                      <select
                        value={employee.profile?.projectId ?? ""}
                        disabled={busy}
                        onChange={(e) =>
                          void patchEmployeeOrg(employee.id, { projectId: e.target.value }).then((err) => {
                            if (err) setOrgPatchError(err);
                          })
                        }
                        className="max-w-[200px] rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900"
                      >
                        <option value="">None</option>
                        {projects.map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      projectLabel(employee.profile?.projectId)
                    )}
                  </td>
                  <td className="py-2 text-zinc-800">
                    {employee.mustChangePassword ? "Must change" : "Updated"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <EmployeeProfileModal
        employee={profileModalEmployee}
        allStaff={employees}
        projects={projects}
        onOrgPatch={patchEmployeeOrg}
        onClose={() => setProfileModalEmployee(null)}
      />
    </div>
  );
}
