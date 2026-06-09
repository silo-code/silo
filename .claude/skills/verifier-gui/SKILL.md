---
name: verifier-gui
description: Launch (or attach to) the Silo dev app and drive it for runtime verification through the dev automation RPC bridge — exec commands, eval DOM, capture screenshots, and create/activate/delete workspaces, terminals, editors. This is the repo's GUI evidence-capture handle for the `verify` skill. Use when verifying a change by running the real app and observing it. Always works inside a throwaway sandbox workspace, never the user's real workspaces.
tools: Bash, Read
---

# Silo GUI Verifier

The handle the `verify` skill looks for: how to get the running Silo app under
control and capture evidence from it. Silo is a Tauri desktop app; its surface is
pixels + a dev-only RPC bridge. This skill drives that bridge.

**It does not judge.** It launches, drives, captures. The verdict is `verify`'s.

## Golden rule 1: verify in a sandbox workspace, never the user's

The app may be the user's live session with real workspaces and terminals. **Do
all verification in a workspace you create from a temp dir, and delete it when
done.** Never `openTerminal`/`deleteWorkspace`/`openFile` against an existing
workspace — you'd pollute or destroy real state. Create → activate → verify →
delete. This also makes destructive paths (workspace delete, session kill) safe
to exercise.

## Golden rule 2: one turn, not one op per turn

The wall-clock cost here is **agent turns**, not the RPC bridge — each bridge call
is ~milliseconds on localhost, but every separate `Bash` tool call is a full model
round-trip (seconds). So **issue a whole drive + capture sequence as a single
`Bash` call.** The `silo()` helper is just `curl`; bash variables (`WS_ID`,
`WS_DIR`) persist _within_ one invocation, so create → activate → drive →
screenshot → decode all belong in **one** block (see §2). A 6-step flow then costs
2 turns, not 7.

Only split into a separate turn when you genuinely must:

- **The final `Read /tmp/silo.png`** — `Read` is its own tool, so capture-in-one-turn
  then read-in-the-next is the floor (2 turns).
- **Branching on an observed result** — if the next op depends on what you _saw_
  (a count, a tab list, a pass/fail), end the block, read the output, then decide.
  A fixed setup sequence has no such dependency — never split it.

Echo any state you'll need next turn (e.g. `echo "WS_ID=$WS_ID"`) — bash vars die
at the end of the Bash call.

## 1. Get the app up (attach or launch)

The bridge listens on `127.0.0.1:7878` (dev builds only — `app:dev` is built
`--features automation`). Define the request helper first — the contract is
strict: header `X-Silo-Automation: 1` **and** a loopback `Host`, `POST /`, body
`{"op", "args"}`.

```bash
silo(){ curl -s -m30 -X POST http://127.0.0.1:7878/ \
  -H 'X-Silo-Automation: 1' -H 'Content-Type: application/json' \
  --data "$1"; }
```

Attach if it's already running, else launch:

```bash
if [ "$(silo '{"op":"ping"}')" = '{"ok":true,"result":"pong"}' ]; then
  echo "attached to running dev app"
else
  pnpm dev >/tmp/silo-appdev.log 2>&1 &           # first run compiles Rust — slow
  for i in $(seq 1 120); do                       # poll up to ~4 min
    sleep 2
    [ "$(silo '{"op":"ping"}' 2>/dev/null)" = '{"ok":true,"result":"pong"}' ] && break
  done
fi
```

`app:dev` runs under the isolated **"Silo Dev"** identity (separate app data), so
launching never touches the user's real Silo install — but if you _attached_ to
an already-running instance, the sandbox rule above still applies.

## 2. Drive & capture — one block, one turn

Per golden rule 2, do the whole sandbox setup, drive steps, and screenshot in a
**single `Bash` call**. Bash variables persist within the invocation, so the
workspace id flows from one op to the next with no agent round-trip. End the block
with the screenshot + decode; the only follow-up turn is `Read /tmp/silo.png`.

