"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { usesAdminPortal } from "@/lib/roles";
import { SEED_ADMIN_PASSWORD, SEED_ADMIN_USERNAME } from "@/lib/seed-defaults";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }

      if (usesAdminPortal(data.user.role)) {
        router.push("/admin/dashboard");
      } else {
        router.push("/employee/dashboard");
      }
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="animate-fade-in w-full max-w-md space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6"
    >
      <h1 className="text-xl font-bold text-zinc-900 sm:text-2xl">Sign in to HR Portal</h1>
      <p className="text-xs text-zinc-700 sm:text-sm">
        Default admin credentials:{" "}
        <span className="font-semibold">
          {SEED_ADMIN_USERNAME} / {SEED_ADMIN_PASSWORD}
        </span>
      </p>
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder:text-zinc-500"
        placeholder="username"
        required
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder:text-zinc-500"
        placeholder="password"
        required
      />
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-gradient-to-r from-zinc-900 to-zinc-700 px-4 py-2 text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {loading ? "Signing in..." : "Login"}
      </button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
