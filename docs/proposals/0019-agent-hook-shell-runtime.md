---
status: implemented
created: 2026-07-29
supersedes-section: 0018 # replaces RFC 0018's Python/base64 hook-command mechanism only
---

# 0019. Agent session hook: a POSIX-shell runtime that doesn't look like malware

> **Agent-observability series** — read together:
> [0018 · `ctx.agents` surface](./0018-ctx-agents-surface.md) → **0019 ·
> POSIX-shell hook runtime** (this RFC) →
> [0020 · hook activity channel](./0020-agent-hook-activity-channel.md). The
> consolidated, human-facing narrative lives in the
> [agent sessions guide](../../apps/docs/guide/agent-sessions.md).

## Summary

Replace the session-capture hook command Silo installs into each agent CLI's
config — today an inline `python3 -c "…;exec(base64.b64decode('…'))"` one-liner
— with a plain, readable **POSIX shell script** written to a Silo-controlled
path (`~/.silo/agent-hooks/track-session.sh`) and invoked as
`sh "$HOME/.silo/agent-hooks/track-session.sh" <agent-id>`. Nothing about the
event wire format, the correlation logic, or the reader changes; only the
_runtime that produces an event line_ changes. This removes the
obfuscated-code-execution pattern (`exec` of a base64 blob) that endpoint
security tools (SentinelOne and peers) flag on sight, and drops the hard
dependency on a Python interpreter — which is not guaranteed present on any
platform. The feature's supported surface is formalized as **macOS + Linux
only**, matching where its pgid-based correlation already works, and the
Settings → Agents install toggles are gated accordingly.

## Motivation

Two concrete problems, one of them actively harmful right now:

