// All AI features go through Claude, by one of two routes:
//
// 1. Inside a claude.ai Artifact viewer: the viewer's `sample` capability,
//    which runs on the viewer's own Claude account. No API key needed.
// 2. Standalone (website / installed PWA): the official Anthropic JS SDK,
//    loaded as an ES module from a CDN, with the user's own API key. The key is
//    stored only in their browser and sent straight to api.anthropic.com. For a
//    multi-user deployment, put a small server in front of the API instead and
//    drop `dangerouslyAllowBrowser`.

import { store } from './store.js';
import { caps, disable, SEARCH_SERVER, SEARCH_TOOL } from './runtime.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm';

let sdkPromise;
function loadSDK() {
  sdkPromise ??= import(SDK_URL).then((m) => m.default);
  return sdkPromise;
}

/** True when AI features can run (viewer's Claude, or an API key). */
export function hasKey() {
  return usingViewerClaude() || Boolean(store.get().settings.apiKey);
}

/** True when running in a claude.ai viewer that lends us its Claude. */
export function usingViewerClaude() {
  return Boolean(caps.sample);
}

/** True when live web job search is possible. */
export function canSearchWeb() {
  return Boolean(caps.mcp && caps.sample) || (!caps.sample && Boolean(store.get().settings.apiKey));
}

