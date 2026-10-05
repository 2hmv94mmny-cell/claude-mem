import type { Supplier } from "./suppliers/types";
import type { FulfillmentStatus, PaidOrder } from "./types";

export interface FulfillmentRecord {
  status?: FulfillmentStatus;
  supplierOrderId?: string;
  trackingNumber?: string;
  note?: string;
}

/** Where fulfillment state is kept. In production this is the Stripe PaymentIntent's metadata. */
export interface OrderStore {
  get(orderNumber: string): Promise<FulfillmentRecord>;
  update(orderNumber: string, patch: FulfillmentRecord): Promise<void>;
  listSubmitted(): Promise<string[]>;
}

export interface FulfillmentRules {
  /** Orders above this total wait for a manual check. */
  holdAboveCents: number;
}

export type FulfillmentOutcome =
  | { outcome: "submitted"; supplierOrderId: string }
  | { outcome: "held"; reason: string }
  | { outcome: "skipped"; reason: string }
  | { outcome: "failed"; error: string };

export function holdReason(order: PaidOrder, rules: FulfillmentRules): string | null {
  const unlinked = order.lines.filter((l) => !l.supplierVid);
  if (unlinked.length) {
    return `Not linked to a supplier product: ${unlinked.map((l) => l.name).join(", ")}`;
  }
  if (order.totalCents > rules.holdAboveCents) {
    return `Order total above CHF ${(rules.holdAboveCents / 100).toFixed(2)} – please review manually`;
  }
  if (order.riskLevel === "elevated" || order.riskLevel === "highest") {
    return `Stripe rates the fraud risk as ${order.riskLevel}`;
  }
  return null;
}

/**
 * Sends a paid order to the supplier exactly once. Safe to call repeatedly for the
 * same order (Stripe retries webhooks): finished or held orders are skipped, and the
 * supplier itself is asked for an existing order with the same order number.
 */
export async function fulfillOrder(
  order: PaidOrder,
  deps: { supplier: Supplier; store: OrderStore; rules: FulfillmentRules },
): Promise<FulfillmentOutcome> {
  const current = await deps.store.get(order.orderNumber);
  if (current.status === "submitted" || current.status === "shipped") {
    return { outcome: "skipped", reason: `already ${current.status}` };
  }
  if (current.status === "held") {
    return { outcome: "skipped", reason: "held for manual review" };
  }

  const reason = holdReason(order, deps.rules);
  if (reason) {
    await deps.store.update(order.orderNumber, { status: "held", note: reason });
    return { outcome: "held", reason };
  }

  try {
    const result = await deps.supplier.createOrder(order);
    await deps.store.update(order.orderNumber, {
      status: "submitted",
      supplierOrderId: result.supplierOrderId,
      note: "",
    });
    return { outcome: "submitted", supplierOrderId: result.supplierOrderId };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await deps.store.update(order.orderNumber, { status: "failed", note: error.slice(0, 450) });
    return { outcome: "failed", error };
  }
}

export interface ShippedOrder {
  orderNumber: string;
  trackingNumber: string;
  trackingUrl?: string;
  carrier?: string;
}

/** Checks every submitted order for a tracking number and marks shipped ones. */
export async function syncTracking(deps: {
  supplier: Supplier;
  store: OrderStore;
  onShipped: (order: ShippedOrder) => Promise<void>;
}): Promise<{ checked: number; shipped: ShippedOrder[]; errors: string[] }> {
  const orderNumbers = await deps.store.listSubmitted();
  const shipped: ShippedOrder[] = [];
  const errors: string[] = [];

  for (const orderNumber of orderNumbers) {
    try {
      const status = await deps.supplier.getOrder(orderNumber);
      if (!status?.trackingNumber) continue;
      const order: ShippedOrder = {
        orderNumber,
        trackingNumber: status.trackingNumber,
        trackingUrl: status.trackingUrl,
        carrier: status.carrier,
      };
      await deps.store.update(orderNumber, { status: "shipped", trackingNumber: status.trackingNumber });
      await deps.onShipped(order);
      shipped.push(order);
    } catch (err) {
      errors.push(`${orderNumber}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { checked: orderNumbers.length, shipped, errors };
}
