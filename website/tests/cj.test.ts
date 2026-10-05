import { describe, expect, it } from "vitest";
import { CjApiError, CjSupplier, cjConfigFromEnv } from "../lib/suppliers/cj";
import type { PaidOrder } from "../lib/types";

type Call = { url: URL; method: string; headers: Record<string, string>; body: unknown };

function fakeCj(handlers: Record<string, (call: Call) => unknown>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: URL, init: RequestInit) => {
    const call: Call = {
      url: input,
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    };
    calls.push(call);
    const path = input.pathname.replace("/api2.0/v1", "");
    const handler = handlers[path];
    if (!handler) throw new Error(`unexpected call ${path}`);
    return new Response(JSON.stringify(handler(call)), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const ok = (data: unknown) => ({ code: 200, result: true, message: "Success", data });

const order: PaidOrder = {
  orderNumber: "pi_abc",
  totalCents: 5990,
  lines: [{ productId: "p", variantId: "v", supplierVid: "VID-1", quantity: 2, name: "Loafer" }],
  shipping: {
    name: "Mia Muster",
    line1: "Musterstraße 1",
    postalCode: "10115",
    city: "Berlin",
    country: "DE",
    phone: "+491701234567",
    email: "mia@example.com",
  },
};

describe("CjSupplier", () => {
  it("authenticates with the API key, picks the cheapest carrier and creates the order", async () => {
    const { calls, fetchImpl } = fakeCj({
      "/authentication/getAccessToken": () => ok({ accessToken: "TOKEN" }),
      "/shopping/order/getOrderDetail": () => ({ code: 1600100, result: false, message: "not found", data: null }),
      "/logistic/freightCalculate": () =>
        ok([
          { logisticName: "Expensive", logisticPrice: 12.5, logisticAging: "3-5" },
          { logisticName: "CJPacket", logisticPrice: 4.2, logisticAging: "8-12" },
        ]),
      "/shopping/order/createOrderV2": () => ok({ orderId: "CJ-999" }),
    });
    const cj = new CjSupplier({ apiKey: "KEY", payType: 3, sandbox: true, fromCountryCode: "CN", fetch: fetchImpl });

    const result = await cj.createOrder(order);

    expect(result).toEqual({ supplierOrderId: "CJ-999", alreadyExisted: false });
    expect(calls[0].body).toEqual({ apiKey: "KEY" });
    const create = calls.find((c) => c.url.pathname.endsWith("createOrderV2"))!;
    expect(create.headers["CJ-Access-Token"]).toBe("TOKEN");
    expect(create.body).toMatchObject({
      orderNumber: "pi_abc",
      logisticName: "CJPacket",
      shippingProvince: "Berlin",
      shippingCountryCode: "DE",
      payType: 3,
      isSandbox: 1,
      products: [{ vid: "VID-1", quantity: 2, storeLineItemId: "pi_abc-1" }],
    });
    // Token is fetched once and reused.
    expect(calls.filter((c) => c.url.pathname.endsWith("getAccessToken"))).toHaveLength(1);
  });

  it("does not create a duplicate when CJ already has the order number", async () => {
    const { calls, fetchImpl } = fakeCj({
      "/authentication/getAccessToken": () => ok({ accessToken: "TOKEN" }),
      "/shopping/order/getOrderDetail": () => ok({ cjOrderId: "CJ-1", orderStatus: "UNSHIPPED" }),
    });
    const cj = new CjSupplier({ apiKey: "KEY", payType: 3, sandbox: false, fromCountryCode: "CN", fetch: fetchImpl });
    expect(await cj.createOrder(order)).toEqual({ supplierOrderId: "CJ-1", alreadyExisted: true });
    expect(calls.some((c) => c.url.pathname.endsWith("createOrderV2"))).toBe(false);
  });

  it("surfaces CJ errors", async () => {
    const { fetchImpl } = fakeCj({
      "/authentication/getAccessToken": () => ({ code: 1601000, result: false, message: "User not find", data: null }),
    });
    const cj = new CjSupplier({ apiKey: "BAD", payType: 3, sandbox: false, fromCountryCode: "CN", fetch: fetchImpl });
    await expect(cj.getOrder("pi_abc")).rejects.toBeInstanceOf(CjApiError);
  });

  it("reads tracking details", async () => {
    const { fetchImpl } = fakeCj({
      "/authentication/getAccessToken": () => ok({ accessToken: "TOKEN" }),
      "/shopping/order/getOrderDetail": () =>
        ok({ cjOrderId: "CJ-1", orderStatus: "SHIPPED", trackNumber: "LX1", logisticName: "PostNL" }),
    });
    const cj = new CjSupplier({ apiKey: "KEY", payType: 3, sandbox: false, fromCountryCode: "CN", fetch: fetchImpl });
    expect(await cj.getOrder("pi_abc")).toMatchObject({ trackingNumber: "LX1", carrier: "PostNL" });
  });

  it("reads settings from the environment", () => {
    expect(cjConfigFromEnv({})).toBeNull();
    expect(cjConfigFromEnv({ CJ_API_KEY: "k", CJ_AUTO_PAY: "true" })).toMatchObject({ payType: 2, fromCountryCode: "CN" });
    expect(cjConfigFromEnv({ CJ_API_KEY: "k" })).toMatchObject({ payType: 3, sandbox: false });
  });
});