async function client() {
  const { apiKey } = store.get().settings;
  if (!apiKey) throw new Error('Add your Anthropic API key in Settings to use AI features.');
  const Anthropic = await loadSDK();
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

/**
 * Run one Claude request and stream text back.
 * @param {object} opts
 * @param {string} opts.system
 * @param {Array} opts.messages  Anthropic.MessageParam[]
 * @param {Array} [opts.tools]
 * @param {(text: string) => void} [opts.onText] called with the accumulated text
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<string>} final text
 */
export async function ask({ system, messages, tools, onText, signal, json = false }) {
  if (usingViewerClaude()) return askViewer({ system, messages, onText, signal, json });
  const anthropic = await client();
  const { model, effort } = store.get().settings;

  const params = {
    model,
    max_tokens: 64000,
    system,
    messages,
    output_config: { effort },
    // If a safety classifier declines, let the API retry on a suitable model
    // instead of failing the request outright.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  };
  if (tools) params.tools = tools;

  let text = '';
  try {
    const stream = anthropic.beta.messages.stream(params, { signal });
    stream.on('text', (delta) => {
      text += delta;
      onText?.(text);
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') {
      throw new Error('Claude declined this request. Try rephrasing it.');
    }
    // Rebuild from the final message so we only keep the answer text
    // (web-search turns can interleave several text blocks).
    const finalText = message.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return finalText || text;
  } catch (err) {
    throw friendlyError(err, await loadSDK());
  }
}

// Run through the viewer's own Claude. There is no system prompt here, so the
// instructions lead the first user turn.
async function askViewer({ system, messages, onText, signal, json }) {
  const turns = messages.map((m) => ({ role: m.role, content: String(m.content) }));
  turns[0] = { role: 'user', content: `${system}\n\n${turns[0].content}` };
  const input = turns.length === 1 ? turns[0].content : turns;
  const opts = { cache: false, signal, onText: onText && (({ text }) => onText(text)) };
  try {
    if (json) return await caps.sample.json(input, opts);
    const { text, truncated } = await caps.sample(input, opts);
    return truncated ? `${text}\n\n*(Cut short. Try again for the rest.)*` : text;
  } catch (e) {
    throw viewerError(e);
  }
}

function viewerError(e) {
  const code = e?.code;
  if (code === 'cancelled') {
    const err = new Error('Stopped');
    err.name = 'AbortError';
    return err;
  }
  if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(code)) {
    disable('sample');
    return new Error('Claude is not allowed for this page. Allow it from the page\'s permissions, or add an API key in Settings.');
  }
  const copy = {
    rate_limited: 'You have hit a usage limit. Wait a little and try again.',
    session_expired: 'Your Claude session expired. Sign in again and retry.',
    refused: 'Claude declined this request. Try rephrasing it.',
    empty_completion: 'Claude returned nothing. Try again with less text.',
    invalid_json: 'Claude replied in an unexpected format. Try again.',
    prompt_too_large: 'That is too much text in one go. Shorten your CV or the job description.',
  };
  return new Error(copy[code] || 'Something went wrong reaching Claude. Try again.');
}

function friendlyError(err, A) {
  if (err?.name === 'AbortError') return err;
  if (A) {
    if (err instanceof A.AuthenticationError) return new Error('Your API key was rejected. Check it in Settings.');
    if (err instanceof A.PermissionDeniedError) return new Error('This API key does not have access to that model.');
    if (err instanceof A.RateLimitError) return new Error('Rate limited by the API. Wait a moment and try again.');
    if (err instanceof A.BadRequestError) return new Error(`Request rejected: ${err.message}`);
    if (err instanceof A.APIConnectionError) return new Error('Could not reach the Anthropic API. Check your connection.');
    if (err instanceof A.APIError) return new Error(`API error ${err.status ?? ''}: ${err.message}`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

/** Pull the first JSON value out of a model reply (tolerates code fences). */
export function extractJSON(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new Error('No JSON found in reply');
  const open = candidate[start];
  const close = open === '[' ? ']' : '}';
  const end = candidate.lastIndexOf(close);
  return JSON.parse(candidate.slice(start, end + 1));
}

// ---------------------------------------------------------------------------
// Prompt helpers
// ---------------------------------------------------------------------------

function profileBlock() {
  const p = store.get().profile;
  return [
    `Name: ${p.name || '(not given)'}`,
    p.location && `Location: ${p.location}`,
    p.headline && `Headline: ${p.headline}`,
    p.targetRoles && `Target roles: ${p.targetRoles}`,
    p.skills && `Key skills: ${p.skills}`,
    p.remoteOnly && 'Prefers remote-only roles',
    '',
    '<master_cv>',
    p.cv || '(The candidate has not pasted a CV yet.)',
    '</master_cv>',
  ]
    .filter((l) => l !== false && l !== undefined && l !== null)
    .join('\n');
}

function jobBlock(job) {
  return [
    '<job>',
    `Title: ${job.title}`,
    `Company: ${job.company || 'Unknown'}`,
    job.location && `Location: ${job.location}`,
    job.url && `URL: ${job.url}`,
    '',
    job.description || '(no description)',
    '</job>',
  ]
    .filter(Boolean)
    .join('\n');
}

const HONESTY =
  'Never invent employers, job titles, dates, degrees, certifications or metrics that are not in the master CV. ' +
  'You may reorder, rephrase, emphasise and quantify only what the CV supports. ' +
  'If something the job wants is missing from the CV, do not fabricate it.';

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

/** Use Claude + web search to find live openings that fit the profile. */
export async function aiFindJobs(query, { onText, signal } = {}) {
  if (usingViewerClaude()) return viewerFindJobs(query, { onText, signal });
  const text = await ask({
    system:
      'You are a job-search assistant. Use web search to find real, currently open job postings. ' +
      'Prefer direct links to the employer careers page or a reputable job board posting. ' +
      'Only include postings you actually found in search results; never make up URLs.',
    messages: [
      {
        role: 'user',
        content:
          `${profileBlock()}\n\nSearch request: ${query || 'roles that fit my profile'}\n\n` +
          'Find up to 8 relevant open positions. When done, reply with ONLY a JSON array, no prose, where each item is ' +
          '{"title": string, "company": string, "location": string, "url": string, "description": string (2-4 sentences summarising the role and requirements), "posted": string (date if known, else "")}.',
      },
    ],
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }],
    onText,
    signal,
  });
  const list = extractJSON(text);
  if (!Array.isArray(list)) throw new Error('Unexpected reply format');
  return list.filter((j) => j && j.title).map(toJob);
}

// Viewer route: search the web with the viewer's Exa connector, then have
// Claude pick out the real postings from the results.
async function viewerFindJobs(query, { onText, signal }) {
  if (!caps.mcp) throw new Error('Live web search needs the Exa connector. Add it in claude.ai Settings → Connectors, then reload.');
  const p = store.get().profile;
  const what = query || p.targetRoles || p.headline || 'jobs that fit my profile';
  onText?.('Searching the web for openings…');
  let results;
  try {
    const res = await caps.mcp.callTool(
      SEARCH_SERVER,
      SEARCH_TOOL,
      {
        query: `currently open job posting for ${what}`,
        objective: `Find open job postings (employer careers pages or job boards) for: ${what}. Rank direct postings first; exclude articles, salary guides and listicles. Pull job title, company, location, salary and key requirements.`,
        numResults: 15,
      },
      { signal },
    );
    results = typeof res.payload === 'string' ? res.payload : JSON.stringify(res.payload ?? res.content);
  } catch (e) {
    throw mcpError(e);
  }
  onText?.('Reading the postings…');
  const list = await ask({
    system:
      'You extract job postings from web search results. Only include real, specific open positions that appear in the results, ' +
      'with the URL exactly as given. Skip articles, salary guides, lists of companies and expired postings.',
    messages: [
      {
        role: 'user',
        content:
          `Search request: ${what}\n\n<search_results>\n${results.slice(0, 60000)}\n</search_results>\n\n` +
          'Reply with only a JSON array (best matches first, max 10) where each item is ' +
          '{"title": string, "company": string, "location": string, "url": string, "salary": string, "description": string (2-4 sentences: the role and key requirements), "posted": string}.',
      },
    ],
    json: true,
    signal,
  });
  if (!Array.isArray(list)) throw new Error('Claude replied in an unexpected format. Try again.');
  return list.filter((j) => j && j.title).map(toJob);
}

function mcpError(e) {
  if (e?.code === 'cancelled') {
    const err = new Error('Stopped');
    err.name = 'AbortError';
    return err;
  }
  const copy = {
    server_not_connected: 'Add the Exa connector in claude.ai Settings → Connectors to search live jobs.',
    selection_required: 'Choose which Exa connector to use when claude.ai asks, then search again.',
    needs_reauth: 'Reconnect Exa in claude.ai Settings → Connectors, then search again.',
    not_in_manifest: 'Web search is turned off for this page. Allow Exa in the page\'s permissions to search live jobs.',
    blocked_by_policy: 'Your organization blocks web search here.',
    server_unavailable: 'The search service did not answer. Try again in a moment.',
    tool_error: `Search failed: ${e?.message || 'unknown error'}`,
  };
  return new Error(copy[e?.code] || 'Web search is not available right now. Try again later.');
}

function toJob(j) {
  return {
    id: 'ai:' + hash(`${j.company}|${j.title}|${j.url}`),
    source: 'Web search',
    title: String(j.title),
    company: String(j.company || ''),
    location: String(j.location || ''),
    remote: /remote|anywhere/i.test(String(j.location || '')),
    url: String(j.url || ''),
    salary: String(j.salary || ''),
    description: String(j.description || ''),
    posted: String(j.posted || ''),
    tags: [],
  };
}

/** Score how well the candidate fits a set of jobs. Returns {id: {score, reason}}. */
export async function scoreJobs(jobs, { signal } = {}) {
  const list = jobs
    .slice(0, 15)
    .map((j, i) => `[${i}] ${j.title} at ${j.company} (${j.location || 'n/a'})\n${(j.description || '').slice(0, 700)}`)
    .join('\n\n');
  const reply = await ask({
    json: true,
    system:
      'You are a pragmatic recruiter. Score how well a candidate fits each job from 0-100, ' +
      'based on skills, seniority, domain and location fit. Be honest; most jobs are not a great fit.',
    messages: [
      {
        role: 'user',
        content:
          `${profileBlock()}\n\n<jobs>\n${list}\n</jobs>\n\n` +
          'Reply with ONLY a JSON array of {"index": number, "score": number, "reason": string (max 20 words)}.',
      },
    ],
    signal,
  });
  const rows = typeof reply === 'string' ? extractJSON(reply) : reply;
  const out = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const job = jobs[row.index];
    if (job) out[job.id] = { score: Math.round(row.score), reason: row.reason };
  }
  return out;
}

export function tailorCV(job, opts) {
  return ask({
    system:
      'You are an expert CV writer who tailors CVs to specific job postings and optimises them for applicant tracking systems. ' +
      HONESTY,
    messages: [
      {
        role: 'user',
        content:
          `${profileBlock()}\n\n${jobBlock(job)}\n\n` +
          'Rewrite the master CV tailored to this job. Mirror the posting\'s key terms where the CV genuinely supports them, ' +
          'lead with the most relevant experience, and keep it to roughly one to two pages. ' +
          'Use clean Markdown (# name, ## sections, bullet points). Output only the CV.',
      },
    ],
    ...opts,
  });
}

export function writeCoverLetter(job, { tone = 'professional', ...opts } = {}) {
  return ask({
    system: 'You write concise, specific cover letters that sound like a real person, not a template. ' + HONESTY,
    messages: [
      {
        role: 'user',
        content:
          `${profileBlock()}\n\n${jobBlock(job)}\n\n` +
          `Write a ${tone} cover letter for this job, 250-350 words. Open with why this specific role and company, ` +
          'connect two or three concrete achievements from the CV to the job\'s needs, and close with a clear call to action. ' +
          'No placeholders like [Company] — use the real details, or omit what is unknown. Output only the letter.',
      },
    ],
    ...opts,
  });
}

export function analyzeGap(job, opts) {
  return ask({
    system: 'You are a candid career coach.',
    messages: [
      {
        role: 'user',
        content:
          `${profileBlock()}\n\n${jobBlock(job)}\n\n` +
          'Give a short fit analysis in Markdown with these sections: ' +
          '## Match score (0-100 with one-line verdict), ## Strengths, ## Gaps, ## Keywords to include, ## How to close the gaps. Keep it tight.',
      },
    ],
    ...opts,
  });
}

export function interviewQuestions(job, opts) {
  return ask({
    system: 'You are an experienced hiring manager and interview coach.',
    messages: [
      {
        role: 'user',
        content:
          `${profileBlock()}\n\n${jobBlock(job)}\n\n` +
          'Prepare this candidate for interviews for this role. In Markdown, give:\n' +
          '## Likely questions — 10 questions mixing behavioural, technical/role-specific and motivation questions, each followed by a 2-3 line suggested answer outline in STAR form drawn from the CV.\n' +
          '## Questions to ask them — 5 sharp questions.\n' +
          '## Research checklist — what to look up about the company before the interview.',
      },
    ],
    ...opts,
  });
}

/** One turn of a mock interview. `chat` is the full history so far. */
export function mockInterviewTurn(job, chat, opts) {
  return ask({
    system:
      'You are conducting a realistic mock interview for the job below. Ask one question at a time. ' +
      'After the candidate answers, give brief, specific feedback (what worked, what to improve, a stronger phrasing) ' +
      'and then ask the next question. After about 6 questions, wrap up with an overall assessment and 3 things to practise.\n\n' +
      profileBlock() +
      '\n\n' +
      jobBlock(job),
    messages: chat.length ? chat : [{ role: 'user', content: "I'm ready. Please start the interview." }],
    ...opts,
  });
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
