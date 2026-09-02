---
status: accepted # phases 1–2 shipped; phase 3 in progress; phases 4–9 remain
created: 2026-08-31
---

# 0033. Agent Profiles — naming how you start an agent

**Phases 1 and 2 shipped 2026-09-01.** Everything below the planning scope is
the collapsed record: the durable intent, the decisions that outlive each
planning package, and what each phase actually delivered. The `status` stays
`accepted` because phases 4–9 are still planned; it becomes `implemented` only
once every committed phase has shipped.

## Planning scope

**This package covers phase 3 — "Prompt delivery" — only.**

Phases 1 and 2 shipped 2026-09-01 and were collapsed back into the durable
proposal before this package was written. Treat them as the **implementation
baseline**: the `AgentProfile` record and its persistence, the pending-launch
model, `TerminalRecord.profileId`, `ctx.agents.catalog()`, the `+` menu, the
terminal **Agents** submenu, Settings → Agents → **Profiles**, the
`core.newAgent.<id>` commands, the `default` flag, and
`silo agent run [--profile <id>] [--ws <folder|.|id>]` all exist and work. Do
not re-plan or re-implement any of it.

Phase 3 answers one question the proposal has deferred since it was written:
**how does Silo hand a coding agent its opening prompt?** Today it cannot. The
only mechanism a caller has is `ctx.terminals.sendText`, which types raw bytes
into a live shell — and the original RFC named that as the highest-severity
idea in its first sketch, because a quoting bug there is arbitrary code
execution as the user. Phase 3 builds the safe answer and proves it:

1. **`AgentDefinition.promptDelivery`** — one sealed-catalog field saying how
   (or whether) each agent accepts an opening prompt, established by the same
   empirical recon `configDirEnvVar` got. An agent with no reconned answer
   refuses a prompt rather than guessing.
2. **The transport** — the payload rides in a **quoted heredoc**, never
   interpolated into the launch line, so expansion and quoting are dead by
   construction and a multi-line or very long prompt is no special case.
3. **Line-editor sanitization** — the bytes are _typed_, so they reach the
   shell's line editor as keystrokes. ESC and C1 sequences fire keybindings, a
   lone CR submits the line early, and a tab triggers completion. The prompt is
   sanitized before it is ever composed into a line.
4. **`silo agent run --prompt <text>`** — the transport's first caller.
5. **The Profiles tab says whether a prompt is possible at all** — whether an
   agent can take an opening prompt is a static fact about the profile, so it
   belongs where the profile is authored, not only in a runtime refusal. This
   is also what keeps the CLI flag honest against ADR 0047: a Forward-mode
   command must not hide configuration errors behind silence.

