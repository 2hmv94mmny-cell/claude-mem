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
import { LANGUAGES, setLanguage, currentLanguage, setBrand, locale, t as tr } from './i18n.js';
import { attachSuggest, rememberSearch, recentSearches } from './suggest.js';
import { PROVIDERS, providerById } from './providers.js';
import { readCVFile, ACCEPT } from './files.js';
import { cvToText, cvFromProfile } from './cvdoc.js';
import { TEMPLATES, FONT_CHOICES, fontChoice, getTemplate, accentFor, renderCV, renderLetter, cvPDFDefinition, letterPDFDefinition, makePDF } from './templates.js';

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

// The home feed runs the same search as the Find page, in layers, and shows
// what it has after each one:
//   1. your roles near you, matched by rules on this device (fast, no AI)
//   2. your other role families and strongest skills ("also matching your CV")
//   3. with an AI set up: the AI reads the same search results (cached, so no
//      new searches) and adds postings the rules missed
// Everything is merged without repeats, scored against the CV, checked for
// closed postings, and sorted best match first, newest among equals.
const FEED_MAX = 160; // jobs kept on the home page
const FEED_BYTES = 220000; // the synced feed must stay under 256 KiB

function runFeed() {
  if (feedRun) return feedRun;
  const { location, remote, key } = feedInputs();
  feedError = null;
  const profile = store.get().profile;
  const me = readProfile(profile);
  const place = remote ? 'remote' : location;
  let all = [];
  let meta = { roles: me.roles, country: null, searched: [] };
  let usedAI = false;

  // Add jobs we have not seen, scored the same way as everything else.
  // `near`: only jobs that name the user's city (or remote, when wanted).
  const city = norm(location.split(',')[0]);
  const isNear = (j) => {
    if (remote) return j.remote || /remote|home ?office/i.test(`${j.location} ${j.title}`);
    return !city || norm(`${j.location} ${j.title} ${String(j.description || '').slice(0, 600)}`).includes(city);
  };
  const add = (jobs, { near = false } = {}) => {
    let added = 0;
    for (const j of jobs || []) {
      if (!j?.title) continue;
      if (near && !isNear(j)) continue;
      if (all.some((r) => (r.url && r.url === j.url) || sameJob(r, j) || (norm(r.title) === norm(j.title) && norm(r.company) === norm(j.company)))) continue;
      if (isStale(j) || knownClosed(j.url)) continue;
      const rule = scoreJob(j, me, profile.prefs || {}, place);
      const match = j.match?.score > rule.score ? j.match : rule;
      if (match.score < 30) continue;
      const { _text, ...job } = j;
      void _text;
      all.push({ ...job, match });
      added++;
    }
    return added;
  };
  const publish = (final) => {
    let kept = [...all]
      .sort(byBestMatch)
      .slice(0, FEED_MAX)
      .map((j) => ({ ...j, description: String(j.description || '').slice(0, 700) }));
    // Stay inside the sync limit: drop the weakest matches until it fits.
    while (kept.length > 20 && JSON.stringify(kept).length > FEED_BYTES) kept = kept.slice(0, Math.floor(kept.length * 0.9));
    if (final) {
      feedFilter = feedFilter && kept.some((j) => j.source === feedFilter) ? feedFilter : '';
    }
    store.update((s) => (s.feed = { key, at: Date.now(), jobs: kept, roles: meta.roles, location: remote ? 'Remote' : location, country: meta.country, searched: meta.searched, noAI: !usedAI, partial: !final }));
    refreshFeed();
  };

  feedRun = (async () => {
    // 1. Your roles near you (rules, no AI).
    const first = await jobsForYou(profile);
    meta = { roles: first.roles, country: first.country, searched: first.searched || [] };
    add(first.jobs);
    feedShown = FEED_PAGE;
    publish(false);

    // 2 and 3 run side by side; each shows its jobs as soon as it has them.
    const layers = [
      moreJobsForYou(profile, { exclude: all })
        .then((r) => add(r.jobs) && publish(false))
        .catch(() => {}),
    ];
    if (ai.hasKey() && ai.canSearchWeb()) {
      for (const role of me.roles.slice(0, 2)) {
        layers.push(
          ai
            .searchEverywhere({ query: role, location: remote ? '' : location, remoteOnly: remote }, { rank: Boolean(profile.cv.trim()) })
            .then((r) => {
              usedAI = true;
              if (add(r.jobs, { near: true })) publish(false);
            })
            .catch(() => {}),
        );
      }
    }
    await Promise.all(layers);

    // Read the pages of the best new matches (closed postings, missing dates),
    // then the AI double-checks what the rules could not vouch for.
    const best = [...all].sort(byBestMatch).slice(0, 60);
    const { dates, gone } = await checkPages(best).catch(() => ({ dates: new Map(), gone: new Set() }));
    for (const j of all) if (!j.postedAt && dates.has(j.url)) j.postedAt = dates.get(j.url);
    const closed = ai.hasKey() ? await ai.checkStillOpen(best.filter((j) => !gone.has(j.url))).catch(() => new Set()) : new Set();
    all = all.filter((j) => !gone.has(j.url) && !closed.has(j.url) && !isStale(j));
    publish(true);
  })()
    .catch((err) => {
      if (err?.name !== 'AbortError') feedError = { key, message: err.message || 'Could not load jobs.' };
    })
    .finally(() => {
      feedRun = null;
      refreshFeed();
    });
  return feedRun;
}

// Redraw only the feed on the home page (not the whole page), so the list
// grows while the visitor reads, without jumping to the top.
function refreshFeed() {
  if (currentPath !== '/') return;
  const old = view.querySelector('.card.feed');
  if (old) old.replaceWith(feedSection());
  else route();
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
    h(
      'div',
      { class: 'feed-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, where ? (remote ? 'Remote' : location) : 'For you'), h('h2', {}, 'Top picks for you'), sub && h('p', { class: 'muted small' }, sub)),
      actions.length ? h('div', { class: 'row' }, ...actions) : '',
    );
  const prompt = (text, href, label) => h('section', { class: 'card feed' }, head(''), h('div', { class: 'feed-empty' }, h('p', {}, text), h('a', { class: 'btn primary', href }, label)));

  if (!hasExperience) return prompt('Upload your CV and we will find jobs near you that fit your experience.', '#/profile', 'Upload your CV');
  if (!location && !remote) return prompt('Add your city in your profile to see jobs near you.', '#/profile', 'Add your location');

  if (feedNeedsRefresh() && !feedRun && feedError?.key !== key) runFeed();

  const refresh = h('button', { class: 'btn small ghost', type: 'button', disabled: Boolean(feedRun), title: 'Look for new jobs now' }, svgIcon(ICON_REFRESH), feedRun ? 'Searching…' : 'Refresh');
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
      h('div', { class: 'pick-list' }, ...Array.from({ length: 4 }, () => h('div', { class: 'pick-skel' }, h('span', { class: 'skeleton' }), h('span', {}, h('span', { class: 'skeleton' }), h('span', { class: 'skeleton' }))))),
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
  const grid = h('div', { class: 'pick-list' });
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
    h('div', { class: 'portal-row' }, ...portals.map((x) => h('a', { class: 'portal-pill', href: safeUrl(x.url), target: '_blank', rel: 'noopener noreferrer' }, x.name, h('span', { 'aria-hidden': 'true' }, '↗')))),
  );

  return h(
    'section',
    { class: 'card feed' },
    head(`${feed.jobs.length} matches · based on your experience as ${feed.roles.join(' or ')}${feedRun ? ' · updating…' : ` · updated ${timeAgo(feed.at)}`}`, refresh, seeAll),
    counts.size > 1 ? chips : '',
    grid,
    more,
    portalLinks,
    h(
      'p',
      { class: 'small muted feed-note' },
      feed.noAI === false
        ? `Searched ${feed.searched?.length ? `${feed.searched.join(', ')}, ` : ''}the open web and free job boards for your roles, other roles that fit your CV and your strongest skills. Matched against your CV by job title, skills, location and experience; Vora AI also read the results to find postings the rules missed.`
        : `Searched ${feed.searched?.length ? `${feed.searched.join(', ')}, ` : ''}the open web and free job boards, then matched on this device by job title, skills, location and experience. No AI is used for these picks.`,
    ),
  );
}

const ICON_BOOKMARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v17l-6-4-6 4z"/></svg>';
const ICON_REFRESH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.7-4.4M4 4v4h4M4 13a8 8 0 0 0 14.7 4.4M20 20v-4h-4"/></svg>';
const ICON_CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

/** Save or unsave a job with one tap on a bookmark, like the big job sites. */
function bookmarkButton(job) {
  const state = () => store.get().jobs[job.id];
  const b = h('button', { type: 'button', class: 'icon-btn bookmark' });
  const paint = () => {
    const on = Boolean(state());
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? `Saved: ${job.title}` : `Save ${job.title}`);
    b.title = on ? 'Saved' : 'Save';
  };
  b.append(svgIcon(ICON_BOOKMARK));
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    const s = state();
    if (!s) {
      store.saveJob(job);
      toast('Saved to your applications');
    } else if (s.status === 'saved') {
      store.removeJob(job.id);
      toast('Removed from saved jobs');
    } else {
      toast('Already in your applications');
    }
    paint();
  });
  paint();
  return b;
}

function feedCard(job) {
  const href = `#/job/${encodeURIComponent(job.id)}`;
  const row = h(
    'article',
    { class: 'feed-card pick' },
    companyAvatar(job.company || job.source),
    h(
      'div',
      { class: 'pick-main' },
      h('h3', {}, h('a', { href }, job.title)),
      h('p', { class: 'pick-company' }, [job.company, job.location].filter(Boolean).join(' · ')),
      h('div', { class: 'pick-meta' }, postedTag(job), h('span', { class: 'pick-source' }, job.source)),
      job.match?.reason ? h('p', { class: 'pick-reason' }, job.match.reason) : '',
    ),
    h('div', { class: 'pick-side' }, scorePill(job.match), h('div', { class: 'row' }, bookmarkButton(job), h('span', { class: 'pick-go', 'aria-hidden': 'true' }, svgIcon(ICON_CHEVRON)))),
  );
  row.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) return;
    go(`/job/${encodeURIComponent(job.id)}`);
  });
  return row;
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
  [/^\/documents$/, renderDocumentsHub],
  [/^\/documents\/(cv|letter)$/, (k) => renderDocuments(k)],
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
// The screen shown while Vora writes a CV or a letter: a page being written,
// the steps Vora is working through, progress and time, and Cancel.
// ---------------------------------------------------------------------------

const WRITING = {
  layout: { doc: 'cv', title: 'Laying out your CV', seconds: 25, steps: ['Reading your CV', 'Finding each section', 'Placing every line in the template', 'Checking nothing is left out'] },
  tailor: { doc: 'cv', title: 'Writing your CV for this job', seconds: 60, steps: ['Reading the job posting', 'Matching your experience to it', 'Rewriting your CV for this role', 'Checking the wording'] },
  letter: { doc: 'letter', title: 'Writing your cover letter', seconds: 35, steps: ['Reading your profile', 'Choosing what to highlight', 'Writing your letter', 'Polishing the wording'] },
  edit: { doc: 'cv', title: 'Updating your document', seconds: 25, steps: ['Reading your document', 'Making the change', 'Checking the wording'] },
};

/**
 * Show the writing screen. `kind` is a key of WRITING; `doc` and `title`
 * override its defaults. Returns { done(), close() }: done() fills the bar and
 * fades out; close() just removes it (after an error or Cancel).
 */
