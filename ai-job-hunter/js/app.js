import { store, STATUSES } from './store.js';
import { searchJobs, SOURCE_IDS } from './jobs.js';
import * as ai from './ai.js';
import { h, md, toast, copy, download, confirmButton, fmtDate, debounce } from './ui.js';
import { inArtifact, ready as runtimeReady } from './runtime.js';
import { portalsFor } from './portals.js';
import { styleIssues, cvProse } from './style.js';
import { renderInterviewGame } from './game.js';
import { readCVFile, ACCEPT } from './files.js';
import { cvToText, cvFromProfile } from './cvdoc.js';
import { TEMPLATES, getTemplate, accentFor, renderCV, cvPDFDefinition, letterPDFDefinition, makePDF } from './templates.js';

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

function feedInputs() {
  const p = store.get().profile;
  const roles = p.targetRoles.split(',').map((r) => r.trim()).filter(Boolean).slice(0, 2);
  const location = p.location.trim();
  const remote = Boolean(p.remoteOnly);
  const hasExperience = Boolean(p.cv.trim() || roles.length || p.headline.trim());
  // Changes to any of these mean the feed should be rebuilt.
  const key = JSON.stringify([roles, location.toLowerCase(), remote, p.headline.trim(), p.cv.length, p.cv.slice(0, 300)]);
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
    let roles = given;
    if (!roles.length && store.get().profile.cv.trim()) roles = await ai.suggestRoles();
    if (!roles.length && store.get().profile.headline.trim()) roles = [store.get().profile.headline.trim()];
    if (!roles.length) throw new Error('Add your CV or target roles in Profile first.');
    const { jobs, country } = await ai.searchEverywhere({ query: roles.join(' or '), location, remoteOnly: remote }, { rank: true });
    store.update((s) => (s.feed = { key, at: Date.now(), jobs: jobs.slice(0, 12), roles, location: remote ? 'Remote' : location, country }));
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

function feedSection() {
  const { location, remote, hasExperience, key } = feedInputs();
  const feed = store.get().feed;
  const where = remote ? 'remote' : location;
  const head = (sub, ...actions) =>
    h('div', { class: 'feed-head' }, h('div', {}, h('h2', {}, where ? `Jobs for you ${remote ? '(remote)' : `in ${location}`}` : 'Jobs for you'), sub && h('p', { class: 'muted small' }, sub)), actions.length ? h('div', { class: 'row' }, ...actions) : '');
  const prompt = (text, href, label) => h('section', { class: 'card feed' }, head(''), h('div', { class: 'feed-empty' }, h('p', {}, text), h('a', { class: 'btn primary', href }, label)));

  if (!hasExperience) return prompt('Upload your CV and Claude will find jobs near you that fit your experience.', '#/profile', 'Upload your CV');
  if (!location && !remote) return prompt('Add your city in your profile to see jobs near you.', '#/profile', 'Add your location');
  if (!ai.hasKey()) {
    return prompt(
      inArtifact ? 'Allow this page to use Claude when it asks, then reload to see jobs picked for you.' : 'Add an API key in Settings to see jobs picked for you.',
      inArtifact ? '#/' : '#/settings',
      inArtifact ? 'Reload' : 'Open Settings',
    );
  }

  if (feedNeedsRefresh() && !feedRun && feedError?.key !== key) runFeed();

  const refresh = h('button', { class: 'btn small', type: 'button', disabled: Boolean(feedRun) }, feedRun ? 'Searching…' : 'Refresh');
  refresh.addEventListener('click', () => {
    feedError = null;
    runFeed();
    route();
  });

  const fresh = feed && feed.key === key;
  if (feedRun && !fresh) {
    return h(
      'section',
      { class: 'card feed' },
      head(`Searching the job portals${where ? ` for ${where}` : ''} and matching what you find against your experience. This takes about a minute.`),
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
    session.results = feed.jobs;
    session.scores = Object.fromEntries(feed.jobs.filter((j) => j.match).map((j) => [j.id, j.match]));
    session.examples = false;
    session.errors = [];
    session.filter = '';
    session.query = { query: feed.roles[0] || '', location: feed.location === 'Remote' ? '' : feed.location, remoteOnly: feed.location === 'Remote', sources: [...SOURCE_IDS] };
    go('/find');
  });

  return h(
    'section',
    { class: 'card feed' },
    head(`Based on your experience as ${feed.roles.join(' or ')}${feedRun ? ' · updating…' : ` · updated ${timeAgo(feed.at)}`}`, refresh, seeAll),
    h('div', { class: 'feed-grid' }, ...feed.jobs.slice(0, 6).map(feedCard)),
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
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    onSubmit({ query: q.value.trim(), location: l.value.trim() });
  });
  return { form, q, l, submit };
}

