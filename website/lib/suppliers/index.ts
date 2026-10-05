import { CjSupplier, cjConfigFromEnv } from "./cj";
import { MockSupplier } from "./mock";
import type { Supplier } from "./types";

let supplier: Supplier | null = null;

/** CJ when CJ_API_KEY is set, otherwise the in-memory mock. SUPPLIER=mock forces the mock. */
export function getSupplier(): Supplier {
  if (supplier) return supplier;
  const cj = process.env.SUPPLIER === "mock" ? null : cjConfigFromEnv();
  supplier = cj ? new CjSupplier(cj) : new MockSupplier();
  return supplier;
}
