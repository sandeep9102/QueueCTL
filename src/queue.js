import { getDb } from "./db.js";
import dayjs from "dayjs";
import { nanoid } from "nanoid";
import fs from "fs";
import path from "path";
import { LOG_DIR } from "./paths.js";

export function enqueue(job) {
  const db = getDb();
  const now = dayjs().toISOString();
  const id = job.id || nanoid();
  const maxRetries = Number(job.max_retries ?? getDefaultMaxRetries());
  const priority = Number(job.priority ?? 0);
  const runAt = job.run_at ? new Date(job.run_at).toISOString() : now;

  db.prepare(`
    INSERT INTO jobs (id, command, state, attempts, max_retries, created_at, updated_at, run_at, priority, output_path)
    VALUES (@id, @command, 'pending', 0, @max_retries, @now, @now, @run_at, @priority, @output_path)
  `).run({
    id,
    command: job.command,
    max_retries: maxRetries,
    now,
    run_at: runAt,
    priority,
    output_path: path.join(LOG_DIR, `${id}.log`)
  });

  return id;
}

function getDefaultMaxRetries() {
  try {
    const { getConfig } = requireShim("./config.js");
    const v = getConfig("max_retries_default");
    return Number(v || 3);
  } catch {
    return 3;
  }
}

function requireShim() { throw new Error("requireShim is not usable in ESM at runtime"); }

export function listJobs(state) {
  const db = getDb();
  if (state) {
    return db.prepare(`SELECT * FROM jobs WHERE state = ? ORDER BY created_at`).all(state);
  }
  return db.prepare(`SELECT * FROM jobs ORDER BY created_at`).all();
}

export function statusSummary() {
  const db = getDb();
  const states = ["pending","processing","completed","failed","dead"];
  const counts = {};
  for (const s of states) {
    counts[s] = db.prepare(`SELECT COUNT(*) as c FROM jobs WHERE state = ?`).get(s).c;
  }
  const activeWorkers = db.prepare(`SELECT COUNT(*) as c FROM workers WHERE status='running'`).get().c;
  return { counts, activeWorkers };
}

export function dlqList() {
  const db = getDb();
  return db.prepare(`SELECT * FROM jobs WHERE state='dead' ORDER BY updated_at DESC`).all();
}

export function dlqRetry(id) {
  const db = getDb();
  const now = dayjs().toISOString();
  const stmt = db.prepare(`
    UPDATE jobs SET state='pending', attempts=0, updated_at=@now, run_at=@now, exit_code=NULL
    WHERE id=@id AND state='dead'
  `);
  const res = stmt.run({ id, now });
  return res.changes;
}

export function claimNextJob() {
  const db = getDb();
  const nowIso = dayjs().toISOString();
  const tx = db.transaction(() => {
    const row = db.prepare(`
      SELECT id FROM jobs
      WHERE state='pending' AND run_at <= @now
      ORDER BY priority DESC, created_at
      LIMIT 1
    `).get({ now: nowIso });
    if (!row) return null;

    const upd = db.prepare(`
      UPDATE jobs SET state='processing', updated_at=@now
      WHERE id=@id AND state='pending'
    `).run({ id: row.id, now: nowIso });

    if (upd.changes === 0) return null;

    const job = db.prepare(`SELECT * FROM jobs WHERE id=?`).get(row.id);
    return job;
  });
  return tx();
}

export function completeJob(id, exitCode) {
  const db = getDb();
  const now = dayjs().toISOString();
  db.prepare(`
    UPDATE jobs SET state='completed', exit_code=@exit, updated_at=@now
    WHERE id=@id
  `).run({ id, now, exit: exitCode });
}

export function failOrRetryJob(job, base) {
  const db = getDb();
  const now = dayjs();
  const attempts = job.attempts + 1;

  if (attempts > job.max_retries) {
    db.prepare(`
      UPDATE jobs
      SET state='dead', attempts=@attempts, updated_at=@now
      WHERE id=@id
    `).run({ id: job.id, attempts, now: now.toISOString() });
    return { state: "dead" };
  }

  const delaySec = Math.pow(base, attempts);
  const nextRun = now.add(delaySec, "second").toISOString();

  db.prepare(`
    UPDATE jobs
    SET state='failed', attempts=@attempts, run_at=@run_at, updated_at=@now
    WHERE id=@id
  `).run({
    id: job.id,
    attempts,
    run_at: nextRun,
    now: now.toISOString()
  });

  return { state: "failed", nextRun };
}

export function ensureLogFile(job) {
  if (!job.output_path) return;
  try {
    if (!fs.existsSync(job.output_path)) {
      fs.writeFileSync(job.output_path, "", "utf8");
    }
  } catch {}
}