Item 4 is a **deliberate scope addition to the phase table**, made when this
package was planned and recorded in the durable proposal's "The command line"
section. Without it phase 3 ships three pieces of transport that nothing calls
until phase 5 — whose own first consumer (RFC 0031's **Start Task**) lives in
`silo-code/silo-extensions` and rides the _published_ SDK, so it could not
exercise this for months. This repo grows in layers that already work, and
`--prompt` is the cheapest honest consumer: phase 2 built the whole
`silo agent run` path, so the flag is a few lines of parser plus a field, and
it makes every requirement below verifiable by a human at a real shell.

Out of scope, and unchanged from the phase table below: resume composition
(phase 4), the public `ctx.agents.profiles` surface including
`launch({ prompt })` (phase 5), per-account hooks (phase 6),
`SILO_AGENT_PROFILE` (phase 7), per-workspace defaults (phase 8), and the CLI's
read-back half (phase 9). Phase 3 builds the prompt seam **host-internal**; it
deliberately does not publish it.

Phase 3 adds **no `@silo-code/sdk` surface**. `promptDelivery` is a field on the
sealed host catalog, the sanitizer and transport are host-internal, and
`--prompt` is a CLI flag. The docs-sync workflow and the roadmap's
`ctx.agents.profiles` badge are therefore untouched. The **user-facing CLI
guide** (`apps/docs/guide/cli.md`), `silo --help`, and the agent-recon guide
(`docs/adding-a-coding-agent.md`) are not — they all change in this phase.

## Summary

**Agent Profile** is a named, user-defined recipe for starting a coding agent in
a terminal: a label, a shell command line (`claude`, `claude-work`,
`cursor-agent`), an optional config directory for agents that support one, and
an optional hint about which catalog agent it launches.

Profiles are host-owned and user-defined. They can be **pointed at** — the `+`
menu, the terminal context menu's **Agents** submenu — and, since phase 2,
**named**: a `core.newAgent.<id>` command per profile (bindable on the Keyboard
Shortcuts page), a generic `core.newAgent` that launches whichever profile is
marked **default**, and `silo agent run [--profile <id>]` from a shell. They are
managed on a **Profiles** tab of Settings → Agents, and they replace
`TerminalKind`'s two vestigial agent values (`"claude"` / `"pi"`) — which
nothing in the app created — as the app's launch-time vocabulary for "which
agent."

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

Phase 1 made profiles real but reachable only by _pointing_. Every other
repeated action in Silo can be reached by name — a chord, a menu item,
eventually a palette entry — and starting an agent is the single most repeated
action for this product's audience. Phase 2 makes a profile addressable by its
id, from a chord and from a shell.

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
- **`AgentDefinition.configDirEnvVar`** — one sealed-catalog field naming the
  env var an agent reads its config directory from. Populated for `claude`,
  `codex`, `grok`, `pi`; deliberately left undefined for `cursor-agent`,
  `opencode`, `copilot` (see "Per-agent recon" below).
- **`TerminalRecord.profileId`** (`@public`) — a back-reference written at
  launch and kept current (a profile rename sweeps it across every workspace; a
  delete clears it). Nothing reads it until resume composition (phase 4).
  `TerminalKind`'s `"claude"` / `"pi"` and `AgentInfo.kind` are `@deprecated`
  (kept for SDK-lag compatibility); a persisted record carrying a deprecated
  kind is normalized to `"shell"` at load.
- **The pending-launch model** — a launch is an _intent_, not a spawn.
  `launchAgentProfile` creates the terminal record and registers the intent;
  whoever brings the session up (the mounted panel, or `ensureSession`'s lazy
  spawn) drains it exactly once (`takePendingLaunch` is remove-on-read). The
  `kind`-based shim in `TerminalPanel` is gone. See "The launch model" below.
- **`SILO_TERMINAL_ID` repair** — `ensureSession` spawns through the privileged
  `spawnTerminalSession`, so a tab whose PTY comes up lazily (the normal path
  for an agent terminal) is stamped with its terminal id.
- **`ctx.agents.catalog()`** — `@beta` public SDK surface: read-only
  `CatalogAgentSummary[]` (`id`, `displayName`, `icon?`), memoized and deeply
  frozen. `AgentIconGlyph` moved into `@silo-code/sdk` and is now data-driven
  (takes an `AgentIcon`, not an `agentId`), with its `AgentIconMode` union
  public.
- **Surfaces** — the `+` menu lists profiles flat in their own section at the
  bottom, or a single "Add an agent profile…" entry when there are none; the
  terminal body context menu gains an **Agents** submenu mirroring that list
  (omitted with no profiles); Settings → Agents gains a **Profiles** tab (first,
  default) with a `List` of profile rows, a "Found on this machine"
  one-click-add section, and a host-`Modal` editor. The **Hooks** tab is renamed
  **Sessions**.

  The two phase-1 launch surfaces differ deliberately. The **`+` menu** opens a
  new terminal that Silo owns — it carries `profileId`. The **Agents submenu**
  types the profile's launch line into the terminal you right-clicked, exactly
  as if you'd typed it: that terminal keeps **no** `profileId`, and its agent
  identity comes from detection like any other.

### Two deliberate deviations from the original RFC sketch (phase 1)

1. **`create()` does not synthesize a profile, and persisted records get no
   `profileId`.** The RFC's first draft had
   `ctx.terminals.create({ kind: "claude" })` synthesize a matching profile and
   migrate persisted `"claude"` records to `"shell"` plus a `profileId`. Both
   dropped: silently adding a row to a user-owned list the design otherwise
   promises is empty until the user acts is a worse trade than losing a
   back-reference nobody can act on. Recorded as the converse of **ADR 0046**.
2. **The launch is an intent, not a `create → ensureSession → write`
   sequence.** The RFC sketched the host owning that sequence; reading the
   terminal code showed it races the panel for the PTY. The intent-registry —
   the same shape as `editor-reveal.ts` / `panel-activation-requests.ts`
   (ADR 0034) — replaces it.

## What shipped in phase 2

- **A command per profile** — `core.newAgent.<profileId>`, reconciled against
  the live list by `registerProfileCommands` (`extensions-core/src/agents-settings/profile-commands.ts`,
  wired from `core.agents-settings`' `activate`): an add registers, a delete
  disposes, an **id rename is a dispose plus an add** (the old command id must
  stop existing — that is what makes a stale keybinding go inert, below), a
  label change re-registers. Label is `New Agent: <profile label>`. `run` is the
  `+` menu's launch minus dock placement: active workspace → `pickWorkspaceFolder`
  → `launchAgentProfile` (adding the terminal record is what makes a tab appear,
  like `core.newTerminal`).
- **A generic `core.newAgent`** — registers once at activation, never
  re-registers (that stable id is the point — a binding to it survives any
  profile rename). Launches `resolveDefaultProfile(profiles)`: the profile
  flagged `default`, else the first in list order, else opens Settings → Agents
  (the `+` menu's empty-state behavior).
- **`AgentProfile.default`** — an optional flag, at most one profile carries it.
  `setDefaultAgentProfile(id)` clears it from every other profile in the **same
  mutation**. Set/cleared only by an explicit gesture on the Profiles tab (⋮ →
  Set as default / Clear default; the row shows a `Default` badge). Nothing
  infers it — not on first creation, not on migration, **not on delete of the
  current default** (no successor is promoted). Load-hardening: `default` is
  copied only when strictly `true`, and a hand-edited file with several defaults
  keeps the flag on the first claiming entry.
- **`silo agent run [--profile <id>] [--ws <folder|.|id>]`** — one arm in
  `resolve_cli_request` (`apps/desktop/src-tauri/src/commands/cli.rs`). `agent`
  is a **reserved noun** (ADR 0047): it never resolves to a path, so
  `silo agent`, `silo agent list`, and any other unknown verb become
  `action: "agent-usage"` (a usage line on the Output panel) rather than
  quietly opening a folder — `./agent` and `silo -- agent` are the escapes, and
  the parser now honors `--` as force-path. Flag parsing is one `flag_value`
  helper understanding `--flag <v>` and `--flag=<v>`, ignoring a valueless
  trailing flag and refusing a value that is itself a flag. `CliRequest` gains
  one field, `ws` (a `ws_`-prefixed value passes through as an id; anything
  else resolves against the shell's cwd), alongside the reused `id` (profile)
  and `path` (forwarded cwd). `apps/desktop/src/cli/agent-run-handler.ts`
  resolves the profile (miss → Output-panel warning on `silo:application`,
  nothing created), then the workspace: an exact `--ws` match, else **cwd
  containment** (`findWorkspaceContaining` in `open-handler.ts` —
  segment-boundary aware, ranked by ADR 0047's tie-breaks: deepest root, open
  over soft-closed, primary over `extraFolders`, then the active one).
  **Neither rung creates a workspace** — a cwd inside none is an error, per
  ADR 0047's rule that only `silo <dir>` may create. Then **launches,
  activates, focuses** in that order; activating reopens a soft-closed match.
  The terminal's cwd is the forwarded cwd **when that is inside the target** —
  the point of inferring a workspace from it — and otherwise the root the
  caller named, since an explicit `--ws` elsewhere makes the shell's directory
  irrelevant to that workspace. This is the
  first real caller of `launchAgentProfile`'s background branch (phase 1 built
  it, covered by unit test only).
- **A dangling profile command never swallows a chord** — `dispatchOverrideOnly`
  (`extension-host/keybindings.ts`) matched a chord, called `preventDefault` /
  `stopPropagation` / `executeCommand`, and returned `true` **before** checking
  the command exists — so a deleted profile left a chord that ate keys and did
  nothing. Now it skips an override whose command is not in `commandRegistry`
  before consuming the keystroke. The `keybindings.json` entry is **kept, not
  pruned** (it is user data — ADR 0046 — and revives if a profile with that id
  is recreated).
- **Rename warning** — changing a profile's id in the editor, when a user
  binding (override or unbind) exists on `core.newAgent.<currentId>`, asks for
  confirmation naming the chord in its display form. Cancel abandons the save.
  The pure decision is `renameRetiresBinding` (`agent-profile-model.ts`);
  `overrideKey` / `isRemoved` (not `effectiveKey`) decide whether to warn, since
  only a user binding is a loss.
- **`profileCommandId(id)`** is the one place `` `core.newAgent.${id}` `` is
  spelled, so the command sync and the editor's rename check cannot drift.
  Profile ids match `^[a-z0-9][a-z0-9-]*$`, so no id can inject a `.`.

### The subscription-survival fix (phase 2)

`core.agents-settings` activates in `activateBuiltins()` — synchronous, before
render — and subscribes to `store.agentProfiles` there, while `hydrate` runs
later on its own async chain. Hydrate used to do
`store.agentProfiles = loadAgentProfiles(…)`, swapping the valtio proxy out from
under that subscription — so `reconcile` never saw the persisted profiles and no
per-profile command ever registered (the generic one was unaffected — its `run`
reads `getAgentProfiles()` fresh). Fixed at the source: `hydrate` calls
`replaceAgentProfiles()` (`state/agent-profiles.ts`), which `splice`s the list
in place, keeping the array identity. This also closed a latent phase-1 hole —
an `AgentsProfilesPanel` mounting during the hydrate window had the same dead
subscription. **Any future pre-hydrate subscriber to a store collection must
rely on the collection being mutated in place, never reassigned.**

### Phase-2 deviations from the phase-1 sketch

- **`default` deferred out of phase 1 shipped in phase 2** as planned — phase 1
  had no gesture to hang it off; phase 2 supplies two (`core.newAgent` and a
  bare `silo agent run`).
- **Bare `silo agent run` launches the default profile in phase 2**; the
  original sketch had it open an interactive picker, which stays phase 9 (it
  must return data to the caller's stdout). "Default, else first" keeps bare-run
  useful in the meantime.
- **No `renameRetiresBinding`-driven rewrite of `keybindings.json`.** Carrying a
  keybinding across a rename, or pruning a dangling one, are both rejected —
  `keybindings.json` is a hand-editable user file, and rewriting it as a side
  effect of a rename is a bigger surprise than a shortcut that stops working
  after an explicit warning.

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
  case (decided by comparing the target workspace to the active one). `silo
agent run` (phase 2) is its first real caller — it launches into the workspace
  the shell's cwd resolves to, then activates. `ctx.agents.profiles.launch({
workspaceId })` (phase 5) is the next.

`takePendingLaunch` removing the entry is the whole concurrency argument:
whichever path arrives second gets `null`. Pending launches live in a
module-level map and are **never persisted** — an intent that survived a restart
would type into a terminal the user reopened hours later. The launch line is
resolved from the profile **at drain time**, so an edit or delete landing in
between is respected (a deleted profile drains to nothing, leaving a plain
shell).

> **Known pre-existing issue** (not introduced by either phase): the launch line
> is occasionally typed twice. `TerminalPanel`'s init effect (deps
> `[terminalId, version]`) can re-run — React StrictMode double-invoke in dev,
> or a fast remount — and the first `init()` spawns a PTY then bails at the
> `cancelled` check without killing that session (unlike `ensureSession`, which
> reaps its orphan). Intermittent; observed in phase 1. Worth its own fix.

## What a profile may and may not claim

`assumedAgentId` is a **user assertion**, not an observation, and the field name
carries that. It **may** pick the `+` menu icon, select the `configDirEnvVar`
for the launch prefix, and (phase 4) supply resume flags. It **may never** be
written into `AgentInfo.agentId` or seed `AgentInfo.isAgent` — a profile-launched
terminal becomes an agent only when detection says so (ADR 0028). Detection
already handles the alias case within a second of the agent's first OSC title.
`docs/domain-language.md` records the `assumedAgentId` / `agentId` split and the
**default profile** term.

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
test so the next agent added answers it deliberately. Operational detail:
`codex` does not create `CODEX_HOME` if missing, so the profile editor stats the
directory and offers to create it.

## The command line

The grammar these forms sit in — `agent` as a reserved noun, the `--ws`
spelling, and which execution mode each half needs — is
[ADR 0047](../decisions/0047-cli-command-grammar.md). This proposal owns the
verbs; that ADR owns the shape.

```sh
silo agent run --profile claude-work   # launch that profile             → shipped (phase 2)
silo agent run                         # no --profile → the default        → shipped (phase 2)
silo agent run --ws ~/code/app         # …in a named workspace             → shipped (phase 2)
silo agent run --prompt "fix the CI"   # …and hand it an opening prompt    → phase 3
                                       # …an interactive picker            → phase 9
silo agent list [--json]               # the profiles, with their ids      → phase 9
```

`--profile` takes the id. **The id is a value a human types**, which is why ids
are user-authored, short, and editable rather than derived-and-frozen — and why
a rename that retires a `core.newAgent.<id>` binding warns first rather than
being forbidden.

**`--prompt` is a flag on an existing verb, not new grammar** — ADR 0047 reads
the same with or without it. It exists because prompt delivery (phase 3) is
otherwise three pieces of transport with no caller until phase 5, whose own
first consumer lives in another repo and rides the published SDK. A phase that
ships only a seam cannot be exercised by a human, and this repo grows in layers
that already work. `--prompt` is the cheapest honest consumer: phase 2 built the
whole `silo agent run` path, so the flag is the transport's proof rather than a
second product surface. It stays **Forward** mode — it asks for an action, not
for an answer, so it needs no return channel.

**Which workspace it runs in** follows ADR 0047's resolution order: an explicit
`--ws <folder | . | ws_<uuid>>`, else the workspace **containing** the shell's
cwd (deepest root wins; a soft-closed match is reopened rather than skipped).
Neither rung **creates** a workspace — only `silo <dir>` may. A run from a
directory that belongs to no workspace is an error reported to the Output panel,
not a new workspace rooted wherever the shell happened to be: an agent
orchestrator cd-ing through temp directories would otherwise accumulate junk
workspaces, and the fix (`silo <dir>` first, or `--ws`) is one token.

**The launch half needed no new IPC** — `tauri-plugin-single-instance` already
forwards a second `silo` process's argv and cwd, `resolve_cli_request` parses
subcommands, and both the warm (`cli:open` emit) and cold (`PendingLaunchArg`)
paths carry `action: "agent-run"` unchanged.

**The read-back half splits**, and only one side is blocked. Profiles are user
data on disk (ADR 0022 tier 1: `<config>/app-state.json`), so
`silo agent list [--json]` is ADR 0047's **Disk-read** mode — no channel, no
running app, and unbuilt only because nobody has written it yet. What genuinely
waits on the [Control API](./0034-control-api/proposal.md) is anything that must answer
from the _running_ instance: bare `silo agent run`'s interactive picker, live
activity state, and handing the launched terminal's id back to the caller.

## Phases

| Phase                                        | Scope                                                                                                                                                                                                                                                                                                                                                                                                           | Status                   |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **1 — Populate and use the `+` menu**        | The record, persistence, `configDirEnvVar`, `TerminalRecord.profileId` + `TerminalKind` deprecation, the pending-launch model (+ the `SILO_TERMINAL_ID` repair), the Profiles settings tab, the `+` menu and the terminal context menu's Agents submenu, `ctx.agents.catalog()` + icon relocation, Hooks → Sessions rename.                                                                                     | **shipped** (2026-09-01) |
| **2 — Addressing a profile by name**         | `core.newAgent.<profileId>` per profile + generic `core.newAgent`; the `default` flag and its two gestures; `silo agent run [--profile <id>] [--ws <folder\|.\|id>]` (reserved `agent` noun, `--ws` or cwd containment, never creating a workspace; first real caller of the background launch branch); the dangling-command-id dispatch guard; the rename warning. Plus the subscription-survival hydrate fix. | **shipped** (2026-09-01) |
| 3 — Prompt delivery                          | `promptDelivery` on `AgentDefinition`, quoted-heredoc transport, line-editor sanitization — plus `silo agent run --prompt <text>` as the transport's first caller, so the phase ships something a human can run rather than a seam waiting on phase 5.                                                                                                                                                          | planned                  |
| 4 — Resume composition                       | Split `buildResumeCommand` into catalog-owned `resumeArgs` + the profile's command and env prefix. First consumer of `profileId`.                                                                                                                                                                                                                                                                               | planned                  |
| 5 — `ctx.agents.profiles`                    | Public `list()` / `launch()`. First consumer is RFC 0031's deferred **Start Task**.                                                                                                                                                                                                                                                                                                                             | planned                  |
| 6 — Per-account hooks                        | Install strategies keyed on `(agentId, configDir)`. Depends on Managed Hooks.                                                                                                                                                                                                                                                                                                                                   | planned                  |
| 7 — `SILO_AGENT_PROFILE` + hook confirmation | RFC 0028 designed the seam; deferred until a surface branches on "confirmed" vs "assumed".                                                                                                                                                                                                                                                                                                                      | planned                  |
| 8 — Per-workspace default profile            | Bind a workspace to a profile so "new agent" does the right thing per repo with no menu. Revisit AgentsRoom's resolution order (per-agent override → per-project pin → global default → system `~/.claude`).                                                                                                                                                                                                    | planned                  |
| 9 — CLI read-back (`silo agent list`)        | `silo agent list [--json]`, which reads the profiles off disk (ADR 0047's Disk-read mode — no channel needed), plus bare `silo agent run`'s interactive **picker** and returning the launched terminal's id, which need the Control API (RFC 0034).                                                                                                                                                             | planned                  |

Phases 3–9 keep the direction stated here and in each shipped phase's planning
package history; each re-expands into its own package when its turn comes.

## Prior art

Six of eight comparable tools surveyed (2026-08-31) ship a version of this
(Orca, Superset, Paseo, cmux, Claude Squad, AgentsRoom), so the concept is
settled rather than novel. What this design takes from the survey: **a command
string, not an argv array** (an argv array implies `exec`, which doesn't source
the user's rc file); **the command belongs in the list row** (what makes two
config-dir-only-different profiles distinguishable); **add from a catalog** plus
detection ("Found on this machine"); **one form for builtin and custom**. What
it deliberately doesn't take: a Command + Arguments two-field split (can't
express an alias), an icon picker as the primary mechanism (detection resolves
it), an accounts-as-a-separate-page subsystem (premature for one `configDir`
field), a first-run wizard.

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
  `configDir` is the narrow version. Reconsider only if `ctx.secrets` lands.
- **A derived, immutable profile id.** Optimised for the machine's references
  and ignored the one with a human in it — the id is typed at
  `silo agent run --profile <id>` and is a `core.newAgent.<id>` component, so it
  must be short, memorable, chosen, and allowed to change. Dead keybindings
  after a rename are the one real loss; phase 2 mitigates by warning.
- **Carrying a keybinding across a rename, or pruning a dangling one.** Both
  rejected (phase 2): `keybindings.json` is a hand-editable user file, and
  rewriting it as a side effect of a rename is a bigger surprise than a shortcut
  that stops working after a warning. A kept dangling entry also revives if the
  id is recreated.
- **`subscribe(store, …)` for the command sync instead of the hydrate fix.**
  Would fire `reconcile` on every unrelated store change and re-render the
  Profiles panel needlessly. Fixing the reassignment at the source
  (`replaceAgentProfiles`) is narrower and helps every subscriber.
- **A "Test launch" button.** Copying the launch line proves more (it exercises
  the user's real shell) and doesn't pull the user out of Settings.
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
- **A Window-menu "New Agent" item beside "New Terminal".** Reasonable, but menu
  placement is a separate product call and would move `core.newAgent` out of the
  Keyboard Shortcuts "General" group as a side effect. Deferred.

## Decision

**Accepted** 2026-08-31; **phase 1 implemented** 2026-09-01; **phase 2
implemented** 2026-09-01. Phases 3–9 stay planned with the direction above; each
gets its own planning package when it starts. The durable architectural note
this change contributes is recorded as an amendment to **ADR 0046** (the
converse: the host never creates user data unprompted — and, in phase 2, never
auto-elects a default or prunes a user's keybinding).

Implementation references — all in `silo-code/silo`:

- `packages/extension-host` — `AgentProfile` + `default`, `state/agent-profiles.ts`
  (incl. `replaceAgentProfiles`), `agents/agent-profile-model.ts`
  (`profileCommandId` / `resolveDefaultProfile` / `renameRetiresBinding`),
  `agents/agent-launch.ts` + `agents/pending-launch.ts` (the launch model),
  `extension-host/keybindings.ts` (the dispatch guard).
- `packages/extensions-core/src/agents-settings` — `profile-commands.ts`,
  `ProfileRow.tsx` / `AgentsProfilesPanel.tsx` / `ProfileEditorModal.tsx`.
- `apps/desktop/src-tauri/src/commands/cli.rs` — the `agent run` arm.
- `apps/desktop/src/cli/agent-run-handler.ts` + `open-handler.ts`
  (`findWorkspaceContaining`).

Related ADRs: **0028** (sealed detection), **0034** (focus/activation
authority), **0041 / 0042** (modular agent catalog), **0046** (never delete —
and, phase 2, never create — user data unprompted).