```bash
# ── ONE Bash call = ONE turn ──────────────────────────────────────────────
WS_DIR=$(mktemp -d /tmp/silo-verify.XXXXXX)
WS_ID=$(silo "{\"op\":\"openWorkspace\",\"args\":{\"folder\":\"$WS_DIR\",\"name\":\"verify-sandbox\"}}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["id"])')
silo "{\"op\":\"activateWorkspace\",\"args\":{\"id\":\"$WS_ID\"}}"

# ── drive steps (add as many as the check needs) ──
silo '{"op":"exec","args":{"command":"core.newTerminal"}}'
# silo "{\"op\":\"openFile\",\"args\":{\"path\":\"$WS_DIR/README.md\"}}"
# silo '{"op":"eval","args":{"expr":"document.querySelectorAll(\".xterm\").length"}}'

# ── capture as the LAST step in the same block ──
silo '{"op":"screenshot"}' > /tmp/shot.json
python3 -c "import json,base64;d=json.load(open('/tmp/shot.json'));r=d['result'];open('/tmp/silo.png','wb').write(base64.b64decode(r['png_base64']));print('shot',r['width'],r['height'])"

echo "WS_ID=$WS_ID"   # surface state needed for next-turn cleanup
```

Next turn: `Read /tmp/silo.png`. The capture can be **slow (a few seconds),
especially the first call** — keep the timeout ≥30s and retry once if it returns
empty. No OS permission setup is required.

A single-folder workspace also means `core.newTerminal` won't pop the folder
picker (which automation can't click) — it resolves the lone folder directly.

**Reading evidence without a screenshot** — for structure/counts, an inline `eval`
in the same block is cheaper than a picture: `document.querySelectorAll('.xterm').length`
(terminal count), `[...document.querySelectorAll('.dv-tab')].map(t=>t.textContent)`
(open tabs), `document.body.innerText.includes('Session ended')` (spawn failure).
**WebGL caveat:** terminals render to a **canvas** (WebGL addon) — `.xterm` has
**no DOM text**, so to read what a shell _printed_ you need a screenshot, not
`textContent`.

### Op catalog

`exec` runs a registered command (the real `ctx` path); `eval` runs JS in the
webview global scope (note: app modules like `store` are **not** in scope — use
the dedicated ops for state).

| Op                              | Args                 | Use                                                                               |
| ------------------------------- | -------------------- | --------------------------------------------------------------------------------- |
| `ping`                          | —                    | liveness (`pong`)                                                                 |
| `exec`                          | `command`            | run a command id — e.g. `core.newTerminal`, `core.newFile` (the real `ctx` paths) |
| `eval`                          | `expr`               | DOM queries / observations (returns the value; awaits promises)                   |
| `screenshot`                    | —                    | host-side window capture → `{png_base64,width,height}`                            |
| `listWorkspaces`                | —                    | `{active, workspaces[]}`                                                          |
| `openWorkspace`                 | `folder,name`        | create a workspace (use a temp dir)                                               |
| `activateWorkspace`             | `id`                 | switch active workspace                                                           |
| `deleteWorkspace`               | `id`                 | remove a workspace (sandbox only!)                                                |
| `openTerminal`                  | `cwd?`               | add a terminal to the active workspace → `{terminalId,panelId}`                   |
| `openFile` / `openDiff`         | `path` / `path,mode` | open editor / diff tabs                                                           |
| `activatePanel`                 | `panelId`            | focus a dock panel                                                                |
| `showSidePanel`                 | `id`                 | expand + activate a side panel (e.g. `git-explorer`)                              |
| `contextKeys` / `activeElement` | —                    | introspection                                                                     |
| `themeState`                    | —                    | active theme + presets                                                            |

The typed client `src/automation/client.ts` (`SiloAutomation`) wraps these if you
prefer TS over curl.

## 3. Clean up (always)

```bash
silo "{\"op\":\"deleteWorkspace\",\"args\":{\"id\":\"$WS_ID\"}}"   # reaps its terminals/panels
rm -rf "$WS_DIR"
```

If you launched the app yourself, you may leave it running (next verify attaches)
or kill the backgrounded `pnpm dev` — but never kill an instance you
attached to (it's the user's).

## Gotchas (learned the hard way)

- **Header quoting**: `-H 'X-Silo-Automation: 1'` — an unquoted/space-mangled
  header gets a `403 {"error":"forbidden"}`.
- **`exec` vs `openTerminal`**: `exec("core.newTerminal")` drives the real
  `ctx.terminals.create` path; the `openTerminal` op is a lower-level test setup
  that calls record APIs directly — prefer `exec` when verifying the `ctx` path.
- **Focus-sensitive checks** (asserting a `<textarea>` is `document.activeElement`)
  only pass while the window is frontmost; an agent session can't hold focus, so
  gate them on `SiloAutomation.foreground()` and SKIP otherwise — don't FAIL.
- **Code freshness**: confirm the running app is the code under test (e.g. the
  process started after your last commit, or trigger a reload) before trusting a
  PASS — an attached instance may predate your change if HMR didn't fully apply.
