"use client";

import { useCallback, useMemo, useState } from "react";
import {
  formatHrCurrency,
  getDefaultDisplayCurrency,
  HR_DISPLAY_CURRENCY_STORAGE_KEY,
  resolveDisplayCurrency,
  type HrDisplayCurrency,
} from "./display-currency";

function readStoredCurrency(): HrDisplayCurrency {
  if (typeof window === "undefined") return getDefaultDisplayCurrency();
  try {
    return resolveDisplayCurrency(localStorage.getItem(HR_DISPLAY_CURRENCY_STORAGE_KEY));
  } catch {
    return getDefaultDisplayCurrency();
  }
}

export function useHrDisplayCurrency() {
  const [currency, setCurrencyState] = useState<HrDisplayCurrency>(readStoredCurrency);

  const setCurrency = useCallback((next: HrDisplayCurrency) => {
    setCurrencyState(next);
    try {
      localStorage.setItem(HR_DISPLAY_CURRENCY_STORAGE_KEY, next);
    } catch {
      // ignore quota / private mode
    }
  }, []);

  const formatInt = useCallback(
    (n: number) => formatHrCurrency(n, currency, { maximumFractionDigits: 0 }),
    [currency],
  );

  const formatAvg = useCallback(
    (n: number) => formatHrCurrency(n, currency, { maximumFractionDigits: 2 }),
    [currency],
  );

  const labels = useMemo(
    () =>
      ({
        INR: "Indian rupee (INR)",
        USD: "US dollar (USD)",
        EUR: "Euro (EUR)",
      }) satisfies Record<HrDisplayCurrency, string>,
    [],
  );

  return { currency, setCurrency, formatInt, formatAvg, labels };
}
