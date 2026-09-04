---
status: accepted # phases 1–3 shipped; phases 4, 6–9 remain
created: 2026-08-31
---

# 0033. Agent Profiles — naming how you start an agent

**Phases 1 and 2 shipped 2026-09-01; phase 3 shipped 2026-09-03.** This is the
collapsed record: the durable intent, the decisions that outlive each planning
package, and what each phase actually delivered. The `status` stays `accepted`
because phases 4 and 6–9 are still planned; it becomes `implemented` only once
every committed phase has shipped.

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

Since phase 3 a launch may also carry an **Opening Prompt** — text handed to the
agent on its launch line so it starts already working on something — reachable
through the public `ctx.agents.profiles.launch({ prompt })`. The prompt is
delivered as a literal or **refused**, never approximated: see "Opening prompts"
below.

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

## What shipped in phase 3

Phase 3 answered the question the proposal had deferred since it was written:
**how does Silo hand a coding agent its opening prompt?** Before it, the only
mechanism was `ctx.terminals.sendText`, which types raw bytes into a live shell
— named in the original sketch as the highest-severity idea in the RFC, because
a quoting bug there is arbitrary code execution as the user.

- **`AgentDefinition.promptDelivery`** — one sealed-catalog field saying how (or
  whether) each agent takes an opening prompt while **staying interactive**. A
  closed two-member union (`{ kind: "argv" }`, `{ kind: "flag"; flag }`);
  `undefined` means "cannot", never "probably positional". Established by the
  same empirical recon `configDirEnvVar` got — see "Per-agent recon" below.
- **The transport** (`agents/agent-prompt.ts`) — a pure module holding the whole
  of the phase's risk: sanitizing, dialect selection, delimiter choice, and the
  **only** place in the codebase that writes shell syntax for a prompt. The
  payload rides a **quoted heredoc inside a command substitution** on POSIX
  shells, so expansion and quoting are dead by construction rather than by
  escaping, and a multi-line or long payload is no special case.
- **Line-editor sanitization** — the bytes are _typed_, so they reach the
  shell's line editor as keystrokes, where ESC and C1 sequences fire
  keybindings, a lone CR submits the line early, and a tab triggers completion.
  `sanitizePromptForLineEditor` is total, idempotent, and strips escape
  **sequences whole** before removing leftover control bytes — stripping the ESC
  first would leave `[31m` as literal text in the user's prompt.
- **`ctx.agents.profiles`** — the public `@beta` SDK surface, and the phase's
  real consumer. `list()` returns deeply-frozen `AgentProfileSummary` records
  (`id`, `label`, `isDefault`, `acceptsPrompt`), memoized and invalidated on any
  change to the profile list. `launch({ profileId?, workspaceId?, cwd?, prompt?,
activate? })` returns a **result**, not `void`: `{ ok: true, terminalId }` or
  `{ ok: false, refusal }`. This was originally phase 5. Deliberately no
  `pick()` (an extension builds one from `list()` + `ctx.ui.showMenu`, which
  _is_ the shared chrome) and no `get()` (that is `list().find()`).
- **The Profiles tab says up front whether a prompt is possible** — whether an
  agent can take one is a static fact about the profile, so the editor names it
  where the profile is authored rather than only in a runtime refusal. It reads
  the same `profileAcceptsPrompt` helper the launch path uses, so the notice and
  an actual refusal can never disagree. Informational only; nothing is blocked
  and nothing new is persisted.

## Opening prompts — delivered as a literal, or refused

The governing rule, which everything below restates in its own terms:

> **A prompt that cannot be delivered safely fails the launch, loudly. Silo
> never starts a promptless agent for a caller who asked for one, and never
> types a payload it is not certain it can quote.**

This is the same reasoning `configDirEnvVar` settled in phase 1 — a mechanism
that looks like it worked and silently didn't is worse than one that isn't
there.

### The composed line

```sh
CLAUDE_CONFIG_DIR='/Users/me/.claude-work' claude "$(cat <<'SILO_PROMPT'
fix the CI
SILO_PROMPT
)"
```

