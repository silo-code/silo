# Using agents with Silo

Silo recognizes the coding agents you run in your terminals — Claude Code,
Codex, Cursor Agent, Copilot CLI, Grok, pi, and OpenCode — and shows you what
each one is doing at a glance.

Two optional setup steps: install a monitoring extension to see agent status in
the UI, and use **Install** in **Settings → Agents** so Silo can give you the
exact command to resume a session later. Exact resume is available for every
one of these except OpenCode today — see its section below.

## Starting an agent

You can always open a terminal and type `claude` (or `codex`, `cursor-agent`,
…) yourself — Silo notices and starts tracking it.

For the agents you start often, make an **agent profile**: a named recipe with a
label, the command to run (an alias like `claude-work` is fine), and optionally
a separate config directory for a second account. Manage them on **Settings →
Agents → Profiles**, or click **Add an agent profile…** from a terminal group's
**+** menu — the Profiles tab offers a one-click add for each agent already on
your `PATH`. Once a profile exists it shows up in two places: the **+** menu,
which opens a new terminal and starts the agent there, and a terminal's
right-click **Agents** submenu, which runs the agent **in that terminal** — the
same as typing its command yourself.

Every profile is also addressable by name:

- **A keyboard shortcut** — each profile gets a command (searchable and bindable
  on **Settings → Keyboard Shortcuts**), plus a generic **New Agent** command
  that launches whichever profile you mark as **default** (its `⋮` menu →
  **Set as default**). Bind **New Agent** once and it keeps working even if you
  rename the profile behind it.
