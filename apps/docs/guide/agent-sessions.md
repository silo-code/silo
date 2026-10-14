# Using agents with Silo

Silo works with the coding agents you already use — Claude Code, Codex,
Cursor Agent, GitHub Copilot CLI, Grok, pi, OMP, and OpenCode — and gives you
two ways to run them.

## Two ways to run an agent

If you already like running an agent's own CLI, keep doing exactly that —
Silo treats it as a first-class citizen. Open a terminal, type `claude` (or
`codex`, `cursor-agent`, …) the way you always have, and Silo quietly tracks
it alongside everything else: it knows which agent is running, shows you when
it's working, and can bring back the exact same session after you restart.
Nothing about your workflow changes.

If you want something more immersive, open that same agent in a **Chat
panel** instead. Rather than scrolling past raw terminal text, you get the
conversation rendered natively inside Silo — its replies, the files it's
touching, and its plan, all as part of the app's own UI.

Same agent, same work, either way — pick whichever fits how you work. You can
even run one agent both ways at once.

## Supported agents

| Agent              | Terminal | Chat |
| ------------------ | :------: | :--: |
| Claude Code        |    ✅    |  ✅  |
| Codex CLI          |    ✅    |  ✅  |
| Cursor Agent       |    ✅    |  ✅  |
| GitHub Copilot CLI |    ✅    |  ✅  |
| OpenCode           |    ✅    |  ✅  |
| pi                 |    ✅    |  ✅  |
| Grok               |    ✅    |      |
| OMP                |    ✅    |      |

Every agent above works in a terminal. Grok and OMP don't have a Chat panel
yet — run them in a terminal and Silo tracks them the same as any other
agent.

## What Silo gives you

### In a terminal

- **Silo knows which agent is running** — no setup needed, it recognizes the
  CLI the moment it starts.
- **It shows you when an agent is busy or waiting on you**, right on the
  terminal's tab, if you install a small monitoring extension (see below).
- **It can bring back your exact session after a restart** — same
  conversation, same history — once you turn that on for the agent (see
  below).

### In a Chat panel

- **The conversation renders natively** — replies, file edits, and other
  actions appear as part of Silo's UI instead of raw terminal text.
- **You see its plan before it runs** — when an agent shares one, Silo shows
  the steps it intends to take.
- **It can resume where you left off**, the same as a terminal session.
- **A running context meter** tells you how full the conversation is getting,
  for the agents that report it, so you know when it's time to start fresh.
- **MCP servers and background delegation** — for agents that support them,
  Silo shows MCP tool calls and background work inline in the transcript.

