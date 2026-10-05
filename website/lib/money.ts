const euro = new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" });

export function formatChf(cents: number): string {
  return euro.format(cents / 100);
}