/** Throw if the user cancelled, so a late AI answer is never saved. */
function stopIfCancelled(signal) {
  if (signal?.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
}

function writingScreen(kind, { title, doc } = {}) {
  const spec = { ...WRITING[kind || 'edit'] };
  if (title) spec.title = title;
  if (doc) spec.doc = doc;
  const started = performance.now();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // A small page that fills with lines, like a document being typed.
  const line = (w, cls = '') => h('span', { class: `vw-l ${cls}`, style: `--w:${w}%` });
  const paper =
    spec.doc === 'letter'
      ? h('div', { class: 'vw-paper letter', 'aria-hidden': 'true' }, line(46, 'head'), line(30, 'sub'), h('span', { class: 'vw-rule' }), line(28, 'right'), line(38), line(34), line(52, 'bold'), line(96), line(92), line(98), line(64), line(95), line(90), line(97), line(72), line(30), line(36))
      : h('div', { class: 'vw-paper cv', 'aria-hidden': 'true' }, line(52, 'head'), line(36, 'sub'), line(70, 'meta'), line(24, 'sect'), line(96), line(88), line(24, 'sect'), line(42, 'bold'), line(90, 'bullet'), line(84, 'bullet'), line(76, 'bullet'), line(38, 'bold'), line(86, 'bullet'), line(70, 'bullet'), line(24, 'sect'), line(60), line(48));
  [...paper.querySelectorAll('.vw-l')].forEach((el, i) => el.style.setProperty('--i', i));

  const steps = h('ol', { class: 'vw-steps' }, ...spec.steps.map((t) => h('li', {}, h('span', { class: 'vw-dot', 'aria-hidden': 'true' }), h('span', {}, t))));
  const bar = h('span', {});
  const pct = h('span', { class: 'vw-pct' }, '0%');
  const clock = h('span', { class: 'vw-time' }, '0:00');
  const status = h('p', { class: 'vw-status', role: 'status', 'aria-live': 'polite' }, spec.steps[0]);
  const cancel = h('button', { type: 'button', class: 'btn small ghost vw-cancel' }, 'Cancel');
  const el = h(
    'div',
    { class: 'vw', role: 'dialog', 'aria-modal': 'true', 'aria-label': spec.title },
    h(
      'div',
      { class: 'vw-card' },
      h('div', { class: 'vw-stage' }, paper, h('div', { class: 'vw-glow', 'aria-hidden': 'true' })),
      h(
        'div',
        { class: 'vw-side' },
        h('p', { class: 'eyebrow vw-brand' }, svgIcon('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>'), 'Vora AI'),
        h('h2', {}, spec.title),
        status,
        steps,
        h('div', { class: 'vw-progress', role: 'progressbar', 'aria-label': 'Progress' }, bar),
        h('div', { class: 'vw-foot' }, h('span', { class: 'vw-meta' }, pct, ' · ', clock, h('span', { class: 'vw-est' }, h('span', { 'aria-hidden': 'true' }, ' · '), h('span', {}, `usually about ${spec.seconds} seconds`))), cancel),
      ),
    ),
  );
  cancel.addEventListener('click', () => {
    currentAbort?.abort();
    close();
    toast('Stopped. Nothing was changed.');
  });

  // Progress eases towards 95% over the usual time, then crawls; steps follow it.
  let progress = 0;
  let finished = false;
  function tick() {
    if (!el.isConnected || finished) return;
    const secs = (performance.now() - started) / 1000;
    const target = secs < spec.seconds ? 95 * (1 - Math.exp((-2.6 * secs) / spec.seconds)) / (1 - Math.exp(-2.6)) : Math.min(98, 95 + (secs - spec.seconds) / 10);
    progress = Math.max(progress, Math.min(target, 98));
    paint(secs);
    requestAnimationFrame(() => setTimeout(tick, 200));
  }
  function paint(secs) {
    bar.style.width = `${progress}%`;
    pct.textContent = `${Math.round(progress)}%`;
    clock.textContent = `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
    const active = finished ? spec.steps.length : Math.min(spec.steps.length - 1, Math.floor((progress / 100) * spec.steps.length));
    [...steps.children].forEach((li, i) => li.className = i < active ? 'done' : i === active ? 'active' : '');
    const now = spec.steps[Math.min(active, spec.steps.length - 1)];
    if (!finished && status.textContent !== `${now}…`) status.textContent = `${now}…`;
  }

  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  if (reduce) el.classList.add('still');
  tick();
  cancel.focus({ preventScroll: true });

  function close() {
    if (!el.isConnected) return;
    finished = true;
    document.body.style.overflow = prevOverflow;
    el.classList.remove('in');
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  }
  return {
    async done() {
      if (!el.isConnected) return;
      finished = true;
      progress = 100;
      paint((performance.now() - started) / 1000);
      status.textContent = 'Done';
      el.classList.add('complete');
      await new Promise((r) => setTimeout(r, reduce ? 150 : 650));
      close();
    },
    close,
  };
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

function greeting() {
  const hr = new Date().getHours();
  return hr < 5 ? 'Good evening' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
}

function renderHome() {
  const { jobs, profile, docs } = store.get();
  const all = Object.values(jobs);
  const count = (s) => all.filter((j) => j.status === s).length;
  const first = profile.name.split(' ')[0];

  const runSearch = ({ query, location }) => {
    const remoteOnly = /^remote$/i.test(location);
    session.query = { query, location: remoteOnly ? '' : location, remoteOnly, sources: [...SOURCE_IDS] };
    session.results = [];
    session.autoSearch = true;
    go('/find');
  };
  const { form } = searchBar({
    what: profile.targetRoles.split(',')[0]?.trim() || '',
    where: profile.remoteOnly ? 'remote' : profile.location,
    idPrefix: 'home',
    onSubmit: runSearch,
  });
  const recents = recentSearches().slice(0, 4);
  const recentRow = recents.length
    ? h(
        'div',
        { class: 'recent-row' },
        h('span', { class: 'recent-label' }, 'Recent searches'),
        ...recents.map((r) => {
          const b = h('button', { type: 'button', class: 'recent-chip' }, svgIcon(ICON_SEARCH), r.query, r.location ? h('span', { class: 'muted' }, ` · ${r.location}`) : '');
          b.addEventListener('click', () => runSearch(r));
          return b;
        }),
      )
    : '';

  // "Pick up where you left off": the most important next action per job, interviews first.
  const ORDER = { interview: 0, offer: 1, applied: 2, saved: 3 };
  const actions = all
    .filter((j) => j.status in ORDER && !(j.status === 'applied' && nextStep(j).tone !== 'warn'))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || lastActivity(b) - lastActivity(a))
    .slice(0, 3);
  const upNext = actions.length
    ? h(
        'section',
        { class: 'up-next', 'aria-label': 'Pick up where you left off' },
        h('div', { class: 'section-title' }, h('h2', {}, 'Pick up where you left off'), h('a', { class: 'small', href: '#/tracker' }, 'All applications')),
        h(
          'div',
          { class: 'up-next-row' },
          ...actions.map((j) => {
            const next = nextStep(j);
            const tile = h(
              'a',
              { class: `up-tile status-${j.status}`, href: `#/job/${encodeURIComponent(j.id)}` },
              h('div', { class: 'up-tile-head' }, companyAvatar(j.company, 'sm'), h('div', {}, h('strong', {}, j.title), h('span', {}, j.company || ''))),
              h('span', { class: `up-action ${next.tone || ''}` }, next.text, svgIcon(ICON_CHEVRON)),
            );
            tile.addEventListener('click', () => {
              if (!next.tab) return;
              try {
                sessionStorage.setItem('ajh:tab', next.tab);
              } catch {}
            });
            return tile;
          }),
        ),
      )
    : '';

  // Side rail: pipeline at a glance, profile strength, getting started.
  const strength = profileStrength(profile);
  const steps = [
    { done: Boolean(profile.cv.trim()), label: 'Upload your CV', href: '#/profile' },
    { done: all.length > 0, label: 'Save a job you like', href: '#/find' },
    { done: all.some((j) => docs[j.id]?.cvData || docs[j.id]?.cv), label: 'Create a tailored CV for it', href: '#/tracker' },
    { done: count('applied') + count('interview') + count('offer') > 0, label: 'Apply and move it to Applied', href: '#/tracker' },
    { done: Object.values(store.get().prep).some((p) => p?.results?.length), label: 'Play an interview game', href: '#/tracker' },
  ];
  const doneSteps = steps.filter((x) => x.done).length;
  const level = strength.score >= 80 ? 'high' : strength.score >= 50 ? 'mid' : 'low';

  const side = h(
    'aside',
    { class: 'home-side' },
    h(
      'section',
      { class: 'card rail-card' },
      h('div', { class: 'section-title' }, h('h2', {}, 'Your job search'), h('a', { class: 'small', href: '#/tracker' }, 'Open')),
      h(
        'div',
        { class: 'mini-stats' },
        ...STATUSES.filter((st) => st.id !== 'rejected').map((st) => h('a', { href: '#/tracker', class: `mini-stat status-${st.id}` }, h('strong', {}, String(count(st.id))), h('span', {}, h('span', { class: 'dot' }), st.label))),
      ),
      all.length
        ? h('div', { class: 'pipe-bar' }, ...STATUSES.filter((st) => count(st.id)).map((st) => h('span', { class: `status-${st.id}`, style: `flex:${count(st.id)}`, title: `${st.label}: ${count(st.id)}` })))
        : h('p', { class: 'small muted', style: 'margin:0' }, 'Save a job to start tracking your applications.'),
    ),
    h(
      'section',
      { class: 'card rail-card strength-card' },
      h('div', { class: `ring ring-${level}`, style: `--p:${strength.score}`, role: 'img', 'aria-label': `Profile ${strength.score}% complete` }, h('strong', {}, `${strength.score}%`)),
      h(
        'div',
        {},
        h('h2', {}, 'Profile strength'),
        strength.next
          ? h('p', { class: 'small muted' }, 'Next: ', h('a', { href: '#/profile' }, strength.next))
          : h('p', { class: 'small muted' }, 'Complete. Vora has everything it needs to match you.'),
      ),
    ),
    doneSteps === steps.length
      ? ''
      : h(
          'section',
          { class: 'card rail-card' },
          h('div', { class: 'section-title' }, h('h2', {}, 'Getting started'), h('span', { class: 'small muted' }, `${doneSteps} of ${steps.length}`)),
          h('div', { class: 'meter' }, h('span', { style: `width:${(doneSteps / steps.length) * 100}%` })),
          h('ol', { class: 'checklist' }, ...steps.map((x) => h('li', { class: x.done ? 'done' : '' }, h('a', { href: x.href }, x.label)))),
        ),
  );

  const feedNew = store.get().feed?.jobs?.length;
  view.append(
    h(
      'section',
      { class: 'home-hero' },
      h('p', { class: 'eyebrow' }, new Date().toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })),
      h('h1', {}, first ? `${greeting()}, ${first}` : 'Find your next job'),
      h('p', {}, first && feedNew ? 'Here is what is new in your job search today.' : 'One search covers the job portals near you. Vora ranks every role against your CV, then helps you tailor your application and practise the interview.'),
      form,
      recentRow,
    ),
    upNext,
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
// Applications: pipeline summary, board and list views
// ---------------------------------------------------------------------------

const DAY_MS = 864e5;
const ICON_BOARD = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="14" rx="1.5"/></svg>';
const ICON_LIST = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>';
const svg = (markup) => {
  const span = h('span', { class: 'ico', 'aria-hidden': 'true' });
  span.innerHTML = markup;
  return span;
};

/** When something last happened to a tracked job. */
function lastActivity(job) {
  return Math.max(job.savedAt || 0, job.appliedAt || 0, ...(job.history || []).map((e) => e.at || 0));
}

