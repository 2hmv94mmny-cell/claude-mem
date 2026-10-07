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
import { portalsFor, portalForUrl } from './portals.js';
import { normalizeCV } from './cvdoc.js';
import { HUMAN_STYLE, cleanCV, cleanText } from './style.js';
import { currentLanguage, languageName } from './i18n.js';
import { providerById, askProvider } from './providers.js';
import { searchJobs } from './jobs.js';
import { postedAt, portalQueries, RESULTS_PER_SEARCH, parseSearchResults, sameJob, readProfile, scoreJob } from './match.js';

// Every task runs with the same senior HR persona and quality bar, whichever
// AI does the work (Claude, ChatGPT, Gemini, DeepSeek or Grok).
const SENIOR_HR =
  'You are a senior HR professional and hiring manager with more than 15 years of recruiting experience across Europe and ' +
  'international companies. You have screened thousands of CVs, run hundreds of interviews and decided who gets hired. ' +
  'You know what hiring managers look for in the first 30 seconds, how applicant tracking systems read documents, and what ' +
  'makes a candidate stand out or get rejected. In this app you work for the candidate: you use that insider view to help ' +
  'them land the job. Your standard is the work of a top recruiter at a leading company: specific to this person and this ' +
  'role, honest even when it is uncomfortable, concrete instead of generic, and accurate. Never invent facts. Before you ' +
  'answer, check your work against the instructions and fix anything that falls short. Follow the requested output format exactly.';

/** The provider the user chose in Settings, if it is not Claude and has a key. */
export function activeProvider() {
  const s = store.get().settings;
  if (!s.provider || s.provider === 'claude') return null;
  const p = providerById(s.provider);
  return p && s.keys?.[p.id] ? p : null;
}
/** Short name of the AI doing the work, for messages. */
export function aiName() {
  return activeProvider()?.name || 'Claude';
}

/** Coaching replies follow the interface language the user picked. */
function uiLanguage(extra = '') {
  return currentLanguage() === 'en' ? '' : ` Write everything meant for the user in ${languageName()}${extra}.`;
}

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm';

let sdkPromise;
function loadSDK() {
  sdkPromise ??= import(SDK_URL).then((m) => m.default);
  return sdkPromise;
}

/** True when AI features can run (viewer's Claude, or an API key). */
export function hasKey() {
  return Boolean(activeProvider()) || usingViewerClaude() || Boolean(store.get().settings.apiKey);
}

/** True when running in a claude.ai viewer that lends us its Claude. */
export function usingViewerClaude() {
  return Boolean(caps.sample);
}

/** True when live web job search is possible. */
export function canSearchWeb() {
  const p = activeProvider();
  if (caps.mcp && (caps.sample || p)) return true;
  if (p) return Boolean(p.webSearch);
  return !caps.sample && Boolean(store.get().settings.apiKey);
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
export async function ask({ system, messages, tools, onText, signal, json = false, images = [], quick = false }) {
  system = `${SENIOR_HR}\n\n${system}`;
  const prov = activeProvider();
  if (prov) {
    const s = store.get().settings;
    const model = (quick ? s.models?.[`${prov.id}Quick`] : s.models?.[prov.id]) || (quick ? prov.quickModel : prov.model);
    const webSearch = Boolean(tools?.some((t) => t.name === 'web_search'));
    const text = await askProvider(prov, { key: s.keys[prov.id], model, system, messages, onText, signal, json, images, webSearch });
    try {
      return json ? extractJSON(text) : text;
    } catch {
      throw new Error(`${prov.name} replied in an unexpected format. Try again.`);
    }
  }
  if (usingViewerClaude()) return askViewer({ system, messages, onText, signal, json, images, quick });
  const anthropic = await client();
  const { model, effort } = store.get().settings;

  if (images.length) {
    // Attach images (a photographed or scanned CV) to the last user turn.
    const blocks = await Promise.all(images.map(imageBlock));
    const last = messages[messages.length - 1];
    messages = [...messages.slice(0, -1), { role: 'user', content: [...blocks, { type: 'text', text: String(last.content) }] }];
  }

  const params = {
    model,
    max_tokens: 64000,
    system,
    messages,
    output_config: { effort: quick ? 'low' : effort },
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
    const out = finalText || text;
    return json ? extractJSON(out) : out;
  } catch (err) {
    if (err instanceof SyntaxError || /No JSON found/.test(err?.message)) throw new Error('Claude replied in an unexpected format. Try again.');
    throw friendlyError(err, await loadSDK());
  }
}

async function imageBlock(blob) {
  const type = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(blob.type) ? blob.type : 'image/jpeg';
  const data = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('Could not read the image.'));
    r.readAsDataURL(blob);
  });
  return { type: 'image', source: { type: 'base64', media_type: type, data } };
}

