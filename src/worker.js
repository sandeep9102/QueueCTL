import { claimNextJob, completeJob, failOrRetryJob, ensureLogFile } from "./queue.js";
import { getDb } from "./db.js";
import dayjs from "dayjs";
import { spawn } from "child_process";
import fs from "fs";
import { getConfig } from "./config.js";

export async function runSingleWorker() {
  await workerLoop();
}

export function stopWorkers() {
  const db = getDb();
  const rows = db.prepare(`SELECT pid FROM workers WHERE status='running'`).all();
  if (rows.length === 0) {
    console.log("No running workers.");
    return;
  }
  for (const { pid } of rows) {
    try { process.kill(pid, "SIGTERM"); } catch {}
  }
  console.log(`Signaled ${rows.length} workers to stop (graceful).`);
}

async function workerLoop() {
  const db = getDb();
  const pid = process.pid;
  const now = dayjs().toISOString();

  db.prepare(`
    INSERT OR REPLACE INTO workers(pid, started_at, last_heartbeat, status)
    VALUES (@pid, @now, @now, 'running')
  `).run({ pid, now });

  let stopping = false;
  process.on("SIGTERM", () => { stopping = true; db.prepare(`UPDATE workers SET status='stopping' WHERE pid=?`).run(pid); });

  const hb = setInterval(() => {
    db.prepare(`UPDATE workers SET last_heartbeat=?, status=? WHERE pid=?`).run(dayjs().toISOString(), stopping ? "stopping" : "running", pid);
  }, 2000);

  try {
    while (true) {
      if (stopping) break;

      const job = claimNextJob();
      if (!job) {
        await sleep(500);
        continue;
      }

      ensureLogFile(job);
      const timeoutSec = Number(getConfig("job_timeout_sec") || "0");
      const backoffBase = Number(getConfig("backoff_base") || "2");

      const result = await runCommand(job.command, job.output_path, timeoutSec);
      if (result.ok) {
        completeJob(job.id, result.exitCode ?? 0);
      } else {
        failOrRetryJob(job, backoffBase);
      }
    }
  } finally {
    clearInterval(hb);
    db.prepare(`UPDATE workers SET status='stopped', last_heartbeat=? WHERE pid=?`).run(dayjs().toISOString(), pid);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function runCommand(command, logPath, timeoutSec) {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true });

    const write = (chunk) => {
      if (!logPath) return;
      try { fs.appendFileSync(logPath, chunk); } catch {}
    };

    child.stdout.on("data", write);
    child.stderr.on("data", write);

    let timedOut = false;
    let timer = null;
    if (timeoutSec > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        try { child.kill("SIGTERM"); } catch {}
        setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 500);
      }, timeoutSec * 1000);
    }

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (timedOut) {
        write(`\n[queuectl] Job timed out after ${timeoutSec}s\n`);
        resolve({ ok: false, exitCode: null });
      } else {
        resolve({ ok: code === 0, exitCode: code });
      }
    });
  });
}

export { workerLoop }; // for tests if needed