function daysAgo(ts) {
  const d = Math.max(0, Math.floor((Date.now() - ts) / DAY_MS));
  return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

/** What the candidate should do next for a job in its current stage. */
function nextStep(job) {
  const since = Date.now() - (job.appliedAt || lastActivity(job));
  switch (job.status) {
    case 'saved':
      return { text: 'Tailor your CV and apply', tab: 'docs' };
    case 'applied':
      return since > 7 * DAY_MS ? { text: 'Follow up with the recruiter', tone: 'warn' } : { text: 'Waiting for a reply' };
    case 'interview':
      return { text: 'Practise for the interview', tab: 'prep', tone: 'accent' };
    case 'offer':
      return { text: 'Review and negotiate the offer', tone: 'ok' };
    default:
      return { text: 'Ask for feedback, keep going' };
  }
}

/** A company's initial on a tint picked from its name, like the logo slot on big job sites. */
function companyAvatar(name, size = '') {
  const text = String(name || '?').trim();
  let hash = 0;
  for (const c of text) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return h('span', { class: `co-avatar ${size}`, style: `--co-h:${hash % 360}`, 'aria-hidden': 'true' }, (text.match(/[A-Za-zÀ-ÿ0-9]/)?.[0] || '?').toUpperCase());
}

function renderTracker() {
  let mode = 'board';
  try {
    mode = localStorage.getItem('ajh:trackerView') || 'board';
  } catch {}
  let stage = '';
  let sort = 'recent';
  const search = h('input', { type: 'search', placeholder: 'Search title or company', 'aria-label': 'Search applications' });
  const sortSel = h(
    'select',
    { 'aria-label': 'Sort by', class: 'sort-select' },
    h('option', { value: 'recent' }, 'Recently updated'),
    h('option', { value: 'match' }, 'Best match'),
    h('option', { value: 'company' }, 'Company A–Z'),
  );
  const modeBtn = (id, label, icon) => {
    const b = h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(mode === id) }, svg(icon), h('span', {}, label));
    b.addEventListener('click', () => {
      mode = id;
      try {
        localStorage.setItem('ajh:trackerView', id);
      } catch {}
      draw();
    });
    return b;
  };
  const seg = h('div', { class: 'segmented', role: 'group', 'aria-label': 'View' });
  const stats = h('section', { class: 'app-pipeline', 'aria-label': 'Pipeline summary' });
  const toolbar = h('div', { class: 'tracker-toolbar' });
  const content = h('div', { class: 'tracker-content' });

  const SORTS = {
    recent: (a, b) => lastActivity(b) - lastActivity(a),
    match: (a, b) => (b.match?.score ?? -1) - (a.match?.score ?? -1) || lastActivity(b) - lastActivity(a),
    company: (a, b) => String(a.company || '').localeCompare(String(b.company || '')) || String(a.title).localeCompare(String(b.title)),
  };

  function move(job, to) {
    store.setStatus(job.id, to);
    toast(`Moved to ${STATUSES.find((x) => x.id === to).label}`);
    draw();
  }

  function drawStats(all) {
    const n = (id) => all.filter((j) => j.status === id).length;
    const applied = all.filter((j) => j.appliedAt || ['applied', 'interview', 'offer', 'rejected'].includes(j.status)).length;
    const heard = n('interview') + n('offer') + n('rejected');
    const thisWeek = all.filter((j) => j.appliedAt && Date.now() - j.appliedAt < 7 * DAY_MS).length;
    const tile = (label, value, sub, cls = '') =>
      h('div', { class: `stat ${cls}` }, h('span', { class: 'stat-label' }, label), h('strong', { class: 'stat-value' }, value), h('span', { class: 'stat-sub' }, sub));
    stats.replaceChildren(
      h(
        'div',
        { class: 'stat-row' },
        tile('Tracked', String(all.length), `${n('saved')} saved to apply`),
        tile('Applied', String(applied), thisWeek ? `${thisWeek} this week` : 'none this week'),
        tile('Interviews', String(n('interview') + n('offer')), n('interview') ? `${n('interview')} in progress` : 'none in progress', n('interview') + n('offer') ? 'is-interview' : ''),
        tile('Offers', String(n('offer')), n('offer') ? 'congratulations' : 'keep going', n('offer') ? 'is-offer' : ''),
        tile('Response rate', applied ? `${Math.round((heard / applied) * 100)}%` : '–', applied ? `${heard} of ${applied} replied` : 'apply to see it'),
      ),
      all.length
        ? h(
            'div',
            { class: 'pipe-bar', role: 'img', 'aria-label': STATUSES.map((s) => `${s.label} ${n(s.id)}`).join(', ') },
            ...STATUSES.filter((s) => n(s.id)).map((s) => h('span', { class: `status-${s.id}`, style: `flex:${n(s.id)}`, title: `${s.label}: ${n(s.id)}` })),
          )
        : '',
    );
  }

  function menuFor(job) {
    const menu = h('details', { class: 'card-menu' });
    const list = h('div', { class: 'menu', role: 'menu' });
    list.append(h('p', { class: 'menu-label' }, 'Move to'));
    for (const s of STATUSES) {
      if (s.id === job.status) continue;
      const b = h('button', { type: 'button', role: 'menuitem', class: `status-${s.id}` }, h('span', { class: 'dot' }), s.label);
      b.addEventListener('click', (e) => {
        e.preventDefault();
        move(job, s.id);
      });
      list.append(b);
    }
    const open = h('a', { role: 'menuitem', href: `#/job/${encodeURIComponent(job.id)}` }, 'Open job');
    const remove = confirmButton('Remove', 'Tap again to remove', () => {
      store.removeJob(job.id);
      toast('Job removed');
      draw();
    }, 'menu-danger');
    list.append(h('hr'), open, job.url ? h('a', { role: 'menuitem', href: safeUrl(job.url), target: '_blank', rel: 'noopener noreferrer' }, 'View posting ↗') : '', remove);
    menu.append(h('summary', { 'aria-label': `Actions for ${job.title}`, title: 'Actions' }, '⋯'), list);
    menu.addEventListener('click', (e) => e.stopPropagation());
    // Float the menu over the page (columns scroll, so it would be clipped),
    // below the button, or above it when there is no room underneath.
    menu.addEventListener('toggle', () => {
      if (!menu.open) return;
      for (const d of view.querySelectorAll('details.card-menu[open]')) if (d !== menu) d.open = false;
      const r = menu.firstChild.getBoundingClientRect();
      const height = list.offsetHeight;
      const below = r.bottom + 6 + height < innerHeight;
      list.style.left = `${Math.max(8, Math.min(r.right - list.offsetWidth, innerWidth - list.offsetWidth - 8))}px`;
      list.style.top = `${below ? r.bottom + 6 : Math.max(8, r.top - height - 6)}px`;
    });
    return menu;
  }

  function activityText(job) {
    if (job.status === 'saved') return `Saved ${daysAgo(job.savedAt || Date.now())}`;
    if (job.status === 'applied') return `Applied ${daysAgo(job.appliedAt || lastActivity(job))}`;
    const at = [...(job.history || [])].reverse().find((e) => e.status === job.status)?.at || lastActivity(job);
    return `${STATUSES.find((x) => x.id === job.status)?.label} · ${daysAgo(at)}`;
  }

  function card(job) {
    const next = nextStep(job);
    const href = `#/job/${encodeURIComponent(job.id)}`;
    const el = h(
      'article',
      { class: 'app-card', draggable: 'true', 'data-id': job.id },
      h(
        'div',
        { class: 'app-card-head' },
        companyAvatar(job.company),
        h('div', { class: 'app-card-title' }, h('a', { href, class: 'app-title' }, job.title), h('p', { class: 'app-company' }, [job.company, job.location].filter(Boolean).join(' · '))),
        menuFor(job),
      ),
      h('div', { class: 'app-card-meta' }, job.match ? scorePill(job.match) : '', h('span', { class: 'app-when' }, activityText(job))),
      h('div', { class: `next-step ${next.tone || ''}` }, h('span', { class: 'next-label' }, 'Next'), next.text),
    );
    el.addEventListener('click', (e) => {
      if (e.target.closest('a, button, details')) return;
      if (next.tab) {
        try {
          sessionStorage.setItem('ajh:tab', next.tab);
        } catch {}
      }
      go(`/job/${encodeURIComponent(job.id)}`);
    });
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', job.id);
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    return el;
  }

  function board(jobs) {
    return h(
      'div',
      { class: 'board' },
      ...STATUSES.map((s) => {
        const items = jobs.filter((j) => j.status === s.id);
        const col = h(
          'section',
          { class: `column status-${s.id}`, 'data-status': s.id, 'aria-label': s.label },
          h(
            'header',
            { class: 'column-head' },
            h('span', { class: 'dot' }),
            h('h2', {}, s.label),
            h('span', { class: 'count' }, String(items.length)),
            s.id === 'saved' ? h('a', { class: 'col-add', href: '#/add', title: 'Add a job', 'aria-label': 'Add a job' }, '+') : '',
          ),
          h('div', { class: 'column-body' }, ...(items.length ? items.map(card) : [h('div', { class: 'empty-col' }, s.id === 'saved' ? 'Save jobs from search to start' : 'Drag a card here')])),
        );
        col.addEventListener('dragover', (e) => {
          e.preventDefault();
          col.classList.add('drop');
        });
        col.addEventListener('dragleave', (e) => {
          if (!col.contains(e.relatedTarget)) col.classList.remove('drop');
        });
        col.addEventListener('drop', (e) => {
          e.preventDefault();
          col.classList.remove('drop');
          const id = e.dataTransfer.getData('text/plain');
          const job = store.get().jobs[id];
          if (job && job.status !== s.id) move(job, s.id);
        });
        return col;
      }),
    );
  }

  function list(jobs) {
    const shown = stage ? jobs.filter((j) => j.status === stage) : jobs;
    const chip = (id, label, count) => {
      const b = h('button', { type: 'button', class: `chip ${id ? `status-${id}` : ''}`, 'aria-pressed': String(stage === id) }, id ? h('span', { class: 'dot' }) : '', label, h('span', { class: 'chip-count' }, String(count)));
      b.addEventListener('click', () => {
        stage = id;
        draw();
      });
      return b;
    };
    const rows = shown.map((job) => {
      const next = nextStep(job);
      const select = h('select', { class: `stage-select status-${job.status}`, 'aria-label': `Stage of ${job.title}` }, ...STATUSES.map((s) => h('option', { value: s.id, selected: s.id === job.status }, s.label)));
      select.addEventListener('change', () => move(job, select.value));
      const tr = h(
        'tr',
        { tabindex: '0' },
        h('td', { class: 'cell-role' }, h('div', { class: 'role-wrap' }, companyAvatar(job.company, 'sm'), h('div', {}, h('a', { href: `#/job/${encodeURIComponent(job.id)}`, class: 'app-title' }, job.title), h('span', { class: 'app-company' }, job.company || '')))),
        h('td', { class: 'cell-stage', 'data-label': 'Stage' }, select),
        h('td', { class: 'cell-match', 'data-label': 'Match' }, job.match ? scorePill(job.match) : h('span', { class: 'muted' }, '–')),
        h('td', { class: 'cell-loc', 'data-label': 'Location' }, job.location || h('span', { class: 'muted' }, '–')),
        h('td', { class: 'cell-when', 'data-label': 'Activity' }, activityText(job)),
        h('td', { class: 'cell-next', 'data-label': 'Next' }, h('span', { class: `next-step inline ${next.tone || ''}` }, next.text)),
        h('td', { class: 'cell-menu' }, menuFor(job)),
      );
      const open = (e) => {
        if (e.target.closest('a, button, select, details')) return;
        go(`/job/${encodeURIComponent(job.id)}`);
      };
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (e) => e.key === 'Enter' && open(e));
      return tr;
    });
    return h(
      'div',
      { class: 'list-view' },
      h('div', { class: 'chip-row stage-chips', role: 'group', 'aria-label': 'Filter by stage' }, chip('', 'All', jobs.length), ...STATUSES.map((s) => chip(s.id, s.label, jobs.filter((j) => j.status === s.id).length))),
      shown.length
        ? h(
            'div',
            { class: 'table-wrap' },
            h(
              'table',
              { class: 'app-table' },
              h('thead', {}, h('tr', {}, ...['Role', 'Stage', 'Match', 'Location', 'Activity', 'Next step', ''].map((t) => h('th', { scope: 'col' }, t)))),
              h('tbody', {}, ...rows),
            ),
          )
        : h('p', { class: 'muted empty-col' }, 'No applications in this stage.'),
    );
  }

  function emptyState() {
    return h(
      'section',
      { class: 'card tracker-empty' },
      svg(ICON_BOARD),
      h('h2', {}, 'Track every application in one place'),
      h('p', { class: 'muted' }, 'Save jobs from your matches or search, then move them from Saved to Applied, Interview and Offer. Vora tells you the next step for each one.'),
      h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/find' }, 'Find jobs'), h('a', { class: 'btn', href: '#/add' }, 'Add a job')),
    );
  }

  function draw() {
    const all = Object.values(store.get().jobs);
    drawStats(all);
    seg.replaceChildren(modeBtn('board', 'Board', ICON_BOARD), modeBtn('list', 'List', ICON_LIST));
    toolbar.replaceChildren(h('label', { class: 'search-field' }, svg(ICON_SEARCH), search), h('div', { class: 'toolbar-right' }, sortSel, seg));
    toolbar.hidden = !all.length;
    if (!all.length) return content.replaceChildren(emptyState());
    const term = search.value.trim().toLowerCase();
    const jobs = all.filter((j) => !term || `${j.title} ${j.company} ${j.location || ''}`.toLowerCase().includes(term)).sort(SORTS[sort]);
    content.replaceChildren(mode === 'list' ? list(jobs) : board(jobs));
  }

  search.addEventListener('input', debounce(draw, 120));
  sortSel.addEventListener('change', () => {
    sort = sortSel.value;
    draw();
  });
  // Close an open card menu when clicking elsewhere.
  const closeMenus = (e) => {
    if (!view.contains(stats)) return document.removeEventListener('click', closeMenus);
    for (const d of view.querySelectorAll('details.card-menu[open]')) if (!d.contains(e.target)) d.open = false;
  };
  document.addEventListener('click', closeMenus);
  // A floating menu would drift away from its card on scroll, so scrolling closes it.
  const closeOnScroll = () => {
    if (!view.contains(stats)) return removeEventListener('scroll', closeOnScroll, true);
    for (const d of view.querySelectorAll('details.card-menu[open]')) d.open = false;
  };
  addEventListener('scroll', closeOnScroll, true);

  view.append(
    pageHeader('Applications', 'Your job search pipeline, from saved to offer.', h('a', { class: 'btn primary', href: '#/add' }, '+ Add job')),
    stats,
    toolbar,
    content,
  );
  draw();
}

