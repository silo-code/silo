---
status: implemented # draft | accepted | implemented | rejected | superseded-by NNNN
created: 2026-08-23
---

# 0028. Terminal identity in the environment

## Summary

Every terminal Silo opens is told who it is: that it is a Silo terminal, which
tab it is, which workspace it belongs to, and where to find the bundled `silo`
binary. Five environment variables, stamped once when the session is created,
under a **reserved `SILO_*` namespace** the host owns and callers cannot write.

This is plumbing — an `env` map threaded through the session-spawn path, which
the one-shot `exec` path has had all along — but it is the plumbing three other
things are waiting on: scoping the agent hook so it stops firing outside Silo,
letting a profile-launched agent be confirmed as what it claims to be, and
letting the CLI know which workspace it is standing in without a flag.

## Motivation

### What is missing today

A session spawned by `ctx.process.spawn` inherits whatever environment the
daemon happens to have. `ProcessSpawnOptions` (`packages/sdk/src/process-service.ts`)
carries `cwd`, `cols`, `rows` — and nothing else. `ProcessExecOptions`, the
one-shot sibling, has had `env` since it shipped. The asymmetry is not a design
choice; the long-lived path simply never needed one.

So a program running inside a Silo terminal cannot tell it is inside a Silo
terminal, and Silo cannot tell one of its own terminals from any other shell on
the machine. Three consequences:

1. **The agent hook has no way to scope itself.** `track-session.sh` (RFC 0019)
   is installed into each agent's user-global config — which is the only
   config most agent CLIs support — so it fires for _every_ agent session on the
   machine, including ones started in Terminal.app with Silo closed. Those
   events can never correlate to a Silo terminal and are already discarded as
   unmatched; the script just has no way to know that before doing the work.
   Acceptable while installation is opt-in and the user consented. Not
   acceptable the moment installation becomes automatic.

2. **The hook guesses instead of reading.** To find the real agent process it
   walks up to twelve levels of process tree. Inside a Silo terminal the answer
   is knowable directly.

3. **The `silo` command is a manual install with no context.** It exists only
   if the user clicked File → "Install `silo` Command in PATH"
   (`cli_install_shim`, `apps/desktop/src-tauri/src/commands/cli.rs`), and even
   then it has no idea which workspace the calling terminal belongs to.

### Prior art: what unscoped instrumentation cost Superset

Superset auto-installs hooks into roughly ten agents' user-global configs on
every desktop-app boot. A user ran Factory Droid in a plain terminal, outside
Superset, and Droid's UI showed a Superset hook firing on every lifecycle
event. Their own postmortem (`HOOKS_INVESTIGATION.md`) names the cause:

> Most of these tools only support **user-global** hook config, not
> per-directory config, so there's no native place to scope the registration.
> The intended scoping mechanism is therefore _runtime_, not registration-time.

Their runtime guard is an environment variable present only in Superset
terminals — the same shape proposed here. Two failure modes are worth
inheriting as constraints rather than rediscovering:

- **Six of their ten integrations were never migrated to the guarded form**, so
  those fired unconditionally for anyone who had launched the app once. The
  guard has to live in the one shared script, not in each per-agent command
  line, or it becomes a thing someone forgets when adding agent number eleven.
- **An earlier guard keyed partly on a session id supplied by the agent**,
  which is always present — so it passed in foreign sessions and defeated
  itself. The guard must key on a variable the host controls and nothing else
  can set.

The second point is why the namespace in this RFC is reserved rather than
merely conventional.

### What this unblocks

- **Hook Guard** — one line at the top of `track-session.sh`, and the hook is
  inert outside Silo.
- **Agent Profiles** — a launched agent can be confirmed as what the profile
  claims, on top of what Silo already knows because it did the launching.
- **The Silo CLI** — `silo agents run` from inside a Silo terminal resolves the
  right workspace with no flag.

## Design

### The contract

Five variables, set once at session creation:

| Variable              | Value                                     |
| --------------------- | ----------------------------------------- |
| `SILO`                | `1`                                       |
| `SILO_TERMINAL_ID`    | the terminal record's id (the **tab**)    |
| `SILO_WORKSPACE_ID`   | the owning workspace's id                 |
| `SILO_WORKSPACE_PATH` | the workspace folder, absolute            |
| `SILO_BIN`            | absolute path to Silo's own bin directory |

