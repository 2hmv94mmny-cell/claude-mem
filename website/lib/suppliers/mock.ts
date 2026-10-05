import type { PaidOrder } from "../types";
import type { Supplier, SupplierOrderResult, SupplierOrderStatus } from "./types";

/**
 * Stands in for CJ while no API key is configured. Orders live in memory only,
 * so it is for local testing, never for real customers.
 */
export class MockSupplier implements Supplier {
  readonly name = "mock";
  readonly orders = new Map<string, { order: PaidOrder; status: SupplierOrderStatus }>();

  async createOrder(order: PaidOrder): Promise<SupplierOrderResult> {
    const existing = this.orders.get(order.orderNumber);
    if (existing) return { supplierOrderId: existing.status.supplierOrderId, alreadyExisted: true };
    const supplierOrderId = `MOCK-${order.orderNumber.slice(-8)}`;
    this.orders.set(order.orderNumber, { order, status: { supplierOrderId, status: "CREATED" } });
    return { supplierOrderId, alreadyExisted: false };
  }

  async getOrder(orderNumber: string): Promise<SupplierOrderStatus | null> {
    return this.orders.get(orderNumber)?.status ?? null;
  }

  /** Test helper: pretend the supplier shipped the order. */
  ship(orderNumber: string, trackingNumber: string) {
    const entry = this.orders.get(orderNumber);
    if (entry) entry.status = { ...entry.status, status: "SHIPPED", trackingNumber, carrier: "Mock Post" };
  }
}
