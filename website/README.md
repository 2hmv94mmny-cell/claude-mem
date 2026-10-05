# Maison Elva – fashion dropshipping shop

Next.js shop for women's clothing, bags and shoes. Customers pay with Stripe; paid orders are
sent to CJdropshipping automatically, and customers get their tracking number by email.

## How an order flows

1. The customer pays on Stripe Checkout (`/api/checkout`). Prices always come from `data/products.json`, never from the browser.
2. Stripe calls `/api/stripe/webhook`. The order is sent to CJ with the Stripe payment id as order number,
   so a repeated webhook never creates a second CJ order.
3. Orders are **held** for you instead of being sent when a product has no CJ variant, the total is above
   `HOLD_ORDERS_ABOVE_CENTS`, or Stripe rates the payment as risky. You get an email (`ADMIN_EMAIL`).
4. Once a day, `/api/cron/tracking` asks CJ for tracking numbers and emails them to customers.

Order state is stored in the Stripe payment's metadata (`fulfillment_status`, `supplier_order_id`,
`tracking_number`), so there is no database. In the Stripe dashboard you can see each order's state.

## Setup

```bash
cd website
npm install
cp .env.example .env.local   # fill in keys
npm run dev                  # http://localhost:3000
npm test                     # unit tests
```

### CJdropshipping
1. In CJ: **Apps → Install App → API**, then in your personal center open the **API** tab → **Add API** → type **API Key**.
2. Set `CJ_API_KEY`. Keep `CJ_SANDBOX=true` and `CJ_AUTO_PAY=false` for the first tests.

### Importing products
```bash
CJ_API_KEY=... npm run cj:import -- --keyword "women loafers" --category schuhe --limit 5
```
Imported products are saved with `"published": false`. Translate the name, write a German description,
fill in `details` (material, sizes, measurements), rename the variant labels, then set `"published": true`.
Remove the example products (`"example": true`) before going live.

### Stripe
1. Use test keys first. Add a webhook endpoint `https://<your-domain>/api/stripe/webhook` for
   `checkout.session.completed` and `checkout.session.async_payment_succeeded`, and copy its signing secret.
2. Enable the payment methods you want (cards, PayPal, Klarna, Apple Pay) in the Stripe dashboard.

### Deploy on Vercel
Import the repository, select the `website` branch, set **Root Directory** to `website`, add the
environment variables, and deploy. `vercel.json` schedules the daily tracking job.

## Before going live (Germany)
- Replace the placeholder texts in `content.ts` → `legalPages` (Impressum, Datenschutz, AGB, Widerruf).
- Register a business (Gewerbe), the packaging register (LUCID), and check GPSR product safety
  information for every product.
- Run one real test order end to end with `CJ_SANDBOX=false` before advertising.
