// Accounts and cloud sync.
//
// Inside the Claude app the account IS the viewer's Claude account (the
// `user` capability), and progress is stored in their private cloud space
// (the `db` capability's data/users/<id>/ subtree, which nobody else can read,
// the artifact's owner included). No passwords are created or stored here.
//
// Data is split into small documents so none hits the 256 KiB limit:
//   data/users/<id>/profile             profile + master CV
//   data/users/<id>/settings            model / effort (never the API key)
//   data/users/<id>/feed                home "Jobs for you"
//   data/users/<id>/library/jobs/<job>  one saved job with its CV, letter and game
//
// Sync is last-writer-wins per document. Every local change is time-stamped
// (kept in a separate localStorage key), pushed a moment later, and pulled
// again when the app opens or comes back to the foreground. Deleting a job
// leaves a small tombstone so it does not reappear from another device.

import { store } from './store.js';
import { caps, inArtifact, ready } from './runtime.js';

const STAMPS_KEY = 'ajh:sync';
const PUSH_DELAY = 1500;
const PULL_EVERY = 60 * 1000;

const listeners = new Set();
export const account = {
  status: 'signed-out', // signed-out | working | signed-in | unavailable
  me: null, // { id, name, email, avatarUrl }
  lastSync: 0,
  error: '',
};

function emit() {
  for (const fn of listeners) fn(account);
}
export function onAccountChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------------------------------------------------------------------------
// Local change stamps
// ---------------------------------------------------------------------------

let stamps = loadStamps();
function loadStamps() {
  try {
    return { signedIn: false, at: {}, seen: {}, pushed: {}, ...JSON.parse(localStorage.getItem(STAMPS_KEY) || '{}') };
  } catch {
    return { signedIn: false, at: {}, seen: {}, pushed: {} };
  }
}
function saveStamps() {
  try {
    localStorage.setItem(STAMPS_KEY, JSON.stringify(stamps));
  } catch {}
}

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
  return (h >>> 0).toString(36) + ':' + str.length;
}

// Job ids can contain characters the store does not allow in a path segment.
const docKey = (id) => encodeURIComponent(id).replace(/%/g, '~');

/** The synced sections of local state, keyed. */
function sections(s = store.get()) {
  const { apiKey, keys, ...settings } = s.settings;
  void apiKey; // API keys (Claude's and the other providers') never leave the device
  void keys;
  const out = {
    profile: s.profile,
    settings,
    feed: s.feed,
  };
  for (const id of Object.keys(s.jobs)) {
    out[`job:${id}`] = { id, job: s.jobs[id], docs: s.docs[id] || null, prep: s.prep[id] || null };
  }
  return out;
}

// Stamp every section whose content changed, whether or not the user is signed in.
let trackTimer;
function track() {
  clearTimeout(trackTimer);
  trackTimer = setTimeout(() => {
    const now = Date.now();
    const current = sections();
    let changed = false;
    for (const [key, value] of Object.entries(current)) {
      const h = hash(JSON.stringify(value));
      if (stamps.seen[key] !== h) {
        if (stamps.seen[key] !== undefined) stamps.at[key] = now; // first sight is not a change
        stamps.seen[key] = h;
        changed = true;
      }
    }
    for (const key of Object.keys(stamps.seen)) {
      if (!(key in current)) {
        delete stamps.seen[key];
        stamps.at[key] = now; // deleted locally: remembered for the tombstone
        changed = true;
      }
    }
    if (changed) {
      saveStamps();
      schedulePush();
    }
  }, 300);
}

// ---------------------------------------------------------------------------
// Cloud access
// ---------------------------------------------------------------------------

function refs(uid) {
  const base = `data/users/${uid}`;
  const db = caps.db;
  const jobs = db.doc(`${base}/library`).collection('jobs');
  const ref = (key) =>
    key.startsWith('job:') ? jobs.doc(docKey(key.slice(4))) : db.doc(`${base}/${key}`);
  return { ref, jobs };
}

let pushTimer;
let pushing = null;
function schedulePush() {
  if (account.status !== 'signed-in') return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => push().catch(fail), PUSH_DELAY);
}

async function push() {
  if (account.status !== 'signed-in' || pushing) return pushing;
  pushing = (async () => {
    const { ref } = refs(account.me.id);
    const current = sections();
    const keys = new Set([...Object.keys(current), ...Object.keys(stamps.pushed)]);
    for (const key of keys) {
      if (!(key in current) && !key.startsWith('job:')) continue;
      // Changes made before the first sign-in have no time yet: give them one now.
      const at = stamps.at[key] || (stamps.at[key] = Date.now());
      if (stamps.pushed[key] !== undefined && stamps.pushed[key] >= at) continue;
      if (key in current) await ref(key).set({ data: current[key], at, deleted: false });
      else await ref(key).set({ data: null, at, deleted: true });
      stamps.pushed[key] = at;
      saveStamps();
    }
    account.lastSync = Date.now();
    account.error = '';
    emit();
  })();
  try {
    await pushing;
  } finally {
    pushing = null;
  }
}

