import Stripe from "stripe";
import { getProducts, priceCart, shippingCents } from "./catalog";
import { SHIPPING_COUNTRIES } from "./countries";
import type { FulfillmentRecord, OrderStore } from "./fulfillment";
import type { CartLine, FulfillmentStatus, OrderLine, PaidOrder } from "./types";

let client: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(key);
  return client;
}

export async function createCheckoutSession(stripe: Stripe, cart: CartLine[], origin: string) {
  // ALLOW_EXAMPLE_CHECKOUT=true lets you test the payment flow with Stripe test keys.
  // Such orders are held, never sent to the supplier, because example products have no CJ variant.
  const priced = priceCart(cart, getProducts(), {
    allowExamples: process.env.ALLOW_EXAMPLE_CHECKOUT === "true",
  });
  const subtotal = priced.reduce((sum, l) => sum + l.lineTotalCents, 0);
  const shipping = shippingCents(subtotal);

  return stripe.checkout.sessions.create({
    mode: "payment",
    locale: "en",
    submit_type: "pay",
    line_items: priced.map((l) => ({
      quantity: l.quantity,
      price_data: {
        currency: "chf",
        unit_amount: l.product.priceCents,
        product_data: {
          name: `${l.product.name} – ${l.product.variantLabel} ${l.variant.label}`,
          images: l.product.images.filter((src) => src.startsWith("https://")).slice(0, 1),
          metadata: {
            productId: l.product.id,
            variantId: l.variant.id,
            supplierVid: l.variant.supplierVid ?? "",
          },
        },
      },
    })),
    shipping_address_collection: { allowed_countries: SHIPPING_COUNTRIES },
    // Lets Stripe show and charge the total in the customer's local currency (enable Adaptive Pricing in the dashboard).
    adaptive_pricing: { enabled: true },
    shipping_options: [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          display_name: shipping === 0 ? "Complimentary worldwide delivery" : "Worldwide delivery",
          fixed_amount: { amount: shipping, currency: "chf" },
        },
      },
    ],
    phone_number_collection: { enabled: true },
    payment_intent_data: { metadata: { shop_order: "1" } },
    success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/bag`,
  });
}

/** Builds the supplier-facing order from a paid Checkout Session. */
export async function paidOrderFromSession(stripe: Stripe, sessionId: string): Promise<PaidOrder | null> {
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent.latest_charge"],
  });
  if (session.payment_status !== "paid") return null;

  const paymentIntent = session.payment_intent as Stripe.PaymentIntent | null;
  if (!paymentIntent) return null;
  const charge = paymentIntent.latest_charge as Stripe.Charge | null;

  const lines: OrderLine[] = [];
  for await (const item of stripe.checkout.sessions.listLineItems(sessionId, {
    expand: ["data.price.product"],
    limit: 100,
  })) {
    const product = item.price?.product as Stripe.Product | undefined;
    const meta = product?.metadata ?? {};
    lines.push({
      productId: meta.productId ?? "",
      variantId: meta.variantId ?? "",
      supplierVid: meta.supplierVid || null,
      quantity: item.quantity ?? 1,
      name: item.description ?? product?.name ?? "Item",
    });
  }

  const ship = session.collected_information?.shipping_details;
  const address = ship?.address;
  return {
    orderNumber: paymentIntent.id,
    totalCents: session.amount_total ?? 0,
    lines,
    riskLevel: charge?.outcome?.risk_level ?? undefined,
    shipping: {
      name: ship?.name ?? session.customer_details?.name ?? "",
      line1: address?.line1 ?? "",
      line2: address?.line2 ?? undefined,
      postalCode: address?.postal_code ?? "",
      city: address?.city ?? "",
      state: address?.state ?? undefined,
      country: address?.country ?? "CH",
      phone: session.customer_details?.phone ?? undefined,
      email: session.customer_details?.email ?? undefined,
    },
  };
}

const META = {
  status: "fulfillment_status",
  supplierOrderId: "supplier_order_id",
  trackingNumber: "tracking_number",
  note: "fulfillment_note",
} as const;

/** Keeps fulfillment state in the PaymentIntent's metadata, so the shop needs no database. */
export class StripeOrderStore implements OrderStore {
  constructor(private readonly stripe: Stripe) {}

  async get(orderNumber: string): Promise<FulfillmentRecord> {
    const pi = await this.stripe.paymentIntents.retrieve(orderNumber);
    return {
      status: (pi.metadata[META.status] as FulfillmentStatus) || undefined,
      supplierOrderId: pi.metadata[META.supplierOrderId] || undefined,
      trackingNumber: pi.metadata[META.trackingNumber] || undefined,
      note: pi.metadata[META.note] || undefined,
    };
  }

  async update(orderNumber: string, patch: FulfillmentRecord): Promise<void> {
    const metadata: Record<string, string> = {};
    for (const [key, field] of Object.entries(META) as [keyof FulfillmentRecord, string][]) {
      const value = patch[key];
      if (value !== undefined) metadata[field] = value;
    }
    await this.stripe.paymentIntents.update(orderNumber, { metadata });
  }

  async listSubmitted(): Promise<string[]> {
    const ids: string[] = [];
    for await (const pi of this.stripe.paymentIntents.search({
      query: `metadata['${META.status}']:'submitted'`,
      limit: 100,
    })) {
      ids.push(pi.id);
    }
    return ids;
  }

  async customerEmail(orderNumber: string): Promise<string | null> {
    const sessions = await this.stripe.checkout.sessions.list({ payment_intent: orderNumber, limit: 1 });
    return sessions.data[0]?.customer_details?.email ?? null;
  }
}
