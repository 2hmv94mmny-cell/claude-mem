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
import { jobsForYou, moreJobsForYou, aboutFromPosting, resolveCompany, norm, indeedJobs, readProfile, scoreJob, sameJob, jobPostedAt, byBestMatch, checkPages, isStale, knownClosed } from './match.js';
import { LANGUAGES, setLanguage, currentLanguage, setBrand, locale, t as tr } from './i18n.js';
import { attachSuggest, rememberSearch, recentSearches } from './suggest.js';
import { PROVIDERS, providerById } from './providers.js';
import { readCVFile, ACCEPT } from './files.js';
import { cvToText, cvFromProfile } from './cvdoc.js';
import { TEMPLATES, FONT_CHOICES, LAYOUT_OPTIONS, applyLayout, fontChoice, getTemplate, accentFor, renderCV, renderLetter, cvPDFDefinition, letterPDFDefinition, makePDF } from './templates.js';

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
    // The best match gets the spotlight; the rest follow as a list.
    const [top, ...rest] = list.slice(0, feedShown);
    grid.replaceChildren(...(top && !feedFilter ? [spotlightCard(top), ...rest.map(feedCard)] : list.slice(0, feedShown).map(feedCard)));
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

/** The best match today: a bigger card with the reason and the next steps. */
function spotlightCard(job) {
  const href = `#/job/${encodeURIComponent(job.id)}`;
  const pct = job.match ? Math.max(0, Math.min(100, Number(job.match.score) || 0)) : 0;
  const level = pct >= 75 ? 'high' : pct >= 50 ? 'mid' : 'low';
  const open = (tab) => () => {
    try {
      sessionStorage.setItem('ajh:tab', tab);
    } catch {}
    go(`/job/${encodeURIComponent(job.id)}`);
  };
  const tailor = h('button', { type: 'button', class: 'btn primary' }, svgIcon(ICON_SPARK), 'Tailor my CV');
  tailor.addEventListener('click', open('docs'));
  const view = h('a', { class: 'btn', href }, 'View job');
  return h(
    'article',
    { class: 'spotlight' },
    h('div', { class: 'sp-badge' }, '★ Best match today'),
    h(
      'div',
      { class: 'sp-main' },
      companyAvatar(job.company || job.source, 'lg'),
      h('div', { class: 'sp-text' }, h('h3', {}, h('a', { href }, job.title)), h('p', { class: 'sp-company' }, [job.company, job.location].filter(Boolean).join(' · ')), h('div', { class: 'jd-pills' }, job.salary ? h('span', { class: 'money' }, job.salary) : '', postedLabel(job) ? h('span', {}, postedLabel(job)) : '', h('span', {}, `via ${job.source}`))),
      job.match ? h('div', { class: `ring ring-${level} sp-ring`, style: `--p:${pct}`, role: 'img', 'aria-label': `${pct}% match` }, h('strong', {}, `${pct}%`)) : '',
    ),
    job.match?.reason ? h('p', { class: 'sp-reason', translate: 'no' }, job.match.reason) : '',
    h('div', { class: 'sp-actions' }, tailor, view, bookmarkButton(job)),
  );
}

/** Numbers that count up when they appear. */
function countIn(root) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const el of root.querySelectorAll('[data-count]')) {
    const to = Number(el.dataset.count) || 0;
    if (!to) continue;
    const t0 = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / 900);
      el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1 && el.isConnected) requestAnimationFrame(tick);
    };
    el.textContent = '0';
    requestAnimationFrame(tick);
  }
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
      job.match?.reason ? h('p', { class: 'pick-reason', translate: 'no' }, job.match.reason) : '',
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
  for (const m of document.querySelectorAll('body > .drop-menu')) m.remove(); // a filter sheet left open
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
  // Quick searches: your roles, remote, and what you searched before.
  const roleChips = profile.targetRoles.split(',').map((r) => r.trim()).filter(Boolean).slice(0, 3);
  const quick = h(
    'div',
    { class: 'hero-quick' },
    ...roleChips.map((r) => {
      const b = h('button', { type: 'button', class: 'hq-chip' }, r);
      b.addEventListener('click', () => runSearch({ query: r, location: profile.location }));
      return b;
    }),
    roleChips.length
      ? (() => {
          const b = h('button', { type: 'button', class: 'hq-chip' }, svgIcon(ICON_HOME_WORK), 'Remote');
          b.addEventListener('click', () => runSearch({ query: roleChips[0], location: 'remote' }));
          return b;
        })()
      : '',
  );
  // Today at a glance: four numbers that count up.
  const active = count('applied') + count('interview') + count('offer');
  const stat = (n, label, href, icon, cls = '') => h('a', { class: `hs-tile ${cls}`, href }, h('span', { class: 'hs-icon', 'aria-hidden': 'true' }, svgIcon(icon)), h('strong', { 'data-count': String(n) }, String(n)), h('span', {}, label));
  const stats = h(
    'section',
    { class: 'home-stats', 'aria-label': 'Today' },
    stat(feedNew || 0, 'matches for you', '#/find', ICON_SPARK, 'hs-accent'),
    stat(count('saved'), 'saved jobs', '#/tracker', ICON_BOOKMARK),
    stat(active, 'applications', '#/tracker', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l5 5L20 6"/></svg>'),
    stat(count('interview'), count('interview') === 1 ? 'interview' : 'interviews', '#/tracker', '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>'),
  );
  const page = h(
    'div',
    { class: 'home2' },
    h(
      'section',
      { class: 'home-hero hero2' },
      h('div', { class: 'hero2-bg', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
      h('p', { class: 'eyebrow' }, new Date().toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })),
      h('h1', {}, first ? `${greeting()}, ${first}` : 'Find your next job'),
      h('p', { class: 'hero2-sub' }, first && feedNew ? `${feedNew} ${feedNew === 1 ? 'job matches' : 'jobs match'} your CV${profile.location ? ` near ${profile.location}` : ''}. Here is what is new today.` : 'One search covers the job portals near you. Vora ranks every role against your CV, then helps you tailor your application and practise the interview.'),
      form,
      quick,
      recentRow,
    ),
    first || all.length ? stats : '',
    upNext,
    h('div', { class: 'home-grid' }, h('div', {}, feedSection()), side),
  );
  view.append(page);
  countIn(stats);
}

// ---------------------------------------------------------------------------
// Find jobs
// ---------------------------------------------------------------------------

const ICON_HOME_WORK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/></svg>';

/** The match as a compact badge: a small ring and the percentage. */
function matchBadge(score) {
  if (!score) return '';
  const pct = Math.max(0, Math.min(100, Number(score.score) || 0));
  const level = pct >= 75 ? 'high' : pct >= 50 ? 'mid' : 'low';
  return h('span', { class: `match-badge mb-${level}`, title: score.reason || '', style: `--p:${pct}` }, h('span', { class: 'mb-ring', 'aria-hidden': 'true' }), h('span', {}, `${pct}%`), h('span', { class: 'sr-only' }, ' match'));
}

/** Skills from the profile that the posting mentions. */
function matchedSkills(job) {
  const p = store.get().profile;
  const hay = ` ${String(`${job.title} ${job.description || ''}`).toLowerCase()} `;
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return splitList(p.skills)
    .filter((x) => x.length > 1 && new RegExp(`(^|[^a-z0-9+#])${esc(x.toLowerCase())}($|[^a-z0-9+#])`).test(hay))
    .slice(0, 8);
}

/** A filter chip that opens a short list of choices (Date posted, Match …). */
function dropChip(label, options, value, onPick) {
  for (const stray of document.querySelectorAll('body > .drop-menu')) stray.remove();
  const current = options.find(([v]) => v === value);
  const active = Boolean(value) && current;
  const d = h('details', { class: 'drop-chip' });
  const list = h('div', { class: 'drop-menu', role: 'menu' });
  for (const [v, text] of options) {
    const b = h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(v === value) }, text);
    b.addEventListener('click', () => {
      shut();
      onPick(v);
    });
    list.append(b);
  }
  // Close right away and put the sheet back, before the filters redraw: some browsers never
  // send "toggle" to a chip that was just replaced, which left the sheet covering the page.
  function shut() {
    d.open = false;
    document.removeEventListener('pointerdown', close);
    window.removeEventListener('scroll', onScroll);
    if (list.parentNode !== d) d.append(list);
  }
  d.append(h('summary', { class: 'chip', 'aria-pressed': String(Boolean(active)) }, active ? current[1].replace(/\s*\(\d+\)$/, '') : label, h('span', { class: 'caret', 'aria-hidden': 'true' }, '▾')), list);
  // On a phone the choices open as a sheet from the bottom; on a computer, under the chip.
  const sheet = () => window.innerWidth <= 700;
  const close = (e) => {
    if (!list.contains(e.target) && !d.firstChild.contains(e.target)) shut();
  };
  const onScroll = () => shut();
  d.addEventListener('toggle', () => {
    if (!d.open) {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', onScroll);
      if (list.parentNode !== d) d.append(list);
      return;
    }
    // Above the tab bar and sticky search: the sheet lives on the page itself while open.
    if (sheet()) document.body.append(list);
    list.addEventListener('keydown', (e) => e.key === 'Escape' && shut(), { once: true });
    for (const o of document.querySelectorAll('details.drop-chip[open]')) if (o !== d) o.open = false;
    if (!sheet()) {
      const r = d.firstChild.getBoundingClientRect();
      list.style.top = `${r.bottom + 6}px`;
      list.style.left = `${Math.max(8, Math.min(r.left, innerWidth - list.offsetWidth - 8))}px`;
      window.addEventListener('scroll', onScroll, { passive: true });
    }
    document.addEventListener('pointerdown', close);
  });
  list.prepend(h('p', { class: 'drop-title' }, label));
  return d;
}

