import { CartError } from "@/lib/catalog";
import { createCheckoutSession, getStripe, stripeConfigured } from "@/lib/stripe";
import type { CartLine } from "@/lib/types";

export async function POST(request: Request) {
  if (!stripeConfigured()) {
    return Response.json(
      { error: "Checkout is not available yet. Please try again later." },
      { status: 503 },
    );
  }

  let lines: CartLine[];
  try {
    const body = (await request.json()) as { lines?: CartLine[] };
    lines = body.lines ?? [];
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const origin = process.env.SITE_URL ?? new URL(request.url).origin;
    const session = await createCheckoutSession(getStripe(), lines, origin);
    return Response.json({ url: session.url });
  } catch (err) {
    if (err instanceof CartError) return Response.json({ error: err.message }, { status: 400 });
    console.error("checkout failed", err);
    return Response.json({ error: "Checkout could not be opened. Please try again." }, { status: 502 });
  }
}