**`SILO_TERMINAL_ID` is the tab, not the session.** `TerminalRecord.id` is
stable across a session being killed and recreated in the same tab;
the session uuid is not. Consumers correlate to a tab, so the tab is what they
get.

**Everything here must be immutable for the terminal's life.** Environment is
set once, at creation, and never revisited — a session outlives app restarts and
reattaching does not re-create it. That is correct for facts that never change
and wrong for facts that do. `SILO_AGENT_PROFILE` is the canonical
counter-example: it describes what is running _right now_, and a terminal runs
many things over its life. Set it at spawn and it starts lying the moment the
user quits Claude and types something else — the same self-defeating guard
Superset shipped. It belongs on the launch line
(`SILO_AGENT_PROFILE=claude-work claude-work`), scoped to one command.

The frozen-facts rule is what makes the table above short, and new entries have
to clear it.

### The reserved namespace

`SILO_*` is host-owned. Caller-supplied keys under that prefix are **dropped**
before the environment is assembled, on both `spawn` and `exec`, with one line
per dropped key to the `silo:extension-host` Output channel.

The match is **case-insensitive**. Windows resolves environment variables
without regard to case, so a caller-supplied `silo_terminal_id` would be read
back by the child as `SILO_TERMINAL_ID` — the guard's own key — and with both
spellings present in the block, which one wins is undefined. One
case-insensitive rule on every platform beats a Windows-only branch that the
other platforms' tests would never exercise.

Silent dropping would leave an extension author debugging blind; throwing is
disproportionate for what is nearly always a mistake rather than an attack. A
logged drop is the proportionate middle, and it matches the repo's rule that
all host-side logging goes to the Output panel.

The reservation covers `exec` as well as `spawn`. `ProcessExecOptions.env` is
already-shipped public API with no restriction, and an extension that set
`SILO_TERMINAL_ID` on an `exec` that launches an agent could get a hook event
attributed to a terminal it does not own — the same spoof through the older
door. Shipping a guard with a documented bypass on the sibling API is worse
than the small compat note this costs.

### Public surface

`ProcessSpawnOptions` gains `env`, mirroring `ProcessExecOptions`:

```ts
export interface ProcessSpawnOptions {
  cwd: string;
  cols?: number;
  rows?: number;
  /**
   * Extra environment variables, merged over the host's environment. Keys
   * beginning `SILO_` are reserved by the host and are dropped.
   */
  env?: Record<string, string>;
}
```

This is a capability worth having on its own — a session that needs `NO_COLOR`,
a locale, or a tool's config directory currently has no way to ask — and the
asymmetry with `exec` was already a wart.

### Privileged surface: who may claim a terminal id

The host stamps the identity, so the host has to know which tab is spawning —
and `ctx.process.spawn` does not. The terminal id therefore arrives through the
**privileged** barrel, not the public options bag:

```ts
// @silo-code/extension-host/internal
export function spawnTerminalSession(opts: {
  terminalId: string;
  cwd: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
}): Promise<ProcessSession>;
```

`core.terminal` calls this instead of `ctx.process.spawn`. Importing from the
internal barrel _is_ the mark — a typed, greppable record of a privileged use,
the same pattern `core.cli-install` already sets for `installCliShim`.

Adding `terminalId` to the _public_ options and validating it host-side was
considered and rejected: validation can confirm the id names a real terminal,
but not that it names the caller's. An extension could pass a real id belonging
to someone else's tab, which is precisely the spoof the guard exists to resist.

Public `spawn` still gets `SILO=1` and the workspace variables. A third-party
extension's session is genuinely a Silo session; it just is not a tab, and has
no terminal id to claim. That is the correct trust level, not a limitation.

### Data flow

Six layers, one new field each:

```
core.terminal (terminalId)
  └─ spawnTerminalSession                    internal barrel
      └─ buildSessionEnv()                   pure: merge, strip SILO_*, stamp
          └─ tauriTerminalClient.createTerminal({ env })
              └─ terminal_create(env)        Tauri command
                  └─ SessionBackend::create(env)
                      └─ spawn_daemon        SILO_SESSION_ENV=<json> on the re-exec
                          └─ main.rs         parse, remove carrier from own env
                              └─ fork_pty(env)  setenv in the forkpty child
```

