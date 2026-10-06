"use client";

import { formatMoney, useCurrency } from "@/lib/currency";

/** A CHF price shown in the visitor's chosen currency. `data-chf` lets the static preview convert it too. */
export function Money({ cents }: { cents: number }) {
  const currency = useCurrency();
  return (
    <span className="money" data-chf={cents}>
      {formatMoney(cents, currency)}
    </span>
  );
}

/** Explains that converted prices are indicative. Renders nothing while CHF is selected. */
export function CurrencyNote() {
  const currency = useCurrency();
  return (
    <p className="muted small currency-note" data-currency-note hidden={currency === "CHF"}>
      Prices in {currency === "CHF" ? "your currency" : currency} are approximate. You can pay in your own currency at
      checkout, at the exchange rate shown there.
    </p>
  );
}
