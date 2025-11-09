import Database from "better-sqlite3";
import { DB_PATH } from "./paths.js";

let db;
export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    initialize(db);
  }
  return db;
}

function initialize(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      command TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('pending','processing','completed','failed','dead')),
      attempts INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      run_at TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      exit_code INTEGER,
      output_path TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_state_runat ON jobs(state, run_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_priority ON jobs(priority DESC, created_at);

    CREATE TABLE IF NOT EXISTS workers (
      pid INTEGER PRIMARY KEY,
      started_at TEXT NOT NULL,
      last_heartbeat TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('running','stopping','stopped'))
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const defaults = [
    ["max_retries_default", "3"],
    ["backoff_base", "2"],
    ["job_timeout_sec", "0"]
  ];
  const insert = db.prepare(`INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)`);
  for (const [k, v] of defaults) insert.run(k, v);
}