// Run through the viewer's own Claude. There is no system prompt here, so the
// instructions lead the first user turn.
async function askViewer({ system, messages, onText, signal, json, images, quick }) {
  const turns = messages.map((m) => ({ role: m.role, content: String(m.content) }));
  turns[0] = { role: 'user', content: `${system}\n\n${turns[0].content}` };
  const input = turns.length === 1 ? turns[0].content : turns;
  const opts = { cache: false, signal, onText: onText && (({ text }) => onText(text)) };
  if (quick) opts.modelTier = 'quick';
  if (images?.length) {
    const limits = await caps.sample.limits().catch(() => null);
    if (!limits?.images) throw new Error('Reading images is not available here. Upload your CV as a PDF, Word or text file instead.');
    opts.images = images.slice(0, limits.images.maxCount);
  }
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
    image_rejected: 'That image could not be read. Try a clearer photo, or upload a PDF or Word file.',
    images_unavailable: 'Reading images is not available here. Upload your CV as a PDF, Word or text file instead.',
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
  const pr = p.prefs || {};
  const links = [p.linkedin, p.portfolio, p.github].filter(Boolean);
  const salary = pr.salaryMin ? `${Number(pr.salaryMin).toLocaleString('en')} ${pr.currency || ''} per ${pr.salaryPeriod || 'year'}` : '';
  return [
    `Name: ${p.name || '(not given)'}`,
    p.location && `Location: ${p.location}`,
    p.headline && `Headline: ${p.headline}`,
    p.targetRoles && `Target roles: ${p.targetRoles}`,
    p.skills && `Key skills: ${p.skills}`,
    p.languages && `Languages: ${p.languages}`,
    links.length && `Links: ${links.join(', ')}`,
    pr.workModes?.length ? `Wants to work: ${pr.workModes.join(' or ')}` : p.remoteOnly && 'Prefers remote-only roles',
    pr.types?.length && `Employment type: ${pr.types.join(', ')}`,
    salary && `Minimum salary: ${salary}`,
    pr.availability && `Available to start: ${pr.availability}`,
    pr.relocate && 'Open to relocating',
    pr.authorization && `Work authorisation: ${pr.authorization}`,
    '',
    '<master_cv>',
    p.cv || '(The candidate has not pasted a CV yet.)',
    '</master_cv>',
  ]
    .filter((l) => l !== false && l !== undefined && l !== null && l !== 0)
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

/**
 * Find live openings for a search across the job portals that matter for the
 * location (plus LinkedIn, Glassdoor and company careers pages).
 * @returns {Promise<{jobs: object[], country: string|null}>}
 */
/**
 * `onFound(jobs)` is called with the postings of each job site as soon as
 * that site answers (read on the device, no AI), so they can be shown while
 * the rest of the search is still running.
 */
export async function searchEverywhere({ query, location, remoteOnly }, { onText, onFound, signal, rank = false } = {}) {
  const p = store.get().profile;
  const what = query || p.targetRoles.split(',')[0] || p.headline || 'jobs that fit my profile';
  const where = location || (remoteOnly ? 'remote' : p.location) || '';
  const { portals, country } = portalsFor(what, where, { remote: remoteOnly });
  const live = portals.filter((x) => x.live);
  const prov = activeProvider();
  let jobs =
    caps.mcp && (caps.sample || prov)
      ? await viewerSearch(what, where, remoteOnly, live, { onText, onFound, signal, rank })
      : prov && !prov.webSearch
        ? await boardSearch(what, where, remoteOnly, { onText, signal, rank })
        : await sdkSearch(what, where, remoteOnly, live, { onText, signal, rank });
  if (rank) jobs = jobs.sort((a, b) => (b.match?.score ?? -1) - (a.match?.score ?? -1));
  return { jobs, country };
}

/** Pick the job titles a CV points to, for searching when the profile has none. */
export async function suggestRoles({ signal } = {}) {
  const reply = await ask({
    system: 'You are a recruiter who reads CVs quickly.',
    messages: [
      {
        role: 'user',
        content:
          `${profileBlock()}\n\nWhich 2 or 3 job titles should this person search for next, based on their actual experience and seniority? ` +
          'Use the common title employers post, in the language of the job market where they live. Reply with only a JSON array of strings.',
      },
    ],
    json: true,
    quick: true,
    signal,
  });
  return (Array.isArray(reply) ? reply : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 3);
}

const EXTRACT_FORMAT =
  'Reply with only a JSON array (best matches first, max 30) where each item is ' +
  '{"title": string, "company": string, "location": string, "url": string, "portal": string (the job site the posting is on), ' +
  '"salary": string, "description": string (2-4 sentences: the role and key requirements), "posted": string (the posting date exactly as the page gives it, e.g. "2026-09-24" or "3 days ago"; empty if not shown)}.';

const RANKED_FORMAT =
  'Reply with only a JSON array (best fit for this candidate first, max 20) where each item is ' +
  '{"title": string, "company": string, "location": string, "url": string, "portal": string (the job site the posting is on), ' +
  '"salary": string, "description": string (2-4 sentences: the role and key requirements), "posted": string (the posting date exactly as the page gives it, empty if not shown), ' +
  '"match": number (0-100, how well the candidate\'s actual experience and seniority fit; be honest), ' +
  '"why": string (max 14 words, the concrete reason it fits or what is missing, no dashes)}. ' +
  'Leave out roles that are clearly far too senior, too junior or in another field. Lower the match for roles that clash with ' +
  'the candidate\'s work mode, employment type or minimum salary, and say so in "why".';

function placeRule(where, remoteOnly) {
  if (remoteOnly) return 'Only include remote roles.';
  if (!where) return '';
  return `Only include roles located in or within commuting distance of ${where}, or remote roles open to people there.`;
}

// Viewer route: search each portal with the viewer's Exa connector in
// parallel, then have Claude pick out the real postings.
async function viewerSearch(what, where, remoteOnly, portals, { onText, onFound, signal, rank }) {
  if (!caps.mcp) throw new Error('Live job search needs the Exa connector. Add it in claude.ai Settings → Connectors, then reload.');
  const place = where ? ` in ${where}` : '';
  // Worded exactly like the home feed's searches, so repeats come from the cache.
  const searches = portalQueries(what, where, portals);
  onText?.(`Searching ${portals.length} job portals${place}…`);
  const city = String(where || '').split(',')[0].trim();
  const settled = await Promise.allSettled(
    searches.map((q) =>
      caps.mcp.callTool(SEARCH_SERVER, SEARCH_TOOL, { query: q.query, objective: q.objective, numResults: RESULTS_PER_SEARCH }, { signal }).then((r) => {
        // Show this site's postings now; the AI pass below adds what it finds later.
        if (onFound) {
          try {
            onFound(parseSearchResults(typeof r.payload === 'string' ? r.payload : JSON.stringify(r.payload ?? r.content), { city }));
          } catch {}
        }
        return r;
      }),
    ),
  );
  const blocks = [];
  const bodies = [];
  let firstError = null;
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      const body = typeof r.value.payload === 'string' ? r.value.payload : JSON.stringify(r.value.payload ?? r.value.content);
      bodies.push(body);
      blocks.push(`<results source="${searches[i].label}">\n${body.slice(0, 10000)}\n</results>`);
    } else firstError ??= r.reason;
  });
  if (!blocks.length) throw mcpError(firstError);

  onText?.('Reading the postings…');
  const list = await ask({
    system:
      'You extract job postings from web search results. Only include real, specific open positions that appear in the results, ' +
      'with the URL exactly as given. Skip articles, salary guides, lists of companies, search-result pages and expired postings. ' +
      'Remove duplicates of the same job on different sites, keeping the most direct link.',
    messages: [
      {
        role: 'user',
        content:
          (rank ? `${profileBlock().slice(0, 20000)}\n\n` : '') +
          `Search: ${what}${place}. ${placeRule(where, remoteOnly)}\n\n${blocks.join('\n\n').slice(0, 90000)}\n\n${rank ? RANKED_FORMAT : EXTRACT_FORMAT}`,
      },
    ],
    json: true,
    signal,
  });
  if (!Array.isArray(list)) throw new Error('Claude replied in an unexpected format. Try again.');
  const picked = list.filter((j) => j && j.title).map(toJob);
  return [...picked, ...alsoFound(bodies, picked, where, rank)];
}

