#!/usr/bin/env bash
set -euo pipefail

echo "== VALIDATE CORE FLOWS =="

jid1=$(queuectl enqueue '{"command":"echo basic-ok"}' | awk '{print $3}')
queuectl worker start --count 1 &
sleep 2
queuectl status
queuectl worker stop
sleep 1
queuectl list --state completed | grep -q "$jid1"

jid2=$(queuectl enqueue '{"command":"bash -c '\''exit 1'\''","max_retries":1}' | awk '{print $3}')
queuectl worker start --count 1 &
sleep 5
queuectl worker stop
sleep 1
queuectl dlq list | grep -q "$jid2"

for i in 1 2 3 4; do queuectl enqueue '{"command":"sleep 1"}' >/dev/null; done
queuectl worker start --count 3 &
sleep 5
queuectl worker stop
sleep 1
test "$(queuectl list --state completed | wc -l | tr -d ' ')" -ge 4

jid3=$(queuectl enqueue '{"command":"this_command_does_not_exist_xyz","max_retries":0}' | awk '{print $3}')
queuectl worker start --count 1 &
sleep 3
queuectl worker stop
sleep 1
queuectl dlq list | grep -q "$jid3"

echo "All validations passed."
