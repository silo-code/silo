#!/usr/bin/env bash
set -euo pipefail

PORT=7878
SILO_DEV_PID=36779

silo() {
  curl -s -m30 -X POST "http://127.0.0.1:$PORT/" \
    -H 'X-Silo-Automation: 1' -H 'Content-Type: application/json' \
    --data "$1"
}

count_acp_children() {
  ps ax -o pid,ppid,args \
    | awk -v ppid="$SILO_DEV_PID" '$2==ppid && /claude-agent-acp|cursor-agent.*acp/' \
    | wc -l | tr -d ' '
}

list_acp_children() {
  ps ax -o pid,ppid,args \
    | awk -v ppid="$SILO_DEV_PID" '$2==ppid && /claude-agent-acp|cursor-agent.*acp/' || true
}

close_newest_chat_tab() {
  silo '{"op":"eval","args":{"expr":"const tabs=[...document.querySelectorAll(\".dv-tab\")];const chat=[...tabs].reverse().find(t=>t.textContent.includes(\"Claude Code\")||t.textContent.includes(\"chat\"));const btn=chat?.querySelector(\".dv-default-tab-action\");if(btn){btn.click();\"clicked:\"+chat.textContent.trim().slice(0,30)}else\"no chat tab — tabs:\"+tabs.map(t=>t.textContent.trim().slice(0,20)).join(\"|\")"}}'
}

echo "=== ACP Leak Stress Test ==="
echo "Silo Dev PID: $SILO_DEV_PID"
echo ""

BASELINE=$(count_acp_children)
echo "ACP children before: $BASELINE"
list_acp_children | sed 's/^/  /'
echo ""

for i in 1 2 3 4 5; do
  echo "Cycle $i/5"

  OPEN=$(silo '{"op":"exec","args":{"command":"core.newAgent.claude-chat"}}')
  echo "  open:  $OPEN"
  sleep 0.7  # let useEffect fire + connect() start (handshake in flight)

  CLOSE=$(close_newest_chat_tab)
  echo "  close: $CLOSE"
  sleep 0.5
done

echo ""
echo "Waiting 4s for cleanup..."
sleep 4

AFTER=$(count_acp_children)
echo ""
echo "ACP children after: $AFTER"
list_acp_children | sed 's/^/  /'

echo ""
echo "=== Result ==="
echo "Before: $BASELINE  After: $AFTER"
if [ "$AFTER" -le "$BASELINE" ]; then
  echo "PASS -- no new leaks"
else
  LEAKED=$(( AFTER - BASELINE ))
  echo "FAIL -- $LEAKED new orphan(s) leaked"
fi
