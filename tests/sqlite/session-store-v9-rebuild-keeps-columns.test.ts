// The v9 observations rebuild (makeObservationsTextNullable) recreated the
// table from a fixed column list and copied only those columns, so a database
// whose observations table still had `text NOT NULL` next to a later column
// (v11's discovery_tokens, here) lost that column's values: the column itself
// came back from ensureDiscoveryTokensColumn, but every row read 0. Same class
// as #3890 (v7 session_summaries) and #3849 (v21), which already carry live
// columns over.
import { describe, it, expect, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { SessionStore } from '../../src/services/sqlite/SessionStore.js';

const ISO = '2025-07-01T00:00:00.000Z';
const EPOCH = 1751328000000;

function seedDbWithNotNullTextAndDiscoveryTokens(dbPath: string): void {
  const db = new Database(dbPath);
  db.run('PRAGMA foreign_keys = OFF');
  db.run(`
    CREATE TABLE schema_versions (
      id INTEGER PRIMARY KEY,
      version INTEGER UNIQUE NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE sdk_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_session_id TEXT NOT NULL,
      memory_session_id TEXT UNIQUE,
      project TEXT NOT NULL,
      platform_source TEXT NOT NULL DEFAULT 'claude',
      user_prompt TEXT,
      started_at TEXT NOT NULL,
      started_at_epoch INTEGER NOT NULL,
      completed_at TEXT,
      completed_at_epoch INTEGER,
      status TEXT CHECK(status IN ('active', 'completed', 'failed')) NOT NULL DEFAULT 'active'
    )
  `);
  db.run(`
    CREATE TABLE observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_session_id TEXT NOT NULL,
      project TEXT NOT NULL,
      text TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT,
      subtitle TEXT,
      facts TEXT,
      narrative TEXT,
      concepts TEXT,
      files_read TEXT,
      files_modified TEXT,
      prompt_number INTEGER,
      discovery_tokens INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      created_at_epoch INTEGER NOT NULL,
      FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  db.run(`
    CREATE TABLE session_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_session_id TEXT NOT NULL,
      project TEXT NOT NULL,
      request TEXT,
      investigated TEXT,
      learned TEXT,
      completed TEXT,
      next_steps TEXT,
      files_read TEXT,
      files_edited TEXT,
      notes TEXT,
      prompt_number INTEGER,
      discovery_tokens INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      created_at_epoch INTEGER NOT NULL,
      FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  // v9 is NOT stamped, so the text-nullable rebuild runs.
  for (const version of [4, 5, 6, 7, 8, 11]) {
    db.prepare('INSERT INTO schema_versions (version, applied_at) VALUES (?, ?)').run(version, ISO);
  }
  db.prepare(`
    INSERT INTO sdk_sessions (content_session_id, memory_session_id, project, started_at, started_at_epoch, status)
    VALUES ('content-a', 'mem-a', 'proj-a', ?, ?, 'completed')
  `).run(ISO, EPOCH);
  db.prepare(`
    INSERT INTO observations (memory_session_id, project, text, type, title, discovery_tokens, created_at, created_at_epoch)
    VALUES ('mem-a', 'proj-a', 'body', 'discovery', 'costly observation', 42, ?, ?)
  `).run(ISO, EPOCH);
  db.run('PRAGMA foreign_keys = ON');
  db.close();
}

describe('observations v9 rebuild keeps post-v9 columns', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('carries discovery_tokens values over the text-nullable rebuild', () => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'claude-mem-v9-columns-'));
    const dbPath = path.join(tempDir, 'claude-mem.db');
    seedDbWithNotNullTextAndDiscoveryTokens(dbPath);

    const store = new SessionStore(dbPath);
    try {
      // The rebuild ran: text is nullable now ...
      const textColumn = (store.db.query('PRAGMA table_info(observations)').all() as Array<{ name: string; notnull: number }>)
        .find(col => col.name === 'text');
      expect(textColumn?.notnull).toBe(0);

      // ... and the post-v9 column kept its value.
      const row = store.db.prepare(
        `SELECT discovery_tokens FROM observations WHERE title = 'costly observation'`
      ).get() as { discovery_tokens: number };
      expect(row.discovery_tokens).toBe(42);
    } finally {
      store.db.close();
    }
  });
});
