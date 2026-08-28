#!/usr/bin/env bash
# Repro / verify: false "Process exited" when the app's data client drops but
# the session-host (and shell) stay alive.
#
# Default trigger (METHOD=evict): open a second Data client on the session
# socket. Under MAX_DATA_CLIENTS=1 the daemon evicts the live UI client → app
# reader EOF → overlay "Process exited (code 0)" while the host stays up.
# Same end state as the prod OpenCode incident (instatic, 2026-08-28).
#
# METHOD=silent-hold: connect, read T_HELLO, send nothing for >FG_CLASSIFY_TIMEOUT
# (100ms). Pre-fix: daemon defaulted the quiet socket to Data and evicted the UI
# client (maintenance-sweep race). Post-fix: quiet peer is ignored; UI stays up.
# Host log pre-fix: evicted prior client (cap) (+ often ring-replay drop).
#
# Optional trigger (METHOD=stall): SIGSTOP the *app* while the PTY floods
# (`yes`), hoping host→app broadcast hits the 1s write deadline. Flakier on
# macOS (large socket buffers); kept for exploring the write-timeout path.
# (Inverse of repro-terminal-ui-freeze.sh, which SIGSTOPs the session-host.)
#
# Observed prod signature:
#   terminal.log:  exit … reason=eof   (no matching kill)
#   host log:      client detached  (and/or evicted prior client)
#   UI:            "Process exited (code 0) / Session ended…"
#   ps:            session-host + shell still alive
#   workspace switch does NOT recover (panel stays mounted in exited state);
#   app restart does (fresh attach).
#
# Dev note: forced eviction reliably reproduces eof + live host + dead UI
# (terminal-host loses --active; switch does not heal). The prod "Session
# ended" overlay text is not always painted in Dev — panel often goes blank
# instead. Still counts as FALSE_EXIT for before/detect.
#
# Prerequisites:
#   - Silo Dev running with automation (`pnpm dev`) listening on :7878
#   - macOS
#
# Usage:
#   ./apps/desktop/scripts/repro-terminal-false-exit.sh detect
#   ./apps/desktop/scripts/repro-terminal-false-exit.sh visual
#   ./apps/desktop/scripts/repro-terminal-false-exit.sh before   # expect FALSE_EXIT (unfixed)
#   ./apps/desktop/scripts/repro-terminal-false-exit.sh after    # expect RECOVERED (fixed)
#
# Env:
#   METHOD=evict|silent-hold|stall   default evict
#   HOLD_SEC=3             stall only: how long app stays SIGSTOP'd
#   SILENT_HOLD_SEC=0.25   silent-hold: quiet connect duration (must be >0.1s)
#   SETTLE_SEC=1           wait after trigger before probing
#   KEEP_WORKSPACE=1       skip deleteWorkspace so you can poke the overlay
#   SILO_AUTOMATION_PORT=7878
#
# Exit codes:
#   0  — mode matched expectation (or detect/visual finished)
#   1  — expectation failed / setup error
#   2  — automation bridge not reachable

set -euo pipefail

MODE="${1:-detect}"
PORT="${SILO_AUTOMATION_PORT:-7878}"
BASE="http://127.0.0.1:${PORT}"
METHOD="${METHOD:-evict}"
HOLD_SEC="${HOLD_SEC:-5}"
SETTLE_SEC="${SETTLE_SEC:-2}"
COUNTDOWN_SEC="${COUNTDOWN_SEC:-5}"
VISUAL_HOLD_SEC="${VISUAL_HOLD_SEC:-15}"
KEEP_WORKSPACE="${KEEP_WORKSPACE:-0}"
WS_NAME="false-exit-repro-$$"
PARK_NAME="false-exit-park-$$"
BUSY_ID="automation.false-exit-repro"
DEV_LOG="${HOME}/Library/Application Support/com.silo.desktop.dev/logs/terminal.log"
EVICT_HOLD_SEC="${EVICT_HOLD_SEC:-2}"
SILENT_HOLD_SEC="${SILENT_HOLD_SEC:-0.25}"

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
    sed -n '2,50p' "$0" | sed 's/^# \?//'
    exit 0
    ;;
  *)
    die "usage: $0 detect|visual|before|after"
    ;;
esac

