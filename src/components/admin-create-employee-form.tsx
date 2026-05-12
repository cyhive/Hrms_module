"use client";

import { FormEvent, useEffect, useState } from "react";
import { usesEmployeePortal } from "@/lib/roles";
import type { Role } from "@/lib/types";

interface Props {
  onCreated: () => void;
  /** Bump after creating an employee so the manager dropdown includes the new account. */
  refreshManagersKey: number;
}

type ManagerOption = { id: string; username: string; role: Role; fullName?: string };
type ProjectOption = { _id: string; name: string };

export function AdminCreateEmployeeForm({ onCreated, refreshManagersKey }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [certificates, setCertificates] = useState("");
  const [managerId, setManagerId] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [managerOptions, setManagerOptions] = useState<ManagerOption[]>([]);
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadManagers() {
      try {
        const res = await fetch("/api/admin/employees?scope=manager-options");
        const data = await res.json();
        if (!res.ok) return;
        const rows: ManagerOption[] = (data.employees ?? []).map(
          (e: { id: string; username: string; role: Role; profile?: { fullName?: string } }) => ({
            id: e.id,
            username: e.username,
            role: e.role,
            fullName: e.profile?.fullName,
          }),
        );
        setManagerOptions(rows);
      } catch {
        /* ignore — form still works without manager list */
      }
    }
    void loadManagers();
  }, [refreshManagersKey]);

  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await fetch("/api/admin/projects");
        const data = await res.json();
        if (!res.ok) return;
        setProjectOptions(data.projects ?? []);
      } catch {
        /* optional */
      }
    }
    void loadProjects();
  }, [refreshManagersKey]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);
    if (role === "manager" && !managerId) {
      setError("Manager role must report to HR or Admin");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          role,
          fullName,
          email,
          phone,
          department,
          designation,
          joiningDate,
          certificates,
          ...(usesEmployeePortal(role) && managerId ? { managerId } : {}),
          ...(usesEmployeePortal(role) && projectId ? { projectId } : {}),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to create employee");
        return;
      }

      setMessage(`Employee "${data.employee.username}" created successfully`);
      setUsername("");
      setPassword("");
      setFullName("");
      setEmail("");
      setPhone("");
      setDepartment("");
      setDesignation("");
      setJoiningDate("");
      setCertificates("");
      setManagerId("");
      setProjectId("");
      setRole("employee");
      onCreated();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const managerChoices = managerOptions.filter((m) =>
    role === "manager"
      ? m.role === "hr" || m.role === "admin"
      : m.role === "employee" || m.role === "manager" || m.role === "hr",
  );

  return (
    <form onSubmit={handleSubmit} className="animate-fade-in space-y-3 rounded-2xl border border-zinc-200 bg-white/90 p-5 shadow-sm backdrop-blur">
      <h3 className="text-lg font-semibold">Create Employee Onboarding</h3>
      <p className="text-sm text-zinc-600">
        HR or Admin creates the login plus onboarding details. The employee can change their password after first login.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2"
          placeholder="full name"
          required
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2"
          placeholder="email"
          type="email"
          required
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2"
          placeholder="phone"
          required
        />
        <input
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2"
          placeholder="department"
          required
        />
        <input
          value={designation}
          onChange={(e) => setDesignation(e.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2"
          placeholder="designation"
          required
        />
        <input
          type="date"
          value={joiningDate}
          onChange={(e) => setJoiningDate(e.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2"
          required
        />
        <label>
          <span className="mb-1 block text-xs font-medium text-zinc-600">Role</span>
          <select
            value={role}
            onChange={(e) => {
              const next = e.target.value as Role;
              setRole(next);
              if (!usesEmployeePortal(next)) {
                setManagerId("");
                setProjectId("");
              }
            }}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
          >
            <option value="employee">Employee</option>
            <option value="manager">Manager</option>
            <option value="hr">HR</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        {usesEmployeePortal(role) ? (
          <label className="md:col-span-2">
            <span className="mb-1 block text-xs font-medium text-zinc-600">
              {role === "manager" ? "Reports to (HR/Admin)" : "Manager (reports to)"}
            </span>
            <select
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
            >
              <option value="">
                {role === "manager" ? "Select HR/Admin" : "No manager"}
              </option>
              {managerChoices.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName?.trim() ? `${m.fullName} (${m.username})` : m.username} [{m.role}]
                </option>
              ))}
            </select>
            {role === "manager" && managerChoices.length === 0 ? (
              <p className="mt-1 text-xs text-amber-700">
                No HR/Admin account available to assign. Create an HR/Admin user first.
              </p>
            ) : null}
          </label>
        ) : null}
        {usesEmployeePortal(role) ? (
          <label className="md:col-span-2">
            <span className="mb-1 block text-xs font-medium text-zinc-600">Project (optional)</span>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
            >
              <option value="">No project</option>
              {projectOptions.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2"
          placeholder="employee username"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2"
          placeholder="temporary password"
          required
          minLength={6}
        />
      </div>
      <textarea
        value={certificates}
        onChange={(e) => setCertificates(e.target.value)}
        className="w-full rounded-md border border-zinc-300 px-3 py-2"
        placeholder="certificates (comma separated)"
        rows={3}
      />

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-gradient-to-r from-zinc-900 to-zinc-700 px-4 py-2 text-white transition hover:scale-[1.01] disabled:opacity-60"
      >
        {loading ? "Creating..." : "Create Employee"}
      </button>

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