function renderFind() {
  const { profile } = store.get();
  const defaults = session.query || {
    query: profile.targetRoles.split(',')[0]?.trim() || '',
    location: profile.location || '',
    remoteOnly: profile.remoteOnly,
    sources: [...SOURCE_IDS],
  };
  session.filter ??= '';
  // Filters and sort, like the big job sites: kept while you move around the app.
  session.f ??= { date: 0, match: 0, salary: false };
  session.sort ??= 'best';
  let remoteOnly = Boolean(defaults.remoteOnly);
  const wide = () => window.matchMedia('(min-width: 1024px)').matches;

  const results = h('div', { class: 'results', role: 'list' });
  const status = h('p', { class: 'find-status', role: 'status' });
  const filters = h('div', { class: 'chip-row find-filters', role: 'group', 'aria-label': 'Filters' });
  const resultsHead = h('div', { class: 'results-head' });
  const progress = h('div', { class: 'find-progress', role: 'progressbar', 'aria-label': 'Searching', hidden: true }, h('span'));
  const seen = new Set(); // cards already shown, so only new ones animate in
  const sortSel = h('select', { class: 'sort-select', 'aria-label': 'Sort by' }, h('option', { value: 'best' }, 'Best match'), h('option', { value: 'new' }, 'Newest'));
  sortSel.value = session.sort;
  sortSel.addEventListener('change', () => {
    session.sort = sortSel.value;
    drawResults();
  });
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
  const remoteChip = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(remoteOnly) }, svgIcon(ICON_HOME_WORK), 'Remote');
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
      h('h2', {}, countryName ? `Keep looking on job sites in ${countryName}` : 'Keep looking on other job sites'),
      h('p', { class: 'muted small', style: 'margin:0' }, countryName || !location ? 'Opens each site\'s own results for this search.' : `No site list for "${location}" yet. Add the country to see local sites.`),
      h('div', { class: 'portal-links' }, ...portals.map((x) => h('a', { class: 'portal-link', href: x.url, target: '_blank', rel: 'noopener noreferrer' }, companyAvatar(x.name, 'sm'), h('span', {}, x.name), h('span', { class: 'portal-go', 'aria-hidden': 'true' }, '↗')))),
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
    progress.hidden = false;
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
        ? `${n} more ${n === 1 ? "job" : "jobs"} for you near ${session.more} that are not on your home page, best match first`
      : session.errors.length && !n
        ? session.errors.join(' · ')
        : `${n} job${n === 1 ? '' : 's'}${sites > 1 ? ` from ${sites} sites` : ''}${all.some((j) => session.scores[j.id] || j.match) ? ', best match first' : n > 1 ? ', newest first' : ''}` +
          (session.errors.length ? ` · ${session.errors.join(' · ')}` : '');
    if (!session.searching) return void (status.textContent = text);
    if (!n) return void (status.textContent = session.searching);
    status.replaceChildren(h('span', {}, text), ' · ', h('span', { class: 'searching-more' }, 'Still searching, more jobs will appear…'));
  }

  const ageDays = (j) => (jobPostedAt(j) ? (Date.now() - jobPostedAt(j)) / 864e5 : Infinity);
  const scoreOf = (j) => session.scores[j.id]?.score ?? j.match?.score ?? 0;
  const filtersOn = () => Boolean(session.filter || session.f.date || session.f.match || session.f.salary);
  function drawFilters(counts, n) {
    const f = session.f;
    const set = (patch) => {
      Object.assign(f, patch);
      drawResults();
    };
    const dates = [[0, 'Any time'], [1, 'Past 24 hours'], [3, 'Past 3 days'], [7, 'Past week'], [30, 'Past month']];
    const matches = [[0, 'Any match'], [60, '60% or more'], [75, '75% or more'], [90, '90% or more']];
    const salaryChip = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(f.salary) }, 'Salary shown');
    salaryChip.addEventListener('click', () => set({ salary: !f.salary }));
    const reset = h('button', { type: 'button', class: 'chip-reset' }, 'Reset');
    reset.addEventListener('click', () => {
      session.filter = '';
      set({ date: 0, match: 0, salary: false });
    });
    filters.replaceChildren(
      remoteChip,
      dropChip('Date posted', dates, f.date, (v) => set({ date: v })),
      dropChip('Match', matches, f.match, (v) => set({ match: v })),
      counts.size > 1 && !session.examples ? dropChip('Job site', [['', `All sites (${n})`], ...[...counts].sort((a, b) => b[1] - a[1]).map(([k, c]) => [k, `${k} (${c})`])], session.filter, (v) => {
        session.filter = v;
        drawResults();
      }) : '',
      salaryChip,
      filtersOn() ? reset : '',
    );
  }

  function drawResults() {
    const all = session.results;
    const counts = new Map();
    for (const j of all) counts.set(j.source, (counts.get(j.source) || 0) + 1);
    if (session.filter && !counts.has(session.filter)) session.filter = '';
    const f = session.f;
    let shown = all.filter((j) => (!session.filter || j.source === session.filter) && (!f.date || ageDays(j) <= f.date) && (!f.match || scoreOf(j) >= f.match) && (!f.salary || j.salary));
    if (session.sort === 'new') {
      const newest = (a, b) => (jobPostedAt(b) || 0) - (jobPostedAt(a) || 0);
      shown = [...shown.filter((j) => !j.extra).sort(newest), ...shown.filter((j) => j.extra).sort(newest)];
    }
    const n = all.length;
    drawStatus();
    drawFilters(counts, n);
    progress.hidden = !session.searching;
    resultsHead.replaceChildren(
      h('div', { class: 'results-count' }, h('strong', {}, n ? (shown.length === n ? `${n} ${n === 1 ? 'job' : 'jobs'}` : `${shown.length} of ${n} jobs`) : 'Jobs'), status),
      n ? h('label', { class: 'sort-wrap' }, h('span', {}, 'Sort'), sortSel) : '',
    );

    if (!shown.length && session.searching) return; // keep the placeholder until the first jobs arrive
    if (!shown.length) {
      const clear = h('button', { type: 'button', class: 'btn small' }, 'Clear filters');
      clear.addEventListener('click', () => {
        session.filter = '';
        Object.assign(session.f, { date: 0, match: 0, salary: false });
        drawResults();
      });
      results.replaceChildren(h('div', { class: 'empty card results-empty' }, h('strong', {}, filtersOn() ? 'No jobs match these filters' : 'No jobs to show'), h('p', { class: 'muted' }, filtersOn() ? 'Try a wider date range or a lower match.' : 'Try broader keywords, or open one of the job sites below.'), filtersOn() ? clear : ''));
      detail.replaceChildren(h('div', { class: 'detail-empty' }, 'Pick a job to see the details here.'));
      detail.dataset.sig = '';
      return;
    }
    // Until the visitor picks a job, the side panel shows the top result.
    if (!session.picked || !shown.some((j) => j.id === session.selected)) session.selected = shown[0].id;
    // Search results first, then the extra CV matches under their own heading.
    const firstExtra = shown.findIndex((j) => j.extra);
    const cards = shown.map((j, i) => {
      const c = jobCard(j);
      if (!seen.has(j.id)) {
        seen.add(j.id);
        c.classList.add('jc-new');
        c.style.setProperty('--i', String(Math.min(i, 8)));
      }
      return c;
    });
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
    const score = session.scores[job.id];
    const fresh = ageDays(job) < 2;
    const card = h(
      'article',
      { class: `job-card jc ${job.id === session.selected && wide() ? 'selected' : ''}`, 'data-id': job.id, role: 'listitem' },
      companyAvatar(job.company || job.source),
      h(
        'div',
        { class: 'jc-main' },
        h('h3', {}, h('a', { href }, job.title)),
        h('p', { class: 'jc-company' }, [job.company, job.location].filter(Boolean).join(' · ')),
        h(
          'div',
          { class: 'jc-tags' },
          job.salary ? h('span', { class: 'jc-tag salary' }, job.salary) : '',
          job.remote && !/remote/i.test(job.location || '') ? h('span', { class: 'jc-tag' }, 'Remote') : '',
          fresh ? h('span', { class: 'jc-tag new' }, 'New') : '',
          score ? h('span', { class: 'jc-mb-inline' }, matchBadge(score)) : '',
        ),
        score?.reason ? h('p', { class: 'jc-reason', translate: 'no' }, score.reason) : h('p', { class: 'jc-reason muted' }, job.description || ''),
        h('p', { class: 'jc-foot' }, postedLabel(job) || '', postedLabel(job) ? h('span', { 'aria-hidden': 'true' }, ' · ') : '', h('span', {}, `via ${job.source}`)),
      ),
      h('div', { class: 'jc-side' }, matchBadge(score), bookmarkButton({ ...job, match: score || job.match })),
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
    const tailor = h('button', { class: 'btn', type: 'button' }, svgIcon(ICON_SPARK), 'Tailor my CV');
    tailor.addEventListener('click', open('docs'));
    const prep = h('button', { class: 'link-btn', type: 'button' }, 'Practise the interview');
    prep.addEventListener('click', open('prep'));
    const letter = h('button', { class: 'link-btn', type: 'button' }, 'Write a cover letter');
    letter.addEventListener('click', open('docs'));
    const skills = matchedSkills(job);
    const pct = score ? Math.max(0, Math.min(100, Number(score.score) || 0)) : 0;
    const level = pct >= 75 ? 'high' : pct >= 50 ? 'mid' : 'low';
    const facts = [
      ['Location', job.location],
      ['Work mode', job.remote || /remote/i.test(job.location || '') ? 'Remote' : /hybrid/i.test(job.description || '') ? 'Hybrid' : 'On site'],
      ['Salary', job.salary || 'Not listed'],
      ['Posted', postedLabel(job).replace(/^Posted /, '') || 'Unknown'],
      ['Found on', job.source],
    ].filter(([, v]) => v);
    detail.replaceChildren(
      h(
        'div',
        { class: 'detail-head' },
        h('div', { class: 'dh-id' }, companyAvatar(job.company || job.source, 'lg'), h('div', {}, h('p', { class: 'dh-company' }, job.company || job.source), h('h2', {}, job.title), h('p', { class: 'dh-meta' }, [job.location, postedLabel(job)].filter(Boolean).join(' · ')))),
        h(
          'div',
          { class: 'detail-actions' },
          job.url ? h('a', { class: 'btn primary', href: safeUrl(job.url), target: '_blank', rel: 'noopener noreferrer' }, `Apply on ${job.source}`, h('span', { 'aria-hidden': 'true' }, ' ↗')) : '',
          tailor,
          saveToggle(job, false),
        ),
      ),
      h(
        'div',
        { class: 'detail-body' },
        score
          ? h(
              'section',
              { class: 'dt-match' },
              h('div', { class: `ring ring-${level}`, style: `--p:${pct}`, role: 'img', 'aria-label': `${pct}% match` }, h('strong', {}, `${pct}%`)),
              h('div', {}, h('h3', {}, 'How you match'), score.reason ? h('p', { translate: 'no' }, score.reason) : h('p', {}, 'Ranked against your CV.'), skills.length ? h('div', { class: 'dt-skills' }, ...skills.map((x) => h('span', { class: 'dt-skill' }, x))) : ''),
            )
          : '',
        h('section', { class: 'dt-facts' }, h('h3', {}, 'Job details'), h('dl', {}, ...facts.map(([k, v]) => h('div', { class: 'dt-fact' }, h('dt', {}, k), h('dd', {}, v))))),
        h('section', { class: 'dt-about' }, h('h3', {}, 'About the role'), h('div', { class: 'description' }, ...String(job.description || 'No description provided. Open the posting for the full details.').split(/\n{2,}/).map((x) => h('p', {}, x.trim())))),
        h('section', { class: 'dt-next' }, h('h3', {}, 'Get ready with Vora'), h('div', { class: 'dt-links' }, letter, prep)),
      ),
    );
  }

  view.append(
    h('div', { class: 'find-top' }, bar.form, h('div', { class: 'find-tools' }, filters, h('span', { class: 'spacer' }), boardsBtn, scoreBtn), progress),
    !ai.hasKey() && !inArtifact ? h('div', { class: 'notice' }, 'Add an API key in ', h('a', { href: '#/settings' }, 'Settings'), ' to search every job site at once. Until then, use the free job boards or the site links below.') : '',
    aiStream,
    h('div', { class: 'split find-split' }, h('div', { class: 'find-list' }, resultsHead, results, portalBox), detail),
  );
  resultsHead.append(h('div', { class: 'results-count' }, status));
  drawPortals();
  filters.replaceChildren(remoteChip);
  // The search bar gets a soft shadow once the page scrolls under it.
  const top = view.querySelector('.find-top');
  const onScroll = () => {
    if (!top.isConnected) return window.removeEventListener('scroll', onScroll);
    top.classList.toggle('stuck', window.scrollY > 24);
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  if (session.autoSearch) {
    session.autoSearch = false;
    search();
  } else if (session.results.length) drawResults();
  else showMore();
}

function skeleton() {
  // Placeholders shaped like the result cards, so nothing jumps when jobs arrive.
  return h('div', { class: 'skeleton-list jc-skel-list' }, ...Array.from({ length: 4 }, (_, i) => h('div', { class: 'jc-skel', style: `--i:${i}` }, h('span', { class: 'sk sk-logo' }), h('span', { class: 'sk-lines' }, h('span', { class: 'sk sk-title' }), h('span', { class: 'sk sk-sub' }), h('span', { class: 'sk sk-line' }), h('span', { class: 'sk sk-line short' })))));
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
  const fams = ['Arimo', 'Carlito', 'Inter', 'Lato', 'Roboto', 'Montserrat', 'EB+Garamond', 'Lora', 'Open+Sans', 'Poppins', 'Raleway', 'Work+Sans', 'IBM+Plex+Sans', 'Nunito+Sans', 'PT+Sans', 'PT+Serif', 'Source+Serif+4', 'Libre+Baskerville', 'Crimson+Text', 'Playfair+Display'].map((f) => `${f}:400,400i,700,700i`).join('|');
  document.head.append(h('link', { id: 'vora-doc-fonts', rel: 'stylesheet', href: `https://fonts.googleapis.com/css?family=${fams}&subset=latin,latin-ext&display=swap` }));
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
      await download(`${base}.pdf`, await makePDF(applyLayout(def, (kind === 'cv' ? m.layout : L.layout || m.layout) || null), { font }), 'application/pdf');
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
  // Page layout (text size, spacing, margins): the letter follows the CV unless it has its own.
  const layoutOf = () => (kind === 'cv' ? master().layout : letterOf().layout || master().layout) || null;
  const page = (id, color, opts = {}) => (kind === 'cv' ? renderCV(cv(), id, color, { font: fontId(), layout: layoutOf(), ...opts }) : renderLetter(letterCV(), letterOf().body || '', id, color, letterMeta(), { font: fontId(), layout: layoutOf(), ...opts }));

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
  // One panel at a time: Design, Vora AI or Check (side panels on a computer,
  // bottom sheets on a phone), plus the Font and Insert sheets on a phone.
  let sheetOpen = '';
  function openPanel(name) {
    designOpen = name === 'design';
    chatOpen = name === 'chat';
    checkOpen = name === 'check';
    sheetOpen = name === 'font' || name === 'insert' ? name : '';
    if (chatOpen) drawChat();
    if (checkOpen) drawCheck();
    if (sheetOpen) drawSheet();
    layout();
    // On a phone the keyboard would cover the sheet: focus only on bigger screens.
    if (chatOpen && window.innerWidth > 900) requestAnimationFrame(() => chatInput.focus({ preventScroll: true }));
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
  const sheet = h('aside', { class: 'docs-sheet', 'aria-label': 'Options' });
  const scrim = h('div', { class: 'docs-scrim', 'aria-hidden': 'true' });
  scrim.addEventListener('click', () => openPanel(''));
  const dock = h('nav', { class: 'docs-dock', 'aria-label': 'Tools' });
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
    h('div', { class: 'docs-body' }, outline, canvas, scrim, design, chat, check, sheet),
    status,
    dock,
  );
  // Phones: drag a sheet down by its header to close it.
  for (const panel of [design, chat, check, sheet]) {
    let y0 = null;
    let dy = 0;
    panel.addEventListener('pointerdown', (e) => {
      if (window.innerWidth > 900 || e.pointerType === 'mouse' || !e.target.closest('.chat-head, .chat-grab') || e.target.closest('button')) return;
      y0 = e.clientY;
      dy = 0;
      panel.setPointerCapture?.(e.pointerId);
    });
    panel.addEventListener('pointermove', (e) => {
      if (y0 === null) return;
      dy = Math.max(0, e.clientY - y0);
      panel.style.transform = `translateY(${dy}px)`;
      panel.style.transition = 'none';
    });
    const end = () => {
      if (y0 === null) return;
      y0 = null;
      panel.style.transition = '';
      panel.style.transform = '';
      if (dy > 80) openPanel('');
    };
    panel.addEventListener('pointerup', end);
    panel.addEventListener('pointercancel', end);
  }
  const sheetHead = (title, sub) => {
    const close = h('button', { type: 'button', class: 'icon-btn chat-close', 'aria-label': 'Close', title: 'Close' }, '×');
    close.addEventListener('click', () => openPanel(''));
    return [h('div', { class: 'chat-grab', 'aria-hidden': 'true' }), h('header', { class: 'chat-head' }, h('div', {}, h('strong', {}, title), sub ? h('span', {}, sub) : ''), close)];
  };

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
    // Keep the panel where it was: picking a template must not jump back to the top.
    const keepTop = design.scrollTop;
    const keepLeft = design.querySelector('.docs-gallery')?.scrollLeft || 0;
    requestAnimationFrame(() => {
      design.scrollTop = keepTop;
      const g = design.querySelector('.docs-gallery');
      if (g) g.scrollLeft = keepLeft;
    });
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
      h('div', { class: 'design-sheet-head' }, ...sheetHead('Design', 'Template and colour')),
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
      pageControls(),
      h('p', { class: 'panel-label tpl-label' }, `Templates (${TEMPLATES.length})`),
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

  // ----- page layout: text size, spacing, margins, fit to one page -----
  function setLayout(patch) {
    record();
    const next = { size: 'm', spacing: 'normal', margins: 'normal', ...(layoutOf() || {}), ...patch };
    if (kind === 'cv') saveMaster({ layout: next });
    else saveLetter({ layout: next });
    refresh();
    record();
    showSaved();
  }
  // Pages of the current document at A4 width, measured off-screen.
  function measurePages(layout) {
    const probe = h('div', { class: 'page-probe', 'aria-hidden': 'true' });
    const el = kind === 'cv' ? renderCV(cv(), tplId(), accent(), { font: fontId(), layout }) : renderLetter(letterCV(), letterOf().body || '', tplId(), accent(), letterMeta(), { font: fontId(), layout });
    probe.append(el);
    document.body.append(probe);
    const pages = Math.max(1, Math.ceil((el.offsetHeight - 4) / A4_HEIGHT));
    probe.remove();
    return pages;
  }
  function fitToPages(target) {
    const tries = [
      { size: 'm', spacing: 'normal', margins: 'normal' },
      { size: 'm', spacing: 'compact', margins: 'normal' },
      { size: 'm', spacing: 'compact', margins: 'narrow' },
      { size: 's', spacing: 'compact', margins: 'normal' },
      { size: 's', spacing: 'compact', margins: 'narrow' },
    ];
    const ok = tries.find((l) => measurePages(l) <= target);
    if (!ok) {
      toast(target === 1 ? 'Still more than one page at the smallest size. Ask Vora to shorten it.' : 'Still too long. Ask Vora to shorten it.');
      setLayout(tries.at(-1));
      return;
    }
    setLayout(ok);
    toast(target === 1 ? 'Fits on one page now' : `Fits on ${target} pages now`);
  }
  function pageControls() {
    const L = { size: 'm', spacing: 'normal', margins: 'normal', ...(layoutOf() || {}) };
    const seg = (key, label) =>
      h(
        'div',
        { class: 'pg-row' },
        h('span', { class: 'pg-label' }, label),
        h(
          'div',
          { class: 'segmented pg-seg', role: 'radiogroup', 'aria-label': label },
          ...LAYOUT_OPTIONS[key].map(([v, text]) => {
            const b = h('button', { type: 'button', role: 'radio', class: 'seg-btn', 'aria-checked': String(L[key] === v), 'aria-pressed': String(L[key] === v) }, text);
            b.addEventListener('click', () => L[key] !== v && setLayout({ [key]: v }));
            return b;
          }),
        ),
      );
    const pages = measurePages(layoutOf());
    const fit1 = h('button', { type: 'button', class: 'btn small' }, 'Fit to one page');
    fit1.addEventListener('click', () => fitToPages(1));
    const fit2 = kind === 'cv' ? h('button', { type: 'button', class: 'btn small' }, 'Fit to two pages') : '';
    if (fit2) fit2.addEventListener('click', () => fitToPages(2));
    const reset = h('button', { type: 'button', class: 'link-btn small' }, 'Reset');
    reset.addEventListener('click', () => setLayout({ size: 'm', spacing: 'normal', margins: 'normal' }));
    return h(
      'section',
      { class: 'pg' },
      h('div', { class: 'pg-head' }, h('p', { class: 'panel-label' }, 'Page'), h('span', { class: `pg-count${pages > (kind === 'cv' ? 2 : 1) ? ' warn' : ''}` }, `${pages} ${pages === 1 ? 'page' : 'pages'}`)),
      seg('size', 'Text size'),
      seg('spacing', 'Spacing'),
      seg('margins', 'Margins'),
      h('div', { class: 'pg-actions' }, pages > 1 ? fit1 : '', pages > 2 && fit2 ? fit2 : '', reset),
    );
  }

  // A Word file of the page (Word opens HTML documents saved as .doc).
  function downloadWord() {
    const el = page(tplId(), accent());
    const vars = { '--cv-accent': accent(), '--ink': '#111827', '--ink-muted': '#4b5563', '--paper': '#ffffff', '--f-serif': "'Times New Roman', Times, serif", '--f-sans': "Calibri, Arial, sans-serif", '--cv-font': fontChoice(fontId()).css || 'inherit', '--cv-zoom': '1', '--cv-gap': '1' };
    const resolve = (css) => css.replace(/var\((--[\w-]+)(?:,[^)]*)?\)/g, (_, v) => vars[v] || 'inherit');
    const css = [...document.styleSheets]
      .flatMap((ss) => {
        try {
          return [...ss.cssRules];
        } catch {
          return [];
        }
      })
      .filter((r) => r.selectorText && /cv-|tpl-|letter-/.test(r.selectorText) && !/editing|ed-|docs-|hub-|jd-|tpl-thumb|tpl-card/.test(r.selectorText))
      .map((r) => resolve(r.cssText))
      .join('\n');
    const title = kind === 'cv' ? `${cv().name || 'CV'}` : 'Cover letter';
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${title.replace(/</g, '')}</title><style>@page { size: 21cm 29.7cm; margin: 1.8cm 2cm; } body { margin: 0; } ${css} .cv-page { box-shadow: none; max-width: none; padding: 0; background: #fff; }</style></head><body>${resolve(el.outerHTML)}</body></html>`;
    download(`${fileBase()}.doc`, html, 'application/msword');
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
    return menu('Insert', ICON_PLUS, insertItems());
  }
  function insertItems() {
    if (kind === 'letter') return letterInsertItems();
    const add = (key) => () => act('add', key);
    return [
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
    ];
  }

  // Letter parts: the same Insert menu as the CV, with what a letter is made of.
  // Wording follows the letter's language (German, French, Italian, Spanish, Portuguese or English).
  function letterWords() {
    const b = letterOf().body || '';
    const name = store.get().profile.name.trim() || cv()?.name || '';
    const W = {
      de: ['Sehr geehrte Damen und Herren', 'Freundliche Grüsse', 'Hier steht Ihr neuer Absatz.'],
      fr: ['Madame, Monsieur,', 'Veuillez agréer mes salutations distinguées.', 'Votre nouveau paragraphe ici.'],
      it: ['Gentili Signore e Signori,', 'Cordiali saluti', 'Il tuo nuovo paragrafo qui.'],
      es: ['Estimados señores:', 'Atentamente,', 'Tu nuevo párrafo aquí.'],
      pt: ['Prezados senhores,', 'Atenciosamente,', 'Seu novo parágrafo aqui.'],
      en: ['Dear Hiring Manager,', 'Kind regards,', 'Write your new paragraph here.'],
    };
    const lang = /\b(Sehr geehrte|Grüsse|Grüße|ich|und)\b/.test(b) ? 'de' : /\b(Madame|Monsieur|Cordialement|je|nous)\b/.test(b) ? 'fr' : /\b(Gentil|Cordiali|sono)\b/.test(b) ? 'it' : /\b(Estimad|Atentamente)\b/.test(b) ? 'es' : /\b(Prezad|Atenciosamente)\b/.test(b) ? 'pt' : (currentLanguage() in W ? currentLanguage() : 'en');
    const [greet, bye, para] = W[lang];
    return { greet, bye, para, name };
  }
  // Select a piece of text inside a page field, so typing replaces it.
  function selectInField(path, text) {
    const el = [...paperScale.querySelectorAll('[data-path]')].find((x) => x.dataset.path === path);
    if (!el) return;
    el.focus();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.nodeValue.indexOf(text);
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + text.length);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    focusPath(path);
  }
  function letterInsertItems() {
    const L = letterOf();
    const body = L.body || '';
    const blocks = () => (letterOf().body || '').split(/\n{2,}/);
    const w = letterWords();
    const hasGreeting = /^(dear|sehr geehrte|liebe|hallo|madame|monsieur|bonjour|gentil|egregi|estimad|prezad|olá|hello|hi)\b/i.test(body.trim());
    const hasSignOff = /(regards|sincerely|grüsse|grüße|salutations|cordialement|saluti|atentamente|atenciosamente|best wishes)/i.test(blocks().slice(-2).join(' '));
    const write = (nextBody, focus) => {
      record();
      saveLetter({ body: nextBody });
      renderPaper();
      record();
      showSaved();
      requestAnimationFrame(() => (focus ? selectInField('letter.body', focus) : focusPath('letter.body')));
    };
    const goTo = (path) => () => {
      if (!String(letterOf()[LETTER_FIELD[path]] || '').trim()) renderPaper();
      requestAnimationFrame(() => focusPath(path));
    };
    return [
      { label: 'Paragraph', hint: 'A new paragraph before your closing', run: () => {
        const b = blocks().filter((x) => x.trim());
        const at = hasSignOff ? Math.max(b.length - 1, hasGreeting ? 1 : 0) : b.length;
        b.splice(at, 0, w.para);
        write(b.join('\n\n'), w.para);
      } },
      { label: 'Greeting', hint: w.greet, disabled: hasGreeting, run: () => write(`${w.greet}\n\n${body.trim()}`.trim(), w.greet) },
      { label: 'Closing and your name', hint: `${w.bye} ${w.name}`.trim(), disabled: hasSignOff, run: () => write(`${body.trim()}\n\n${w.bye}\n${w.name}`.trim(), w.bye) },
      { label: 'P.S. line', hint: 'One short line after your name', run: () => write(`${body.trim()}\n\nP.S. `, 'P.S. ') },
      '-',
      { label: 'Recipient address', hint: 'Company, contact person, street, town', run: goTo('letter.to') },
      { label: 'Subject line', hint: 'The job you apply for', run: goTo('letter.subject') },
      { label: 'Place and date', hint: 'Top right of the letter', run: goTo('letter.date') },
    ];
  }

  // ----- phone: bottom dock and the Font / Insert sheets -----
  function drawDock() {
    if (!hasDoc()) return dock.replaceChildren();
    const item = (name, label, icon, on, cls = '') => {
      const b = h('button', { type: 'button', class: `dock-btn ${cls}`, 'aria-pressed': String(on) }, typeof icon === 'string' && icon.startsWith('<') ? svgIcon(icon) : h('span', { class: 'dock-aa', 'aria-hidden': 'true', style: fontChoice(fontId()).css ? `font-family:${fontChoice(fontId()).css}` : '' }, 'Aa'), h('span', {}, label));
      b.addEventListener('click', () => openPanel(on ? '' : name));
      return b;
    };
    dock.replaceChildren(
      item('design', 'Design', ICON_PALETTE, designOpen),
      item('font', 'Font', 'Aa', sheetOpen === 'font'),
      item('insert', 'Insert', ICON_PLUS, sheetOpen === 'insert'),
      item('check', 'Check', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>', checkOpen),
      item('chat', 'Vora AI', ICON_SPARK, chatOpen, 'dock-vora tb-ai'),
    );
  }
  function drawSheet() {
    if (sheetOpen === 'font') {
      const current = fontChoice(fontId());
      const row = (f, label, note, run, on) => {
        const b = h('button', { type: 'button', class: 'sheet-row', 'aria-pressed': String(on) }, h('span', { class: 'sheet-aa', 'aria-hidden': 'true', style: f?.css ? `font-family:${f.css}` : '' }, 'Aa'), h('span', { class: 'sheet-text' }, h('strong', { style: f?.css ? `font-family:${f.css}` : '' }, label), h('small', {}, note)), on ? h('span', { class: 'sheet-tick', 'aria-hidden': 'true' }) : '');
        b.addEventListener('click', run);
        return b;
      };
      for (const f of FONT_CHOICES) if (f.css) document.fonts?.load(`16px ${f.css}`).catch(() => {});
      const pickFont = (id) => () => {
        if (kind === 'cv') saveMaster({ font: id });
        else saveLetter({ font: id });
        showSaved();
        refresh();
      };
      sheet.replaceChildren(
        ...sheetHead('Font', 'The PDF uses the same font'),
        h(
          'div',
          { class: 'sheet-body' },
          ...FONT_CHOICES.map((f) => row(f, f.name, f.note, pickFont(f.id), f.id === current.id)),
          kind === 'letter' && typeof letterOf().font === 'string'
            ? row(null, 'Same as my CV', fontChoice(master().font).name, () => {
                saveLetter({ font: undefined });
                refresh();
              }, false)
            : '',
        ),
      );
    } else if (sheetOpen === 'insert') {
      sheet.replaceChildren(
        ...sheetHead('Insert', kind === 'cv' ? 'Add a section to your CV' : 'Add a part to your letter'),
        h(
          'div',
          { class: 'sheet-body' },
          ...insertItems()
            .filter((x) => x !== '-')
            .map((x) => {
              const b = h('button', { type: 'button', class: 'sheet-row', disabled: x.disabled || null }, h('span', { class: 'sheet-aa plus', 'aria-hidden': 'true' }, '+'), h('span', { class: 'sheet-text' }, h('strong', {}, x.label), x.hint ? h('small', {}, x.hint) : ''));
              b.addEventListener('click', () => {
                openPanel('');
                x.run();
              });
              return b;
            }),
        ),
      );
    }
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
      h('div', { class: 'rb-group' }, insertMenu()),
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
          ['Download as Word (.doc)', downloadWord],
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
      const def = applyLayout(kind === 'cv' ? cvPDFDefinition(cv(), tplId(), accent(), { font }) : letterPDFDefinition(letterCV(), letterOf().body || '', tplId(), accent(), letterMeta(), { font }), layoutOf());
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

  // The start screen of an empty CV or letter: a live preview of the page in
  // the chosen look, the look picker, and clear choices as cards.
  function startCard() {
    const p = store.get().profile;
    const isCV = kind === 'cv';
    const docsAll = Object.entries(store.get().docs || {});
    const latest = (pick) => docsAll.filter(([, d]) => pick(d)).sort((x, y) => (y[1].updatedAt || 0) - (x[1].updatedAt || 0))[0];
    const tailored = latest((d) => d?.cvData);
    const jobLetter = latest((d) => d?.coverLetter);
    const companyOf = (entry) => store.get().jobs[entry[0]]?.company || 'a job';
    const TONES = [['professional', 'Professional'], ['warm and enthusiastic', 'Warm'], ['concise and direct', 'Concise'], ['formal', 'Formal']];
    let tone = 'professional';
    const LOOKS = ['harvard', 'modern', 'professional', 'executive', 'clean', 'banner', 'jakes', 'elegant'];

    // Preview: the real page in the chosen template, with your own details where we have them.
    const sampleCV = () => {
      const base = cvFromProfile(p);
      if ((base.experience || []).length) return base;
      return {
        ...base,
        name: base.name || p.name || 'Your Name',
        headline: base.headline || p.headline || 'Your headline',
        summary: base.summary || 'A short profile that says what you do and what you are good at.',
        experience: [{ title: p.targetRoles.split(',')[0]?.trim() || 'Your role', company: 'Company', location: p.location || 'City', start: '2022', end: 'Present', bullets: ['What you did and what came of it.', 'A result with a number.'] }],
        education: base.education?.length ? base.education : [{ degree: 'Your degree', school: 'School', location: '', start: '2018', end: '2021', details: '' }],
        skills: base.skills?.length ? base.skills : [{ label: 'Skills', items: (p.skills || 'Skill one, Skill two').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 5) }],
      };
    };
    const SAMPLE_LETTER = 'Dear Hiring Manager,\n\nThe opening says which role you want and why this company.\n\nThe middle shows one or two real results from your experience that match what they need.\n\nThe close asks for a conversation.\n\nKind regards,\n' + (p.name || 'Your Name');
    const preview = h('div', { class: 'ds-paper', 'aria-hidden': 'true' });
    const drawPreview = () => {
      const id = tplId();
      preview.replaceChildren(isCV ? renderCV(sampleCV(), id, accent(), { font: fontId() }) : renderLetter(letterCV(), SAMPLE_LETTER, id, accent(), letterMeta(), { font: fontId() }));
      preview.classList.remove('swap');
      void preview.offsetWidth;
      preview.classList.add('swap');
    };
    drawPreview();

    // Look picker
    const looks = h('div', { class: 'ds-looks', role: 'radiogroup', 'aria-label': 'Template' });
    const drawLooks = () =>
      looks.replaceChildren(
        ...LOOKS.map((id) => {
          const t = getTemplate(id);
          const on = tplId() === t.id;
          const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(on), class: 'ds-look', title: t.blurb }, h('span', { class: 'ds-look-thumb', 'aria-hidden': 'true' }, isCV ? renderCV(sampleCV(), t.id, t.accent) : renderLetter(letterCV(), SAMPLE_LETTER, t.id, t.accent, letterMeta())), h('span', { class: 'ds-look-name' }, t.name));
          b.addEventListener('click', () => {
            if (isCV) saveMaster({ template: t.id, accent: '' });
            else saveLetter({ template: t.id, accent: '' });
            drawLooks();
            drawPreview();
          });
          return b;
        }),
      );
    drawLooks();

    // Choice cards
    const card = ({ icon, title, text, badge = '', primary = false, run, href }) => {
      const inner = [h('span', { class: 'ds-opt-icon', 'aria-hidden': 'true' }, svgIcon(icon)), h('span', { class: 'ds-opt-text' }, h('strong', {}, title, badge ? h('span', { class: 'ds-badge' }, badge) : ''), h('small', {}, text)), h('span', { class: 'ds-opt-go', 'aria-hidden': 'true' }, svgIcon(ICON_CHEVRON))];
      const el = href ? h('a', { class: `ds-opt${primary ? ' primary' : ''}`, href }, ...inner) : h('button', { type: 'button', class: `ds-opt${primary ? ' primary' : ''}` }, ...inner);
      if (run) el.addEventListener('click', run);
      return el;
    };
    const ICON_BLANK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/></svg>';
    const ICON_COPY = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h2"/></svg>';
    const ICON_UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>';
    const options = isCV
      ? [
          p.cv.trim()
            ? card({ icon: ICON_SPARK, primary: true, badge: 'Recommended', title: 'Lay out my CV with Vora', text: 'Your profile CV in this look, word for word. About 30 seconds.', run: () => withAI({ kind: 'layout' }, async (signal) => { const cvData = await ai.structureCV({ signal }); stopIfCancelled(signal); saveMaster({ cvData }); }) })
            : card({ icon: ICON_UP, primary: true, title: 'Upload your CV first', text: 'Add it in your profile, then Vora lays it out here.', href: '#/profile' }),
          tailored ? card({ icon: ICON_COPY, title: `Start from my CV for ${companyOf(tailored)}`, text: 'Copy the version you tailored for that job and make it general.', run: () => (record(), saveMaster({ cvData: structuredClone(tailored[1].cvData) }), refresh(), record()) }) : '',
          card({ icon: ICON_BLANK, title: 'Start from a blank page', text: 'Fill in every section yourself, like in Word.', run: () => startBlank() }),
        ]
      : [
          card({ icon: ICON_SPARK, primary: true, badge: 'Recommended', title: 'Write a general letter with Vora', text: 'From your CV and the roles you want, in the tone you pick. About 30 seconds.', run: () => withAI({ kind: 'letter' }, async (signal) => { const body = await ai.writeGeneralLetter({ tone, signal }); stopIfCancelled(signal); saveLetter({ body, date: Date.now() }); }) }),
          jobLetter ? card({ icon: ICON_COPY, title: `Start from my letter for ${companyOf(jobLetter)}`, text: 'Copy the letter you wrote for that job and adapt it.', run: () => (record(), saveLetter({ body: jobLetter[1].coverLetter, date: Date.now() }), refresh(), record()) }) : '',
          card({ icon: ICON_BLANK, title: 'Start from a blank page', text: 'Write it yourself on a proper business letter page.', run: () => startBlank() }),
        ];

    const toneRow = isCV
      ? ''
      : (() => {
          const row = h('div', { class: 'ds-tones', role: 'radiogroup', 'aria-label': 'Tone' });
          const draw = () =>
            row.replaceChildren(
              ...TONES.map(([v, label]) => {
                const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(tone === v), class: 'ds-tone' }, label);
                b.addEventListener('click', () => {
                  tone = v;
                  draw();
                });
                return b;
              }),
            );
          draw();
          return h('div', { class: 'ds-block' }, h('p', { class: 'ds-label' }, 'Tone'), row);
        })();

    const ticks = isCV
      ? ['Your own words, nothing invented', 'ATS-friendly templates', 'Edit on the page, download PDF or Word']
      : ['Matches your CV template', 'Sounds like a person, not a robot', 'Edit on the page, download PDF or Word'];

    return h(
      'section',
      { class: 'docs-start ds' },
      h(
        'div',
        { class: 'ds-hero' },
        h('div', { class: 'ds-stage' }, h('span', { class: 'ds-glow', 'aria-hidden': 'true' }), h('span', { class: 'ds-sheet back', 'aria-hidden': 'true' }), preview, h('span', { class: 'ds-live' }, h('i', { 'aria-hidden': 'true' }), 'Live preview')),
        h(
          'div',
          { class: 'ds-intro' },
          h('span', { class: 'ds-kind' }, svgIcon(isCV ? ICON_DOC : ICON_MAIL), isCV ? 'CV' : 'Cover letter'),
          h('h2', {}, isCV ? 'Build your CV in minutes' : 'A cover letter that gets read'),
          h('p', {}, isCV ? 'Let Vora lay out your CV in the look you pick, or start from scratch. You can change everything afterwards.' : 'Pick a tone and a look. Vora writes a general letter you can adapt to any job.'),
          toneRow,
          h('div', { class: 'ds-opts' }, ...options.filter(Boolean)),
          h('ul', { class: 'ds-ticks' }, ...ticks.map((t) => h('li', {}, t))),
        ),
      ),
      h('div', { class: 'ds-block' }, h('div', { class: 'ds-label-row' }, h('p', { class: 'ds-label' }, 'Choose a look'), h('span', { class: 'small muted' }, `${TEMPLATES.length} templates in the editor`)), looks),
    );
  }

  function layout() {
    const wide = window.innerWidth > 900;
    const on = (x) => x && hasDoc();
    appEl.classList.toggle('with-outline', outlineOpen && wide && hasDoc());
    appEl.classList.toggle('with-design', on(designOpen));
    appEl.classList.toggle('with-chat', on(chatOpen));
    appEl.classList.toggle('with-check', on(checkOpen));
    design.classList.toggle('open', on(designOpen));
    chat.classList.toggle('open', on(chatOpen));
    check.classList.toggle('open', on(checkOpen));
    sheet.classList.toggle('open', on(Boolean(sheetOpen)) && !wide);
    appEl.classList.toggle('sheet-open', !wide && on(designOpen || chatOpen || checkOpen || Boolean(sheetOpen)));
    drawDock();
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
    if (sheetOpen) drawSheet();
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
            s.companies[key] = { data, at: Date.now(), lang: currentLanguage(), v: 2 };
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

function companySection(posting) {
  // The real employer: job sites, "Confidential" or an empty field are replaced by
  // the name the description itself uses ("Bei Medartis …", "Novartis AG").
  const job = { ...posting, company: resolveCompany(posting) };
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

  // Profiles from before the employer check (v2) may describe the job instead of the company: look them up again.
  const cachedEntry = store.get().companies?.[key];
  const cached = cachedEntry?.v === 2 ? cachedEntry : null;
  // A profile written in another interface language is shown, then refreshed.
  const otherLanguage = cachedEntry && (cachedEntry.lang || 'en') !== currentLanguage();
  if (!job.company) postingOnly('The posting does not name the company, and Vora could not find the employer\'s name in the description.');
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

/** A posting as readable blocks: headings, bullet lists and paragraphs. */
function formatDescription(text) {
  const box = h('div', { class: 'description jd-desc' });
  const lines = String(text || 'No description provided. Open the posting for the full details.').split('\n');
  let list = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      list = null;
      continue;
    }
    const bullet = line.match(/^([-•*·▪●]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      if (!list) box.append((list = h('ul', {})));
      list.append(h('li', {}, bullet[2]));
      continue;
    }
    list = null;
    if (line.length < 70 && /[:：]$/.test(line)) box.append(h('h3', {}, line.replace(/[:：]$/, '')));
    else box.append(h('p', {}, line));
  }
  return box;
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
    ['overview', 'Overview', '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>'],
    ['docs', 'CV & cover letter', ICON_DOC],
    ['prep', 'Interview game', '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="13" height="17" rx="2"/><path d="M4 6.5v12A2.5 2.5 0 0 0 6.5 21H15"/><path d="M13.5 9.5a1.8 1.8 0 1 1 1.8 1.8v1.2M15.3 15h0"/></svg>'],
  ];
  const tabBar = h('div', { class: 'tabs jd-tabs', role: 'tablist' });
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
    const d = store.get().docs[id] || {};
    const pr = store.get().prep[id] || {};
    const badge = { docs: `${(d.cvData ? 1 : 0) + (d.coverLetter ? 1 : 0)}/2`, prep: pr.best ? `${pr.best} XP` : pr.deck?.cards?.length ? `${(pr.results || []).filter(Boolean).length}/${pr.deck.cards.length}` : '' };
    tabBar.replaceChildren(
      ...tabs.map(([k, label, icon]) => {
        const b = h('button', { role: 'tab', class: k === key ? 'active' : '', 'aria-selected': String(k === key) }, svgIcon(icon), h('span', {}, label), badge[k] ? h('span', { class: `jd-badge${badge[k] === '2/2' ? ' full' : ''}` }, badge[k]) : '');
        b.addEventListener('click', () => {
          currentAbort?.abort();
          showTab(k);
        });
        return b;
      }),
    );
    panel.replaceChildren();
    panel.classList.remove('jd-in');
    void panel.offsetWidth; // restart the entrance animation
    panel.classList.add('jd-in');
    ({ overview: overviewTab, docs: docsTab, prep: prepTab })[key]();
    drawSteps();
  }

  // ----- Overview -----
  function overviewTab() {
    const current = store.get().jobs[id];
    const matchNow = job.match || current?.match;

    // Your application: status as one-tap pills, notes, history.
    const side = h('aside', { class: 'jd-side' });
    if (current) {
      const pills = h('div', { class: 'jd-status', role: 'radiogroup', 'aria-label': 'Status' });
      const paintPills = () =>
        pills.replaceChildren(
          ...STATUSES.map((st) => {
            const on = store.get().jobs[id]?.status === st.id;
            const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(on), class: `jd-pill status-${st.id}` }, st.label);
            b.addEventListener('click', () => {
              if (on) return;
              store.setStatus(id, st.id);
              toast(`Moved to ${st.label}`);
              paintPills();
              drawSteps();
              drawHistory();
              drawHeroStatus();
            });
            return b;
          }),
        );
      paintPills();
      const notes = h('textarea', { rows: 5, placeholder: 'Contacts, salary notes, next steps…' }, current.notes || '');
      notes.addEventListener('input', debounce(() => store.update((s) => (s.jobs[id].notes = notes.value)), 400));
      const history = h('ol', { class: 'jd-timeline' });
      function drawHistory() {
        const j = store.get().jobs[id];
        const events = [{ status: 'saved', at: j.savedAt }, ...(j.history || [])].filter((e) => e.at);
        history.replaceChildren(...events.reverse().map((e) => h('li', {}, h('strong', {}, STATUSES.find((x) => x.id === e.status)?.label || e.status), h('span', {}, fmtDate(e.at)))));
      }
      drawHistory();
      const remove = confirmButton('Remove job', 'Tap again to remove', () => {
        store.removeJob(id);
        toast('Job removed');
        go('/tracker');
      }, 'link-btn danger-link');
      side.append(
        h('section', { class: 'card jd-card' }, h('h2', {}, 'Your application'), pills, h('label', { class: 'jd-label', for: 'jd-notes' }, 'Notes'), Object.assign(notes, { id: 'jd-notes' }), h('h3', { class: 'jd-label' }, 'Timeline'), history, remove),
      );
    } else {
      const save = h('button', { class: 'btn primary' }, svgIcon(ICON_BOOKMARK), 'Save to applications');
      save.addEventListener('click', () => {
        ensureSaved();
        toast('Saved');
        route();
      });
      side.append(h('section', { class: 'card jd-card' }, h('h2', {}, 'Your application'), h('p', { class: 'muted small' }, 'Save this job to track it, keep notes and keep its CV and letter.'), save));
    }
    side.append(nextStepCard());
    const facts = [
      ['Location', job.location],
      ['Salary', job.salary || 'Not listed'],
      ['Posted', postedLabel(job).replace(/^Posted /, '') || 'Unknown'],
      ['Found on', job.source],
      ['Saved', current?.savedAt ? fmtDate(current.savedAt) : ''],
    ].filter(([, v]) => v);
    side.append(h('section', { class: 'card jd-card' }, h('h2', {}, 'At a glance'), h('dl', { class: 'jd-facts' }, ...facts.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))))));

    // How you match, with the deeper Vora analysis inside the same card.
    const fit = h('div', { class: 'ai-output jd-fit' });
    const prevFit = store.get().docs[id]?.fit;
    if (prevFit) fit.replaceChildren(md(prevFit));
    const fitBtn = aiButton(prevFit ? 'Analyse again' : 'Deep fit analysis', {
      variant: 'small',
      output: fit,
      task: (onText, signal) => ai.analyzeGap(job, { onText, signal }),
      onDone: (text) => {
        ensureSaved();
        store.update((s) => (s.docs[id] = { ...s.docs[id], fit: text }));
      },
    });
    const pct = matchNow ? Math.max(0, Math.min(100, Number(matchNow.score) || 0)) : 0;
    const level = pct >= 75 ? 'high' : pct >= 50 ? 'mid' : 'low';
    const skills = matchedSkills(job);
    const matchCard = h(
      'section',
      { class: 'card jd-card jd-match' },
      h(
        'div',
        { class: 'jd-match-top' },
        matchNow ? h('div', { class: `ring ring-${level}`, style: `--p:${pct}`, role: 'img', 'aria-label': `${pct}% match` }, h('strong', {}, `${pct}%`)) : h('div', { class: 'ring', style: '--p:0' }, h('strong', {}, '–')),
        h(
          'div',
          {},
          h('h2', {}, 'How you match'),
          matchNow?.reason ? h('p', { translate: 'no' }, matchNow.reason) : h('p', { class: 'muted' }, 'Run a fit analysis to see how your CV lines up with this role.'),
          skills.length ? h('div', { class: 'dt-skills' }, ...skills.map((x) => h('span', { class: 'dt-skill' }, x))) : '',
        ),
      ),
      h('div', { class: 'jd-fit-head' }, h('h3', {}, 'Fit analysis by Vora'), fitBtn),
      prevFit ? fit : h('div', {}, fit, h('p', { class: 'muted small' }, 'Vora compares the posting with your CV: what fits, what is missing, and how to close the gaps in your application.')),
    );

    panel.append(
      h('div', { class: 'jd-grid' }, h('div', { class: 'jd-main' }, matchCard, companySection(job), h('section', { class: 'card jd-card' }, h('h2', {}, 'About the role'), formatDescription(job.description))), side),
    );
  }

  // The one thing to do next, from where the application stands.
  function nextStepCard() {
    const d = store.get().docs[id] || {};
    const status = store.get().jobs[id]?.status;
    const to = (tab) => () => showTab(tab);
    const [title, text, label, run] = !d.cvData
      ? ['Tailor your CV', 'Vora rewrites your CV around what this role asks for, in about a minute.', 'Tailor my CV', to('docs')]
      : !d.coverLetter
        ? ['Write the cover letter', 'Your CV is ready. A matching letter makes the application complete.', 'Write the letter', to('docs')]
        : !['applied', 'interview', 'offer'].includes(status)
          ? ['Send your application', 'CV and letter are ready. Apply on the company site, then mark it as applied.', job.url ? 'Open the posting' : 'Mark as applied', job.url ? () => window.open(safeUrl(job.url), '_blank', 'noopener') : () => {
              ensureSaved();
              store.setStatus(id, 'applied');
              route();
            }]
          : ['Practise the interview', 'Play the interview deck: 8 questions for this role with feedback on every answer.', 'Play the deck', to('prep')];
    const b = h('button', { type: 'button', class: 'btn primary' }, label, svgIcon(ICON_CHEVRON));
    b.addEventListener('click', run);
    return h('section', { class: 'card jd-next' }, h('p', { class: 'eyebrow' }, 'Next step'), h('h2', {}, title), h('p', {}, text), b);
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
    const d = docs();
    const both = d.cvData && d.coverLetter;
    panel.append(
      keyNotice() || '',
      profileNotice() || '',
      h(
        'div',
        { class: 'jd-docs-head' },
        h('div', {}, h('h2', {}, both ? 'Your application is ready' : `Your application for ${job.company || 'this job'}`), h('p', { class: 'muted' }, both ? 'Open either document to edit it, change the template or download the PDF.' : 'Vora writes both for this job from your CV. Nothing is invented: only your real experience, put in the best order.')),
        h('div', { class: 'jd-ready-meter', role: 'img', 'aria-label': `${(d.cvData ? 1 : 0) + (d.coverLetter ? 1 : 0)} of 2 documents ready` }, h('span', { class: d.cvData ? 'on' : '' }), h('span', { class: d.coverLetter ? 'on' : '' })),
      ),
      h('div', { class: 'jd-docs' }, cvSection(), letterSection()),
    );
  }

  // One document card: a live preview on the left (or a blank page), what it is and what you can do.
  function docCard({ kind, ready, preview, onOpen, title, meta, notes, actions, emptyText }) {
    const prev = ready
      ? (() => {
          const b = h('button', { type: 'button', class: 'jd-paper', 'aria-label': `Open ${title}` }, h('div', { class: 'jd-paper-in', 'aria-hidden': 'true' }, preview), h('span', { class: 'jd-paper-open' }, 'Open'));
          b.addEventListener('click', onOpen);
          return b;
        })()
      : h('div', { class: 'jd-paper ghost', 'aria-hidden': 'true' }, h('div', { class: 'jd-ghost-lines' }, ...Array.from({ length: kind === 'cv' ? 9 : 8 }, (_, i) => h('span', { style: `--w:${[60, 38, 0, 90, 76, 84, 0, 70, 52][i] || 80}%` }))), h('span', { class: 'jd-ghost-spark' }, svgIcon(ICON_SPARK)));
    return [
      prev,
      h(
        'div',
        { class: 'jd-doc-info' },
        h('div', { class: 'jd-doc-head' }, h('span', { class: 'hub-icon', 'aria-hidden': 'true' }, svgIcon(kind === 'cv' ? ICON_DOC : ICON_MAIL)), h('h2', {}, title), h('span', { class: `jd-chip ${ready ? 'ok' : ''}` }, ready ? 'Ready' : 'Not written yet')),
        ready ? h('p', { class: 'jd-doc-meta' }, meta) : h('p', { class: 'jd-doc-meta muted' }, emptyText),
        notes || '',
        h('div', { class: 'jd-doc-actions' }, ...actions),
      ),
    ];
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
  const jobLayout = () => store.get().master?.layout || null;
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
      await download(filename, await makePDF(applyLayout(definition, jobLayout()), { font: jobFont() }), 'application/pdf');
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
      gen.textContent = d.cvData ? 'Rewrite' : 'Tailor my CV with Vora';
      gen.classList.toggle('primary', !d.cvData);
      gen.classList.toggle('small', Boolean(d.cvData));
      gen.classList.toggle('ghost', Boolean(d.cvData));
      const t = getTemplate(template());
      pdfBtn.replaceChildren(svgIcon(ICON_DOWNLOAD), h('span', {}, 'PDF'));
      const open = h('button', { type: 'button', class: 'btn primary' }, 'Open CV');
      open.addEventListener('click', openStudio);
      body.replaceChildren(
        ...docCard({
          kind: 'cv',
          ready: Boolean(d.cvData),
          preview: d.cvData ? renderCV(d.cvData, t.id, accent(), { font: jobFont(), layout: jobLayout() }) : '',
          onOpen: openStudio,
          title: 'Tailored CV',
          meta: `${t.name} template${jobFont() ? ` · ${fontChoice(jobFont()).name}` : ''}${d.updatedAt ? ` · updated ${fmtDate(d.updatedAt)}` : ''}`,
          notes: d.cvData?.changes?.length ? h('div', { class: 'jd-changes' }, h('p', { class: 'jd-label' }, 'What Vora changed for this job'), h('ul', { translate: 'no' }, ...d.cvData.changes.slice(0, 3).map((c) => h('li', {}, c)))) : '',
          actions: d.cvData ? [open, pdfBtn, gen] : [gen],
          emptyText: 'Your CV rewritten around what this role asks for, with the posting\'s own keywords, in a professional template. Nothing invented.',
        }),
      );
      if (status.isConnected) root0.classList.toggle('is-ready', Boolean(d.cvData));
    }

    async function downloadCV(btn) {
      await savePDF(cvPDFDefinition(docs().cvData, template(), accent(), { font: jobFont(), layout: jobLayout() }), `${fileBase()}-cv-${template()}.pdf`, btn);
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
        page: (id, color, opts) => renderCV(docs().cvData, id, color, { font: jobFont(), layout: jobLayout(), ...opts }),
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
                ...(cv.changes?.length ? [h('h3', {}, 'What changed for this job'), h('ul', { translate: 'no' }, ...cv.changes.map((c) => h('li', {}, c)))] : [h('p', { class: 'muted' }, 'No change notes for this version.')]),
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

    body.className = 'jd-doc-body';
    const panelRoot = h('section', { class: 'card jd-doc' }, body, status);
    const root0 = panelRoot;
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
    const page = (id, color, opts) => renderLetter(letterCV(), docs().coverLetter || '', id, color, meta(), { font: jobFont(), layout: jobLayout(), ...opts });
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
      await savePDF(letterPDFDefinition(letterCV(), docs().coverLetter, letterTpl(), letterAccent(), meta(), { font: jobFont(), layout: jobLayout() }), `${fileBase()}-cover-letter-${letterTpl()}.pdf`, btn);
    }

    function draw() {
      const d = docs();
      gen.textContent = d.coverLetter ? 'Rewrite' : 'Write my letter with Vora';
      gen.classList.toggle('primary', !d.coverLetter);
      gen.classList.toggle('small', Boolean(d.coverLetter));
      gen.classList.toggle('ghost', Boolean(d.coverLetter));
      const t = getTemplate(letterTpl());
      pdfBtn.replaceChildren(svgIcon(ICON_DOWNLOAD), h('span', {}, 'PDF'));
      const open = h('button', { type: 'button', class: 'btn primary' }, 'Open letter');
      open.addEventListener('click', openLetter);
      const words = (d.coverLetter || '').trim().split(/\s+/).filter(Boolean).length;
      body.replaceChildren(
        ...docCard({
          kind: 'letter',
          ready: Boolean(d.coverLetter),
          preview: d.coverLetter ? page(t.id, letterAccent()) : '',
          onOpen: openLetter,
          title: 'Cover letter',
          meta: `${t.name} template${d.letterTemplate ? '' : ', matching your CV'} · ${words} words${d.updatedAt ? ` · updated ${fmtDate(d.updatedAt)}` : ''}`,
          notes: h('label', { class: 'jd-tone' }, h('span', { class: 'jd-label' }, d.coverLetter ? 'Tone for a rewrite' : 'Tone'), tone),
          actions: d.coverLetter ? [open, pdfBtn, gen] : [gen],
          emptyText: 'A specific, human-sounding letter from your CV, laid out as a business letter in the same template as your CV.',
        }),
      );
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

    body.className = 'jd-doc-body';
    const root = h('section', { class: 'card jd-doc' }, body, status);
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
  const applyBtn = job.url ? h('a', { class: 'btn primary jd-apply', href: safeUrl(job.url), target: '_blank', rel: 'noopener noreferrer' }, job.source ? `Apply on ${job.source}` : 'Apply', h('span', { 'aria-hidden': 'true' }, ' ↗')) : '';
  const saveBtn = h('button', { class: 'btn jd-save', type: 'button' });
  const heroStatus = h('span', { class: 'jd-status-tag' });
  function drawHeroStatus() {
    const j = store.get().jobs[id];
    saveBtn.replaceChildren(svgIcon(ICON_BOOKMARK), h('span', {}, j ? 'Saved' : 'Save job'));
    saveBtn.classList.toggle('on', Boolean(j));
    heroStatus.className = `jd-status-tag status-${j?.status || 'none'}`;
    heroStatus.textContent = j ? STATUSES.find((x) => x.id === j.status)?.label || '' : '';
    heroStatus.hidden = !j;
  }
  saveBtn.addEventListener('click', () => {
    if (store.get().jobs[id]) return showTab('overview');
    ensureSaved();
    toast('Saved to your applications');
    drawHeroStatus();
    showTab(active);
  });
  drawHeroStatus();
  const tailorBtn = h('button', { class: 'btn jd-tailor', type: 'button' }, svgIcon(ICON_SPARK), 'Tailor with Vora');
  tailorBtn.addEventListener('click', () => showTab('docs'));
  const pct = match ? Math.max(0, Math.min(100, Number(match.score) || 0)) : 0;
  const level = pct >= 75 ? 'high' : pct >= 50 ? 'mid' : 'low';
  const back = saved() ? ['#/tracker', 'Applications'] : ['#/find', 'Search'];
  const header = h(
    'header',
    { class: 'jd-hero' },
    h('a', { class: 'jd-back', href: back[0] }, svgIcon('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>'), back[1]),
    h(
      'div',
      { class: 'jd-hero-main' },
      companyAvatar(job.company || job.source, 'xl'),
      h(
        'div',
        { class: 'jd-hero-text' },
        h('p', { class: 'jd-company' }, job.company || job.source || '', heroStatus),
        h('h1', {}, job.title),
        h(
          'div',
          { class: 'jd-pills' },
          job.location ? h('span', {}, job.location) : '',
          job.salary ? h('span', { class: 'money' }, job.salary) : '',
          job.remote && !/remote/i.test(job.location || '') ? h('span', {}, 'Remote') : '',
          postedLabel(job) ? h('span', {}, postedLabel(job)) : '',
          job.source ? h('span', {}, `via ${job.source}`) : '',
        ),
      ),
      match
        ? h('div', { class: 'jd-hero-match' }, h('div', { class: `ring ring-${level}`, style: `--p:${pct}`, role: 'img', 'aria-label': `${pct}% match` }, h('strong', {}, `${pct}%`)), h('span', {}, 'match'))
        : '',
    ),
    h('div', { class: 'jd-hero-actions' }, applyBtn, tailorBtn, saveBtn),
  );

  // Application progress: where this job stands, at a glance (tap a step to act on it).
  const steps = h('nav', { class: 'jd-steps', 'aria-label': 'Application progress' });
  function drawSteps() {
    const d = store.get().docs[id] || {};
    const st = store.get().jobs[id]?.status;
    const rejected = st === 'rejected';
    const order = ['saved', 'applied', 'interview', 'offer'];
    const reached = (x) => order.indexOf(st) >= order.indexOf(x) && Boolean(st) && !rejected;
    const list = [
      ['Saved', Boolean(store.get().jobs[id]), () => showTab('overview')],
      ['CV tailored', Boolean(d.cvData), () => showTab('docs')],
      ['Letter written', Boolean(d.coverLetter), () => showTab('docs')],
      ['Applied', reached('applied') || (rejected && Boolean(store.get().jobs[id]?.appliedAt)), () => setStage('applied')],
      ['Interview', reached('interview'), () => setStage('interview')],
      ['Offer', reached('offer'), () => setStage('offer')],
    ];
    const firstOpen = list.findIndex(([, done]) => !done);
    steps.replaceChildren(
      ...list.map(([label, done, run], i) => {
        const b = h('button', { type: 'button', class: `jd-step${done ? ' done' : ''}${i === firstOpen && !rejected ? ' now' : ''}` }, h('span', { class: 'jd-dot', 'aria-hidden': 'true' }), h('span', {}, label));
        b.setAttribute('aria-label', `${label}: ${done ? 'done' : 'not yet'}`);
        b.addEventListener('click', run);
        return b;
      }),
      rejected ? h('span', { class: 'jd-closed' }, 'Closed: not selected') : '',
    );
    const lastDone = list.reduce((m, [, done], i) => (done ? i : m), 0);
    steps.style.setProperty('--done', String(lastDone / (list.length - 1)));
  }
  function setStage(stage) {
    const st = store.get().jobs[id]?.status;
    const order = ['saved', 'applied', 'interview', 'offer'];
    if (st && order.indexOf(st) >= order.indexOf(stage)) return showTab('overview');
    ensureSaved();
    store.setStatus(id, stage);
    toast(`Moved to ${STATUSES.find((x) => x.id === stage).label}`);
    drawHeroStatus();
    showTab(active);
  }

  view.append(h('div', { class: 'jd' }, header, steps, tabBar, panel));
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
      h('div', { class: 'hero-actions' }, editBtn, pr.cv.trim() ? h('a', { class: 'btn small', href: '#/documents/cv' }, svgIcon(ICON_DOC), 'Open my CV') : ''),
    );
    void score;
    drawOpenTo();
  }

  // ----- "Open to work": what you are looking for, at a glance -----
  const openTo = h('section', { class: 'card open-to' });
  function drawOpenTo() {
    const pr = store.get().profile;
    const pf = pr.prefs || {};
    const roleList = splitList(pr.targetRoles);
    const edit = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Edit job preferences', title: 'Edit' }, svgIcon(PENCIL));
    edit.addEventListener('click', () => openSection('pf-sec-prefs', { scroll: true }));
    const money = pf.salaryMin ? `From ${pf.currency || ''} ${Number(pf.salaryMin).toLocaleString(locale())} ${pf.salaryPeriod === 'month' ? 'a month' : pf.salaryPeriod === 'hour' ? 'an hour' : 'a year'}`.replace(/\s+/g, ' ') : '';
    const facts = [[(pf.workModes || []).join(', '), 'Work mode'], [(pf.types || []).join(', '), 'Type'], [pr.location, 'Location'], [money, 'Salary'], [pf.availability, 'Start']].filter(([v]) => v);
    if (!roleList.length) {
      const start = h('button', { type: 'button', class: 'btn primary small' }, 'Add the roles you want');
      start.addEventListener('click', () => openSection('pf-sec-prefs', { scroll: true }));
      return openTo.replaceChildren(h('div', { class: 'ot-head' }, h('span', { class: 'ot-dot', 'aria-hidden': 'true' }), h('div', {}, h('h2', {}, 'What are you looking for?'), h('p', { class: 'small muted' }, 'Tell Vora the roles you want, and the home page and search fill with jobs that fit.'))), start);
    }
    openTo.replaceChildren(
      h('div', { class: 'ot-head' }, h('span', { class: 'ot-dot', 'aria-hidden': 'true' }), h('div', {}, h('h2', {}, 'Open to work'), h('p', { class: 'small muted' }, 'Vora searches and ranks jobs with this.')), edit),
      h('div', { class: 'ot-roles' }, ...roleList.map((r) => h('span', { class: 'ot-role' }, r))),
      facts.length ? h('dl', { class: 'ot-facts' }, ...facts.map(([v, k]) => h('div', {}, h('dt', {}, k), h('dd', {}, v)))) : '',
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
  const SEC_ICONS = {
    'pf-sec-cv': ICON_DOC,
    'pf-sec-about': '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    'pf-sec-prefs': '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/></svg>',
    'pf-sec-skills': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg>',
    'pf-sec-links': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  };
  const section = (id, title, intro, ...body) => {
    const bodyId = `${id}-body`;
    const summary = h('span', { class: 'pf-summary' });
    summaries[id] = summary;
    const toggle = h(
      'button',
      { type: 'button', class: 'pf-toggle', 'aria-expanded': 'false', 'aria-controls': bodyId },
      h('span', { class: 'pf-icon', 'aria-hidden': 'true' }, svgIcon(SEC_ICONS[id] || ICON_DOC)),
      h('span', { class: 'pf-toggle-text' }, h('h2', {}, title), summary),
      svgIcon(CHEVRON),
    );
    const el = h(
      'section',
      { class: 'pf-section', id },
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
    const { score } = profileStrength(pr);
    const todo = items.filter((x) => !x.done);
    const level = score >= 100 ? 'All-star' : score >= 80 ? 'Almost there' : score >= 50 ? 'Intermediate' : 'Getting started';
    const a = pr.cvAnalysis;
    const cvScore = a ? Math.max(0, Math.min(100, Math.round(Number(a.score) || 0))) : null;
    side.replaceChildren(
      h(
        'section',
        { class: `card strength${todo.length ? ' has-todo' : ''}` },
        h('div', { class: 'st-head' }, h('div', {}, h('p', { class: 'eyebrow' }, 'Profile strength'), h('h2', {}, level)), h('strong', { class: 'st-pct' }, `${score}%`)),
        h('div', { class: 'st-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(score), 'aria-label': 'Profile strength' }, h('span', { style: `width:${score}%` })),
        todo.length
          ? h(
              'div',
              { class: 'st-next' },
              h('p', { class: 'small muted' }, todo.length === 1 ? 'One step left:' : `Next steps (${todo.length} left):`),
              ...todo.slice(0, 3).map((x) => {
                const b = h('button', { type: 'button', class: 'st-step' }, h('span', { class: 'st-plus', 'aria-hidden': 'true' }, '+'), h('span', {}, x.label), svgIcon(ICON_CHEVRON));
                b.addEventListener('click', () => {
                  openSection(x.section, { scroll: true });
                  document.getElementById(x.section)?.querySelector(x.focus || 'input, textarea, button')?.focus({ preventScroll: true });
                });
                return b;
              }),
            )
          : h('p', { class: 'st-done' }, 'Your profile is complete. Vora has everything it needs to find and rank jobs for you.'),
      ),
      cvScore !== null
        ? h(
            'section',
            { class: 'card cv-score' },
            h('div', { class: `ring ring-${cvScore >= 75 ? 'high' : cvScore >= 50 ? 'mid' : 'low'}`, style: `--p:${cvScore}`, role: 'img', 'aria-label': `CV score ${cvScore} out of 100` }, h('strong', {}, String(cvScore))),
            h('div', {}, h('p', { class: 'eyebrow' }, 'CV score'), h('p', { class: 'cvs-verdict' }, a.verdict || ''), a.improvements?.[0] ? h('p', { class: 'small muted' }, `Fix first: ${a.improvements[0]}`) : '', h('a', { class: 'link-btn', href: '#/documents/cv' }, 'Improve it in Documents →')),
          )
        : '',
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
  view.append(header, h('div', { class: 'pf-layout pf2' }, h('div', { class: 'pf-main' }, openTo, h('div', { class: 'card pf-group' }, h('div', { class: 'pf-group-head' }, h('h2', {}, 'Profile details'), saveState), ...sections)), side));
  void nav;
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
