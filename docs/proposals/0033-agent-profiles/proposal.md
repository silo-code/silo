---
status: accepted # phase 1 shipped; phase 2 in progress; phases 3–9 remain
created: 2026-08-31
---

# 0033. Agent Profiles — naming how you start an agent

## Planning scope

**This package covers phase 2 — "Addressing a profile by name" — only.**

Phase 1 shipped 2026-09-01 and was collapsed back into the durable proposal
before this package was written. Treat it as the **implementation baseline**:
the `AgentProfile` record, its persistence and load-hardening, the
pending-launch model, `TerminalRecord.profileId`, `ctx.agents.catalog()`, the
`+` menu, the terminal **Agents** submenu, and Settings → Agents → **Profiles**
all exist and work. Do not re-plan or re-implement any of it.

Phase 2 adds the three ways to name a profile instead of pointing at it:

1. **A command per profile** — `core.newAgent.<profileId>`, plus a generic
   `core.newAgent`. Registered like any other command, so they are bindable on
   the Keyboard Shortcuts page today and searchable in a command palette
   whenever one lands.
2. **The `default` flag** — `AgentProfile.default`, deferred out of phase 1
   precisely because it had no gesture to hang off. Phase 2 gives it two: the
   generic `core.newAgent` command and a bare `silo agent run`.
3. **`silo agent run [--profile <id>]`** — the launch half of the CLI, which
   needs no new IPC. It is also the first real caller of `launchAgentProfile`'s
   background branch, which phase 1 built and could only cover by unit test.

And it closes the one problem phase 1 named and left open: **dangling command
ids after a profile is deleted or renamed.**

Out of scope, and unchanged from the phase table below: prompt delivery
(phase 3), resume composition (phase 4), the public `ctx.agents.profiles`
surface (phase 5), per-account hooks (phase 6), `SILO_AGENT_PROFILE` (phase 7),
per-workspace defaults (phase 8), and the CLI's read-back half —
`silo agent list` and bare `silo agent run`'s interactive picker — which stay in
phase 9 behind a Control API.

Phase 2 adds **no `@silo-code/sdk` surface**. `AgentProfile` is host state, not
a public type, and the commands are registered through the existing public
`ctx.registerCommand`. The docs-sync workflow and the roadmap's
`ctx.agents.profiles` badge are therefore untouched; the user-facing CLI guide
and roadmap CLI entry are not.

## Summary

**Agent Profile** is a named, user-defined recipe for starting a coding agent in
a terminal: a label, a shell command line (`claude`, `claude-work`,
`cursor-agent`), an optional config directory for agents that support one, and
an optional hint about which catalog agent it launches.

Profiles are host-owned and user-defined. They appear in the `+` menu and the
terminal context menu's **Agents** submenu, they are managed on a **Profiles**
tab of Settings → Agents, and they replace `TerminalKind`'s two vestigial agent
values (`"claude"` / `"pi"`) — which nothing in the app created — as the app's
launch-time vocabulary for "which agent."

Deliberately **not** in scope: an agent-agnostic abstraction layer that
normalizes prompts, sessions, and streaming across Claude/Cursor/Codex. **A
profile is a way to start a terminal, not a way to talk to an agent.**
Everything downstream stays what it is today: a PTY, a shell, and a TUI you can
type in.

## Motivation

Every time you start an agent you make a choice with three parts: _which agent_,
_which account or config_, _which flags_. Users encode that as shell aliases
(`claude-work`, `claude-personal`) or by exporting a config directory before
launching. Silo had no representation of it, so every surface that wanted to
start an agent either hardcoded a binary name or punted to "open a shell and
type it yourself."

`TerminalKind`'s agent values were **vestigial**: the type was
`"shell" | "claude" | "pi"`, and `TerminalPanel` acted on it, but **nothing in
the repo created a terminal with those kinds.** Profiles therefore don't add a
concept; they replace a dead one. Three prerequisites had already shipped and
this builds on them: **RFC 0028** (terminal identity in the environment —
`SILO_*` is host-owned; profile identity belongs on the launch line, never in
the session env), **ADR 0041 / 0042** (the agent catalog is modular with
declarative `runtime` policy), and **ADR 0028** (sealed detection — no public
detector registration; not reopened here).

### Why phase 2 now

Phase 1 made profiles real but reachable only by **pointing** — the `+` menu and
a right-click submenu. Every other repeated action in Silo can be reached by
name: a chord, a menu item, eventually a palette entry. An agent launch is the
single most repeated action for this product's audience, and it is currently the
one that always costs a mouse.

The `default` flag is the same gap from the other side. Phase 1 deferred it
because a flag with no consumer is dead weight; phase 2 supplies both consumers
at once — the one command whose id survives a profile rename, and a bare
`silo agent run`.

