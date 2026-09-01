---
status: accepted # draft | accepted | implemented | rejected | superseded-by NNNN
created: 2026-08-31
---

# 0033. Agent Profiles — naming how you start an agent

> **Planning package scope: phase 1 only.** `requirements.md`, `design.md`, and
> `tasks.md` cover **phase 1 — populate and use the `+` menu** (see the phase
> table below). Later phases keep the direction stated here but get their own
> package when their turn comes.

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
  proposal does not reopen it; see "What a profile may and may not claim" in
  `design.md`.

## Proposed solution

A host-owned `AgentProfile` record (`id`, `label`, `command`, optional
`configDir`, optional catalog `agent` hint, `default`, plus cached probe
results), a new `configDirEnvVar` field on `AgentDefinition`, a
`TerminalRecord.profileId` back-reference, and a host-owned launch path that
replaces the shim in `TerminalPanel`. The surfaces are the `+` menu, the
terminal body context menu, and a new **Profiles** tab on Settings → Agents.

The technical shape is in [`design.md`](./design.md); the behavioral
specification and acceptance criteria are in
[`requirements.md`](./requirements.md).

### Phases

| Phase                                        | Scope                                                                                                                                                                                                                                                                                                                                                                                                | Status      |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **1 — Populate and use the `+` menu**        | The record, persistence, `configDirEnvVar`, `TerminalRecord.profileId` + `TerminalKind` deprecation, the pending-launch model (and the `SILO_TERMINAL_ID` repair it exposes), the Profiles settings tab (list/add/edit/delete/order + save-time probe), the `+` menu and terminal context menu, `ctx.agents.catalog()` + icon relocation, Hooks → Sessions rename.                                   | **planned** |
| 2 — Addressing a profile by name             | The three ways to name a profile instead of picking it: one `core.newAgent.<profileId>` command per profile (palette-searchable, bindable); the `default` flag, deferred from phase 1 because a flat `+` menu that names every profile gives a default nothing to do; and **`silo agent run --profile <id>`**, which needs no new IPC (see below). New problem: dangling command ids after a delete. | deferred    |
| 3 — Prompt delivery                          | `promptDelivery` on `AgentDefinition` (not on the profile), quoted-heredoc transport, line-editor sanitization.                                                                                                                                                                                                                                                                                      | deferred    |
| 4 — Resume composition                       | Split `buildResumeCommand` into catalog-owned `resumeArgs` + the profile's command and env prefix.                                                                                                                                                                                                                                                                                                   | deferred    |
| 5 — `ctx.agents.profiles`                    | Public `list()` / `launch()`. First real consumer is RFC 0031's deferred **Start Task**, which rides the published SDK — so this must publish before that is buildable.                                                                                                                                                                                                                              | deferred    |
| 6 — Per-account hooks                        | Install strategies keyed on `(agentId, configDir)` rather than `agentId`, so a second account gets exact resume. Depends on Managed Hooks.                                                                                                                                                                                                                                                           | deferred    |
| 7 — `SILO_AGENT_PROFILE` + hook confirmation | RFC 0028 designed the seam and the hook script has the env-var-first branch waiting. Deferred until a surface actually branches on "confirmed" vs "assumed".                                                                                                                                                                                                                                         | deferred    |
| 8 — Per-workspace default profile            | Binding a workspace to a profile so "new agent" does the right thing per repo with no menu. Deliberately deferred, not overlooked.                                                                                                                                                                                                                                                                   | deferred    |
| 9 — CLI read-back (`silo agent list`)        | `silo agent list [--json]` and bare `silo agent run`'s terminal picker — the parts that must return data to the caller's stdout. These are the only pieces that genuinely wait on a Control API; the launch half ships in phase 2.                                                                                                                                                                   | deferred    |

Phases 2–9 are **deferred, not rejected**. Their direction is stated here and in
`design.md` so they are not re-argued from scratch.

Phase 2 is deliberately the next slice: it is where a profile stops being
something you pick from a menu and becomes something you can name — from the
palette, from a keybinding, and from a shell.

### The command line, and why its two halves split

The CLI's full surface is settled here because it constrains the record:

```sh
silo agent run --profile claude-work   # launch that profile        → phase 2
silo agent run                         # pick from a menu, then launch → phase 9
silo agent list [--json]               # the profiles, with their ids  → phase 9
```

`--profile` takes the id. **The id is a value a human types**, which is why ids
are user-authored, short, and editable rather than derived from the label and
frozen — see "Profile ids" in `design.md` for the rules and what a rename costs.

