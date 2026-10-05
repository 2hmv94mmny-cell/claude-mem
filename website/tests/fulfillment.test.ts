import { describe, expect, it, vi } from "vitest";
import { fulfillOrder, syncTracking, type FulfillmentRecord, type OrderStore } from "../lib/fulfillment";
import { MockSupplier } from "../lib/suppliers/mock";
import type { PaidOrder } from "../lib/types";

class MemoryStore implements OrderStore {
  records = new Map<string, FulfillmentRecord>();
  async get(id: string) {
    return this.records.get(id) ?? {};
  }
  async update(id: string, patch: FulfillmentRecord) {
    this.records.set(id, { ...this.records.get(id), ...patch });
  }
  async listSubmitted() {
    return [...this.records].filter(([, r]) => r.status === "submitted").map(([id]) => id);
  }
}

const rules = { holdAboveCents: 30000 };

function order(overrides: Partial<PaidOrder> = {}): PaidOrder {
  return {
    orderNumber: "pi_123",
    totalCents: 5490,
    lines: [{ productId: "p1", variantId: "v1", supplierVid: "VID-1", quantity: 1, name: "Loafer Romy" }],
    shipping: { name: "Mia Muster", line1: "Musterstraße 1", postalCode: "10115", city: "Berlin", country: "DE" },
    ...overrides,
  };
}

describe("fulfillOrder", () => {
  it("sends a paid order to the supplier and records it", async () => {
    const supplier = new MockSupplier();
    const store = new MemoryStore();
    const result = await fulfillOrder(order(), { supplier, store, rules });
    expect(result.outcome).toBe("submitted");
    expect(supplier.orders.size).toBe(1);
    expect(store.records.get("pi_123")?.status).toBe("submitted");
  });

  it("does not create a second supplier order when the webhook is delivered twice", async () => {
    const supplier = new MockSupplier();
    const store = new MemoryStore();
    const createOrder = vi.spyOn(supplier, "createOrder");
    await fulfillOrder(order(), { supplier, store, rules });
    const second = await fulfillOrder(order(), { supplier, store, rules });
    expect(second.outcome).toBe("skipped");
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  it("holds orders with products that are not linked to a supplier variant", async () => {
    const supplier = new MockSupplier();
    const store = new MemoryStore();
    const result = await fulfillOrder(
      order({ lines: [{ productId: "p1", variantId: "v1", supplierVid: null, quantity: 1, name: "Beispiel" }] }),
      { supplier, store, rules },
    );
    expect(result.outcome).toBe("held");
    expect(supplier.orders.size).toBe(0);
  });

  it("holds large orders and risky payments for a manual check", async () => {
    const store = new MemoryStore();
    const big = await fulfillOrder(order({ orderNumber: "pi_big", totalCents: 45000 }), {
      supplier: new MockSupplier(),
      store,
      rules,
    });
    const risky = await fulfillOrder(order({ orderNumber: "pi_risky", riskLevel: "elevated" }), {
      supplier: new MockSupplier(),
      store,
      rules,
    });
    expect(big.outcome).toBe("held");
    expect(risky.outcome).toBe("held");
  });

  it("records a failure and allows a retry when the supplier errors", async () => {
    const supplier = new MockSupplier();
    const store = new MemoryStore();
    vi.spyOn(supplier, "createOrder").mockRejectedValueOnce(new Error("CJ down"));
    const first = await fulfillOrder(order(), { supplier, store, rules });
    expect(first).toEqual({ outcome: "failed", error: "CJ down" });
    const retry = await fulfillOrder(order(), { supplier, store, rules });
    expect(retry.outcome).toBe("submitted");
  });
});

describe("syncTracking", () => {
  it("marks orders as shipped once the supplier has a tracking number", async () => {
    const supplier = new MockSupplier();
    const store = new MemoryStore();
    await fulfillOrder(order(), { supplier, store, rules });
    const onShipped = vi.fn(async () => {});

    const before = await syncTracking({ supplier, store, onShipped });
    expect(before.shipped).toHaveLength(0);

    supplier.ship("pi_123", "LX123456789DE");
    const after = await syncTracking({ supplier, store, onShipped });
    expect(after.shipped[0]?.trackingNumber).toBe("LX123456789DE");
    expect(store.records.get("pi_123")?.status).toBe("shipped");
    expect(onShipped).toHaveBeenCalledTimes(1);
  });
});