**Why a JSON carrier rather than plain inheritance.** The app already exports
`SILO_PTY_NS`, `SILO_DATA_DIR`, and `SILO_CONFIG_ROOT` with `set_var` so the
self-forked daemon inherits them (`apps/desktop/src-tauri/src/commands/app_paths.rs`),
and inheritance would work here too with no plumbing at all. But those three are
**app-wide constants** — the same value for every session, correct to inherit,
harmless on the daemon process. The identity variables are **per-session**, and
a daemon whose own `getenv("SILO_TERMINAL_ID")` answers is a daemon that will
eventually be misread — by the maintenance sweep, or by a future hook that
resolves the variable from the wrong process. `main.rs` parses the carrier and
removes it, so per-session facts are live only on the shell.

A repeated `--env KEY=VAL` argv form was rejected: argv is the natural place for
a _command_, not a bag of variables, and it would put the map in front of every
`ps` invocation as the session's visible command line.

**What "removed" does and does not mean.** `std::env::remove_var` clears the
variable from the process's effective environment — `getenv` no longer answers,
and children no longer inherit it. Verified: a shell under the daemon reports an
empty `$SILO_SESSION_ENV` and `env | grep -c SILO_SESSION_ENV` returns 0. It does
**not** scrub the string from the initial environment block the kernel exposes,
so `ps eww <daemon-pid>` still shows the original `SILO_SESSION_ENV=...` text.
That is a property of every environment variable on the platform, not of this
design — the same is true of anything the app exports today. The carrier is a
transport, **not a confidentiality mechanism**: nothing secret may travel in it,
and the identity facts it carries are readable by anything inside the terminal
anyway.

Windows takes the same map through `--win-session-host`
(`apps/desktop/src-tauri/src/commands/session_windows.rs`). Hook management is
macOS/Linux-only by necessity, but workspace identity and the CLI's
"which project am I in" logic are platform-neutral, and shipping the contract
with a platform hole would make item 8 platform-dependent for no reason.

### `SILO_BIN` and the PATH problem

Silo writes a `silo` shim into its own bin directory (`data_dir()/bin/silo`,
a `.cmd` on Windows) and prepends that directory to `PATH` in the forkpty child.
`data_dir()` is already keyed by bundle identifier, so Silo Dev's terminals get
the dev binary and production's get production's, with no new path logic.

The shim is rewritten on **every app start**. It embeds an absolute path to the
app binary, which goes stale on update or if the user moves the app; rewriting
unconditionally is a two-line write on a path already computed, and it makes
that entire class of bug impossible rather than merely detectable.

**Prepending does not guarantee first position, and the RFC should say so
plainly.** Sessions run a login shell, and a login shell re-derives `PATH`:
`path_helper` rebuilds it from `/etc/paths` and profile scripts prepend their
own entries. Measured on a developer machine, a directory prepended before
`zsh -l` came back at **position 14 of 33** — present, but well behind entries
the profile added.

So the promise is "on `PATH`", not "first on `PATH`". `SILO_BIN` exists because
of that: hooks, scripts, and the CLI can address the binary absolutely and be
immune to ordering. Forcing first position would mean shell-integration
injection (the `ZDOTDIR` approach VS Code uses), which is a feature in its own
right and out of scope here.

### What already leaks

`SILO_PTY_NS`, `SILO_DATA_DIR`, and `SILO_CONFIG_ROOT` reach every Silo
terminal's shell today by inheritance, before anything in this RFC ships. Now
that `SILO_*` is a documented contract they are either part of it or a wart
inside it.

They are documented as **observable but internal** — present, not supported,
not to be relied on. Scrubbing them is a behavior change to shipped plumbing
with a non-zero chance of breaking someone's debugging workflow and no Phase 1
benefit; promoting them commits us to supporting internal paths as public API
before the CLI exists to say what it needs. Item 8 decides which, if any,
graduate.

### Documentation

The variable contract is consumed by shell scripts, hooks, and the CLI — not
by TypeScript — so it gets a reference page,
`apps/docs/api/terminal-environment.md`, alongside `theming.md`, which is the
existing precedent for a public contract that is not a TS symbol. The new `env`
field goes through the normal SDK docs workflow. `docs/domain-language.md`
gains **Terminal Identity** and **Session Environment**, both carrying the
set-once rule as part of the definition.

## Alternatives considered

**Derive the terminal id from the session id.** No new field anywhere. Rejected:
the id would then change when a dead session is recreated in the same tab, and
every consumer correlates to tabs.

**Let `core.terminal` set `SILO_TERMINAL_ID` through the public `env`** —
i.e. do not reserve the identity variables. Rejected: it is the Superset
mistake exactly. A guard keyed on a value any caller can write is not a guard.

