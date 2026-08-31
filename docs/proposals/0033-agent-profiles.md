---
status: draft # draft | accepted | implemented | rejected | superseded-by NNNN
created: 2026-08-31
---

# 0033. Agent Profiles — naming how you start an agent

## Summary

Add **Agent Profile**: a named, user-defined recipe for starting a coding agent
in a terminal. A profile is a label, a shell command line (`claude`,
`claude-work`, `cursor-agent`), an optional config directory for agents that
support one, and an optional hint about which catalog agent it launches.

Profiles are host-owned and user-defined. They appear in the `+` menu, they are
managed on a new **Profiles** tab of Settings → Agents, and they replace
`TerminalKind`'s two vestigial agent values (`"claude"` / `"pi"`) — which
nothing in the app creates today — as the app's launch-time vocabulary for
"which agent."

Deliberately **not** in scope: an agent-agnostic abstraction layer that
normalizes prompts, sessions, and streaming across Claude/Cursor/Codex. **A
profile is a way to start a terminal, not a way to talk to an agent.**
Everything downstream stays what it is today: a PTY, a shell, and a TUI you can
type in.

This RFC covers phase 1 — populating and using the `+` menu. It states a
direction for the deferred phases (prompt delivery, resume composition,
`ctx.agents.profiles`, per-account hooks) so those aren't re-argued from scratch,
without designing them in detail here. The **command line** is the exception: it
ships later, but its surface is specified here, because a profile id is a value a
human types and that constraint has to be settled while the record is being
defined.

## Motivation

### The concept already exists — only in the user's head

Every time you start an agent you make a choice with three parts: _which
agent_, _which account or config_, _which flags_. Users encode that choice as
shell aliases (`claude-work`, `claude-personal`) or by exporting a config
directory before launching. Silo has no representation of it, so every surface
that wants to start an agent has to either hardcode a binary name or punt to
"open a shell and type it yourself."

### What the code does today

**1. `TerminalKind`'s agent values are vestigial.** The type is
`"shell" | "claude" | "pi"` (`packages/sdk/src/domain-types.ts:17`), and
`TerminalPanel.tsx:889` acts on it:

```ts
if (needsCreate && tRec.kind !== "shell") {
  const cmd = tRec.kind === "claude" ? "claude" : "pi";
  window.setTimeout(() => session.write(`${cmd}\r`), 150);
}
```

But **nothing in the repo creates a terminal with those kinds.** Every call site
passes `shell` — the `+` menu (`GroupAddMenu.tsx:160`), the empty watermark,
`core.newTerminal`, the file explorer's "open terminal here", and
`TerminalPanel`'s own "new terminal here". `ctx.terminals.create({ kind:
"claude" })` is reachable in principle; no first-party extension calls it. So
the only way to get an agent terminal in Silo today is to open a shell and type
the command yourself, after which sealed detection (ADR 0028) notices and flips
`isAgent`.

**Profiles therefore don't add a concept — they replace a dead one.**

**2. The `+` menu can't start an agent.** It offers exactly one terminal
entry: "New Terminal".

**3. The launch write lives in the view.** Because
`TerminalPanel.tsx:889` runs inside the panel's mount effect, and PTYs spawn
lazily on first mount, a launch targeting a background workspace would get a
terminal record, a live PTY, and **no agent** until someone clicks the tab.
This is also a latent bug against the SDK's promise that `sendText` "works even
if the terminal tab has never been shown" — `create({ kind })` quietly doesn't.

**4. Resume drops the user's flags.** The catalog hardcodes the binary
(`catalog/claude.ts`):

```ts
buildResumeCommand: (sessionId) => `claude --resume ${sessionId}`;
```

Launch with `claude-work` and the hint hands back a bare `claude --resume <id>`,
silently dropping the flags and — where the alias sets a config directory — the
account. The terminal has no memory of _how it was started_, because there is
nothing to remember it in.

### What's already in place

Three roadmap prerequisites shipped, and this proposal builds directly on them:

- **RFC 0028** (terminal identity in the environment) — every Silo terminal
  carries `SILO`, `SILO_TERMINAL_ID`, `SILO_WORKSPACE_ID`, `SILO_WORKSPACE_PATH`,
  `SILO_BIN`, under a reserved `SILO_*` namespace the host owns and callers
  cannot write. It also already decided the `SILO_AGENT_PROFILE` question on
  frozen-facts grounds: profile identity describes what is running _right now_,
  so it belongs on the launch line, never in the session environment.
- **ADR 0041 / 0042** (agent catalog modularization) — the catalog is modular,
  with declarative `runtime` policy and per-agent modules for quirky agents. pi
  now has a full catalog entry, closing the gap the earlier draft of this design
  cited as motivation.
- **ADR 0028** (sealed detection) — no public detector registration. This
  proposal does not reopen it; see "What a profile may and may not claim."

## Design

### The record

```ts
/** A named way to start an agent in a terminal. User-defined, host-owned. */
interface AgentProfile {
  /** Short, user-authored, editable, unique. Prefilled by slugifying the
   *  label. This is what a human types at `silo agent run --profile <id>`,
   *  which is why it is theirs to choose rather than derived and frozen. */
  id: string; // "claude-work"
  /** Shown in menus. Freely editable. */
  label: string; // "Claude (work)"
  /**
   * The shell command line, typed into the terminal's interactive shell
   * exactly as a user would type it. A *string*, not an argv array — that is
   * what makes aliases, shell functions, and version-manager shims work.
   */
  command: string; // "claude-work", or plain "claude"
  /**
   * Absolute path to an agent config directory, for agents that support one.
   * Prefixed onto the launch line as the catalog agent's own
   * `configDirEnvVar`. Lets a user run two accounts without writing aliases.
   */
  configDir?: string; // "/Users/dave/.claude-work"
  /**
   * Which sealed catalog agent this launches. Auto-detected by the probe,
   * overridable in the editor. Supplies the menu icon and, later, resume
   * flags. **Never** written into `AgentInfo.agentId` — see below.
   */
  agent?: CatalogAgentId;
  /** Preselected in menus when a launch names no profile. */
  default?: boolean;