case "$METHOD" in
  evict|silent-hold|stall) ;;
  *) die "METHOD must be evict|silent-hold|stall (got $METHOD)" ;;
esac

echo "== false Process-exited repro (mode=$MODE method=$METHOD) =="

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

LOG_MARK=$(python3 -c 'import time; print(int(time.time()*1000))')
echo "log_mark_ms: $LOG_MARK"

WS_DIR=""
PARK_DIR=""
WS_ID=""
PARK_ID=""
HOST_PID=""
APP_STOPPED=0
EVICT_PID=""

cleanup() {
  local code=$?
  if [[ -n "${EVICT_PID:-}" ]] && kill -0 "$EVICT_PID" 2>/dev/null; then
    kill "$EVICT_PID" 2>/dev/null || true
    wait "$EVICT_PID" 2>/dev/null || true
  fi
  if [[ "$APP_STOPPED" -eq 1 ]] && kill -0 "$APP_PID" 2>/dev/null; then
    kill -CONT "$APP_PID" 2>/dev/null || true
    APP_STOPPED=0
    echo "cleanup: SIGCONT app (was still stopped)"
  fi
  silo "{\"op\":\"clearBusyStatus\",\"args\":{\"id\":\"$BUSY_ID\"}}" 5 >/dev/null 2>&1 || true
  if [[ "$KEEP_WORKSPACE" != "1" ]]; then
    if [[ -n "${WS_ID:-}" ]]; then
      echo "cleanup: deleting sandbox workspace ${WS_ID} (${WS_NAME})..."
      del_out=$(silo "{\"op\":\"deleteWorkspace\",\"args\":{\"id\":\"$WS_ID\"}}" 15 2>&1) || del_out="DELETE_FAIL:$del_out"
      echo "cleanup: deleteWorkspace -> $del_out"
      WS_ID=""
    fi
    if [[ -n "${PARK_ID:-}" ]]; then
      echo "cleanup: deleting park workspace ${PARK_ID}..."
      silo "{\"op\":\"deleteWorkspace\",\"args\":{\"id\":\"$PARK_ID\"}}" 15 >/dev/null 2>&1 || true
      PARK_ID=""
    fi
  else
    echo "cleanup: KEEP_WORKSPACE=1 — left ${WS_NAME} (${WS_ID}) for inspection"
  fi
  rm -rf "${WS_DIR:-}" "${PARK_DIR:-}" 2>/dev/null || true
  exit "$code"
}
trap cleanup EXIT

WS_DIR=$(mktemp -d /tmp/silo-false-exit-repro.XXXXXX)
PARK_DIR=$(mktemp -d /tmp/silo-false-exit-park.XXXXXX)

OPEN=$(silo "{\"op\":\"openWorkspace\",\"args\":{\"folder\":\"$WS_DIR\",\"name\":\"$WS_NAME\"}}")
WS_ID=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["result"]["id"])' "$OPEN")
silo "{\"op\":\"activateWorkspace\",\"args\":{\"id\":\"$WS_ID\"}}" >/dev/null
TERM=$(silo "{\"op\":\"openTerminal\",\"args\":{\"cwd\":\"$WS_DIR\",\"workspaceId\":\"$WS_ID\"}}")
TERM_ID=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["result"]["terminalId"])' "$TERM")

silo "{\"op\":\"sendText\",\"args\":{\"terminalId\":\"$TERM_ID\",\"text\":\"echo false-exit-repro-ready\",\"addNewline\":true}}" >/dev/null
sleep 0.5

