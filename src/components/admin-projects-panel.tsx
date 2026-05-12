"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type ProjectRow = { _id: string; name: string; description?: string; memberCount: number };

type DashboardMember = {
  userId: string;
  username: string;
  fullName: string;
  role: string;
  annualLeave: number;
  carryForward: number;
  monthWorkedHours: number;
};

type DashboardPayload = {
  project: { _id: string; name: string; description?: string };
  monthLabel: string;
  members: DashboardMember[];
};

export function AdminProjectsPanel({ refreshKey }: { refreshKey: number }) {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setListError("");
    try {
      const res = await fetch("/api/admin/projects");
      const data = await res.json();
      if (!res.ok) {
        setListError(typeof data.error === "string" ? data.error : "Could not load projects");
        return;
      }
      setProjects(data.projects ?? []);
    } catch {
      setListError("Could not load projects");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList, refreshKey]);

  const loadDetail = useCallback(async (projectId: string) => {
    setLoadingDetail(true);
    setDetailError("");
    setDashboard(null);
    try {
      const res = await fetch(`/api/admin/projects?projectId=${encodeURIComponent(projectId)}`);
      const data = await res.json();
      if (!res.ok) {
        setDetailError(typeof data.error === "string" ? data.error : "Could not load project");
        return;
      }
      setDashboard(data as DashboardPayload);
    } catch {
      setDetailError("Could not load project");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else {
      setDashboard(null);
      setDetailError("");
    }
  }, [selectedId, loadDetail, refreshKey]);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateError("");
    setCreateBusy(true);
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const description = String(fd.get("description") ?? "").trim();
    try {
      const res = await fetch("/api/admin/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError(typeof data.error === "string" ? data.error : "Create failed");
        return;
      }
      (e.target as HTMLFormElement).reset();
      await loadList();
    } catch {
      setCreateError("Create failed");
    } finally {
      setCreateBusy(false);
    }
  }

  if (selectedId) {
    return (
      <div className="animate-fade-in space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            ← All projects
          </button>
          {dashboard ? (
            <h2 className="text-lg font-semibold text-zinc-900">{dashboard.project.name}</h2>
          ) : null}
        </div>
        {loadingDetail ? <p className="text-sm text-zinc-600">Loading team…</p> : null}
        {detailError ? <p className="text-sm text-red-700">{detailError}</p> : null}
        {dashboard ? (
          <>
            <p className="text-sm text-zinc-600">
              Leave balances are current synced values. Working hours sum attendance for calendar month{" "}
              <span className="font-medium text-zinc-800">{dashboard.monthLabel}</span>.
            </p>
            {dashboard.project.description ? (
              <p className="text-sm text-zinc-700">{dashboard.project.description}</p>
            ) : null}
            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-700">
                  <tr>
                    <th className="py-2 pl-3">Name</th>
                    <th className="py-2">Username</th>
                    <th className="py-2">Role</th>
                    <th className="py-2">Annual leave</th>
                    <th className="py-2">Carry forward</th>
                    <th className="py-2 pr-3">Hours ({dashboard.monthLabel})</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.members.map((m) => (
                    <tr key={m.userId} className="border-b border-zinc-100">
                      <td className="py-2 pl-3 font-medium text-zinc-900">{m.fullName}</td>
                      <td className="py-2 text-zinc-800">{m.username}</td>
                      <td className="py-2 capitalize text-zinc-700">{m.role}</td>
                      <td className="py-2 text-zinc-800">{m.annualLeave}</td>
                      <td className="py-2 text-zinc-800">{m.carryForward}</td>
                      <td className="py-2 pr-3 text-zinc-800">{m.monthWorkedHours}</td>
                    </tr>
                  ))}
                  {!dashboard.members.length ? (
                    <tr>
                      <td className="py-6 text-center text-zinc-500" colSpan={6}>
                        No employees or managers assigned to this project yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <p className="text-sm text-zinc-600">
        HR and Admin can create projects here. Assign employees and managers to a project from the Employees tab or when onboarding.
      </p>
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <h3 className="text-sm font-semibold text-zinc-900">New project</h3>
        <form onSubmit={handleCreate} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block min-w-[200px] flex-1 text-xs font-medium text-zinc-700">
            Name
            <input
              name="name"
              required
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="block min-w-[220px] flex-[2] text-xs font-medium text-zinc-700">
            Description (optional)
            <input name="description" className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm" />
          </label>
          <button
            type="submit"
            disabled={createBusy}
            className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {createBusy ? "Creating…" : "Create"}
          </button>
        </form>
        {createError ? <p className="mt-2 text-sm text-red-700">{createError}</p> : null}
      </div>

      <div>
        <h3 className="text-lg font-semibold text-zinc-900">Projects</h3>
        <p className="mt-1 text-sm text-zinc-600">Open a project to see members, leave balances, and monthly working hours.</p>
        {loadingList ? <p className="mt-3 text-sm text-zinc-600">Loading…</p> : null}
        {listError ? <p className="mt-3 text-sm text-red-700">{listError}</p> : null}
        {!loadingList && !listError ? (
          <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="border-b border-zinc-200 text-zinc-700">
                <tr>
                  <th className="py-2 pl-3">Project</th>
                  <th className="py-2">Members</th>
                  <th className="py-2 pr-3"> </th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p._id} className="border-b border-zinc-100">
                    <td className="py-2 pl-3">
                      <span className="font-medium text-zinc-900">{p.name}</span>
                      {p.description ? (
                        <span className="mt-0.5 block text-xs text-zinc-500">{p.description}</span>
                      ) : null}
                    </td>
                    <td className="py-2 text-zinc-800">{p.memberCount}</td>
                    <td className="py-2 pr-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedId(p._id)}
                        className="rounded-md border border-teal-600 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800 hover:bg-teal-100"
                      >
                        View team
                      </button>
                    </td>
                  </tr>
                ))}
                {!projects.length ? (
                  <tr>
                    <td className="py-6 text-center text-zinc-500" colSpan={3}>
                      No projects yet. Create one above, then assign staff from the Employees tab or when creating accounts.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