**Put `SILO_AGENT_PROFILE` here too.** Rejected on the immutability rule; see
the Design section. It goes on the launch line.

**Add `SILO_WORKSPACE_NAME`.** Rejected: workspace names are user-editable, so
the variable would start lying after a rename. `SILO_WORKSPACE_PATH` is stable
and gives a display fallback.

**Fold the version into `SILO` (`SILO=0.51.0`).** Rejected: it conflates "am I
in Silo" with "which Silo", making the one-line guard subtly version-dependent.
A separate `SILO_VERSION` can be added later if a consumer needs it.

**Do Unix first, Windows later.** Rejected; see Data flow.

## Consequences

- **Sessions open at upgrade time have no `SILO_*`** and will not until their
  tab is closed and reopened. Environment is set at creation and reattach does
  not re-create it. Harmless here; it matters at Hook Guard, where those tabs
  will silently stop producing hook events until they turn over. That is
  flagged as an open question for that change, not solved here — a fallback to
  the old process-tree walk when `SILO` is unset would re-open the exact hole
  the guard closes, because a pre-upgrade Silo session and a foreign session
  are indistinguishable from inside the script.
- **`ProcessExecOptions.env` changes behavior**: `SILO_*` keys are now dropped.
  Realistically zero blast radius — those values come from the host today — but
  it is a change to shipped public API.
- **A user with their own `silo` earlier on `PATH`** keeps winning inside Silo
  terminals, because we cannot guarantee first position. `SILO_BIN` is the
  unambiguous handle.
- **The internal barrel grows by one export.** Its size is the health metric;
  this entry is justified by the trust boundary rather than by convenience.
- **Workspace identity on a public `spawn` comes from the _active_ workspace**,
  not from the calling extension's own. Silo keeps background workspaces alive,
  so an extension scoped to workspace B that spawns a session while A is focused
  gets a session stamped with A's `SILO_WORKSPACE_ID` / `SILO_WORKSPACE_PATH`
  while its `cwd` is B's — and, being set once, it stays wrong for that session's
  life. Not reachable from the terminal path, which is the only Phase 1 consumer:
  `core.terminal` spawns only for a tab in the active workspace and bails
  otherwise. Fixing it properly means plumbing the owning workspace id through
  `ProcessSpawnOptions` / `PathScope`, which is deferred rather than solved
  here — the CLI (item 8) is the first thing that would care.

## Verification

- Pure-function unit tests for `buildSessionEnv` (merge order, `SILO_*`
  stripping, the stamped set) and for the carrier's parse/serialize.
- A `crates/pty-host/tests/` integration test: spawn a real daemon with an env
  map, attach over the socket, write `echo $SILO_TERMINAL_ID`, read the value
  back — then detach and reattach a second client and read it again, proving
  the environment survives client turnover.
- A manual `verifier-gui` pass for the genuine quit-and-reopen, which is the
  roadmap's stated done-when and is not reachable from the automation harness
  today.

**Done when:** `echo $SILO_TERMINAL_ID` in a Silo terminal prints that tab's id,
and it is still correct after quitting and reopening Silo.

## Decision

**Accepted and implemented.** The five variables ship as specified, with the
`SILO*` namespace reserved on both `spawn` and `exec`, the terminal id reaching
the host only through the privileged `spawnTerminalSession`, and the map
carried to the daemon as a JSON blob the daemon removes from its own
environment.

Two things changed during implementation, both recorded above rather than
silently:

- **The reservation matches case-insensitively.** The draft promised lowercase
  `silo_*` would pass through. That was wrong: Windows resolves environment
  variables without regard to case, so a caller-supplied `silo_terminal_id`
  would be read back by the child as the guard's own key.
- **The carrier is a transport, not a confidentiality mechanism.** The draft
  claimed it kept values out of `ps`. Removal clears the effective environment
  (children stop inheriting — verified), but does not scrub the initial
  environment block, so `ps eww` still shows it.

Verified against a running build: `SILO_TERMINAL_ID` is byte-identical in a
terminal before and after quitting and reopening the app, `SILO_BIN` resolves to
the per-identity bin directory (`com.silo.desktop.dev/bin` under the dev
identity), and the carrier is absent from the shell's environment.

The roadmap badge for the terminal environment is `stable`; the public contract
is `apps/docs/api/terminal-environment.md`. The deferred item is the
public-`spawn` workspace-identity limitation under Consequences.
