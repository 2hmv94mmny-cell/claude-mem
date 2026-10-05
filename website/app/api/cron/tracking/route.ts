import { syncTracking } from "@/lib/fulfillment";
import { sendMail } from "@/lib/mail";
import { StripeOrderStore, getStripe } from "@/lib/stripe";
import { getSupplier } from "@/lib/suppliers";

// Runs on a schedule (see vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const store = new StripeOrderStore(getStripe());
  const shopName = process.env.SHOP_NAME ?? "Client Care";

  const result = await syncTracking({
    supplier: getSupplier(),
    store,
    onShipped: async (order) => {
      const email = await store.customerEmail(order.orderNumber);
      if (!email) return;
      const link = order.trackingUrl ? `\nTrack your parcel: ${order.trackingUrl}` : "";
      await sendMail({
        to: email,
        subject: "Your order is on its way",
        text:
          `Hello,\n\nyour order has been dispatched.\n\n` +
          `Tracking number: ${order.trackingNumber}${order.carrier ? ` (${order.carrier})` : ""}${link}\n\n` +
          `Kind regards\n${shopName}`,
      });
    },
  });

  return Response.json(result);
}
