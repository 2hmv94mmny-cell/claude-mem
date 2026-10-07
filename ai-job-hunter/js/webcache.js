// A cache in front of the web-search connector. Exa bills every call, and the
// home feed, "more jobs for you", a search and its "also matching your CV"
// section often ask exactly the same thing. The same call (same tool, same
// arguments) within its time window is answered from this device instead,
// and two identical calls running at once share one request.
//
// Stored in IndexedDB (results are too big for localStorage); when that is
// not available the cache lives in memory for the visit.

const TTL = { web_search_exa: 12 * 60 * 60 * 1000, web_fetch_exa: 24 * 60 * 60 * 1000 };
const MAX_ENTRIES = 400;
const DB_NAME = 'vora-cache';
const STORE = 'calls';

const memory = new Map(); // key -> { at, value }
const inFlight = new Map(); // key -> Promise
let freshFrom = 0; // answers stored before this moment are ignored

/** Ignore everything cached so far (the Refresh button: new postings now). */
export function skipCachedUntilNow() {
  freshFrom = Date.now();
}

let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

async function idb(mode, fn) {
  const d = await db();
  if (!d) return undefined;
  return new Promise((resolve) => {
    try {
      const tx = d.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = tx.onabort = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

async function read(key) {
  const hit = memory.get(key) || (await idb('readonly', (s) => s.get(key)));
  if (hit) memory.set(key, hit);
  return hit;
}

let writes = 0;
async function write(key, entry) {
  memory.set(key, entry);
  await idb('readwrite', (s) => s.put(entry, key));
  // Now and then drop the oldest answers so the cache stays small.
  if (++writes % 25 === 0) {
    const all = (await idb('readonly', (s) => s.getAll())) || [];
    const keys = (await idb('readonly', (s) => s.getAllKeys())) || [];
    if (keys.length > MAX_ENTRIES) {
      const old = keys.map((k, i) => [k, all[i]?.at || 0]).sort((a, b) => a[1] - b[1]).slice(0, keys.length - MAX_ENTRIES);
      await idb('readwrite', (s) => old.forEach(([k]) => s.delete(k)));
      old.forEach(([k]) => memory.delete(k));
    }
  }
}

const stable = (v) => (Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v));

/** Wrap a connector so repeated calls are answered from the cache. */
export function withCache(mcp) {
  if (!mcp) return mcp;
  return {
    ...mcp,
    async callTool(server, tool, args, opts) {
      const ttl = TTL[tool];
      if (!ttl) return mcp.callTool(server, tool, args, opts);
      const key = `${server}|${tool}|${stable(args)}`;
      const hit = await read(key);
      if (hit && hit.at >= freshFrom && Date.now() - hit.at < ttl) return hit.value;
      if (!inFlight.has(key)) {
        // Shared by every caller, so one caller cancelling does not cancel the others.
        const p = mcp
          .callTool(server, tool, args)
          .then(async (value) => {
            try {
              await write(key, { at: Date.now(), value: JSON.parse(JSON.stringify(value)) });
            } catch {}
            return value;
          })
          .finally(() => inFlight.delete(key));
        inFlight.set(key, p);
      }
      const shared = inFlight.get(key);
      const signal = opts?.signal;
      if (!signal) return shared;
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      return new Promise((resolve, reject) => {
        const stop = () => reject(new DOMException('Aborted', 'AbortError'));
        signal.addEventListener('abort', stop, { once: true });
        shared.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
      });
    },
  };
}