  // ── cached probe results: derived, never user-edited ──────────────────
  /** What `type -- <command>` resolved to, at save or recheck. */
  resolvedCommand?: string; // "claude --dangerously-skip-permissions"
  resolvedAt?: string; // ISO
}
```

Deliberately absent: a free-form `env` map, a `cwd`, an `isAgent` flag, and
`promptDelivery`. Each is argued in "Alternatives considered."

### The catalog gains one field

```ts
interface AgentDefinition {
  // …
  /** The environment variable this agent reads its config directory from
   *  (`"CLAUDE_CONFIG_DIR"`). Undefined for agents with no such mechanism —
   *  the profile editor then hides the field entirely. */
  configDirEnvVar?: string;
}
```

Which env var an agent reads is a fact about that agent's CLI, not a user
preference — the same class the sealed catalog already holds (`leaderNames`,
`buildResumeCommand`, `runtime` policy). Each entry's `contract`,
`upstreamRefs`, and `lastVerified` are updated per the catalog's existing
discipline.

#### Recon results

Every catalog agent was probed on macOS (2026-08-31) — `--help`, embedded
strings, resolver source where the binary is a JS bundle, and empirical runs
against a scratch directory. **None of this is documented upstream**, which is
what the recon step in `docs/adding-a-coding-agent.md` exists for.

The distinguishing question is not "does an env var move the config directory"
but **"does it move the credentials too"** — because the user-facing purpose of
this field is running two accounts.

| Agent          | Env var               | Config | Credentials                           | Hook config inside it | Evidence                                                                        |
| -------------- | --------------------- | ------ | ------------------------------------- | --------------------- | ------------------------------------------------------------------------------- |
| `claude`       | `CLAUDE_CONFIG_DIR`   | yes    | yes (`.claude.json`)                  | yes                   | Empirical — created `.claude.json` + `backups/`; `claude mcp list` read it      |
| `codex`        | `CODEX_HOME`          | yes    | yes (`auth.json`)                     | yes                   | Empirical — `codex doctor` resolves config + state root from it                 |
| `grok`         | `GROK_HOME`           | yes    | yes (`auth.json`)                     | n/a (session-file)    | Binary's own help: "Set `GROK_HOME` to override the base directory"             |
| `pi`           | `PI_CODING_AGENT_DIR` | yes    | yes (`auth.json`)                     | yes                   | Source: `process.env.PI_CODING_AGENT_DIR ?? ~/.pi/agent`                        |
| `cursor-agent` | `CURSOR_CONFIG_DIR`   | yes    | **no** — `auth.json` from `homedir()` | yes                   | Source: env → `$XDG_CONFIG_HOME/cursor` → `~/.cursor`                           |
| `opencode`     | `OPENCODE_CONFIG_DIR` | yes    | **no** — `~/.local/share/opencode`    | n/a (`resume: none`)  | Source: config load path; suppresses default config bootstrap                   |
| `copilot`      | **none**              | no     | no                                    | no                    | `COPILOT_HOME` only extends the plugin `pkg` search path; root from `homedir()` |

**Populate `configDirEnvVar` for `claude`, `codex`, `grok`, and `pi` only.**

Leave it undefined for `cursor-agent` and `opencode`. Both have a real config-dir
variable, but credentials resolve from the home directory independently — so a
second profile would share the first one's account while _looking_ like it had
its own. A field that appears to enable two accounts and silently doesn't is
worse than no field. Record the finding in each entry's `contract` so it isn't
re-derived; revisit if either agent gains a credential-dir override.

Leave it undefined for `copilot`: `COPILOT_HOME` exists but only adds a plugin
package search path, and `~/.copilot` is resolved from `homedir()` with no
override at all. This is the case that justifies the recon — string presence
alone would have produced a field that does nothing.

Note for the four that are populated: the hook `configPath` for `claude`,
`codex`, and `pi` sits _inside_ the overridden directory
(`.claude/settings.json`, `.codex/hooks.json`,
`.pi/agent/extensions/silo-track-session.ts`), which is what makes the deferred
`(agentId, configDir)` hook keying work cleanly.

**Operational detail:** `codex` does not create `CODEX_HOME` if it is missing —
it warns and fails to load config. The profile editor should verify the
directory exists and offer to create it rather than let the first launch fail
confusingly.

### Why `command` is a string, not an argv array

Silo launches agents by **typing into an interactive login shell**, not by
exec'ing a binary. The PTY runs `$SHELL -l`
(`apps/desktop/src-tauri/src/main.rs:29`, overridable in Settings → Terminal),
and the launch is a `session.write()`. That shell sources the user's rc file, so
aliases, shell functions, `mise`/`nvm` shims, and `direnv` all resolve.

An argv array implies exec, and exec breaks all of it. So does the seemingly
tidier `$SHELL -lc "claude-work"`: `zsh -lc` is **non-interactive** and doesn't
source `.zshrc`; bash additionally needs `shopt -s expand_aliases`. Typing into
an interactive shell is a load-bearing design property, not an implementation
detail, and the record says so by holding a string.

### The probe — one call, four jobs

When a profile is saved (and on an explicit **Recheck**), Silo runs
`$SHELL -i -c 'type -- <first token>'` through `ctx.process.exec`. One
user-initiated, bounded call answers four questions:

1. **Does this command exist?** No resolution ⇒ the profile is shown as broken
   in settings rather than failing silently at launch time.
2. **Which catalog agent is it?** Take the expansion's argv0 basename and match
   it against catalog `leaderNames`. `claude-work is an alias for claude