// Every posting in the downloaded results that the AI did not pick (it only
// lists so many), read by the same rules as the home feed. Free: no extra
// search, the results are already here.
function alsoFound(bodies, picked, where, rank) {
  const p = store.get().profile;
  const me = readProfile(p);
  const city = String(where || '').split(',')[0].trim();
  const kept = [...picked];
  const out = [];
  for (const j of bodies.flatMap((b) => parseSearchResults(b, { city }))) {
    if (kept.some((k) => (k.url && k.url === j.url) || sameJob(k, j))) continue;
    kept.push(j);
    const { _text, ...job } = j;
    const match = me.roles.length || me.skills.size ? scoreJob(j, me, p.prefs || {}, where) : null;
    void _text;
    if (match && match.score < 30) continue; // clearly another field or level
    out.push(rank && match ? { ...job, match } : job);
  }
  return out;
}

// Standalone route: Claude's own web search tool via the API.
// Providers without web search: the free job boards, ranked by the AI.
async function boardSearch(what, where, remoteOnly, { onText, signal, rank }) {
  onText?.('Searching free job boards…');
  const { jobs } = await searchJobs({ query: what, location: remoteOnly ? '' : where, remoteOnly });
  const real = jobs.filter((j) => j.source !== 'Demo');
  if (!rank || !real.length) return real;
  onText?.('Ranking each job against your CV…');
  const scores = await scoreJobs(real, { signal });
  return real.map((j) => (scores[j.id] ? { ...j, match: scores[j.id] } : j));
}

