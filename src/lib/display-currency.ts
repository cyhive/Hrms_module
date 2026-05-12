/** ISO 4217 codes supported for HR dashboard display (labels only; DB amounts are not converted). */
export const HR_DISPLAY_CURRENCIES = ["INR", "USD", "EUR"] as const;
export type HrDisplayCurrency = (typeof HR_DISPLAY_CURRENCIES)[number];

export const HR_DISPLAY_CURRENCY_STORAGE_KEY = "hr-display-currency";

export function parseHrDisplayCurrency(raw: string | null | undefined): HrDisplayCurrency | null {
  const c = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (!c) return null;
  return (HR_DISPLAY_CURRENCIES as readonly string[]).includes(c) ? (c as HrDisplayCurrency) : null;
}

/** Build-time default from `NEXT_PUBLIC_DISPLAY_CURRENCY` (e.g. INR), else INR. */
export function getDefaultDisplayCurrency(): HrDisplayCurrency {
  const fromEnv =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_DISPLAY_CURRENCY
      ? parseHrDisplayCurrency(process.env.NEXT_PUBLIC_DISPLAY_CURRENCY)
      : null;
  return fromEnv ?? "INR";
}

export function resolveDisplayCurrency(stored: string | null | undefined): HrDisplayCurrency {
  return parseHrDisplayCurrency(stored) ?? getDefaultDisplayCurrency();
}

export function formatHrCurrency(
  amount: number,
  currency: HrDisplayCurrency,
  options: { maximumFractionDigits: number; minimumFractionDigits?: number },
): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: options.maximumFractionDigits,
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
  }).format(amount);
}