And the CLI's launch half is already paid for. `tauri-plugin-single-instance`
forwards a second `silo` process's argv and cwd, `resolve_cli_request` parses
subcommands, the app emits `cli:open`, and `apps/desktop/src/cli/index.ts` acts
on it. `silo agent run --profile <id>` is one more arm in that parser and one
branch calling `launchAgentProfile`.

## Proposed solution

Phase 2 in one line: **a profile becomes addressable by its id, from a chord and
from a shell.**

- One `core.newAgent.<profileId>` command per profile, kept in sync with the
  list as profiles are added, renamed, reordered, and deleted.
- One `core.newAgent` command that launches the **default** profile — the flag's
  first gesture, and the only agent-launch command id stable enough to be worth
  binding permanently.
- `silo agent run --profile <id>` (and bare `silo agent run` → the default),
  resolving its target workspace from the shell's forwarded cwd.
- A dangling `core.newAgent.<id>` keybinding stops **swallowing** its chord, and
  renaming a profile that has one warns first.

Design detail lives in `design.md`; the behavioral contract in
`requirements.md`.

## What shipped in phase 1

- **`AgentProfile`** host record (`id`, `label`, `command`, optional
  `configDir`, optional `assumedAgentId`), a host state slice
  (`state/agent-profiles.ts`), persistence in the global index
  (`PersistedIndex.agentProfiles`), and load-hardening that drops malformed
  entries rather than failing hydration. `command` is a **string**, not an argv
  array — Silo launches by typing into an interactive login shell, never
  `exec`, so aliases / shell functions / version-manager shims resolve.
  `assumedAgentId` is matched from the command text (or an explicit editor
  override) — there is no save-time shell probe.
- **`AgentDefinition.configDirEnvVar`** — one new sealed-catalog field naming
  the env var an agent reads its config directory from. Populated for `claude`,
  `codex`, `grok`, `pi`; deliberately left undefined for `cursor-agent`,
  `opencode`, `copilot` (see "Per-agent recon" below).
- **`TerminalRecord.profileId`** (`@public`) — a back-reference written at
  launch and kept current (a profile rename sweeps it across every workspace; a
  delete clears it). **Substrate**: nothing reads it until resume composition
  (phase 4). `TerminalKind`'s `"claude"` / `"pi"` and `AgentInfo.kind` are
  `@deprecated` (kept for SDK-lag compatibility); a persisted record carrying a
  deprecated kind is normalized to `"shell"` at load.
- **The pending-launch model** — a launch is an _intent_, not a spawn.
  `launchAgentProfile` creates the terminal record and registers the intent;
  whoever brings the session up (the mounted panel, or `ensureSession`'s lazy
  spawn) drains it exactly once (`takePendingLaunch` is remove-on-read). See
  "The launch model" below.
- **`SILO_TERMINAL_ID` repair** — `ensureSession` now spawns through the
  privileged `spawnTerminalSession`, so a tab whose PTY comes up lazily (the
  normal path for an agent terminal) is stamped with its terminal id.
- **`ctx.agents.catalog()`** — `@beta` public SDK surface: read-only
  `CatalogAgentSummary[]` (`id`, `displayName`, `icon?`), memoized and deeply
  frozen. `AgentIconGlyph` moved into `@silo-code/sdk` and is now
  **data-driven** (takes an `AgentIcon`, not an `agentId`).
- **Surfaces** — the `+` menu lists profiles flat in their own section at the
  bottom, or a single "Add an agent profile…" entry when there are none; the
  terminal body context menu gains an **Agents** submenu mirroring that list;
  Settings → Agents gains a **Profiles** tab (first, default) with a `List` of
  profile rows, a "Found on this machine" one-click-add section, and a
  host-`Modal` editor. The **Hooks** tab is renamed **Sessions**.

## The launch model — an intent, not a spawn

`TerminalPanel` spawns its own session on mount; `terminal-service`'s
`ensureSession` (the `ctx.terminals.sendText` lazy-spawn fallback) spawns
through a different path with its own in-flight map. A launch that spawned on
its own would race the panel: two PTYs per launch, one leaked forever.

So the launch records an intent (`requestProfileLaunch(terminalId, profileId)`)
and whoever brings the session up drains it:

- **Foreground** — `TerminalPanel`, at the `setLifecycle({ kind: "ready" })`
  point, calls `drainPendingLaunch(terminalId, sessionId)`.
- **Background** — a workspace whose panel never mounts has no one to report
  readiness, so `launchAgentProfile` additionally calls `ensureSession` for that
  case (decided by comparing the target workspace to the active one). Phase 1
  had **no** surface that reached this branch and covered it by unit test alone;
  **`silo agent run` is its first real caller.**