async function sdkSearch(what, where, remoteOnly, portals, { onText, signal, rank }) {
  const place = where ? ` in ${where}` : '';
  const list = await ask({
    system:
      'You are a job-search assistant. Use web search to find real, currently open job postings. ' +
      'Only include postings you actually found in search results; never make up URLs.',
    messages: [
      {
        role: 'user',
        content:
          `${profileBlock()}\n\nFind open positions for "${what}"${place}. ${placeRule(where, remoteOnly)} ` +
          `Search these job portals: ${portals.map((x) => `${x.name} (${x.domain})`).join(', ')}, and company careers pages. ` +
          `When done, ${rank ? RANKED_FORMAT : EXTRACT_FORMAT}`,
      },
    ],
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 10 }],
    json: true,
    onText: () => onText?.(`Searching job portals${place}…`),
    signal,
  });
  if (!Array.isArray(list)) throw new Error('Unexpected reply format');
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
    source: portalForUrl(String(j.url || '')) || String(j.portal || 'Web'),
    title: String(j.title),
    company: String(j.company || ''),
    location: String(j.location || ''),
    remote: /remote|anywhere/i.test(String(j.location || '')),
    url: String(j.url || ''),
    salary: String(j.salary || ''),
    description: String(j.description || ''),
    posted: String(j.posted || ''),
    postedAt: postedAt(j.posted),
    tags: [],
    ...(Number.isFinite(Number(j.match)) && j.match !== '' && j.match != null
      ? { match: { score: Math.max(0, Math.min(100, Math.round(Number(j.match)))), reason: cleanText(String(j.why || '')) } }
      : {}),
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
  const rows = reply;
  const out = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const job = jobs[row.index];
    if (job) out[job.id] = { score: Math.round(row.score), reason: row.reason };
  }
  return out;
}

