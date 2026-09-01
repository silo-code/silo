---
status: accepted # phase 1 shipped; phases 2–9 remain — see the phase table
created: 2026-08-31
---

# 0033. Agent Profiles — naming how you start an agent

**Phase 1 shipped 2026-09-01.** This is the collapsed record: the durable
intent, the decisions that outlive the planning package, and what phase 1
actually delivered. The `status` stays `accepted` because phases 2–9 are still
planned; it becomes `implemented` only once every committed phase has shipped.
Each later phase re-expands into `docs/proposals/0033-agent-profiles/` with its
own `requirements.md` / `design.md` / `tasks.md`.

## Summary

**Agent Profile** is a named, user-defined recipe for starting a coding agent in
a terminal: a label, a shell command line (`claude`, `claude-work`,
`cursor-agent`), an optional config directory for agents that support one, and
an optional hint about which catalog agent it launches.

Profiles are host-owned and user-defined. They appear in the `+` menu and the
terminal context menu's **Agents** submenu, they are managed on a **Profiles**
tab of Settings → Agents, and they replace
`TerminalKind`'s two vestigial agent values
(`"claude"` / `"pi"`) — which nothing in the app created — as the app's
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
`"shell" | "claude" | "pi"`, and `TerminalPanel` acted on it —

```ts
if (needsCreate && tRec.kind !== "shell") {
  const cmd = tRec.kind === "claude" ? "claude" : "pi";
  window.setTimeout(() => session.write(`${cmd}\r`), 150);
}
```

— but **nothing in the repo created a terminal with those kinds.** Profiles
therefore don't add a concept; they replace a dead one. Three prerequisites had
already shipped and this builds on them: **RFC 0028** (terminal identity in the
environment — `SILO_*` is host-owned; profile identity belongs on the launch
line, never in the session env), **ADR 0041 / 0042** (the agent catalog is
modular with declarative `runtime` policy), and **ADR 0028** (sealed detection —
no public detector registration; not reopened here).

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
  spawn) drains it exactly once (`takePendingLaunch` is remove-on-read). The
  `kind`-based shim in `TerminalPanel` is gone. See "The launch model" below.
- **`SILO_TERMINAL_ID` repair** — `ensureSession` now spawns through the
  privileged `spawnTerminalSession`, so a tab whose PTY comes up lazily (the
  normal path for an agent terminal, and the pre-existing `ctx.terminals
.sendText`-on-a-never-shown-tab gap) is stamped with its terminal id.
- **`ctx.agents.catalog()`** — new `@beta` public SDK surface: read-only
  `CatalogAgentSummary[]` (`id`, `displayName`, `icon?`), memoized and deeply
  frozen. `agent-icons.ts` moved from `packages/extensions-silo` into the host
  beside the sealed catalog; `AgentIconGlyph` moved into `@silo-code/sdk` and is
  now **data-driven** (takes an `AgentIcon`, not an `agentId`), with its
  `AgentIconMode` union public. `silo.agents` deleted its local copies.
- **Surfaces** — the `+` menu lists profiles flat in their own section at the
  bottom (below a separator), or a single "Add an agent profile…" entry when
  there are none; the terminal body context menu gains an **Agents** submenu
  mirroring that list (omitted with no profiles — it is not an onboarding
  surface); Settings → Agents gains a **Profiles** tab (first, default) with a
  `List` of profile rows, a "Found on this machine" one-click-add section below
  them, and a
  host-`Modal` editor (label / id / command / agent picker / config directory
  with the three-state visibility rule / launch-line preview + Copy). The
  **Hooks** tab is renamed **Sessions**.

  The two launch surfaces differ deliberately. The **`+` menu** opens a new
  terminal that Silo owns — it carries `profileId`. The **Agents submenu** types
  the profile's launch line into the terminal you right-clicked, exactly as if
  you'd typed it: that terminal keeps **no** `profileId` (a hand-typed launch
  Silo happens to have spelled for you), and its agent identity comes from
  detection like any other. An earlier flat "_&lt;label&gt;_ here" variant was
  dropped — beside "New Terminal Here" it read as in-place while the code opened
  a new terminal; the submenu makes "in this terminal" unambiguous.

### Two deliberate deviations from the original RFC sketch

1. **`create()` does not synthesize a profile, and persisted records get no
   `profileId`.** The RFC's first draft had
   `ctx.terminals.create({ kind: "claude" })` "synthesize a matching profile"
   and migrated persisted `"claude"` records to `"shell"` **plus a
   `profileId`**. Both dropped: silently adding a row to a user-owned list the
   whole design otherwise promises is empty until the user acts is a worse trade
   than losing a back-reference nobody can act on. The compatibility path
   launches a matching profile _if one exists_, else types the bare command —
   observable behavior unchanged. This is now recorded as the converse of ADR
   0046 ("the host never _creates_ user data unprompted either").
2. **The launch is an intent, not a `create → ensureSession → write`
   sequence.** The RFC sketched the host owning that sequence; reading the
   terminal code showed it races the panel for the PTY (two spawn paths, one
   leaked session per launch). The intent-registry — the same shape as
   `editor-reveal.ts` / `panel-activation-requests.ts` (ADR 0034) — replaces it.

