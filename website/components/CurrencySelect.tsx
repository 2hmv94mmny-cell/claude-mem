"use client";

import { CURRENCIES, setCurrency, useCurrency } from "@/lib/currency";

export function CurrencySelect({ className }: { className?: string }) {
  const currency = useCurrency();
  return (
    <label className={`currency-select label ${className ?? ""}`}>
      <span className="visually-hidden">Currency</span>
      <select data-currency value={currency} onChange={(e) => setCurrency(e.target.value)}>
        {CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  );
}