Everything left of the payload is phase 1's `profileLaunchLine` **verbatim** —
the `configDir` env prefix and the profile's `command` untouched — which is what
keeps "a launch with no prompt is byte-identical to phases 1–2" true. A
`{ kind: "flag" }` agent is identical with the flag between command and payload;
the two members differ by one token, which is the point of a union rather than
two code paths. The delimiter is `SILO_PROMPT` with a numeric suffix appended
until no **line** of the payload equals it — only a whole-line match can
terminate a heredoc early.

`fish` has no heredocs, so it gets its own exact single-quoted literal (only `\`
and `'` carry meaning inside one). **Any other shell refuses.** Nu and
PowerShell are deliberately unimplemented: nu's raw-string forms are their own
puzzle, and approximating a quoting rule is exactly the failure mode this phase
avoids.

The composed line is a normal multi-line string with `\n`; terminals take `\r`
for Enter, so exactly **one seam** — the drain's send — converts them and
appends the trailing `\r`. Doing that conversion in a second place is how a
heredoc silently never terminates and wedges the user's shell mid-quote.

### The shell dialect

The transport is bash/zsh syntax, so the dialect must be known before anything
is typed: `store.terminalSettings.shell` when the user set one (that is what
`process-service.ts` hands the session host), else the login shell, read once at
boot. It is decided **once per launch**, at registration, and carried on the
pending launch — so the precheck and the drain cannot reach different
conclusions about it, and the profile stays the only input that may legitimately
change in between. An unreadable shell yields `"unsupported"` and refuses; it is
never assumed POSIX.

_(The design drafted this first rung as `TerminalRecord.shell`, "a per-terminal
override the host already stores". There is no such field. The global Terminal
setting is the real override and a better rung 1; the only thing lost is
per-terminal granularity, which never existed.)_

### Refusals

| Refusal             | Cause                                               |
| ------------------- | --------------------------------------------------- |
| `no-agent`          | The profile resolves to no catalog agent            |
| `agent-takes-none`  | The resolved agent declares no `promptDelivery`     |
| `unsupported-shell` | The dialect is neither `posix` nor `fish`           |
| `too-large`         | The **sanitized** prompt exceeds `MAX_PROMPT_BYTES` |

A refusal caught at **precheck** — before any terminal record, activation, or
focus — is a **return value**, which is the whole reason an SDK surface is a
better first consumer than a CLI flag: the extension can tell its own user. Only
the **drain**'s refusal has nowhere to return to (the profile was edited between
the request and the session coming up); it types nothing, logs to the
`silo:agents` / **Agents** output channel, and leaves the terminal as a plain
shell — the same shape as phase 1's "a profile deleted mid-launch drains to
nothing". A launch with no prompt is never touched by any of these checks.

No catalog agent is currently left `undefined`, so `agent-takes-none` has no
live producer today. It stays, and is tested: it is the answer for any future
agent whose recon comes back ambiguous, and `undefined` remains the deliberate
default rather than a gap.

### The size limit is a measurement, not a taste

`MAX_PROMPT_BYTES` is **2 KiB** of sanitized UTF-8 — about a page of prose.

The binding constraint is not `ARG_MAX` or shell history (the drafted 16 KiB was
justified against both, and both were the wrong constraint). It is **how fast
the target shell's line editor consumes keystrokes**, because the prompt is
typed rather than passed as argv. A plugin-heavy zsh (autosuggestions, syntax
highlighting, powerlevel10k) re-parses its whole buffer on every chunk it
receives and slows down as the buffer grows. Measured in the real app against
exactly that shell (2026-09-03):

| Payload | Result                                       |
| ------- | -------------------------------------------- |
| ≤ 4 KiB | delivered complete, 4/4 runs                 |
| 6 KiB   | **flaky** — 1 of 2 runs lost bytes           |
| ≥ 8 KiB | **always truncated** (16 KiB arrived as ~14) |

