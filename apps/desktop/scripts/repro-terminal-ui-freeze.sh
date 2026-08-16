#!/usr/bin/env bash
# Repro / verify: UI freeze when session-host backpressure blocks terminal_write
# on the Tauri main thread (RFC 0026).
#
# Forces the session host to stop draining its Unix socket (SIGSTOP), then
# pushes a large terminal write through the automation bridge. Before Phase 1
# the AppKit main thread wedges inside terminal_write; after Phase 1 the UI
# thread stays responsive (eval still works) even while the host is stopped.
#
# Prerequisites:
#   - Silo Dev running with automation (`pnpm dev`) listening on :7878
#   - macOS (uses `sample` optionally; SIGSTOP works on any Unix)
#
# Usage:
#   ./apps/desktop/scripts/repro-terminal-ui-freeze.sh visual  # SEE the freeze
#   ./apps/desktop/scripts/repro-terminal-ui-freeze.sh before  # expect FREEZE (CI)
#   ./apps/desktop/scripts/repro-terminal-ui-freeze.sh after   # expect RESPONSIVE
#   ./apps/desktop/scripts/repro-terminal-ui-freeze.sh detect  # report only
#
# visual mode (closest to "startup then stall"):
#   1. Builds a sandbox workspace + terminal (UI appears).
#   2. Soft-closes it (PTYs stay alive — same as real soft-close).
#   3. Countdown so you can focus Silo Dev.
#   4. Sets StatusBar busy status, stops the host, re-activates, then writes.
#      During the hold, upserts the same busy-status id every second
#      ("Stall probe — Ns left…") so you can see live StatusBar updates.
#   5. Holds so you can poke; press Enter (or wait) to end the probe.
#   6. Clears busy status, kills the host, deletes the sandbox workspace.
#
# Exit codes:
#   0  — mode matched expectation (or detect/visual finished cleanly)
#   1  — expectation failed / setup error
#   2  — automation bridge not reachable

set -euo pipefail

MODE="${1:-detect}"
PORT="${SILO_AUTOMATION_PORT:-7878}"
BASE="http://127.0.0.1:${PORT}"
EVAL_TIMEOUT_SEC="${EVAL_TIMEOUT_SEC:-3}"
PAYLOAD_BYTES="${PAYLOAD_BYTES:-262144}"
SEND_WAIT_SEC="${SEND_WAIT_SEC:-2}"
# visual: seconds to focus Silo Dev before reopen+freeze
COUNTDOWN_SEC="${COUNTDOWN_SEC:-8}"
# visual: how long to leave the window frozen (Enter skips)
HOLD_SEC="${HOLD_SEC:-20}"
WS_NAME="freeze-repro-$$"
BUSY_ID="automation.freeze-repro"
TMP_BODY="/tmp/silo-freeze-sendbody-$$.json"
TMP_SEND="/tmp/silo-freeze-sendtext-$$.txt"
TMP_SAMPLE="/tmp/silo-freeze-sample-$$.txt"

silo() {
  local timeout="${2:-30}"
  curl -sS -m "$timeout" -X POST "$BASE/" \
    -H 'X-Silo-Automation: 1' \
    -H 'Content-Type: application/json' \
    --data "$1"
}

die() { echo "ERROR: $*" >&2; exit 1; }

case "$MODE" in
  before|after|detect|visual) ;;
  -h|--help)
    sed -n '2,35p' "$0" | sed 's/^# \?//'
    exit 0
    ;;
  *)
    die "usage: $0 visual|before|after|detect"
    ;;
esac

echo "== RFC 0026 terminal UI-freeze repro (mode=$MODE) =="

# --- bridge ---
if ! ping_out=$(silo '{"op":"ping"}' 5 2>/dev/null); then
  echo "Automation bridge not reachable at $BASE" >&2
  echo "Start Silo Dev first: pnpm dev" >&2
  exit 2
fi
[[ "$ping_out" == '{"ok":true,"result":"pong"}' ]] || die "unexpected ping: $ping_out"
echo "bridge: ok"

