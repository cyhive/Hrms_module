"use client";

import { FormEvent, useState } from "react";

export function EmployeePasswordForm() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/employee/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Could not change password");
        return;
      }

      setMessage("Password changed successfully.");
      setOldPassword("");
      setNewPassword("");
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-zinc-200 p-4">
      <h3 className="text-lg font-semibold">Change Password</h3>
      <input
        type="password"
        value={oldPassword}
        onChange={(e) => setOldPassword(e.target.value)}
        className="w-full rounded-md border border-zinc-300 px-3 py-2"
        placeholder="current password"
        required
      />
      <input
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        className="w-full rounded-md border border-zinc-300 px-3 py-2"
        placeholder="new password"
        required
        minLength={6}
      />
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-black px-4 py-2 text-white transition hover:bg-zinc-800 disabled:opacity-60"
      >
        {loading ? "Saving..." : "Update Password"}
      </button>
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
