// All AI features go through Claude via the official Anthropic TypeScript/JS SDK,
// loaded as an ES module from a CDN so the app needs no build step.
//
// The user's API key is stored only in their own browser and sent straight to
// api.anthropic.com. For a multi-user deployment, put a small server in front
// of the API instead and drop `dangerouslyAllowBrowser`.

import { store } from './store.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm';

let sdkPromise;
function loadSDK() {
  sdkPromise ??= import(SDK_URL).then((m) => m.default);
  return sdkPromise;
}

export function hasKey() {
  return Boolean(store.get().settings.apiKey);
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
export async function ask({ system, messages, tools, onText, signal }) {
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
  return list
    .filter((j) => j && j.title)
    .map((j) => ({
      id: 'ai:' + hash(`${j.company}|${j.title}|${j.url}`),
      source: 'AI web search',
      title: String(j.title),
      company: String(j.company || ''),
      location: String(j.location || ''),
      url: String(j.url || ''),
      description: String(j.description || ''),
      posted: String(j.posted || ''),
      tags: [],
    }));
}

/** Score how well the candidate fits a set of jobs. Returns {id: {score, reason}}. */
export async function scoreJobs(jobs, { signal } = {}) {
  const list = jobs
    .slice(0, 15)
    .map((j, i) => `[${i}] ${j.title} at ${j.company} (${j.location || 'n/a'})\n${(j.description || '').slice(0, 700)}`)
    .join('\n\n');
  const text = await ask({
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
  const out = {};
  for (const row of extractJSON(text)) {
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
