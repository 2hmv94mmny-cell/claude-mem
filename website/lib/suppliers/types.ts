import type { PaidOrder } from "../types";

export interface SupplierOrderResult {
  supplierOrderId: string;
  /** True when an order with this order number already existed at the supplier. */
  alreadyExisted: boolean;
}

export interface SupplierOrderStatus {
  supplierOrderId: string;
  status: string;
  trackingNumber?: string;
  trackingUrl?: string;
  carrier?: string;
}

export interface Supplier {
  name: string;
  createOrder(order: PaidOrder): Promise<SupplierOrderResult>;
  /** Looks up an order by our own order number. Returns null if the supplier has no such order. */
  getOrder(orderNumber: string): Promise<SupplierOrderStatus | null>;
}