LIST=$(silo "{\"op\":\"listTerminals\",\"args\":{\"workspaceId\":\"$WS_ID\"}}")
SESSION_ID=$(python3 -c '
import json,sys
d=json.loads(sys.argv[1]); tid=sys.argv[2]
print(next((t.get("sessionId") or "") for t in d["result"]["terminals"] if t["id"]==tid))
' "$LIST" "$TERM_ID")
[[ -n "$SESSION_ID" ]] || die "no sessionId after spawn; list=$LIST"
HANDLE="silo-${SESSION_ID:0:8}"
HOST_PID=$(pgrep -f "session-host ${HANDLE} " | head -1 || true)
[[ -n "${HOST_PID:-}" ]] || die "no session-host process for $HANDLE"
echo "terminal: $TERM_ID"
echo "session:  $SESSION_ID"
echo "handle:   $HANDLE"
echo "host_pid: $HOST_PID"

# Wait until the panel has finished attach and registered onExit — otherwise
# we race automation's ensureSession spawn and only observe a stuck loading
# panel, not the false-exit path.
echo -n "waiting for terminal ready"
for _ in $(seq 1 50); do
  ready=$(silo '{"op":"eval","args":{"expr":"[...document.querySelectorAll(\".dock-host[data-active=\\\"true\\\"] .terminal-host\")].some(h=>h.classList.contains(\"terminal-host--active\"))"}}' 5 2>/dev/null || echo fail)
  if [[ "$ready" == '{"ok":true,"result":true}' ]]; then
    echo " — ready"
    break
  fi
  echo -n "."
  sleep 0.2
done
if [[ "$ready" != '{"ok":true,"result":true}' ]]; then
  die "terminal never became ready (panel onExit not registered yet)"
fi

HOST_LOG=$(find "${TMPDIR:-/tmp}" /var/folders -path "*/silo-pty/dev/${HANDLE}.log" 2>/dev/null | head -1 || true)
SOCK=$(find "${TMPDIR:-/tmp}" /var/folders -path "*/silo-pty/dev/${HANDLE}.sock" 2>/dev/null | head -1 || true)
echo "host_log: ${HOST_LOG:-"(missing)"}"
echo "sock:     ${SOCK:-"(missing)"}"
[[ -n "$SOCK" && -S "$SOCK" ]] || die "session sock not found for $HANDLE"

base_eval=$(silo '{"op":"eval","args":{"expr":"document.readyState"}}' 5)
[[ "$base_eval" == '{"ok":true,"result":"complete"}' ]] || die "baseline eval failed: $base_eval"
echo "baseline: ping+eval ok"

PARK=$(silo "{\"op\":\"openWorkspace\",\"args\":{\"folder\":\"$PARK_DIR\",\"name\":\"$PARK_NAME\"}}")
PARK_ID=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["result"]["id"])' "$PARK")
silo "{\"op\":\"activateWorkspace\",\"args\":{\"id\":\"$WS_ID\"}}" >/dev/null

if [[ "$MODE" == visual ]]; then
  echo
  echo "============================================================"
  echo "  FOCUS SILO DEV — workspace: $WS_NAME"
  echo "  Trigger ($METHOD) in ${COUNTDOWN_SEC}s."
  echo "  Watch for: Process exited / Session ended overlay."
  echo "============================================================"
  echo
  for ((i = COUNTDOWN_SEC; i >= 1; i--)); do
    printf '\r  trigger in %2d … ' "$i"
    sleep 1
  done
  printf '\r  inducing false exit now.        \n'
fi

silo "{\"op\":\"setBusyStatus\",\"args\":{\"id\":\"$BUSY_ID\",\"label\":\"False-exit repro ($METHOD)\",\"detail\":\"inducing data-client drop\",\"urgency\":\"high\"}}" >/dev/null

induce_evict() {
  # Connect as a second Data client: read T_HELLO, send T_RESIZE so we classify
  # as Data (not FG). Daemon evicts the UI client (MAX_DATA_CLIENTS=1).
  # Hold the socket open briefly so eviction sticks, then exit.
  python3 - "$SOCK" "$EVICT_HOLD_SEC" <<'PY' &
import socket, struct, sys, time
sock_path, hold = sys.argv[1], float(sys.argv[2])
T_RESIZE, T_HELLO = 1, 5

def recv_exact(s, n):
    buf = b""
    while len(buf) < n:
        chunk = s.recv(n - len(buf))
        if not chunk:
            raise SystemExit(f"short read: got {buf!r}, want {n} bytes")
        buf += chunk
    return buf

def read_frame(s):
    hdr = recv_exact(s, 5)
    tag, length = hdr[0], struct.unpack(">I", hdr[1:])[0]
    payload = recv_exact(s, length) if length else b""
    return tag, payload

def write_frame(s, tag, payload=b""):
    s.sendall(bytes([tag]) + struct.pack(">I", len(payload)) + payload)

s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.connect(sock_path)
tag, payload = read_frame(s)
if tag != T_HELLO:
    raise SystemExit(f"expected T_HELLO=5, got {tag}")
# Announce Data role immediately (resize), same as a real attach.
cols, rows = 120, 40
write_frame(s, T_RESIZE, struct.pack(">HH", cols, rows))
print(f"evict_client: connected, HELLO ok proto={struct.unpack('>I', payload)[0]}, sent T_RESIZE; holding {hold}s", flush=True)
time.sleep(hold)
s.close()
print("evict_client: closed", flush=True)
PY
  EVICT_PID=$!
  echo "inducing: second Data client on $SOCK (pid $EVICT_PID)"
  # Wait until eviction has had time to run + UI processes EOF.
  wait "$EVICT_PID" || die "evict client failed"
  EVICT_PID=""
}

