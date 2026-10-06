import { store, STATUSES } from './store.js';
import { searchJobs, SOURCE_IDS, sourceLabel } from './jobs.js';
import * as ai from './ai.js';
import { h, md, toast, copy, download, printDoc, canPrint, confirmButton, fmtDate, debounce } from './ui.js';
import { inArtifact, ready as runtimeReady } from './runtime.js';

const view = document.getElementById('view');
const nav = document.getElementById('nav');

// Search results are transient; only saved jobs are persisted.
const session = {
  query: null,
  results: [],
  scores: {},
  errors: [],
};

function findJob(id) {
  return store.get().jobs[id] || session.results.find((j) => j.id === id);
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
  for (const a of nav.querySelectorAll('a')) {
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

function renderHome() {
  const { jobs, profile } = store.get();
  const all = Object.values(jobs);
  const count = (s) => all.filter((j) => j.status === s).length;
  const recent = all.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)).slice(0, 5);

  const steps = [
    { done: Boolean(profile.cv.trim()), label: 'Add your CV and preferences', href: '#/profile' },
    { done: ai.hasKey(), label: 'Connect AI (API key)', href: '#/settings' },
    { done: all.length > 0, label: 'Find and save a job', href: '#/find' },
    { done: all.some((j) => store.get().docs[j.id]?.cv), label: 'Tailor your CV for a job', href: '#/tracker' },
    { done: count('applied') + count('interview') + count('offer') > 0, label: 'Apply and track it', href: '#/tracker' },
  ];

  view.append(
    h(
      'section',
      { class: 'hero' },
      h('h1', {}, profile.name ? `Hi ${profile.name.split(' ')[0]}, let's land your next role.` : "Let's land your next role."),
      h('p', { class: 'muted' }, 'Find jobs, tailor your CV and cover letter for each one, track every application and prepare for interviews, all in one place.'),
      h(
        'div',
        { class: 'row' },
        h('a', { class: 'btn primary', href: '#/find' }, 'Find jobs'),
        h('a', { class: 'btn', href: '#/add' }, 'Add a job I found'),
      ),
    ),
    h(
      'section',
      { class: 'stats' },
      ...STATUSES.map((s) =>
        h('a', { class: `stat status-${s.id}`, href: '#/tracker' }, h('strong', {}, String(count(s.id))), h('span', {}, s.label)),
      ),
    ),
    h(
      'div',
      { class: 'grid-2' },
      h(
        'section',
        { class: 'card' },
        h('h2', {}, 'Getting started'),
        h(
          'ol',
          { class: 'checklist' },
          ...steps.map((s) => h('li', { class: s.done ? 'done' : '' }, h('a', { href: s.href }, s.label))),
        ),
      ),
      h(
        'section',
        { class: 'card' },
        h('h2', {}, 'Recently saved'),
        recent.length
          ? h(
              'ul',
              { class: 'plain-list' },
              ...recent.map((j) =>
                h(
                  'li',
                  {},
                  h('a', { href: `#/job/${encodeURIComponent(j.id)}` }, h('strong', {}, j.title), h('span', { class: 'muted' }, ` · ${j.company}`)),
                  statusBadge(j.status),
                ),
              ),
            )
          : h('p', { class: 'muted' }, 'Nothing saved yet. Search for jobs or add one you found elsewhere.'),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Find jobs
// ---------------------------------------------------------------------------

function renderFind() {
  const { profile } = store.get();
  const defaults = session.query || {
    query: profile.targetRoles.split(',')[0]?.trim() || '',
    location: '',
    remoteOnly: profile.remoteOnly,
    sources: [...SOURCE_IDS],
  };

  const q = h('input', { type: 'search', placeholder: 'Job title, skill or keyword', value: defaults.query, 'aria-label': 'Keywords' });
  const loc = h('input', { type: 'text', placeholder: 'Location (optional)', value: defaults.location, 'aria-label': 'Location' });
  const remote = h('input', { type: 'checkbox', checked: defaults.remoteOnly });
  const srcBoxes = SOURCE_IDS.map((id) => {
    const cb = h('input', { type: 'checkbox', value: id, checked: defaults.sources.includes(id) });
    return h('label', { class: 'check' }, cb, sourceLabel(id));
  });

  const results = h('div', { class: 'results' });
  const status = h('p', { class: 'muted small', role: 'status' });

  const params = () => ({
    query: q.value,
    location: loc.value,
    remoteOnly: remote.checked,
    sources: srcBoxes.map((l) => l.querySelector('input')).filter((c) => c.checked).map((c) => c.value),
  });

  // Inside the artifact viewer the page cannot reach job boards directly, so
  // live search goes through the viewer's web-search connector instead.
  const webMode = inArtifact;

  async function showExamples() {
    const { jobs } = await searchJobs({ sources: [] });
    session.results = jobs;
    session.scores = {};
    session.errors = [];
    session.examples = true;
    drawResults();
  }

  async function runBoardSearch() {
    const p = params();
    if (!p.sources.length) return toast('Pick at least one job board.');
    session.query = p;
    status.textContent = 'Searching job boards…';
    results.replaceChildren(skeleton());
    const { jobs, errors } = await searchJobs(p);
    session.examples = false;
    session.results = jobs;
    session.scores = {};
    session.errors = errors;
    drawResults();
  }

  const aiStream = h('div', { class: 'ai-output compact', hidden: true });
  const aiBtn = aiButton(webMode ? 'Search jobs' : 'AI web search', {
    variant: '',
    output: aiStream,
    task: async (onText, signal) => {
      const p = params();
      session.query = p;
      aiStream.hidden = false;
      status.textContent = 'Claude is searching the web for openings… this can take a minute.';
      const query = [p.query, p.location && `in ${p.location}`, p.remoteOnly && 'remote only'].filter(Boolean).join(' ');
      const jobs = await ai.aiFindJobs(query, { onText: () => onText('Searching and reading postings…'), signal });
      session.results = jobs;
      session.scores = {};
      session.examples = false;
      session.errors = jobs.length ? [] : ['No postings found'];
      aiStream.hidden = true;
      drawResults();
      return '';
    },
  });

  const scoreBtn = aiButton('Score matches with AI', {
    variant: '',
    task: async (_onText, signal) => {
      if (!store.get().profile.cv.trim()) throw new Error('Add your CV in Profile so matches can be scored.');
      if (!session.results.length) throw new Error('Search first, then score the results.');
      status.textContent = 'Scoring how well each job fits your CV…';
      session.scores = await ai.scoreJobs(session.results, { signal });
      session.results.sort((a, b) => (session.scores[b.id]?.score ?? -1) - (session.scores[a.id]?.score ?? -1));
      drawResults();
      return '';
    },
  });

  function drawResults() {
    const n = session.results.length;
    status.textContent = session.examples
      ? 'These are example listings. Press Search jobs to find live openings.'
      : `${n} job${n === 1 ? '' : 's'} found` + (session.errors.length ? ` · ${session.errors.join(' · ')}` : '');
    if (!n) {
      results.replaceChildren(
        h('div', { class: 'empty' }, h('p', {}, 'No jobs matched. Try broader keywords, or '), h('a', { href: '#/add' }, 'add a job you found elsewhere.')),
      );
      return;
    }
    results.replaceChildren(...session.results.map(jobCard));
  }

  function jobCard(job) {
    const saved = Boolean(store.get().jobs[job.id]);
    const saveBtn = h('button', { class: 'btn small', disabled: saved }, saved ? 'Saved' : 'Save');
    saveBtn.addEventListener('click', () => {
      store.saveJob({ ...job, match: session.scores[job.id] });
      saveBtn.textContent = 'Saved';
      saveBtn.disabled = true;
      toast('Saved to your tracker');
    });
    return h(
      'article',
      { class: 'job-card' },
      h(
        'div',
        { class: 'job-card-head' },
        h('div', {}, h('h3', {}, h('a', { href: `#/job/${encodeURIComponent(job.id)}` }, job.title)), h('p', { class: 'muted' }, [job.company, job.location].filter(Boolean).join(' · '))),
        scorePill(session.scores[job.id]),
      ),
      session.scores[job.id] && h('p', { class: 'small reason' }, session.scores[job.id].reason),
      h('p', { class: 'snippet' }, (job.description || '').slice(0, 260) + ((job.description || '').length > 260 ? '…' : '')),
      h(
        'div',
        { class: 'job-card-foot' },
        h('div', { class: 'tags' }, ...[job.salary, ...(job.tags || [])].filter(Boolean).map((t) => h('span', { class: 'tag' }, t)), h('span', { class: 'tag source' }, job.source)),
        h(
          'div',
          { class: 'row' },
          saveBtn,
          h('a', { class: 'btn small primary', href: `#/job/${encodeURIComponent(job.id)}` }, 'Open'),
        ),
      ),
    );
  }

  const form = h(
    'form',
    { class: 'card search-form' },
    h('div', { class: 'search-row' }, q, loc, webMode ? aiBtn : h('button', { class: 'btn primary', type: 'submit' }, 'Search boards')),
    h(
      'div',
      { class: 'row wrap' },
      h('label', { class: 'check' }, remote, 'Remote only'),
      ...(webMode ? [h('span', { class: 'muted small' }, 'Searches the live web with Claude')] : [h('span', { class: 'muted small' }, 'Boards:'), ...srcBoxes]),
      h('span', { class: 'spacer' }),
      webMode ? '' : aiBtn,
      scoreBtn,
    ),
  );
  if (webMode) {
    aiBtn.classList.add('primary');
    for (const el of [q, loc]) {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          aiBtn.click();
        }
      });
    }
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (webMode) aiBtn.click();
    else runBoardSearch();
  });

  view.append(
    pageHeader(
      'Find jobs',
      webMode
        ? 'Claude searches the web for open roles that fit your profile, then scores how well each one matches your CV.'
        : 'Search free job boards, or let Claude search the whole web for openings that fit your profile.',
    ),
    profileNotice() || '',
    form,
    aiStream,
    status,
    results,
  );

  if (session.results.length) drawResults();
  else if (webMode) showExamples();
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
    ['prep', 'Interview prep'],
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
  function docsTab() {
    const docs = store.get().docs[id] || {};
    panel.append(keyNotice() || '', profileNotice() || '', docSection('Tailored CV', 'cv', docs.cv), docSection('Cover letter', 'coverLetter', docs.coverLetter));
  }

  function docSection(title, key, existing) {
    const out = h('div', { class: 'ai-output doc' });
    const editor = h('textarea', { class: 'doc-editor', rows: 22, hidden: true });
    let text = existing || '';
    const render = () => out.replaceChildren(text ? md(text) : h('p', { class: 'muted' }, 'Nothing generated yet.'));
    render();

    const persist = (value) => {
      text = value;
      ensureSaved();
      store.update((s) => (s.docs[id] = { ...s.docs[id], [key]: value, updatedAt: Date.now() }));
    };

    const tone = h(
      'select',
      { 'aria-label': 'Tone' },
      ...['professional', 'warm and enthusiastic', 'concise and direct', 'formal'].map((t) => h('option', { value: t }, t)),
    );
    const gen = aiButton(existing ? 'Regenerate' : 'Generate', {
      output: out,
      task: (onText, signal) =>
        key === 'cv' ? ai.tailorCV(job, { onText, signal }) : ai.writeCoverLetter(job, { tone: tone.value, onText, signal }),
      onDone: persist,
    });

    const edit = h('button', { class: 'btn small' }, 'Edit');
    edit.addEventListener('click', () => {
      const editing = !editor.hidden;
      if (editing) {
        persist(editor.value);
        render();
        edit.textContent = 'Edit';
      } else {
        editor.value = text;
        edit.textContent = 'Done';
      }
      editor.hidden = editing;
      out.hidden = !editing;
    });
    const cp = h('button', { class: 'btn small' }, 'Copy');
    cp.addEventListener('click', () => (text ? copy(text) : toast('Generate it first')));
    const dl = h('button', { class: 'btn small' }, 'Download');
    dl.addEventListener('click', () => (text ? download(`${slug(job.company)}-${slug(title)}.md`, text) : toast('Generate it first')));
    const pdf = canPrint ? h('button', { class: 'btn small' }, 'Print / PDF') : '';
    if (pdf) pdf.addEventListener('click', () => (text ? printDoc(`${title} – ${job.company}`, md(text)) : toast('Generate it first')));

    return h(
      'section',
      { class: 'card' },
      h('div', { class: 'row space wrap' }, h('h2', {}, title), h('div', { class: 'row wrap' }, key === 'coverLetter' ? tone : '', gen, edit, cp, dl, pdf)),
      out,
      editor,
    );
  }

  // ----- Interview prep -----
  function prepTab() {
    const prep = store.get().prep[id] || {};
    const qs = h('div', { class: 'ai-output' });
    if (prep.questions) qs.replaceChildren(md(prep.questions));
    else qs.replaceChildren(h('p', { class: 'muted' }, 'Generate likely questions, answer outlines from your CV, and questions to ask them.'));
    const qBtn = aiButton(prep.questions ? 'Regenerate' : 'Generate prep guide', {
      output: qs,
      task: (onText, signal) => ai.interviewQuestions(job, { onText, signal }),
      onDone: (text) => {
        ensureSaved();
        store.update((s) => (s.prep[id] = { ...s.prep[id], questions: text }));
      },
    });

    // Mock interview chat
    let chat = prep.chat ? [...prep.chat] : [];
    const log = h('div', { class: 'chat-log', 'aria-live': 'polite' });
    const input = h('textarea', { rows: 3, placeholder: 'Type your answer…' });
    const send = h('button', { class: 'btn primary', type: 'submit' }, 'Send');
    const reset = h('button', { class: 'btn small', type: 'button' }, 'Restart');

    function drawChat(streaming) {
      const visible = chat.filter((m, i) => !(i === 0 && m.role === 'user' && m.content === START));
      log.replaceChildren(
        ...(visible.length || streaming
          ? visible.map((m) => bubble(m.role, m.content))
          : [h('p', { class: 'muted' }, 'Practise with an AI interviewer who asks one question at a time and gives feedback on each answer.')]),
        ...(streaming ? [bubble('assistant', streaming)] : []),
      );
      log.scrollTop = log.scrollHeight;
    }
    const bubble = (role, content) => h('div', { class: `bubble ${role}` }, role === 'assistant' ? md(content) : content);

    async function turn() {
      if (!ai.hasKey()) {
        toast('Add your API key in Settings first.');
        return;
      }
      const signal = newAbort();
      send.disabled = true;
      try {
        const reply = await ai.mockInterviewTurn(job, chat, { onText: (t) => drawChat(t), signal });
        chat.push({ role: 'assistant', content: reply });
        ensureSaved();
        store.update((s) => (s.prep[id] = { ...s.prep[id], chat }));
      } catch (err) {
        if (!signal.aborted) toast(err.message);
        // Drop the unanswered user turn so the history stays valid.
        if (chat.at(-1)?.role === 'user') chat.pop();
      } finally {
        send.disabled = false;
        drawChat();
        input.focus();
      }
    }

    const form = h('form', { class: 'chat-form' }, input, h('div', { class: 'row' }, send, reset));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const answer = input.value.trim();
      if (!chat.length) chat.push({ role: 'user', content: START });
      else if (!answer) return;
      if (answer) chat.push({ role: 'user', content: answer });
      input.value = '';
      drawChat();
      turn();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) form.requestSubmit();
    });
    reset.addEventListener('click', () => {
      currentAbort?.abort();
      chat = [];
      store.update((s) => (s.prep[id] = { ...s.prep[id], chat: [] }));
      drawChat();
      send.textContent = 'Start interview';
    });
    if (!chat.length) send.textContent = 'Start interview';
    form.addEventListener('submit', () => (send.textContent = 'Send'));
    drawChat();

    panel.append(
      keyNotice() || '',
      h('section', { class: 'card' }, h('div', { class: 'row space' }, h('h2', {}, 'Prep guide'), qBtn), qs),
      h('section', { class: 'card' }, h('h2', {}, 'Mock interview'), log, form),
    );
  }

  const header = h(
    'header',
    { class: 'page-header' },
    h(
      'div',
      {},
      h('a', { class: 'back', href: saved() ? '#/tracker' : '#/find' }, '← Back'),
      h('h1', {}, job.title),
      h('p', { class: 'muted' }, [job.company, job.location, job.salary].filter(Boolean).join(' · ')),
    ),
    h('div', { class: 'row' }, job.url ? h('a', { class: 'btn', href: safeUrl(job.url), target: '_blank', rel: 'noopener noreferrer' }, 'View posting ↗') : ''),
  );

  view.append(header, tabBar, panel);
  showTab(tabs.some(([k]) => k === active) ? active : 'overview');
}