Exactly which of these a given agent supports varies — see
[Compatibility](#compatibility) below.

## Setting one up

### Starting an agent: Agent Profiles {#starting-an-agent}

For an agent you start often, make an **agent profile**: a named recipe with
a label, the command to run (an alias like `claude-work` is fine), and
optionally a separate config directory for a second account. Manage profiles
on **Settings → Agents → Profiles**, or click **Add an agent profile…** from a
terminal group's **+** menu — it offers a one-click add for each agent
already on your `PATH`.

Once a profile exists, it's addressable several ways:

- **The + menu** opens a new terminal and starts the agent there; a
  terminal's right-click **Agents** submenu runs it in that terminal instead
  — the same as typing the command yourself.
- **A keyboard shortcut** — each profile gets a command (searchable and
  bindable on **Settings → Keyboard Shortcuts**), plus a generic **New
  Agent** command for whichever profile you mark as **default**.
- **The shell** — `silo agent run --profile <id>` (or just `silo agent run`
  for the default) starts the profile in whatever workspace your shell is
  in. It needs Silo already running — add `--launch` to start it first. See
  [the `silo` command](/guide/cli#launching-an-agent).
- **A Chat profile** shows up the same way, except picking it opens a Chat
  panel instead of a terminal.

A Terminal profile is just a way to start a terminal — everything after that
is the agent's own CLI, exactly as if you had typed the command.

### Seeing terminal activity

Drawing activity indicators — the dots on tabs and workspace rows — is left
to an extension on purpose, so you can pick the one that fits how you work,
or build your own. **`agent-monitor`** is the ready-made option; install it
from **Browse** (or [extensions.getsilo.dev](https://extensions.getsilo.dev)).
Without it, Silo still tracks your agents — it just doesn't display them.

### Turning on exact resume

When you restart your computer, terminal sessions don't come back on their
own. **Install** the session hook for a CLI in **Settings → Agents** and Silo
captures that session's real id, so it can give you the exact command to
resume it later — even if you had two going in the same folder. Left
uninstalled, Silo still reminds you what was running, just without a precise
id; it won't guess one it can't stand behind.

Chat sessions don't need this step — resuming one is built in.

## Compatibility

### Terminal: exact resume

| Agent              | Exact resume |
| ------------------ | :----------: |
| Claude Code        |      ✅      |
| Codex CLI          |      ✅      |
| Cursor Agent       |      ✅      |
| GitHub Copilot CLI |      ✅      |
| Grok               |      ✅      |
| pi                 |      ✅      |
| OMP                |      ✅      |
| OpenCode           |              |

OpenCode is tracked and shows activity like any other agent — it just can't
be resumed to its exact session yet. See [its section](#opencode) below.
Exact resume needs **macOS or Linux**; on Windows, Silo still shows which
agent is running and (for most agents) how busy it is, but can't give you a
resume command.

### Chat panel functionality

| Feature               | Claude Code | Codex CLI | Cursor Agent | Copilot CLI | OpenCode | pi  |
| --------------------- | :---------: | :-------: | :----------: | :---------: | :------: | :-: |
| Resume after restart  |     ✅      |    ✅     |      ✅      |     ✅      |    ✅    | ✅  |
| MCP servers           |     ✅      |    ✅     |      ✅      |     ✅      |    ✅    |     |
| Background delegation |     ✅      |    ✅     |              |             |          |     |
| Context meter         |     ✅      |    ✅     |              |     ✅      |          |     |

An unchecked cell means that agent doesn't support that piece today — not a
Silo limitation. Silo picks each one up automatically as the agent adds
support, with nothing to change on your end.

## Technical details

The rest of this page is reference material: how Silo's hook-based resume
actually works, and per-agent setup notes. Skip it unless you're curious or
troubleshooting.

### How exact resume works

Only the agent knows its own session id, so to capture it Silo adds one
`SessionStart` hook to that CLI's config (via **Install** in **Settings →
Agents**). When a session starts, the hook writes the id to a local file
(`~/.silo/agent-hooks/`) that Silo reads — and that's all it does. **Nothing
leaves your machine**, Silo makes no network calls, and it only ever adds or
removes its own entry (marked `# silo-managed-agent-hook`); your other hooks
are never touched. If a settings file exists but isn't valid JSON, Silo
refuses to rewrite it — fix or remove the file first.

The hook runs a small, readable shell script Silo writes to
`~/.silo/agent-hooks/track-session.sh` — you can open and inspect it, and it
needs no interpreter or dependency beyond the shell your agent already runs
its hooks with. See the [agent system architecture](/roadmap/agent-system)
for the design.

One caveat on Windows activity: Silo reads the status signals an agent emits,
and not every agent emits them per turn. GitHub Copilot CLI, for instance,
announces a task when it starts one but not when it finishes, so its
busy/idle state is less reliable than Claude's or Codex's. Which agent is
running is always correct; how busy it is may lag.

Chat sessions connect over the [Agent Client
Protocol](https://agentclientprotocol.com) (ACP), the open standard that lets
Silo render an agent's turns, tool calls, and plan directly instead of
parsing terminal output. Every Chat-capable agent above connects this way —
there's no other integration path for Chat.

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

### OMP {#omp}

|        |                                                 |
| ------ | ----------------------------------------------- |
| Config | `~/.omp/agent/extensions/silo-track-session.ts` |
| Resume | `omp --resume <id>`                             |

[OMP](https://omp.sh) is a fork of pi, and Silo treats it as its own agent —
its own name, icon, config directory and resume command. Running both `omp` and
`pi` side by side works exactly as you'd expect; neither is ever mistaken for
the other.

**OMP's install is a small TypeScript file, not a config entry** — the same
mechanism as pi, because OMP kept pi's extension API. Silo writes it to
`~/.omp/agent/extensions/`, and only there; your `~/.pi/` directory is never
touched. The file is Silo-owned and safe to read: it runs the same
session-tracking script every other agent runs, and Uninstall deletes it. Silo
refuses to install if a file it didn't write already sits at that path.

**Restart OMP after installing.** Extensions load at startup, so sessions you
already have open won't be tracked until you restart them.

**Working/idle status needs no setup.** Unlike pi, OMP reports its state in the
terminal title out of the box, so a Silo tab tracks an OMP turn as soon as it
starts — including showing the terminal as waiting when OMP asks you to approve
something. This is how Silo recognizes OMP terminals too, which means it works
the same on macOS, Linux, and Windows, whether you launched OMP from a profile
or just typed `omp`.

On Windows, OMP marks a turn in progress with a static `:` instead of the
animated spinner it uses elsewhere. Silo reads both, so the tab tracks
working and idle there exactly as it does on macOS and Linux — worth knowing
only because the terminal title itself looks different.

The one setting that changes this is OMP's own **Terminal Title Run State**
(`tui.titleState`, on by default). If you turn it off, Silo still identifies
OMP terminals and still offers exact resume — they just never light up as busy.

### OpenCode {#opencode}

**No exact resume yet — no Install button.** Silo detects OpenCode terminals
and tracks their working/idle status, and still gives you the honest generic
reminder ("was running OpenCode in `<folder>`") after a restart — the same
fallback any agent gets before its hook is installed. There's nothing to
install today: OpenCode has no config-file hook like Claude or Codex, and
exact resume needs a plugin Silo doesn't install yet. Support for that is
planned; detection and activity tracking work now with nothing to set up.