APP_PID=$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -1 || true)
[[ -n "${APP_PID:-}" ]] || die "could not find app PID listening on $PORT"
echo "app_pid: $APP_PID"
ps -p "$APP_PID" -o command= | head -1

# --- sandbox workspace + terminal ---
WS_DIR=$(mktemp -d /tmp/silo-freeze-repro.XXXXXX)
cleanup() {
  local code=$?
  # Prefer KILL over CONT — see recover() comment (payload must not flush into PTY).
  if [[ -n "${HOST_PID:-}" ]] && kill -0 "$HOST_PID" 2>/dev/null; then
    kill -KILL "$HOST_PID" 2>/dev/null || true
  fi
  # Always clear the probe marker so a crashed run doesn't leave StatusBar junk.
  silo "{\"op\":\"clearBusyStatus\",\"args\":{\"id\":\"$BUSY_ID\"}}" 5 >/dev/null 2>&1 || true
  if [[ -n "${WS_ID:-}" ]]; then
    echo "cleanup: deleting sandbox workspace $WS_ID ($WS_NAME)…"
    del_out=$(silo "{\"op\":\"deleteWorkspace\",\"args\":{\"id\":\"$WS_ID\"}}" 15 2>&1) || del_out="DELETE_FAIL:$del_out"
    echo "cleanup: deleteWorkspace → $del_out"
    WS_ID=""
  fi
  rm -rf "$WS_DIR" "$TMP_BODY" "$TMP_SEND" "$TMP_SAMPLE" 2>/dev/null || true
  exit "$code"
}
trap cleanup EXIT

OPEN=$(silo "{\"op\":\"openWorkspace\",\"args\":{\"folder\":\"$WS_DIR\",\"name\":\"$WS_NAME\"}}")
WS_ID=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["result"]["id"])' "$OPEN")
silo "{\"op\":\"activateWorkspace\",\"args\":{\"id\":\"$WS_ID\"}}" >/dev/null
TERM=$(silo "{\"op\":\"openTerminal\",\"args\":{\"cwd\":\"$WS_DIR\",\"workspaceId\":\"$WS_ID\"}}")
TERM_ID=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["result"]["terminalId"])' "$TERM")

# Force-spawn PTY (listTerminals may show empty sessionId until first write).
silo "{\"op\":\"sendText\",\"args\":{\"terminalId\":\"$TERM_ID\",\"text\":\"echo freeze-repro-ready\",\"addNewline\":true}}" >/dev/null
sleep 0.5
# Put something visible in the terminal so the restored UI looks "alive".
silo "{\"op\":\"sendText\",\"args\":{\"terminalId\":\"$TERM_ID\",\"text\":\"printf '%s\\n' '--- watch this workspace ---' && pwd\",\"addNewline\":true}}" >/dev/null
sleep 0.3

