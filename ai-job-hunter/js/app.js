import { store, STATUSES } from './store.js';
import { searchJobs, SOURCE_IDS } from './jobs.js';
import * as ai from './ai.js';
import { h, md, toast, copy, download, confirmButton, fmtDate, debounce } from './ui.js';
import { inArtifact, ready as runtimeReady } from './runtime.js';
import { skipCachedUntilNow } from './webcache.js';
import { portalsFor, detectCountry, COUNTRIES } from './portals.js';
import { styleIssues, cvProse } from './style.js';
import { renderInterviewGame } from './game.js';
import { account, onAccountChange, signIn, signOut, syncNow, accountsAvailable, initAccount } from './account.js';
import { jobsForYou, moreJobsForYou, aboutFromPosting, norm, indeedJobs, readProfile, scoreJob, sameJob, jobPostedAt, byBestMatch, checkPages, isStale, knownClosed } from './match.js';
import { LANGUAGES, setLanguage, currentLanguage, setBrand } from './i18n.js';
import { attachSuggest, rememberSearch } from './suggest.js';
import { PROVIDERS, providerById } from './providers.js';
import { readCVFile, ACCEPT } from './files.js';
import { cvToText, cvFromProfile } from './cvdoc.js';
import { TEMPLATES, getTemplate, accentFor, renderCV, renderLetter, cvPDFDefinition, letterPDFDefinition, makePDF } from './templates.js';

const view = document.getElementById('view');

// Search results are transient; only saved jobs are persisted.
const session = {
  query: null,
  results: [],
  scores: {},
  errors: [],
};

function findJob(id) {
  return store.get().jobs[id] || session.results.find((j) => j.id === id) || store.get().feed?.jobs?.find((j) => j.id === id);
}

// ---------------------------------------------------------------------------
// Home feed: jobs near the user that fit their experience
// ---------------------------------------------------------------------------

const FEED_TTL = 24 * 60 * 60 * 1000;
let feedRun = null; // in-flight refresh
let feedError = null; // { key, message } from the last failed refresh
const FEED_PAGE = 12;
let feedFilter = ''; // show one portal only ('' = all)
let feedShown = FEED_PAGE; // how many cards are visible
let feedChipsOpen = false; // all portal chips shown, or only the biggest few
const feedChipCount = () => (window.innerWidth < 560 ? 3 : 5); // portals shown before "more"

function feedInputs() {
  const p = store.get().profile;
  const roles = p.targetRoles.split(',').map((r) => r.trim()).filter(Boolean).slice(0, 2);
  const location = p.location.trim();
  const remote = Boolean(p.remoteOnly);
  const hasExperience = Boolean(p.cv.trim() || roles.length || p.headline.trim());
  // Changes to any of these mean the feed should be rebuilt.
  const key = JSON.stringify(['rules-v2', currentLanguage(), roles, location.toLowerCase(), remote, p.headline.trim(), p.cv.length, p.cv.slice(0, 300), p.prefs?.workModes, p.prefs?.types, p.prefs?.salaryMin]);
  return { roles, location, remote, hasExperience, key };
}

function feedNeedsRefresh() {
  const f = store.get().feed;
  const { key } = feedInputs();
  return !f || f.key !== key || Date.now() - (f.at || 0) > FEED_TTL;
}

function runFeed() {
  if (feedRun) return feedRun;
  const { roles: given, location, remote, key } = feedInputs();
  feedError = null;
  feedRun = (async () => {
    // Plain matching rules on this device (js/match.js), no AI.
    void given;
    const found = await jobsForYou(store.get().profile);
    const { roles, country, searched } = found;
    // The AI double-checks the matches the rules could not vouch for (only when an AI is set up).
    const closed = ai.hasKey() ? await ai.checkStillOpen(found.jobs.slice(0, 40)).catch(() => new Set()) : new Set();
    const jobs = found.jobs.filter((j) => !closed.has(j.url));
    // Keep every match (trimmed so the feed stays small enough to sync).
    const kept = jobs.slice(0, 80).map((j) => ({ ...j, description: String(j.description || '').slice(0, 1500) }));
    feedFilter = '';
    feedShown = FEED_PAGE;
    store.update((s) => (s.feed = { key, at: Date.now(), jobs: kept, roles, location: remote ? 'Remote' : location, country, searched, noAI: true }));
  })()
    .catch((err) => {
      if (err?.name !== 'AbortError') feedError = { key, message: err.message || 'Could not load jobs.' };
    })
    .finally(() => {
      feedRun = null;
      if (currentPath === '/') route();
    });
  return feedRun;
}

function timeAgo(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const hrs = Math.round(m / 60);
  return hrs < 24 ? `${hrs} h ago` : fmtDate(ts);
}

// "Posted today", "Posted 3 days ago", "Posted 24 Sep": when the job went online.
function postedLabel(job) {
  const ts = jobPostedAt(job);
  if (!ts) return '';
  const day = (t) => {
    const d = new Date(t);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  };
  const days = Math.max(0, Math.round((day(Date.now()) - day(ts)) / 864e5));
  if (days === 0) return 'Posted today';
  if (days === 1) return 'Posted yesterday';
  if (days < 7) return `Posted ${days} days ago`;
  if (days < 28) return days < 14 ? 'Posted 1 week ago' : `Posted ${Math.floor(days / 7)} weeks ago`;
  return `Posted ${fmtDate(ts)}`;
}

function postedTag(job, empty = '') {
  const label = postedLabel(job);
  if (!label) return empty ? h('span', { class: 'posted unknown' }, empty) : '';
  const days = (Date.now() - jobPostedAt(job)) / 864e5;
  return h('span', { class: `posted${days < 3 ? ' fresh' : ''}`, title: new Date(jobPostedAt(job)).toLocaleDateString() }, label);
}

function feedSection() {
  const { location, remote, hasExperience, key } = feedInputs();
  const stored = store.get().feed;
  // Jobs found closed since the feed was made (or now too old) are left out.
  const feed = stored && { ...stored, jobs: stored.jobs.filter((j) => !isStale(j) && !knownClosed(j.url)) };
  const where = remote ? 'remote' : location;
  const head = (sub, ...actions) =>
    h('div', { class: 'feed-head' }, h('div', {}, h('h2', {}, where ? `Jobs for you ${remote ? '(remote)' : `in ${location}`}` : 'Jobs for you'), sub && h('p', { class: 'muted small' }, sub)), actions.length ? h('div', { class: 'row' }, ...actions) : '');
  const prompt = (text, href, label) => h('section', { class: 'card feed' }, head(''), h('div', { class: 'feed-empty' }, h('p', {}, text), h('a', { class: 'btn primary', href }, label)));

  if (!hasExperience) return prompt('Upload your CV and we will find jobs near you that fit your experience.', '#/profile', 'Upload your CV');
  if (!location && !remote) return prompt('Add your city in your profile to see jobs near you.', '#/profile', 'Add your location');

  if (feedNeedsRefresh() && !feedRun && feedError?.key !== key) runFeed();

  const refresh = h('button', { class: 'btn small', type: 'button', disabled: Boolean(feedRun) }, feedRun ? 'Searching…' : 'Refresh');
  refresh.addEventListener('click', () => {
    feedError = null;
    skipCachedUntilNow(); // the user wants what is new right now
    runFeed();
    route();
  });

  const fresh = feed && feed.key === key;
  if (feedRun && !fresh) {
    return h(
      'section',
      { class: 'card feed' },
      head(`Searching the job portals${where ? ` for ${where}` : ''} and matching what you find against your CV. This takes a few seconds.`),
      h('div', { class: 'feed-grid' }, ...Array.from({ length: 3 }, () => h('div', { class: 'skeleton feed-skel' }))),
    );
  }
  if (feedError && !fresh) {
    return h('section', { class: 'card feed' }, head('', refresh), h('div', { class: 'feed-empty' }, h('p', { class: 'error' }, feedError.message)));
  }
  if (!feed?.jobs?.length) {
    return h('section', { class: 'card feed' }, head(feed ? 'No open roles matched this time.' : '', refresh), h('div', { class: 'feed-empty' }, h('p', { class: 'muted' }, 'Try again later, or search with other keywords.'), h('a', { class: 'btn', href: '#/find' }, 'Search jobs')));
  }

  const seeAll = h('button', { class: 'btn small', type: 'button' }, `See all ${feed.jobs.length}`);
  seeAll.addEventListener('click', () => {
    session.results = [...feed.jobs].sort(byBestMatch);
    session.scores = Object.fromEntries(feed.jobs.filter((j) => j.match).map((j) => [j.id, j.match]));
    session.examples = false;
    session.more = false;
    session.errors = [];
    session.filter = '';
    session.query = { query: feed.roles[0] || '', location: feed.location === 'Remote' ? '' : feed.location, remoteOnly: feed.location === 'Remote', sources: [...SOURCE_IDS] };
    go('/find');
  });

  // Filter chips: one per portal the matches came from.
  const counts = new Map();
  for (const j of feed.jobs) counts.set(j.source, (counts.get(j.source) || 0) + 1);
  if (feedFilter && !counts.has(feedFilter)) feedFilter = '';
  const list = (feedFilter ? feed.jobs.filter((j) => j.source === feedFilter) : feed.jobs).sort(byBestMatch);
  const grid = h('div', { class: 'feed-grid' });
  const more = h('button', { class: 'btn feed-more', type: 'button' });
  const chips = h('div', { class: 'chip-row feed-chips', role: 'group', 'aria-label': 'Filter by job site' });
  function drawChips() {
    const chip = (label, value, c) => {
      const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(feedFilter === value) }, label, h('span', { class: 'chip-count' }, String(c)));
      b.addEventListener('click', () => {
        feedFilter = value;
        feedShown = FEED_PAGE;
        route();
      });
      return b;
    };
    // The biggest portals first; the rest fold behind a "more" chip so the list stays short.
    const sorted = [...counts].sort((a, b) => b[1] - a[1]);
    let shown = feedChipsOpen ? sorted : sorted.slice(0, feedChipCount());
    if (!feedChipsOpen && feedFilter && !shown.some(([k]) => k === feedFilter)) shown = [...shown, sorted.find(([k]) => k === feedFilter)];
    const hidden = sorted.length - shown.length;
    const toggle = h('button', { type: 'button', class: 'chip chip-more', 'aria-expanded': String(feedChipsOpen) }, feedChipsOpen ? 'Show less' : `+ ${hidden} more`);
    toggle.addEventListener('click', () => {
      feedChipsOpen = !feedChipsOpen;
      drawChips();
    });
    chips.replaceChildren(chip('All sites', '', feed.jobs.length), ...shown.map(([k, c]) => chip(k, k, c)), feedChipsOpen || hidden > 0 ? toggle : '');
  }
  function drawGrid() {
    grid.replaceChildren(...list.slice(0, feedShown).map(feedCard));
    const left = list.length - feedShown;
    more.hidden = left <= 0;
    more.textContent = `Show ${Math.min(left, FEED_PAGE)} more`;
  }
  more.addEventListener('click', () => {
    feedShown += FEED_PAGE;
    drawGrid();
  });
  drawChips();
  drawGrid();

  // Every portal's own full results for the same search, one tap away.
  const { portals } = portalsFor(feed.roles[0] || '', feed.location === 'Remote' ? '' : feed.location, { remote: feed.location === 'Remote' });
  const portalLinks = h(
    'div',
    { class: 'feed-portals' },
    h('p', { class: 'small strong' }, 'See every listing on each job site'),
    h('div', { class: 'row wrap' }, ...portals.map((x) => h('a', { class: 'btn small', href: safeUrl(x.url), target: '_blank', rel: 'noopener noreferrer' }, `${x.name} ↗`))),
  );

  return h(
    'section',
    { class: 'card feed' },
    head(`${feed.jobs.length} matches · based on your experience as ${feed.roles.join(' or ')}${feedRun ? ' · updating…' : ` · updated ${timeAgo(feed.at)}`}`, refresh, seeAll),
    counts.size > 1 ? chips : '',
    grid,
    more,
    portalLinks,
    h('p', { class: 'small muted feed-note' }, `Searched ${feed.searched?.length ? `${feed.searched.join(', ')}, ` : ''}the open web and free job boards, then matched on this device by job title, skills, location and experience. No AI is used for these picks.`),
  );
}

function feedCard(job) {
  const saved = Boolean(store.get().jobs[job.id]);
  const save = h('button', { class: 'btn small', type: 'button', disabled: saved }, saved ? 'Saved' : 'Save');
  save.addEventListener('click', () => {
    store.saveJob(job);
    save.textContent = 'Saved';
    save.disabled = true;
    toast('Saved to your tracker');
  });
  const href = `#/job/${encodeURIComponent(job.id)}`;
  return h(
    'article',
    { class: 'feed-card' },
    h('div', { class: 'feed-card-top' }, scorePill(job.match), h('span', { class: 'tag source' }, job.source)),
    h('h3', {}, h('a', { href }, job.title)),
    h('p', { class: 'muted small' }, [job.company, job.location].filter(Boolean).join(' · ')),
    postedTag(job) ? h('p', { class: 'small feed-posted' }, postedTag(job)) : '',
    job.match?.reason ? h('p', { class: 'small reason' }, job.match.reason) : '',
    h('div', { class: 'feed-card-foot' }, save, h('a', { class: 'btn small primary', href }, 'Open')),
  );
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const routes = [
  [/^\/?$/, renderHome],
  [/^\/find$/, renderFind],
  [/^\/tracker$/, renderTracker],
  [/^\/job\/(.+)$/, (id) => renderJob(decodeURIComponent(id))],
  [/^\/add$/, renderAddJob],
  [/^\/profile$/, renderProfile],
  [/^\/settings$/, renderSettings],
];

let currentAbort = null;

function route() {
  currentAbort?.abort();
  currentAbort = null;
  const path = currentPath;
  for (const a of document.querySelectorAll('.mainnav a, .tabbar a, .appbar-actions a')) {
    const target = a.getAttribute('href').replace(/^#/, '');
    a.classList.toggle('active', target === '/' ? path === '/' : path.startsWith(target));
  }
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) {
      view.replaceChildren();
      fn(...m.slice(1));
      view.focus({ preventScroll: true });
      window.scrollTo(0, 0);
      return;
    }
  }
  go('/');
}

// Routing keeps the current screen in memory so it also works inside the
// artifact viewer, where links cannot carry "#/path" state. In a normal
// browser the hash is kept in sync so Back and bookmarks work.
let currentPath = /^#\//.test(location.hash) ? location.hash.slice(1) : '/';

function go(path) {
  currentPath = path;
  if (!inArtifact) {
    try {
      history.pushState(null, '', '#' + path);
    } catch {}
  }
  route();
}

window.addEventListener('popstate', () => {
  currentPath = /^#\//.test(location.hash) ? location.hash.slice(1) : '/';
  route();
});

document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a[href^="#/"]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  go(a.getAttribute('href').slice(1));
});

