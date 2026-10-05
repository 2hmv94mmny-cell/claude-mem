// Sends email through Resend (https://resend.com) when RESEND_API_KEY and MAIL_FROM are set.
// Without them, messages are only logged, so the shop still works during development.

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export async function sendMail(mail: Mail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey || !from) {
    console.log(`[mail not configured] to=${mail.to} subject=${mail.subject}\n${mail.text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: mail.to, subject: mail.subject, text: mail.text }),
  });
  if (!res.ok) throw new Error(`Resend failed with HTTP ${res.status}: ${await res.text()}`);
}

/** Tells the shop owner about orders that need a person (held or failed). */
export async function notifyOwner(subject: string, text: string): Promise<void> {
  const to = process.env.ADMIN_EMAIL;
  if (!to) {
    console.warn(`[owner alert] ${subject}\n${text}`);
    return;
  }
  await sendMail({ to, subject, text });
}
