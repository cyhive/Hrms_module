import Link from "next/link";

export default function Home() {
  return (
    <main className="dashboard-shell mx-auto min-h-screen w-full max-w-[1600px] bg-[#f2f4f8] text-zinc-900">
      <div className="h-1 w-full bg-gradient-to-r from-teal-400 via-cyan-400 to-blue-500" />
      <div className="mx-auto flex min-h-[calc(100vh-4px)] w-full max-w-6xl items-center px-6 py-12">
        <section className="animate-fade-in w-full rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 md:text-5xl">
            HR Management Portal
          </h1>
          <p className="mt-4 max-w-3xl text-zinc-700">
            Modern onboarding-ready system with role-based dashboards. Admin can create employee credentials and onboarding profile data including certificates. Employee can login and update password inside their dashboard.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="rounded-md bg-gradient-to-r from-zinc-900 to-zinc-700 px-4 py-2 text-white transition hover:brightness-110"
            >
              Open Login
            </Link>
            <Link
              href="/admin/dashboard"
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-zinc-800 transition hover:bg-zinc-100"
            >
              Admin Dashboard
            </Link>
            <Link
              href="/employee/dashboard"
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-zinc-800 transition hover:bg-zinc-100"
            >
              Employee Dashboard
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