function newAbort() {
  currentAbort?.abort();
  currentAbort = new AbortController();
  return currentAbort.signal;
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function pageHeader(title, subtitle, ...actions) {
  return h(
    'header',
    { class: 'page-header' },
    h('div', {}, h('h1', {}, title), subtitle && h('p', { class: 'muted' }, subtitle)),
    actions.length ? h('div', { class: 'row' }, ...actions) : null,
  );
}

function keyNotice() {
  if (ai.hasKey()) return null;
  if (inArtifact) {
    return h(
      'div',
      { class: 'notice' },
      h('strong', {}, 'AI features need permission. '),
      'Allow this page to use Claude when asked, or add an Anthropic API key in ',
      h('a', { href: '#/settings' }, 'Settings'),
      '.',
    );
  }
  return h(
    'div',
    { class: 'notice' },
    h('strong', {}, 'AI features are off. '),
    'Add your Anthropic API key in ',
    h('a', { href: '#/settings' }, 'Settings'),
    ' to tailor CVs, write cover letters, score matches and prep interviews.',
  );
}

function profileNotice() {
  if (store.get().profile.cv.trim()) return null;
  return h(
    'div',
    { class: 'notice' },
    h('strong', {}, 'Add your CV first. '),
    'Paste it into your ',
    h('a', { href: '#/profile' }, 'Profile'),
    ' so the AI can match and tailor it.',
  );
}

function statusBadge(status) {
  const s = STATUSES.find((x) => x.id === status);
  return h('span', { class: `badge status-${status}` }, s ? s.label : status);
}

function scorePill(score) {
  if (!score) return null;
  const level = score.score >= 75 ? 'high' : score.score >= 50 ? 'mid' : 'low';
  return h('span', { class: `score score-${level}`, title: score.reason }, `${score.score}% match`);
}

/**
 * Button that runs an AI task, streams into `output`, and handles errors.
 * `task(onText, signal)` must resolve with the final text.
 */
function aiButton(label, { output, task, onDone, variant = 'primary' }) {
  const btn = h('button', { class: `btn ${variant}`, type: 'button' }, label);
  btn.addEventListener('click', async () => {
    if (!ai.hasKey()) {
      toast('Add your API key in Settings first.');
      go('/settings');
      return;
    }
    const signal = newAbort();
    btn.disabled = true;
    btn.dataset.label = btn.textContent;
    btn.textContent = 'Working…';
    output?.classList.add('streaming');
    if (output) output.replaceChildren(h('p', { class: 'muted' }, 'Thinking…'));
    try {
      const text = await task((partial) => output && output.replaceChildren(md(partial)), signal);
      if (output) output.replaceChildren(md(text));
      onDone?.(text);
    } catch (err) {
      if (err?.name === 'AbortError' || signal.aborted) return;
      console.error(err);
      if (output) output.replaceChildren(h('p', { class: 'error' }, err.message));
      else toast(err.message);
    } finally {
      output?.classList.remove('streaming');
      btn.disabled = false;
      btn.textContent = btn.dataset.label;
    }
  });
  return btn;
}

// ---------------------------------------------------------------------------
// Home / dashboard
// ---------------------------------------------------------------------------

const ICON_SEARCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/></svg>';
const ICON_PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';

function svgIcon(markup) {
  const span = document.createElement('span');
  span.innerHTML = markup; // static markup defined in this file
  return span.firstChild;
}

/** The two-field "what / where" search bar used on Home and Find. */
function searchBar({ what = '', where = '', onSubmit, button = 'Search jobs', idPrefix = 'sb' }) {
  const q = h('input', { id: `${idPrefix}-q`, type: 'search', placeholder: 'Job title, skill or company', value: what, autocomplete: 'off', 'aria-label': 'What' });
  const l = h('input', { id: `${idPrefix}-l`, type: 'text', placeholder: 'City, region or "remote"', value: where, autocomplete: 'off', 'aria-label': 'Where' });
  const submit = h('button', { class: 'btn primary', type: 'submit' }, button);
  const form = h(
    'form',
    { class: 'searchbar', role: 'search' },
    h('label', { for: q.id }, svgIcon(ICON_SEARCH), q),
    h('label', { for: l.id }, svgIcon(ICON_PIN), l),
    submit,
  );
  // Suggestions as you type; picking a job title moves on to the place.
  attachSuggest(q, 'what', () => l.focus());
  attachSuggest(l, 'where');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    rememberSearch({ query: q.value, location: l.value });
    onSubmit({ query: q.value.trim(), location: l.value.trim() });
  });
  return { form, q, l, submit };
}

function profileStrength(p) {
  const weights = [30, 10, 10, 10, 10, 10, 10, 5, 5];
  const items = profileChecklist(p);
  const score = items.reduce((sum, x, i) => sum + (x.done ? weights[i] : 0), 0);
  return { score, next: items.find((x) => !x.done)?.label || '' };
}

function renderHome() {
  const { jobs, profile, docs } = store.get();
  const all = Object.values(jobs);
  const count = (s) => all.filter((j) => j.status === s).length;
  const first = profile.name.split(' ')[0];

  const { form } = searchBar({
    what: profile.targetRoles.split(',')[0]?.trim() || '',
    where: profile.remoteOnly ? 'remote' : profile.location,
    idPrefix: 'home',
    onSubmit: ({ query, location }) => {
      const remoteOnly = /^remote$/i.test(location);
      session.query = { query, location: remoteOnly ? '' : location, remoteOnly, sources: [...SOURCE_IDS] };
      session.results = [];
      session.autoSearch = true;
      go('/find');
    },
  });

  // Side column: applications, profile strength, next steps.
  const strength = profileStrength(profile);
  const steps = [
    { done: Boolean(profile.cv.trim()), label: 'Upload your CV', href: '#/profile' },
    { done: all.length > 0, label: 'Save a job you like', href: '#/find' },
    { done: all.some((j) => docs[j.id]?.cvData || docs[j.id]?.cv), label: 'Create a tailored CV for it', href: '#/tracker' },
    { done: count('applied') + count('interview') + count('offer') > 0, label: 'Apply and move it to Applied', href: '#/tracker' },
    { done: Object.values(store.get().prep).some((p) => p?.results?.length), label: 'Play an interview game', href: '#/tracker' },
  ];
  const recent = [...all].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)).slice(0, 3);

  const side = h(
    'aside',
    { class: 'home-side' },
    h(
      'section',
      { class: 'card' },
      h('div', { class: 'section-title' }, h('h2', {}, 'Your applications'), h('a', { class: 'small', href: '#/tracker' }, 'Open tracker')),
      h(
        'div',
        { class: 'pipeline' },
        ...STATUSES.map((st) => h('a', { href: '#/tracker', class: `status-${st.id}` }, h('span', { class: 'dot' }), st.label, h('strong', {}, String(count(st.id))))),
      ),
      recent.length
        ? h(
            'ul',
            { class: 'plain-list', style: 'margin-top:var(--sp-3)' },
            ...recent.map((j) => h('li', {}, h('a', { href: `#/job/${encodeURIComponent(j.id)}` }, j.title), statusBadge(j.status))),
          )
        : '',
    ),
    h(
      'section',
      { class: 'card' },
      h('div', { class: 'section-title' }, h('h2', {}, 'Profile strength'), h('strong', {}, `${strength.score}%`)),
      h('div', { class: 'meter', role: 'img', 'aria-label': `Profile ${strength.score}% complete` }, h('span', { style: `width:${strength.score}%` })),
      strength.next
        ? h('p', { class: 'small muted', style: 'margin:0' }, 'Next: ', h('a', { href: '#/profile' }, strength.next))
        : h('p', { class: 'small muted', style: 'margin:0' }, 'Complete. Claude has everything it needs to match you.'),
    ),
    steps.every((x) => x.done)
      ? ''
      : h(
          'section',
          { class: 'card' },
          h('div', { class: 'section-title' }, h('h2', {}, 'Next steps')),
          h('ol', { class: 'checklist' }, ...steps.map((x) => h('li', { class: x.done ? 'done' : '' }, h('a', { href: x.href }, x.label)))),
        ),
  );

  view.append(
    h(
      'section',
      { class: 'home-hero' },
      h('h1', {}, first ? `Find your next job, ${first}` : 'Find your next job'),
      h('p', {}, 'One search covers the job portals near you. Claude ranks every role against your CV, then helps you tailor your application and practise the interview.'),
      form,
    ),
    h('div', { class: 'home-grid' }, h('div', {}, feedSection()), side),
  );
}

// ---------------------------------------------------------------------------
// Find jobs
// ---------------------------------------------------------------------------

