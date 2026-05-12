"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PayslipSnapshot } from "@/lib/types";
import { PayslipView } from "./payslip-view";

type Props = {
  open: boolean;
  onClose: () => void;
  /** GET JSON returns `{ payslip: PayslipSnapshot }` */
  jsonUrl: string;
  /** GET returns PDF bytes */
  pdfUrl: string;
};

export function PayslipModal({ open, onClose, jsonUrl, pdfUrl }: Props) {
  const [mounted, setMounted] = useState(false);
  const [snapshot, setSnapshot] = useState<PayslipSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setSnapshot(null);
    try {
      const res = await fetch(jsonUrl);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not load payslip");
        return;
      }
      setSnapshot(data.payslip ?? null);
    } catch {
      setError("Could not load payslip");
    } finally {
      setLoading(false);
    }
  }, [jsonUrl]);

  useEffect(() => {
    if (!open) {
      setSnapshot(null);
      setError("");
      return;
    }
    void load();
  }, [open, load]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto p-4 pt-10">
      <button
        type="button"
        aria-label="Close"
        className="no-print absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative z-10 mb-10 w-full max-w-lg rounded-xl border border-zinc-200 bg-white shadow-xl print:shadow-none print:border-0" role="dialog" aria-modal="true">
        <div className="no-print flex flex-wrap items-center justify-end gap-2 border-b border-zinc-100 px-3 py-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Print
          </button>
          <a
            href={pdfUrl}
            download
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:brightness-110"
          >
            Download PDF
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
          >
            Close
          </button>
        </div>
        <div className="max-h-[min(80vh,720px)] overflow-y-auto p-5">
          {loading ? <p className="text-sm text-zinc-500">Loading…</p> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {snapshot ? <PayslipView snapshot={snapshot} /> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
