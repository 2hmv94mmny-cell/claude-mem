import { fulfillOrder } from "@/lib/fulfillment";
import { notifyOwner } from "@/lib/mail";
import { StripeOrderStore, getStripe, paidOrderFromSession } from "@/lib/stripe";
import { getSupplier } from "@/lib/suppliers";

// Stripe calls this after every payment. Configure the endpoint in the Stripe dashboard for
// checkout.session.completed and checkout.session.async_payment_succeeded.
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return new Response("Webhook not configured", { status: 400 });

  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return new Response("ignored", { status: 200 });
  }

  const order = await paidOrderFromSession(stripe, event.data.object.id);
  // Not paid yet (e.g. bank transfer pending): async_payment_succeeded will follow.
  if (!order) return new Response("not paid yet", { status: 200 });

  const result = await fulfillOrder(order, {
    supplier: getSupplier(),
    store: new StripeOrderStore(stripe),
    rules: { holdAboveCents: Number(process.env.HOLD_ORDERS_ABOVE_CENTS ?? 30000) },
  });

  if (result.outcome === "held") {
    await notifyOwner(
      `Order ${order.orderNumber} is waiting for review`,
      `Reason: ${result.reason}\n\nFind all details in the Stripe dashboard under Payments → ${order.orderNumber}.`,
    );
  }
  if (result.outcome === "failed") {
    await notifyOwner(
      `Order ${order.orderNumber} could not be sent to the supplier`,
      `Error: ${result.error}\n\nStripe will retry automatically.`,
    );
    // A non-2xx response makes Stripe retry the webhook later.
    return new Response("supplier order failed", { status: 500 });
  }

  return Response.json({ outcome: result.outcome });
}
