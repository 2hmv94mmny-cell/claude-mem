// Other AI providers besides Claude: the user's own API key for ChatGPT
// (OpenAI), Gemini (Google), DeepSeek or Grok (xAI).
//
// None of these companies offer "sign in with your ChatGPT/Gemini/... account"
// to other websites; what they offer is a personal API key, billed by use on
// the user's own account with that company. The key is stored only in this
// browser (never synced, never in backups) and sent only to that provider.

export const PROVIDERS = [
  {
    id: 'openai',
    name: 'ChatGPT',
    company: 'OpenAI',
    kind: 'openai',
    base: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'sk-…',
    model: 'gpt-5',
    quickModel: 'gpt-5-mini',
    vision: true,
  },
  {
    id: 'gemini',
    name: 'Gemini',
    company: 'Google',
    kind: 'gemini',
    base: 'https://generativelanguage.googleapis.com/v1beta',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyHint: 'AIza…',
    model: 'gemini-2.5-pro',
    quickModel: 'gemini-2.5-flash',
    vision: true,
    webSearch: true, // Google Search grounding
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    company: 'DeepSeek',
    kind: 'openai',
    base: 'https://api.deepseek.com',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    keyHint: 'sk-…',
    model: 'deepseek-chat',
    quickModel: 'deepseek-chat',
    vision: false,
  },
  {
    id: 'grok',
    name: 'Grok',
    company: 'xAI',
    kind: 'openai',
    base: 'https://api.x.ai/v1',
    keyUrl: 'https://console.x.ai',
    keyHint: 'xai-…',
    model: 'grok-4',
    quickModel: 'grok-3-mini',
    vision: true,
  },
];

export const providerById = (id) => PROVIDERS.find((p) => p.id === id) || null;

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('Could not read the image.'));
    r.readAsDataURL(blob);
  });
}
const imageType = (blob) => (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(blob.type) ? blob.type : 'image/jpeg');

/** Read a server-sent-events stream, calling onData with each parsed JSON payload. */
async function readSSE(res, onData) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        onData(JSON.parse(data));
      } catch {}
    }
  }
}

async function failure(p, res) {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message || body?.message || '';
  } catch {}
  if (res.status === 401 || res.status === 403) return new Error(`Your ${p.name} API key was rejected. Check it in Settings.${detail ? ` (${detail})` : ''}`);
  if (res.status === 402) return new Error(`Your ${p.company} account has no credit left. Top it up on their site, then try again.`);
  if (res.status === 404) return new Error(`${p.name} does not know the model set in Settings. Change it there and try again.${detail ? ` (${detail})` : ''}`);
  if (res.status === 429) return new Error(`${p.name} rate limit reached. Wait a moment and try again.`);
  return new Error(`${p.name} error ${res.status}${detail ? `: ${detail}` : ''}`);
}

/**
 * One request to another provider. Same contract as ask() in ai.js.
 * @returns {Promise<string>} the reply text
 */
export async function askProvider(p, { key, model, system, messages, onText, signal, json, images = [], webSearch = false }) {
  if (images.length && !p.vision) throw new Error(`${p.name} cannot read images. Upload your CV as a PDF, Word or text file, or switch provider in Settings.`);
  if (webSearch && !p.webSearch) {
    const err = new Error(`${p.name} cannot search the web from here.`);
    err.code = 'no_web_search';
    throw err;
  }
  const sys = json ? `${system}\n\nReply with valid JSON only, no other text.` : system;
  let text = '';
  const push = (delta) => {
    if (!delta) return;
    text += delta;
    onText?.(text);
  };

  let res;
  try {
    if (p.kind === 'gemini') {
      const contents = await Promise.all(
        messages.map(async (m, i) => {
          const parts = [{ text: String(m.content) }];
          if (i === messages.length - 1 && images.length) {
            for (const b of images) parts.unshift({ inlineData: { mimeType: imageType(b), data: await blobToBase64(b) } });
          }
          return { role: m.role === 'assistant' ? 'model' : 'user', parts };
        }),
      );
      const body = { systemInstruction: { parts: [{ text: sys }] }, contents, generationConfig: {} };
      if (webSearch) body.tools = [{ google_search: {} }];
      else if (json) body.generationConfig.responseMimeType = 'application/json';
      res = await fetch(`${p.base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok) throw await failure(p, res);
      await readSSE(res, (d) => push((d.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('')));
    } else {
      const msgs = [{ role: 'system', content: sys }, ...messages.map((m) => ({ role: m.role, content: String(m.content) }))];
      if (images.length) {
        const last = msgs[msgs.length - 1];
        const pics = await Promise.all(images.map(async (b) => ({ type: 'image_url', image_url: { url: `data:${imageType(b)};base64,${await blobToBase64(b)}` } })));
        msgs[msgs.length - 1] = { role: 'user', content: [...pics, { type: 'text', text: String(last.content) }] };
      }
      res = await fetch(`${p.base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages: msgs, stream: true }),
        signal,
      });
      if (!res.ok) throw await failure(p, res);
      await readSSE(res, (d) => push(d.choices?.[0]?.delta?.content || ''));
    }
  } catch (err) {
    if (err?.name === 'AbortError' || err?.code === 'no_web_search' || /API key|credit|rate limit|model|error \d/.test(err?.message || '')) throw err;
    // fetch itself failed: offline, or the provider blocks calls from this page.
    throw new Error(`Could not reach ${p.name} from this page. Check your connection. Inside the Claude app other providers can be blocked; they work on the website version.`);
  }
  if (!text.trim()) throw new Error(`${p.name} returned nothing. Try again.`);
  return text;
}
