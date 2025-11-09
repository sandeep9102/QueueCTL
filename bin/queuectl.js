#!/usr/bin/env node
import { Command } from "commander";
import { enqueue, listJobs, statusSummary, dlqList, dlqRetry } from "../src/queue.js";
import { runSingleWorker, stopWorkers } from "../src/worker.js";
import { getAllConfig, getConfig, setConfig } from "../src/config.js";
import { parseJobInput } from "../src/util.js";
import { fork } from "node:child_process";
import path from "path";
import url from "url";

const program = new Command();
program
  .name("queuectl")
  .description("CLI background job queue with workers, retries, and DLQ.")
  .version("1.0.0");

program
  .command("enqueue")
  .argument("<job-json-or-@file>", "Job JSON or @path/to/file.json")
  .description("Add a new job to the queue")
  .option("--priority <n>", "Job priority (higher first)", "0")
  .option("--run-at <iso>", "Optional ISO time to schedule (delayed jobs)")
  .action((jobStr, opts) => {
    const payload = parseJobInput(jobStr);
    if (!payload.command) {
      console.error("Job must include 'command'.");
      process.exit(1);
    }
    if (opts.priority !== undefined) payload.priority = Number(opts.priority);
    if (opts.runAt) payload.run_at = opts.runAt;

    const id = enqueue(payload);
    console.log(`Enqueued job ${id}`);
  });

const worker = new Command("worker").description("Manage workers");
worker
  .command("start")
  .option("--count <n>", "number of workers", "1")
  .description("Start one or more workers")
  .action(async (opts) => {
    const n = Number(opts.count || 1);
    if (n <= 1 || process.env.QUEUECTL_CHILD === "1") {
      await runSingleWorker();
      return;
    }
    // parent spawns n child workers
    const thisScript = url.fileURLToPath(import.meta.url);
    const pids = [];
    for (let i = 0; i < n; i++) {
      const child = fork(thisScript, ["worker", "start", "--count", "1"], {
        stdio: "inherit",
        env: { ...process.env, QUEUECTL_CHILD: "1" }
      });
      pids.push(child.pid);
    }
    console.log(`Started ${n} workers: ${pids.join(", ")}`);
  });

worker
  .command("stop")
  .description("Stop running workers gracefully")
  .action(() => stopWorkers());

program.addCommand(worker);

program
  .command("status")
  .description("Show summary of all job states & active workers")
  .action(() => {
    const s = statusSummary();
    console.log("=== Status ===");
    const pad = (k) => k.padEnd(10, " ");
    for (const [k, v] of Object.entries(s.counts)) {
      console.log(`${pad(k)}: ${v}`);
    }
    console.log(`workers  : ${s.activeWorkers}`);
  });

program
  .command("list")
  .description("List jobs (optionally by state)")
  .option("--state <state>", "Filter by state (pending|processing|completed|failed|dead)")
  .action((opts) => {
    const rows = listJobs(opts.state);
    if (rows.length === 0) return console.log("No jobs found.");
    for (const r of rows) {
      console.log(`[${r.state}] ${r.id}  cmd="${r.command}"  attempts=${r.attempts}/${r.max_retries}  run_at=${r.run_at}  created=${r.created_at}`);
    }
  });

const dlq = new Command("dlq").description("Dead Letter Queue operations");
dlq
  .command("list")
  .description("List DLQ jobs")
  .action(() => {
    const rows = dlqList();
    if (rows.length === 0) return console.log("DLQ is empty.");
    for (const r of rows) {
      console.log(`[dead] ${r.id}  cmd="\${r.command}" attempts=\${r.attempts}/\${r.max_retries} updated=\${r.updated_at}`);
    }
  });

dlq
  .command("retry")
  .argument("<id>", "Job ID")
  .description("Retry a DLQ job (move back to pending and reset attempts)")
  .action((id) => {
    const c = dlqRetry(id);
    console.log(c ? `Job ${id} moved from DLQ -> pending` : `Job ${id} not found in DLQ`);
  });

program.addCommand(dlq);

const configCmd = new Command("config").description("Manage configuration");
configCmd
  .command("get")
  .argument("[key]", "Config key (if omitted, list all)")
  .action((key) => {
    if (!key) {
      const all = getAllConfig();
      for (const { key: k, value } of all) console.log(`${k}=${value}`);
      return;
    }
    const v = getConfig(key);
    console.log(v === null ? "(not set)" : v);
  });

configCmd
  .command("set")
  .argument("<key>", "Config key")
  .argument("<value>", "Config value")
  .action((key, value) => {
    setConfig(key, value);
    console.log(`Set ${key}=${value}`);
  });

program.addCommand(configCmd);

program.parseAsync(process.argv);
