import { notifyOwner } from "@/lib/mail";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Newsletter sign-ups are forwarded to the owner by email (ADMIN_EMAIL).
// Connect a newsletter tool (e.g. Mailchimp, Brevo) here once one is chosen.
export async function POST(request: Request) {
  let email = "";
  try {
    email = String(((await request.json()) as { email?: unknown }).email ?? "").trim();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!EMAIL.test(email) || email.length > 254) {
    return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  await notifyOwner("New newsletter subscriber", `${email} subscribed on ${new Date().toISOString()}.`);
  return Response.json({ ok: true });
}