## The launch model — an intent, not a spawn

`TerminalPanel` spawns its own session on mount; `terminal-service`'s
`ensureSession` (the `ctx.terminals.sendText` lazy-spawn fallback) spawns
through a different path with its own in-flight map. The `+` menu opens the
panel and calls the launch in the same tick, so a launch that spawned on its
own would race the panel: two PTYs per launch, one leaked forever.

So the launch records an intent (`requestProfileLaunch(terminalId, profileId)`)
and whoever brings the session up drains it:

- **Foreground** — `TerminalPanel`, at the `setLifecycle({ kind: "ready" })`
  point the deleted shim used, calls `drainPendingLaunch(terminalId,
sessionId)`.
- **Background** — a workspace whose panel never mounts has no one to report
  readiness, so `launchAgentProfile` additionally calls `ensureSession` for that
  case (decided by comparing the target workspace to the active one). **No
  phase-1 surface reaches this branch** — both menus target the active
  workspace — so it is verified by unit test. It is built now for
  `silo agent run --profile <id>` (phase 2, resolves its workspace from a
  shell's cwd) and `ctx.agents.profiles.launch({ workspaceId })` (phase 5).

`takePendingLaunch` removing the entry is the whole concurrency argument:
whichever path arrives second gets `null`. Pending launches live in a
module-level map and are **never persisted** — an intent that survived a restart
would type into a terminal the user reopened hours later. The launch line is
resolved from the profile **at drain time**, so an edit or delete landing in
between is respected (a deleted profile drains to nothing, leaving a plain
shell). The drain is trigger-agnostic so phase 2's `silo agent run` inside a
live terminal can add a caller that drains on a different signal.

## What a profile may and may not claim

`assumedAgentId` is a **user assertion**, not an observation, and the field name
carries that. It **may** pick the `+` menu icon, select the `configDirEnvVar`
for the launch prefix, and (phase 4) supply resume flags. It **may never** be
written into `AgentInfo.agentId` or seed `AgentInfo.isAgent` — a profile-launched
terminal becomes an agent only when detection says so (ADR 0028). Detection
already handles the alias case within a second of the agent's first OSC title;
seeding identity from the profile would buy that second and cost a permanent
phantom agent row whenever the command doesn't resolve. `docs/domain-language.md`
records the `assumedAgentId` / `agentId` split.

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
`docs/adding-a-coding-agent.md` now carries the "does it move the credentials
too" test so the next agent added answers it deliberately. Operational detail:
`codex` does not create `CODEX_HOME` if missing, so the profile editor stats the
directory and offers to create it.

## The command line, and why its two halves split

The CLI's full surface is settled here because it constrains the record:

```sh
silo agent run --profile claude-work   # launch that profile        → phase 2
silo agent run                         # pick from a menu, then launch → phase 9
silo agent list [--json]               # the profiles, with their ids  → phase 9
```

`--profile` takes the id. **The id is a value a human types**, which is why ids
are user-authored, short, and editable rather than derived-and-frozen.

**The launch half needs no new IPC.** `tauri-plugin-single-instance` already
forwards a second `silo` process's argv and cwd, `resolve_cli_request` parses
subcommands, the app emits `cli:open`, and `apps/desktop/src/cli/index.ts` acts
on it. `silo agent run --profile <id>` is one more arm in that parser and one
branch calling `launchAgentProfile`, resolving its workspace from the forwarded
cwd — which is frequently _not_ the active workspace, the background branch's
first real caller. **The read-back half genuinely waits** on a Control API:
`cli:open` is fire-and-forget with no channel back, so `silo agent list` and
bare `silo agent run`'s picker stay in phase 9.

## Phases

| Phase                                        | Scope                                                                                                                                                                                                                                                                                                                       | Status                   |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **1 — Populate and use the `+` menu**        | The record, persistence, `configDirEnvVar`, `TerminalRecord.profileId` + `TerminalKind` deprecation, the pending-launch model (+ the `SILO_TERMINAL_ID` repair), the Profiles settings tab, the `+` menu and the terminal context menu's Agents submenu, `ctx.agents.catalog()` + icon relocation, Hooks → Sessions rename. | **shipped** (2026-09-01) |
| 2 — Addressing a profile by name             | One `core.newAgent.<profileId>` command per profile (palette-searchable, bindable); the `default` flag; **`silo agent run --profile <id>`** (needs no new IPC). New problem: dangling command ids after a delete.                                                                                                           | planned                  |
| 3 — Prompt delivery                          | `promptDelivery` on `AgentDefinition`, quoted-heredoc transport, line-editor sanitization.                                                                                                                                                                                                                                  | planned                  |
| 4 — Resume composition                       | Split `buildResumeCommand` into catalog-owned `resumeArgs` + the profile's command and env prefix. First consumer of `profileId`.                                                                                                                                                                                           | planned                  |
| 5 — `ctx.agents.profiles`                    | Public `list()` / `launch()`. First consumer is RFC 0031's deferred **Start Task**.                                                                                                                                                                                                                                         | planned                  |
| 6 — Per-account hooks                        | Install strategies keyed on `(agentId, configDir)`. Depends on Managed Hooks.                                                                                                                                                                                                                                               | planned                  |
| 7 — `SILO_AGENT_PROFILE` + hook confirmation | RFC 0028 designed the seam; deferred until a surface branches on "confirmed" vs "assumed".                                                                                                                                                                                                                                  | planned                  |
| 8 — Per-workspace default profile            | Bind a workspace to a profile so "new agent" does the right thing per repo with no menu.                                                                                                                                                                                                                                    | planned                  |
| 9 — CLI read-back (`silo agent list`)        | `silo agent list [--json]` and bare `silo agent run`'s picker — the parts that must return data to the caller's stdout.                                                                                                                                                                                                     | planned                  |

Phases 2–9 keep the direction stated here and in the phase-1 planning package's
history; each re-expands into its own package when its turn comes.

## Prior art

Six of eight comparable tools surveyed (2026-08-31) ship a version of this
(Orca, Superset, Paseo, cmux, Claude Squad, AgentsRoom), so the concept is
settled rather than novel. What differs is the layer it sits in, and that falls
cleanly on launch mechanism. What this design takes from the survey: **a command
string, not an argv array** (an argv array implies `exec`, which doesn't source
the user's rc file); **the command belongs in the list row** (what makes two
config-dir-only-different profiles distinguishable); **add from a catalog** plus
detection ("Found on this machine"); **one form for builtin and custom**. What
it deliberately doesn't take: a Command + Arguments two-field split (can't
express an alias), an icon picker as the primary mechanism (detection resolves
it), an accounts-as-a-separate-page subsystem (premature for one `configDir`
field), a first-run wizard.