`takePendingLaunch` removing the entry is the whole concurrency argument:
whichever path arrives second gets `null`. Pending launches live in a
module-level map and are **never persisted** — an intent that survived a restart
would type into a terminal the user reopened hours later. The launch line is
resolved from the profile **at drain time**, so an edit or delete landing in
between is respected (a deleted profile drains to nothing, leaving a plain
shell).

## What a profile may and may not claim

`assumedAgentId` is a **user assertion**, not an observation, and the field name
carries that. It **may** pick the `+` menu icon, select the `configDirEnvVar`
for the launch prefix, and (phase 4) supply resume flags. It **may never** be
written into `AgentInfo.agentId` or seed `AgentInfo.isAgent` — a profile-launched
terminal becomes an agent only when detection says so (ADR 0028). Detection
already handles the alias case within a second of the agent's first OSC title.
`docs/domain-language.md` records the `assumedAgentId` / `agentId` split.

## Per-agent recon: which agents get `configDirEnvVar`

Every catalog agent was probed on macOS (2026-08-31). The distinguishing
question is not "does an env var move the config directory" but **"does it move
the credentials too"** — the field's user-facing purpose is running two
accounts.

| Agent          | Env var                                              | Moves credentials?                    | `configDirEnvVar` |
| -------------- | ---------------------------------------------------- | ------------------------------------- | ----------------- |
| `claude`       | `CLAUDE_CONFIG_DIR`                                  | yes (`.claude.json`)                  | **set**           |
| `codex`        | `CODEX_HOME`                                         | yes (`auth.json`)                     | **set**           |
| `grok`         | `GROK_HOME`                                          | yes (`auth.json`)                     | **set**           |
| `pi`           | `PI_CODING_AGENT_DIR`                                | yes (`auth.json`)                     | **set**           |
| `cursor-agent` | `CURSOR_CONFIG_DIR`                                  | **no** — `auth.json` from `homedir()` | undefined         |
| `opencode`     | `OPENCODE_CONFIG_DIR`                                | **no** — `~/.local/share/opencode`    | undefined         |
| `copilot`      | — (`COPILOT_HOME` only extends a plugin search path) | n/a                                   | undefined         |

A field that appears to enable two accounts and silently doesn't is worse than
no field. Each negative finding is recorded in that agent's `contract`, and
`docs/adding-a-coding-agent.md` carries the "does it move the credentials too"
test so the next agent added answers it deliberately.

## The command line, and why its two halves split

The CLI's full surface, settled in phase 1 because it constrains the record:

```sh
silo agent run --profile claude-work   # launch that profile          → phase 2
silo agent run                         # no --profile → the default   → phase 2
                                       # …an interactive picker       → phase 9
silo agent list [--json]               # the profiles, with their ids → phase 9
```

`--profile` takes the id. **The id is a value a human types**, which is why ids
are user-authored, short, and editable rather than derived-and-frozen.

**The launch half needs no new IPC** — one more arm in `resolve_cli_request` and
one branch calling `launchAgentProfile`, resolving its workspace from the
forwarded cwd, which is frequently _not_ the active workspace. **The read-back
half genuinely waits** on a Control API: `cli:open` is fire-and-forget with no
channel back, so `silo agent list` and the interactive picker stay in phase 9.

## Phases

| Phase                                        | Scope                                                                                                                                                                                                                                                                                                                    | Status                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| **1 — Populate and use the `+` menu**        | The record, persistence, `configDirEnvVar`, `TerminalRecord.profileId` + `TerminalKind` deprecation, the pending-launch model (+ the `SILO_TERMINAL_ID` repair), the Profiles settings tab, the `+` menu and the terminal context menu's Agents submenu, `ctx.agents.catalog()` + icon relocation, Hooks → Sessions rename. | **shipped** (2026-09-01)  |
| **2 — Addressing a profile by name**         | One `core.newAgent.<profileId>` command per profile (bindable, palette-ready) plus a generic `core.newAgent`; the `default` flag and its two gestures; **`silo agent run [--profile <id>]`** (needs no new IPC, first real caller of the background launch branch); dangling command ids after a delete or rename.          | **in progress** (planned) |
| 3 — Prompt delivery                          | `promptDelivery` on `AgentDefinition`, quoted-heredoc transport, line-editor sanitization.                                                                                                                                                                                                                                | planned                   |
| 4 — Resume composition                       | Split `buildResumeCommand` into catalog-owned `resumeArgs` + the profile's command and env prefix. First consumer of `profileId`.                                                                                                                                                                                         | planned                   |
| 5 — `ctx.agents.profiles`                    | Public `list()` / `launch()`. First consumer is RFC 0031's deferred **Start Task**.                                                                                                                                                                                                                                       | planned                   |
| 6 — Per-account hooks                        | Install strategies keyed on `(agentId, configDir)`. Depends on Managed Hooks.                                                                                                                                                                                                                                             | planned                   |
| 7 — `SILO_AGENT_PROFILE` + hook confirmation | RFC 0028 designed the seam; deferred until a surface branches on "confirmed" vs "assumed".                                                                                                                                                                                                                                | planned                   |
| 8 — Per-workspace default profile            | Bind a workspace to a profile so "new agent" does the right thing per repo with no menu.                                                                                                                                                                                                                                  | planned                   |
| 9 — CLI read-back (`silo agent list`)        | `silo agent list [--json]` and bare `silo agent run`'s interactive **picker** — the parts that must return data to the caller's stdout.                                                                                                                                                                                   | planned                   |

