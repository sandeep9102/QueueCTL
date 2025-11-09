#!/usr/bin/env bash
set -euo pipefail

echo "== DEMO: queuectl =="
queuectl config set backoff_base 2
queuectl config set max_retries_default 3
queuectl config set job_timeout_sec 0

echo "Enqueue a success job:"
queuectl enqueue '{"command":"echo Hello && sleep 1 && echo World"}'

echo "Enqueue a failing job:"
queuectl enqueue '{"command":"bash -c '\''exit 1'\''","max_retries":2}'

echo "Start 2 workers:"
queuectl worker start --count 2 &

sleep 5
echo "Status after 5s:"
queuectl status

echo "List all jobs:"
queuectl list

echo "DLQ list (if any):"
queuectl dlq list || true

echo "Stopping workers:"
queuectl worker stop
