// Local-first persistence. Everything lives in the user's browser (localStorage),
// so the app works offline and no account or backend is required.

const KEY = 'ajh:v1';

const DEFAULT_STATE = {
  settings: {
    apiKey: '',
    model: 'claude-opus-5-5',
    effort: 'medium',
    language: 'en',
    // AI provider: 'claude' or one of providers.js (own API key, kept on this device only)
    provider: 'claude',
    keys: {},
    models: {},
  },
  profile: {
    name: '',
    email: '',
    phone: '',
    location: '',
    headline: '',
    targetRoles: '',
    skills: '',
    remoteOnly: false,
    cv: '',
    cvFile: '',
    cvAnalysis: null,
    languages: '',
    linkedin: '',
    portfolio: '',
    github: '',
    photo: '', // small square JPEG as a data URL
    // Job preferences used for search, ranking and cover letters.
    prefs: {
      workModes: [],
      types: [],
      salaryMin: '',
      currency: 'EUR',
      salaryPeriod: 'year',
      availability: '',
      relocate: false,
      authorization: '',
    },
  },
  // Jobs the user has saved, keyed by id. Each carries its tracker status.
  jobs: {},
  // Generated documents keyed by job id: { cv, coverLetter, updatedAt }
  docs: {},
  // Interview prep keyed by job id: { questions, chat: [{role, content}] }
  prep: {},
  // Home page "Jobs for you": { key, at, jobs, roles, location, country }
  feed: null,
  // "About the company" lookups, keyed by company name: { data, at }
  companies: {},
  // Documents page: the main CV and a general cover letter, edited like a Word page.
  // { cvData, template, accent, letter: { body, to, subject, dateLine, template, accent }, updatedAt }
  master: {},
};

export const STATUSES = [
  { id: 'saved', label: 'Saved' },
  { id: 'applied', label: 'Applied' },
  { id: 'interview', label: 'Interview' },
  { id: 'offer', label: 'Offer' },
  { id: 'rejected', label: 'Rejected' },
];

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    return merge(structuredClone(DEFAULT_STATE), JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function merge(base, extra) {
  for (const [k, v] of Object.entries(extra || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') {
      base[k] = merge(base[k], v);
    } else {
      base[k] = v;
    }
  }
  return base;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Could not save state', err);
  }
  for (const fn of listeners) fn(state);
}

export const store = {
  get: () => state,
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  update(mutator) {
    mutator(state);
    persist();
  },
  saveJob(job) {
    this.update((s) => {
      if (!s.jobs[job.id]) {
        s.jobs[job.id] = { ...job, status: 'saved', notes: '', savedAt: Date.now(), history: [] };
      }
    });
    return state.jobs[job.id];
  },
  setStatus(id, status) {
    this.update((s) => {
      const job = s.jobs[id];
      if (!job || job.status === status) return;
      job.status = status;
      job.history = [...(job.history || []), { status, at: Date.now() }];
      if (status === 'applied' && !job.appliedAt) job.appliedAt = Date.now();
    });
  },
  patchJob(id, patch) {
    this.update((s) => {
      if (s.jobs[id]) Object.assign(s.jobs[id], patch);
    });
  },
  removeJob(id) {
    this.update((s) => {
      delete s.jobs[id];
      delete s.docs[id];
      delete s.prep[id];
    });
  },
  exportJSON() {
    return JSON.stringify(state, null, 2);
  },
  importJSON(text) {
    const parsed = JSON.parse(text);
    state = merge(structuredClone(DEFAULT_STATE), parsed);
    persist();
  },
  reset() {
    state = structuredClone(DEFAULT_STATE);
    persist();
  },
};