## Scope

In, for phase 2 — all in this repo (`silo-code/silo`):

- `packages/extension-host` — `AgentProfile.default` and its state seam,
  persistence + load-hardening, the keybinding-dispatch fix.
- `packages/extensions-core/src/agents-settings` — the command registrations and
  their sync to the profile list; the default star, the "Set as default" action,
  and the rename warning.
- `apps/desktop/src-tauri/src/commands/cli.rs` — the `agent run` arm and real
  `--profile` flag parsing.
- `apps/desktop/src/cli` — the `agent-run` dispatch and workspace resolution.
- `apps/docs/guide/cli.md`, `apps/docs/roadmap.md`, `docs/domain-language.md`.

Explicitly out:

- Any `@silo-code/sdk` addition. Phase 5 owns the public profile surface.
- `silo agent list`, `--json`, and the interactive picker (phase 9).
- A command palette. The commands are palette-**ready**; Silo has none yet, and
  building one is not this proposal's business.
- Rewriting the user's `keybindings.json` on a profile rename — see the
  alternative below.

## Alternatives considered

- **An argv array instead of a command string.** Implies `exec`; `exec` doesn't
  source the rc file, so every alias / shell function / version-manager shim
  stops resolving. `$SHELL -lc "…"` fails the same way (non-interactive).
  Rejected on the mechanics.
- **An agent-agnostic runner.** Large surface, breaks on every upstream agent
  release, duplicates what the TUIs do well. If ever wanted, it is an
  **extension** on `ctx.agents.profiles` + `ctx.terminals`.
- **A free-form `env` map on the profile.** The attractor for API keys in
  plaintext settings; breaks resume composition; redundant with an alias.
  `configDir` is the narrow version.
- **A derived, immutable profile id.** Optimised for the machine's references
  and ignored the one with a human in it — the id is typed at
  `silo agent run --profile <id>`, so it must be short, memorable, chosen, and
  allowed to change with the mental model. Dead phase-2 keybindings are the one
  real loss, and phase 2 mitigates it by warning rather than forbidding.
- **Carrying a keybinding across a profile rename** (rewrite the user's
  `keybindings.json` entry from the old command id to the new one). Rejected for
  phase 2: `keybindings.json` is a hand-editable user file with an editor escape
  hatch, and `saveUserBindings` rewrites it wholesale, dropping comments and
  formatting. Silently rewriting a config file as a side effect of renaming a
  profile is a bigger surprise than a shortcut that stops working after an
  explicit warning. Reconsider if renames turn out to be common.
- **Pruning dangling `core.newAgent.<id>` entries from `keybindings.json` on
  delete.** Rejected: it is deleting user data unprompted (ADR 0046), and it is
  unnecessary once dispatch simply ignores bindings whose command is not
  registered. A kept entry also revives correctly if the user recreates the
  profile with the same id.
- **Seeding profiles automatically on first run.** Probing `command -v` misses
  aliases; probing an interactive shell means running the user's rc file
  unprompted. The empty `+` menu entry plus "Found on this machine" cards get
  the same result at the moment of intent.
- **Extension-contributed profiles.** A marketplace of extensions injecting
  shell commands into a user's terminal is a real trust surface. Rejected for
  v1.
- **Removing `TerminalKind` outright.** Breaking change to published `@public`
  API against a third-party ecosystem with known SDK lag. Deprecate now, remove
  behind `engine-compat.ts` later.

## Decision

**Accepted** 2026-08-31; **phase 1 implemented** 2026-09-01; **phase 2 in
progress.** Phases 3–9 stay planned with the direction above; each gets its own
planning package when it starts. The durable architectural note phase 1
contributed is recorded as an amendment to **ADR 0046** (the converse: the host
never creates user data unprompted) — phase 2 leans on the original direction of
that same ADR for the dangling-keybinding decision.