function renderFind() {
  const { profile } = store.get();
  const defaults = session.query || {
    query: profile.targetRoles.split(',')[0]?.trim() || '',
    location: profile.location || '',
    remoteOnly: profile.remoteOnly,
    sources: [...SOURCE_IDS],
  };
  session.filter ??= '';
  let remoteOnly = Boolean(defaults.remoteOnly);
  const wide = () => window.matchMedia('(min-width: 1024px)').matches;

  const results = h('div', { class: 'results', role: 'list' });
  const status = h('p', { class: 'find-status', role: 'status' });
  const filters = h('div', { class: 'chip-row', role: 'group', 'aria-label': 'Filter by job site' });
  const detail = h('aside', { class: 'detail-pane', 'aria-label': 'Job details' });
  const portalBox = h('section', { class: 'portals' });
  const aiStream = h('div', { class: 'ai-output compact', hidden: true });

  const bar = searchBar({
    what: defaults.query,
    where: remoteOnly ? 'remote' : defaults.location,
    idPrefix: 'find',
    button: 'Search',
    onSubmit: () => search(),
  });

  const params = () => {
    const where = bar.l.value.trim();
    const isRemote = remoteOnly || /^remote$/i.test(where);
    return { query: bar.q.value.trim(), location: /^remote$/i.test(where) ? '' : where, remoteOnly: isRemote, sources: [...SOURCE_IDS] };
  };

  // Filters row
  const remoteChip = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(remoteOnly) }, 'Remote only');
  remoteChip.addEventListener('click', () => {
    remoteOnly = !remoteOnly;
    remoteChip.setAttribute('aria-pressed', String(remoteOnly));
    drawPortals();
  });
  const scoreBtn = aiButton('Rank by my CV', {
    variant: 'small',
    task: async (_onText, signal) => {
      if (!store.get().profile.cv.trim()) throw new Error('Add your CV in Profile so matches can be ranked.');
      if (!session.results.length) throw new Error('Search first, then rank the results.');
      status.textContent = 'Ranking each job against your CV…';
      session.scores = await ai.scoreJobs(session.results, { signal });
      session.results = session.results.map((j) => (session.scores[j.id] ? { ...j, match: session.scores[j.id] } : j)).sort(byBestMatch);
      drawResults();
      return '';
    },
  });
  const boardsBtn = inArtifact ? '' : h('button', { class: 'btn small', type: 'button' }, 'Free job boards');
  if (boardsBtn) boardsBtn.addEventListener('click', runBoardSearch);

  // Every portal's own search page for this query and place.
  function drawPortals() {
    const { query, location, remoteOnly: r } = params();
    const { portals, countryName } = portalsFor(query || 'jobs', location, { remote: r });
    portalBox.replaceChildren(
      h('h2', {}, countryName ? `Search on job sites in ${countryName}` : 'Search on other job sites'),
      h('p', { class: 'muted small', style: 'margin:0' }, countryName || !location ? 'Opens each site\'s own results for this search.' : `No site list for "${location}" yet. Add the country to see local sites.`),
      h('div', { class: 'portal-links' }, ...portals.map((x) => h('a', { class: 'portal-link', href: x.url, target: '_blank', rel: 'noopener noreferrer' }, x.name, h('span', { 'aria-hidden': 'true' }, '↗')))),
    );
  }
  for (const el of [bar.q, bar.l]) el.addEventListener('input', debounce(drawPortals, 250));

  async function search() {
    if (ai.hasKey()) return aiSearch();
    if (!inArtifact) return runBoardSearch();
    toast('Allow this page to use Claude to search job sites.');
  }

  const NO_RESULTS = 'No open postings found for this search';

  // Results appear as each job site answers; the AI pass, Indeed and the extra
  // CV matches run alongside and add their jobs as soon as they have them.
  async function aiSearch() {
    const p = params();
    const run = (session.searchRun = Symbol('search'));
    session.query = p;
    session.extraRun = null;
    session.indeedRun = null;
    session.datesRun = null;
    session.results = [];
    session.scores = {};
    session.examples = false;
    session.more = false;
    session.filter = '';
    session.selected = null;
    session.picked = false;
    session.errors = [];
    session.searching = `Searching job sites${p.location ? ` in ${p.location}` : ''}…`;
    bar.submit.disabled = true;
    bar.submit.textContent = 'Searching…';
    results.replaceChildren(skeleton());
    detail.replaceChildren(h('div', { class: 'detail-empty' }, 'Searching job sites…'));
    detail.dataset.sig = '';
    status.textContent = session.searching;
    const ctl = newAbort();
    const live = () => session.searchRun === run && results.isConnected;
    addIndeed(p, ctl.signal);
    addCvMatches(p);
    try {
      const found = await ai.searchEverywhere(p, {
        onText: (t) => {
          if (!live()) return;
          session.searching = t;
          drawStatus();
        },
        onFound: (jobs) => live() && mergeMain(jobs, p),
        signal: ctl.signal,
        rank: Boolean(store.get().profile.cv.trim()),
      });
      if (!live()) return;
      mergeMain(found.jobs, p);
    } catch (err) {
      if (ctl.signal.aborted || !live()) return;
      if (!session.results.some((j) => !j.extra)) session.errors = [err.message];
    } finally {
      if (session.searchRun === run) {
        session.searching = '';
        bar.submit.disabled = false;
        bar.submit.textContent = 'Search';
      }
    }
    if (!session.results.some((j) => !j.extra) && !session.errors.length) session.errors = [NO_RESULTS];
    drawResults();
    checkResults(ctl.signal);
  }

  // Add jobs to the main results: only the searched place, no repeats, scored
  // against the CV where the source did not score them, best match first.
  function mergeMain(jobs, p) {
    const profile = store.get().profile;
    const me = readProfile(profile);
    const place = p.remoteOnly ? 'remote' : p.location || profile.location;
    const at = Date.now();
    const main = session.results.filter((j) => !j.extra);
    const fresh = [];
    for (const j of onlyIn(jobs, p)) {
      if (isStale(j) || knownClosed(j.url)) continue; // posted too long ago, or found closed before
      const seen = [...main, ...fresh].some((r) => (r.url && r.url === j.url) || sameJob(r, j) || (norm(r.title) === norm(j.title) && norm(r.company) === norm(j.company)));
      if (seen) continue;
      let match = j.match || session.scores[j.id];
      if (!match && (me.roles.length || me.skills.size)) {
        match = scoreJob(j, me, profile.prefs || {}, place);
        if (match.score < 30) continue; // clearly another field or level
      }
      const { _text, ...job } = j;
      void _text;
      fresh.push({ foundAt: at, ...job, ...(match ? { match } : {}) });
    }
    if (!fresh.length) return false;
    for (const j of fresh) if (j.match) session.scores[j.id] = j.match;
    const extras = session.results.filter((j) => j.extra && !fresh.some((f) => f.url === j.url || sameJob(f, j)));
    session.results = [...[...main, ...fresh].sort(byBestMatch), ...extras];
    session.errors = session.errors.filter((e) => e !== NO_RESULTS);
    drawResults();
    return true;
  }

  // Open the job pages (best matches first): take out jobs whose page says
  // they are closed or no longer exists, and fill in missing posting dates.
  async function checkResults(signal) {
    if (session.searching) return; // runs again when the search is done
    const run = (session.datesRun = Symbol('check'));
    const apply = (gone, dates = new Map()) => {
      const dated = (j) => (!j.postedAt && dates.has(j.url) ? { ...j, postedAt: dates.get(j.url) } : j);
      const open = session.results.filter((j) => !gone.has(j.url) && !isStale(j)).map(dated);
      if (open.length === session.results.length && !dates.size) return;
      session.results = [...open.filter((j) => !j.extra).sort(byBestMatch), ...open.filter((j) => j.extra)];
      drawResults();
    };
    try {
      const { dates, gone } = await checkPages(session.results, { signal });
      if (session.datesRun !== run || !results.isConnected) return;
      apply(gone, dates);
      // What the rules could not settle (no date, or over a month old): the AI double-checks.
      const closed = await ai.checkStillOpen(session.results, { signal });
      if (session.datesRun !== run || !results.isConnected || !closed.size) return;
      apply(closed);
    } catch {
      // Unchecked jobs stay listed.
    }
  }

  // Indeed keeps its postings out of web search, so after a search Vora reads
  // Indeed's own results pages for the same query and place and adds the real
  // Indeed jobs the web search did not find, ranked against the CV like the rest.
  async function addIndeed(p, signal) {
    const profile = store.get().profile;
    const query = p.query || profile.targetRoles.split(',')[0]?.trim() || profile.headline.trim();
    const place = p.remoteOnly ? 'remote' : p.location || profile.location;
    if (!query) return;
    const run = (session.indeedRun = Symbol('indeed'));
    try {
      const found = await indeedJobs(query, place, { signal });
      if (session.indeedRun !== run || !results.isConnected || !found.length) return;
      // Indeed hides the posting date; the same job on another site often shows it.
      const known = [...(store.get().feed?.jobs || []), ...(store.get().more?.jobs || []), ...session.results].filter((k) => jobPostedAt(k));
      for (const j of found) {
        const twin = known.find((k) => sameJob(k, j));
        if (twin) j.postedAt = jobPostedAt(twin);
      }
      if (mergeMain(found, p)) checkResults(signal);
    } catch {
      // Indeed is a bonus source; the search results stand on their own.
    }
  }

  // A search with a place shows only jobs in that place (a city, or a whole country).
  const COUNTRY_WORDS = new Set([...Object.values(COUNTRIES).map((c) => norm(c.name)), 'schweiz', 'suisse', 'svizzera', 'deutschland', 'osterreich', 'italia', 'espana', 'brasil', 'nederland', 'belgique', 'uk', 'usa']);
  function onlyIn(jobs, p) {
    const place = String(p.location || '').trim();
    if (!place || p.remoteOnly) return jobs;
    const city = norm(place.split(',')[0]);
    const code = detectCountry(place);
    const wholeCountry = COUNTRY_WORDS.has(city);
    return jobs.filter((j) => {
      const hay = norm(`${j.location} ${j.title} ${String(j.description || '').slice(0, 600)}`);
      if (hay.includes(city)) return true;
      return wholeCountry && code && detectCountry(j.location) === code;
    });
  }

  // After a search: add jobs from the same place that fit the CV and are not
  // already on the home page or in the results (matched on the device, no AI).
  async function addCvMatches(p) {
    const profile = store.get().profile;
    if (!(profile.cv.trim() || profile.targetRoles.trim() || profile.headline.trim())) return;
    const place = p.remoteOnly ? '' : p.location || profile.location;
    if (!place && !p.remoteOnly) return;
    const run = (session.extraRun = Symbol('extra'));
    try {
      const { jobs } = await moreJobsForYou(
        { ...profile, location: place, remoteOnly: Boolean(p.remoteOnly) },
        { exclude: [...(store.get().feed?.jobs || []), ...session.results] },
      );
      if (session.extraRun !== run || !results.isConnected) return;
      const main = session.results.filter((j) => !j.extra);
      const extra = onlyIn(jobs, { ...p, location: place })
        .filter((j) => !main.some((r) => sameJob(r, j)))
        .map((j) => ({ ...j, extra: true }))
        .sort(byBestMatch);
      if (!extra.length) return;
      session.results = [...session.results.filter((j) => !j.extra), ...extra];
      for (const j of extra) if (j.match) session.scores[j.id] = j.match;
      session.extraPlace = p.remoteOnly ? 'remote' : place;
      session.errors = session.errors.filter((e) => e !== NO_RESULTS);
      drawResults();
      checkResults();
    } catch {
      // Extra matches are a bonus; the search results stand on their own.
    }
  }

  async function runBoardSearch() {
    const p = params();
    session.searchRun = null;
    session.searching = '';
    session.picked = false;
    session.query = p;
    session.extraRun = null;
    status.textContent = 'Searching free job boards…';
    results.replaceChildren(skeleton());
    const found = await searchJobs(p);
    const jobs = onlyIn(found.jobs.filter((j) => j.source !== 'Demo'), p).sort(byBestMatch);
    session.examples = false;
    session.more = false;
    session.results = jobs;
    session.scores = {};
    session.errors = jobs.length ? found.errors.filter((e) => e !== 'Showing demo listings') : [NO_RESULTS];
    session.filter = '';
    session.selected = jobs[0]?.id;
    drawResults();
    addCvMatches(p);
  }

  // Before a search: more jobs that fit the CV near the user, beyond the ones
  // already on the home page (matched on the device, no AI).
  const MORE_TTL = 24 * 60 * 60 * 1000;
  async function showMore() {
    const p = store.get().profile;
    const where = p.remoteOnly ? 'remote' : p.location.trim();
    if (!(p.cv.trim() || p.targetRoles.trim() || p.headline.trim()) || !where) {
      session.results = [];
      session.more = false;
      status.textContent = '';
      results.replaceChildren(
        h('div', { class: 'empty card' }, h('p', {}, 'Search above, or add your CV and city in your profile to see jobs picked for you here.'), h('a', { class: 'btn', href: '#/profile' }, 'Open profile')),
      );
      detail.replaceChildren(h('div', { class: 'detail-empty' }, 'Pick a job to see the details here.'));
      detail.dataset.sig = '';
      return;
    }
    const feed = store.get().feed;
    const key = JSON.stringify(['more-v1', currentLanguage(), feed?.key || '', where.toLowerCase()]);
    session.searchRun = null;
    session.searching = '';
    session.picked = false;
    const show = (list) => {
      const jobs = [...list].sort(byBestMatch);
      session.results = jobs;
      session.scores = Object.fromEntries(jobs.filter((j) => j.match).map((j) => [j.id, j.match]));
      session.examples = false;
      session.more = where;
      session.errors = jobs.length ? [] : ['No other matching jobs found right now. Search above to look for something else.'];
      session.filter = '';
      session.selected = jobs[0]?.id;
      if (results.isConnected) drawResults();
    };
    const cached = store.get().more;
    if (cached?.key === key && Date.now() - cached.at < MORE_TTL) return show(cached.jobs);
    status.textContent = `Finding more jobs near ${where} that fit your CV…`;
    results.replaceChildren(skeleton());
    try {
      const { jobs } = await moreJobsForYou(p, { exclude: feed?.jobs || [] });
      const kept = jobs.slice(0, 60).map((j) => ({ ...j, description: String(j.description || '').slice(0, 1500) }));
      store.update((st) => (st.more = { key, at: Date.now(), jobs: kept }));
      show(kept);
    } catch (err) {
      session.more = false;
      if (results.isConnected) {
        status.textContent = err.message || 'Could not load jobs.';
        results.replaceChildren();
      }
    }
  }

  // The line above the results; while a search runs, what it is doing now.
  function drawStatus() {
    const all = session.results;
    const n = all.length;
    const sites = new Set(all.map((j) => j.source)).size;
    const text = session.examples
      ? 'Example listings. Search to see live openings near you.'
      : session.more && n
        ? `${n} more jobs for you near ${session.more} that are not on your home page, best match first`
      : session.errors.length && !n
        ? session.errors.join(' · ')
        : `${n} job${n === 1 ? '' : 's'}${sites > 1 ? ` from ${sites} sites` : ''}${all.some((j) => session.scores[j.id] || j.match) ? ', best match first' : n > 1 ? ', newest first' : ''}` +
          (session.errors.length ? ` · ${session.errors.join(' · ')}` : '');
    if (!session.searching) return void (status.textContent = text);
    if (!n) return void (status.textContent = session.searching);
    status.replaceChildren(h('span', {}, text), ' · ', h('span', { class: 'searching-more' }, 'Still searching, more jobs will appear…'));
  }

  function drawResults() {
    const all = session.results;
    const counts = new Map();
    for (const j of all) counts.set(j.source, (counts.get(j.source) || 0) + 1);
    if (session.filter && !counts.has(session.filter)) session.filter = '';
    const shown = session.filter ? all.filter((j) => j.source === session.filter) : all;
    const n = all.length;
    drawStatus();

    const chip = (label, value, c) => {
      const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(session.filter === value) }, label, h('span', { class: 'chip-count' }, String(c)));
      b.addEventListener('click', () => {
        session.filter = value;
        drawResults();
      });
      return b;
    };
    filters.replaceChildren(
      remoteChip,
      ...(counts.size > 1 && !session.examples ? [chip('All sites', '', n), ...[...counts].sort((a, b) => b[1] - a[1]).map(([k, c]) => chip(k, k, c))] : []),
    );

    if (!shown.length && session.searching) return; // keep the placeholder until the first jobs arrive
    if (!shown.length) {
      results.replaceChildren(h('div', { class: 'empty card' }, h('p', {}, 'No jobs to show. Try broader keywords, or open one of the job sites below.')));
      detail.replaceChildren(h('div', { class: 'detail-empty' }, 'Pick a job to see the details here.'));
      detail.dataset.sig = '';
      return;
    }
    // Until the visitor picks a job, the side panel shows the top result.
    if (!session.picked || !shown.some((j) => j.id === session.selected)) session.selected = shown[0].id;
    // Search results first, then the extra CV matches under their own heading.
    const firstExtra = shown.findIndex((j) => j.extra);
    const cards = shown.map(jobCard);
    if (firstExtra >= 0) {
      const count = shown.length - firstExtra;
      cards.splice(firstExtra, 0, h('div', { class: 'results-divider', role: 'presentation' }, h('strong', {}, `Also matching your CV in ${session.extraPlace}`), h('span', { class: 'small muted' }, `${count} more, not on your home page`)));
    }
    results.replaceChildren(...cards);
    // Leave the open job alone while new results come in, so reading it is not interrupted.
    const sig = `${session.selected}|${session.scores[session.selected]?.score ?? ''}`;
    if (detail.dataset.sig !== sig) {
      detail.dataset.sig = sig;
      drawDetail();
    }
  }

  function select(job) {
    session.selected = job.id;
    session.picked = true;
    for (const c of results.children) c.classList.toggle('selected', c.dataset.id === job.id);
    drawDetail();
    detail.scrollTop = 0;
  }

  function saveToggle(job, small = true) {
    const saved = () => Boolean(store.get().jobs[job.id]);
    const b = h('button', { class: `btn ${small ? 'small' : ''}`, type: 'button', 'aria-pressed': String(saved()) }, saved() ? 'Saved' : 'Save');
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (saved()) return go(`/job/${encodeURIComponent(job.id)}`);
      store.saveJob({ ...job, match: session.scores[job.id] || job.match });
      b.textContent = 'Saved';
      b.setAttribute('aria-pressed', 'true');
      toast('Saved to your applications');
    });
    return b;
  }

  function meta(job) {
    return h(
      'div',
      { class: 'meta' },
      job.location ? h('span', {}, job.location) : '',
      job.salary ? h('span', { class: 'salary' }, job.salary) : '',
      job.remote && !/remote/i.test(job.location || '') ? h('span', {}, 'Remote') : '',
      postedTag(job),
    );
  }

  function jobCard(job) {
    const href = `#/job/${encodeURIComponent(job.id)}`;
    const card = h(
      'article',
      { class: `job-card ${job.id === session.selected && wide() ? 'selected' : ''}`, 'data-id': job.id, role: 'listitem' },
      h('div', { class: 'job-card-head' }, h('div', {}, h('h3', {}, h('a', { href }, job.title)), h('p', { class: 'company' }, job.company || '')), scorePill(session.scores[job.id])),
      meta(job),
      session.scores[job.id]?.reason ? h('p', { class: 'reason' }, session.scores[job.id].reason) : h('p', { class: 'snippet' }, job.description || ''),
      h('div', { class: 'job-card-foot' }, h('span', { class: 'tag source' }, job.source), saveToggle(job)),
    );
    // On wide screens a click opens the job beside the list; on phones it opens the job page.
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      if (wide()) {
        e.preventDefault();
        select(job);
      } else if (!e.target.closest('a')) go(`/job/${encodeURIComponent(job.id)}`);
    });
    return card;
  }

  function drawDetail() {
    const job = session.results.find((j) => j.id === session.selected);
    if (!job) {
      detail.dataset.sig = '';
      return detail.replaceChildren(h('div', { class: 'detail-empty' }, 'Pick a job to see the details here.'));
    }
    const score = session.scores[job.id];
    const open = (tab) => () => {
      try {
        sessionStorage.setItem('ajh:tab', tab);
      } catch {}
      go(`/job/${encodeURIComponent(job.id)}`);
    };
    const tailor = h('button', { class: 'btn primary', type: 'button' }, 'Tailor my CV');
    tailor.addEventListener('click', open('docs'));
    const prep = h('button', { class: 'btn', type: 'button' }, 'Practise interview');
    prep.addEventListener('click', open('prep'));
    detail.replaceChildren(
      h(
        'div',
        { class: 'detail-head' },
        h('h2', {}, job.title),
        h('p', { class: 'company' }, [job.company, job.source].filter(Boolean).join(' · ')),
        meta(job),
        h(
          'div',
          { class: 'detail-actions' },
          tailor,
          job.url ? h('a', { class: 'btn', href: safeUrl(job.url), target: '_blank', rel: 'noopener noreferrer' }, 'View posting ↗') : '',
          saveToggle(job, false),
          prep,
        ),
      ),
      h(
        'div',
        { class: 'detail-body' },
        score ? h('div', { class: 'match-box' }, scorePill(score), h('p', {}, score.reason || 'Ranked against your CV.')) : '',
        h('h3', {}, 'About the role'),
        h('div', { class: 'description' }, job.description || 'No description provided. Open the posting for the full details.'),
      ),
    );
  }

  view.append(
    h('div', { class: 'find-top' }, bar.form, h('div', { class: 'find-tools' }, filters, h('span', { class: 'spacer' }), boardsBtn, scoreBtn)),
    !ai.hasKey() && !inArtifact ? h('div', { class: 'notice' }, 'Add an API key in ', h('a', { href: '#/settings' }, 'Settings'), ' to search every job site at once. Until then, use the free job boards or the site links below.') : '',
    aiStream,
    status,
    h('div', { class: 'split' }, h('div', {}, results, portalBox), detail),
  );
  drawPortals();
  filters.replaceChildren(remoteChip);

  if (session.autoSearch) {
    session.autoSearch = false;
    search();
  } else if (session.results.length) drawResults();
  else showMore();
}

function skeleton() {
  return h('div', { class: 'skeleton-list' }, ...Array.from({ length: 4 }, () => h('div', { class: 'skeleton' })));
}

// ---------------------------------------------------------------------------
// Add job manually
// ---------------------------------------------------------------------------

function renderAddJob() {
  const f = {
    title: h('input', { required: true, placeholder: 'e.g. Senior Product Designer' }),
    company: h('input', { required: true, placeholder: 'e.g. Acme Inc.' }),
    location: h('input', { placeholder: 'e.g. Remote / Paris' }),
    url: h('input', { type: 'url', placeholder: 'https://…' }),
    description: h('textarea', { rows: 12, required: true, placeholder: 'Paste the full job description here' }),
  };
  const form = h(
    'form',
    { class: 'card form' },
    field('Job title', f.title),
    field('Company', f.company),
    h('div', { class: 'grid-2' }, field('Location', f.location), field('Link to posting', f.url)),
    field('Job description', f.description),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit' }, 'Save job')),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const job = {
      id: 'manual:' + Date.now().toString(36),
      source: 'Added by you',
      title: f.title.value.trim(),
      company: f.company.value.trim(),
      location: f.location.value.trim(),
      url: f.url.value.trim(),
      description: f.description.value.trim(),
      tags: [],
    };
    store.saveJob(job);
    toast('Job saved');
    go(`/job/${encodeURIComponent(job.id)}`);
  });
  view.append(pageHeader('Add a job', 'Found something on LinkedIn, Indeed or a company site? Paste it here to tailor and track it.'), form);
}

function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', {}, label), input, hint && h('small', { class: 'muted' }, hint));
}

// ---------------------------------------------------------------------------
// Tracker (kanban)
// ---------------------------------------------------------------------------

function renderTracker() {
  const filter = h('input', { type: 'search', placeholder: 'Filter by title or company', 'aria-label': 'Filter' });
  const board = h('div', { class: 'board' });

  function draw() {
    const term = filter.value.trim().toLowerCase();
    const jobs = Object.values(store.get().jobs).filter((j) => !term || `${j.title} ${j.company}`.toLowerCase().includes(term));
    board.replaceChildren(
      ...STATUSES.map((s) => {
        const items = jobs.filter((j) => j.status === s.id).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
        const col = h(
          'section',
          { class: `column status-${s.id}`, 'data-status': s.id },
          h('header', {}, h('h2', {}, s.label), h('span', { class: 'count' }, String(items.length))),
          h('div', { class: 'column-body' }, ...(items.length ? items.map(trackerCard) : [h('p', { class: 'muted small empty-col' }, 'Drop jobs here')])),
        );
        col.addEventListener('dragover', (e) => {
          e.preventDefault();
          col.classList.add('drop');
        });
        col.addEventListener('dragleave', () => col.classList.remove('drop'));
        col.addEventListener('drop', (e) => {
          e.preventDefault();
          col.classList.remove('drop');
          const id = e.dataTransfer.getData('text/plain');
          if (id) {
            store.setStatus(id, s.id);
            draw();
          }
        });
        return col;
      }),
    );
  }

  function trackerCard(job) {
    const select = h('select', { 'aria-label': 'Status' }, ...STATUSES.map((s) => h('option', { value: s.id, selected: s.id === job.status }, s.label)));
    select.addEventListener('change', () => {
      store.setStatus(job.id, select.value);
      draw();
    });
    const card = h(
      'article',
      { class: 'tracker-card', draggable: 'true' },
      h('a', { href: `#/job/${encodeURIComponent(job.id)}` }, h('strong', {}, job.title)),
      h('p', { class: 'muted small' }, job.company),
      job.match && scorePill(job.match),
      h(
        'div',
        { class: 'tracker-card-foot' },
        h('span', { class: 'muted small' }, job.appliedAt ? `Applied ${fmtDate(job.appliedAt)}` : `Saved ${fmtDate(job.savedAt)}`),
        select,
      ),
    );
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', job.id);
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    return card;
  }

  filter.addEventListener('input', debounce(draw, 120));
  view.append(
    pageHeader('Applications', 'Drag cards between columns, or use the dropdown on each card.', h('a', { class: 'btn', href: '#/add' }, '+ Add job')),
    h('div', { class: 'toolbar' }, filter),
    board,
  );
  draw();
}

// ---------------------------------------------------------------------------
// Job detail: overview, documents, interview prep
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Editing a CV on the page: write a field, add or remove entries
// ---------------------------------------------------------------------------

/**
 * The text typed into an editable field. Unlike innerText this ignores CSS
 * (uppercase headings stay as typed) and turns line breaks into "\n".
 */
function fieldText(el) {
  let out = '';
  for (const n of el.childNodes) {
    if (n.nodeType === 3) out += n.nodeValue;
    else if (n.nodeName === 'BR') out += '\n';
    else if (n.nodeType === 1) out += (/^(DIV|P)$/.test(n.nodeName) && out && !out.endsWith('\n') ? '\n' : '') + fieldText(n);
  }
  return out.replace(/\n$/, '').replace(/\u00a0/g, ' ');
}

/** Set obj[a][b][c] from "a.b.c"; list fields are split on their separator. */
function setAt(obj, path, value, list = '') {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (o[k] === undefined || o[k] === null) o[k] = /^\d+$/.test(k) ? [] : {};
    o = o[k];
  }
  o[keys.at(-1)] = list ? value.split(list).map((x) => x.trim()).filter(Boolean) : value;
}