**The launch half needs no new IPC.** An earlier draft deferred the whole CLI
behind a Control API. Reading the code shows that is only true of half of it. A
`silo` invocation already reaches the running app:
`tauri-plugin-single-instance` forwards the second process's **argv and cwd**,
`resolve_cli_request` parses subcommands out of them (`install`, `uninstall`,
path opening are already there), the app emits `cli:open`, and
`apps/desktop/src/cli/index.ts` acts on it — with a warm/cold model already
handled. `silo agent run --profile <id>` is one more arm in that parser and one
more branch in that handler, resolving its workspace from the forwarded cwd. It
ships in phase 2, with the other two ways of naming a profile.

**The read-back half genuinely waits.** `cli:open` is `app.emit` — fire and
forget, with no channel back to the caller. `silo agent list [--json]` has to
print to the caller's stdout, and bare `silo agent run`'s picker has to draw in
the caller's terminal. Neither is expressible this way, so both stay in phase 9
behind a real Control API.

**One extra piece for launching into the terminal you typed it in.** That needs
`SILO_TERMINAL_ID`, and single-instance forwards argv and cwd but **not**
environment — so the id has to ride in argv. Silo already maintains its own
`silo` shim in `<app-data>/bin` and puts it on its terminals' `PATH` (RFC 0028),
separate from the one a user optionally installs to `~/.local/bin`; the id can be
baked into that managed shim alone, leaving the user's own shim a plain
passthrough.

RFC 0028's `SILO_TERMINAL_ID` makes that behavior possible in principle — though
phase 1 discovered that the lazy-spawn path agent terminals actually take does
not stamp it, so phase 1 repairs that (see Scope). The sequencing sketch is in
`design.md`.

## Scope

**In (phase 1):**

- `AgentProfile` record, host state slice, persistence, migration.
- `AgentDefinition.configDirEnvVar` + the per-agent recon results below.
- `TerminalRecord.profileId`; deprecation of `TerminalKind`'s `"claude"` / `"pi"`
  values and of `AgentInfo.kind` (the types and fields stay).
- The **pending-launch model**: the host decides what to launch and records the
  intent; whoever brings the session up carries it out. Deletes the
  `TerminalPanel.tsx:889` shim without racing the panel for the PTY — see
  `design.md`, which corrects the RFC's original `create → ensureSession → write`
  sketch.
- **Repairing `SILO_TERMINAL_ID` on the tab lazy-spawn path.** That path spawns
  through the public `ctx.process.spawn`, which deliberately does not stamp a
  terminal id — so a tab whose PTY came up that way is missing its identity
  today. Pre-existing, in scope here because phase 1 makes it the normal path for
  agent terminals and phase 2's `silo agent run` depends on the guarantee.
- Settings → Agents: new **Profiles** tab; **Hooks** renamed to **Sessions**.
- `+` menu and terminal-body context menu entries; the empty state and the
  "Found on this machine" one-click adds.
- `ctx.agents.catalog()` (new public SDK surface) and moving `agent-icons.ts`
  into the host.

**Out (phase 1):** everything in phases 2–9 above, including the **default
profile** — phase 1's flat `+` menu names every profile, so a `default` flag
would be stored and never read; phase 2's commands and keybindings are what give
it a gesture. Also explicitly out: an agent-agnostic runner,
extension-contributed profiles, a first-run wizard, a free-form `env` map on the
profile, and a "Test launch" button — each argued under Alternatives.

**Repo:** all of it lands in this repo (`silo-code/silo`) — host
(`packages/extension-host`), SDK (`packages/sdk`), and the bundled extensions
`core.agents-settings`, `core.terminal`, `silo.agents`. Nothing lands in
`silo-code/silo-extensions` in phase 1.

## Per-agent recon: which agents get `configDirEnvVar`

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
`(agentId, configDir)` hook keying (phase 6) work cleanly.

**Operational detail:** `codex` does not create `CODEX_HOME` if it is missing —
it warns and fails to load config. The profile editor verifies the directory
exists and offers to create it rather than let the first launch fail confusingly.

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

Two findings that shaped decisions elsewhere: Superset's prompt-delivery code
(see Alternatives) and the fact that **multi-account is a real product surface,
not a footnote** — Orca ships roughly thirty files of Claude account management,
and AgentsRoom's whole product is that feature, with a resolution order
(per-agent override → per-project pin → global default → system `~/.claude`)
worth returning to when the per-workspace binding lands (phase 8).

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
break and be fixed without touching the host. Rejected.

