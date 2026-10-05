import type { PaidOrder } from "../types";
import type { Supplier, SupplierOrderResult, SupplierOrderStatus } from "./types";

// CJdropshipping API 2.0: https://developers.cjdropshipping.com/en/api/api2/
const BASE_URL = "https://developers.cjdropshipping.com/api2.0/v1";

export interface CjConfig {
  apiKey: string;
  /** 2 = pay from CJ balance automatically, 3 = create the order only and pay it in the CJ dashboard. */
  payType: 2 | 3;
  sandbox: boolean;
  fromCountryCode: string;
  /** Fixed carrier name. When empty, the cheapest option from CJ's freight calculator is used. */
  logisticName?: string;
  fetch?: typeof fetch;
}

interface CjResponse<T> {
  code: number;
  result: boolean;
  message: string;
  data: T;
  requestId?: string;
}

export class CjApiError extends Error {
  constructor(
    readonly path: string,
    readonly code: number,
    message: string,
    readonly requestId?: string,
  ) {
    super(`CJ ${path} failed (${code}): ${message}`);
  }
}

export function cjConfigFromEnv(env: Record<string, string | undefined> = process.env): CjConfig | null {
  const apiKey = env.CJ_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    payType: env.CJ_AUTO_PAY === "true" ? 2 : 3,
    sandbox: env.CJ_SANDBOX === "true",
    fromCountryCode: env.CJ_FROM_COUNTRY?.trim() || "CN",
    logisticName: env.CJ_LOGISTIC_NAME?.trim() || undefined,
  };
}

export class CjSupplier implements Supplier {
  readonly name = "cj";
  private accessToken: string | null = null;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: CjConfig) {
    this.fetchImpl = config.fetch ?? fetch;
  }

  private async token(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    // CJ returns the same cached token for 24 hours and allows one token call per second.
    const data = await this.call<{ accessToken: string }>(
      "/authentication/getAccessToken",
      { method: "POST", body: { apiKey: this.config.apiKey } },
      false,
    );
    this.accessToken = data.accessToken;
    return data.accessToken;
  }

  private async call<T>(
    path: string,
    init: { method: "GET" | "POST"; body?: unknown; query?: Record<string, string> },
    authenticated = true,
  ): Promise<T> {
    const response = await this.request<T>(path, init, authenticated);
    if (!response.result || response.code !== 200) {
      throw new CjApiError(path, response.code, response.message, response.requestId);
    }
    return response.data;
  }

  private async request<T>(
    path: string,
    init: { method: "GET" | "POST"; body?: unknown; query?: Record<string, string> },
    authenticated = true,
  ): Promise<CjResponse<T>> {
    const url = new URL(BASE_URL + path);
    for (const [key, value] of Object.entries(init.query ?? {})) url.searchParams.set(key, value);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authenticated) headers["CJ-Access-Token"] = await this.token();

    const res = await this.fetchImpl(url, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!res.ok) throw new CjApiError(path, res.status, `HTTP ${res.status}`);
    return (await res.json()) as CjResponse<T>;
  }

  async getOrder(orderNumber: string): Promise<SupplierOrderStatus | null> {
    // getOrderDetail accepts our own order number as orderId.
    const response = await this.request<{
      orderId?: string;
      cjOrderId?: string;
      orderStatus?: string;
      trackNumber?: string;
      trackingUrl?: string;
      logisticName?: string;
    } | null>("/shopping/order/getOrderDetail", { method: "GET", query: { orderId: orderNumber } });

    if (!response.result || !response.data) return null;
    const d = response.data;
    return {
      supplierOrderId: d.cjOrderId || d.orderId || orderNumber,
      status: d.orderStatus ?? "UNKNOWN",
      trackingNumber: d.trackNumber || undefined,
      trackingUrl: d.trackingUrl || undefined,
      carrier: d.logisticName || undefined,
    };
  }

  async cheapestLogistic(order: PaidOrder): Promise<string> {
    const options = await this.call<{ logisticName: string; logisticPrice: number; logisticAging: string }[]>(
      "/logistic/freightCalculate",
      {
        method: "POST",
        body: {
          startCountryCode: this.config.fromCountryCode,
          endCountryCode: order.shipping.country,
          zip: order.shipping.postalCode,
          products: order.lines.map((l) => ({ vid: l.supplierVid, quantity: l.quantity })),
        },
      },
    );
    if (!options.length) {
      throw new CjApiError("/logistic/freightCalculate", 0, `no carrier ships to ${order.shipping.country}`);
    }
    return [...options].sort((a, b) => a.logisticPrice - b.logisticPrice)[0].logisticName;
  }

  async createOrder(order: PaidOrder): Promise<SupplierOrderResult> {
    const existing = await this.getOrder(order.orderNumber);
    if (existing) return { supplierOrderId: existing.supplierOrderId, alreadyExisted: true };

    const missing = order.lines.filter((l) => !l.supplierVid);
    if (missing.length) {
      throw new Error(`Products without a CJ variant id: ${missing.map((l) => l.name).join(", ")}`);
    }

    const logisticName = this.config.logisticName ?? (await this.cheapestLogistic(order));
    const s = order.shipping;
    const data = await this.call<{ orderId: string }>("/shopping/order/createOrderV2", {
      method: "POST",
      body: {
        orderNumber: order.orderNumber,
        shippingCustomerName: s.name,
        shippingAddress: s.line1,
        shippingAddress2: s.line2 ?? "",
        shippingZip: s.postalCode,
        shippingCity: s.city,
        // CJ requires a province; German addresses usually have none, so fall back to the city.
        shippingProvince: s.state || s.city,
        shippingCountryCode: s.country,
        shippingCountry: s.country,
        shippingPhone: s.phone ?? "",
        email: s.email ?? "",
        logisticName,
        fromCountryCode: this.config.fromCountryCode,
        payType: this.config.payType,
        isSandbox: this.config.sandbox ? 1 : 0,
        products: order.lines.map((l, i) => ({
          vid: l.supplierVid,
          quantity: l.quantity,
          storeLineItemId: `${order.orderNumber}-${i + 1}`,
        })),
      },
    });
    return { supplierOrderId: data.orderId || order.orderNumber, alreadyExisted: false };
  }

  // Used by the product import script.
  async searchProducts(params: { keyWord: string; size: number; countryCode?: string }) {
    const query: Record<string, string> = { keyWord: params.keyWord, size: String(params.size), page: "1" };
    if (params.countryCode) query.countryCode = params.countryCode;
    const data = await this.call<{
      content: { productList: { id: string; nameEn: string; sellPrice: string; bigImage: string }[] }[];
    }>("/product/listV2", { method: "GET", query });
    return data.content.flatMap((c) => c.productList);
  }

  async getProduct(pid: string) {
    return this.call<{
      pid: string;
      productNameEn: string;
      productImageSet: string[];
      bigImage: string;
      description: string;
      variants: { vid: string; variantSku: string; variantKey: string; variantSellPrice: number }[];
    }>("/product/query", { method: "GET", query: { pid } });
  }
}