const BLANK = {
  experience: () => ({ title: '', company: '', location: '', start: '', end: '', bullets: [''] }),
  education: () => ({ degree: '', school: '', location: '', start: '', end: '', details: '' }),
  projects: () => ({ name: '', description: '', link: '' }),
  skills: () => ({ label: '', items: [] }),
};
const FIRST_FIELD = { experience: 'title', education: 'degree', projects: 'name', skills: 'label' };

/** Apply an editing action to a CV in place. Returns the data path to focus next. */
function cvAction(cv, action, path) {
  const keys = path.split('.');
  if (action === 'add') {
    cv[path] = cv[path] || [];
    cv[path].push(BLANK[path]());
    return `${path}.${cv[path].length - 1}.${FIRST_FIELD[path]}`;
  }
  if (action === 'remove') {
    const [list, i] = keys;
    cv[list].splice(Number(i), 1);
    return '';
  }
  // bullets: experience.<i>.bullets.<j>
  const [list, i, , j] = keys;
  const bullets = cv[list][Number(i)].bullets;
  if (action === 'bullet-after') {
    bullets.splice(Number(j) + 1, 0, '');
    return `${list}.${i}.bullets.${Number(j) + 1}`;
  }
  if (action === 'bullet-remove') {
    if (bullets.length > 1) bullets.splice(Number(j), 1);
    return `${list}.${i}.bullets.${Math.max(0, Number(j) - 1)}`;
  }
  return '';
}

// ---------------------------------------------------------------------------
// About the company (job overview)
// ---------------------------------------------------------------------------

const COMPANY_TTL = 14 * 24 * 60 * 60 * 1000;
const companyRuns = new Map(); // company key -> in-flight lookup
const companyKey = (name) => norm(name).replace(/\b(ag|gmbh|sa|sarl|ltd|inc|llc|plc|bv|nv|se|co|kg|cie)\b\.?/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function lookupCompany(job) {
  const key = companyKey(job.company);
  if (!companyRuns.has(key)) {
    companyRuns.set(
      key,
      ai
        .companyProfile(job)
        .then((data) => {
          store.update((s) => {
            s.companies = s.companies || {};
            s.companies[key] = { data, at: Date.now(), lang: currentLanguage() };
            // Keep the cache small: the 40 most recent companies.
            const keys = Object.keys(s.companies).sort((a, b) => s.companies[b].at - s.companies[a].at);
            for (const k of keys.slice(40)) delete s.companies[k];
          });
          return data;
        })
        .finally(() => companyRuns.delete(key)),
    );
  }
  return companyRuns.get(key);
}

function companySection(job) {
  const card = h('section', { class: 'card company-card', 'aria-live': 'polite' });
  const key = companyKey(job.company);
  const fromPosting = aboutFromPosting(job);

  const lookBtn = (label, variant = 'small') => {
    const b = h('button', { class: `btn ${variant}`, type: 'button' }, label);
    b.addEventListener('click', () => start());
    return b;
  };
  const logo = (name) => h('div', { class: 'company-logo', 'aria-hidden': 'true' }, initials(name).slice(0, 2));

  function postingOnly(note, action) {
    card.replaceChildren(
      h('div', { class: 'company-head' }, logo(job.company), h('div', { class: 'company-id' }, h('h2', {}, job.company ? `About ${job.company}` : 'About the company'), note ? h('p', { class: 'small muted' }, note) : '')),
      fromPosting ? h('div', { class: 'company-quote' }, h('p', { class: 'small muted label' }, 'In their own words, from the posting'), h('p', {}, fromPosting)) : '',
      action || '',
    );
  }

  function draw(entry) {
    const c = entry.data;
    const facts = [
      ['Industry', c.industry],
      ['Founded', c.founded],
      ['Headquarters', c.headquarters],
      ['Employees', c.employees],
      ['Ownership', c.ownership],
      ['Employee rating', c.rating],
    ].filter(([, v]) => v);
    const hostOf = (u) => {
      try {
        return new URL(u).hostname.replace(/^www\./, '');
      } catch {
        return u;
      }
    };
    card.replaceChildren(
      h(
        'div',
        { class: 'company-head' },
        logo(c.name),
        h('div', { class: 'company-id' }, h('h2', {}, `About ${c.name}`), c.oneLiner ? h('p', { class: 'muted' }, c.oneLiner) : ''),
        c.website ? h('a', { class: 'btn small', href: safeUrl(c.website), target: '_blank', rel: 'noopener noreferrer' }, 'Website ↗') : '',
      ),
      facts.length ? h('dl', { class: 'company-facts' }, ...facts.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v)))) : '',
      c.whatTheyDo ? h('p', { class: 'company-what' }, c.whatTheyDo) : '',
      c.products.length ? h('div', { class: 'company-tags' }, ...c.products.map((x) => h('span', { class: 'tag' }, x))) : '',
      c.culture.length || c.news.length
        ? h(
            'div',
            { class: 'company-cols' },
            c.culture.length ? h('div', {}, h('h3', {}, 'Working there'), h('ul', {}, ...c.culture.map((x) => h('li', {}, x)))) : '',
            c.news.length
              ? h(
                  'div',
                  {},
                  h('h3', {}, 'Recent news'),
                  h('ul', { class: 'company-news' }, ...c.news.map((n) => h('li', {}, n.url ? h('a', { href: safeUrl(n.url), target: '_blank', rel: 'noopener noreferrer' }, n.title) : n.title, n.date ? h('span', { class: 'small muted' }, ` · ${n.date}`) : ''))),
                )
              : '',
          )
        : '',
      c.talkingPoints.length ? h('div', { class: 'company-tips' }, h('h3', {}, 'Worth mentioning in your application'), h('ul', {}, ...c.talkingPoints.map((x) => h('li', {}, x)))) : '',
      h(
        'div',
        { class: 'company-foot' },
        h('span', { class: 'small muted' }, [c.sources.length ? `From ${c.sources.slice(0, 3).map(hostOf).join(', ')}${c.sources.length > 3 ? ` and ${c.sources.length - 3} more` : ''}` : 'From a web search', `checked ${fmtDate(entry.at)}`].join(' · ')),
        lookBtn('Refresh'),
      ),
    );
  }

  function loading() {
    card.replaceChildren(
      h('div', { class: 'company-head' }, logo(job.company), h('div', { class: 'company-id' }, h('h2', {}, `About ${job.company}`), h('p', { class: 'small muted' }, `Looking up ${job.company}: website, size, news and employee reviews…`))),
      h('div', { class: 'company-facts' }, ...Array.from({ length: 4 }, () => h('div', { class: 'skeleton company-skel' }))),
    );
  }

  async function start() {
    if (!job.company) return;
    loading();
    try {
      await lookupCompany(job);
      if (card.isConnected) draw(store.get().companies[key]);
    } catch (err) {
      if (!card.isConnected) return;
      postingOnly(err.message || 'Could not look up the company.', lookBtn('Try again'));
    }
  }

  const cachedEntry = store.get().companies?.[key];
  // A profile written in another interface language is shown, then refreshed.
  const cached = cachedEntry;
  const otherLanguage = cachedEntry && (cachedEntry.lang || 'en') !== currentLanguage();
  if (!job.company) postingOnly('The posting does not name the company.');
  else if (cached) draw(cached);
  else if (ai.canSearchWeb()) {
    // Look it up straight away; the answer is cached for every job at this company.
    start();
  } else {
    postingOnly(
      inArtifact ? 'Allow web search and Claude for this page to see the full company profile.' : 'Add an API key in Settings to see the full company profile.',
      lookBtn('Look up company', 'small primary'),
    );
  }
  if (cached && (Date.now() - cached.at > COMPANY_TTL || otherLanguage) && ai.canSearchWeb()) start();
  return card;
}