**A free-form `env` map on the profile.** Tempting and nearly free, but it is
the attractor for API keys in plaintext settings, it breaks resume composition
(the prefix has to be reproduced and Silo wouldn't know which vars matter), and
it is redundant with an alias for anyone who has one. `configDir` is the narrow
version: one named field whose meaning Silo understands and can act on at
launch, at resume, and later at hook-install time. Deferred — reconsider only if
`ctx.secrets` lands and a real consumer appears.

**Interpolating a prompt into the launch line (`argv` delivery).** The
highest-severity idea in the original sketch: extension-supplied text through a
live shell, where a quoting bug is arbitrary code execution as the user. It also
fails on length (the motivating example interpolates CI logs into a line typed
through zsh's line editor) and on dialect (POSIX single-quoting breaks on fish
and nu). Writing the prompt to a temp file and typing a Silo-generated path was
the first fix considered; prior art suggests a better one.

Superset, which launches into a PTY exactly as Silo does, wraps the payload in a
**quoted heredoc** (`cmd "$(cat <<'DELIM' … DELIM )"` for argv, `cmd <<'DELIM' …`
for stdin). That kills expansion and quoting in one move, handles multi-line and
long payloads, and leaves no file to clean up. More importantly, their code names
a hazard neither the temp-file nor the quoting analysis had reached: the bytes
are **typed**, so they hit the shell's line editor as keystrokes — ESC and C1
sequences fire keybindings, a lone CR submits the line early, and a tab triggers
completion. They ship a sanitizer that normalizes CRLF, strips ANSI CSI and OSC
sequences whole, removes remaining control characters, and expands tabs. Silo
needs the equivalent regardless of which transport it picks. Their source also
confirms the dialect problem is real and bounded: both heredoc forms are
bash/zsh-only, fish has no heredocs, and they rewrite the command at launch time
when the shell is fish. Deferred to phase 3, but the direction is settled.

**Seeding profiles automatically on first run.** Probing `command -v` would find
bare binaries but not aliases; probing `$SHELL -i -c 'type …'` would find aliases
but means running the user's rc file to sniff their config, unprompted. Rejected
both as automatic behavior. The empty `+` menu entry plus the "Found on this
machine" cards on the Profiles tab get the same result at the moment of intent,
with a click behind it. Worth noting the field does not share the objection:
Claude Squad runs the interactive-shell probe (`source ~/.zshrc …; which claude`)
automatically at install time to seed its default. Silo still shouldn't — but the
empty state has to be good enough that the restraint costs nothing, which is what
the cards are for.

**A derived, immutable profile id.** The first draft slugified the label at
creation and froze it, on the grounds that the id is a foreign key in terminal
records, command ids, and scripts, and that renaming is painful to retrofit. That
reasoning was sound and the conclusion was still wrong: it optimised for the
machine's references and ignored the only reference that has a human in it. The
id is typed at `silo agent run --profile <id>`, so it has to be short, memorable,
and chosen — and a mental model that changes has to be allowed to change the name
with it. Costs are enumerated under "Profile ids" in `design.md`; only dead
keybindings are a real loss, and that is phase-2 work with an obvious mitigation.
Rejected.

**A "Test launch" button.** Cut in favour of copying the launch line. Launching
into a throwaway terminal needs a workspace to put it in, pulls the user out of
Settings, and needs a cleanup rule; a copyable line can be pasted into any
terminal and proves more, because it exercises the user's real shell. Rejected.

**A first-run wizard** (as Orca does). Rejected: it gates the app before the
user has opened a project, so "which agents do you use here?" has no _here_; it
duplicates the empty-state flow; and Silo's first-run job is "open a project."
If discovery turns out to be the real problem, a one-time non-blocking notice is
the cheaper answer.

**Extension-contributed profiles.** ADR 0028 sealed detection for good reasons.
Launch is not detection, so the argument is weaker — but a marketplace of
extensions injecting shell commands into a user's terminal is a real trust
surface. Rejected for v1; an extension that wants a different agent asks the user.

**Per-workspace default profile as the primary surface.** Arguably the
higher-value feature — the account choice tends to follow the repo, so a binding
would make "new agent" do the right thing with no menu at all, and it would carry
fan-out across worktrees for free. Deferred (phase 8) by preference: the `+` menu
is the concrete daily gesture, and shipping the binding first would add default
resolution order and workspace-state migration to a phase meant to stay small.

**Folding hooks into profile rows and deleting the Hooks tab.** Attractive — it
would make the hook a property of the thing users actually think about ("my work
Claude") rather than of a catalog agent. Deferred because hand-typed agents still
need hook config and `extraSettingsToggle` needs a home, so a tab named
"Profiles" would end up carrying a section about non-profile agents. Revisit when
Managed Hooks turns that surface into a ledger.

**Removing `TerminalKind` outright.** Breaking change to published `@public` API
for no benefit beyond tidiness, against a third-party ecosystem with known SDK
lag. Deprecate the two values now; remove behind `engine-compat.ts` later.

## Decision

**Accepted** for phase 1, 2026-08-31. Phases 2–9 stay deferred with the
direction above; each gets its own planning package when it starts.
