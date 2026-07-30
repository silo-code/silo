# Using agents with Silo

Silo recognizes the coding agents you run in your terminals — Claude Code,
Codex, Cursor Agent, Copilot CLI, and Grok — and shows you what each one is
doing at a glance.

Two optional setup steps: install a monitoring extension to see agent status in
the UI, and use **Install** in **Settings → Agents** so Silo can give you the
exact command to resume a session later.

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

Exact resume works on **macOS and Linux**; on Windows, agents are still
detected, but exact resume isn't available. The hook runs a small, readable
shell script Silo writes to `~/.silo/agent-hooks/track-session.sh` — you can
open and inspect it, and it needs no interpreter or dependency beyond the shell
your agent already runs its hooks with. See the
[agent system architecture](/roadmap/agent-system) for the design.

## Settings → Agents

Each hook-installable CLI has an **Install** / **Uninstall** button: without
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