induce_silent_hold() {
  # Sweep-race stand-in: stay connected past FG_CLASSIFY_TIMEOUT (100ms) with
  # no role frame. Classify defaults to Data → evicts the live UI client.
  python3 - "$SOCK" "$SILENT_HOLD_SEC" <<'PY' &
import socket, struct, sys, time
sock_path, hold = sys.argv[1], float(sys.argv[2])
T_HELLO = 5

def recv_exact(s, n):
    buf = b""
    while len(buf) < n:
        chunk = s.recv(n - len(buf))
        if not chunk:
            raise SystemExit(f"short read: got {buf!r}, want {n} bytes")
        buf += chunk
    return buf

def read_frame(s):
    hdr = recv_exact(s, 5)
    tag, length = hdr[0], struct.unpack(">I", hdr[1:])[0]
    payload = recv_exact(s, length) if length else b""
    return tag, payload

s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.connect(sock_path)
tag, payload = read_frame(s)
if tag != T_HELLO:
    raise SystemExit(f"expected T_HELLO=5, got {tag}")
print(
    f"silent_hold: connected, HELLO ok proto={struct.unpack('>I', payload)[0]}; "
    f"holding quiet {hold}s (no Data/FG frame)",
    flush=True,
)
time.sleep(hold)
s.close()
print("silent_hold: closed", flush=True)
PY
  EVICT_PID=$!
  echo "inducing: silent-hold on $SOCK (pid $EVICT_PID, ${SILENT_HOLD_SEC}s)"
  wait "$EVICT_PID" || die "silent-hold client failed"
  EVICT_PID=""
}

induce_stall() {
  silo "{\"op\":\"sendText\",\"args\":{\"terminalId\":\"$TERM_ID\",\"text\":\"yes 'false-exit-flood'\",\"addNewline\":true}}" >/dev/null
  sleep 0.4
  echo "inducing: SIGSTOP app pid=$APP_PID for ${HOLD_SEC}s (host keeps writing)"
  kill -STOP "$APP_PID"
  APP_STOPPED=1
  sleep "$HOLD_SEC"
  kill -CONT "$APP_PID"
  APP_STOPPED=0
  echo "induced: SIGCONT app (state=$(ps -p "$APP_PID" -o state= | tr -d ' '))"
}

case "$METHOD" in
  evict) induce_evict ;;
  silent-hold) induce_silent_hold ;;
  stall) induce_stall ;;
esac

sleep "$SETTLE_SEC"

# --- probes ---
HOST_ALIVE=0
if kill -0 "$HOST_PID" 2>/dev/null; then
  HOST_ALIVE=1
  echo "host: still alive (pid $HOST_PID)"
else
  echo "host: DEAD (unexpected — this would be a real exit path)"
fi

OVERLAY=0
UI_DEAD=0
ui_probe=$(silo '{"op":"eval","args":{"expr":"(() => { const hosts=[...document.querySelectorAll(\".dock-host[data-active=\\\"true\\\"] .terminal-host\")].map(h=>h.className); const overlay=document.querySelector(\".terminal-overlay\"); return JSON.stringify({hosts, overlayText:overlay?overlay.innerText:null}); })()"}}' 10 || echo EVAL_FAIL)
echo "ui_probe: $ui_probe"
eval "$(python3 - "$ui_probe" <<'PY'
import json, sys
raw = sys.argv[1]
overlay = 0
ui_dead = 0
try:
    outer = json.loads(raw)
    data = json.loads(outer.get("result") or "{}")
    text = data.get("overlayText") or ""
    if "Process exited" in text or "Session ended" in text:
        overlay = 1
    hosts = data.get("hosts") or []
    # Dead = at least one host in the active dock, none ready.
    if hosts and not any("terminal-host--active" in h for h in hosts):
        ui_dead = 1
