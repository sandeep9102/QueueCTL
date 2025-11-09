# queuectl

A **CLI-based background job queue** with **multi-process workers**, **exponential backoff retries**, and a **Dead Letter Queue (DLQ)**. Built with **Node.js** and **SQLite** (via `better-sqlite3`) for safe concurrency and persistence.

## ✨ Features

- Enqueue shell commands as jobs (e.g. `sleep 2`, `echo hello`)
- Multiple workers with **atomic job claiming** (no duplicate processing)
- **Exponential backoff**: `delay = base ^ attempts` (seconds)
- **DLQ** for permanently failed jobs + `dlq retry <id>`
- Durable persistence using SQLite (WAL mode)
- Configurable `backoff_base`, default `max_retries`, and optional `job_timeout_sec`
- **Graceful shutdown** (`worker stop`) – finishes current job then exits
- **Job output logging** to `~/.queuectl/logs/<jobId>.log`

---

## 🧰 Requirements

- Node.js >= 18
- macOS/Linux (Windows via WSL recommended)

---

## 🚀 Quick Start

```bash
# 1) Install dependencies
npm install

# 2) Make the CLI available in your PATH (optional but recommended)
npm link
# (Alternatively, run with: node bin/queuectl.js ...)

# 3) Configure defaults
queuectl config set backoff_base 2
queuectl config set max_retries_default 3
queuectl config set job_timeout_sec 0

# 4) Start workers
queuectl worker start --count 2 &

# 5) Enqueue jobs
queuectl enqueue '{"command":"echo Hello && sleep 1 && echo World"}'

# 6) Check status and lists
queuectl status
queuectl list
queuectl dlq list

# 7) Stop workers
queuectl worker stop
```

---

## 📦 Usage

### Enqueue

```bash
queuectl enqueue '{"command":"echo Hello World","max_retries":3}'
# or from a file:
queuectl enqueue @job.json

# Optional flags
queuectl enqueue '{"command":"sleep 5"}' --priority 10 --run-at "2025-11-04T10:30:00Z"
```

### Workers

```bash
queuectl worker start --count 3
queuectl worker stop
```

### Status & Jobs

```bash
queuectl status
queuectl list
queuectl list --state pending
queuectl list --state completed
```

### DLQ

```bash
queuectl dlq list
queuectl dlq retry <jobId>
```

### Config

```bash
queuectl config get
queuectl config get backoff_base
queuectl config set backoff_base 2
queuectl config set max_retries_default 3
queuectl config set job_timeout_sec 0
```

---

## 🔄 Job Lifecycle

States:
- `pending` → waiting for worker
- `processing` → executing
- `completed` → success
- `failed` → failed but scheduled for retry (exponential backoff)
- `dead` → permanently failed (DLQ)

**Exponential backoff**: `next_run = now + (base ^ attempts)` seconds.  
If `attempts > max_retries`, the job moves to **DLQ**.

---

## 🧱 Architecture Overview

- **SQLite** ensures safe concurrent access across worker processes with transactional **job claiming**:
  - Workers atomically transition `pending → processing` inside a transaction.
- **Workers**:
  - Maintain heartbeat in `workers` table.
  - Handle `SIGTERM` → stop claiming new jobs, finish current job, mark status as `stopped`.
  - Execute commands via `child_process.spawn` with optional `job_timeout_sec`.
- **Persistence**:
  - All job metadata persists in `~/.queuectl/queuectl.db`.
  - Logs are written to `~/.queuectl/logs/<jobId>.log`.

---

## 🧪 Validation

Run the demo and core flow checks:

```bash
npm run demo
npm run validate
```

What the validation checks:
1. Basic job completes.
2. Failing job retries and moves to DLQ after max retries.
3. Multiple workers process jobs without overlap.
4. Invalid command fails and is DLQ’d if no retries.
5. Persistence across runs (implicit via SQLite).

---

## 📝 Assumptions & Trade-offs

- Uses SQLite (WAL) for simplicity and strong local consistency.
- DLQ implemented as `state='dead'` within the same `jobs` table.
- Priority supported via integer `priority` (higher first).
- Scheduling supported via `run_at`.
- Timeout is global (per job execution) via config.

---

## 🧰 Tables

- `jobs(id, command, state, attempts, max_retries, created_at, updated_at, run_at, priority, exit_code, output_path)`
- `workers(pid, started_at, last_heartbeat, status)`
- `config(key, value)`

---

## 📹 Demo

Record a short demo showing:
- Enqueue (success & failure)
- Start workers
- Status/list
- DLQ list + retry
- Logs tailing (`tail -f ~/.queuectl/logs/<jobId>.log`)

Upload to Drive and add the link here.

---