- **The shell** — `silo agent run --profile <id>` (or just `silo agent run` for
  the default) starts the profile in whatever workspace your shell is in, and
  prints the id of the terminal it created. It needs Silo already running —
  add `--launch` to start it first. See
  [the `silo` command](/guide/cli#launching-an-agent).

A profile is just a way to start a terminal — everything after that is the
agent's own CLI, exactly as if you had typed the command.

## Seeing agent activity

Silo detects agents on its own, but drawing the indicators — the activity dots
on tabs and workspace rows — is left to an extension on purpose, so you can pick
the one that fits how you work, or build your own. **`agent-monitor`** is the
ready-made option; install it from **Browse** (or
[extensions.getsilo.dev](https://extensions.getsilo.dev)). Without a monitoring
extension, Silo still tracks your agents — it just doesn't display them.

## Resuming after a restart

When you restart your computer, the agent sessions running in your terminals
don't come back on their own. Silo remembers what was running where and gives
you the command to resume.

**Install** the session hook for a CLI in **Settings → Agents** and Silo
captures each session's real id, so the command resumes that _exact_ session —
even if you had two going in the same folder. Left uninstalled, Silo still
reminds you what was running, just without a precise id. It won't guess one it
can't stand behind: a wrong resume command is worse than none.

## Why Silo installs a hook

Only the agent knows its own session id, so to capture it Silo adds one
`SessionStart` hook to that CLI's config. When a session starts, the hook writes
the id to a local file (`~/.silo/agent-hooks/`) that Silo reads — and that's all
it does. **Nothing leaves your machine**, Silo makes no network calls, and it
only ever adds or removes its own entry (marked `# silo-managed-agent-hook`);
your other hooks are never touched. If a settings file exists but isn't valid
JSON, Silo refuses to rewrite it — fix or remove the file first.

Exact resume works on **macOS and Linux**. On Windows, Silo detects which
agent is running and shows its activity, but exact resume isn't available —
the hook is a POSIX shell script, so there's nothing to install there, and
Settings → Agents is read-only.

One caveat on Windows activity: Silo reads the status signals an agent emits,
and not every agent emits them per turn. GitHub Copilot CLI, for instance,
announces a task when it starts one but not when it finishes, so its
busy/idle state is less reliable than Claude's or Codex's. Which agent is
running is always correct; how busy it is may lag.

The hook runs a small, readable
shell script Silo writes to `~/.silo/agent-hooks/track-session.sh` — you can
open and inspect it, and it needs no interpreter or dependency beyond the shell
your agent already runs its hooks with. See the
[agent system architecture](/roadmap/agent-system) for the design.

## Settings → Agents

The **Sessions** tab (this is where session-hook install lives) has, for each
hook-installable CLI, an **Install** / **Uninstall** button: without
the hook you keep detection and the plain reminder; Install adds Silo's session
hook for exact resume. It assumes each CLI's default config location — if you
run one somewhere else, Install once and copy the `# silo-managed-agent-hook`
entry into your other config file. **Setup details** in Settings links to the
sections below.

### Claude Code {#claude-code}

|        |                           |
| ------ | ------------------------- |
| Config | `~/.claude/settings.json` |
| Resume | `claude --resume <id>`    |

### Codex CLI {#codex-cli}

|        |                       |
| ------ | --------------------- |
| Config | `~/.codex/hooks.json` |
| Resume | `codex resume <id>`   |

**Codex needs one extra step:** it won't run a newly installed hook until you
trust it. After Install, open Codex and run `/hooks` once — the entry shows a
`Silo session tracking (getsilo.dev)` label so you can recognize it. Until you
do, exact resume stays off for Codex.

### Cursor Agent {#cursor-agent}

|        |                        |
| ------ | ---------------------- |
| Config | `~/.cursor/hooks.json` |
| Resume | `agent --resume <id>`  |

Cursor's `sessionStart` hook fires when the first character is typed in the
TUI — not at process start, and not waiting for a sent message — so Silo's
exact resume id usually appears right after you begin typing.

### GitHub Copilot CLI {#github-copilot-cli}

|        |                                                 |
| ------ | ----------------------------------------------- |
| Config | `~/.copilot/hooks/silo-managed-agent-hook.json` |
| Resume | `copilot --resume=<id>`                         |

### Grok {#grok}

**Grok needs no Install.** Grok keeps its own live session registry
(`~/.grok/active_sessions.json`), so Silo reads that directly when it sees a
Grok terminal and offers `grok --resume <id>` — no hook to install, nothing to
trust. Grok only writes a session after the first character is typed in the
TUI (not at process start, and not waiting for Enter/send); Silo watches the
registry file so the exact resume command appears then, not only after a
reload. (Grok also imports hooks from `~/.claude/settings.json` for
Claude compatibility; Silo ignores those Claude-tagged events when the
foreground process is Grok, so installing Claude's hook does not mislabel Grok
terminals.)

### pi {#pi}

|        |                                                |
| ------ | ---------------------------------------------- |
| Config | `~/.pi/agent/extensions/silo-track-session.ts` |
| Resume | `pi --session <id>`                            |

**pi's install is a small TypeScript file, not a config entry.** pi has no
shell-command hooks — its extension points are TypeScript modules it loads
from `~/.pi/agent/extensions/`, so that is what Silo writes there. The file
is Silo-owned and safe to read: it runs the same session-tracking script
every other agent runs, touches nothing else in your pi setup, and Uninstall
deletes it. Silo refuses to install if a file it didn't write already sits at
that path.

Two things to know after installing:

- **Restart pi.** Extensions load at startup, so sessions you already have
  open won't be tracked until you restart them.
- **Working/idle status is off by default in pi.** pi reports turn progress
  to the terminal only when **Terminal progress** is enabled — use the
  toggle under pi on **Settings → Agents** (writes
  `terminal.showTerminalProgress` in `~/.pi/agent/settings.json`). With it
  off, Silo still identifies pi terminals and still offers exact resume — they
  just never light up as busy.

### OpenCode {#opencode}

**No exact resume yet — no Install button.** Silo detects OpenCode terminals
and tracks their working/idle status, and still gives you the honest generic
reminder ("was running OpenCode in `<folder>`") after a restart — the same
fallback any agent gets before its hook is installed. There's nothing to
install today: OpenCode has no config-file hook like Claude or Codex, and
exact resume needs a plugin Silo doesn't install yet. Support for that is
planned; detection and activity tracking work now with nothing to set up.