const CV_SHAPE =
  '{"name": string, "headline": string, "contact": {"email": string, "phone": string, "location": string, "links": [string]}, ' +
  '"summary": string, "skills": [{"label": string, "items": [string]}], ' +
  '"experience": [{"title": string, "company": string, "location": string, "start": string, "end": string, "bullets": [string]}], ' +
  '"education": [{"degree": string, "school": string, "location": string, "start": string, "end": string, "details": string}], ' +
  '"projects": [{"name": string, "description": string, "link": string}], "certifications": [string], "languages": [string]';

/**
 * Rewrite the CV for one job as structured data, ready for the layout
 * templates. `instructions` lets the user ask for changes to a previous draft.
 */
export async function tailorCV(job, { instructions = '', previous = null, signal, onText } = {}) {
  const p = store.get().profile;
  const draft = previous
    ? `\n\n<current_draft>\n${JSON.stringify(previous)}\n</current_draft>\nApply this change to the current draft: ${instructions}`
    : instructions
      ? `\n\nAlso: ${instructions}`
      : '';
  const raw = await ask({
    system:
      'You are an experienced recruiter who helps people rewrite their own CV for a specific job. The result must pass applicant tracking systems ' +
      'and read as if the candidate wrote it themselves. ' +
      HONESTY +
      '\n\n' +
      HUMAN_STYLE,
    messages: [
      {
        role: 'user',
        content:
          `${profileBlock()}\n\n${jobBlock(job)}\n\n` +
          'Rewrite the master CV for this job:\n' +
          '- Lead with a 2-3 sentence profile aimed squarely at this role.\n' +
          '- Order sections and experience so the most relevant evidence comes first; trim or drop what does not help.\n' +
          '- Rewrite bullets so each one says what the person actually did and, where the CV supports it, what came of it. Vary how bullets are built. 3-5 bullets for recent roles, fewer for older ones.\n' +
          '- Use the job posting\'s own terms for skills and tools the CV genuinely shows. Group skills under short labels.\n' +
          '- Keep it to what fits on one or two A4 pages.\n' +
          `- Contact details: name "${p.name}", email "${p.email}", phone "${p.phone}", location "${p.location}"` +
          `${[p.linkedin, p.portfolio, p.github].filter(Boolean).length ? `, links ${JSON.stringify([p.linkedin, p.portfolio, p.github].filter(Boolean))}` : ''} unless the CV says otherwise.` +
          draft +
          `\n\nReply with only a JSON object: ${CV_SHAPE}, ` +
          '"changes": [string] (3-6 short notes on what you changed for this job and why), "keywords": [string] (posting keywords the CV now covers)}. ' +
          'Use empty strings or arrays for anything unknown.',
      },
    ],
    json: true,
    signal,
    onText,
  });
  return cleanCV(normalizeCV(raw));
}

/**
 * Read a CV (text, or page images for photos and scanned PDFs), review it,
 * and pull out profile details.
 */
export async function analyzeCV({ text = '', images = [] }, { signal, onText } = {}) {
  const reply = await ask({
    system: 'You are a senior recruiter and CV coach. You give specific, honest, practical feedback.' + uiLanguage(' (verdict, strengths, improvements, atsIssues), but keep the profile fields and cvText in the language of the CV'),
    messages: [
      {
        role: 'user',
        content:
          (text ? `<cv>\n${text.slice(0, 60000)}\n</cv>\n\n` : 'The attached image(s) are pages of my CV.\n\n') +
          'Review this CV and reply with only a JSON object:\n' +
          '{"profile": {"name": string, "email": string, "phone": string, "location": string, "headline": string (one line), ' +
          '"targetRoles": string (2-4 roles this person fits, comma-separated), "skills": string (top 10, comma-separated)}, ' +
          '"score": number (0-100 overall quality), "verdict": string (one sentence), ' +
          '"strengths": [string] (3-5), "improvements": [string] (3-6 specific fixes, most important first), ' +
          '"atsIssues": [string] (layout or wording that applicant tracking systems may misread; empty if none)' +
          (text ? '' : ', "cvText": string (the full CV transcribed as plain text, keeping its structure)') +
          '}',
      },
    ],
    images,
    json: true,
    signal,
    onText,
  });
  if (!reply || typeof reply !== 'object') throw new Error('Claude replied in an unexpected format. Try again.');
  return reply;
}