function profileStrength(p) {
  const parts = [
    [Boolean(p.cv.trim()), 40, 'Upload your CV'],
    [Boolean(p.location.trim()), 15, 'Add your location'],
    [Boolean(p.targetRoles.trim()), 15, 'Add the roles you want'],
    [Boolean(p.skills.trim()), 10, 'List your key skills'],
    [Boolean(p.headline.trim()), 10, 'Write a one-line headline'],
    [Boolean(p.email.trim() || p.phone.trim()), 10, 'Add contact details'],
  ];
  const score = parts.reduce((s, [ok, w]) => s + (ok ? w : 0), 0);
  const next = parts.find(([ok]) => !ok)?.[2] || '';
  return { score, next };
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
      session.results.sort((a, b) => (session.scores[b.id]?.score ?? -1) - (session.scores[a.id]?.score ?? -1));
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

  async function aiSearch() {
    const p = params();
    session.query = p;
    bar.submit.disabled = true;
    bar.submit.textContent = 'Searching…';
    results.replaceChildren(skeleton());
    detail.replaceChildren(h('div', { class: 'detail-empty' }, 'Searching job sites…'));
    status.textContent = `Searching job sites${p.location ? ` in ${p.location}` : ''}. This usually takes under a minute.`;
    const ctl = newAbort();
    try {
      const { jobs } = await ai.searchEverywhere(p, { onText: (t) => (status.textContent = t), signal: ctl.signal, rank: Boolean(store.get().profile.cv.trim()) });
      session.results = jobs;
      session.scores = Object.fromEntries(jobs.filter((j) => j.match).map((j) => [j.id, j.match]));
      session.examples = false;
      session.filter = '';
      session.selected = jobs[0]?.id;
      session.errors = jobs.length ? [] : ['No open postings found for this search'];
    } catch (err) {
      if (ctl.signal.aborted) return;
      session.errors = [err.message];
    } finally {
      bar.submit.disabled = false;
      bar.submit.textContent = 'Search';
    }
    drawResults();
  }

  async function runBoardSearch() {
    const p = params();
    session.query = p;
    status.textContent = 'Searching free job boards…';
    results.replaceChildren(skeleton());
    const { jobs, errors } = await searchJobs(p);
    session.examples = false;
    session.results = jobs;
    session.scores = {};
    session.errors = errors;
    session.filter = '';
    session.selected = jobs[0]?.id;
    drawResults();
  }

  async function showExamples() {
    const { jobs } = await searchJobs({ sources: [] });
    session.results = jobs;
    session.scores = {};
    session.errors = [];
    session.examples = true;
    session.selected = jobs[0]?.id;
    drawResults();
  }

  function drawResults() {
    const all = session.results;
    const counts = new Map();
    for (const j of all) counts.set(j.source, (counts.get(j.source) || 0) + 1);
    if (session.filter && !counts.has(session.filter)) session.filter = '';
    const shown = session.filter ? all.filter((j) => j.source === session.filter) : all;

    const n = all.length;
    status.textContent = session.examples
      ? 'Example listings. Search to see live openings near you.'
      : session.errors.length && !n
        ? session.errors.join(' · ')
        : `${n} job${n === 1 ? '' : 's'}${counts.size > 1 ? ` from ${counts.size} sites` : ''}${Object.keys(session.scores).length ? ', best match first' : ''}` +
          (session.errors.length ? ` · ${session.errors.join(' · ')}` : '');

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

    if (!shown.length) {
      results.replaceChildren(h('div', { class: 'empty card' }, h('p', {}, 'No jobs to show. Try broader keywords, or open one of the job sites below.')));
      detail.replaceChildren(h('div', { class: 'detail-empty' }, 'Pick a job to see the details here.'));
      return;
    }
    if (!shown.some((j) => j.id === session.selected)) session.selected = shown[0].id;
    results.replaceChildren(...shown.map(jobCard));
    drawDetail();
  }

  function select(job) {
    session.selected = job.id;
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
      job.posted ? h('span', {}, job.posted) : '',
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
    if (!job) return detail.replaceChildren(h('div', { class: 'detail-empty' }, 'Pick a job to see the details here.'));
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
  else if (inArtifact || ai.hasKey()) showExamples();
  else runBoardSearch();
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
      if (!docs().cvData || document.querySelector('.studio')) return;
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
      pdf.addEventListener('click', () => downloadCV(pdf));
      const close = h('button', { type: 'button', class: 'btn small studio-close', 'aria-label': 'Close' }, '← Back');
      const studio = h(
        'div',
        { class: 'studio', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Your CV' },
        h(
          'header',
          { class: 'studio-bar' },
          close,
          h('div', { class: 'studio-title' }, h('strong', {}, 'Your CV'), h('span', {}, [job.title, job.company].filter(Boolean).join(' at '))),
          h('div', { class: 'studio-actions' }, zoomBtn, pdf),
        ),
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

      function renderPaper() {
        const d = docs();
        const t = getTemplate(template());
        paperScale.replaceChildren(renderCV(d.cvData, t.id, accent()));
        pdf.textContent = `Download PDF · ${t.name}`;
        requestAnimationFrame(fit);
      }

      // Panel tabs
      const TABS = [
        ['template', 'Template'],
        ['changes', 'What changed'],
        ['edit', 'Edit'],
      ];
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
      const gallery = h('div', { class: 'tpl-gallery studio-gallery', role: 'group', 'aria-label': 'CV template' });
      function drawPane() {
        const d = docs();
        const cv = d.cvData;
        const t = getTemplate(template());
        if (tab === 'template') {
          if (thumbsFor !== cv) {
            thumbsFor = cv;
            gallery.replaceChildren(
              ...TEMPLATES.map((x) => {
                const b = h(
                  'button',
                  { type: 'button', class: 'tpl-card', 'data-id': x.id, 'aria-label': `${x.name} template` },
                  h('div', { class: 'tpl-thumb', 'aria-hidden': 'true' }, renderCV(cv, x.id, x.accent)),
                  h('strong', {}, x.name),
                  h('span', { class: `tpl-badge ${x.ats ? '' : 'warn'}` }, x.ats ? 'ATS friendly' : 'Less ATS friendly'),
                );
                b.addEventListener('click', () => {
                  saveDoc({ template: x.id });
                  refresh();
                });
                return b;
              }),
            );
          }
          for (const b of gallery.children) b.setAttribute('aria-pressed', String(b.dataset.id === t.id));
          pane.replaceChildren(
            gallery,
            h('p', { class: 'tpl-info' }, h('strong', {}, `${t.name}. `), t.blurb),
            t.accents
              ? h(
                  'div',
                  { class: 'swatches', role: 'group', 'aria-label': 'Colour' },
                  h('span', { class: 'muted small' }, 'Colour'),
                  ...t.accents.map((c) => {
                    const sw = h('button', { type: 'button', class: 'swatch', style: `background:${c}`, 'aria-label': `Colour ${c}`, 'aria-pressed': String(accent() === c) });
                    sw.addEventListener('click', () => {
                      saveDoc({ accent: c });
                      refresh();
                    });
                    return sw;
                  }),
                )
              : '',
          );
        } else if (tab === 'changes') {
          pane.replaceChildren(
            h(
              'div',
              { class: 'cv-notes' },
              ...(cv.changes?.length ? [h('h3', {}, 'What changed for this job'), h('ul', {}, ...cv.changes.map((c) => h('li', {}, c)))] : [h('p', { class: 'muted' }, 'No change notes for this version.')]),
              ...(cv.keywords?.length ? [h('h3', {}, 'Keywords covered'), h('div', { class: 'tags' }, ...cv.keywords.map((k) => h('span', { class: 'tag' }, k)))] : []),
              writingCheck(cvProse(cv), (phrases, signal) =>
                rework(`Rewrite only the lines that use these phrases: ${phrases.join(', ')}. Use plain, specific wording a person would use about their own work, and no dashes as punctuation. Keep everything else the same.`, signal, 'Rewording those lines…'),
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
              await rework(instructions, signal, 'Updating your CV…');
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
      }

      async function rework(instructions, signal, message) {
        busy.hidden = false;
        busy.firstChild.textContent = message;
        try {
          const cvData = await ai.tailorCV(job, { instructions, previous: docs().cvData, signal });
          saveDoc({ cvData, cv: cvToText(cvData) });
          refresh();
        } finally {
          busy.hidden = true;
        }
      }

      function refresh() {
        renderPaper();
        drawTabs();
        drawPane();
        draw();
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
        if (!panelRoot.isConnected) {
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

    const panelRoot = h('section', { class: 'card' }, h('h2', {}, 'Tailored CV'), status, body);
    draw();
    return panelRoot;
  }

  function letterSection() {
    const out = h('div', { class: 'ai-output doc' });
    const editor = h('textarea', { class: 'doc-editor', rows: 18, hidden: true });
    const check = h('div');
    const render = () => {
      const letter = docs().coverLetter;
      out.replaceChildren(letter ? md(letter) : h('p', { class: 'muted' }, 'A specific, human-sounding letter for this role, built from your CV.'));
      check.replaceChildren(
        letter
          ? writingCheck(letter, async (phrases, signal) => {
              saveDoc({ coverLetter: await ai.reviseLetter(job, letter, phrases, { signal }) });
              render();
            })
          : '',
      );
    };
    render();

    const tone = h('select', { 'aria-label': 'Tone' }, ...['professional', 'warm and enthusiastic', 'concise and direct', 'formal'].map((t) => h('option', { value: t }, t)));
    const gen = aiButton(docs().coverLetter ? 'Rewrite' : 'Write cover letter', {
      output: out,
      task: (onText, signal) => ai.writeCoverLetter(job, { tone: tone.value, onText, signal }),
      onDone: (text) => {
        saveDoc({ coverLetter: text });
        render();
      },
    });

    const edit = h('button', { class: 'btn small', type: 'button' }, 'Edit');
    edit.addEventListener('click', () => {
      const editing = !editor.hidden;
      if (editing) {
        saveDoc({ coverLetter: editor.value });
        render();
        edit.textContent = 'Edit';
      } else {
        editor.value = docs().coverLetter || '';
        edit.textContent = 'Done';
      }
      editor.hidden = editing;
      out.hidden = !editing;
    });
    const need = (fn) => () => (docs().coverLetter ? fn(docs().coverLetter) : toast('Write the letter first'));
    const cp = h('button', { class: 'btn small', type: 'button' }, 'Copy');
    cp.addEventListener('click', need((t) => copy(t)));
    const pdfBtn = h('button', { class: 'btn small', type: 'button' }, 'Download PDF');
    pdfBtn.addEventListener(
      'click',
      need((t) => savePDF(letterPDFDefinition(docs().cvData || cvFromProfile(store.get().profile), t, template(), accent()), `${fileBase()}-cover-letter.pdf`, pdfBtn)),
    );

    return h(
      'section',
      { class: 'card' },
      h('div', { class: 'row space wrap' }, h('h2', {}, 'Cover letter'), h('div', { class: 'row wrap' }, tone, gen, edit, cp, pdfBtn)),
      out,
      editor,
      check,
    );
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

function renderProfile() {
  const p = store.get().profile;
  const inputs = {
    name: h('input', { id: 'pf-name', value: p.name, autocomplete: 'name' }),
    email: h('input', { id: 'pf-email', type: 'email', value: p.email, autocomplete: 'email' }),
    phone: h('input', { id: 'pf-phone', type: 'tel', value: p.phone, autocomplete: 'tel' }),
    location: h('input', { id: 'pf-location', value: p.location, placeholder: 'City, country' }),
    headline: h('input', { id: 'pf-headline', value: p.headline, placeholder: 'e.g. Full-stack engineer with 6 years in fintech' }),
    targetRoles: h('input', { id: 'pf-roles', value: p.targetRoles, placeholder: 'e.g. Frontend Engineer, UI Engineer' }),
    skills: h('input', { id: 'pf-skills', value: p.skills, placeholder: 'e.g. React, TypeScript, Node, AWS' }),
    remoteOnly: h('input', { id: 'pf-remote', type: 'checkbox', checked: p.remoteOnly }),
    cv: h('textarea', { id: 'pf-cv', rows: 16, placeholder: 'Upload your CV above, or paste it here as plain text.' }, p.cv),
  };

  // ----- Upload + analysis -----
  const fileInput = h('input', { id: 'cv-file', type: 'file', accept: ACCEPT, hidden: true });
  const fileStatus = h('p', { class: 'small muted', role: 'status' }, p.cvFile ? `Current CV: ${p.cvFile}` : 'PDF, Word (.docx), text, or a photo of your CV.');
  const analysisBox = h('div', { class: 'analysis' });
  const drop = h(
    'div',
    { class: 'dropzone', tabindex: '0', role: 'button', 'aria-label': 'Upload your CV' },
    h('strong', {}, p.cvFile ? 'Upload a new version' : 'Upload your CV'),
    h('span', { class: 'muted small' }, 'Drop a file here or tap to choose'),
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
      if (text) inputs.cv.value = text;
      store.update((s) => {
        s.profile.cvFile = file.name;
        if (text) s.profile.cv = text;
      });
      fileStatus.textContent = text
        ? `Read ${file.name} (${text.split(/\s+/).length} words). Check the text below and fix anything that came out wrong.`
        : `${file.name} is an image or a scan, so Claude will read it.`;
      if (ai.hasKey()) runAnalysis();
      else if (!text) fileStatus.textContent += ' Add an API key in Settings so Claude can read it.';
    } catch (err) {
      console.error(err);
      fileStatus.textContent = err.message || 'Could not read that file. Try a PDF or Word file.';
    }
  }

  const analyzeBtn = aiButton(p.cvAnalysis ? 'Analyse again' : 'Analyse my CV', {
    variant: '',
    task: async (onText, signal) => {
      await analyse(signal);
      return '';
    },
  });

  function runAnalysis() {
    analyzeBtn.click();
  }

  async function analyse(signal) {
    const text = inputs.cv.value.trim();
    if (!text && !pendingImages.length) throw new Error('Upload or paste your CV first.');
    analysisBox.replaceChildren(h('p', { class: 'muted' }, 'Claude is reading your CV…'));
    const result = await ai.analyzeCV({ text: pendingImages.length ? '' : text, images: pendingImages }, { signal });
    const filled = [];
    store.update((s) => {
      if (result.cvText && !text) {
        s.profile.cv = String(result.cvText);
        inputs.cv.value = s.profile.cv;
      }
      for (const [k, v] of Object.entries(result.profile || {})) {
        if (k in inputs && v && !String(s.profile[k] || '').trim() && typeof v === 'string') {
          s.profile[k] = v.trim();
          inputs[k].value = v.trim();
          filled.push(k);
        }
      }
      s.profile.cvAnalysis = { ...result, cvText: undefined, at: Date.now() };
    });
    pendingImages = [];
    drawAnalysis();
    if (filled.length) toast('Filled in your profile from the CV');
  }

  function drawAnalysis() {
    const a = store.get().profile.cvAnalysis;
    if (!a) {
      analysisBox.replaceChildren();
      return;
    }
    const list = (title, items, cls) =>
      items?.length ? h('div', { class: `analysis-list ${cls}` }, h('h3', {}, title), h('ul', {}, ...items.map((x) => h('li', {}, String(x))))) : '';
    const score = Math.max(0, Math.min(100, Number(a.score) || 0));
    const level = score >= 75 ? 'high' : score >= 50 ? 'mid' : 'low';
    analysisBox.replaceChildren(
      h(
        'div',
        { class: 'analysis-head' },
        h('div', { class: `score-big score-${level}` }, h('strong', {}, String(score)), h('span', {}, '/100')),
        h('div', {}, h('h3', {}, 'CV review'), h('p', {}, a.verdict || '')),
      ),
      h('div', { class: 'analysis-grid' }, list('Strengths', a.strengths, 'good'), list('Improve', a.improvements, 'fix'), list('Applicant tracking systems', a.atsIssues, 'warn')),
      h('p', { class: 'muted small' }, 'When you apply, open the job and use "CV & cover letter" to get a redesigned CV written for that role.'),
    );
  }
  drawAnalysis();

  const form = h(
    'form',
    { class: 'card form' },
    h('h2', {}, 'Details'),
    h('div', { class: 'grid-2' }, field('Full name', inputs.name), field('Location', inputs.location, 'Used to find jobs near you.'), field('Email', inputs.email), field('Phone', inputs.phone)),
    field('Headline', inputs.headline),
    h('div', { class: 'grid-2' }, field('Target roles', inputs.targetRoles, 'Comma-separated; the first one pre-fills job search.'), field('Key skills', inputs.skills)),
    h('label', { class: 'check' }, inputs.remoteOnly, 'I only want remote roles'),
    h('h2', {}, 'CV text'),
    inputs.cv,
    h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit' }, 'Save profile')),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    store.update((s) => {
      for (const [k, el] of Object.entries(inputs)) s.profile[k] = el.type === 'checkbox' ? el.checked : el.value.trim();
    });
    toast('Profile saved');
  });

  view.append(
    pageHeader('Your profile', 'Upload your CV and Claude reviews it, fills in your details, and uses it to tailor every application. It stays on this device.'),
    h('section', { class: 'card' }, h('div', { class: 'row space wrap' }, h('h2', {}, 'Your CV'), analyzeBtn), drop, fileInput, fileStatus, analysisBox),
    form,
  );
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

  const form = h(
    'form',
    { class: 'card form' },
    h('h2', {}, 'AI'),
    ai.usingViewerClaude()
      ? h('p', { class: 'notice' }, 'AI features run on your Claude account here, so no API key is needed. The key and model settings below apply when you run the app outside Claude.')
      : '',
    field('Anthropic API key', key, 'Get one at console.anthropic.com. Stored only in this browser and sent only to api.anthropic.com.'),
    h('div', { class: 'grid-2' }, field('Model', model), field('Effort', effort, 'Higher effort gives more thorough results but takes longer.')),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit' }, 'Save settings')),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    store.update((st) => {
      st.settings.apiKey = key.value.trim();
      st.settings.model = model.value;
      st.settings.effort = effort.value;
    });
    toast('Settings saved');
  });

  const exp = h('button', { class: 'btn' }, 'Export backup');
  exp.addEventListener('click', () => {
    const data = JSON.parse(store.exportJSON());
    data.settings.apiKey = '';
    download(`ai-job-hunter-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
  });
  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  const imp = h('button', { class: 'btn' }, 'Import backup');
  imp.addEventListener('click', () => fileIn.click());
  fileIn.addEventListener('change', async () => {
    const file = fileIn.files[0];
    if (!file) return;
    try {
      const apiKey = store.get().settings.apiKey;
      store.importJSON(await file.text());
      if (!store.get().settings.apiKey) store.update((st) => (st.settings.apiKey = apiKey));
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

  view.append(
    pageHeader('Settings'),
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
  toast('Installed! Find AI Job Hunter on your home screen.');
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

route();
// In the artifact viewer, capabilities arrive a moment after load: redraw
// once they do so AI and web search light up.
if (inArtifact) runtimeReady.then((c) => (c.sample || c.mcp) && route());