Multi-account is a real product surface, not a footnote — AgentsRoom's whole
product is it, with a resolution order (per-agent override → per-project pin →
global default → system `~/.claude`) worth returning to at phase 8.

## Alternatives considered

- **An argv array instead of a command string.** Implies `exec`; `exec` doesn't
  source the rc file, so every alias / shell function / version-manager shim
  stops resolving. `$SHELL -lc "…"` fails the same way (non-interactive).
  Rejected on the mechanics.
- **An agent-agnostic runner.** Large surface, breaks on every upstream agent
  release, duplicates what the TUIs do well, and no scenario here needs it. If
  ever wanted, it is an **extension** on `ctx.agents.profiles` + `ctx.terminals`.
- **A free-form `env` map on the profile.** The attractor for API keys in
  plaintext settings; breaks resume composition; redundant with an alias.
  `configDir` is the narrow version. Reconsider only if `ctx.secrets` lands with
  a real consumer.
- **A derived, immutable profile id.** Optimised for the machine's references
  and ignored the one with a human in it — the id is typed at
  `silo agent run --profile <id>`, so it must be short, memorable, chosen, and
  allowed to change with the mental model. Only dead phase-2 keybindings are a
  real loss, with an obvious mitigation (warn on rename).
- **A "Test launch" button.** Copying the launch line proves more (it exercises
  the user's real shell) and doesn't pull the user out of Settings or need a
  cleanup rule.
- **Seeding profiles automatically on first run.** No detection is complete
  enough to seed from silently — a directory probe misses an unusual prefix, and
  probing an interactive shell to do better means running the user's rc file
  unprompted (see "Detecting agents through `PATH`" below). The empty `+` menu
  entry plus "Found on this machine" cards get the same result at the moment of
  intent, with a click behind it.
- **Detecting agents through `PATH`.** What phase 1 shipped, and it found
  nothing in a release build: a `.app` launched from Finder/Dock inherits
  launchd's minimal `PATH`, so `command -v` missed all seven catalog agents,
  and "Found on this machine" hid itself as designed. Silo's terminals never hit
  this because they run `$SHELL -l`; the scan runs in the app process, which
  doesn't. Resolving the login shell's `PATH` at startup instead (VS Code's
  approach, which Paseo adapts) was rejected: ~9s of interactive shell startup
  measured with nvm in `.zshrc`, it runs the user's rc files unprompted — the
  same objection as auto-seeding above — and it still reports an alias-only
  agent as alias text rather than a binary. Detection now probes known install
  directories directly (`agent-install-locations.ts`): ~40ms, no subprocess, and
  it found one _more_ agent than the shell did. The cost is a curated list that
  can miss an unusual prefix, which is what the hand-typed "Add an agent
  profile…" row is for.
- **Extension-contributed profiles.** A marketplace of extensions injecting
  shell commands into a user's terminal is a real trust surface. Rejected for
  v1; an extension that wants a different agent asks the user.
- **Removing `TerminalKind` outright.** Breaking change to published `@public`
  API against a third-party ecosystem with known SDK lag. Deprecate now, remove
  behind `engine-compat.ts` later.

## Decision

**Accepted** 2026-08-31; **phase 1 implemented** 2026-09-01. Phases 2–9 stay
planned with the direction above; each gets its own planning package when it
starts. The durable architectural note this change contributes is recorded as an
amendment to **ADR 0046** (the converse: the host never creates user data
unprompted).
