"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="rounded-md bg-gradient-to-r from-rose-500 to-pink-500 px-3 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-60"
    >
      {loading ? "Logging out..." : "Logout"}
    </button>
  );
}
