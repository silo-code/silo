# Using agents with Silo

Silo recognizes the coding agents you run in your terminals — Claude Code,
Codex, Cursor Agent, and Copilot CLI — and shows you what each one is doing at a
glance.

Two optional setup steps: install a monitoring extension to see agent status in
the UI, and flip on a CLI in **Settings → Agents** so Silo can give you the
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

Turn a CLI on in **Settings → Agents** and Silo captures each session's real id,
so the command resumes that _exact_ session — even if you had two going in the
same folder. Left off, Silo still reminds you what was running, just without a
precise id. It won't guess one it can't stand behind: a wrong resume command is
worse than none.

## Why Silo installs a hook

Only the agent knows its own session id, so to capture it Silo adds one
`SessionStart` hook to that CLI's config. When a session starts, the hook writes
the id to a local file (`~/.silo/agent-hooks/`) that Silo reads — and that's all
it does. **Nothing leaves your machine**, Silo makes no network calls, and it
only ever adds or removes its own entry (marked `# silo-managed-agent-hook`);
your other hooks are never touched.

Exact resume works on **macOS and Linux**; on Windows, agents are still
detected, but exact resume isn't available. (The exact hook command is being
simplified — see the [agent system architecture](/roadmap/agent-system) for the
why.)

## Settings → Agents

Each CLI is a single toggle: **off** keeps detection and the plain reminder;
**on** installs the hook for exact resume. It assumes each CLI's default config
location — if you run one somewhere else, enable the toggle once and copy the
`# silo-managed-agent-hook` entry into your other config file.

| CLI                | Config                                          | Resume                  |
| ------------------ | ----------------------------------------------- | ----------------------- |
| Claude Code        | `~/.claude/settings.json`                       | `claude --resume <id>`  |
| Codex CLI          | `~/.codex/hooks.json`                           | `codex resume <id>`     |
| Cursor Agent       | `~/.cursor/hooks.json`                          | `agent --resume <id>`   |
| GitHub Copilot CLI | `~/.copilot/hooks/silo-managed-agent-hook.json` | `copilot --resume=<id>` |

**Codex needs one extra step:** it won't run a newly installed hook until you
trust it. After turning the toggle on, open Codex and run `/hooks` once — the
entry shows a `Silo session tracking (getsilo.dev)` label so you can recognize
it. Until you do, exact resume stays off for Codex.