function renderJob(id) {
  const job = findJob(id);
  if (!job) {
    view.append(h('div', { class: 'empty' }, h('p', {}, 'That job is no longer available.'), h('a', { class: 'btn', href: '#/find' }, 'Back to search')));
    return;
  }
  const ensureSaved = () => store.get().jobs[id] || store.saveJob(job);
  const saved = () => Boolean(store.get().jobs[id]);

  const tabs = [
    ['overview', 'Overview'],
    ['docs', 'CV & cover letter'],
    ['prep', 'Interview game'],
  ];
  const tabBar = h('div', { class: 'tabs', role: 'tablist' });
  const panel = h('div', { class: 'tab-panel' });
  let active = 'overview';
  try {
    active = sessionStorage.getItem('ajh:tab') || 'overview';
  } catch {}

  function showTab(key) {
    active = key;
    try {
      sessionStorage.setItem('ajh:tab', key);
    } catch {}
    tabBar.replaceChildren(
      ...tabs.map(([k, label]) => {
        const b = h('button', { role: 'tab', class: k === key ? 'active' : '', 'aria-selected': String(k === key) }, label);
        b.addEventListener('click', () => {
          currentAbort?.abort();
          showTab(k);
        });
        return b;
      }),
    );
    panel.replaceChildren();
    ({ overview: overviewTab, docs: docsTab, prep: prepTab })[key]();
  }

  // ----- Overview -----
  function overviewTab() {
    const current = store.get().jobs[id];
    const side = h('aside', { class: 'card side' });

    if (current) {
      const select = h('select', {}, ...STATUSES.map((s) => h('option', { value: s.id, selected: s.id === current.status }, s.label)));
      select.addEventListener('change', () => {
        store.setStatus(id, select.value);
        toast(`Moved to ${STATUSES.find((s) => s.id === select.value).label}`);
      });
      const notes = h('textarea', { rows: 6, placeholder: 'Contacts, salary notes, next steps…' }, current.notes || '');
      notes.addEventListener('input', debounce(() => store.update((s) => (s.jobs[id].notes = notes.value)), 400));
      const remove = confirmButton('Remove job', 'Tap again to remove', () => {
        store.removeJob(id);
        toast('Job removed');
        go('/tracker');
      }, 'btn danger small');
      side.append(
        field('Status', select),
        field('Notes', notes),
        current.history?.length
          ? h('div', { class: 'timeline' }, h('h3', {}, 'History'), ...current.history.map((e) => h('p', { class: 'small' }, `${fmtDate(e.at)} · ${STATUSES.find((s) => s.id === e.status)?.label}`)))
          : '',
        remove,
      );
    } else {
      const save = h('button', { class: 'btn primary' }, 'Save to tracker');
      save.addEventListener('click', () => {
        ensureSaved();
        toast('Saved');
        showTab('overview');
      });
      side.append(h('p', { class: 'muted' }, 'Save this job to track it and keep its documents.'), save);
    }

    const fit = h('div', { class: 'ai-output' });
    const prevFit = store.get().docs[id]?.fit;
    if (prevFit) fit.replaceChildren(md(prevFit));
    const fitBtn = aiButton(prevFit ? 'Re-run fit analysis' : 'Analyse my fit', {
      output: fit,
      task: (onText, signal) => ai.analyzeGap(job, { onText, signal }),
      onDone: (text) => {
        ensureSaved();
        store.update((s) => (s.docs[id] = { ...s.docs[id], fit: text }));
      },
    });

    panel.append(
      h(
        'div',
        { class: 'detail-grid' },
        h(
          'div',
          {},
          h('section', { class: 'card' }, h('div', { class: 'row space' }, h('h2', {}, 'Fit analysis'), fitBtn), fit),
          companySection(job),
          h('section', { class: 'card' }, h('h2', {}, 'Job description'), h('div', { class: 'description' }, job.description || 'No description provided.')),
        ),
        side,
      ),
    );
  }

  // ----- Documents -----

  // Shows stock AI phrases or dash punctuation left in a text, with a fix button.
  function writingCheck(text, fix) {
    const { phrases, dashes } = styleIssues(text);
    if (!phrases.length && !dashes) {
      return h('p', { class: 'writing-check ok small' }, h('strong', {}, 'Writing check: '), 'no dashes or stock AI phrases found.');
    }
    const found = [...phrases.map((p) => `"${p.replace(/^i /, "I ")}"`), ...(dashes ? [`${dashes} dash${dashes === 1 ? '' : 'es'}`] : [])];
    const btn = aiButton('Fix wording', { variant: 'small', task: async (_t, signal) => (await fix(phrases.length ? phrases : ['dashes used as punctuation'], signal), '') });
    return h('div', { class: 'writing-check warn small' }, h('p', {}, h('strong', {}, 'Writing check: '), `still sounds generated in places: ${found.join(', ')}.`), btn);
  }

  function docsTab() {
    panel.append(keyNotice() || '', profileNotice() || '', cvSection(), letterSection());
  }

  const docs = () => store.get().docs[id] || {};
  const saveDoc = (patch) => {
    ensureSaved();
    store.update((s) => (s.docs[id] = { ...s.docs[id], ...patch, updatedAt: Date.now() }));
  };
  const template = () => getTemplate(docs().template).id;
  const accent = () => accentFor(getTemplate(template()), docs().accent);
  const fileBase = () => slug(`${store.get().profile.name || 'cv'}-${job.company}`);

  // -----------------------------------------------------------------
  // Full-screen document viewer, shared by the CV and the cover letter:
  // the A4 page on the left, a panel with Template + the document's own tabs.
  // -----------------------------------------------------------------
  function openDocStudio(cfg) {
    if (document.querySelector('.studio')) return;
    const returnFocus = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const paperScale = h('div', { class: 'paper-scale' });
    const paperFit = h('div', { class: 'paper-fit' }, paperScale);
    const busy = h('div', { class: 'studio-busy', hidden: true }, h('div', { class: 'studio-busy-msg', role: 'status' }));
    const stage = h('main', { class: 'studio-stage' }, paperFit, busy);
    const pane = h('div', { class: 'studio-pane' });
    const tabs = h('nav', { class: 'studio-tabs', role: 'tablist' });
    const panel = h('aside', { class: 'studio-panel' }, tabs, pane);
    const sheetOpen = () => panel.classList.contains('open');

    let zoom = 'fit';
    const zoomBtn = h('button', { type: 'button', class: 'btn small studio-zoom' }, 'Actual size');
    zoomBtn.addEventListener('click', () => {
      zoom = zoom === 'fit' ? 'actual' : 'fit';
      zoomBtn.textContent = zoom === 'fit' ? 'Actual size' : 'Fit to screen';
      fit();
    });

    const pdf = h('button', { type: 'button', class: 'btn primary small' });
    pdf.addEventListener('click', () => cfg.download(pdf));
    const close = h('button', { type: 'button', class: 'btn small studio-close', 'aria-label': 'Close' }, '← Back');

    // Edit on page: the A4 page itself becomes the editor, like a Word document.
    let editing = false;
    const editBtn = h('button', { type: 'button', class: 'btn small studio-edit', 'aria-pressed': 'false' }, svgIcon(PENCIL), h('span', {}, 'Edit on page'));
    const hint = h('div', { class: 'studio-hint', role: 'status', hidden: true }, 'Click any text to change it. Enter adds a bullet point. Everything saves as you type.');
    editBtn.addEventListener('click', () => setEditing(!editing));
    function setEditing(on) {
      editing = on;
      editBtn.setAttribute('aria-pressed', String(on));
      editBtn.classList.toggle('primary', on);
      editBtn.lastChild.textContent = on ? 'Done editing' : 'Edit on page';
      hint.hidden = !on;
      // Small screens: like Word's mobile view, the page reflows to the screen width while editing
      // (same template, readable text, no sideways scrolling). The PDF stays A4.
      studio.classList.toggle('reflow', on && window.innerWidth < 760);
      if (on && window.innerWidth < 900) panel.classList.remove('open');
      renderPaper();
      drawTabs();
      if (on) requestAnimationFrame(() => paperScale.querySelector('.ed')?.focus());
    }
    const studio = h(
      'div',
      { class: 'studio', role: 'dialog', 'aria-modal': 'true', 'aria-label': cfg.title },
      h(
        'header',
        { class: 'studio-bar' },
        close,
        h('div', { class: 'studio-title' }, h('strong', {}, cfg.title), h('span', {}, [job.title, job.company].filter(Boolean).join(' at '))),
        h('div', { class: 'studio-actions' }, editBtn, zoomBtn, pdf),
      ),
      hint,
      h('div', { class: 'studio-body' }, stage, panel),
    );

    // Fit the A4 page to the available width.
    function fit() {
      const page = paperScale.firstElementChild;
      if (!page) return;
      const avail = stage.clientWidth - (window.innerWidth < 760 ? 24 : 64);
      const scale = zoom === 'fit' ? Math.min(1, avail / page.offsetWidth) : 1;
      paperScale.style.transform = `scale(${scale})`;
      paperFit.style.width = `${page.offsetWidth * scale}px`;
      paperFit.style.height = `${page.offsetHeight * scale}px`;
    }
    const ro = new ResizeObserver(fit);
    ro.observe(stage);

    // Typing on the page writes straight into the document's data.
    const changed = debounce(() => cfg.onChange?.(), 600);
    paperScale.addEventListener('input', (e) => {
      const el = e.target.closest?.('[data-path]');
      if (!el || !editing) return;
      cfg.setField(el.dataset.path, fieldText(el), el.dataset.list || '');
      changed();
      requestAnimationFrame(fit);
    });
    paperScale.addEventListener('keydown', (e) => {
      const el = e.target.closest?.('[data-path]');
      if (!el || !editing) return;
      const path = el.dataset.path;
      const bullet = /\.bullets\.\d+$/.test(path);
      if (e.key === 'Enter' && !e.shiftKey && !el.dataset.multi) {
        e.preventDefault();
        if (bullet && cfg.action) {
          const next = cfg.action('bullet-after', path);
          renderPaper(next);
          changed();
        }
      } else if (e.key === 'Backspace' && bullet && !fieldText(el).trim() && cfg.action) {
        e.preventDefault();
        const prev = cfg.action('bullet-remove', path);
        renderPaper(prev);
        changed();
      }
    });
    paperScale.addEventListener('click', (e) => {
      const b = e.target.closest?.('.ed-ctl');
      if (!b || !editing || !cfg.action) return;
      const focusPath = cfg.action(b.dataset.action, b.dataset.path);
      renderPaper(focusPath);
      changed();
    });
    // Browsers without plaintext-only editing: paste as plain text.
    paperScale.addEventListener('paste', (e) => {
      if (!editing || !e.target.closest?.('[data-path]')) return;
      const text = e.clipboardData?.getData('text/plain');
      if (text == null) return;
      e.preventDefault();
      document.execCommand('insertText', false, text);
    });

    function renderPaper(focusPath, caretAtEnd = true) {
      const t = getTemplate(cfg.tplId());
      paperScale.replaceChildren(cfg.page(t.id, cfg.accent(), { editable: editing }));
      if (focusPath) {
        const el = [...paperScale.querySelectorAll('[data-path]')].find((x) => x.dataset.path === focusPath);
        if (el) {
          el.focus();
          const r = document.createRange();
          r.selectNodeContents(el);
          r.collapse(!caretAtEnd ? true : false);
          const sel = getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
        }
      }
      pdf.textContent = `Download PDF · ${t.name}`;
      requestAnimationFrame(fit);
    }

    const TABS = [['template', 'Template'], ...cfg.tabs];
    let tab = 'template';
    function drawTabs() {
      tabs.replaceChildren(
        ...TABS.map(([k, label]) => {
          const b = h('button', { type: 'button', role: 'tab', 'aria-selected': String(sheetOpen() && tab === k), class: tab === k ? 'active' : '' }, label);
          b.addEventListener('click', () => {
            // On phones the panel is a bottom sheet: tapping the open tab folds it away.
            if (tab === k && sheetOpen() && window.innerWidth < 900) panel.classList.remove('open');
            else {
              tab = k;
              panel.classList.add('open');
            }
            drawTabs();
            drawPane();
          });
          return b;
        }),
      );
    }

    let thumbsFor = null;
    const gallery = h('div', { class: 'tpl-gallery studio-gallery', role: 'group', 'aria-label': 'Template' });
    function drawPane() {
      const t = getTemplate(cfg.tplId());
      if (tab !== 'template') return cfg.drawTab(tab, pane, { rework, refresh, renderPaper });
      if (thumbsFor !== cfg.content()) {
        thumbsFor = cfg.content();
        gallery.replaceChildren(
          ...TEMPLATES.map((x) => {
            const b = h(
              'button',
              { type: 'button', class: 'tpl-card', 'data-id': x.id, 'aria-label': `${x.name} template` },
              h('div', { class: 'tpl-thumb', 'aria-hidden': 'true' }, cfg.page(x.id, x.accent)),
              h('strong', {}, x.name),
              h('span', { class: `tpl-badge ${x.ats ? '' : 'warn'}` }, x.ats ? 'ATS friendly' : 'Less ATS friendly'),
            );
            b.addEventListener('click', () => {
              cfg.pick({ template: x.id });
              refresh();
            });
            return b;
          }),
        );
      }
      for (const b of gallery.children) b.setAttribute('aria-pressed', String(b.dataset.id === t.id));
      pane.replaceChildren(
        gallery,
        cfg.templateNote ? cfg.templateNote({ refresh }) : '',
        h('p', { class: 'tpl-info' }, h('strong', {}, `${t.name}. `), t.blurb),
        t.accents
          ? h(
              'div',
              { class: 'swatches', role: 'group', 'aria-label': 'Colour' },
              h('span', { class: 'muted small' }, 'Colour'),
              ...t.accents.map((c) => {
                const sw = h('button', { type: 'button', class: 'swatch', style: `background:${c}`, 'aria-label': `Colour ${c}`, 'aria-pressed': String(cfg.accent() === c) });
                sw.addEventListener('click', () => {
                  cfg.pick({ accent: c });
                  refresh();
                });
                return sw;
              }),
            )
          : '',
      );
    }

    // Run a change that takes a while, with the page dimmed, then redraw.
    async function rework(message, fn) {
      busy.hidden = false;
      busy.firstChild.textContent = message;
      try {
        await fn();
        refresh();
      } finally {
        busy.hidden = true;
      }
    }

    function refresh() {
      renderPaper();
      drawTabs();
      drawPane();
      cfg.onChange?.();
    }

    function shut() {
      ro.disconnect();
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      studio.classList.add('closing');
      setTimeout(() => studio.remove(), 160);
      returnFocus?.focus?.();
    }
    const onKey = (e) => {
      if (e.key === 'Escape') shut();
    };
    document.addEventListener('keydown', onKey);
    close.addEventListener('click', shut);
    // Close if the job page goes away underneath (route change).
    const gone = new MutationObserver(() => {
      if (!cfg.root().isConnected) {
        gone.disconnect();
        if (studio.isConnected) shut();
      }
    });
    gone.observe(document.getElementById('view'), { childList: true });

    if (window.innerWidth >= 900) panel.classList.add('open');
    document.body.append(studio);
    renderPaper();
    drawTabs();
    drawPane();
    close.focus();
  }

  async function savePDF(definition, filename, btn) {
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Making PDF…';
    try {
      await download(filename, await makePDF(definition), 'application/pdf');
    } catch (err) {
      console.error(err);
      toast('Could not make the PDF. Check your connection and try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  // Tailored CV: structured data, laid out with a template, exported as PDF.
  function cvSection() {
    const status = h('div', { class: 'ai-output compact-status', role: 'status' });
    const body = h('div');

    const gen = aiButton('Create tailored CV', {
      output: status,
      task: async (_onText, signal) => {
        status.replaceChildren(h('p', { class: 'muted' }, 'Claude is rewriting your CV for this job. This takes about a minute.'));
        const cvData = await ai.tailorCV(job, { signal });
        saveDoc({ cvData, cv: cvToText(cvData) });
        draw();
        openStudio();
        return '';
      },
    });

    const pdfBtn = h('button', { class: 'btn small', type: 'button' }, 'Download PDF');
    pdfBtn.addEventListener('click', () => downloadCV(pdfBtn));

    function draw() {
      const d = docs();
      gen.textContent = d.cvData ? 'Rewrite from scratch' : 'Create tailored CV';
      gen.classList.toggle('primary', !d.cvData);
      gen.classList.toggle('small', Boolean(d.cvData));
      if (d.cvData) {
        const t = getTemplate(template());
        const thumb = h('button', { type: 'button', class: 'cv-ready-thumb', 'aria-label': 'Open your CV' }, h('div', { class: 'tpl-thumb' }, renderCV(d.cvData, t.id, accent())));
        const open = h('button', { type: 'button', class: 'btn primary' }, 'Open CV');
        for (const el of [thumb, open]) el.addEventListener('click', openStudio);
        pdfBtn.textContent = `Download PDF · ${t.name}`;
        body.replaceChildren(
          h(
            'div',
            { class: 'cv-ready' },
            thumb,
            h(
              'div',
              { class: 'cv-ready-info' },
              h('p', { class: 'cv-ready-state' }, 'Ready to send'),
              h('p', { class: 'muted small' }, `${t.name} template${d.updatedAt ? ` · updated ${fmtDate(d.updatedAt)}` : ''}`),
              d.cvData.changes?.length ? h('p', { class: 'small' }, d.cvData.changes[0]) : '',
              h('div', { class: 'row wrap' }, open, pdfBtn, gen),
            ),
          ),
        );
      } else {
        body.replaceChildren(
          d.cv
            ? h('div', { class: 'ai-output doc' }, md(d.cv))
            : h(
                'div',
                { class: 'empty-doc' },
                h('strong', {}, 'Your CV, rewritten for this job'),
                h('p', { class: 'muted' }, 'Claude reorders and rewrites your experience around what this role asks for, uses the posting\'s own keywords, and lays it out in a professional template you can download as a PDF. It never adds experience you don\'t have.'),
              ),
          h('div', { class: 'row', style: 'margin-top:0.8rem' }, gen),
        );
      }
    }

    async function downloadCV(btn) {
      await savePDF(cvPDFDefinition(docs().cvData, template(), accent()), `${fileBase()}-cv-${template()}.pdf`, btn);
    }

    // -----------------------------------------------------------------
    // Full-screen CV viewer
    // -----------------------------------------------------------------
    function openStudio() {
      if (!docs().cvData) return;
      openDocStudio({
        title: 'Your CV',
        root: () => panelRoot,
        content: () => docs().cvData,
        tplId: template,
        accent,
        page: (id, color, opts) => renderCV(docs().cvData, id, color, opts),
        pick: (patch) => saveDoc(patch),
        download: downloadCV,
        setField(path, value, list) {
          const cvData = structuredClone(docs().cvData);
          setAt(cvData, path, value, list);
          saveDoc({ cvData, cv: cvToText(cvData) });
        },
        action(action, path) {
          const cvData = structuredClone(docs().cvData);
          const next = cvAction(cvData, action, path);
          saveDoc({ cvData, cv: cvToText(cvData) });
          return next;
        },
        tabs: [
          ['changes', 'What changed'],
          ['edit', 'Edit'],
        ],
        onChange: draw,
        drawTab(tab, pane, { rework }) {
          const cv = docs().cvData;
          const reworkCV = (instructions, signal, message) =>
            rework(message, async () => {
              const cvData = await ai.tailorCV(job, { instructions, previous: docs().cvData, signal });
              cvData.titles = { ...(docs().cvData?.titles || {}), ...(cvData.titles || {}) };
              saveDoc({ cvData, cv: cvToText(cvData) });
            });
          if (tab === 'changes') {
            pane.replaceChildren(
              h(
                'div',
                { class: 'cv-notes' },
                ...(cv.changes?.length ? [h('h3', {}, 'What changed for this job'), h('ul', {}, ...cv.changes.map((c) => h('li', {}, c)))] : [h('p', { class: 'muted' }, 'No change notes for this version.')]),
                ...(cv.keywords?.length ? [h('h3', {}, 'Keywords covered'), h('div', { class: 'tags' }, ...cv.keywords.map((k) => h('span', { class: 'tag' }, k)))] : []),
                writingCheck(cvProse(cv), (phrases, signal) =>
                  reworkCV(`Rewrite only the lines that use these phrases: ${phrases.join(', ')}. Use plain, specific wording a person would use about their own work, and no dashes as punctuation. Keep everything else the same.`, signal, 'Rewording those lines…'),
                ),
              ),
            );
          } else {
            const input = h('textarea', { id: 'studio-change', rows: 3, placeholder: 'e.g. make it one page, stress leadership, drop the 2015 job' });
            const out = h('div', { class: 'small error', role: 'status' });
            const apply = aiButton('Update CV', {
              output: out,
              task: async (_t, signal) => {
                const instructions = input.value.trim();
                if (!instructions) throw new Error('Say what you want changed first.');
                await reworkCV(instructions, signal, 'Updating your CV…');
                return '';
              },
            });
            input.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) apply.click();
            });
            const cp = h('button', { class: 'btn small', type: 'button' }, 'Copy as text');
            cp.addEventListener('click', () => copy(docs().cv || ''));
            const txt = h('button', { class: 'btn small', type: 'button' }, 'Download text');
            txt.addEventListener('click', () => download(`${fileBase()}-cv.txt`, docs().cv || ''));
            pane.replaceChildren(
              h('label', { class: 'small strong', for: 'studio-change' }, 'Ask Claude for changes'),
              input,
              h('div', { class: 'row' }, apply),
              out,
              h('h3', { class: 'small strong pane-sub' }, 'Paste into application forms'),
              h('div', { class: 'row wrap' }, cp, txt),
            );
          }
        },
      });
    }

    const panelRoot = h('section', { class: 'card' }, h('h2', {}, 'Tailored CV'), status, body);
    draw();
    return panelRoot;
  }

  function letterSection() {
    const status = h('div', { class: 'ai-output compact-status', role: 'status' });
    const body = h('div');
    const letterCV = () => docs().cvData || cvFromProfile(store.get().profile);
    // The letter follows the CV's template until the user picks another one for it.
    const letterTpl = () => getTemplate(docs().letterTemplate || template()).id;
    const letterAccent = () => accentFor(getTemplate(letterTpl()), docs().letterAccent || (docs().letterTemplate ? '' : docs().accent));
    const meta = () => ({
      title: job.title,
      company: job.company,
      location: job.location,
      date: docs().letterDate,
      // Lines retyped on the page
      dateLine: docs().letterDateLine,
      recipient: docs().letterRecipient,
      subject: docs().letterSubject,
    });
    const page = (id, color, opts) => renderLetter(letterCV(), docs().coverLetter || '', id, color, meta(), opts);
    // Header fields on the letter belong to the person: the tailored CV for this job, or the profile.
    const PROFILE_FIELD = { name: 'name', headline: 'headline', 'contact.email': 'email', 'contact.phone': 'phone', 'contact.location': 'location' };
    function setLetterField(path, value, list) {
      const own = { 'letter.date': 'letterDateLine', 'letter.to': 'letterRecipient', 'letter.subject': 'letterSubject', 'letter.body': 'coverLetter' }[path];
      if (own) return saveDoc({ [own]: value });
      if (docs().cvData) {
        const cvData = structuredClone(docs().cvData);
        setAt(cvData, path, value, list);
        return saveDoc({ cvData, cv: cvToText(cvData) });
      }
      if (PROFILE_FIELD[path]) store.update((st) => (st.profile[PROFILE_FIELD[path]] = value.trim()));
    }

    const tone = h('select', { 'aria-label': 'Tone' }, ...['professional', 'warm and enthusiastic', 'concise and direct', 'formal'].map((t) => h('option', { value: t }, t)));
    const gen = aiButton('Write cover letter', {
      output: status,
      task: async (onText, signal) => {
        status.replaceChildren(h('p', { class: 'muted' }, 'Claude is writing your letter…'));
        const text = await ai.writeCoverLetter(job, { tone: tone.value, signal });
        saveDoc({ coverLetter: text, letterDate: Date.now() });
        status.replaceChildren();
        draw();
        openLetter();
        return '';
      },
    });
    const pdfBtn = h('button', { class: 'btn small', type: 'button' }, 'Download PDF');
    pdfBtn.addEventListener('click', () => downloadLetter(pdfBtn));

    async function downloadLetter(btn) {
      if (!docs().coverLetter) return toast('Write the letter first');
      await savePDF(letterPDFDefinition(letterCV(), docs().coverLetter, letterTpl(), letterAccent(), meta()), `${fileBase()}-cover-letter-${letterTpl()}.pdf`, btn);
    }

    function draw() {
      const d = docs();
      gen.textContent = d.coverLetter ? 'Rewrite from scratch' : 'Write cover letter';
      gen.classList.toggle('primary', !d.coverLetter);
      gen.classList.toggle('small', Boolean(d.coverLetter));
      if (d.coverLetter) {
        const t = getTemplate(letterTpl());
        const thumb = h('button', { type: 'button', class: 'cv-ready-thumb', 'aria-label': 'Open your cover letter' }, h('div', { class: 'tpl-thumb' }, page(t.id, letterAccent())));
        const open = h('button', { type: 'button', class: 'btn primary' }, 'Open letter');
        for (const el of [thumb, open]) el.addEventListener('click', openLetter);
        pdfBtn.textContent = `Download PDF · ${t.name}`;
        const words = d.coverLetter.trim().split(/\s+/).length;
        body.replaceChildren(
          h(
            'div',
            { class: 'cv-ready' },
            thumb,
            h(
              'div',
              { class: 'cv-ready-info' },
              h('p', { class: 'cv-ready-state' }, 'Ready to send'),
              h('p', { class: 'muted small' }, `${t.name} template${d.letterTemplate ? '' : ', matching your CV'} · ${words} words${d.updatedAt ? ` · updated ${fmtDate(d.updatedAt)}` : ''}`),
              h('div', { class: 'row wrap' }, open, pdfBtn),
              h('div', { class: 'row wrap letter-regen' }, tone, gen),
            ),
          ),
        );
      } else {
        body.replaceChildren(
          h(
            'div',
            { class: 'empty-doc' },
            h('strong', {}, 'A cover letter for this job'),
            h('p', { class: 'muted' }, 'Claude writes a specific, human-sounding letter from your CV and lays it out as a proper business letter in the same template as your CV. You can switch templates and colours, edit it and download it as a PDF.'),
          ),
          h('div', { class: 'row wrap', style: 'margin-top:0.8rem' }, tone, gen),
        );
      }
    }

    function openLetter() {
      if (!docs().coverLetter) return;
      openDocStudio({
        title: 'Your cover letter',
        root: () => root,
        content: () => docs().coverLetter,
        tplId: letterTpl,
        accent: letterAccent,
        page,
        pick: (patch) => saveDoc('template' in patch ? { letterTemplate: patch.template, letterAccent: '' } : { letterAccent: patch.accent }),
        download: downloadLetter,
        setField: setLetterField,
        tabs: [
          ['edit', 'Edit'],
          ['check', 'Writing check'],
        ],
        onChange: draw,
        templateNote: ({ refresh }) => {
          if (!docs().letterTemplate || docs().letterTemplate === template()) return h('p', { class: 'small muted' }, 'Matches the template of your CV for this job.');
          const same = h('button', { type: 'button', class: 'btn small' }, `Use my CV's template (${getTemplate(template()).name})`);
          same.addEventListener('click', () => {
            saveDoc({ letterTemplate: '', letterAccent: '' });
            refresh();
          });
          return same;
        },
        drawTab(tab, pane, { rework, renderPaper }) {
          const letter = docs().coverLetter || '';
          if (tab === 'edit') {
            const editor = h('textarea', { id: 'letter-text', class: 'doc-editor', rows: 14 }, letter);
            editor.addEventListener(
              'input',
              debounce(() => {
                saveDoc({ coverLetter: editor.value });
                renderPaper();
                draw();
              }, 300),
            );
            const input = h('textarea', { id: 'letter-change', rows: 2, placeholder: 'e.g. shorter, mention my team lead role, warmer ending' });
            const out = h('div', { class: 'small error', role: 'status' });
            const apply = aiButton('Update letter', {
              output: out,
              variant: 'small primary',
              task: async (_t, signal) => {
                const instructions = input.value.trim();
                if (!instructions) throw new Error('Say what you want changed first.');
                await rework('Updating your letter…', async () => {
                  saveDoc({ coverLetter: await ai.writeCoverLetter(job, { tone: tone.value, instructions, previous: docs().coverLetter, signal }) });
                });
                return '';
              },
            });
            const cp = h('button', { class: 'btn small', type: 'button' }, 'Copy as text');
            cp.addEventListener('click', () => copy(docs().coverLetter || ''));
            const txt = h('button', { class: 'btn small', type: 'button' }, 'Download text');
            txt.addEventListener('click', () => download(`${fileBase()}-cover-letter.txt`, docs().coverLetter || ''));
            pane.replaceChildren(
              h('label', { class: 'small strong', for: 'letter-text' }, 'Letter text'),
              h('p', { class: 'small muted', style: 'margin:0' }, 'Changes show on the page as you type. Leave an empty line between paragraphs.'),
              editor,
              h('label', { class: 'small strong pane-sub', for: 'letter-change' }, 'Ask Claude for changes'),
              input,
              h('div', { class: 'row' }, apply),
              out,
              h('h3', { class: 'small strong pane-sub' }, 'Paste into application forms'),
              h('div', { class: 'row wrap' }, cp, txt),
            );
          } else {
            pane.replaceChildren(
              h('div', { class: 'cv-notes' }, writingCheck(letter, (phrases, signal) =>
                rework('Rewording those lines…', async () => {
                  saveDoc({ coverLetter: await ai.reviseLetter(job, docs().coverLetter, phrases, { signal }) });
                }),
              )),
            );
          }
        },
      });
    }

    const root = h('section', { class: 'card' }, h('h2', {}, 'Cover letter'), status, body);
    draw();
    return root;
  }

  // ----- Interview prep -----
  function prepTab() {
    const root = h('div', { class: 'game-root' });
    panel.append(keyNotice() || '', root);
    renderInterviewGame(root, job, { ensureSaved });
  }

  const match = job.match || store.get().jobs[id]?.match;
  const applyBtn = job.url ? h('a', { class: 'btn primary', href: safeUrl(job.url), target: '_blank', rel: 'noopener noreferrer' }, 'Apply on company site ↗') : '';
  const saveBtn = h('button', { class: 'btn', type: 'button' }, saved() ? 'Saved' : 'Save job');
  saveBtn.disabled = saved();
  saveBtn.addEventListener('click', () => {
    ensureSaved();
    saveBtn.textContent = 'Saved';
    saveBtn.disabled = true;
    toast('Saved to your applications');
  });
  const header = h(
    'div',
    {},
    h('a', { class: 'back', href: saved() ? '#/tracker' : '#/find' }, '← Back'),
    h(
      'header',
      { class: 'job-hero' },
      h('div', { class: 'row space wrap', style: 'align-items:flex-start' }, h('h1', {}, job.title), scorePill(match)),
      h('p', { class: 'company' }, job.company || ''),
      h(
        'div',
        { class: 'meta' },
        job.location ? h('span', {}, job.location) : '',
        job.salary ? h('span', { class: 'salary' }, job.salary) : '',
        job.source ? h('span', {}, `via ${job.source}`) : '',
        postedTag(job, 'Posting date not given'),
        saved() ? statusBadge(store.get().jobs[id].status) : '',
      ),
      match?.reason ? h('p', { class: 'small', style: 'margin:var(--sp-3) 0 0;color:var(--text-2)' }, match.reason) : '',
      h('div', { class: 'detail-actions' }, applyBtn, saveBtn),
    ),
  );

  view.append(header, tabBar, panel);
  showTab(tabs.some(([k]) => k === active) ? active : 'overview');
}