--dangerously-skip-permissions` ⇒ `claude`. A bare binary resolves to a path;
   a shell function is reported as one.
3. **What does this profile actually do?** The expansion is stored as
   `resolvedCommand` and shown in the settings row — the one piece of
   information that makes an opaque alias legible.
4. **Does the alias already set the config dir?** If the expansion contains an
   assignment to the agent's `configDirEnvVar`, the profile's own `configDir`
   would be silently overridden (the alias's assignment runs inside the
   command). Warn in the editor instead of shipping a baffling bug.

Fallback when the probe is unavailable or unparseable: match the command's
leading token up to a `-`/`_` boundary against `leaderNames` (`claude-work` →
`claude`). **Never substring-match** — ADR 0042 already flagged that `pi` is a
two-character substring that matches almost anything, and `copilot` contains
`pilot`. Skip the heuristic entirely for ids shorter than three characters. A
`Select` in the editor overrides both, always.

Consent note: this probe runs the user's rc file. That is acceptable _because_
it is user-initiated — they clicked Save. The same probe run automatically at
first launch to sniff for aliases would not be, which is why seeding works
differently (see "Empty state").

`resolvedCommand` is display and diagnostics only. It is never the thing that
gets run — the launch always types `command`, so an alias that changes takes
effect immediately rather than being pinned to a stale expansion. It may contain
a secret the user inlined in their own alias; don't write it to the Output
channel.

### The config directory

When a profile sets `configDir` and its resolved agent declares a
`configDirEnvVar`, the launch line is prefixed:

```
CLAUDE_CONFIG_DIR='/Users/dave/.claude-work' claude
```

**Expand `~` at save time and store an absolute path.** Quoting `'~/.claude-work'`
leaves the tilde unexpanded; not quoting it opens a shell-injection hole on a
user-supplied string. Expanding at save closes both, and the stored path is then
POSIX single-quote wrapped (`'` → `'\''`) at launch.

This is what lets a user run two accounts without touching their dotfiles — for
the four agents where the variable actually separates credentials. Aliases
remain fully supported, and are the only route for the other three: a user who
already has `claude-work` sets no `configDir` at all, and the probe's conflict
check keeps the two mechanisms from quietly fighting.

Silo verifies the directory exists at save time and offers to create it, since
at least one agent (`codex`) fails to load config rather than bootstrapping a
missing one.

### The launch path moves into the host

Delete the shim at `TerminalPanel.tsx:889`. The host owns the sequence:

```
create record (with profileId)
  → ensureSession()
  → write `<envPrefix> <profile.command>`