// ---------------------------------------------------------------------------
// Documents: the main CV and a general cover letter, edited like a Word page
// ---------------------------------------------------------------------------

const ICON_UNDO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>';
const ICON_REDO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>';
const ICON_DOC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>';
const ICON_MAIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>';
const ICON_SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const ICON_PALETTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.2-1.8-.5-1-.1-2.2 1.2-2.2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/></svg>';
const ICON_OUTLINE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M8 12h12M8 18h12"/></svg>';
const ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>';
const ICON_CLOUD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19.5 10 4 4 0 0 1 18 18z"/><path d="M9.5 13.5l2 2 3.5-3.5"/></svg>';
const A4_HEIGHT = 1123;

// The screen fonts for the font picker (the PDF embeds the same fonts).
function ensureEditorFonts() {
  if (document.getElementById('vora-doc-fonts')) return;
  const fams = ['Arimo', 'Carlito', 'Inter', 'Lato', 'Roboto', 'Montserrat', 'EB+Garamond', 'Lora'].map((f) => `family=${f}:ital,wght@0,400;0,700;1,400;1,700`).join('&');
  document.head.append(h('link', { id: 'vora-doc-fonts', rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?${fams}&display=swap` }));
}

// The Documents hub: the main CV and the general cover letter as cards, plus
// everything written for a specific job. Opening one goes to the editor.
function renderDocumentsHub() {
  ensureEditorFonts();
  const st = store.get();
  const m = st.master || {};
  const L = m.letter || {};
  const name = st.profile.name.trim();
  const cvData = m.cvData;
  const letterFont = L.font ?? m.font ?? '';
  const letterTpl = getTemplate(L.template || m.template);
  const letterAccent = accentFor(letterTpl, L.accent || (L.template ? '' : m.accent));
  const words = (t) => (String(t || '').match(/\S+/g) || []).length;

  async function pdf(btn, kind) {
    const label = btn.lastChild.textContent;
    btn.disabled = true;
    btn.lastChild.textContent = 'Making PDF…';
    try {
      const font = kind === 'cv' ? m.font || '' : letterFont;
      const base = slug(`${name || 'document'}-${kind === 'cv' ? 'cv' : 'cover-letter'}`);
      const def =
        kind === 'cv'
          ? cvPDFDefinition(cvData, getTemplate(m.template).id, accentFor(getTemplate(m.template), m.accent), { font })
          : letterPDFDefinition(cvData || cvFromProfile(st.profile), L.body || '', letterTpl.id, letterAccent, { title: '', company: '', location: '', date: L.date, dateLine: L.dateLine, recipient: L.to, subject: L.subject }, { font });
      await download(`${base}.pdf`, await makePDF(def, { font }), 'application/pdf');
    } catch (err) {
      console.error(err);
      toast('Could not make the PDF. Check your connection and try again.');
    } finally {
      btn.disabled = false;
      btn.lastChild.textContent = label;
    }
  }

  function card(kind) {
    const has = kind === 'cv' ? Boolean(cvData) : typeof L.body === 'string';
    const tpl = kind === 'cv' ? getTemplate(m.template) : letterTpl;
    const font = fontChoice(kind === 'cv' ? m.font || '' : letterFont);
    const href = `#/documents/${kind}`;
    const thumb = has
      ? h('div', { class: 'hub-paper', 'aria-hidden': 'true' }, kind === 'cv' ? renderCV(cvData, tpl.id, accentFor(tpl, m.accent), { font: font.id }) : renderLetter(cvData || cvFromProfile(st.profile), L.body || '', tpl.id, letterAccent, { title: '', company: '', location: '', date: L.date, dateLine: L.dateLine, recipient: L.to, subject: L.subject }, { font: font.id }))
      : h('div', { class: 'hub-paper empty', 'aria-hidden': 'true' }, h('span', { class: 'hub-plus' }, '+'));
    const title = kind === 'cv' ? 'CV' : 'Cover letter';
    const actions = h('div', { class: 'hub-actions' }, h('a', { class: `btn ${has ? 'primary' : 'primary'} small`, href }, has ? 'Open editor' : kind === 'cv' ? 'Create CV' : 'Write letter'));
    if (has) {
      const dl = h('button', { type: 'button', class: 'btn small' }, svgIcon(ICON_DOWNLOAD), h('span', {}, 'PDF'));
      dl.addEventListener('click', () => pdf(dl, kind));
      actions.append(dl);
    }
    const meta = has
      ? [tpl.name, font.id ? font.name : 'Template font', kind === 'cv' ? ((n) => `${n} ${n === 1 ? 'job' : 'jobs'}`)((cvData.experience || []).length) : `${words(L.body)} words`]
      : [kind === 'cv' ? 'Laid out from your profile, or start blank' : 'A general letter you can adapt to any job'];
    return h(
      'article',
      { class: `hub-card${has ? '' : ' is-empty'}` },
      h('a', { class: 'hub-thumb', href, 'aria-label': has ? `Open ${title}` : `Create ${title}` }, thumb, has ? h('span', { class: 'hub-open' }, 'Open') : ''),
      h(
        'div',
        { class: 'hub-info' },
        h('div', { class: 'hub-title' }, h('span', { class: 'hub-icon', 'aria-hidden': 'true' }, svgIcon(kind === 'cv' ? ICON_DOC : ICON_MAIL)), h('h2', {}, title), has ? h('span', { class: 'tpl-badge' }, tpl.ats ? 'ATS friendly' : 'Design') : ''),
        h('p', { class: 'hub-meta' }, ...meta.flatMap((x, i) => (i ? [h('span', { 'aria-hidden': 'true' }, ' · '), h('span', {}, x)] : [h('span', {}, x)]))),
        has && m.updatedAt ? h('p', { class: 'hub-when' }, `Edited ${timeAgo(m.updatedAt)}`) : '',
        actions,
      ),
    );
  }

  const forJobs = Object.entries(st.docs || {})
    .filter(([id, d]) => st.jobs[id] && (d.cvData || d.coverLetter))
    .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
    .slice(0, 12);

  const tips = [
    ['Pick a font', 'Ten fonts, from Calibri and Arial styles to Garamond. The PDF uses the same font.'],
    ['Check before sending', 'Check lists what a recruiter notices first, and Vora fixes it in one click.'],
    ['Ask Vora', 'Tell Vora what to change ("make it shorter", "add my Python course") and it edits the page.'],
  ];

  view.append(
    h(
      'section',
      { class: 'hub' },
      pageHeader('Documents', 'Your CV and cover letter. Edit them like in Word, then download a PDF.'),
      h('div', { class: 'hub-grid' }, card('cv'), card('letter')),
      h('div', { class: 'hub-tips' }, ...tips.map(([t, d], i) => h('div', { class: 'hub-tip' }, h('span', { class: 'hub-tip-n', 'aria-hidden': 'true' }, String(i + 1)), h('div', {}, h('strong', {}, t), h('p', {}, d))))),
      forJobs.length
        ? h(
            'section',
            { class: 'hub-jobs' },
            h('div', { class: 'section-title' }, h('h2', {}, 'Written for a job')),
            h(
              'ul',
              { class: 'hub-job-list' },
              ...forJobs.map(([id, d]) => {
                const j = st.jobs[id];
                return h(
                  'li',
                  {},
                  h(
                    'a',
                    { href: `#/job/${encodeURIComponent(id)}` },
                    h('span', { class: 'hub-job-logo', 'aria-hidden': 'true' }, (j.company || '?').trim().charAt(0).toUpperCase()),
                    h('span', { class: 'hub-job-text' }, h('strong', {}, j.title), h('small', {}, [j.company, d.updatedAt ? timeAgo(d.updatedAt) : ''].filter(Boolean).join(' · '))),
                    h('span', { class: 'hub-job-tags' }, d.cvData ? h('span', { class: 'tpl-badge' }, 'CV') : '', d.coverLetter ? h('span', { class: 'tpl-badge' }, 'Letter') : ''),
                  ),
                );
              }),
            ),
          )
        : '',
    ),
  );
}

function renderDocuments(initialKind) {
  ensureEditorFonts();
  const master = () => store.get().master || {};
  const saveMaster = (patch) => store.update((s) => (s.master = { ...(s.master || {}), ...patch, updatedAt: Date.now() }));
  const letterOf = () => master().letter || {};
  const saveLetter = (patch) => saveMaster({ letter: { ...letterOf(), ...patch } });

  let kind = initialKind === 'letter' ? 'letter' : 'cv';
  try {
    sessionStorage.setItem('ajh:doc', kind);
  } catch {}
  let zoom = 'fit';
  let designOpen = window.innerWidth >= 1100;
  let chatOpen = false;
  let checkOpen = false;
  let outlineOpen = window.innerWidth >= 1280;

  // ----- the document being edited -----
  const cv = () => master().cvData;
  const letterCV = () => cv() || cvFromProfile(store.get().profile);
  const tplId = () => (kind === 'cv' ? getTemplate(master().template).id : getTemplate(letterOf().template || master().template).id);
  const accent = () => {
    const t = getTemplate(tplId());
    return accentFor(t, kind === 'cv' ? master().accent : letterOf().accent || (letterOf().template ? '' : master().accent));
  };
  const letterMeta = () => ({ title: '', company: '', location: '', date: letterOf().date, dateLine: letterOf().dateLine, recipient: letterOf().to, subject: letterOf().subject });
  const hasDoc = () => (kind === 'cv' ? Boolean(cv()) : typeof letterOf().body === 'string');
  // The font: the CV's pick; the letter follows the CV unless it has its own.
  const fontId = () => (kind === 'cv' ? master().font || '' : letterOf().font ?? master().font ?? '');
  const page = (id, color, opts = {}) => (kind === 'cv' ? renderCV(cv(), id, color, { font: fontId(), ...opts }) : renderLetter(letterCV(), letterOf().body || '', id, color, letterMeta(), { font: fontId(), ...opts }));

  // ----- undo / redo: snapshots of the content of each document -----
  const hist = { cv: { stack: [], i: -1 }, letter: { stack: [], i: -1 } };
  const snap = () => JSON.stringify(kind === 'cv' ? cv() : { ...letterOf(), template: undefined, accent: undefined });
  function record() {
    const hs = hist[kind];
    const now = snap();
    if (hs.stack[hs.i] === now) return;
    hs.stack = hs.stack.slice(0, hs.i + 1);
    hs.stack.push(now);
    if (hs.stack.length > 100) hs.stack.shift();
    hs.i = hs.stack.length - 1;
    paintHistory();
  }
  const recordSoon = debounce(record, 450);
  function travel(step) {
    const hs = hist[kind];
    record();
    const j = hs.i + step;
    if (j < 0 || j >= hs.stack.length) return;
    hs.i = j;
    const data = JSON.parse(hs.stack[j]);
    if (kind === 'cv') saveMaster({ cvData: data });
    else saveLetter({ ...data, template: letterOf().template, accent: letterOf().accent });
    renderPaper();
    paintHistory();
    showSaved();
  }

  // ----- top bar -----
  const backBtn = h('a', { class: 'docs-back', href: '#/documents', title: 'All documents', 'aria-label': 'Back to all documents' }, svgIcon('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>'), h('span', {}, 'Documents'));
  const docSwitch = h('div', { class: 'segmented docs-switch', role: 'tablist', 'aria-label': 'Document' });
  const docTitle = h('strong', {});
  const saveState = h('span', { class: 'doc-save', role: 'status' });
  const undoBtn = h('button', { type: 'button', class: 'icon-btn', title: 'Undo (Ctrl+Z)', 'aria-label': 'Undo' }, svgIcon(ICON_UNDO));
  const redoBtn = h('button', { type: 'button', class: 'icon-btn', title: 'Redo (Ctrl+Shift+Z)', 'aria-label': 'Redo' }, svgIcon(ICON_REDO));
  undoBtn.addEventListener('click', () => travel(-1));
  redoBtn.addEventListener('click', () => travel(1));
  const zoomSel = h('select', { class: 'docs-zoom', 'aria-label': 'Zoom' }, ...[['fit', 'Fit'], ['0.75', '75%'], ['1', '100%'], ['1.25', '125%']].map(([v, l]) => h('option', { value: v }, l)));
  zoomSel.addEventListener('change', () => {
    zoom = zoomSel.value;
    fit();
  });
  const pdfBtn = h('button', { type: 'button', class: 'btn primary small docs-pdf' }, svgIcon(ICON_DOWNLOAD), h('span', {}, 'Download PDF'));
  pdfBtn.addEventListener('click', downloadPDF);
  const moreMenu = h('details', { class: 'tb-menu docs-more' });

  // ----- ribbon -----
  const ribbon = h('div', { class: 'docs-ribbon', role: 'toolbar', 'aria-label': 'Formatting' });
  const outlineBtn = h('button', { type: 'button', class: 'rb-btn rb-outline', 'aria-pressed': String(outlineOpen) }, svgIcon(ICON_OUTLINE), h('span', {}, 'Outline'));
  outlineBtn.addEventListener('click', () => {
    outlineOpen = !outlineOpen;
    layout();
  });
  const designBtn = h('button', { type: 'button', class: 'rb-btn', 'aria-pressed': String(designOpen) }, svgIcon(ICON_PALETTE), h('span', { class: 'rb-tpl' }));
  designBtn.addEventListener('click', () => openPanel(designOpen ? '' : 'design'));
  // One side panel at a time: Design, Vora AI or Check.
  function openPanel(name) {
    designOpen = name === 'design';
    chatOpen = name === 'chat';
    checkOpen = name === 'check';
    if (chatOpen) drawChat();
    if (checkOpen) drawCheck();
    layout();
    if (chatOpen) requestAnimationFrame(() => chatInput.focus({ preventScroll: true }));
  }

  // ----- body -----
  const paperScale = h('div', { class: 'paper-scale' });
  const paperFit = h('div', { class: 'paper-fit' }, paperScale);
  const busy = h('div', { class: 'studio-busy', hidden: true }, h('div', { class: 'studio-busy-msg', role: 'status' }));
  const canvas = h('main', { class: 'docs-canvas' }, paperFit, busy);
  const outline = h('nav', { class: 'docs-outline', 'aria-label': 'Outline' });
  const design = h('aside', { class: 'docs-design', 'aria-label': 'Design' });
  const chat = h('aside', { class: 'docs-chat', 'aria-label': 'Vora AI chat' });
  const check = h('aside', { class: 'docs-check', 'aria-label': 'Document check' });
  const status = h('footer', { class: 'docs-status' });
  const appEl = h(
    'div',
    { class: 'docs-app' },
    h(
      'div',
      { class: 'docs-top' },
      backBtn,
      h('div', { class: 'docs-name' }, docTitle, saveState),
      docSwitch,
      h('div', { class: 'docs-top-actions' }, undoBtn, redoBtn, h('span', { class: 'tb-sep' }), zoomSel, moreMenu, pdfBtn),
    ),
    ribbon,
    h('div', { class: 'docs-body' }, outline, canvas, design, chat, check),
    status,
  );

  // ----- saving indicator -----
  let savedTimer = 0;
  function showSaving() {
    saveState.replaceChildren(h('span', { class: 'saving-dot' }), 'Saving…');
    clearTimeout(savedTimer);
    savedTimer = setTimeout(showSaved, 700);
  }
  function showSaved() {
    saveState.replaceChildren(svgIcon(ICON_CLOUD), 'All changes saved');
  }

  // ----- the page -----
  function fit() {
    const pageEl = paperScale.firstElementChild;
    if (!pageEl) return;
    const avail = canvas.clientWidth - (window.innerWidth < 760 ? 16 : 64);
    const scale = zoom === 'fit' ? Math.min(1, avail / pageEl.offsetWidth) : Number(zoom);
    paperScale.style.transform = `scale(${scale})`;
    paperFit.style.width = `${pageEl.offsetWidth * scale}px`;
    paperFit.style.height = `${pageEl.offsetHeight * scale}px`;
    drawStatus(scale);
  }
  const ro = new ResizeObserver(() => fit());
  ro.observe(canvas);

  function focusPath(path, atEnd = true) {
    const el = [...paperScale.querySelectorAll('[data-path]')].find((x) => x.dataset.path === path);
    if (!el) return;
    el.focus();
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(!atEnd);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function renderPaper(focus) {
    appEl.classList.toggle('docs-reflow', window.innerWidth < 760 && hasDoc());
    if (!hasDoc()) {
      paperScale.replaceChildren();
      paperFit.style.width = paperFit.style.height = '';
      canvas.querySelector('.docs-start')?.remove();
      canvas.prepend(startCard());
      drawStatus();
      return;
    }
    canvas.querySelector('.docs-start')?.remove();
    paperScale.replaceChildren(page(tplId(), accent(), { editable: true }));
    if (focus) requestAnimationFrame(() => focusPath(focus));
    requestAnimationFrame(fit);
    drawOutline();
  }

  // Typing on the page writes straight into the document.
  paperScale.addEventListener('input', (e) => {
    const el = e.target.closest?.('[data-path]');
    if (!el) return;
    setField(el.dataset.path, fieldText(el), el.dataset.list || '');
    showSaving();
    recordSoon();
    requestAnimationFrame(fit);
  });
  paperScale.addEventListener('keydown', (e) => {
    const el = e.target.closest?.('[data-path]');
    if (!el) return;
    const path = el.dataset.path;
    const bullet = /\.bullets\.\d+$/.test(path);
    if (e.key === 'Enter' && !e.shiftKey && !el.dataset.multi) {
      e.preventDefault();
      if (bullet && kind === 'cv') act('bullet-after', path);
    } else if (e.key === 'Backspace' && bullet && !fieldText(el).trim() && kind === 'cv') {
      e.preventDefault();
      act('bullet-remove', path);
    }
  });
  paperScale.addEventListener('click', (e) => {
    const b = e.target.closest?.('.ed-ctl');
    if (b && kind === 'cv') act(b.dataset.action, b.dataset.path);
  });
  paperScale.addEventListener('paste', (e) => {
    if (!e.target.closest?.('[data-path]')) return;
    const text = e.clipboardData?.getData('text/plain');
    if (text == null) return;
    e.preventDefault();
    document.execCommand('insertText', false, text);
  });
  // Undo / redo / save shortcuts work anywhere on this page (focus can be on a
  // toolbar button), except while typing in a box like the Vora AI request.
  const onShortcut = (e) => {
    if (!appEl.isConnected) return document.removeEventListener('keydown', onShortcut);
    const mod = e.metaKey || e.ctrlKey;
    if (!mod || !hasDoc() || e.target.closest?.('textarea, input, select')) return;
    const k = e.key.toLowerCase();
    if (k === 'z' || k === 'y') {
      e.preventDefault();
      travel(k === 'y' || e.shiftKey ? 1 : -1);
    } else if (k === 's') {
      e.preventDefault();
      showSaved();
      toast('Saved. Vora saves as you type.');
    }
  };
  document.addEventListener('keydown', onShortcut);

  const LETTER_FIELD = { 'letter.date': 'dateLine', 'letter.to': 'to', 'letter.subject': 'subject', 'letter.body': 'body' };
  const PROFILE_FIELD = { name: 'name', headline: 'headline', 'contact.email': 'email', 'contact.phone': 'phone', 'contact.location': 'location' };
  function setField(path, value, list) {
    if (kind === 'letter' && LETTER_FIELD[path]) return saveLetter({ [LETTER_FIELD[path]]: value });
    if (cv()) {
      const data = structuredClone(cv());
      setAt(data, path, value, list);
      return saveMaster({ cvData: data });
    }
    if (PROFILE_FIELD[path]) store.update((st) => (st.profile[PROFILE_FIELD[path]] = value.trim()));
  }
  function act(action, path) {
    record();
    const data = structuredClone(cv());
    const next = cvAction(data, action, path);
    saveMaster({ cvData: data });
    renderPaper(next);
    record();
    showSaving();
  }

  // ----- outline -----
  const CV_PARTS = [
    ['name', 'Name and contact', () => true],
    ['summary', 'Profile', (c) => c.summary || true],
    ['experience', 'Experience', (c) => c.experience.length],
    ['projects', 'Projects', (c) => c.projects.length],
    ['education', 'Education', (c) => c.education.length],
    ['skills', 'Skills', (c) => c.skills.length],
    ['certifications', 'Certifications', (c) => c.certifications.length],
    ['languages', 'Languages', (c) => c.languages.length],
  ];
  const LETTER_PARTS = [
    ['name', 'Letterhead'],
    ['letter.date', 'Place and date'],
    ['letter.to', 'Recipient'],
    ['letter.subject', 'Subject'],
    ['letter.body', 'Letter'],
  ];
  function drawOutline() {
    if (!hasDoc()) return outline.replaceChildren();
    const item = (path, label, sub = '') => {
      const b = h('button', { type: 'button', class: 'ol-item' }, h('span', {}, label), sub ? h('small', {}, sub) : '');
      b.addEventListener('click', () => {
        const el = [...paperScale.querySelectorAll('[data-path]')].find((x) => x.dataset.path === path || x.dataset.path.startsWith(`${path}.`));
        if (el) focusPath(el.dataset.path);
      });
      return b;
    };
    const c = cv();
    const items =
      kind === 'cv'
        ? CV_PARTS.filter(([, , has]) => has(c)).flatMap(([key, label]) => {
            const title = c.titles?.[key] || label;
            if (key === 'experience') return [item(key, title), ...c.experience.map((e, i) => h('div', { class: 'ol-sub' }, item(`experience.${i}`, e.title || 'Job', e.company)))];
            return [item(key, title)];
          })
        : LETTER_PARTS.map(([p, l]) => item(p, l));
    outline.replaceChildren(h('p', { class: 'panel-label' }, 'Outline'), ...items);
  }

  // ----- design panel: templates and colours -----
  function drawDesign() {
    if (!hasDoc()) return design.replaceChildren(h('p', { class: 'panel-label' }, 'Design'), h('p', { class: 'small muted' }, 'Pick a template once your document is started.'));
    const t = getTemplate(tplId());
    const pick = (patch) => {
      if (kind === 'cv') saveMaster(patch);
      else saveLetter('template' in patch ? { template: patch.template, accent: '' } : { accent: patch.accent });
      refresh();
    };
    const gallery = h(
      'div',
      { class: 'tpl-gallery docs-gallery', role: 'group', 'aria-label': 'Template' },
      ...TEMPLATES.map((x) => {
        const b = h(
          'button',
          { type: 'button', class: 'tpl-card', 'aria-pressed': String(x.id === t.id), 'aria-label': `${x.name} template` },
          h('div', { class: 'tpl-thumb', 'aria-hidden': 'true' }, page(x.id, x.accent)),
          h('strong', {}, x.name),
          h('span', { class: `tpl-badge ${x.ats ? '' : 'warn'}` }, x.ats ? 'ATS friendly' : 'Less ATS friendly'),
        );
        b.addEventListener('click', () => pick({ template: x.id }));
        return b;
      }),
    );
    design.replaceChildren(
      h('p', { class: 'panel-label' }, 'Design'),
      t.accents
        ? h(
            'div',
            { class: 'swatches', role: 'group', 'aria-label': 'Colour' },
            h('span', { class: 'muted small' }, 'Colour'),
            ...t.accents.map((c) => {
              const sw = h('button', { type: 'button', class: 'swatch', style: `background:${c}`, 'aria-label': `Colour ${c}`, 'aria-pressed': String(accent() === c) });
              sw.addEventListener('click', () => pick({ accent: c }));
              return sw;
            }),
          )
        : '',
      h('p', { class: 'tpl-info' }, h('strong', {}, `${t.name}. `), t.blurb),
      kind === 'letter' && letterOf().template
        ? (() => {
            const same = h('button', { type: 'button', class: 'btn small' }, 'Match my CV template');
            same.addEventListener('click', () => {
              saveLetter({ template: '', accent: '' });
              refresh();
            });
            return same;
          })()
        : '',
      gallery,
    );
  }

  // ----- ribbon content -----
  function menu(label, icon, items, cls = '') {
    const d = h('details', { class: `tb-menu ${cls}` });
    const list = h('div', { class: 'menu', role: 'menu' });
    for (const it of items) {
      if (it === '-') {
        list.append(h('hr'));
        continue;
      }
      if (it.node) {
        list.append(it.node);
        continue;
      }
      const b = h('button', { type: 'button', role: 'menuitem', disabled: it.disabled || null }, it.icon ? svgIcon(it.icon) : '', h('span', {}, it.label), it.hint ? h('small', {}, it.hint) : '');
      b.addEventListener('click', () => {
        d.open = false;
        it.run();
      });
      list.append(b);
    }
    d.append(h('summary', { class: 'rb-btn' }, svgIcon(icon), h('span', {}, label), h('span', { class: 'caret', 'aria-hidden': 'true' }, '▾')), list);
    d.addEventListener('toggle', () => {
      if (!d.open) return;
      for (const o of appEl.querySelectorAll('details.tb-menu[open]')) if (o !== d) o.open = false;
      // Fetch every font now so each name shows in its own face.
      for (const f of FONT_CHOICES) if (f.css) document.fonts?.load(`16px ${f.css}`).catch(() => {});
      floatMenu(d, list);
    });
    return d;
  }

  // The toolbar scrolls sideways on phones, which would cut a drop-down off:
  // menus are placed on the page itself, under their button and on screen.
  function floatMenu(d, list, alignRight = false) {
    const r = d.firstChild.getBoundingClientRect();
    const w = list.offsetWidth;
    const left = alignRight ? r.right - w : r.left;
    list.style.left = `${Math.max(8, Math.min(left, innerWidth - w - 8))}px`;
    list.style.top = `${r.bottom + 6}px`;
  }

  // Run a Vora AI job on the document behind the writing screen.
  async function withAI(spec, fn) {
    if (!ai.hasKey()) return toast('Set up the AI in Settings to use Vora AI.');
    record();
    const screen = writingScreen(spec.kind, { title: spec.title, doc: kind });
    const signal = newAbort();
    try {
      await fn(signal);
      if (signal.aborted) return;
      refresh();
      record();
      showSaved();
      await screen.done();
    } catch (err) {
      screen.close();
      if (!signal.aborted) toast(err.message || 'Vora could not finish that. Try again.');
    }
  }
  function insertMenu() {
    const add = (key) => () => act('add', key);
    return menu('Insert', ICON_PLUS, [
      { label: 'Job', run: add('experience') },
      { label: 'Education', run: add('education') },
      { label: 'Project', run: add('projects') },
      { label: 'Skill group', run: add('skills') },
      '-',
      {
        label: 'Profile summary',
        disabled: Boolean(cv()?.summary),
        run: () => {
          record();
          const data = structuredClone(cv());
          data.summary = data.summary || ' ';
          saveMaster({ cvData: data });
          renderPaper('summary');
          record();
        },
      },
    ]);
  }

  function drawRibbon() {
    const t = getTemplate(tplId());
    designBtn.lastChild.textContent = hasDoc() ? t.name : 'Design';
    designBtn.setAttribute('aria-pressed', String(designOpen));
    outlineBtn.setAttribute('aria-pressed', String(outlineOpen));
    const swatches = hasDoc() && t.accents
      ? h(
          'div',
          { class: 'rb-swatches', role: 'group', 'aria-label': 'Colour' },
          ...t.accents.slice(0, 5).map((c) => {
            const sw = h('button', { type: 'button', class: 'swatch sm', style: `background:${c}`, 'aria-label': `Colour ${c}`, 'aria-pressed': String(accent() === c) });
            sw.addEventListener('click', () => {
              if (kind === 'cv') saveMaster({ accent: c });
              else saveLetter({ accent: c });
              refresh();
            });
            return sw;
          }),
        )
      : '';
    if (!hasDoc()) return ribbon.replaceChildren(h('span', { class: 'rb-hint', style: 'margin-left:0;padding-left:4px' }, kind === 'cv' ? 'Start your CV to see the editing tools.' : 'Start your letter to see the editing tools.'));
    const checkBtn = h('button', { type: 'button', class: 'rb-btn', 'aria-pressed': String(checkOpen) }, svgIcon('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>'), h('span', {}, 'Check'));
    checkBtn.addEventListener('click', () => openPanel(checkOpen ? '' : 'check'));
    ribbon.replaceChildren(
      h('div', { class: 'rb-group' }, outlineBtn),
      h('div', { class: 'rb-group' }, h('span', { class: 'rb-label' }, 'Design'), designBtn, fontMenu(), swatches),
      kind === 'cv' ? h('div', { class: 'rb-group' }, insertMenu()) : '',
      h('div', { class: 'rb-group' }, checkBtn),
      h('div', { class: 'rb-group rb-end' }, chatButton()),
    );
  }

  function drawTop() {
    docSwitch.replaceChildren(
      ...[
        ['cv', 'CV', ICON_DOC],
        ['letter', 'Cover letter', ICON_MAIL],
      ].map(([k, label, icon]) => {
        const b = h('button', { type: 'button', role: 'tab', class: 'seg-btn', 'aria-selected': String(kind === k), 'aria-pressed': String(kind === k) }, svgIcon(icon), h('span', { class: 'sw-long' }, label), h('span', { class: 'sw-short', 'aria-hidden': 'true' }, k === 'cv' ? 'CV' : 'Letter'));
        b.addEventListener('click', () => {
          if (kind === k) return;
          record();
          kind = k;
          try {
            sessionStorage.setItem('ajh:doc', k);
          } catch {}
          currentPath = `/documents/${k}`;
          if (!inArtifact) {
            try {
              history.replaceState(null, '', `#${currentPath}`);
            } catch {}
          }
          refresh();
          record();
        });
        return b;
      }),
    );
    const name = store.get().profile.name.trim();
    docTitle.textContent = kind === 'cv' ? (name ? `${name} · CV` : 'My CV') : name ? `${name} · Cover letter` : 'My cover letter';
    pdfBtn.disabled = !hasDoc();
    undoBtn.disabled = !hasDoc();
    redoBtn.disabled = !hasDoc();
    paintHistory();
    // "More" menu
    const copyText = () => copy(kind === 'cv' ? cvToText(cv()) : letterOf().body || '');
    const txt = () => download(`${fileBase()}.txt`, kind === 'cv' ? cvToText(cv()) : letterOf().body || '');
    if (!moreMenu.dataset.float) {
      moreMenu.dataset.float = '1';
      moreMenu.addEventListener('toggle', () => moreMenu.open && floatMenu(moreMenu, moreMenu.querySelector('.menu'), true));
    }
    moreMenu.replaceChildren(
      h('summary', { class: 'icon-btn', 'aria-label': 'More', title: 'More' }, '⋯'),
      h(
        'div',
        { class: 'menu', role: 'menu' },
        ...[
          ['Copy as plain text', copyText],
          ['Download as text file', txt],
          kind === 'cv' && store.get().profile.cv.trim() ? ['Lay out again from my profile CV', () => withAI({ kind: 'layout' }, async (signal) => (async () => { const cvData = await ai.structureCV({ signal }); stopIfCancelled(signal); saveMaster({ cvData }); })())] : null,
          ['Start over (blank)', () => startBlank(true)],
        ]
          .filter(Boolean)
          .map(([label, fn]) => {
            const b = h('button', { type: 'button', role: 'menuitem', disabled: !hasDoc() && !/blank/.test(label) ? true : null }, label);
            b.addEventListener('click', () => {
              moreMenu.open = false;
              fn();
            });
            return b;
          }),
      ),
    );
  }
  function paintHistory() {
    const hs = hist[kind];
    undoBtn.disabled = !hasDoc() || hs.i <= 0;
    redoBtn.disabled = !hasDoc() || hs.i >= hs.stack.length - 1;
  }

  function drawStatus(scale) {
    if (!hasDoc()) return status.replaceChildren(h('span', {}, kind === 'cv' ? 'No CV yet' : 'No letter yet'));
    const text = kind === 'cv' ? cvToText(cv()) : letterOf().body || '';
    const words = (text.match(/\S+/g) || []).length;
    const pageEl = paperScale.firstElementChild;
    const pages = pageEl ? Math.max(1, Math.ceil((pageEl.offsetHeight - 4) / A4_HEIGHT)) : 1;
    const zoomPct = scale ? Math.round(scale * 100) : null;
    status.replaceChildren(
      h('span', {}, `${pages} ${pages === 1 ? 'page' : 'pages'}`),
      h('span', {}, `${words} words`),
      h('span', {}, `${getTemplate(tplId()).name} template`),
      h('span', { class: 'ats' }, getTemplate(tplId()).ats ? 'ATS friendly' : 'Less ATS friendly'),
      zoomPct ? h('span', { class: 'st-zoom' }, `${zoomPct}%`) : '',
    );
  }

  const fileBase = () => slug(`${store.get().profile.name || 'my'}-${kind === 'cv' ? 'cv' : 'cover-letter'}-${tplId()}`);
  async function downloadPDF() {
    if (!hasDoc()) return;
    const label = pdfBtn.lastChild.textContent;
    pdfBtn.disabled = true;
    pdfBtn.lastChild.textContent = 'Making PDF…';
    try {
      const font = fontId();
      const def = kind === 'cv' ? cvPDFDefinition(cv(), tplId(), accent(), { font }) : letterPDFDefinition(letterCV(), letterOf().body || '', tplId(), accent(), letterMeta(), { font });
      await download(`${fileBase()}.pdf`, await makePDF(def, { font }), 'application/pdf');
    } catch (err) {
      console.error(err);
      toast('Could not make the PDF. Check your connection and try again.');
    } finally {
      pdfBtn.disabled = false;
      pdfBtn.lastChild.textContent = label;
    }
  }

  // ----- starting a document -----
  function startBlank(confirmFirst = false) {
    if (confirmFirst && hasDoc() && !confirm(tr(kind === 'cv' ? 'Start a blank CV? Your current one is replaced (Undo brings it back).' : 'Start a blank letter? The current one is replaced (Undo brings it back).'))) return;
    record();
    const p = store.get().profile;
    if (kind === 'cv') {
      const data = cvFromProfile(p);
      data.summary = '';
      data.experience = [{ title: '', company: '', location: '', start: '', end: '', bullets: [''] }];
      data.education = [{ degree: '', school: '', location: '', start: '', end: '', details: '' }];
      saveMaster({ cvData: data });
      refresh('name');
    } else {
      const first = p.name.trim();
      saveLetter({ body: `Dear Hiring Manager,\n\n\n\nKind regards,\n${first}`, date: Date.now() });
      refresh('letter.body');
    }
    record();
  }

  function startCard() {
    const p = store.get().profile;
    const tailored = Object.entries(store.get().docs || {})
      .filter(([, d]) => d?.cvData)
      .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))[0];
    const btn = (label, cls, fn) => {
      const b = h('button', { type: 'button', class: `btn ${cls}` }, label);
      b.addEventListener('click', fn);
      return b;
    };
    const tone = h('select', { 'aria-label': 'Tone' }, ...['professional', 'warm and enthusiastic', 'concise and direct', 'formal'].map((t) => h('option', { value: t }, t)));
    const actions =
      kind === 'cv'
        ? [
            p.cv.trim() ? btn('Lay out my CV with Vora', 'primary', () => withAI({ kind: 'layout' }, async (signal) => (async () => { const cvData = await ai.structureCV({ signal }); stopIfCancelled(signal); saveMaster({ cvData }); })())) : h('a', { class: 'btn primary', href: '#/profile' }, 'Upload your CV first'),
            tailored ? btn(`Start from my CV for ${store.get().jobs[tailored[0]]?.company || 'a job'}`, '', () => (record(), saveMaster({ cvData: structuredClone(tailored[1].cvData), template: tailored[1].template, accent: tailored[1].accent }), refresh(), record())) : '',
            btn('Start from a blank page', 'ghost', () => startBlank()),
          ]
        : [
            h('div', { class: 'row wrap', style: 'justify-content:center' }, tone, btn('Write a general letter with Vora', 'primary', () => withAI({ kind: 'letter' }, async (signal) => (async () => { const body = await ai.writeGeneralLetter({ tone: tone.value, signal }); stopIfCancelled(signal); saveLetter({ body, date: Date.now() }); })()))),
            btn('Start from a blank page', 'ghost', () => startBlank()),
          ];
    return h(
      'section',
      { class: 'docs-start' },
      h('div', { class: 'docs-start-icon' }, svgIcon(kind === 'cv' ? ICON_DOC : ICON_MAIL)),
      h('h2', {}, kind === 'cv' ? 'Your CV, ready to edit like a Word page' : 'A cover letter you can send anywhere'),
      h(
        'p',
        { class: 'muted' },
        kind === 'cv'
          ? 'Vora lays out the CV from your profile in a professional template, word for word. Then click any text to change it, switch templates and colours, and download a PDF.'
          : 'A general letter for the roles you want, laid out as a proper business letter in the same template as your CV. Edit it on the page and download it as a PDF.',
      ),
      h('div', { class: 'docs-start-actions' }, ...actions.filter(Boolean)),
    );
  }

  function layout() {
    const wide = window.innerWidth >= 900;
    const on = (x) => x && hasDoc();
    appEl.classList.toggle('with-outline', outlineOpen && wide && hasDoc());
    appEl.classList.toggle('with-design', on(designOpen));
    appEl.classList.toggle('with-chat', on(chatOpen));
    appEl.classList.toggle('with-check', on(checkOpen));
    appEl.classList.toggle('sheet-open', !wide && on(designOpen || chatOpen || checkOpen));
    design.classList.toggle('open', on(designOpen));
    chat.classList.toggle('open', on(chatOpen));
    check.classList.toggle('open', on(checkOpen));
    outline.hidden = !(outlineOpen && wide && hasDoc());
    drawRibbon();
    requestAnimationFrame(fit);
  }

  function refresh(focus) {
    drawTop();
    renderPaper(focus);
    drawOutline();
    drawDesign();
    drawChat();
    if (checkOpen) drawCheck();
    layout();
  }

  // ----- fonts -----
  const setFont = (id) => {
    if (kind === 'cv') saveMaster({ font: id });
    else saveLetter({ font: id });
    refresh();
    showSaved();
  };
  function fontMenu() {
    const d = h('details', { class: 'tb-menu font-menu' });
    const current = fontChoice(fontId());
    const list = h('div', { class: 'menu font-list', role: 'menu' });
    let group = '';
    for (const f of FONT_CHOICES) {
      if ((f.kind || '') !== group) {
        group = f.kind || '';
        if (group) list.append(h('p', { class: 'menu-label' }, group === 'Sans' ? 'Sans serif' : 'Serif'));
      }
      const b = h(
        'button',
        { type: 'button', role: 'menuitemradio', 'aria-checked': String(f.id === current.id), class: 'font-item' },
        h('span', { class: 'font-name', style: f.css ? `font-family:${f.css}` : '' }, f.name),
        h('small', {}, f.note),
      );
      b.addEventListener('click', () => {
        d.open = false;
        setFont(f.id);
      });
      list.append(b);
    }
    if (kind === 'letter' && typeof letterOf().font === 'string') {
      const same = h('button', { type: 'button', class: 'font-item' }, h('span', { class: 'font-name' }, 'Same as my CV'), h('small', {}, fontChoice(master().font).name));
      same.addEventListener('click', () => {
        d.open = false;
        saveLetter({ font: undefined });
        refresh();
      });
      list.append(h('hr'), same);
    }
    d.append(
      h('summary', { class: 'rb-btn rb-font', title: 'Font' }, h('span', { class: 'rb-font-aa', 'aria-hidden': 'true', style: current.css ? `font-family:${current.css}` : '' }, 'Aa'), h('span', { class: 'rb-font-name' }, current.id ? current.name : 'Template font'), h('span', { class: 'caret', 'aria-hidden': 'true' }, '▾')),
      list,
    );
    d.addEventListener('toggle', () => {
      if (!d.open) return;
      for (const o of appEl.querySelectorAll('details.tb-menu[open]')) if (o !== d) o.open = false;
      // Fetch every font now so each name shows in its own face.
      for (const f of FONT_CHOICES) if (f.css) document.fonts?.load(`16px ${f.css}`).catch(() => {});
      floatMenu(d, list);
    });
    return d;
  }

  // ----- check: what a recruiter would notice -----
  function checks() {
    const out = [];
    const add = (ok, title, detail, fix) => out.push({ ok, title, detail, fix });
    const tpl = getTemplate(tplId());
    const pageEl = paperScale.firstElementChild;
    const pages = pageEl ? Math.max(1, Math.ceil((pageEl.offsetHeight - 4) / A4_HEIGHT)) : 1;
    if (kind === 'cv') {
      const c = cv();
      const words = (cvToText(c).match(/\S+/g) || []).length;
      add(Boolean(c.contact.email && c.contact.phone), 'Contact details', c.contact.email && c.contact.phone ? 'Email and phone are on the CV.' : 'Add your email and phone so recruiters can reach you.');
      add(c.summary.trim().length >= 120, 'Profile summary', c.summary.trim().length >= 120 ? 'A short profile opens the CV.' : 'Two or three sentences at the top help recruiters see your fit in seconds.', c.summary.trim().length >= 120 ? '' : 'Write a 2-3 sentence profile summary from my experience.');
      const thin = c.experience.filter((e) => e.bullets.filter((b) => b.trim()).length < 2);
      add(c.experience.length > 0 && !thin.length, 'Experience bullets', !c.experience.length ? 'Add your work experience.' : thin.length ? `${thin.length} ${thin.length === 1 ? 'job has' : 'jobs have'} fewer than two bullet points.` : 'Every job shows what you did.', thin.length ? 'Add one or two concrete bullet points to the jobs that have fewer than two, using only what the CV already says.' : '');
      const long = c.experience.flatMap((e) => e.bullets).filter((b) => b.length > 220).length;
      add(!long, 'Bullet length', long ? `${long} bullet ${long === 1 ? 'point is' : 'points are'} very long. Short lines are read; long ones are skipped.` : 'Bullet points are short enough to scan.', long ? 'Shorten bullet points longer than two lines, keeping the facts.' : '');
      const undated = c.experience.filter((e) => !e.start && !e.end).length;
      add(!undated, 'Dates', undated ? `${undated} ${undated === 1 ? 'job has' : 'jobs have'} no dates.` : 'Every job has dates.');
      add(pages <= 2, 'Length', `${pages} ${pages === 1 ? 'page' : 'pages'}, ${words} words.${pages > 2 ? ' Two pages is the usual maximum.' : ''}`, pages > 2 ? 'Shorten it to fit on two pages, trimming older roles first.' : '');
      const { phrases, dashes } = styleIssues(cvProse(c));
      add(!phrases.length && !dashes, 'Natural wording', phrases.length || dashes ? `Sounds generated in places${phrases.length ? `: ${phrases.slice(0, 3).map((x) => `"${x}"`).join(', ')}` : ''}.` : 'No stock phrases found.', phrases.length || dashes ? `Rewrite only the lines with these phrases in plain, specific words: ${[...phrases, ...(dashes ? ['dashes used as punctuation'] : [])].join(', ')}.` : '');
    } else {
      const body = letterOf().body || '';
      const words = (body.match(/\S+/g) || []).length;
      add(words >= 180 && words <= 400, 'Length', `${words} words.${words < 180 ? ' A little short: 220 to 350 words reads best.' : words > 400 ? ' A little long: 220 to 350 words reads best.' : ' A good length.'}`, words > 400 ? 'Make it about 300 words without losing the main points.' : words < 180 ? 'Make it about 250 words by adding one concrete example from my CV.' : '');
      add(Boolean((letterOf().to || '').trim()), 'Recipient', letterOf().to ? 'The letter is addressed.' : 'Add the company (and a name if you know it) above the subject.');
      add(Boolean((letterOf().subject || '').trim()), 'Subject line', letterOf().subject ? 'The subject names the role.' : 'Add a subject line with the job title.');
      const name = store.get().profile.name.trim().split(' ')[0];
      add(!name || body.toLowerCase().includes(name.toLowerCase()), 'Sign-off', 'Ends with your name.');
      const { phrases, dashes } = styleIssues(body);
      add(!phrases.length && !dashes, 'Natural wording', phrases.length || dashes ? `Sounds generated in places${phrases.length ? `: ${phrases.slice(0, 3).map((x) => `"${x}"`).join(', ')}` : ''}.` : 'No stock phrases found.', phrases.length || dashes ? `Rewrite only the sentences with these phrases in plain, specific words: ${[...phrases, ...(dashes ? ['dashes used as punctuation'] : [])].join(', ')}.` : '');
      add(pages <= 1, 'One page', pages <= 1 ? 'Fits on one page.' : 'Letters should fit on one page.', pages > 1 ? 'Shorten it so it fits on one page.' : '');
    }
    add(tpl.ats, 'Readable by applicant tracking systems', tpl.ats ? `${tpl.name} is read well by ATS software.` : `${tpl.name} uses two columns, which some ATS software reads poorly.`);
    return out;
  }
  function drawCheck() {
    if (!hasDoc()) return check.replaceChildren();
    const list = checks();
    const score = Math.round((list.filter((x) => x.ok).length / list.length) * 100);
    const level = score >= 85 ? 'high' : score >= 60 ? 'mid' : 'low';
    const close = h('button', { type: 'button', class: 'icon-btn chat-close', 'aria-label': 'Close', title: 'Close' }, '×');
    close.addEventListener('click', () => openPanel(''));
    check.replaceChildren(
      h('div', { class: 'chat-grab', 'aria-hidden': 'true' }),
      h('header', { class: 'chat-head' }, h('span', { class: 'chat-avatar check-avatar', 'aria-hidden': 'true' }, svgIcon('<svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>')), h('div', {}, h('strong', {}, 'Document check'), h('span', {}, 'What a recruiter notices first')), close),
      h(
        'div',
        { class: 'check-body' },
        h('div', { class: 'check-score' }, h('div', { class: `ring ring-${level}`, style: `--p:${score}`, role: 'img', 'aria-label': `${score}%` }, h('strong', {}, `${score}%`)), h('div', {}, h('strong', {}, score >= 85 ? 'Ready to send' : score >= 60 ? 'Almost there' : 'Needs some work'), h('p', { class: 'small muted' }, `${list.filter((x) => x.ok).length} of ${list.length} checks passed`))),
        h(
          'ul',
          { class: 'check-list' },
          ...list.map((x) => {
            const fix = x.fix
              ? (() => {
                  const b = h('button', { type: 'button', class: 'chat-undo check-fix' }, svgIcon(ICON_SPARK), 'Fix with Vora');
                  b.addEventListener('click', () => {
                    openPanel('chat');
                    send(x.fix);
                  });
                  return b;
                })()
              : '';
            return h('li', { class: x.ok ? 'ok' : 'warn' }, h('span', { class: 'check-dot', 'aria-hidden': 'true' }), h('div', {}, h('strong', {}, x.title), h('p', {}, x.detail), fix));
          }),
        ),
      ),
    );
  }

  // ----- Vora AI chat: change the CV or the letter by asking -----
  const chatLog = () => master().chat?.[kind] || [];
  const saveChat = (list, k = kind) => saveMaster({ chat: { ...(master().chat || {}), [k]: list.slice(-40) } });
  let chatBusy = false;
  const chatInput = h('textarea', { rows: 1, class: 'chat-input', placeholder: '' });
  const sendBtn = h('button', { type: 'button', class: 'chat-send', 'aria-label': 'Send' }, svgIcon('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>'));
  const chatList = h('div', { class: 'chat-list', role: 'log', 'aria-live': 'polite', translate: 'no' });
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = `${Math.min(chatInput.scrollHeight, 140)}px`;
  });
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  sendBtn.addEventListener('click', () => send());

  function chatButton() {
    const b = h('button', { type: 'button', class: 'rb-btn tb-ai rb-pill', 'aria-pressed': String(chatOpen), 'aria-expanded': String(chatOpen) }, svgIcon(ICON_SPARK), h('span', {}, 'Ask Vora AI'));
    b.addEventListener('click', () => toggleChat(!chatOpen));
    return b;
  }
  function toggleChat(on) {
    openPanel(on ? 'chat' : '');
  }

  const SUGGEST = {
    cv: ['Improve the wording', 'Make it fit on one page', 'Fix spelling and grammar', 'Write a profile summary from my experience'],
    letter: ['Make it shorter', 'More formal', 'Warmer and more personal', 'Fix spelling and grammar'],
  };
  function drawChat() {
    if (!hasDoc()) return chat.replaceChildren();
    const first = store.get().profile.name.trim().split(' ')[0];
    const label = kind === 'cv' ? 'CV' : 'cover letter';
    chatInput.placeholder = kind === 'cv' ? 'Ask Vora to change your CV…' : 'Ask Vora to change your letter…';
    const log = chatLog();
    const bubbles = log.map((m, i) => {
      const own = m.role === 'user';
      const undo =
        !own && m.changed && i === log.length - 1 && hist[kind].i > 0
          ? (() => {
              const u = h('button', { type: 'button', class: 'chat-undo' }, svgIcon(ICON_UNDO), 'Undo this change');
              u.addEventListener('click', () => {
                travel(-1);
                saveChat(chatLog().map((x, j) => (j === chatLog().length - 1 ? { ...x, changed: false, undone: true } : x)));
                drawChat();
              });
              return u;
            })()
          : '';
      return h(
        'div',
        { class: `chat-msg ${own ? 'own' : 'vora'}${m.error ? ' error' : ''}` },
        own ? '' : h('span', { class: 'chat-avatar', 'aria-hidden': 'true' }, svgIcon(ICON_SPARK)),
        h('div', { class: 'chat-bubble' }, h('p', {}, m.text), m.undone ? h('small', { class: 'muted' }, 'Undone') : '', undo),
      );
    });
    const empty = !log.length
      ? h(
          'div',
          { class: 'chat-empty' },
          h('div', { class: 'chat-empty-icon' }, svgIcon(ICON_SPARK)),
          h('p', { class: 'chat-hello' }, first ? `Hi ${first}, what should I change in your ${label}?` : `What should I change in your ${label}?`),
          h('p', { class: 'small muted' }, 'Tell me in your own words. I change the page for you, and you can undo any change.'),
        )
      : '';
    const chips = h(
      'div',
      { class: 'chat-chips' },
      ...SUGGEST[kind].map((t) => {
        const c = h('button', { type: 'button', class: 'chat-chip' }, t);
        c.addEventListener('click', () => send(tr(t)));
        return c;
      }),
    );
    const typing = chatBusy ? h('div', { class: 'chat-msg vora' }, h('span', { class: 'chat-avatar', 'aria-hidden': 'true' }, svgIcon(ICON_SPARK)), h('div', { class: 'chat-bubble typing', 'aria-label': 'Vora is editing' }, h('span'), h('span'), h('span'))) : '';
    chatList.replaceChildren(empty, ...bubbles, typing);
    const close = h('button', { type: 'button', class: 'icon-btn chat-close', 'aria-label': 'Close chat', title: 'Close' }, '×');
    close.addEventListener('click', () => toggleChat(false));
    sendBtn.disabled = chatBusy;
    chat.replaceChildren(
      h('div', { class: 'chat-grab', 'aria-hidden': 'true' }),
      h('header', { class: 'chat-head' }, h('span', { class: 'chat-avatar lg', 'aria-hidden': 'true' }, svgIcon(ICON_SPARK)), h('div', {}, h('strong', {}, 'Vora AI'), h('span', {}, kind === 'cv' ? 'Edits your CV' : 'Edits your cover letter')), close),
      chatList,
      h('div', { class: 'chat-compose' }, log.length < 2 && !chatBusy ? chips : '', h('div', { class: 'chat-box' }, chatInput, sendBtn), h('p', { class: 'chat-note' }, `Vora only changes this ${label}.`)),
    );
    requestAnimationFrame(() => (chatList.scrollTop = chatList.scrollHeight));
  }

  async function send(text) {
    const message = String(text ?? chatInput.value).trim();
    if (!message || chatBusy) return;
    if (!ai.hasKey()) return toast('Set up the AI in Settings to use Vora AI.');
    chatInput.value = '';
    chatInput.style.height = 'auto';
    const docKind = kind;
    const history = chatLog();
    saveChat([...history, { role: 'user', text: message, at: Date.now() }]);
    chatBusy = true;
    drawChat();
    appEl.classList.add('ai-editing');
    const signal = newAbort();
    try {
      const current = docKind === 'cv' ? cv() : { body: letterOf().body || '', subject: letterOf().subject || '', to: letterOf().to || '' };
      const res = await ai.chatEdit(docKind, current, history, message, { signal });
      stopIfCancelled(signal);
      if (res.changed) {
        record();
        if (docKind === 'cv') saveMaster({ cvData: res.doc });
        else saveLetter({ body: res.doc.body, subject: res.doc.subject, to: res.doc.to });
        record();
        if (kind === docKind) {
          renderPaper();
          drawOutline();
        }
        showSaved();
        paperScale.classList.remove('flash');
        void paperScale.offsetWidth;
        paperScale.classList.add('flash');
      }
      const log = master().chat?.[docKind] || [];
      saveChat([...log, { role: 'vora', text: res.reply || (res.changed ? 'Done.' : 'I can only edit this document.'), changed: res.changed, at: Date.now() }], docKind);
    } catch (err) {
      const log = master().chat?.[docKind] || [];
      if (!signal.aborted) saveChat([...log, { role: 'vora', text: err.message || 'Vora could not finish that. Try again.', error: true, at: Date.now() }], docKind);
    } finally {
      chatBusy = false;
      appEl.classList.remove('ai-editing');
      drawChat();
      paintHistory();
    }
  }

  // Close menus when clicking elsewhere; leave cleanly when the page changes.
  const onDocClick = (e) => {
    if (!appEl.isConnected) return document.removeEventListener('click', onDocClick);
    for (const d of appEl.querySelectorAll('details.tb-menu[open]')) if (!d.contains(e.target)) d.open = false;
  };
  document.addEventListener('click', onDocClick);
  const gone = new MutationObserver(() => {
    if (!appEl.isConnected) {
      gone.disconnect();
      ro.disconnect();
    }
  });
  gone.observe(view, { childList: true });

  view.append(appEl);
  refresh();
  record();
  showSaved();
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
  // Documents for a job use the font picked in Documents.
  const jobFont = () => store.get().master?.font || '';
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
      const screen = writingScreen('edit', { title: message, doc: cfg.title === 'Your cover letter' ? 'letter' : 'cv' });
      try {
        await fn();
        refresh();
        await screen.done();
      } catch (err) {
        screen.close();
        throw err;
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
      await download(filename, await makePDF(definition, { font: jobFont() }), 'application/pdf');
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
        status.replaceChildren();
        const screen = writingScreen('tailor');
        let cvData;
        try {
          cvData = await ai.tailorCV(job, { signal });
          stopIfCancelled(signal);
        } catch (err) {
          screen.close();
          throw err;
        }
        saveDoc({ cvData, cv: cvToText(cvData) });
        await screen.done();
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
        const thumb = h('button', { type: 'button', class: 'cv-ready-thumb', 'aria-label': 'Open your CV' }, h('div', { class: 'tpl-thumb' }, renderCV(d.cvData, t.id, accent(), { font: jobFont() })));
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
      await savePDF(cvPDFDefinition(docs().cvData, template(), accent(), { font: jobFont() }), `${fileBase()}-cv-${template()}.pdf`, btn);
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
        page: (id, color, opts) => renderCV(docs().cvData, id, color, { font: jobFont(), ...opts }),
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
              stopIfCancelled(signal);
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
    const page = (id, color, opts) => renderLetter(letterCV(), docs().coverLetter || '', id, color, meta(), { font: jobFont(), ...opts });
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
        status.replaceChildren();
        const screen = writingScreen('letter');
        let text;
        try {
          text = await ai.writeCoverLetter(job, { tone: tone.value, signal });
          stopIfCancelled(signal);
        } catch (err) {
          screen.close();
          throw err;
        }
        await screen.done();
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
      await savePDF(letterPDFDefinition(letterCV(), docs().coverLetter, letterTpl(), letterAccent(), meta(), { font: jobFont() }), `${fileBase()}-cover-letter-${letterTpl()}.pdf`, btn);
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
                  const text = await ai.writeCoverLetter(job, { tone: tone.value, instructions, previous: docs().coverLetter, signal });
                  stopIfCancelled(signal);
                  saveDoc({ coverLetter: text });
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
                  const text = await ai.reviseLetter(job, docs().coverLetter, phrases, { signal });
                  stopIfCancelled(signal);
                  saveDoc({ coverLetter: text });
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
  const poweredBy = h('span', { class: 'tag powered-by', translate: 'no' }, `Powered by ${ai.aiName()}`);
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
          ? h('p', { class: 'notice' }, 'AI features run on your Claude account here, so no API key is needed. The key and model settings below apply when you run the app outside the Claude app.')
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
    setBrand('Vora');
    poweredBy.textContent = `Powered by ${ai.aiName()}`;
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
    h('div', { class: 'row space wrap' }, h('h2', { style: 'margin:0' }, 'Vora AI'), poweredBy),
    h('p', { class: 'muted', style: 'margin:0' }, 'Vora is the AI that searches, matches, writes and coaches for you. Choose which model powers it. Every task runs with the same senior HR recruiter instructions.'),
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
setBrand('Vora'); // the AI is called Vora, whichever provider powers it
route();
hideSplash();

// The opening animation (inline in the page) leaves once the first screen is
// drawn, the fonts are in and it has played for at least a moment.
function hideSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const minShown = reduce ? 0 : 1600;
  const fonts = Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]);
  fonts.then(() =>
    setTimeout(() => {
      splash.classList.add('done');
      splash.setAttribute('aria-hidden', 'true');
      document.documentElement.classList.add('app-in');
      setTimeout(() => splash.remove(), 700);
    }, Math.max(0, minShown - performance.now())),
  );
}
// In the artifact viewer, capabilities arrive a moment after load: redraw
// once they do so AI and web search light up.
if (inArtifact) runtimeReady.then((c) => (c.sample || c.mcp) && route());