function slug(s = '') {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'doc';
}

function safeUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '#';
  } catch {
    return '#';
  }
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

const WORK_MODES = ['Remote', 'Hybrid', 'On-site'];
const JOB_TYPES = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship'];
const AVAILABILITY = ['', 'Immediately', 'Within 2 weeks', 'Within 1 month', 'Within 2 months', 'In 3 months or more'];
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'INR', 'SEK', 'NOK', 'DKK', 'PLN', 'ZAR', 'AED', 'SGD', 'BRL', 'MXN'];

const splitList = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);

/** Tag input: chips you can add with Enter or comma and remove with ×. */
function tagInput({ id, values, placeholder, onChange, max = 30 }) {
  let tags = [...values];
  const list = h('div', { class: 'tag-list' });
  const input = h('input', { id, type: 'text', placeholder, autocomplete: 'off', class: 'tag-entry' });
  const wrap = h('div', { class: 'tag-input' }, list, input);
  wrap.addEventListener('click', (e) => e.target === wrap && input.focus());
  const commit = () => onChange(tags);
  function draw() {
    list.replaceChildren(
      ...tags.map((t, i) => {
        const x = h('button', { type: 'button', class: 'tag-x', 'aria-label': `Remove ${t}` }, '×');
        x.addEventListener('click', () => {
          tags.splice(i, 1);
          draw();
          commit();
          input.focus();
        });
        return h('span', { class: 'tag-chip' }, t, x);
      }),
    );
    input.placeholder = tags.length ? 'Add more' : placeholder;
  }
  function add(raw) {
    const parts = raw.split(',').map((x) => x.trim()).filter(Boolean);
    let added = false;
    for (const part of parts) {
      if (tags.length < max && !tags.some((t) => t.toLowerCase() === part.toLowerCase())) {
        tags.push(part);
        added = true;
      }
    }
    if (added) {
      draw();
      commit();
    }
  }
  input.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
      e.preventDefault();
      add(input.value);
      input.value = '';
    } else if (e.key === 'Backspace' && !input.value && tags.length) {
      tags.pop();
      draw();
      commit();
    }
  });
  input.addEventListener('blur', () => {
    if (input.value.trim()) {
      add(input.value);
      input.value = '';
    }
  });
  draw();
  return { el: wrap, set(v) { tags = [...v]; draw(); } };
}

/** Multi-select pill group. */
function pillGroup({ label, options, values, onChange }) {
  const chosen = new Set(values);
  const group = h('div', { class: 'pill-group', role: 'group', 'aria-label': label });
  for (const o of options) {
    const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(chosen.has(o)) }, o);
    b.addEventListener('click', () => {
      chosen.has(o) ? chosen.delete(o) : chosen.add(o);
      b.setAttribute('aria-pressed', String(chosen.has(o)));
      onChange(options.filter((x) => chosen.has(x)));
    });
    group.append(b);
  }
  return group;
}

/** Attach place or job-title suggestions to an input once it is in the page. */
function withSuggest(input, kind) {
  queueMicrotask(() => input.parentNode && attachSuggest(input, kind));
  return input;
}

// Profile photo: picked on the device, cropped to a centred square and shrunk
// to a small JPEG (about 20 to 40 KB) so it stays light enough to sync.
const CAMERA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>';

async function photoFromFile(file) {
  if (!/^image\//.test(file.type)) throw new Error('Choose an image file (JPG, PNG or HEIC).');
  if (file.size > 20 * 1024 * 1024) throw new Error('That picture is over 20 MB. Choose a smaller one.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not open that picture. Try a JPG or PNG.'));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const size = 320;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return c.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The round profile picture (or initials). With `editable`, tapping it changes the photo. */
function profileAvatar(pr, { editable = false, onChange } = {}) {
  const face = pr.photo ? h('img', { src: pr.photo, alt: '' }) : initials(pr.name);
  if (!editable) return h('div', { class: 'avatar', 'aria-hidden': 'true' }, face);
  const input = h('input', { type: 'file', accept: 'image/*', hidden: true });
  const btn = h(
    'button',
    { type: 'button', class: 'avatar avatar-edit', 'aria-label': pr.photo ? 'Change profile photo' : 'Add profile photo', title: pr.photo ? 'Change profile photo' : 'Add profile photo' },
    face,
    h('span', { class: 'avatar-badge', 'aria-hidden': 'true' }, svgIcon(CAMERA)),
  );
  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    try {
      const photo = await photoFromFile(file);
      store.update((s) => (s.profile.photo = photo));
      toast('Profile photo updated');
      onChange?.();
    } catch (err) {
      toast(err.message);
    }
  });
  return h('div', { class: 'avatar-wrap' }, btn, input);
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts.at(-1)[0] : '')).toUpperCase() || '?';
}

// Which profile section is unfolded; kept across redraws.
let pfOpen = null;

const PENCIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>';
const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

