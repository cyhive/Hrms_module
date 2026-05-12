"use client";

import { useMemo, useState } from "react";

export type SalaryTrendRow = { period: string; totalNet: number };

const VIEW_W = 520;
const VIEW_H = 220;
const PAD_L = 52;
const PAD_R = 12;
const PAD_T = 8;
const PAD_B = 36;

function niceCeil(max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 1;
  const exp = Math.floor(Math.log10(max));
  const frac = max / 10 ** exp;
  let niceFrac = 10;
  if (frac <= 1) niceFrac = 1;
  else if (frac <= 2) niceFrac = 2;
  else if (frac <= 5) niceFrac = 5;
  return niceFrac * 10 ** exp;
}

/** `angleDeg`: 0 = top, clockwise. */
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSlicePath(cx: number, cy: number, rOuter: number, rInner: number, startAngle: number, endAngle: number) {
  const p1 = polarToCartesian(cx, cy, rOuter, startAngle);
  const p2 = polarToCartesian(cx, cy, rOuter, endAngle);
  const p3 = polarToCartesian(cx, cy, rInner, endAngle);
  const p4 = polarToCartesian(cx, cy, rInner, startAngle);
  const sweep = endAngle - startAngle;
  const largeArc = sweep > 180 ? 1 : 0;
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
    "Z",
  ].join(" ");
}

const BAR_COLORS = ["#4f46e5", "#0891b2", "#7c3aed", "#0d9488", "#2563eb", "#0e7490"];

export function SalaryTrendChart({
  trend,
  formatValue,
  periodShort,
}: {
  trend: SalaryTrendRow[];
  formatValue: (n: number) => string;
  periodShort: (period: string) => string;
}) {
  const [mode, setMode] = useState<"bars" | "pie">("bars");

  const maxNet = useMemo(() => {
    if (!trend.length) return 1;
    return Math.max(...trend.map((r) => r.totalNet), 0);
  }, [trend]);

  const yMax = useMemo(() => niceCeil(maxNet || 1), [maxNet]);

  const innerW = VIEW_W - PAD_L - PAD_R;
  const innerH = VIEW_H - PAD_T - PAD_B;

  const pieTotal = useMemo(() => trend.reduce((a, r) => a + r.totalNet, 0), [trend]);

  if (!trend.length) return null;

  const yTicks = 4;
  const tickVals: number[] = [];
  for (let i = 0; i <= yTicks; i += 1) tickVals.push((yMax * i) / yTicks);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-zinc-500">View</span>
        <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5">
          <button
            type="button"
            onClick={() => setMode("bars")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              mode === "bars" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Bar chart
          </button>
          <button
            type="button"
            onClick={() => setMode("pie")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              mode === "pie" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Pie (share)
          </button>
        </div>
        <span className="text-xs text-zinc-500">
          {mode === "pie"
            ? "Each slice is that month’s share of combined net pay in this window."
            : "Net pay by month (bars scale to the highest month shown)."}
        </span>
      </div>

      {mode === "bars" ? (
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="max-h-64 w-full"
          role="img"
          aria-label="Salary net pay by month"
        >
          <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="#fafafa" rx="6" />
          {tickVals.map((tv) => {
            const y = PAD_T + innerH - (tv / yMax) * innerH;
            return (
              <g key={String(tv)}>
                <line x1={PAD_L} y1={y} x2={VIEW_W - PAD_R} y2={y} stroke="#e4e4e7" strokeWidth="1" />
                <text x={PAD_L - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#71717a">
                  {tv === 0 ? "0" : formatValue(tv)}
                </text>
              </g>
            );
          })}
          {trend.map((row, i) => {
            const n = trend.length;
            const slotW = innerW / n;
            const barW = Math.max(14, slotW * 0.55);
            const xCenter = PAD_L + slotW * (i + 0.5);
            const x = xCenter - barW / 2;
            const h = yMax > 0 ? (row.totalNet / yMax) * innerH : 0;
            const y = PAD_T + innerH - h;
            return (
              <g key={row.period}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(h, 3)}
                  rx="4"
                  fill={BAR_COLORS[i % BAR_COLORS.length]}
                  opacity={0.92}
                >
                  <title>{`${row.period}: ${formatValue(row.totalNet)}`}</title>
                </rect>
                <text
                  x={xCenter}
                  y={PAD_T + innerH + 14}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#52525b"
                  fontWeight={500}
                >
                  {periodShort(row.period)}
                </text>
                <text x={xCenter} y={y - 4} textAnchor="middle" fontSize="10" fill="#3f3f46" fontWeight={600}>
                  {formatValue(row.totalNet)}
                </text>
              </g>
            );
          })}
        </svg>
      ) : (
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="max-h-64 w-full"
          role="img"
          aria-label="Share of salary by month"
        >
          <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="#fafafa" rx="6" />
          {(() => {
            const cx = VIEW_W * 0.34;
            const cy = VIEW_H / 2;
            const rO = Math.min(VIEW_W, VIEW_H) * 0.34;
            const rI = rO * 0.55;
            const total = pieTotal > 0 ? pieTotal : 1;

            if (trend.length === 1 && trend[0].totalNet > 0) {
              return (
                <>
                  <circle cx={cx} cy={cy} r={rO} fill={BAR_COLORS[0]}>
                    <title>{`${trend[0].period}: ${formatValue(trend[0].totalNet)} (100%)`}</title>
                  </circle>
                  <circle cx={cx} cy={cy} r={rI} fill="#fafafa" />
                  <text x={cx} y={cy} textAnchor="middle" fontSize="11" fill="#52525b" dy="0.35em">
                    100%
                  </text>
                </>
              );
            }

            let cumDeg = 0;
            const paths = trend.map((row, i) => {
              const share = row.totalNet / total;
              const sweepDeg = share * 360;
              const start = cumDeg;
              cumDeg += sweepDeg;
              if (sweepDeg < 0.05) return null;
              const d = donutSlicePath(cx, cy, rO, rI, start, cumDeg);
              const pct = (share * 100).toFixed(1);
              return (
                <path key={row.period} d={d} fill={BAR_COLORS[i % BAR_COLORS.length]} stroke="#fafafa" strokeWidth="1">
                  <title>{`${row.period}: ${formatValue(row.totalNet)} (${pct}%)`}</title>
                </path>
              );
            });
            return (
              <>
                {paths}
                <text x={cx} y={cy} textAnchor="middle" fontSize="11" fill="#52525b" dy="0.35em">
                  {pieTotal <= 0 ? "—" : "Share"}
                </text>
              </>
            );
          })()}
          <g transform={`translate(${VIEW_W * 0.58}, ${PAD_T + 10})`}>
            {trend.map((row, i) => {
              const pct = pieTotal > 0 ? ((row.totalNet / pieTotal) * 100).toFixed(1) : "0";
              return (
                <g key={row.period} transform={`translate(0, ${i * 22})`}>
                  <rect x="0" y="2" width="10" height="10" rx="2" fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  <text x="16" y="11" fontSize="11" fill="#3f3f46">
                    {periodShort(row.period)}: {formatValue(row.totalNet)} ({pct}%)
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      )}
    </div>
  );
}