except Exception as e:
    print(f"echo 'ui_probe parse err: {e}'", file=sys.stderr)
print(f"OVERLAY={overlay}")
print(f"UI_DEAD={ui_dead}")
PY
)"
if [[ "$OVERLAY" -eq 1 ]]; then
  echo "overlay: Process exited / Session ended present"
else
  echo "overlay: NOT present (prod showed this; Dev may show blank dead UI instead)"
fi
if [[ "$UI_DEAD" -eq 1 ]]; then
  echo "ui: active-dock terminal-host lacks --active (dead / not ready)"
fi

EOF_LOG=0
if [[ -f "$DEV_LOG" ]]; then
  if awk -v mark="$LOG_MARK" -v sid="$SESSION_ID" '
    $1+0 >= mark+0 && $0 ~ ("exit session=" sid) && $0 ~ /reason=eof/ { found=1 }
    END { exit found ? 0 : 1 }
  ' "$DEV_LOG"; then
    EOF_LOG=1
    echo "terminal.log: exit … reason=eof for this session (after mark)"
    awk -v mark="$LOG_MARK" -v sid="$SESSION_ID" '
      $1+0 >= mark+0 && index($0, sid) { print }
    ' "$DEV_LOG" | tail -15
  else
    echo "terminal.log: no reason=eof for this session after mark"
  fi
else
  echo "terminal.log: missing at $DEV_LOG"
fi

if [[ -n "$HOST_LOG" && -f "$HOST_LOG" ]]; then
  echo "host log (tail):"
  tail -12 "$HOST_LOG"
fi

KILL_LOG=0
if [[ -f "$DEV_LOG" ]] && awk -v mark="$LOG_MARK" -v sid="$SESSION_ID" '
  $1+0 >= mark+0 && $0 ~ ("kill session=" sid) { found=1 }
  END { exit found ? 0 : 1 }
' "$DEV_LOG"; then
  KILL_LOG=1
  echo "terminal.log: WARN unexpected kill for this session"
fi

SWITCH_STUCK=0
if [[ "$OVERLAY" -eq 1 || "$UI_DEAD" -eq 1 ]]; then
  silo "{\"op\":\"activateWorkspace\",\"args\":{\"id\":\"$PARK_ID\"}}" >/dev/null
  sleep 0.4
  silo "{\"op\":\"activateWorkspace\",\"args\":{\"id\":\"$WS_ID\"}}" >/dev/null
  sleep 0.4
  switch_probe=$(silo '{"op":"eval","args":{"expr":"(() => { const hosts=[...document.querySelectorAll(\".dock-host[data-active=\\\"true\\\"] .terminal-host\")].map(h=>h.className); const overlay=document.querySelector(\".terminal-overlay\"); return JSON.stringify({hosts, overlayText:overlay?overlay.innerText:null}); })()"}}' 10 || echo EVAL_FAIL)
  echo "after_workspace_switch: $switch_probe"
  eval "$(python3 - "$switch_probe" <<'PY'
import json, sys
raw = sys.argv[1]
stuck = 0
try:
    data = json.loads(json.loads(raw).get("result") or "{}")
    text = data.get("overlayText") or ""
    hosts = data.get("hosts") or []
    if "Process exited" in text or "Session ended" in text:
        stuck = 1
    elif hosts and not any("terminal-host--active" in h for h in hosts):
        stuck = 1
except Exception:
    pass
print(f"SWITCH_STUCK={stuck}")
PY
)"
  if [[ "$SWITCH_STUCK" -eq 1 ]]; then
    echo "workspace switch: still dead (expected for this bug)"
  else
    echo "workspace switch: recovered to ready (unexpected)"
  fi
fi

silo "{\"op\":\"setBusyStatus\",\"args\":{\"id\":\"$BUSY_ID\",\"label\":\"False-exit repro — done\",\"detail\":\"overlay=$OVERLAY host=$HOST_ALIVE eof=$EOF_LOG\",\"urgency\":\"normal\"}}" >/dev/null