The identical payloads all delivered intact on an unadorned zsh, so the ceiling
belongs to the **user's environment**, not to Silo, and no single number is
right for everyone. 2 KiB is half the largest reliably-delivered size and a
third of the first flaky one. The posture is deliberately conservative because
the failure is **silent**: the heredoc still closes around a short payload, so
the agent acts on partial instructions with nothing logged anywhere. A caller
that gets `too-large` can trim and retry; an agent that receives three-quarters
of its instructions cannot tell, and neither can the user.

**The send chunks, at 1 KiB per `sendInput`.** The daemon's `write_master_timed`
(`crates/pty-host/src/daemon.rs`) writes under a one-second deadline and then
**silently drops whatever is left**, reporting it only to the daemon log. One
write per frame means one deadline per frame. Chunking is by code point, never
code unit — `sendInput` encodes each call independently, so splitting a
surrogate pair would put replacement bytes on the wire. Chunking **narrows**
this failure and does not remove it: a line editor that re-parses per chunk can
stay behind for longer than a second no matter how the write is sliced.
`MAX_PROMPT_BYTES` is the actual mitigation; raising it is gated on the daemon
reporting short writes instead of discarding them (silo-code/silo#497).

**A third option, deliberately not taken.** Writing the prompt to a temp file
and typing `agent "$(cat <file>)"` makes the line editor see ~80 bytes
regardless of prompt size and the ceiling disappears. Rejected _for this phase_
rather than on the merits: it trades away the transparency above — the composed
line in scrollback becomes a `cat` of an opaque path, no longer something the
user can read, edit, and re-run — and it puts the prompt on disk with a lifetime
to manage. Worth an explicit product decision if a consumer ever needs prompts
larger than a page; not worth making silently to raise a limit.

### The prompt is visible, and that is intended

The composed line is typed into the user's own interactive shell, so it appears
in scrollback and enters shell history exactly as if they had typed it. Phase 1
chose typing into an interactive shell over `exec` precisely so a launch is
something the user can see, edit, and re-run, and a prompt does not change that.
Silo does **not** manipulate `HISTCONTROL` / `HIST_IGNORE_SPACE` to hide it. The
SDK's `LaunchAgentProfileOptions.prompt` says so plainly, so a caller putting
sensitive text in one is not surprised; when `silo agent run --prompt` ships
with RFC 0034, `apps/docs/guide/cli.md` must say the same. (That was a phase-3
acceptance criterion, deliberately unmet here because the phase ships no CLI
code — it carries forward to 0034 rather than being dropped.)

### How it was verified

The transport was validated against a synthetic PTY before the design committed
to it, and then in the **real app** — `verifier-gui`, a throwaway workspace, a
real Silo terminal, a recorder script capturing `argv[1]` to disk for byte
comparison (2026-09-03):

- **Real customized zsh: 12/12 byte-exact** — metacharacters, multi-line,
  backslash-newline, a payload carrying `SILO_PROMPT` as a whole line,
  non-ASCII, tabs + CRLF, and a payload of exactly `MAX_PROMPT_BYTES`.
- **Plugin-heavy zsh** (a throwaway `ZDOTDIR` with autosuggestions, syntax
  highlighting, powerlevel10k): the risk the design named was **real** — 11/12
  at 16 KiB, the failure purely size, which is what drove the limit down.
  Re-run at 2 KiB: **12/12 byte-exact**.
- **`fish` 4.8.1: 12/12 byte-exact**, verifying the second transport arm against
  a real shell rather than only unit tests.
- **End to end from a real installed extension** — the `sdk-playground` example
  gained a `ctx.agents.profiles` demo. Through the public SDK: `list()` returned
  its summaries; an oversized prompt came back `{ ok: false, refusal:
"too-large" }`; an unknown profile `"no-profile"`; and a real launch returned
  `{ ok: true, terminalId }`, spawned the terminal, was detected as an agent,
  and **Claude Code displayed the prompt verbatim** — `$HOME`, backticks,
  `$(uname)` and both quote styles all literal — and answered it.

The lesson worth keeping: **a synthetic PTY could not have retired this risk.**
Plugin-heavy line editors hook the same keystroke path the transport uses, and
only running the real app against a real user shell found the ceiling.

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
  the shell's cwd resolves to, then activates.
  `ctx.agents.profiles.launch({ workspaceId })` (phase 3) is the second.

A launch carrying a prompt runs the composition **twice**: once as a precheck in
`ctx.agents.profiles.launch()`, before anything is created, so a refusal costs
nothing and comes back to the caller synchronously; and again at the drain
against the profile as it is _then_. The dialect, decided at registration, is not
re-derived — so the profile stays the only input that can legitimately have
changed in between.

`takePendingLaunch` removing the entry is the whole concurrency argument:
whichever path arrives second gets `null`. Pending launches live in a
module-level map and are **never persisted** — an intent that survived a restart
would type into a terminal the user reopened hours later. The launch line is
resolved from the profile **at drain time**, so an edit or delete landing in
between is respected (a deleted profile drains to nothing, leaving a plain
shell).

> **The launch line is _echoed_ more than once — it is not typed more than
> once.** _(Corrected in phase 3, after tracing it and then watching it happen.)_
> A **double drain is structurally impossible**: `TerminalPanel` guards its drain
> behind `needsCreate`, which is false once `sessionId` is assigned;
> `takePendingLaunch` is remove-on-read, so whichever drain path arrives second
> gets `null`; and the `cancelled` bail returns _above_ both the assignment and
> the drain, so an abandoned run types nothing at all. Verifying end to end
> (2026-09-03), a freshly-spawned terminal rendered the composed line **three
> times** in scrollback — twice as bare text with no shell prompt, then once at
> the `$` prompt with zsh's continuation prompts — and **executed it exactly
> once**. That is the ordinary "input arrived before the shell drew its first
> prompt" artifact: the tty echoes the bytes raw, ZLE redraws them when it takes
> over, then renders the command it accepted. Cosmetic, but a multi-line heredoc
> renders as three stacked blocks where phase 1's one-word command was easy to
> miss — very likely what the original "typed twice" observation actually was.
> The fix is to drain on shell **readiness** rather than on session spawn; that
> is a terminal-lifecycle change and belongs in its own work.
>
> **A real bug does live at that bail, and it is a different one:** the effect
> returns without `session.kill()`, leaking a live shell with no tab until the
> app quits (`ensureSession` handles the identical race correctly at
> `terminal-service.ts:260`). It was briefly folded into phase 3 and taken back
> out — it never belonged to prompt delivery, and pairing a terminal-lifecycle
> change with a public SDK addition serves neither review. It ships as its own
> PR, alongside the readiness-drain change above.

## What a profile may and may not claim

`assumedAgentId` is a **user assertion**, not an observation, and the field name
carries that. It **may** pick the `+` menu icon, select the `configDirEnvVar`
for the launch prefix, and (phase 4) supply resume flags. It **may never** be
written into `AgentInfo.agentId` or seed `AgentInfo.isAgent` — a profile-launched
terminal becomes an agent only when detection says so (ADR 0028). Detection
already handles the alias case within a second of the agent's first OSC title.
`docs/domain-language.md` records the `assumedAgentId` / `agentId` split and the
**default profile** term.

## Per-agent recon

Both sealed-catalog fields this proposal added were established the same way,
and the discipline is the point: **the check is a run, not a read of `--help`.**
A field that appears to enable something and silently doesn't is worse than no
field, so every negative finding is written into that agent's `contract` and
`docs/adding-a-coding-agent.md` Step 1 carries both questions, so the next agent
added answers them deliberately.

### `configDirEnvVar` — which agents can run two accounts

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

Operational detail: `codex` does not create `CODEX_HOME` if missing, so the
profile editor stats the directory and offers to create it.

### `promptDelivery` — which agents take an opening prompt

All seven were **run for real** on 2026-09-02 (macOS; a bare `pty.fork()` for
`pi`, a `tmux` pane for the six whose TUIs query terminal capabilities before
drawing), each checked against both halves of the question: did it **act on the
prompt**, and was the process still **at its own composer** afterwards.

The distinguishing question is **not** "does it accept prompt text" but "does it
accept prompt text **and stay interactive**." Every agent here has a
non-interactive mode that also takes a prompt (`claude -p`, `copilot -p`,
`codex exec`, `opencode run`); that mode is a **no** for this field, because a
profile launch is an interactive TUI in a tab.

| Agent          | Version            | Evidence                                                                                                                      | `promptDelivery`                          |
| -------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `claude`       | 2.1.252            | `claude "<prompt>"` answered, TUI stayed up. `-p/--print` is the non-interactive one                                          | `{ kind: "argv" }`                        |
| `codex`        | 0.149.1            | `codex "<prompt>"` answered, composer stayed up. `codex exec` is the non-interactive one                                      | `{ kind: "argv" }`                        |
| `grok`         | 1.0.13             | `grok "<prompt>"` answered; `--help` calls the positional the "initial prompt for the interactive session"                    | `{ kind: "argv" }`                        |
| `cursor-agent` | 2026.08.31-4057e58 | `cursor-agent "<prompt>"` answered, left "Add a follow-up" up. `-p/--print` is non-interactive                                | `{ kind: "argv" }`                        |
| `pi`           | 0.84.3             | `pi "say hello"` answered "hello" and was still at its composer 45s later                                                     | `{ kind: "argv" }`                        |
| `opencode`     | 1.18.20            | positional is a **project path**; `--prompt <string>` answered and stayed in the TUI                                          | `{ kind: "flag", flag: "--prompt" }`      |
| `copilot`      | 1.0.82             | positional is a **subcommand** (`copilot "x"` → "Invalid command format"); `-i/--interactive <prompt>` answered and stayed up | `{ kind: "flag", flag: "--interactive" }` |

`opencode` and `copilot` are why the union has a `"flag"` member at all, for
different reasons: appending a prompt positionally would set opencode's
**project directory** to the prompt text, and would be parsed as a **subcommand
name** by copilot. There is deliberately no `{ kind: "stdin" }` — a heredoc on
stdin detaches an interactive TUI from the tty, which is the opposite of what a
profile launch is for.

**Copilot overturned the pre-recon prediction, and that is the lesson worth
keeping.** The table's first draft read copilot's `--help` — "Start an
interactive session…, or use `-p/--prompt` for **non-interactive** scripting" —
and concluded `undefined`. Running it found `-i/--interactive <prompt>`,
documented as "Start interactive mode and automatically execute this prompt",
which is exactly the capability. A `--help`-only pass would have shipped a
permanent, silent "copilot can't take prompts."

## The command line

The grammar these forms sit in — `agent` as a reserved noun, the `--ws`
spelling, and which execution mode each half needs — is
[ADR 0047](../decisions/0047-cli-command-grammar.md). This proposal owns the
verbs; that ADR owns the shape.

```sh
silo agent run --profile claude-work   # launch that profile             → shipped (phase 2)
silo agent run                         # no --profile → the default        → shipped (phase 2)
silo agent run --ws ~/code/app         # …in a named workspace             → shipped (phase 2)
silo agent run --prompt "fix the CI"   # …and hand it an opening prompt    → with RFC 0034
                                       # …an interactive picker            → phase 9
silo agent list [--json]               # the profiles, with their ids      → phase 9
```

`--profile` takes the id. **The id is a value a human types**, which is why ids
are user-authored, short, and editable rather than derived-and-frozen — and why
a rename that retires a `core.newAgent.<id>` binding warns first rather than
being forbidden.

**`--prompt` ships with the Control conversion, not before it.** It was briefly
planned as phase 3's consumer, on the reasoning that a flag on an existing verb
is cheap and ADR 0047 reads the same with or without it. That was decided while
RFC 0034 was a `draft` with no design. It is now an accepted package whose scope
is **converting `silo agent run` from Forward to Control** — so building
Forward-mode plumbing for `--prompt` would mean writing code against a mode this
verb is leaving, and deleting it weeks later.

Phase 3 therefore **defined** `--prompt` as a `prompt` member of `agent.run`'s
Control args — ADR 0047's rule 6 requires a mutating verb's payload before it
ships — and shipped **no CLI code at all**: `cli.rs`, `agent-run-handler.ts`,
`silo --help`, and `apps/docs/guide/cli.md` are untouched by prompt delivery.
ADR 0047's amendment of 2026-09-02 records the general rule this case produced:
a new flag on a verb already scheduled for conversion is Control, never Forward.

Each refusal is mapped onto RFC 0034's **closed** error vocabulary in that
proposal's design, all four as `failed` with the specifics in `message`.
`not-found` is deliberately not used for `no-agent` (the named profile does
exist), and `too-large` cannot be `invalid-args` (the limit applies to the
**sanitized** payload, which `cli.rs` cannot compute without a second copy of the
quoting rules). Both packages were unimplemented when this was written, so they
were reconciled in documents: 0034 carries `prompt` in `agent.run`'s args, its
CLI surface line, and R11. Neither needs rework for the other.

The transport's consumer is instead `ctx.agents.profiles.launch({ prompt })` —
public SDK surface, callable by any extension the day it ships, and the thing
RFC 0031's **Start Task** has been waiting on. That was originally phase 5; it
is now part of phase 3, because a seam and its first real consumer are one
shippable slice rather than two. It is also the better consumer on the merits: a
refusal is a **return value** an extension can show its own user, which a
Forward-mode flag could never manage.

**Which workspace it runs in** follows ADR 0047's resolution order: an explicit
`--ws <folder | . | ws_<uuid>>`, else the workspace **containing** the shell's
cwd (deepest root wins; a soft-closed match is reopened rather than skipped).
Neither rung **creates** a workspace — only `silo <dir>` may. A run from a
directory that belongs to no workspace is an error reported to the Output panel,
not a new workspace rooted wherever the shell happened to be: an agent
orchestrator cd-ing through temp directories would otherwise accumulate junk
workspaces, and the fix (`silo <dir>` first, or `--ws`) is one token.

**The launch half needed no new IPC** at the time — `tauri-plugin-single-instance`
forwarded a second `silo` process's argv and cwd, and both the warm (`cli:open`
emit) and cold (`PendingLaunchArg`) paths carried `action: "agent-run"`.
**Superseded:** [RFC 0034](./0034-control-api.md) converted `silo agent run` to
Control mode, so it now round-trips over the control socket, returns the created
terminal's id, and no longer cold-launches Silo (`--launch` opts back in). The
`agent-run` arm is gone from `PendingLaunchArg`; `open`, `install`, and
`uninstall` keep theirs.