LIST=$(silo "{\"op\":\"listTerminals\",\"args\":{\"workspaceId\":\"$WS_ID\"}}")
SESSION_ID=$(python3 -c '
import json,sys
d=json.loads(sys.argv[1]); tid=sys.argv[2]
print(next((t.get("sessionId") or "") for t in d["result"]["terminals"] if t["id"]==tid))
' "$LIST" "$TERM_ID")
[[ -n "$SESSION_ID" ]] || die "no sessionId after spawn; list=$LIST"
HANDLE="silo-${SESSION_ID:0:8}"
# Prefer pgrep — `ps | awk … exit` under `pipefail` returns 141 (SIGPIPE).
HOST_PID=$(pgrep -f "session-host ${HANDLE} " | head -1 || true)
[[ -n "${HOST_PID:-}" ]] || die "no session-host process for $HANDLE"
echo "terminal: $TERM_ID"
echo "session:  $SESSION_ID"
echo "handle:   $HANDLE"
echo "host_pid: $HOST_PID"

base_eval=$(silo '{"op":"eval","args":{"expr":"document.readyState"}}' 5)
[[ "$base_eval" == '{"ok":true,"result":"complete"}' ]] || die "baseline eval failed: $base_eval"
echo "baseline: ping+eval ok"

python3 -c "
import json
body={'op':'sendText','args':{'terminalId':'''$TERM_ID''','text':'x'*$PAYLOAD_BYTES}}
open('''$TMP_BODY''','w').write(json.dumps(body))
print('payload_bytes', $PAYLOAD_BYTES)
"

induce_and_probe() {
  # Fire write in background — before Phase 1 this parks the UI thread.
  (
    start=$(python3 -c 'import time; print(time.time())')
    out=$(curl -sS -m 60 -X POST "$BASE/" \
      -H 'X-Silo-Automation: 1' \
      -H 'Content-Type: application/json' \
      --data @"$TMP_BODY" 2>&1 || echo "CURL_FAIL:$?")
    end=$(python3 -c 'import time; print(time.time())')
    echo "sendText_elapsed=$(python3 -c "print(round($end-$start,3))") out=${out:0:180}" \
      > "$TMP_SEND"
  ) &
  SEND_BG=$!
  sleep "$SEND_WAIT_SEC"

  during_ping=$(silo '{"op":"ping"}' 3 || echo PING_FAIL)
  echo "during_stall ping: $during_ping"

  during_eval_code=0
  during_eval=$(curl -sS -m "$EVAL_TIMEOUT_SEC" -X POST "$BASE/" \
    -H 'X-Silo-Automation: 1' \
    -H 'Content-Type: application/json' \
    --data '{"op":"eval","args":{"expr":"1+1"}}' 2>/dev/null) || during_eval_code=$?

  if [[ "$during_eval_code" -eq 0 && -n "$during_eval" ]]; then
    echo "during_stall eval: $during_eval"
    UI_FROZEN=0
  else
    echo "during_stall eval: TIMED_OUT (curl exit $during_eval_code) — UI thread wedged"
    UI_FROZEN=1
  fi

  if [[ "$UI_FROZEN" -eq 1 ]] && command -v sample >/dev/null; then
    sample "$APP_PID" 1 -f "$TMP_SAMPLE" >/dev/null 2>&1 || true
    if rg -q "terminal_write" "$TMP_SAMPLE" 2>/dev/null; then
      echo "sample: terminal_write present on sampled stacks (expected before Phase 1)"
      rg -n "terminal_write|SocketWriter|UnixStream|write_frame" "$TMP_SAMPLE" | head -8 || true
    else
      echo "sample: no terminal_write symbol (still frozen — stack may differ / stripped)"
    fi
  fi
}

# Recovery must NOT SIGCONT a host that has a huge pending write queued —
# CONT lets ~256KiB of 'x' flush into the shell, which then echoes a storm of
# terminal_output into the webview and the UI locks up again (often with the
# Rust main thread idle — JS/xterm is drowning). Kill the host instead so the
# blocked write fails with EPIPE and nothing is delivered to the PTY.
recover() {
  if kill -0 "$HOST_PID" 2>/dev/null; then
    kill -KILL "$HOST_PID" 2>/dev/null || true
    echo "recovered: SIGKILL session-host (avoid flushing payload into the shell)"
  fi
  HOST_PID="" # cleanup must not CONT a dead pid
  wait "${SEND_BG:-}" 2>/dev/null || true
  if [[ -f "$TMP_SEND" ]]; then
    echo "sendText: $(cat "$TMP_SEND")"
  fi
  sleep 0.5
  after_eval=$(silo '{"op":"eval","args":{"expr":"document.readyState"}}' 5 || echo EVAL_FAIL)
  echo "after_kill eval: $after_eval"
}

if [[ "$MODE" == visual ]]; then
  # Soft-close: UI leaves this workspace; PTY + terminal record survive (like a
  # real soft-close). Then we stop the host and re-activate so you see the
  # workspace paint and *then* hit the stall — same shape as startup restore.
  silo "{\"op\":\"closeWorkspace\",\"args\":{\"id\":\"$WS_ID\"}}" >/dev/null
  echo
  echo "============================================================"
  echo "  FOCUS THE SILO DEV WINDOW NOW"
  echo "  Look for workspace: $WS_NAME"
  echo "  Reopening in ${COUNTDOWN_SEC}s."
  echo "  Watch the StatusBar tick: Stall probe — Ns left…"
  echo "  (same busy-status id upserted every second — proves live updates)."
  echo "  After Phase 1 the window should stay clickable during the hold."
  echo "  You have ${HOLD_SEC}s to poke (or press Enter here to end early)."
  echo "  Sandbox workspace is deleted when the script finishes."
  echo "============================================================"
  echo
  for ((i = COUNTDOWN_SEC; i >= 1; i--)); do
    printf '\r  reopen + stall probe in %2d … ' "$i"
    sleep 1
  done
  printf '\r  starting stall probe now.               \n'

  # Paint the marker *before* stopping the host / large write so you can see
  # StatusBar update while the UI is still healthy.
  silo "{\"op\":\"setBusyStatus\",\"args\":{\"id\":\"$BUSY_ID\",\"label\":\"Stall probe — ${HOLD_SEC}s left…\",\"detail\":\"RFC 0026 visual repro; label upserted each second\",\"urgency\":\"high\"}}" >/dev/null
  # Give React a frame to commit the StatusBar slot.
  sleep 0.3

  kill -STOP "$HOST_PID"
  echo "induced: SIGSTOP on session-host (state=$(ps -p "$HOST_PID" -o state= | tr -d ' '))"

  # Paint the workspace (clears closedAt + activates). Terminal remounts, then
  # the large write exercises backpressure — after Phase 1 off the UI thread.
  silo "{\"op\":\"activateWorkspace\",\"args\":{\"id\":\"$WS_ID\"}}" 5 >/dev/null || true
  sleep 0.4
  induce_and_probe

  echo
  if [[ "${UI_FROZEN:-0}" -eq 1 ]]; then
    echo "Probe active — eval timed out (UI thread wedged). Countdown upserts may stall too."
  else
    echo "Probe active — eval ok. StatusBar should count down each second;"
    echo "try clicking / switching workspaces (should stay responsive)."
  fi
  echo "Press Enter to end the probe early…"
  # Tick the same busy-status id once per second (no host countdown primitive —
  # just repeated set()). `read -t 1` lets Enter skip the rest of the hold.
  set +e
  for ((left = HOLD_SEC; left >= 1; left--)); do
    silo "{\"op\":\"setBusyStatus\",\"args\":{\"id\":\"$BUSY_ID\",\"label\":\"Stall probe — ${left}s left…\",\"detail\":\"RFC 0026 visual repro; label upserted each second\",\"urgency\":\"high\"}}" 3 >/dev/null 2>&1
    read -r -t 1 _
    if [[ $? -eq 0 ]]; then
      echo "ended early by Enter"
      break
    fi
  done
  set -e
  echo
  silo "{\"op\":\"clearBusyStatus\",\"args\":{\"id\":\"$BUSY_ID\"}}" 5 >/dev/null 2>&1 || true
  echo "busy status cleared"
  recover
else
  kill -STOP "$HOST_PID"
  echo "induced: SIGSTOP on session-host (state=$(ps -p "$HOST_PID" -o state= | tr -d ' '))"
  induce_and_probe
  recover
fi

# --- verdict ---
echo
if [[ "$UI_FROZEN" -eq 1 ]]; then
  VERDICT=FROZEN
  echo "VERDICT: FROZEN — ping ok, eval blocked while session-host stopped"
else
  VERDICT=RESPONSIVE
  echo "VERDICT: RESPONSIVE — eval still worked while session-host stopped"
fi

case "$MODE" in
  detect|visual)
    echo "mode=$MODE (no CI expectation); done"
    exit 0
    ;;
  before)
    if [[ "$VERDICT" == FROZEN ]]; then
      echo "PASS (before): freeze reproduced — safe to compare against after-fix run"
      exit 0
    fi
    echo "FAIL (before): expected FROZEN but UI stayed responsive" >&2
    echo "  (already fixed? wrong app binary? payload too small?)" >&2
    exit 1
    ;;
  after)
    if [[ "$VERDICT" == RESPONSIVE ]]; then
      echo "PASS (after): UI stayed responsive under session-host stall — Phase 1 holding"
      exit 0
    fi
    echo "FAIL (after): expected RESPONSIVE but UI froze" >&2
    exit 1
    ;;
esac