function renderProfile() {
  const p = store.get().profile;
  const prefs = p.prefs;

  // ----- Autosave -----
  const saveState = h('span', { class: 'save-state', role: 'status' }, 'All changes saved');
  let saveTimer;
  function save(mutate, { quiet = false } = {}) {
    store.update((s) => mutate(s.profile));
    if (quiet) return;
    saveState.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveState.textContent = 'All changes saved';
      if (!editing) drawHeader();
      drawSummaries();
      drawSide();
    }, 500);
  }
  const bind = (el, key, transform = (v) => v.trim()) => {
    el.addEventListener('input', debounce(() => save((pr) => (pr[key] = transform(el.value))), 350));
    return el;
  };

  // ----- Header -----
  const header = h('section', { class: 'profile-hero' });
  let editing = false;

  // The header doubles as the quickest way to edit who you are: tap any
  // detail (or "Edit") and it turns into a small form in place.
  const HERO_FIELDS = [
    ['name', 'Full name', { autocomplete: 'name', placeholder: 'Your name' }],
    ['headline', 'Headline', { maxlength: 120, placeholder: 'e.g. Full stack developer who ships fast, tested web apps' }],
    ['location', 'Location', { autocomplete: 'address-level2', placeholder: 'City, country' }],
    ['email', 'Email', { type: 'email', autocomplete: 'email', inputmode: 'email' }],
    ['phone', 'Phone', { type: 'tel', autocomplete: 'tel', inputmode: 'tel' }],
  ];
  function editHeader(focusKey = 'name') {
    editing = true;
    const pr = store.get().profile;
    const inputs = HERO_FIELDS.map(([key, label, attrs]) => {
      const el = h('input', { id: `hero-${key}`, value: pr[key] || '', ...attrs });
      if (key === 'location') queueMicrotask(() => attachSuggest(el, 'where'));
      el.addEventListener('input', debounce(() => {
        save((x) => (x[key] = el.value.trim()));
        const twin = document.getElementById(`pf-${key}`);
        if (twin) twin.value = el.value;
        if (key === 'headline') headCount.textContent = `${el.value.length}/120`;
      }, 300));
      return [key, label, el];
    });
    const done = h('button', { class: 'btn primary small', type: 'button' }, 'Done');
    const close = () => {
      editing = false;
      drawHeader();
      header.querySelector('.hero-edit')?.focus();
    };
    done.addEventListener('click', close);
    const form = h(
      'form',
      { class: 'hero-form', 'aria-label': 'Edit your details' },
      ...inputs.map(([key, label, el]) => h('label', { class: `field hero-f-${key}` }, h('span', {}, label), el)),
      h('div', { class: 'hero-form-actions' }, h('span', { class: 'small muted' }, 'Changes save as you type.'), done),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      close();
    });
    form.addEventListener('keydown', (e) => e.key === 'Escape' && close());
    header.classList.add('editing');
    const removePhoto = h('button', { type: 'button', class: 'btn small danger' }, 'Remove photo');
    removePhoto.addEventListener('click', () => {
      store.update((s) => (s.profile.photo = ''));
      toast('Profile photo removed');
      editHeader();
    });
    const photoCol = h('div', { class: 'hero-photo' }, profileAvatar(pr, { editable: true, onChange: () => editHeader() }), pr.photo ? removePhoto : h('span', { class: 'small muted' }, 'Tap to add a photo'));
    header.replaceChildren(photoCol, form);
    const target = inputs.find(([k]) => k === focusKey)?.[2] || inputs[0][2];
    target.focus();
    target.select?.();
  }

  function drawHeader() {
    const pr = store.get().profile;
    const { score } = profileStrength(pr);
    const links = [
      ['LinkedIn', pr.linkedin],
      ['Portfolio', pr.portfolio],
      ['GitHub', pr.github],
    ].filter(([, u]) => u);
    // Each detail is a button that opens the editor on that field.
    const tap = (key, cls, text, label) => {
      const b = h('button', { type: 'button', class: `hero-tap ${cls}`, 'aria-label': `Edit ${label}` }, text);
      b.addEventListener('click', () => editHeader(key));
      return b;
    };
    const editBtn = h('button', { type: 'button', class: 'btn small hero-edit' }, svgIcon(PENCIL), 'Edit');
    editBtn.addEventListener('click', () => editHeader());
    header.classList.remove('editing');
    header.replaceChildren(
      profileAvatar(pr, { editable: true, onChange: () => drawHeader() }),
      h(
        'div',
        { class: 'profile-id' },
        h('h1', {}, tap('name', 'hero-name', pr.name || 'Add your name', 'name')),
        h('p', { class: 'profile-headline' }, tap('headline', pr.headline ? '' : 'empty', pr.headline || 'Add a headline so employers and Claude know what you do.', 'headline')),
        h(
          'div',
          { class: 'profile-meta' },
          ...[
            ['location', 'location', 'Add location'],
            ['email', 'email', 'Add email'],
            ['phone', 'phone', 'Add phone'],
          ].map(([key, label, empty]) => tap(key, pr[key] ? '' : 'empty', pr[key] || `+ ${empty}`, label)),
          ...links.map(([label, url]) => h('a', { href: safeUrl(/^https?:/i.test(url) ? url : `https://${url}`), target: '_blank', rel: 'noopener noreferrer' }, `${label} ↗`)),
        ),
      ),
      editBtn,
      h(
        'div',
        { class: 'profile-score' },
        h('div', { class: 'ring', style: `--p:${score}`, role: 'img', 'aria-label': `Profile ${score}% complete` }, h('strong', {}, `${score}%`)),
        h('span', { class: 'small muted' }, 'Profile strength'),
      ),
    );
  }

  // ----- CV upload + review -----
  const cvText = h('textarea', { id: 'pf-cv', rows: 14, placeholder: 'Upload your CV above, or paste it here as plain text.' }, p.cv);
  const words = h('span', { class: 'small muted' });
  const countWords = () => (words.textContent = `${cvText.value.trim() ? cvText.value.trim().split(/\s+/).length : 0} words`);
  countWords();
  cvText.addEventListener('input', countWords);
  bind(cvText, 'cv', (v) => v);

  const fileInput = h('input', { id: 'cv-file', type: 'file', accept: ACCEPT, hidden: true });
  const fileStatus = h('p', { class: 'small muted file-status', role: 'status' }, p.cvFile ? `Current file: ${p.cvFile}` : 'PDF, Word (.docx), text, or a photo of your CV. Read on this device.');
  const analysisBox = h('div', { class: 'analysis' });
  const drop = h(
    'div',
    { class: 'dropzone', tabindex: '0', role: 'button', 'aria-label': 'Upload your CV' },
    svgIcon('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>'),
    h('strong', {}, p.cvFile ? 'Upload a new version' : 'Upload your CV'),
    h('span', { class: 'muted small' }, 'Drag a file here or click to choose'),
  );
  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => fileInput.files[0] && handleFile(fileInput.files[0]));

  let pendingImages = [];
  async function handleFile(file) {
    if (file.size > 15 * 1024 * 1024) return toast('That file is over 15 MB. Upload a smaller one.');
    fileStatus.textContent = `Reading ${file.name}…`;
    try {
      const { text, images } = await readCVFile(file);
      pendingImages = images;
      if (text) {
        cvText.value = text;
        countWords();
      }
      save((pr) => {
        pr.cvFile = file.name;
        if (text) pr.cv = text;
      });
      fileStatus.textContent = text
        ? `Read ${file.name} (${text.split(/\s+/).length} words). Check the CV text below and fix anything that came out wrong.`
        : `${file.name} is an image or a scan, so Claude will read it.`;
      if (ai.hasKey()) analyzeBtn.click();
      else if (!text) fileStatus.textContent += ' Add an API key in Settings so Claude can read it.';
    } catch (err) {
      console.error(err);
      fileStatus.textContent = err.message || 'Could not read that file. Try a PDF or Word file.';
    }
  }

  const analyzeBtn = aiButton(p.cvAnalysis ? 'Review again' : 'Review my CV', {
    variant: 'small',
    task: async (_t, signal) => {
      const text = cvText.value.trim();
      if (!text && !pendingImages.length) throw new Error('Upload or paste your CV first.');
      analysisBox.replaceChildren(h('p', { class: 'muted' }, 'Claude is reading your CV…'));
      const result = await ai.analyzeCV({ text: pendingImages.length ? '' : text, images: pendingImages }, { signal });
      let filled = 0;
      store.update((s) => {
        const pr = s.profile;
        if (result.cvText && !text) pr.cv = String(result.cvText);
        for (const [k, v] of Object.entries(result.profile || {})) {
          if (['name', 'email', 'phone', 'location', 'headline', 'targetRoles', 'skills'].includes(k) && typeof v === 'string' && v.trim() && !String(pr[k] || '').trim()) {
            pr[k] = v.trim();
            filled++;
          }
        }
        pr.cvAnalysis = { ...result, cvText: undefined, at: Date.now() };
      });
      pendingImages = [];
      if (filled) toast('Filled in your profile from the CV');
      route(); // redraw every section with the new details
      return '';
    },
  });

  function drawAnalysis() {
    const a = store.get().profile.cvAnalysis;
    if (!a) return analysisBox.replaceChildren();
    const score = Math.max(0, Math.min(100, Number(a.score) || 0));
    const level = score >= 75 ? 'high' : score >= 50 ? 'mid' : 'low';
    const list = (title, items, cls) =>
      items?.length ? h('div', { class: `review-col ${cls}` }, h('h3', {}, title), h('ul', {}, ...items.map((x) => h('li', {}, String(x))))) : '';
    analysisBox.replaceChildren(
      h(
        'div',
        { class: 'review-head' },
        h('div', { class: `ring ring-${level}`, style: `--p:${score}`, role: 'img', 'aria-label': `CV score ${score} out of 100` }, h('strong', {}, String(score))),
        h('div', {}, h('h3', {}, 'CV review'), h('p', {}, a.verdict || ''), a.at ? h('p', { class: 'small muted' }, `Reviewed ${fmtDate(a.at)}`) : ''),
      ),
      h('div', { class: 'review-grid' }, list('What works', a.strengths, 'good'), list('What to fix first', a.improvements, 'fix'), list('Screening software', a.atsIssues, 'warn')),
    );
  }
  drawAnalysis();

  // ----- About you -----
  const inp = (id, key, attrs = {}) => bind(h('input', { id, value: store.get().profile[key] || '', ...attrs }), key);
  const headline = inp('pf-headline', 'headline', { maxlength: 120, placeholder: 'e.g. Data analyst who turns logistics data into decisions' });
  const headCount = h('small', { class: 'muted' }, `${headline.value.length}/120`);
  headline.addEventListener('input', () => (headCount.textContent = `${headline.value.length}/120`));

  // ----- Preferences -----
  const savePrefs = (patch) => save((pr) => {
    pr.prefs = { ...pr.prefs, ...patch };
    if ('workModes' in patch) pr.remoteOnly = patch.workModes.length === 1 && patch.workModes[0] === 'Remote';
  });
  const salary = h('input', { id: 'pf-salary', type: 'number', min: 0, step: 1000, inputmode: 'numeric', value: prefs.salaryMin || '', placeholder: 'e.g. 55000' });
  salary.addEventListener('input', debounce(() => savePrefs({ salaryMin: salary.value }), 350));
  const currency = h('select', { id: 'pf-currency', 'aria-label': 'Currency' }, ...CURRENCIES.map((c) => h('option', { value: c, selected: c === prefs.currency }, c)));
  currency.addEventListener('change', () => savePrefs({ currency: currency.value }));
  const period = h('select', { id: 'pf-period', 'aria-label': 'Per' }, ...[['year', 'per year'], ['month', 'per month'], ['hour', 'per hour']].map(([v, l]) => h('option', { value: v, selected: v === prefs.salaryPeriod }, l)));
  period.addEventListener('change', () => savePrefs({ salaryPeriod: period.value }));
  const availability = h('select', { id: 'pf-avail' }, ...AVAILABILITY.map((v) => h('option', { value: v, selected: v === prefs.availability }, v || 'Choose…')));
  availability.addEventListener('change', () => savePrefs({ availability: availability.value }));
  const relocate = h('input', { id: 'pf-relocate', type: 'checkbox', checked: Boolean(prefs.relocate) });
  relocate.addEventListener('change', () => savePrefs({ relocate: relocate.checked }));
  const authorization = h('input', { id: 'pf-auth', value: prefs.authorization || '', placeholder: 'e.g. EU citizen, or: need visa sponsorship for the UK' });
  authorization.addEventListener('input', debounce(() => savePrefs({ authorization: authorization.value.trim() }), 350));

  const roles = tagInput({ id: 'pf-roles', values: splitList(p.targetRoles), placeholder: 'e.g. Data Analyst, then press Enter', onChange: (v) => save((pr) => (pr.targetRoles = v.join(', '))), max: 6 });
  const skills = tagInput({ id: 'pf-skills', values: splitList(p.skills), placeholder: 'e.g. SQL, then press Enter', onChange: (v) => save((pr) => (pr.skills = v.join(', '))) });
  const langs = tagInput({ id: 'pf-langs', values: splitList(p.languages), placeholder: 'e.g. Dutch (native), then press Enter', onChange: (v) => save((pr) => (pr.languages = v.join(', '))), max: 10 });

  // Sections fold: the title row is a button, one section is open at a time,
  // and the closed rows show a one-line summary so you rarely need to open them.
  const summaries = {};
  const section = (id, title, intro, ...body) => {
    const bodyId = `${id}-body`;
    const summary = h('span', { class: 'pf-summary' });
    summaries[id] = summary;
    const toggle = h(
      'button',
      { type: 'button', class: 'pf-toggle', 'aria-expanded': 'false', 'aria-controls': bodyId },
      h('span', { class: 'pf-toggle-text' }, h('h2', {}, title), summary),
      svgIcon(CHEVRON),
    );
    const el = h(
      'section',
      { class: 'card pf-section', id },
      toggle,
      h('div', { class: 'pf-body', id: bodyId, role: 'region', 'aria-label': title, hidden: true }, intro ? h('p', { class: 'muted small pf-intro' }, intro) : '', ...body),
    );
    toggle.addEventListener('click', () => openSection(pfOpen === id ? null : id, { scroll: pfOpen !== id }));
    return el;
  };
  function openSection(id, { scroll = false } = {}) {
    pfOpen = id;
    for (const sec of sections) {
      const open = sec.id === id;
      sec.classList.toggle('open', open);
      sec.querySelector('.pf-toggle').setAttribute('aria-expanded', String(open));
      sec.querySelector('.pf-body').hidden = !open;
    }
    for (const b of nav.querySelectorAll('button[data-sec]')) b.classList.toggle('active', b.dataset.sec === id);
    if (scroll && id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  function drawSummaries() {
    const pr = store.get().profile;
    const pf = pr.prefs || {};
    const count = (list) => splitList(list).length;
    const filled = (keys) => keys.filter((k) => String(pr[k] || '').trim()).length;
    const a = pr.cvAnalysis;
    const text = {
      'pf-sec-cv': pr.cv.trim() ? [pr.cvFile || 'CV added', a ? `score ${Math.round(Number(a.score) || 0)}/100` : 'not reviewed yet'].join(' · ') : 'Upload your CV to get started',
      'pf-sec-about': `${filled(['name', 'headline', 'location', 'email', 'phone'])} of 5 filled`,
      'pf-sec-prefs': [splitList(pr.targetRoles).slice(0, 2).join(', ') || 'No roles yet', ...(pf.workModes || []).slice(0, 2)].join(' · '),
      'pf-sec-skills': `${count(pr.skills)} skills · ${count(pr.languages || '')} languages`,
      'pf-sec-links': [pr.linkedin && 'LinkedIn', pr.portfolio && 'Website', pr.github && 'GitHub'].filter(Boolean).join(' · ') || 'None added',
    };
    for (const [id, el] of Object.entries(summaries)) el.textContent = text[id] || '';
  }

  const sections = [
    section(
      'pf-sec-cv',
      'CV',
      'Your master CV. Claude reviews it and rewrites it for every job you apply to.',
      h('div', { class: 'row space wrap' }, fileStatus, analyzeBtn),
      drop,
      fileInput,
      analysisBox,
      h(
        'details',
        { class: 'cv-raw' },
        h('summary', {}, 'Edit CV text ', words),
        h('p', { class: 'small muted' }, 'This is the text Claude works from. Fix anything the file reader got wrong.'),
        cvText,
      ),
    ),
    section(
      'pf-sec-about',
      'About you',
      'Shown at the top of every CV and cover letter Claude writes.',
      h('div', { class: 'grid-2' }, field('Full name', inp('pf-name', 'name', { autocomplete: 'name' })), field('Location', withSuggest(inp('pf-location', 'location', { placeholder: 'City, country', autocomplete: 'off' }), 'where'), 'Used to find jobs near you.')),
      h('label', { class: 'field' }, h('span', {}, 'Headline'), headline, h('small', { class: 'row space' }, h('span', { class: 'muted' }, 'One line about what you do and what you are good at.'), headCount)),
      h('div', { class: 'grid-2' }, field('Email', inp('pf-email', 'email', { type: 'email', autocomplete: 'email' })), field('Phone', inp('pf-phone', 'phone', { type: 'tel', autocomplete: 'tel' }))),
    ),
    section(
      'pf-sec-prefs',
      'Job preferences',
      'Claude uses these to search, rank matches and write your cover letters.',
      h('div', { class: 'field' }, h('span', {}, 'Roles you want'), roles.el, h('small', { class: 'muted' }, 'Up to 6. The first one is used for your daily "Jobs for you".')),
      h('div', { class: 'grid-2' }, h('div', { class: 'field' }, h('span', {}, 'Work mode'), pillGroup({ label: 'Work mode', options: WORK_MODES, values: prefs.workModes, onChange: (v) => savePrefs({ workModes: v }) })), h('div', { class: 'field' }, h('span', {}, 'Employment type'), pillGroup({ label: 'Employment type', options: JOB_TYPES, values: prefs.types, onChange: (v) => savePrefs({ types: v }) }))),
      h('div', { class: 'field' }, h('span', {}, 'Minimum salary'), h('div', { class: 'salary-row' }, salary, currency, period), h('small', { class: 'muted' }, 'Private. Used to flag roles that pay below what you want.')),
      h('div', { class: 'grid-2' }, field('Available to start', availability), field('Work authorisation', authorization)),
      h('label', { class: 'check' }, relocate, 'I am open to relocating for the right role'),
    ),
    section(
      'pf-sec-skills',
      'Skills and languages',
      'Add skills as tags. Claude matches them against job postings.',
      h('div', { class: 'field' }, h('span', {}, 'Skills'), skills.el),
      h('div', { class: 'field' }, h('span', {}, 'Languages'), langs.el),
    ),
    section(
      'pf-sec-links',
      'Links',
      'Added to the contact line of your tailored CVs.',
      h('div', { class: 'grid-2' }, field('LinkedIn', inp('pf-linkedin', 'linkedin', { type: 'url', placeholder: 'linkedin.com/in/your-name' })), field('Portfolio or website', inp('pf-portfolio', 'portfolio', { type: 'url', placeholder: 'your-site.com' }))),
      field('GitHub', inp('pf-github', 'github', { type: 'url', placeholder: 'github.com/your-name' })),
    ),
  ];

  // ----- Section navigation (desktop) -----
  const nav = h(
    'nav',
    { class: 'pf-nav', 'aria-label': 'Profile sections' },
    ...[
      ['pf-sec-cv', 'CV'],
      ['pf-sec-about', 'About you'],
      ['pf-sec-prefs', 'Job preferences'],
      ['pf-sec-skills', 'Skills and languages'],
      ['pf-sec-links', 'Links'],
    ].map(([id, label]) => {
      const b = h('button', { type: 'button', 'data-sec': id }, label);
      b.addEventListener('click', () => openSection(id, { scroll: true }));
      return b;
    }),
    saveState,
  );

  // ----- Side column -----
  const side = h('aside', { class: 'pf-side' });
  function drawSide() {
    const pr = store.get().profile;
    const items = profileChecklist(pr);
    const docs = store.get().docs;
    const tailored = Object.entries(docs)
      .filter(([id, d]) => d?.cvData && store.get().jobs[id])
      .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
      .slice(0, 6);
    side.replaceChildren(
      h(
        'section',
        { class: 'card' },
        h('div', { class: 'section-title' }, h('h2', {}, 'Complete your profile')),
        h(
          'ol',
          { class: 'checklist' },
          ...items.map((x) => {
            const a = h('a', { href: '#/profile' }, x.label);
            a.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              openSection(x.section, { scroll: true });
              document.getElementById(x.section)?.querySelector(x.focus || 'input, textarea, button')?.focus({ preventScroll: true });
            });
            return h('li', { class: x.done ? 'done' : '' }, a);
          }),
        ),
      ),
      h(
        'section',
        { class: 'card' },
        h('div', { class: 'section-title' }, h('h2', {}, 'Your tailored CVs')),
        tailored.length
          ? h(
              'ul',
              { class: 'plain-list' },
              ...tailored.map(([id, d]) => {
                const job = store.get().jobs[id];
                const a = h('a', { href: `#/job/${encodeURIComponent(id)}` }, job.title);
                a.addEventListener('click', () => {
                  try {
                    sessionStorage.setItem('ajh:tab', 'docs');
                  } catch {}
                });
                return h('li', {}, h('div', {}, a, h('div', { class: 'small muted' }, `${job.company} · ${fmtDate(d.updatedAt)}`)));
              }),
            )
          : h('p', { class: 'small muted', style: 'margin:0' }, 'When you tailor your CV for a job it shows up here, ready to download again.'),
      ),
      h(
        'section',
        { class: 'card privacy' },
        h('h2', {}, 'Your data'),
        h('p', { class: 'small muted' }, 'Your profile and CV stay on this device. They are only sent to Claude when you ask it to search, review or write something.'),
        h('a', { class: 'btn small', href: '#/settings' }, 'Back up or delete data'),
      ),
    );
  }

  drawHeader();
  drawSummaries();
  drawSide();
  view.append(header, h('div', { class: 'pf-layout' }, nav, h('div', { class: 'pf-main' }, ...sections), side));
  openSection(pfOpen);
}

