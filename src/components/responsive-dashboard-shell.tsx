"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

const LG_MEDIA = "(min-width: 1024px)";

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="text-zinc-800"
      aria-hidden
    >
      {open ? (
        <>
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </>
      ) : (
        <>
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h16" />
        </>
      )}
    </svg>
  );
}

type ResponsiveDashboardShellProps = {
  /** When this value changes, the mobile drawer closes (e.g. active tab id). */
  navResetKey: string | number;
  sidebar: ReactNode;
  headerTitle: ReactNode;
  headerBreadcrumb?: ReactNode;
  headerRight?: ReactNode;
  /** Optional stripe above the shell (gradient bar). */
  topStripe?: ReactNode;
  /** Shown below header (password prompts, etc.). */
  banner?: ReactNode;
  children: ReactNode;
};

export function ResponsiveDashboardShell({
  navResetKey,
  sidebar,
  headerTitle,
  headerBreadcrumb,
  headerRight,
  topStripe,
  banner,
  children,
}: ResponsiveDashboardShellProps) {
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [navResetKey]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!navOpen) return;
    const mq = window.matchMedia(LG_MEDIA);
    if (mq.matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  useEffect(() => {
    const mq = window.matchMedia(LG_MEDIA);
    const onChange = () => {
      if (mq.matches) setNavOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const closeNav = useCallback(() => setNavOpen(false), []);

  return (
    <main className="dashboard-shell mx-auto flex h-[100dvh] max-h-[100dvh] w-full max-w-[1600px] flex-col overflow-hidden bg-[#f2f4f8] text-zinc-900">
      {topStripe}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {navOpen ? (
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-30 bg-zinc-900/45 backdrop-blur-[1px] lg:hidden"
            onClick={closeNav}
          />
        ) : null}

        <aside
          id="dashboard-side-nav"
          className={`fixed inset-y-0 left-0 z-40 flex w-[min(17.5rem,calc(100vw-2.5rem))] flex-col overflow-y-auto border-r border-zinc-200 bg-white shadow-xl transition-transform duration-200 ease-out motion-reduce:transition-none lg:static lg:z-0 lg:w-[260px] lg:min-w-[260px] lg:max-w-[260px] lg:translate-x-0 lg:shadow-none ${
            navOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          }`}
        >
          {sidebar}
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 bg-white px-3 py-2.5 shadow-sm sm:px-4 sm:py-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              <button
                type="button"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-800 shadow-sm hover:bg-zinc-50 lg:hidden"
                aria-expanded={navOpen}
                aria-controls="dashboard-side-nav"
                onClick={() => setNavOpen((o) => !o)}
              >
                <span className="sr-only">{navOpen ? "Close menu" : "Open menu"}</span>
                <MenuIcon open={navOpen} />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold tracking-tight text-zinc-900 sm:text-[22px]">
                  {headerTitle}
                </h1>
                {headerBreadcrumb ? (
                  <div className="mt-0.5 hidden text-xs text-zinc-600 md:block">{headerBreadcrumb}</div>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">{headerRight}</div>
          </header>

          {banner}

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#f2f4f8] p-3 sm:p-4">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