async function pull() {
  const uid = account.me.id;
  const { ref, jobs } = refs(uid);
  const [profile, settings, feed, jobSnap] = await Promise.all([ref('profile').get(), ref('settings').get(), ref('feed').get(), jobs.get()]);
  const cloud = {};
  for (const [key, snap] of [['profile', profile], ['settings', settings], ['feed', feed]]) if (snap.exists) cloud[key] = snap.data();
  for (const d of jobSnap.docs) {
    const body = d.data();
    if (body?.data?.id || body?.deleted) cloud[`job:${body?.data?.id ?? decodeURIComponent(d.id.replace(/~/g, '%'))}`] = body;
  }

  const local = sections();
  const apply = [];
  for (const [key, body] of Object.entries(cloud)) {
    const localAt = stamps.at[key] || 0;
    const cloudAt = Number(body.at) || 0;
    if (cloudAt > localAt || (localAt === 0 && !(key in local))) {
      apply.push([key, body]);
    } else if (localAt === 0 && key === 'profile' && key in local) {
      // Untimed local profile (used before signing in): fill its gaps from the cloud.
      apply.push([key, { ...body, data: { ...body.data, ...nonEmpty(local.profile) } }]);
      stamps.at[key] = Date.now();
    }
    stamps.pushed[key] = Math.max(stamps.pushed[key] ?? 0, cloudAt);
  }

  if (apply.length) {
    store.update((s) => {
      for (const [key, body] of apply) {
        if (key === 'profile' && body.data) s.profile = { ...s.profile, ...body.data, prefs: { ...s.profile.prefs, ...(body.data.prefs || {}) } };
        else if (key === 'settings' && body.data) s.settings = { ...s.settings, ...body.data, apiKey: s.settings.apiKey, keys: s.settings.keys };
        else if (key === 'feed') s.feed = body.data;
        else if (key.startsWith('job:')) {
          const id = key.slice(4);
          if (body.deleted) {
            delete s.jobs[id];
            delete s.docs[id];
            delete s.prep[id];
          } else {
            s.jobs[id] = body.data.job;
            if (body.data.docs) s.docs[id] = body.data.docs;
            else delete s.docs[id];
            if (body.data.prep) s.prep[id] = body.data.prep;
            else delete s.prep[id];
          }
        }
      }
    });
    // Mark what we just applied as seen so it is not echoed back as a local change.
    const now = sections();
    for (const [key, body] of apply) {
      if (key in now) stamps.seen[key] = hash(JSON.stringify(now[key]));
      else delete stamps.seen[key];
      if (!stamps.at[key] || Number(body.at) > stamps.at[key]) stamps.at[key] = Number(body.at) || 0;
    }
    saveStamps();
  }
  return apply.length;
}

function nonEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length)) continue;
    out[k] = v;
  }
  return out;
}

function fail(err) {
  console.error(err);
  const code = err?.code;
  account.error =
    code === 'quota_exceeded'
      ? 'Your cloud space is full. Remove some old jobs, then sync again.'
      : code === 'invalid_argument'
        ? 'Saving to your account was refused. You may only have view access to this app.'
        : 'Could not reach your account. Changes are kept on this device and will sync later.';
  emit();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Whether accounts can work in this view at all. */
export function accountsAvailable() {
  return Boolean(inArtifact && caps.db && caps.user);
}

/**
 * Sign in with the viewer's Claude account and start syncing.
 * @returns {Promise<number>} how many items came down from the cloud
 */
export async function signIn() {
  await ready;
  if (!accountsAvailable()) {
    account.status = 'unavailable';
    account.error = inArtifact ? 'Accounts are not available in this view.' : 'Accounts work when you open AI Job Hunter in the Claude app.';
    emit();
    throw new Error(account.error);
  }
  account.status = 'working';
  account.error = '';
  emit();
  const me = await caps.user.me();
  if (!me.id) {
    account.status = 'signed-out';
    account.error = 'Sign in to claude.ai first, then try again.';
    emit();
    throw new Error(account.error);
  }
  account.me = { id: me.id, name: me.name, email: me.email, avatarUrl: me.avatarUrl };
  try {
    track();
    const received = await pull();
    stamps.signedIn = true;
    saveStamps();
    account.status = 'signed-in';
    emit();
    await push();
    return received;
  } catch (err) {
    account.status = stamps.signedIn ? 'signed-in' : 'signed-out';
    fail(err);
    throw err;
  }
}

/** Stop syncing. Optionally remove the data from this device too. */
export function signOut({ wipe = false } = {}) {
  clearTimeout(pushTimer);
  stamps = { signedIn: false, at: {}, seen: {}, pushed: {} };
  saveStamps();
  account.status = 'signed-out';
  account.me = null;
  account.lastSync = 0;
  account.error = '';
  if (wipe) {
    const { apiKey, keys } = store.get().settings;
    store.reset();
    store.update((s) => {
      s.settings.apiKey = apiKey;
      s.settings.keys = keys || {};
    });
  }
  emit();
}

/** Pull then push now. */
export async function syncNow() {
  if (account.status !== 'signed-in') return 0;
  try {
    const received = await pull();
    await push();
    account.lastSync = Date.now();
    emit();
    return received;
  } catch (err) {
    fail(err);
    return 0;
  }
}

/**
 * Start tracking changes, and resume the session if the user signed in before.
 * `onRemoteChange` is called after a pull brought new data, so the page can redraw.
 */
export function initAccount(onRemoteChange) {
  store.subscribe(track);
  track();
  ready.then(async () => {
    if (!stamps.signedIn) {
      account.status = accountsAvailable() ? 'signed-out' : 'unavailable';
      emit();
      return;
    }
    if (!accountsAvailable()) {
      account.status = 'unavailable';
      emit();
      return;
    }
    try {
      const received = await signIn();
      if (received) onRemoteChange?.();
    } catch {}
  });
  let lastPull = Date.now();
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || account.status !== 'signed-in' || Date.now() - lastPull < PULL_EVERY) return;
    lastPull = Date.now();
    const received = await syncNow();
    if (received) onRemoteChange?.();
  });
}