function profileChecklist(pr) {
  return [
    { done: Boolean(pr.cv.trim()), label: 'Upload your CV', section: 'pf-sec-cv', focus: '.dropzone' },
    { done: Boolean(pr.headline.trim()), label: 'Write a headline', section: 'pf-sec-about', focus: '#pf-headline' },
    { done: Boolean(pr.location.trim()), label: 'Add your location', section: 'pf-sec-about', focus: '#pf-location' },
    { done: Boolean(pr.email.trim() || pr.phone.trim()), label: 'Add contact details', section: 'pf-sec-about', focus: '#pf-email' },
    { done: Boolean(pr.targetRoles.trim()), label: 'Choose the roles you want', section: 'pf-sec-prefs', focus: '#pf-roles' },
    { done: Boolean(pr.prefs?.workModes?.length || pr.prefs?.types?.length), label: 'Set work mode and type', section: 'pf-sec-prefs', focus: '.pill-group .chip' },
    { done: Boolean(pr.skills.trim()), label: 'Add your skills', section: 'pf-sec-skills', focus: '#pf-skills' },
    { done: Boolean(pr.languages?.trim()), label: 'Add languages', section: 'pf-sec-skills', focus: '#pf-langs' },
    { done: Boolean(pr.linkedin || pr.portfolio || pr.github), label: 'Add a link', section: 'pf-sec-links', focus: '#pf-linkedin' },
  ];
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function renderSettings() {
  const s = store.get().settings;
  const key = h('input', { type: 'password', value: s.apiKey, placeholder: 'sk-ant-…', autocomplete: 'off', spellcheck: 'false' });
  const model = h(
    'select',
    {},
    ...[
      ['claude-opus-5-5', 'Claude Opus 5.5 (best quality)'],
      ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (faster, cheaper)'],
    ].map(([v, l]) => h('option', { value: v, selected: v === s.model }, l)),
  );
  const effort = h(
    'select',
    {},
    ...['low', 'medium', 'high'].map((v) => h('option', { value: v, selected: v === s.effort }, v)),
  );

  // Which AI does the work: Claude, or the user's own ChatGPT / Gemini / DeepSeek / Grok key.
  let chosen = s.provider || 'claude';
  const OPTIONS = [{ id: 'claude', name: 'Claude', company: 'Anthropic' }, ...PROVIDERS];
  const fields = {}; // provider id -> { key, model, quick }
  for (const pv of PROVIDERS) {
    fields[pv.id] = {
      key: h('input', { type: 'password', value: s.keys?.[pv.id] || '', placeholder: pv.keyHint, autocomplete: 'off', spellcheck: 'false' }),
      model: h('input', { type: 'text', value: s.models?.[pv.id] || '', placeholder: pv.model, autocomplete: 'off', spellcheck: 'false' }),
      quick: h('input', { type: 'text', value: s.models?.[`${pv.id}Quick`] || '', placeholder: pv.quickModel, autocomplete: 'off', spellcheck: 'false' }),
    };
  }
  const providerGroup = h('div', { class: 'lang-grid provider-grid', role: 'radiogroup', 'aria-label': 'AI provider' });
  const details = h('div', { class: 'provider-details' });
  const testOut = h('p', { class: 'small', role: 'status' });
  function drawProvider() {
    providerGroup.replaceChildren(
      ...OPTIONS.map((o) => {
        const b = h('button', { type: 'button', class: 'lang-option provider-option', role: 'radio', 'aria-checked': String(o.id === chosen), translate: 'no' }, h('strong', {}, o.name), h('span', {}, o.company));
        b.addEventListener('click', () => {
          chosen = o.id;
          testOut.textContent = '';
          drawProvider();
        });
        return b;
      }),
    );
    if (chosen === 'claude') {
      details.replaceChildren(
        ai.usingViewerClaude()
          ? h('p', { class: 'notice' }, 'AI features run on your Claude account here, so no API key is needed. The key and model settings below apply when you run the app outside Claude.')
          : '',
        field('Anthropic API key', key, 'Get one at console.anthropic.com. Stored only in this browser and sent only to api.anthropic.com.'),
        h('div', { class: 'grid-2' }, field('Model', model), field('Effort', effort, 'Higher effort gives more thorough results but takes longer.')),
      );
      return;
    }
    const pv = providerById(chosen);
    const f = fields[chosen];
    details.replaceChildren(
      h(
        'p',
        { class: 'notice' },
        `${pv.company} does not let other websites sign you in with your ${pv.name} account. Instead, paste an API key from their developer site. Use is billed by ${pv.company} to your own account (separate from a ${pv.name} app subscription). The key stays in this browser and is only sent to ${pv.company}.`,
      ),
      field(`${pv.name} API key`, f.key),
      h('p', { class: 'small', style: 'margin:0' }, h('a', { href: pv.keyUrl, target: '_blank', rel: 'noopener noreferrer' }, `Get a ${pv.name} API key ↗`)),
      h('div', { class: 'grid-2' }, field('Model', f.model, `Leave empty for ${pv.model}.`), field('Fast model', f.quick, `For quick tasks. Leave empty for ${pv.quickModel}.`)),
      !pv.vision ? h('p', { class: 'small muted' }, `${pv.name} cannot read photos of a CV. Upload PDF or Word files instead.`) : '',
      !pv.webSearch ? h('p', { class: 'small muted' }, `${pv.name} cannot search the web here, so job search uses the free job boards (and the Exa connector inside the Claude app).`) : '',
      h('div', { class: 'row wrap' }, testBtn),
      testOut,
    );
  }
  function saveProvider() {
    store.update((st) => {
      st.settings.apiKey = key.value.trim();
      st.settings.model = model.value;
      st.settings.effort = effort.value;
      st.settings.provider = chosen;
      st.settings.keys = { ...(st.settings.keys || {}) };
      st.settings.models = { ...(st.settings.models || {}) };
      for (const pv of PROVIDERS) {
        st.settings.keys[pv.id] = fields[pv.id].key.value.trim();
        st.settings.models[pv.id] = fields[pv.id].model.value.trim();
        st.settings.models[`${pv.id}Quick`] = fields[pv.id].quick.value.trim();
      }
    });
    setBrand(ai.aiName());
  }
  const testBtn = h('button', { type: 'button', class: 'btn small' }, 'Save and test connection');
  testBtn.addEventListener('click', async () => {
    saveProvider();
    const pv = providerById(chosen);
    if (!fields[chosen].key.value.trim()) {
      testOut.textContent = `Paste your ${pv.name} API key first.`;
      return;
    }
    testBtn.disabled = true;
    testOut.textContent = `Talking to ${pv.name}…`;
    try {
      const reply = await ai.ask({ system: 'Connection test.', messages: [{ role: 'user', content: 'Reply with the single word OK.' }], quick: true });
      testOut.textContent = `${pv.name} is connected. It replied: ${String(reply).trim().slice(0, 40)}`;
    } catch (err) {
      testOut.textContent = err.message;
    } finally {
      testBtn.disabled = false;
    }
  });
  drawProvider();

  const form = h(
    'form',
    { class: 'card form' },
    h('h2', {}, 'AI'),
    h('p', { class: 'muted', style: 'margin:0' }, 'Choose which AI does the work. Every task runs with the same senior HR recruiter instructions.'),
    providerGroup,
    details,
    h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit' }, 'Save settings')),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    saveProvider();
    toast('Settings saved');
  });

  const exp = h('button', { class: 'btn' }, 'Export backup');
  exp.addEventListener('click', () => {
    const data = JSON.parse(store.exportJSON());
    data.settings.apiKey = '';
    data.settings.keys = {};
    download(`vora-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
  });
  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  const imp = h('button', { class: 'btn' }, 'Import backup');
  imp.addEventListener('click', () => fileIn.click());
  fileIn.addEventListener('change', async () => {
    const file = fileIn.files[0];
    if (!file) return;
    try {
      const { apiKey, keys } = store.get().settings;
      store.importJSON(await file.text());
      store.update((st) => {
        if (!st.settings.apiKey) st.settings.apiKey = apiKey;
        st.settings.keys = { ...(keys || {}), ...(st.settings.keys || {}) };
      });
      toast('Backup restored');
      route();
    } catch {
      toast('That file is not a valid backup.');
    }
  });
  const wipe = confirmButton('Erase all data', 'Tap again to erase everything', () => {
    store.reset();
    toast('All data erased');
    go('/');
  });

  const acctBtn = h('button', { class: 'btn', type: 'button' }, account.status === 'signed-in' ? 'Manage account' : 'Create account or sign in');
  acctBtn.addEventListener('click', openAccount);
  // Interface language: names are shown in their own language and never translated.
  const langGroup = h(
    'div',
    { class: 'lang-grid', role: 'radiogroup', 'aria-label': 'App language' },
    ...LANGUAGES.map((l) => {
      const b = h('button', { type: 'button', class: 'lang-option', role: 'radio', 'aria-checked': String(l.code === currentLanguage()), lang: l.code, translate: 'no' }, l.name);
      b.addEventListener('click', () => {
        store.update((st) => (st.settings.language = l.code));
        setLanguage(l.code);
        for (const x of langGroup.children) x.setAttribute('aria-checked', String(x === b));
      });
      return b;
    }),
  );

  view.append(
    pageHeader('Settings'),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Language'),
      h('p', { class: 'muted' }, 'Menus, buttons and Claude’s coaching (fit analysis, CV review, company profiles, interview game) use this language. Your CVs and cover letters are written in the language of each job posting.'),
      langGroup,
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Account and sync'),
      h(
        'p',
        { class: 'muted' },
        account.status === 'signed-in'
          ? `Signed in${account.me?.name ? ` as ${account.me.name}` : ''}. Your profile, applications and documents sync to your account.`
          : 'Sign in to keep your profile, applications and documents in your account and use them on every device.',
      ),
      acctBtn,
    ),
    form,
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Your data'),
      h('p', { class: 'muted' }, 'Everything is stored locally in this browser. Export a backup to move it to another device.'),
      h('div', { class: 'row wrap' }, exp, imp, fileIn, wipe),
    ),
    inArtifact ? '' : installCard(),
  );
}

// ---------------------------------------------------------------------------
// Account: header button and panel
// ---------------------------------------------------------------------------

const ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const accountBtn = document.getElementById('account-btn');

function syncedLabel() {
  if (account.error) return account.error;
  if (!account.lastSync) return 'Syncing…';
  return `Synced ${timeAgo(account.lastSync)}`;
}

const ICON_PERSON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/></svg>';
const ICON_SPINNER = '<svg viewBox="0 0 24 24" aria-hidden="true" class="spin"><path d="M12 3a9 9 0 1 0 9 9"/></svg>';
function drawAccountButton() {
  if (!accountBtn) return;
  accountBtn.classList.toggle('signed-in', account.status === 'signed-in');
  if (account.status === 'signed-in' && account.me) {
    const img = h('img', { src: account.me.avatarUrl, alt: '', width: 32, height: 32 });
    accountBtn.replaceChildren(img, h('span', { class: 'account-name' }, account.me.name ? account.me.name.split(' ')[0] : 'Account'));
    accountBtn.setAttribute('aria-label', `Your account${account.me.name ? `, ${account.me.name}` : ''}`);
  } else {
    // Icon + label; on phones only the icon shows, so the button never grows into the centred logo.
    const working = account.status === 'working';
    accountBtn.replaceChildren(
      svgIcon(working ? ICON_SPINNER : ICON_PERSON),
      h('span', { class: 'account-label' }, working ? 'Signing in…' : 'Sign in'),
    );
    accountBtn.setAttribute('aria-label', working ? 'Signing in…' : 'Create account or sign in');
  }
}

let panel = null;
function openAccount() {
  if (panel) return;
  const returnFocus = document.activeElement;
  const body = h('div', { class: 'sheet-body' });
  const close = h('button', { class: 'icon-btn sheet-close', type: 'button', 'aria-label': 'Close' }, '×');
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'account-title' }, close, body);
  const backdrop = h('div', { class: 'sheet-backdrop' }, sheet);
  const prevOverflow = document.body.style.overflow;

  function draw() {
    const benefit = (text) => h('li', {}, svgIcon(ICON_CHECK), text);
    if (account.status === 'signed-in' && account.me) {
      const jobs = Object.keys(store.get().jobs).length;
      const cvs = Object.values(store.get().docs).filter((d) => d?.cvData).length;
      const sync = h('button', { class: 'btn', type: 'button' }, 'Sync now');
      sync.addEventListener('click', async () => {
        sync.disabled = true;
        sync.textContent = 'Syncing…';
        const received = await syncNow();
        if (received) route();
        draw();
      });
      const out = h('button', { class: 'btn', type: 'button' }, 'Sign out');
      out.addEventListener('click', () => {
        signOut();
        toast('Signed out. Your data stays on this device.');
        draw();
      });
      const wipe = confirmButton('Sign out and remove data from this device', 'Tap again to remove it from this device', () => {
        signOut({ wipe: true });
        toast('Signed out and removed from this device');
        shut();
        route();
      }, 'btn danger small');
      body.replaceChildren(
        h(
          'div',
          { class: 'account-head' },
          h('img', { class: 'account-avatar', src: account.me.avatarUrl, alt: '' }),
          h('div', {}, h('h2', { id: 'account-title' }, account.me.name || 'Your account'), account.me.email ? h('p', { class: 'muted small' }, account.me.email) : '', h('p', { class: `sync-state ${account.error ? 'error' : ''}` }, syncedLabel())),
        ),
        h('div', { class: 'account-stats' }, h('div', {}, h('strong', {}, String(jobs)), h('span', {}, 'saved jobs')), h('div', {}, h('strong', {}, String(cvs)), h('span', {}, 'tailored CVs')), h('div', {}, h('strong', {}, `${profileStrength(store.get().profile).score}%`), h('span', {}, 'profile'))),
        h('p', { class: 'small muted' }, 'Your account is your Claude account. Everything is stored privately for you; nobody else can read it, including whoever shared this app with you. Your API key never leaves this device.'),
        h('div', { class: 'row wrap' }, sync, out),
        h('div', { class: 'sheet-danger' }, wipe),
      );
    } else if (!accountsAvailable()) {
      body.replaceChildren(
        h('h2', { id: 'account-title' }, 'Accounts'),
        h(
          'p',
          { class: 'muted' },
          inArtifact
            ? 'Accounts are not available in this view. Open Vora from your own Claude app to sign in.'
            : 'Accounts work when you open Vora in the Claude app, where you sign in with your Claude account. Here, your data is saved on this device.',
        ),
        h('a', { class: 'btn', href: '#/settings' }, 'Back up my data'),
      );
      body.querySelector('a').addEventListener('click', shut);
    } else {
      const go = h('button', { class: 'btn primary big account-cta', type: 'button' }, 'Continue with your Claude account');
      const status = h('p', { class: 'small error', role: 'status' }, account.error || '');
      go.addEventListener('click', async () => {
        go.disabled = true;
        go.textContent = 'Signing in…';
        status.textContent = '';
        try {
          const received = await signIn();
          toast(received ? 'Signed in. Your progress was loaded from your account.' : 'Account ready. Your progress now syncs.');
          route();
          draw();
        } catch (err) {
          go.disabled = false;
          go.textContent = 'Continue with your Claude account';
          status.textContent = err.message || 'Could not sign in. Try again.';
        }
      });
      body.replaceChildren(
        h('div', { class: 'account-mark', 'aria-hidden': 'true' }, h('img', { src: 'icons/vora-mark-96.png', alt: '', width: 48, height: 48 })),
        h('h2', { id: 'account-title' }, 'Create your account'),
        h('p', { class: 'muted' }, 'Save your profile, CV, applications and interview progress, and pick up where you left off on any device.'),
        h(
          'ul',
          { class: 'benefits' },
          benefit('Your phone and computer stay in sync'),
          benefit('Tailored CVs, cover letters and interview games are never lost'),
          benefit('Private to you. Nobody else can read your data'),
        ),
        go,
        status,
        h('p', { class: 'small muted center' }, 'No new password. You sign in with the Claude account you already use. Already have an account? The same button signs you in.'),
      );
    }
  }

  function shut() {
    unsubscribe();
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = prevOverflow;
    backdrop.remove();
    panel = null;
    returnFocus?.focus?.();
  }
  const onKey = (e) => e.key === 'Escape' && shut();
  const unsubscribe = onAccountChange(() => panel && draw());
  close.addEventListener('click', shut);
  backdrop.addEventListener('click', (e) => e.target === backdrop && shut());
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  draw();
  document.body.append(backdrop);
  panel = backdrop;
  (sheet.querySelector('.account-cta') || close).focus();
}

accountBtn?.addEventListener('click', openAccount);
onAccountChange(drawAccountButton);
drawAccountButton();
initAccount(() => {
  setLanguage(store.get().settings.language || 'en');
  route();
});

// ---------------------------------------------------------------------------
// Install as an app (PWA)
// ---------------------------------------------------------------------------

let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  document.getElementById('install-btn').hidden = false;
});
window.addEventListener('appinstalled', () => {
  deferredInstall = null;
  document.getElementById('install-btn').hidden = true;
  toast('Installed! Find Vora on your home screen.');
});

async function promptInstall() {
  if (!deferredInstall) {
    toast('Use your browser menu → "Install app" or "Add to Home Screen".');
    return;
  }
  deferredInstall.prompt();
  await deferredInstall.userChoice;
  deferredInstall = null;
  document.getElementById('install-btn').hidden = true;
}
document.getElementById('install-btn').addEventListener('click', promptInstall);

function installCard() {
  const btn = h('button', { class: 'btn' }, 'Install app');
  btn.addEventListener('click', promptInstall);
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Install as an app'),
    h(
      'ul',
      { class: 'plain-list small' },
      h('li', {}, h('strong', {}, 'Android / Chrome / Edge: '), 'tap Install, or browser menu → Install app.'),
      h('li', {}, h('strong', {}, 'iPhone / iPad: '), 'open in Safari → Share → Add to Home Screen.'),
      h('li', {}, h('strong', {}, 'Desktop: '), 'click the install icon in the address bar.'),
    ),
    btn,
  );
}

if (!inArtifact && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW failed', e)));
}

setLanguage(store.get().settings.language || 'en');
setBrand(ai.aiName());
route();
// In the artifact viewer, capabilities arrive a moment after load: redraw
// once they do so AI and web search light up.
if (inArtifact) runtimeReady.then((c) => (c.sample || c.mcp) && route());