const START = "I'm ready. Please start the interview.";

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
    name: h('input', { value: p.name, autocomplete: 'name' }),
    email: h('input', { type: 'email', value: p.email, autocomplete: 'email' }),
    phone: h('input', { type: 'tel', value: p.phone, autocomplete: 'tel' }),
    location: h('input', { value: p.location, placeholder: 'City, country' }),
    headline: h('input', { value: p.headline, placeholder: 'e.g. Full-stack engineer with 6 years in fintech' }),
    targetRoles: h('input', { value: p.targetRoles, placeholder: 'e.g. Frontend Engineer, UI Engineer' }),
    skills: h('input', { value: p.skills, placeholder: 'e.g. React, TypeScript, Node, AWS' }),
    remoteOnly: h('input', { type: 'checkbox', checked: p.remoteOnly }),
    cv: h('textarea', { rows: 20, placeholder: 'Paste your full CV / résumé as plain text. The more detail, the better the tailoring.' }, p.cv),
  };

  const fileInput = h('input', { type: 'file', accept: '.txt,.md,text/plain,text/markdown', hidden: true });
  const loadBtn = h('button', { class: 'btn small', type: 'button' }, 'Load from .txt/.md');
  loadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (file) inputs.cv.value = await file.text();
  });

  const form = h(
    'form',
    { class: 'card form' },
    h('div', { class: 'grid-2' }, field('Full name', inputs.name), field('Location', inputs.location), field('Email', inputs.email), field('Phone', inputs.phone)),
    field('Headline', inputs.headline),
    h('div', { class: 'grid-2' }, field('Target roles', inputs.targetRoles, 'Comma-separated; the first one pre-fills job search.'), field('Key skills', inputs.skills)),
    h('label', { class: 'check' }, inputs.remoteOnly, 'I only want remote roles'),
    h('div', { class: 'row space' }, h('h2', {}, 'Master CV'), h('div', {}, loadBtn, fileInput)),
    inputs.cv,
    h('p', { class: 'muted small' }, 'Tip: for a PDF or Word CV, open it, select all, copy and paste here.'),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit' }, 'Save profile')),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    store.update((s) => {
      for (const [k, el] of Object.entries(inputs)) s.profile[k] = el.type === 'checkbox' ? el.checked : el.value.trim();
    });
    toast('Profile saved');
  });

  view.append(pageHeader('Your profile', 'This is what the AI uses to match, tailor and prepare you. It stays on this device.'), form);
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