if [[ "$MODE" == visual ]]; then
  echo
  echo "Holding ${VISUAL_HOLD_SEC}s so you can inspect (Enter skips)…"
  set +e
  for ((left = VISUAL_HOLD_SEC; left >= 1; left--)); do
    silo "{\"op\":\"setBusyStatus\",\"args\":{\"id\":\"$BUSY_ID\",\"label\":\"False-exit hold — ${left}s\",\"detail\":\"KEEP_WORKSPACE=$KEEP_WORKSPACE\",\"urgency\":\"normal\"}}" 3 >/dev/null 2>&1
    read -r -t 1 _
    if [[ $? -eq 0 ]]; then
      echo "ended early by Enter"
      break
    fi
  done
  set -e
fi

echo
# Prod painted the exited overlay; Dev after forced eviction often goes blank
# (not ready, no overlay) instead. Both are false death: eof + live host + no
# kill + UI not live, and workspace switch does not recover.
#
# After the fix: eof may still land in the log (data client dropped), but the
# panel reattaches — active dock shows terminal-host--active again.
if [[ "$HOST_ALIVE" -eq 1 && "$EOF_LOG" -eq 1 && "$KILL_LOG" -eq 0 && "$OVERLAY" -eq 0 && "$UI_DEAD" -eq 0 ]]; then
  # Confirm ready explicitly from last probe
  if echo "$ui_probe" | grep -q 'terminal-host--active'; then
    VERDICT=RECOVERED
    echo "VERDICT: RECOVERED — eof fired but UI reattached (host still live)"
  else
    VERDICT=EOF_ONLY
    echo "VERDICT: EOF_ONLY — backend eof, UI neither dead nor clearly ready"
  fi
elif [[ "$HOST_ALIVE" -eq 1 && "$EOF_LOG" -eq 1 && "$KILL_LOG" -eq 0 && ( "$OVERLAY" -eq 1 || "$UI_DEAD" -eq 1 ) ]]; then
  VERDICT=FALSE_EXIT
  echo "VERDICT: FALSE_EXIT — live host + reason=eof (no kill) + UI dead"
  if [[ "$OVERLAY" -eq 1 ]]; then
    echo "         UI: exited overlay (matches prod screenshot)"
  else
    echo "         UI: blank / not-ready (Dev variant; no Session-ended overlay)"
  fi
  if [[ "$SWITCH_STUCK" -eq 1 ]]; then
    echo "         workspace switch did not recover (matches prod)"
  fi
elif [[ "$HOST_ALIVE" -eq 1 && "$EOF_LOG" -eq 1 && "$KILL_LOG" -eq 0 ]]; then
  VERDICT=EOF_ONLY
  echo "VERDICT: EOF_ONLY — backend false-exit signature, but UI still looks ready"
elif [[ "$HOST_ALIVE" -eq 0 ]]; then
  VERDICT=REAL_EXIT
  echo "VERDICT: REAL_EXIT — host died (not the bug under test)"
else
  VERDICT=NO_REPRO
  echo "VERDICT: NO_REPRO — host alive, no false-exit signature"
  if [[ "$METHOD" == stall ]]; then
    echo "  tip: try METHOD=evict|silent-hold or HOLD_SEC=8"
  elif [[ "$METHOD" == silent-hold ]]; then
    echo "  (expected after the classify-timeout fix: quiet peer ignored, UI stays up)"
  fi
fi

case "$MODE" in
  detect|visual)
    echo "mode=$MODE; done"
    exit 0
    ;;
  before)
    if [[ "$VERDICT" == FALSE_EXIT ]]; then
      echo "PASS (before): false Process-exited reproduced"
      exit 0
    fi
    echo "FAIL (before): expected FALSE_EXIT, got $VERDICT" >&2
    exit 1
    ;;
  after)
    # Remount fix → RECOVERED (eof still happens, UI heals). Daemon classify
    # fix → NO_REPRO for silent-hold (quiet peer never evicts). Both are green.
    if [[ "$VERDICT" == RECOVERED || "$VERDICT" == NO_REPRO ]]; then
      echo "PASS (after): $VERDICT — no stuck Session-ended overlay"
      exit 0
    fi
    echo "FAIL (after): expected RECOVERED|NO_REPRO, got $VERDICT" >&2
    exit 1
    ;;
esac
