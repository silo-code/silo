#!/usr/bin/env bash
# Plant a synthetic transcript into the load-test Chat session.
# The dev app MUST be stopped — see README.md ("The one non-obvious constraint").
set -euo pipefail

TURNS="${1:-48}"
WS_ID="${WS_ID:-ws_8ac003cd-f838-4520-bb06-e40fee2743c3}"
SID="${SID:-355c5104-f06e-47ea-aec2-d434da2fa031}"
J="$HOME/.config/silo-dev/workspaces/$WS_ID/chat-sessions/$SID.jsonl"

if curl -s -m3 -X POST http://127.0.0.1:7878/ \
     -H 'X-Silo-Automation: 1' -H 'Content-Type: application/json' \
     --data '{"op":"ping"}' | grep -q pong; then
  echo "refusing: the dev app is running — its journal writer will overwrite this." >&2
  echo "quit Silo Dev first, then re-run." >&2
  exit 1
fi

node "$(dirname "$0")/gen-journal.mjs" --turns "$TURNS" --out "$J"
echo "planted -> $J"
