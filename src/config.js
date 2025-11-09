import { getDb } from "./db.js";

export function getConfig(key) {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM config WHERE key = ?`).get(key);
  return row ? row.value : null;
}

export function setConfig(key, value) {
  const db = getDb();
  db.prepare(`INSERT INTO config(key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, String(value));
}

export function getAllConfig() {
  const db = getDb();
  return db.prepare(`SELECT key, value FROM config ORDER BY key`).all();
}