1. **The installed hook command trips endpoint security.** The current command
   (`agent-catalog.ts`'s `buildPythonHookCommand`) base64-encodes the whole
   correlator script and runs it via `exec(base64.b64decode('…').decode())`.
   That is the textbook obfuscated-payload-execution signature; EDR products
   match on it structurally, regardless of intent. Confirmed in the field:
   SentinelOne flags the process (`/bin/sh -c python3 -c "…exec(base64…"`) as a
   malicious/suspicious execution and, on a corporate-managed machine, kicks the
   user off the network. A session-tracking convenience feature must never do
   that. The base64 wrapper exists _only_ because the correlator needs a real
   `for`/`if` suite that can't fit on one physical `python3 -c "…"` line — an
   incidental packaging choice, not anything essential.

2. **Python is not a dependable runtime.** The command assumes `python3` is on
   `PATH`. That is not guaranteed on any platform: on Windows Python is absent
   by default (the `python3` PATH stub opens the Microsoft Store); on minimal
   Linux images it may be missing; on a fresh macOS the first `python3`
   invocation can trigger the Xcode Command Line Tools install prompt. Nor can
   we lean on the _agent's_ runtime instead: the four supported agents have no
   common one — Claude Code and Copilot CLI are Node packages, but Cursor Agent
   and Codex CLI ship as native binaries. There is no single language runtime
   we can count on being installed.

There is, however, one runtime that is **definitionally** present wherever a
hook fires on a Unix system: the POSIX shell itself. Every supported agent runs
its hook command via `sh -c "<command>"`; `/bin/sh` is therefore not merely
likely but _guaranteed_ — it is the very process executing our command. And the
handful of tools the correlator needs beyond the shell — `ps`, `sed`, `mkdir` —
are POSIX-mandated coreutils present on every macOS and Linux install. This
lets the hook depend on nothing that isn't already guaranteed by the platform
it runs on, with no obfuscation anywhere in sight.

## Design

### What does not change (the contracts)

The seam between the hook and the rest of Silo is the **event line** in
`~/.silo/agent-hooks/events.jsonl` and its correlation rule. Both are unchanged:

- **Wire format** — the script emits the JSON object `agent-hook-events.ts`'s
  `parseLine` expects, now with `cwd` dropped (decision B):
  `{"pid":<pgid>,"sessionId":"<id>","agent":"<id>","timestamp":"<ISO8601>Z"}`,
  one per line. `parseLine` already defaults a missing `cwd` to `""`, so this is
  forward- and backward-compatible with lines written by the old command. The
  `pid` field carries the resolved **process-group id** (the historical field
  name is kept for wire compatibility with the reader, which matches it against a
  terminal's foreground pgid / sticky agent pgid). Dropping `cwd` is what makes
  the line **escaping-safe by construction**: every remaining field is a value
  that cannot contain a JSON-hostile character — `pid` is an integer,
  `sessionId` a UUID, `agent` a catalog slug, `timestamp` a `date -u` string — so
  a `printf`-built line can never be malformed in a way that takes the session id
  down with it. `cwd` was the sole field that could carry a quote/backslash (a
  path), and nothing consumes it: `applyHookMatch` never reads `event.cwd` — the
  generic resume hint uses Silo's _own_ foreground-tracked cwd, not the hook's.
- **Correlation** — `matchHookEventsToTerminals` still does exact
  `event.pid === terminal.pgid` (or `=== agentPgid`) matching. The script's job
  is unchanged: report the _agent process's_ pgid, resolved by walking up from
  the hook's own PPID, so it survives Cursor's setpgrp worker and Claude/Codex
  tool-use pgid drift.
- **Path** — the events file stays at the app-identity-agnostic
  `~/.silo/agent-hooks/events.jsonl`; the new script lives beside it at
  `~/.silo/agent-hooks/track-session.sh`.

Because the wire format is identical, the entire host-side reader/correlator/
prune machinery (`agent-hook-events.ts`, `agents-service.ts`) is untouched.

### The script

One shared `track-session.sh` serves all four agents — the walk logic is
agent-independent; only the _tag_ written into the event differs, and that comes
in as `$1`. Shape (illustrative, not final):

```sh
#!/bin/sh
# Silo session tracking (getsilo.dev) — records which agent session is running
# in a terminal so Silo can offer an exact resume command. Safe to inspect.
# Managed by Silo; see Settings > Agents. Marker: silo-managed-agent-hook
agent="$1"
payload=$(cat)                       # agent CLI pipes {session_id, ...} on stdin

# Extract the session id. Agents spell the key two ways (session_id / sessionId)
# and the spellings differ in length, so match each explicitly — no BRE optional
# quantifier (`?`), which POSIX/BSD sed doesn't support. Session ids are UUIDs,
# so a `[^"]*` capture is safe.
sid=$(printf '%s' "$payload" | sed -n \
  's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
[ -n "$sid" ] || sid=$(printf '%s' "$payload" | sed -n \
  's/.*"sessionId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
[ -n "$sid" ] || exit 0              # nothing to record without a session id

# Resolve the correlation target that gets written as "pid".
# Forward-compat seam (RFC 0020): Silo-spawned agents inherit $SILO_TERMINAL_ID
# and can be matched directly, skipping the walk. Structured env-var-first so
# 0020 slots in as an additive branch without reshaping this script. Today the
# body is empty and we always fall through to the walk.
if [ -n "$SILO_TERMINAL_ID" ]; then
  : # RFC 0020 fills this in (write a terminal-id-keyed event, then exit 0).
fi

# Fallback (always, until 0020): walk parents from our PPID to the real agent
# process, then take its pgid. Raw PPID can be a setpgrp worker (Cursor) or a
# tool subprocess (Claude/Codex), so we can't trust it directly.
KNOWN="cursor-agent claude codex copilot gemini aider"   # templated from catalog
pid=$PPID; found=""
i=0; while [ "$i" -lt 12 ] && [ "${pid:-0}" -gt 1 ]; do
  argv0=$(ps -p "$pid" -o comm= 2>/dev/null | sed 's#.*/##')
  for k in $KNOWN; do [ "$argv0" = "$k" ] && { found=$pid; break; }; done
  [ -n "$found" ] && break
  pid=$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ')
  i=$((i+1))
done
target=${found:-$PPID}
pgid=$(ps -p "$target" -o pgid= 2>/dev/null | tr -d ' ')
[ -n "$pgid" ] || exit 0

dir="$HOME/.silo/agent-hooks"; mkdir -p "$dir"
ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf '{"pid":%s,"sessionId":"%s","agent":"%s","timestamp":"%s"}\n' \
  "$pgid" "$sid" "$agent" "$ts" >> "$dir/events.jsonl"
```

Every line is legible, uses only guaranteed tools, and there is no `eval`, no
`base64`, no network, no broad process enumeration (`ps -p <pid>` is targeted,
not `ps aux`). The `KNOWN` list is **templated in at write time from
`AGENT_CATALOG`'s `leaderNames`**, so it stays a single source of truth — adding
an agent to the catalog updates the script the next time it's written, with no
second hand-maintained list. The `$SILO_TERMINAL_ID` branch is the seam
[RFC 0020](./0020-agent-hook-activity-channel.md) hangs its Silo-spawned fast
path off of; keeping it here now means 0020 is an additive change, not a
rewrite.

### The installed command

The hook entry Silo writes into each agent's config becomes:

```
sh "$HOME/.silo/agent-hooks/track-session.sh" claude # silo-managed-agent-hook
```

- Invoked via `sh <path>` (not the script directly) because `ctx.files` has no
  `chmod` — this sidesteps needing the executable bit, and adds no new SDK
  capability.
- The path is `$HOME`-relative, not an absolute path resolved at install time
  (decision A). Every agent runs the hook via `sh -c`, so `$HOME` expands
  reliably, and a `$HOME`-relative command bakes in no machine-specific path — it
  even survives dotfile-syncing an agent's config across machines/users, where a
  baked `/Users/alice/…` would not. Absolute-home is the trivial fallback if any
  agent ever turns out to `exec` the command directly rather than through a
  shell.
- The `# silo-managed-agent-hook` marker is retained verbatim; `isSiloEntry`
  keys off it unchanged, so install-state detection, uninstall, and (critically)
  **automatic migration of the old base64 entries** all keep working — an old
  entry still carries the same marker, so the existing "refresh Silo's entry
  when its command drifted" path rewrites it to the new form.
- Silo's identity is now legible in the command itself (`.silo/…/track-session`),
  and even more so at the top of the script — replacing the old
  `_='Silo session tracking …'` prefix hack that existed solely to survive
  Codex's truncated hook-trust preview.

### Install becomes: ensure the script, then edit the config

Today `buildCommand: () => string` is pure and the installers just splice the
string into a JSON file. In the new model, installing has one added side effect:
**the shared script must exist on disk before any config references it.** Shape:

- A catalog-level `buildTrackSessionScript(): string` (templated from
  `AGENT_CATALOG`) produces the script body; `buildCommand()` stays pure and
  returns only the short `sh "$HOME/…" <id> # marker` string.
- `writeInstalled` (in `agents-settings/index.tsx`) gains a first step:
  ensure `~/.silo/agent-hooks/track-session.sh` exists and matches the current
  body (write it if absent or drifted) via `ctx.files.writeText`, _then_ apply
  the existing per-strategy JSON edit. One script, written once, referenced by
  every agent's command.

### Migration / self-heal on load

Existing users (including the reporter of this bug) have base64 commands sitting
in their configs right now. To auto-migrate without asking them to toggle each
agent off/on:

- **On `load()`** of the Settings → Agents page: for each agent whose Silo hook
  is installed, if the stored command differs from the current `buildCommand()`
  (which it will, for every base64-era install), rewrite it — and (re)write
  `track-session.sh` when it's absent or drifted. This promotes the
  already-existing "refresh on drift" logic (currently only reachable via an
  explicit toggle) to run whenever the page opens, so simply visiting Settings →
  Agents heals a flagged install.
- **Idempotent and silent on a no-op**: rewrite _only_ when the command (or the
  script body) has actually drifted — an already-current install touches no
  files and produces no log noise. When a heal _does_ happen, log it to the
  Agents Output channel (which agent, and that the command/script was rewritten)
  so there's a diagnostic trail for "why did my config change when I opened
  Settings."
- This covers all three install strategies (claude-settings merge, cursor
  merge, copilot dedicated-file rebuild).
- **On Windows** (see gating below), `load()` does **not** heal — a shell hook
  can neither run nor correlate there, so silently rewriting it to a form that
  still can't work would be pointless churn. A pre-existing Silo hook is left
  inert as-is; the page may offer an explicit one-time "remove Silo's hook"
  cleanup, but never auto-rewrites on Windows.

### Platform gating (now required, not cosmetic)

A `sh`/`ps` script cannot run on Windows (no `/bin/sh`, no `ps`), and Windows
has no foreground-pgid source to correlate against regardless (RFC 0010 scoped
ConPTY foreground-tracking out; `session_windows.rs`'s `subscribe_foreground`
returns `None`). The feature is therefore macOS + Linux only, and the install
toggles must reflect that:

- The Settings page gates on **`ctx.system.os`** (decision C) — which already
  returns `"macos" | "linux" | "windows"`. On Windows the Agents page shows the
  agents as detection-only with a short "exact resume is macOS/Linux only for
  now" note, and renders **no install toggle** (installing a hook that can
  neither run nor correlate would be user-hostile). `ctx.system.os` is
  specifically the right signal here rather than reaching for `@tauri-apps/*`
  platform APIs directly: the extension boundary bans raw platform imports in
  extensions (this settings page is `core.agents-settings`, a bundled
  extension), and routing OS detection through `ctx` is exactly what that ban
  exists to enforce.

### Test & docs surface (part of the change, not follow-up)

- `agent-catalog.test.ts`: the assertions that the command contains
  `base64.b64decode` and decodes to a `getpgid` script are **inverted** — assert
  the command contains no `base64`/`exec`, is a single line, still embeds the
  marker, and still identifies Silo within the first N chars. New unit tests
  cover `buildTrackSessionScript()`: that it's valid `sh` (shellcheck in CI if
  available; at minimum token/structure assertions), that `KNOWN` is templated
  from the catalog (add a fake agent → appears in the list), and that it emits
  the exact wire-format line for a sample stdin payload (run the script under
  `sh` in a Node test with a fixture PID tree where feasible, else assert on
  structure).
- The JSON-merge installer tests (`hook-installer.test.ts` etc.) are unaffected —
  they test the merge algorithm, agnostic to command content.
- `apps/docs/guide/agent-sessions.md`: the manual-install JSON snippets (which
  currently embed the python one-liner) are updated to the shell command; the
  "supported agents" table / Windows section states exact-resume is macOS +
  Linux only.
- RFC 0018's "hook-based resolution" section gains a superseding note pointing
  here for the command mechanism (its _design_ — hook → pgid correlation → exact
  resume — is unchanged and still stands).

## Alternatives considered

- **Fix the Python, drop the base64 (write a readable `.py`, invoke
  `python3 <path>`).** Removes the malware signature but keeps the hard Python
  dependency — still broken-by-default on Windows, still risks the macOS CLT
  prompt and missing-on-minimal-Linux. Rejected: solves only half.
- **Invoke Silo's own binary (`silo --hook-track-session <id>`).** Maximally
  trustworthy-looking (it's the signed app the user already runs) and naturally
  cross-platform. Rejected: it bakes the app's _binary path_ into an
  externally-persisted config we don't control, and that path is not stable —
  Linux AppImages self-mount to a per-launch path (the exact problem RFC 0017
  [appimage-mount] wrestles with), Windows install locations vary and move on
  update. The hook would silently break on the next relaunch/update until the
  user reopened Settings. A Silo-owned script path (`~/.silo/…`) has none of
  this: home directories effectively never move, and the events file already
  assumes `~/.silo`.
- **A shim on `PATH` (`~/.local/bin/silo`) invoked by the hook.** Same
  binary-path-stability problem one level removed, plus a hard prerequisite that
  the user separately ran "Install `silo` command" first. Rejected.
- **Build real Windows ConPTY foreground-tracking so the hook works there too.**
  Out of scope by explicit decision: it's a substantial, independent effort
  (ConPTY exposes no clean foreground-process primitive) that RFC 0010 already
  deferred, and it's orthogonal to the security problem driving this change.
  Windows stays detection-only until that lands.
- **Keep the shell script but make it executable (`chmod +x`) and invoke it
  directly.** Rejected: `ctx.files` has no `chmod`, and adding one to the SDK
  surface for this is unwarranted when `sh <path>` works identically.

## Decisions (resolved)

All three open questions were signed off; recorded here with their outcomes.

- **A — path form in the installed command → `$HOME`-relative.** More portable,
  bakes in no machine-specific path, and survives dotfile-syncing a config
  across machines/users (an absolute `/Users/alice/…` would not). The single
  assumption — every agent runs the hook via `sh -c`, so `$HOME` expands — is
  already exercised by live testing against all four agents. Absolute-home is the
  trivial fallback if any agent turns out to `exec` the command directly.
- **B — drop `cwd` from the event payload → yes.** Independently verified that
  `event.cwd` is never consumed (the generic hint uses Silo's own
  foreground-tracked cwd). With `cwd` gone, every remaining field is
  escaping-safe by construction (integer / UUID / catalog slug / `date -u`), so a
  `printf`-built line can't be malformed in a way that loses the session id.
  `parseLine` already defaults a missing `cwd` to `""`, making it forward- and
  backward-compatible.
- **C — platform detection → `ctx.system.os`.** Already returns
  `"macos" | "linux" | "windows"`; gate the Windows toggle on it. Deliberately
  _not_ `@tauri-apps/*` — the extension platform-import ban applies to this
  bundled settings extension, and routing OS detection through `ctx` is what that
  ban is for.

Two design points that were framed as "required" are likewise confirmed:
migration self-heals on `load()` (idempotent and silent on a no-op, logs to the
Agents Output channel when it does heal, and never auto-heals on Windows); and
Windows gets no install toggle at all (detection-only, with an optional one-time
"remove Silo's hook" cleanup for a pre-existing inert install).

## Decision

**Implemented** on the `feat/ctx-agents` branch: the POSIX-shell
`track-session.sh` runtime with the resolutions above (A `$HOME`-relative,
B drop `cwd`, C gate on `ctx.system.getInfo().os`), auto-migrating existing
base64 installs on Settings → Agents load (idempotent, logs on heal), and gating
the feature to macOS + Linux. `agent-catalog.ts` builds the script and the short
`sh "$HOME/…/track-session.sh" <id>` command; `agents-settings/index.tsx` writes
the script and self-heals on load; `agent-catalog.test.ts` executes the generated
script under `sh` to pin the wire format. The event wire format (minus `cwd`) and
the pgid-correlation design from RFC 0018 are unchanged; only the command runtime
is replaced. The `$SILO_TERMINAL_ID` seam is reserved in the script so
[RFC 0020](./0020-agent-hook-activity-channel.md)'s Silo-spawned fast path lands
additively. Windows exact-resume remains deferred with the pre-existing RFC 0010
ConPTY foreground-tracking gap — explicitly out of scope here.
