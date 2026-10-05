// A single observation whose concepts / files_read / files_modified is not
// valid JSON (a legacy row, a sync replica's raw field string, an import that
// carried a bare path) made every json_each reader throw "malformed JSON", so
// one bad row took down file and concept filters for the whole database. The
// v49 migration (normalizeConceptTags) and getObservationsByFilePath already
// treat invalid-JSON rows as a domain state to skip; the search readers now do
// the same.
import { describe, it, expect, afterEach } from 'bun:test';
import { SessionStore } from '../../../src/services/sqlite/SessionStore.js';
import { SessionSearch } from '../../../src/services/sqlite/SessionSearch.js';

describe('search filters skip observations with invalid-JSON list columns', () => {
  let store: SessionStore;
  afterEach(() => store?.close());

  function seed(suffix: string, file: string, concept: string): number {
    const sid = `memory-${suffix}`;
    const id = store.createSDKSession(`content-${suffix}`, 'project', 'prompt');
    store.ensureMemorySessionIdRegistered(id, sid);
    return store.storeObservation(sid, 'project', {
      type: 'discovery', title: suffix, subtitle: null, narrative: 'body', facts: [],
      concepts: [concept], files_read: [file], files_modified: [],
    }, 1).id;
  }

  function seedWithCorruptLists(): { good: number; bad: number } {
    store = new SessionStore(':memory:');
    const good = seed('good', 'src/app.ts', 'gotcha');
    const bad = seed('bad', 'src/other.ts', 'other');
    store.db.prepare(
      'UPDATE observations SET concepts = ?, files_read = ?, files_modified = ? WHERE id = ?'
    ).run('gotcha: not json', 'src/app.ts', 'src/app.ts', bad);
    return { good, bad };
  }

  it('findByFile and the files filter return the valid rows instead of throwing', () => {
    const { good } = seedWithCorruptLists();
    const search = new SessionSearch(store.db);

    expect(search.findByFile('src/app.ts', { project: 'project' }).observations.map(row => row.id)).toEqual([good]);
    expect(search.findByFile('/repo/src', { project: 'project', isFolder: true }).observations.map(row => row.id)).toEqual([good]);
    expect(search.searchObservations(undefined, { project: 'project', files: ['src/app.ts'] }).map(row => row.id)).toEqual([good]);
  });

  it('the concepts filter returns the valid rows instead of throwing', () => {
    const { good } = seedWithCorruptLists();
    const search = new SessionSearch(store.db);

    expect(search.searchObservations(undefined, { project: 'project', concepts: ['gotcha'] }).map(row => row.id)).toEqual([good]);
  });

  it('getObservationsByIds hydration filters skip the invalid rows', () => {
    const { good, bad } = seedWithCorruptLists();

    expect(store.getObservationsByIds([good, bad], { files: ['src/app.ts'] }).map(row => row.id)).toEqual([good]);
    expect(store.getObservationsByIds([good, bad], { concepts: ['gotcha'] }).map(row => row.id)).toEqual([good]);
  });
});