**The read-back half splits**, and **neither side is blocked any more.** Profiles
are user data on disk (ADR 0022 tier 1: `<config>/app-state.json`), so
`silo agent list [--json]` is ADR 0047's **Disk-read** mode — no channel, no
running app, and unbuilt only because nobody has written it yet. The half that
needed the _running_ instance — bare `silo agent run`'s interactive picker and
live activity state — now has the [Control API](./0034-control-api.md) to build
on. Handing the launched terminal's id back to the caller is **already done**,
shipped as RFC 0034's proving mutate-tier consumer.

## Phases

| Phase                                              | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Status                   |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **1 — Populate and use the `+` menu**              | The record, persistence, `configDirEnvVar`, `TerminalRecord.profileId` + `TerminalKind` deprecation, the pending-launch model (+ the `SILO_TERMINAL_ID` repair), the Profiles settings tab, the `+` menu and the terminal context menu's Agents submenu, `ctx.agents.catalog()` + icon relocation, Hooks → Sessions rename.                                                                                                                               | **shipped** (2026-09-01) |
| **2 — Addressing a profile by name**               | `core.newAgent.<profileId>` per profile + generic `core.newAgent`; the `default` flag and its two gestures; `silo agent run [--profile <id>] [--ws <folder\|.\|id>]` (reserved `agent` noun, `--ws` or cwd containment, never creating a workspace; first real caller of the background launch branch); the dangling-command-id dispatch guard; the rename warning. Plus the subscription-survival hydrate fix.                                           | **shipped** (2026-09-01) |
| **3 — Prompt delivery, and `ctx.agents.profiles`** | `promptDelivery` on `AgentDefinition` (all seven agents reconned by running them), the quoted-heredoc / fish-literal transport with line-editor sanitization and a 2 KiB measured limit, the four typed refusals — published through `ctx.agents.profiles` `list()` / `launch({ prompt })`, the phase's real consumer, plus the Profiles-tab affordance. Absorbed what was phase 5. `--prompt` specified, not built (shipped with RFC 0034); no CLI code. | **shipped** (2026-09-03) |
| 4 — Resume composition                             | Split `buildResumeCommand` into catalog-owned `resumeArgs` + the profile's command and env prefix. First consumer of `profileId`.                                                                                                                                                                                                                                                                                                                         | planned                  |
| 5 — _(merged into phase 3)_                        | The public `ctx.agents.profiles` surface was originally its own phase. It moved into phase 3 because prompt delivery needs a consumer and this is the honest one: an SDK surface beats a CLI flag on a verb RFC 0034 is converting. The row is kept, not renumbered — RFC 0034 and ADR 0047 both cite "RFC 0033 phase 9" by number.                                                                                                                       | merged                   |
| 6 — Per-account hooks                              | Install strategies keyed on `(agentId, configDir)`. Depends on Managed Hooks.                                                                                                                                                                                                                                                                                                                                                                             | planned                  |
| 7 — `SILO_AGENT_PROFILE` + hook confirmation       | RFC 0028 designed the seam; deferred until a surface branches on "confirmed" vs "assumed".                                                                                                                                                                                                                                                                                                                                                                | planned                  |
| 8 — Per-workspace default profile                  | Bind a workspace to a profile so "new agent" does the right thing per repo with no menu. Revisit AgentsRoom's resolution order (per-agent override → per-project pin → global default → system `~/.claude`).                                                                                                                                                                                                                                              | planned                  |
| 9 — CLI read-back (`silo agent list`)              | `silo agent list [--json]`, which reads the profiles off disk (ADR 0047's Disk-read mode — no channel needed), plus bare `silo agent run`'s interactive **picker**. **Unblocked:** RFC 0034 shipped the Control API, and already delivered the third item this row once listed — returning the launched terminal's id — as its proving mutate-tier consumer.                                                                                              | planned (unblocked)      |

Phases 4 and 6–9 keep the direction stated here; each re-expands into its own
planning package when its turn comes. **Phase 4 is the next unimplemented row.**

Three pieces of work were named during phase 3 and deliberately left out of it,
because none belongs to prompt delivery:

- **The orphaned session at `TerminalPanel`'s `cancelled` bail**, and **draining
  on shell readiness** rather than on session spawn (which removes the echo
  artifact above). Both are terminal-lifecycle changes and pair naturally in one
  PR — see the launch-model note.
- **The daemon's silent short write.** `write_master_timed` drops the tail of a
  PTY write past its one-second deadline and reports it only to the daemon log,
  so Silo never learns. Chunking makes truncation unlikely but cannot rule it
  out, and the failure mode — a shell parked in an unterminated quote with
  nothing in the Output panel — deserves a surfaced warning. Tracked as
  silo-code/silo#497; raising `MAX_PROMPT_BYTES` is gated on it.
- **A host-owned prompt composer and profile picker.** `launch()` types
  immediately, which is right when the user authored the prompt and thin when an
  extension generated it, and `AgentProfileSummary` deliberately ships without
  the profile's resolved agent, so an extension cannot render its icon the way
  the Profiles tab does. Both are **RFC 0035**, not a widening of this surface.

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
- **`silo agent run --prompt` as prompt delivery's first consumer** (phase 3).
  Rejected once RFC 0034 became an accepted package converting that exact verb
  from Forward to Control: the flag would have been built in a mode the verb is
  leaving and deleted weeks later. ADR 0047's 2026-09-02 amendment generalizes
  it. The SDK surface is the honest consumer, and a better one — a refusal is a
  value the caller can act on.
- **Hardening `ctx.terminals.sendText`** instead of adding a safe path beside it
  (phase 3). Its contract is "as if the user typed it", raw and unfiltered, and
  extensions depend on that. Phase 3 adds a quoted path; it does not change what
  `sendText` does.
- **Approximating a quoting rule for an unsupported shell** (phase 3). Refusing
  is the whole design. A prompt mangled by a near-miss escape is worse than one
  declined with a message that names the shell.
- **`pick()` and `get()` on `ctx.agents.profiles`** (phase 3). A picker is
  `list()` + `ctx.ui.showMenu` in a few lines, and `showMenu` _is_ the shared
  chrome; `get()` is `list().find()`.
- **A prompt field on the `+` menu or the Agents submenu** (phase 3). Both are
  point-and-launch gestures with nowhere to type. A host-owned prompt composer
  is a real product call, and it is **RFC 0035**.

## Decision

**Accepted** 2026-08-31; **phase 1 implemented** 2026-09-01; **phase 2
implemented** 2026-09-01; **phase 3 implemented** 2026-09-03. Phases 4 and 6–9
stay planned with the direction above; each gets its own planning package when
it starts.

Durable architectural notes this change contributed, recorded outside this
proposal: an amendment to **ADR 0046** (the converse — the host never creates
user data unprompted, and in phase 2 never auto-elects a default or prunes a
user's keybinding), and an amendment to **ADR 0047** (phase 3 — a new flag on a
verb already scheduled for Control conversion is Control, never Forward).

Implementation references — all in `silo-code/silo`:

- `packages/extension-host` — `AgentProfile` + `default`, `state/agent-profiles.ts`
  (incl. `replaceAgentProfiles`), `agents/agent-profile-model.ts`
  (`profileCommandId` / `resolveDefaultProfile` / `renameRetiresBinding`),
  `agents/agent-launch.ts` + `agents/pending-launch.ts` (the launch model and
  the chunked send), `agents/agent-prompt.ts` (the whole prompt transport —
  sanitizing, dialect, delimiter, composition), `agents/agent-profiles-service.ts`
  (`ctx.agents.profiles`), `extension-host/login-shell.ts`,
  `extension-host/keybindings.ts` (the dispatch guard).
- `packages/sdk/src/agents-service.ts` — `AgentProfilesService`,
  `AgentProfileSummary`, `LaunchAgentProfileOptions` / `Result`, `PromptRefusal`.
- `packages/extensions-core/src/agents-settings` — `profile-commands.ts`,
  `ProfileRow.tsx` / `AgentsProfilesPanel.tsx` / `ProfileEditorModal.tsx`.
- `apps/desktop/src-tauri/src/commands/cli.rs` — the `agent run` arm.
- `apps/desktop/src/cli/agent-run-handler.ts` + `open-handler.ts`
  (`findWorkspaceContaining`).
- `examples/extensions/sdk-playground-extension` — the runnable
  `ctx.agents.profiles` demo used for end-to-end verification.

Related ADRs: **0028** (sealed detection), **0034** (focus/activation
authority), **0041 / 0042** (modular agent catalog), **0046** (never delete —
and, phase 2, never create — user data unprompted), **0047** (CLI command
grammar, amended by phase 3).

Related proposals: **RFC 0034** (Control API — carries `--prompt`), **RFC 0035**
(agent prompt composer), **RFC 0031** (Start Task, unblocked by
`ctx.agents.profiles`).
