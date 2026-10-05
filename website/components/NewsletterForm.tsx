"use client";

import { useState } from "react";
import Link from "next/link";

export function NewsletterForm() {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get("email");
    setState("sending");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Please try again.");
      setState("done");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Please try again.");
      setState("error");
    }
  }

  if (state === "done") {
    return <p role="status">Thank you. You are now on our list.</p>;
  }

  return (
    <>
      <form className="newsletter-form" onSubmit={submit}>
        <label htmlFor="newsletter-email" className="visually-hidden">
          Email address
        </label>
        <input id="newsletter-email" name="email" type="email" required placeholder="Email address" autoComplete="email" />
        <button type="submit" disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : "Subscribe"}
        </button>
      </form>
      {state === "error" && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      <p className="form-note">
        By subscribing you agree to receive our emails. You can unsubscribe at any time. See our{" "}
        <Link href="/pages/privacy">privacy policy</Link>.
      </p>
    </>
  );
}