```

Sequencing it in the host is what makes a launch into a _background_ workspace
actually start the agent, and it removes the `setTimeout(…, 150)` guess from a
React mount effect.

`launch` must be safe to call concurrently — the eventual CLI's headline
scenario is five worktrees and five agents at once. It must not steal focus or
reorder tabs.

### Terminal record and `TerminalKind`

```ts
interface TerminalRecord {
  // …
  /** The profile this terminal was launched from, if any. Persisted. */
  profileId?: string;
}
```

`TerminalKind`'s `"claude"` and `"pi"` **values** are deprecated; the type and
the `TerminalRecord.kind` / `CreateTerminalInput.kind` fields stay. Both are
`@public`, and third-party extensions ride the published SDK with known lag
(`docs/silo-extensions-repo.md`), so removing them here would be a breaking
change with no benefit. `create()` treats either value as `"shell"` and
synthesizes a matching profile; persisted records carrying one are migrated to
`kind: "shell"` plus a `profileId`. Actual removal is a later change gated on
`engine-compat.ts`.

`docs/domain-language.md:256` currently documents Terminal Kind vs Catalog Agent
as a live distinction and is updated in the same change: **Profile is the launch
vocabulary, Catalog Agent is the identity vocabulary**, and Terminal Kind stops
trying to be either.

### What a profile may and may not claim

ADR 0028's stance is that Silo never claims what it cannot prove. A profile's
`agent` field is a **user assertion**, not an observation, so the boundary is
explicit:

- **May**: pick the `+` menu icon, supply resume flags at composition time
  (phase 2), and select the `configDirEnvVar` to prefix.
- **May not**: write `AgentInfo.agentId`, or seed `isAgent`.

Detection already handles the alias case correctly and quickly: `claude-work`'s
foreground leader is `claude`, so `agentByLeader` matches within a second of the
agent's first OSC title. Seeding `isAgent` from the profile would buy that
second and cost a permanent phantom agent row — in the Navigator and on the tab
— whenever the command doesn't resolve. The trade is bad, and it is exactly the
kind of unprovable claim ADR 0028 exists to prevent.

A consequence worth stating plainly: **a terminal has a profile only if Silo
launched it with one.** A hand-typed agent gets full catalog identity —
`agentId`, activity, resume — and no profile. No surface guesses at one.

### Failure is visible

Silo types a command into a PTY; there is no exit code. If an alias is missing,
the user gets a tab Silo has titled "Claude (work)" running `command not found`.
Two mitigations, both cheap:

- **At save time**, the probe marks an unresolvable profile as broken in
  settings, before it ever reaches the menu.
- **At launch time**, scan the session's first output for a `command not
found` shape and surface an inline notice linking to the profile. Silo already
  owns the output stream.

### Surfaces

**The `+` menu** — profiles listed **flat**, after "New Terminal", each with its
agent's icon and label. Flat always: an adaptive menu that collapses into a
submenu past N profiles changes shape as the user adds one, which is worse than
either fixed form. If crowding ever bites, the fix is a separator, not a
submenu. The same entries appear on the terminal tab context menu ("Claude
(work) here"), which already offers "new terminal here" against the live
foreground cwd.

**Empty state** — with no profiles defined, the `+` menu shows a single **"Add
an agent profile…"** entry that opens Settings → Agents → Profiles. Silo ships
**zero** profiles and seeds nothing automatically. That entry is the whole of
onboarding: no first-run wizard, no modal gate at app start.

The Profiles tab then leads with a **"Found on this machine"** section: Silo runs
`command -v` against each catalog agent's `leaderNames` and renders each hit as a
one-click add card (icon, display name, the resolved command). Nothing is written
without that click, and the section clears itself as cards are added, so it never
becomes permanent chrome. Below it sits the honest empty state, which is what the
tab shows once the cards are gone.

The point of the redirect is that it costs the user a detour from what they
actually wanted — a terminal — so the first screen has to produce a working
profile in **one click** rather than teach a data model. Detection is what makes
that possible: Silo can show the four agents you have instead of the fourteen
that exist.

This is a plain PATH lookup, not the interactive-shell probe — it deliberately
cannot find aliases, and it does not run the user's rc file. A user with aliases
uses the manual path; the cards serve the majority who have none.

**Settings → Agents** — the existing page (`agents-settings/index.tsx`) gains a
tab and renames one:

```
Profiles | Behavior | Navigator | Display | Sessions
```

- **Profiles** (new, first — it is the thing users edit) — `List` / `ListRow` +
  `AddRow`. A row carries: star for default · label · resolved command ·
  agent icon and name · config directory when set · a resume-status badge · `⋮`
  for Edit / Duplicate / Set default / Delete. The config directory must be on
  the row: with it, two profiles can share the command `claude` and differ only
  by account, and a row reading just "claude" twice would be useless.
- **Sessions** — today's **Hooks** tab, renamed. What it configures is session
  capture, and `getsilo.dev/guide/agent-sessions` already uses that word.
- **Behavior / Navigator / Display** — unchanged.

Hooks are **not** folded into profile rows. Two things live on that tab which
profiles cannot absorb: hook install for agents launched by hand with no
profile, and `extraSettingsToggle` prerequisites (pi's terminal-progress
setting) that gate _activity detection_ and have nothing to do with launching.
The coupling is expressed as a cross-link instead — a profile row whose agent
has no installed hook shows a `Best-effort resume` badge that jumps to Sessions.

The removal trigger is real but later: once Managed Hooks installs on first
sight, the tab stops being a control panel and becomes a ledger, at which point
it either collapses into a disclosure on Profiles or leaves the Agents page
entirely.

**Row actions** (`⋮`) — Edit, Duplicate, Set default, **Move up / Move down**,
Delete. Row order is the `+` menu's order, so it has to be controllable; two
menu items get there without depending on `ctx.dnd`, and unlike drag they work
from the keyboard. **Duplicate** is the two-account gesture: it copies the
profile and opens the editor with the config-directory field focused, since that
is the only field that has to differ.

**The profile editor** — a `Modal` (host chrome, ADR 0018) with kit fields per
ADR 0026: `Input` label, `Input` **id** beneath it — prefilled from the label,
editable, and captioned as what the CLI takes as `--profile` — `Input` command,
`Select` agent,
and — only when the resolved agent declares a `configDirEnvVar` — an `Input`
for the config directory. No bespoke widgets.

Below the fields, the editor shows **the launch line Silo will type**, with a
Copy button:

```
$ CLAUDE_CONFIG_DIR='/Users/dave/.claude-work' claude-work
```

Silo launches by typing into an interactive login shell, and that is a
load-bearing design property rather than an implementation detail — so show it.
It turns the config-directory prefix from something magic into something
obvious, and it makes the alias resolution legible next to the `resolvedCommand`
line.

**There is deliberately no "Test launch" button.** Copying the line is the
better test: it can be pasted into any terminal to watch the agent actually
start, which proves more than a throwaway terminal would, and it doesn't yank
the user out of Settings, need a host workspace to put a terminal in, or need a
rule for cleaning one up.

### Profile ids

**The id is user-authored, short, and editable.** It is prefilled by slugifying
the label — lowercase, strip non-alphanumerics, collapse to single hyphens, trim,
so `"Claude (work)"` → `claude-work` — and then presented as an editable field
in the profile editor, not as a derived value the user has to accept.

This is a deliberate reversal of an earlier draft, which derived the id and froze
it. The reason is the command line below: **the id is something a human types**,
so it has to be theirs to choose and theirs to change when their mental model
does. An id nobody can remember is a worse failure than a rename that costs
something.

Rules: unique across profiles, `^[a-z0-9][a-z0-9-]*$`, rejected if it collides,
with the editor showing the conflict rather than silently suffixing.

**What a rename costs.** The id is a reference in three places, and they degrade
differently:

| Reference                        | On rename                                                 |
| -------------------------------- | --------------------------------------------------------- |
| `TerminalRecord.profileId`       | Host state — swept and rewritten in the same transaction. |
| `core.newAgent.<id>` keybindings | Phase 2. A binding to the old command id goes dead.       |
| The user's own scripts / aliases | Break, visibly, and that is the user's own trade to make. |

Only the middle one is a real loss, it is not phase-1 work, and the fix when it
arrives is to warn on rename when a binding exists rather than to forbid renaming
outright. A profile whose id can't be typed from memory fails at the thing this
whole surface exists for.

### The command line

The CLI is roadmap item 8 and depends on the Control API (item 7), so it does not
ship in phase 1. Its surface is specified **here** rather than deferred, because
it is what forces the id decision above — designing the record without knowing
that ids get typed produces exactly the frozen-slug mistake this RFC just backed
out of.

```sh
silo agent run --profile claude-work   # launch that profile
silo agent run                         # pick from a menu, then launch
silo agent list [--json]               # the profiles, with their ids
```

`--profile` takes the id. That is the whole reason ids are user-authored: the
value of `silo agent run --profile claude-work` over an ad-hoc
`--command "claude-work"` is that the name is stable, shared, and short enough to
remember, and the flags and config directory come along with it.

**It launches into the terminal you typed it in**, not a new tab. That is the
behaviour that makes it feel native rather than like a remote-control API, and
it is available because RFC 0028 already puts `SILO_TERMINAL_ID` in every Silo
terminal's environment. The sketch:

1. `silo` reads `$SILO_TERMINAL_ID` and asks the host to launch profile `X` there.
2. The host cannot write the launch line yet — `silo` itself is the foreground
   process of that PTY, so anything written now is queued as type-ahead behind it.
3. The host waits for the foreground process to return to the shell — which it
   already tracks, since `ctx.processes` is how agent detection works — and then
   writes the launch line.
4. Outside a Silo terminal (no `SILO_TERMINAL_ID`), the same command creates a
   new terminal in the resolved workspace instead, and says so.

Bare `silo agent run` with no `--profile` resolves through the same order as
every other launch path: explicit id → the default profile → a picker. The
picker is a terminal menu, not the host UI; nothing about it needs the app to be
focused.

`silo agent list` exists in phase 1's design mainly so that an agent reading
`AGENTS.md` can discover what profiles are available without being told.

### Icons, and where they live

The `+` menu wants each profile's agent icon, and there is a boundary in the
way. `agent-icons.ts` lives in `packages/extensions-silo/src/agents/` — an
extension package — while `GroupAddMenu.tsx` is host chrome that cannot import
it. The tab-adornment registry is keyed by target id, so it is the wrong shape
for a menu.

Move `agent-icons.ts` next to the sealed catalog in the host, and expose it as
**`ctx.agents.catalog()`** — a read-only list of `{ id, displayName, icon }`.
The host renders menu icons from its own copy; `silo.agents` deletes its local
file and reads the SDK surface. One source of truth, correct dependency
direction, and it matches the sealed stance exactly: extensions _read_ the
catalog, they never register into it. An agent's brand mark is a fact about a
catalog agent, the same class as `displayName`, which already lives there.

### Phasing

**Phase 1 — populate and use the `+` menu.**

1. `AgentProfile` type, store slice, settings persistence; `configDirEnvVar` on
   `AgentDefinition`.
2. `TerminalRecord.profileId`; deprecate the `TerminalKind` agent values;
   migrate persisted records; update `docs/domain-language.md`.
3. Move the launch write out of `TerminalPanel` into the host launch path.
4. Settings → Agents → Profiles: list, add, edit, delete, set default, with the
   save-time probe doing validation and agent detection. Rename Hooks →
   Sessions.
5. `+` menu: flat profile list with icons; empty state → "Add an agent
   profile…"; tab context menu.
6. Icons: move `agent-icons.ts` to the host, add `ctx.agents.catalog()`, point
   `silo.agents` at it.

Phase 1 ships tests in the same change per the repo's testing rule, and the
`ctx.agents.catalog()` addition runs the full docs-sync workflow.

**Deferred, with the direction stated so it isn't re-argued:**

- **Commands and keybindings** — one `core.newAgent.<profileId>` per profile,
  making profiles palette-searchable and bindable. Phase 2's cheapest win; the
  only new problem is dangling command ids after a delete.
- **Prompt delivery** — `promptDelivery` belongs on `AgentDefinition`, not on
  the profile: how Claude Code accepts a prompt is a fact about Claude Code, and
  the set of transports should stay small and closed rather than becoming
  per-agent shell templates. Caller text must never be interpolated raw into a
  shell line. The payload should ride in a **quoted heredoc**, and the prompt
  must be **sanitized for a line editor** first — see Alternatives for why that
  matters more than quoting does.
- **Resume composition** — split `buildResumeCommand` into catalog-owned
  `resumeArgs` and the profile's command, composed as
  `<envPrefix> <command> <resumeArgs>`. The env prefix is not optional: without
  it, resume attaches to the wrong account. Compose only when `resolvedCommand`
  shows a bare token plus flags; otherwise fall back to the catalog default and
  say so. The catalog is not uniform — `codex resume <id>` is a positional
  subcommand and `copilot --resume=<id>` is `=`-joined — so a naive
  `${command} ${args}` is not safe everywhere.
- **`ctx.agents.profiles`** — `list()` and `launch({ profileId?, workspaceId?,
cwd?, prompt?, activate? })`. Not `pick()` (an extension builds one from
  `list()` + `ctx.ui.showMenu` in five lines, and `showMenu` _is_ the shared
  chrome) and not `get()` (`list().find()`). The first real consumer is RFC
  0031's deferred **Start Task**, which lives in the external repo and rides the
  published SDK — so this must publish before that is buildable.
- **`SILO_AGENT_PROFILE` + hook confirmation** — RFC 0028 designed the seam and
  the hook script has the env-var-first branch waiting. Deferred until a surface
  actually branches on "confirmed" versus "assumed"; deferring also avoids the
  compound-command case (`SILO_AGENT_PROFILE=x cd foo && claude` scopes the
  variable to `cd`) and the bash/zsh difference in `VAR=x shell_function`
  semantics.
- **Per-account hooks** — install strategies keyed on `(agentId, configDir)`
  rather than `agentId`, so a second account gets exact resume. Roadmap item 6
  (Managed Hooks). Phase 1 makes the data declarative, which is the hard part;
  until then a second-account profile launches correctly and still gets a
  best-effort resume hint. **This is not a regression** — that account gets a
  generic hint today too.
- **Per-workspace default profile** — binding a workspace to a profile so "new
  agent" does the right thing per repo with no menu. Deliberately deferred, not
  overlooked.
- **CLI** — `silo agent run --profile <id>`, bare `silo agent run`, and
  `silo agent list`. **Designed above rather than deferred**, because the id is
  a value humans type and that constraint has to be settled while the record is
  being defined. Implementation waits on roadmap items 7 and 8 (Control API,
  then the CLI); nothing in phase 1 depends on it shipping.

## Prior art

Six of eight comparable tools surveyed (2026-08-31) ship a version of this, so
the concept is settled rather than novel. What differs is the layer it sits in,
and that difference falls cleanly on launch mechanism.

| Tool         | Called                                                      | The record                                                                         | Configured in                       |
| ------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------- |
| Orca         | custom CLI agent, plus a separate accounts page             | name, command, arguments, startup hook, icon                                       | settings UI                         |
| Superset     | custom agent / preset                                       | label, command, args, promptArgs, resumeArgs, forkArgs, promptTransport, env, icon | settings UI                         |
| Paseo        | Agent Profile (model bundle) + provider "profiles" (launch) | name/icon/colour/provider/model/mode/notes; label/command/env                      | UI + `~/.paseo/config.json`         |
| cmux         | agent action                                                | title, command, target, icon, shortcut                                             | `cmux.json`, per-project and global |
| Claude Squad | Profile                                                     | name, program                                                                      | `~/.claude-squad/config.json`       |
| AgentsRoom   | Claude Multi-Account                                        | account dir + per-agent / per-project / global binding                             | settings UI, in-app sign-in         |

What this proposal takes from it:

- **A command string, not an argv array.** Superset and Claude Squad both type
  into a terminal and both store a string; Paseo stores argv but `exec`s a
  provider and never touches a shell. The split is the launch mechanism, which
  is the same reasoning this RFC reaches independently.
- **The command belongs in the list row.** Superset and Orca both render it in
  monospace under the name. With two profiles differing only by config
  directory, it is what makes them distinguishable.
- **Add from a catalog.** Superset's `+ Add agent` opens a list of known agents
  plus "Custom agent…". Silo can do better than a static list because it has
  detection — hence "Found on this machine".
- **One form for builtin and custom.** Superset's builtin agents use the same
  editor as custom ones, with a _Restore default_ action instead of a separate
  concept. That is why this RFC has a single `AgentProfile` rather than a
  preset/custom split.

What it deliberately doesn't take:

- **Orca's Command + Arguments split into two fields.** Two fields cannot
  express an alias, which is the entire reason `command` is a string.
- **An icon picker as the primary mechanism.** Paseo and Superset both make the
  user choose from a grid, because neither has a detection layer to ask. Silo
  resolves the icon from the probe and keeps the picker only as an override.
- **Orca's accounts-as-a-separate-page.** Correct at their scale — they have a
  full account subsystem with keychain storage and in-app OAuth. Premature for
  one `configDir` field. Revisit if in-app sign-in is ever wanted.
- **A first-run wizard** (Orca) — see Alternatives.

Two findings that shaped decisions elsewhere in this document: Superset's
prompt-delivery code (see Alternatives) and the fact that **multi-account is a
real product surface, not a footnote** — Orca ships roughly thirty files of
Claude account management, and AgentsRoom's whole product is that feature, with
a resolution order (per-agent override → per-project pin → global default →
system `~/.claude`) worth returning to when the per-workspace binding lands.

Sources: [superset-sh/superset](https://github.com/superset-sh/superset)
(`packages/shared/src/agent-custom.ts`, `agent-prompt-launch.ts`),
[stablyai/orca](https://github.com/stablyai/orca) (`src/main/claude-accounts/`),
[getpaseo/paseo](https://github.com/getpaseo/paseo)
(`packages/protocol/src/provider-config.ts`, `public-docs/custom-providers.md`),
[smtg-ai/claude-squad](https://github.com/smtg-ai/claude-squad) (`config/config.go`),
[cmux custom commands](https://cmux.com/docs/custom-commands),
[AgentsRoom multi-account](https://agentsroom.dev/features/claude-multi-account).

## Alternatives considered

**An argv array instead of a command string.** Implies exec, and exec doesn't
source the user's rc file — every alias, shell function, and version-manager
shim stops resolving. `$SHELL -lc "…"` fails the same way (non-interactive).
Rejected on the mechanics.

**An agent-agnostic runner** — a normalized API over prompts, sessions,
streaming, and tool approval across Claude/Cursor/Codex. Large surface, breaks
every time an upstream agent ships, duplicates what the TUIs already do well,
and none of the scenarios here need it. If one is ever wanted it should be an
**extension** built on `ctx.agents.profiles` + `ctx.terminals`, where it can
break and be fixed without touching the host.

**A free-form `env` map on the profile.** Tempting and nearly free, but it is
the attractor for API keys in plaintext settings, it breaks resume composition
(the prefix has to be reproduced and Silo wouldn't know which vars matter), and
it is redundant with an alias for anyone who has one. `configDir` is the narrow
version: one named field whose meaning Silo understands and can act on at
launch, at resume, and later at hook-install time. Reconsider only if
`ctx.secrets` lands and a real consumer appears.

**Interpolating a prompt into the launch line (`argv` delivery).** The highest-
severity idea in the original sketch: extension-supplied text through a live
shell, where a quoting bug is arbitrary code execution as the user. It also
fails on length (the motivating example interpolates CI logs into a line typed
through zsh's line editor) and on dialect (POSIX single-quoting breaks on fish
and nu). Writing the prompt to a temp file and typing a Silo-generated path was
the first fix considered here; prior art suggests a better one.

Superset, which launches into a PTY exactly as Silo does, wraps the payload in a
**quoted heredoc** (`cmd "$(cat <<'DELIM' … DELIM )"` for argv, `cmd <<'DELIM' …`
for stdin). That kills expansion and quoting in one move, handles multi-line and
long payloads, and leaves no file to clean up. More importantly, their code
names a hazard neither the temp-file nor the quoting analysis had reached: the
bytes are **typed**, so they hit the shell's line editor as keystrokes — ESC and
C1 sequences fire keybindings, a lone CR submits the line early, and a tab
triggers completion. They ship a sanitizer that normalizes CRLF, strips ANSI CSI
and OSC sequences whole, removes remaining control characters, and expands tabs.
Silo needs the equivalent regardless of which transport it picks.

Their source also confirms the dialect problem is real and bounded: both heredoc
forms are bash/zsh-only, fish has no heredocs, and they rewrite the command at
launch time when the shell is fish. Deferred with prompt delivery, but the
direction is settled.

**Seeding profiles automatically on first run.** Probing `command -v` would find
bare binaries but not aliases; probing `$SHELL -i -c 'type …'` would find
aliases but means running the user's rc file to sniff their config, unprompted.
Rejected both as automatic behavior. The empty `+` menu entry plus the
"Found on this machine" cards on the Profiles tab get the same result at the
moment of intent, with a click behind it.

Worth noting the field does not share the objection: Claude Squad runs the
interactive-shell probe (`source ~/.zshrc …; which claude`) automatically at
install time to seed its default. Silo still shouldn't — but the empty state has
to be good enough that the restraint costs nothing, which is what the cards are
for.

**A derived, immutable profile id.** The first draft slugified the label at
creation and froze it, on the grounds that the id is a foreign key in terminal
records, command ids, and scripts, and that renaming is painful to retrofit. That
reasoning was sound and the conclusion was still wrong: it optimised for the
machine's references and ignored the only reference that has a human in it. The
id is typed at `silo agent run --profile <id>`, so it has to be short, memorable,
and chosen — and a mental model that changes has to be allowed to change the name
with it. The costs are enumerated under "Profile ids"; only dead keybindings are
a real loss, and that is phase-2 work with an obvious mitigation.

**A "Test launch" button.** Cut in favour of copying the launch line. Launching
into a throwaway terminal needs a workspace to put it in, pulls the user out of
Settings, and needs a cleanup rule; a copyable line can be pasted into any
terminal and proves more, because it exercises the user's real shell.

**A first-run wizard** (as Orca does). Rejected: it gates the app before the
user has opened a project, so "which agents do you use here?" has no _here_; it
duplicates the empty-state flow; and Silo's first-run job is "open a project."
If discovery turns out to be the real problem, a one-time non-blocking notice is
the cheaper answer.

**Extension-contributed profiles.** ADR 0028 sealed detection for good reasons.
Launch is not detection, so the argument is weaker — but a marketplace of
extensions injecting shell commands into a user's terminal is a real trust
surface. No for v1; an extension that wants a different agent asks the user.

**Per-workspace default profile as the primary surface.** Arguably the higher-
value feature — the account choice tends to follow the repo, so a binding would
make "new agent" do the right thing with no menu at all, and it would carry
fan-out across worktrees for free. Deferred by preference: the `+` menu is the
concrete daily gesture, and shipping the binding first would add default
resolution order and workspace-state migration to a phase meant to stay small.
Revisit once profiles exist and the menu has been lived with.

**Folding hooks into profile rows and deleting the Hooks tab.** Attractive —
it would make the hook a property of the thing users actually think about
("my work Claude") rather than of a catalog agent. Rejected for now because
hand-typed agents still need hook config and `extraSettingsToggle` needs a home,
so a tab named "Profiles" would end up carrying a section about non-profile
agents. Revisit when Managed Hooks turns that surface into a ledger.

**Removing `TerminalKind` outright.** Breaking change to published `@public`
API for no benefit beyond tidiness, against a third-party ecosystem with known
SDK lag. Deprecate the two values now; remove behind `engine-compat.ts` later.

## Decision

_Pending._
