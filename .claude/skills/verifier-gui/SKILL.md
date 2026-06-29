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
the dedicated ops for state). The full, authoritative list is the `switch (op)`
in `apps/desktop/src/automation/bridge.ts` — **read it when in doubt**; this table
mirrors it. `eval` is the escape hatch, but for Monaco state prefer the dedicated
editor ops below — `monaco` is not a page global, so `eval` can't reach it.

**Core / liveness**

| Op           | Args      | Returns / use                                          |
| ------------ | --------- | ------------------------------------------------------ |
| `ping`       | —         | `pong` — liveness                                      |
| `exec`       | `command` | run a command id (menu/keybinding dispatch) → `{ran}`  |
| `eval`       | `expr`    | evaluate JS in the page; awaits a returned promise     |
| `screenshot` | —         | host-side window capture → `{png_base64,width,height}` |

**Workspaces / panels** (sandbox only — never point at real workspaces)

| Op                  | Args                         | Returns / use                                   |
| ------------------- | ---------------------------- | ----------------------------------------------- |
| `listWorkspaces`    | —                            | `{active, workspaces[{id,name,folder}]}`        |
| `openWorkspace`     | `folder,name`                | create + activate (use a temp dir) → `{id}`     |
| `activateWorkspace` | `id`                         | switch active → `{active}`                      |
| `deleteWorkspace`   | `id`                         | reap terminals + remove → `{deleted,active}`    |
| `splitActivePanel`  | `position?` (l/r/top/bottom) | split center group → `{groups}`                 |
| `activatePanel`     | `panelId`                    | focus a dock panel → `{activated}`              |
| `showSidePanel`     | `id`                         | expand slot + activate its tab → `{shown,slot}` |

**Editors / terminals**

| Op              | Args                                    | Returns / use                                                               |
| --------------- | --------------------------------------- | --------------------------------------------------------------------------- |
| `openFile`      | `path`                                  | open an editor tab → `{editorId,panelId}`                                   |
| `openDiff`      | `path,providerId,args?,title?,preview?` | open a diff tab via a content provider → `{diffId,panelId}`                 |
| `listEditors`   | `workspaceId?`                          | `{previewEditorId, editors[{id,filePath,title,isPreview,mode,providerId}]}` |
| `openTerminal`  | `cwd?`                                  | `ctx.terminals.create` → `{terminalId,panelId}`                             |
| `listTerminals` | `workspaceId?`                          | `{terminals[{id,title,sessionId,kind}]}`                                    |

**Monaco introspection / drive** (authoritative — straight from Monaco's registry; `uri` matches by substring of the model URI)

| Op               | Args        | Returns / use                                                                                                                          |
| ---------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `monacoEditors`  | —           | live editors `[{uri,hasTextFocus,valueLength,valueTail}]`                                                                              |
| `editorsDetail`  | —           | per-editor focus + container-visibility ground truth (focus-handoff debugging)                                                         |
| `focusLog`       | `clear?`    | Monaco focus-event timeline (`{clear:true}` resets it)                                                                                 |
| `editorContent`  | `uri`       | read a model's current text → `{uri,value}` \| `null`                                                                                  |
| `editorOptions`  | `uri`       | resolved Monaco config (font/tab/wrap/minimap/readOnly/…) for that editor                                                              |
| `setEditorValue` | `uri,value` | `model.setValue` → fires `onChange`, i.e. the **real edit→dirty→save/backup path**, no OS focus needed → `{uri,valueLength}` \| `null` |

**Output logs** (read what the app or extensions have logged)

| Op           | Args                                        | Returns / use                                                                                           |
| ------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `outputLogs` | `channel?,level?,search?,limit?` (all opt.) | `{channel,displayName,totalCount,entries[{timestamp,level,message,data?}],channels[{key,displayName}]}` |

- `channel` defaults to the first registered channel. Discover all channels via the `channels` field in any response.
- `level`: `"debug"` / `"info"` / `"warn"` / `"error"` / `"all"` (default `"all"`).
- `search`: case-insensitive substring on `message`.
- `limit`: most-recent N entries (default 200; ring buffer holds 5 000 per channel).

```bash
# All recent logs (first channel, up to 200)
silo '{"op":"outputLogs"}'
# Errors only from notifications channel
silo '{"op":"outputLogs","args":{"channel":"silo:notifications","level":"error","limit":50}}'
```

**Theme / process / introspection**

| Op              | Args                 | Returns / use                                                    |
| --------------- | -------------------- | ---------------------------------------------------------------- |
| `themeState`    | —                    | `{activeId, presets[], customThemes[]}`                          |
| `setTheme`      | `id`                 | switch active theme → `{activeId}`                               |
| `processExec`   | `command,args?,cwd?` | one-shot `ctx.process.exec` → `{stdout,stderr,code}`             |
| `contextKeys`   | —                    | host context-keys snapshot (`activeEditorId`/`activeViewerId`/…) |
| `activeElement` | —                    | describe what holds DOM focus                                    |

To **dirty an editor without keyboard focus** (e.g. verifying save / dirty
indicator / hot-exit backups): `openFile`, then `setEditorValue` with the file's
basename as `uri` and new `value` — this drives the real `onChange`. Read it back
with `editorContent`, or screenshot for the dirty dot.

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
