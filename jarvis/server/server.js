import express from "express";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY
const app = express();
app.use(express.json());

const SYSTEM = `You are JARVIS, a witty, calm, highly capable personal assistant.
Your replies are spoken aloud, so keep them short and conversational (1-3 sentences unless asked for more).
Avoid markdown, lists, and code blocks.`;

app.post("/chat", async (req, res) => {
  const { messages } = req.body; // [{ role: "user" | "assistant", content: string }]
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      system: SYSTEM,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages,
    });
    if (response.stop_reason === "refusal") {
      return res.json({ reply: "I'm afraid I can't help with that one." });
    }
    const reply = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    res.json({ reply });
  } catch (err) {
    console.error(err);
    const status = err instanceof Anthropic.APIError ? err.status ?? 500 : 500;
    res.status(status).json({ error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Jarvis server on http://localhost:${port}`));