export async function writeCoverLetter(job, { tone = 'professional', instructions = '', previous = '', ...opts } = {}) {
  // The app lays out the letterhead, date, recipient and subject line itself,
  // so the model writes only the greeting, the body and the sign-off.
  const shape =
    'Write it in the language of the job posting. Begin with a greeting line (to the named hiring manager if the posting names one, otherwise the usual neutral greeting in that language). ' +
    'Do not include a letterhead, address, date or subject line. Separate paragraphs with an empty line. ';
  const task = previous
    ? `Here is the current letter:\n<letter>\n${previous}\n</letter>\n\nChange it as follows: ${instructions}\nKeep what was not mentioned. ${shape}Output only the full letter.`
    : `Write a ${tone} cover letter for this job, 220-320 words, in the first person. ${shape}` +
      'After the greeting, start with something specific about this role or company and why it fits the candidate, not with "I am writing to" or "I am excited to apply". ' +
      'Connect two concrete things from the CV to what the job needs, in plain words. End with one simple, direct closing line and a sign-off with the candidate\'s name. ' +
      'Contractions are fine. No placeholders like [Company]: use the real details, or leave out what is unknown. Output only the letter.';
  const text = await ask({
    system: 'You help people write their own cover letters. The letter must sound like the candidate wrote it, not a template. ' + HONESTY + '\n\n' + HUMAN_STYLE,
    messages: [{ role: 'user', content: `${profileBlock()}\n\n${jobBlock(job)}\n\n${task}` }],
    ...opts,
  });
  return cleanText(text);
}

/** Rewrite only the lines of a letter that contain the given phrases. */
export async function reviseLetter(job, letter, phrases, opts = {}) {
  const text = await ask({
    system: 'You edit cover letters so they sound like the candidate wrote them. ' + HUMAN_STYLE,
    messages: [
      {
        role: 'user',
        content:
          `${jobBlock(job)}\n\n<letter>\n${letter}\n</letter>\n\n` +
          `Rewrite only the sentences that use these phrases: ${phrases.join(', ')}. Replace them with plain, specific wording. ` +
          'Remove any dashes used as punctuation. Keep everything else exactly as it is. Output only the full letter.',
      },
    ],
    ...opts,
  });
  return cleanText(text);
}

