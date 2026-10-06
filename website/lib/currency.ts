"use client";

import { useSyncExternalStore } from "react";
import data from "../data/currencies.json";

export const BASE = "CHF";
export const RATES: Record<string, number> = data.rates;
export const CURRENCIES = Object.keys(RATES);

const KEY = "currency-v1";
const EVENT = "currency-change";
let memory: string | null = null;

/** Guesses the visitor's currency from the region in their browser language, e.g. "en-GB" -> GBP. */
export function detectCurrency(languages: readonly string[]): string {
  const countries: Record<string, string> = data.countries;
  for (const tag of languages) {
    try {
      const region = new Intl.Locale(tag).maximize().region;
      if (region && countries[region]) return countries[region];
      if (region) return data.fallback;
    } catch {
      // Invalid language tag: try the next one.
    }
  }
  return BASE;
}

function read(): string {
  let stored: string | null = memory;
  try {
    stored = localStorage.getItem(KEY) ?? memory;
  } catch {
    // Storage blocked: keep the choice in memory for this page view.
  }
  if (stored && RATES[stored]) return stored;
  return detectCurrency(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

export function setCurrency(code: string) {
  if (!RATES[code]) return;
  memory = code;
  try {
    localStorage.setItem(KEY, code);
  } catch {
    // See read().
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/** The visitor's display currency. The server always renders CHF. */
export function useCurrency(): string {
  return useSyncExternalStore(subscribe, read, () => BASE);
}

const formatters = new Map<string, Intl.NumberFormat>();

/** Formats an amount in Rappen in the given currency. Converted amounts are rounded to whole units. */
export function formatMoney(cents: number, currency: string): string {
  const rate = RATES[currency] ?? 1;
  let f = formatters.get(currency);
  if (!f) {
    f =
      currency === BASE
        ? new Intl.NumberFormat("de-CH", { style: "currency", currency: BASE })
        : new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0, minimumFractionDigits: 0 });
    formatters.set(currency, f);
  }
  const amount = (cents / 100) * rate;
  return f.format(currency === BASE ? amount : Math.round(amount));
}