export function analyzeGap(job, opts) {
  return ask({
    system: 'You are a candid career coach.' + uiLanguage(),
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

// ---------------------------------------------------------------------------
// About the company
// ---------------------------------------------------------------------------

const COMPANY_FORMAT =
  'Reply with only a JSON object: {"name": string, "oneLiner": string (max 14 words: what the company is), ' +
  '"whatTheyDo": string (2-3 plain sentences), "industry": string, "founded": string, "headquarters": string, ' +
  '"employees": string (e.g. "about 1,400"), "ownership": string (e.g. "listed on SIX Swiss Exchange", "family owned", "startup, Series B"), ' +
  '"website": string (official homepage URL), "products": string[] (max 4, short), "culture": string[] (max 3: what working there is like, from the company or reviews), ' +
  '"rating": string (employee rating with its source, e.g. "4.1/5 on kununu (230 reviews)", or ""), ' +
  '"news": [{"title": string, "date": string, "url": string}] (max 3, the most recent), ' +
  '"talkingPoints": string[] (max 3: specific things worth mentioning in an application or interview), "sources": string[] (URLs used)}. ' +
  'Use "" or [] for anything the sources do not state. Never guess numbers or dates.';

/**
 * Look the employer up on the web and sum up what matters to an applicant.
 * @returns {Promise<object>} the COMPANY_FORMAT object
 */
export async function companyProfile(job, { signal } = {}) {
  const name = String(job.company || '').trim();
  if (!name) throw new Error('This posting does not name the company.');
  const where = job.location ? ` (${job.location})` : '';
  const system =
    'You research employers for job seekers. Use only facts that appear in the sources or the job posting, and keep them current. ' +
    'If the sources are about a different company with a similar name, ignore them. Write plainly, no dashes as punctuation, no marketing language.' + uiLanguage(' (keep company and product names as they are)');
  const posting = `<job_posting>\nCompany: ${name}${where}\nTitle: ${job.title}\n${String(job.description || '').slice(0, 4000)}\n</job_posting>`;

  let reply;
  if (!caps.mcp && caps.sample && !activeProvider()) throw new Error('Company lookup needs the Exa connector. Add it in claude.ai Settings → Connectors, then reload.');
  if (caps.mcp && (caps.sample || activeProvider())) {
    const searches = [
      { query: `${name}${where} official website about the company`, objective: `The official website and "about us" page of the employer ${name}${where}: what it does, founding year, headquarters, number of employees, ownership.` },
      { query: `${name} company news 2026`, objective: `Recent news about the company ${name}${where} from the last 12 months: results, launches, acquisitions, layoffs, leadership changes. Include dates.` },
      { query: `${name} employee reviews rating kununu glassdoor`, objective: `Employee reviews and the overall rating of ${name}${where} as an employer, with the number of reviews.` },
    ];
    const settled = await Promise.allSettled(searches.map((q) => caps.mcp.callTool(SEARCH_SERVER, SEARCH_TOOL, { ...q, numResults: 6 }, { signal })));
    const blocks = settled
      .map((r, i) => (r.status === 'fulfilled' ? `<results topic="${['about', 'news', 'reviews'][i]}">\n${(typeof r.value.payload === 'string' ? r.value.payload : JSON.stringify(r.value.payload ?? r.value.content)).slice(0, 12000)}\n</results>` : ''))
      .filter(Boolean);
    if (!blocks.length) throw mcpError(settled.find((r) => r.status === 'rejected')?.reason);
    reply = await ask({ system, messages: [{ role: 'user', content: `${posting}\n\n${blocks.join('\n\n')}\n\n${COMPANY_FORMAT}` }], json: true, signal });
  } else {
    reply = await ask({
      system,
      messages: [{ role: 'user', content: `${posting}\n\nSearch the web for this employer: its website, recent news and employee reviews (kununu, Glassdoor). ${COMPANY_FORMAT}` }],
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }],
      json: true,
      signal,
    });
  }
  if (!reply || typeof reply !== 'object' || Array.isArray(reply)) throw new Error('Claude replied in an unexpected format. Try again.');
  const str = (v) => cleanText(String(v ?? '')).trim();
  const list = (v, n) => (Array.isArray(v) ? v : []).map(str).filter(Boolean).slice(0, n);
  return {
    name: str(reply.name) || name,
    oneLiner: str(reply.oneLiner),
    whatTheyDo: str(reply.whatTheyDo),
    industry: str(reply.industry),
    founded: str(reply.founded),
    headquarters: str(reply.headquarters),
    employees: str(reply.employees),
    ownership: str(reply.ownership),
    website: /^https?:\/\//i.test(String(reply.website || '')) ? String(reply.website) : '',
    products: list(reply.products, 4),
    culture: list(reply.culture, 3),
    rating: str(reply.rating),
    news: (Array.isArray(reply.news) ? reply.news : [])
      .filter((n) => n && n.title)
      .slice(0, 3)
      .map((n) => ({ title: str(n.title), date: str(n.date), url: /^https?:\/\//i.test(String(n.url || '')) ? String(n.url) : '' })),
    talkingPoints: list(reply.talkingPoints, 3),
    sources: (Array.isArray(reply.sources) ? reply.sources : []).map(String).filter((u) => /^https?:\/\//i.test(u)).slice(0, 6),
  };
}

// ---------------------------------------------------------------------------
// Interview game
// ---------------------------------------------------------------------------

export const CATEGORIES = ['Story time', 'Skills check', 'Motivation', 'Curveball', 'Company fit'];

/** Build a deck of question cards for this job. */
export async function interviewDeck(job, { signal } = {}) {
  const reply = await ask({
    system: 'You are a sharp, friendly hiring manager preparing someone for a real interview for this exact job.' + uiLanguage(' (questions, hints, what they test, model answers)'),
    messages: [
      {
        role: 'user',
        content:
          `${profileBlock()}\n\n${jobBlock(job)}\n\n` +
          'Make a deck of 8 interview question cards that this employer would really ask for this role. Mix: 3 "Story time" (behavioural, "tell me about a time"), ' +
          '2 "Skills check" (role or technical questions based on the posting), 1 "Motivation", 1 "Company fit", 1 "Curveball". Order them like a real interview, easy first.\n' +
          'Keep every question short and spoken, under 25 words. No dashes as punctuation.\n' +
          'Reply with only a JSON object: {"cards": [{"category": one of ' + JSON.stringify(CATEGORIES) + ', "difficulty": 1-3, ' +
          '"question": string, "testing": string (what they really want to find out, max 10 words), ' +
          '"hint": string (a nudge pointing at something specific from the CV to use, max 18 words), ' +
          '"lookFor": [3 short points a great answer covers, max 8 words each]}], ' +
          '"askThem": [3 smart questions the candidate can ask at the end, max 18 words each]}',
      },
    ],
    json: true,
    signal,
  });
  const cards = Array.isArray(reply?.cards) ? reply.cards : [];
  return {
    cards: cards
      .filter((c) => c && c.question)
      .map((c) => ({
        category: CATEGORIES.includes(c.category) ? c.category : 'Story time',
        difficulty: Math.min(3, Math.max(1, Number(c.difficulty) || 1)),
        question: cleanText(String(c.question)),
        testing: cleanText(String(c.testing || '')),
        hint: cleanText(String(c.hint || '')),
        lookFor: (Array.isArray(c.lookFor) ? c.lookFor : []).map((x) => cleanText(String(x))).slice(0, 4),
      })),
    askThem: (Array.isArray(reply?.askThem) ? reply.askThem : []).map((x) => cleanText(String(x))).slice(0, 4),
  };
}

/** Score one spoken or typed answer. Fast and short by design. */
export async function scoreAnswer(job, card, answer, { signal } = {}) {
  const reply = await ask({
    system:
      'You coach people for job interviews. You are warm and encouraging but honest, like a good friend who has hired people. ' +
      'Answers may be voice transcripts with filler words and missing punctuation; judge the content, not the transcription.' + uiLanguage(),
    messages: [
      {
        role: 'user',
        content:
          `${profileBlock()}\n\nJob: ${job.title} at ${job.company}\n\nQuestion: ${card.question}\n` +
          `A great answer covers: ${card.lookFor.join('; ')}\n\nCandidate's answer:\n"""${answer.slice(0, 6000)}"""\n\n` +
          'Reply with only a JSON object: {"stars": 1-5, "verdict": string (a fun 2-5 word reaction, like "Solid story!" or "Almost there"), ' +
          '"good": string (one specific thing that worked, max 20 words), "improve": string (the single most useful fix, max 22 words), ' +
          '"stronger": string (a better version of their answer in first person, as they would say it out loud, using only facts from their answer or CV, max 70 words)}. ' +
          'No dashes as punctuation. Plain, spoken words.',
      },
    ],
    json: true,
    quick: true,
    signal,
  });
  return {
    stars: Math.min(5, Math.max(1, Math.round(Number(reply?.stars) || 1))),
    verdict: cleanText(String(reply?.verdict || '')),
    good: cleanText(String(reply?.good || '')),
    improve: cleanText(String(reply?.improve || '')),
    stronger: cleanText(String(reply?.stronger || '')),
  };
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
