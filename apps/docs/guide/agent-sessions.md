# Agent sessions

Silo can tell you what a coding agent running in a terminal is doing
(working, idle, errored), and — if a terminal's backend dies
unexpectedly (an OS restart, a crashed daemon) — give you an exact command to
resume where it left off. This page covers **Settings → Agents**, where you
opt in to the precise version of that resume hint.

## What a resume hint looks like

When a terminal's foreground process is recognized as a known agent CLI,
Silo attaches a resume hint to it so it can tell you how to pick the session
back up if the backend later dies. There are exactly two forms, and neither
one guesses:

- **Exact** — an installed hook reports the session's _real_ id, correlated
  directly against the terminal's own process. Silo can give you an exact
  `claude --resume <id>`, precise enough to tell two concurrent sessions in
  the same folder apart. This is what **Settings → Agents** turns on.
- **Generic** — with no hook installed, Silo shows an honest, session-id-less
  note ("was running claude in `<cwd>`"). It never promises a session id it
  can't back up.

Silo deliberately does **not** try to _infer_ a session id by working
directory and recency when the hook isn't installed. That kind of guess
can't tell concurrent same-directory sessions apart and, when it's wrong,
hands you a `claude --resume <id>` that fails — worse than no id at all. So
the choice is exact (with the hook) or honestly vague (without it), never a
confident guess.

## Supported agents

| Agent              | Recognized | Working/idle status | Exact resume (hook)                                |
| ------------------ | ---------- | ------------------- | -------------------------------------------------- |
| Claude Code        | ✅         | ✅                  | ✅ install toggle                                  |
| Codex CLI          | ✅         | ✅                  | ✅ install toggle                                  |
| Cursor Agent       | ✅         | ✅                  | generic hint only (auto-install not yet available) |
| GitHub Copilot CLI | ✅         | ✅                  | generic hint only (no known resume mechanism yet)  |

"Recognized" means Silo identifies the CLI running in a terminal and gives it
a resume hint. "Working/idle status" is the live activity indicator (the
dot in the Agent Inspector / workspace row). "Exact resume" means Silo can
install a hook that captures the real session id.

Cursor is fully detected but has no install toggle: its hook config
(`~/.cursor/hooks.json`) uses a different shape than Claude/Codex's, so Silo
doesn't auto-install it yet rather than risk writing something wrong. Copilot
has no known session-id/resume mechanism at all yet, so it's detection-only
by necessity, not by choice.

## Settings → Agents

This page lists every agent CLI Silo can install the exact-resume hook for
(Claude Code and Codex CLI today). Each row is a single toggle:

- **Off** — Silo still detects the agent and shows the generic resume note.
- **On** — Silo installs a hook into that CLI's config so future sessions
  resolve to an exact session id.

Turning a toggle on or off only ever adds or removes Silo's own hook entry —
any other hooks you already have configured for that CLI (from another tool)
are left untouched.

The toggle assumes each CLI's **default** configuration location. If you run
a CLI under a non-default setup (see each CLI's section below), install the
hook manually using the snippet there instead of the toggle.

## Claude Code

**Default config:** `~/.claude/settings.json`.

Toggling this on adds a `SessionStart` hook entry that reports the session id
and the hook process's PID back to Silo. If you run Claude Code under a
custom `CLAUDE_CONFIG_DIR`, add the same hook manually to that directory's
`settings.json` instead of using the toggle:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 -c \"_='Silo session tracking (getsilo.dev)';import json,sys,os,datetime;d=json.load(sys.stdin);sid=d.get('session_id') or d.get('sessionId') or '';os.makedirs(os.path.expanduser('~/.silo/agent-hooks'),exist_ok=True);open(os.path.expanduser('~/.silo/agent-hooks/events.jsonl'),'a').write(json.dumps({'pid':os.getppid(),'sessionId':sid,'cwd':d.get('cwd',''),'agent':'claude','timestamp':datetime.datetime.utcnow().isoformat()+'Z'})+chr(10))\" # silo-managed-agent-hook"
          }
        ]
      }
    ]
  }
}
```

Merge this into your existing `hooks.SessionStart` array rather than
replacing it if you already have other hooks configured there.

## Codex CLI

**Default config:** `~/.codex/hooks.json`.

**One extra step is required, unlike Claude Code:** Codex requires every
individual hook entry to be reviewed and trusted before it will actually run
— it does **not** run a newly installed hook automatically, and it does not
prompt you either. After turning the toggle on, open Codex and run `/hooks`
once to review and trust Silo's entry. Skipping this step means the hook sits
in your config, correctly installed, and is silently never executed — Silo's
Agent Inspector will keep showing the generic "was running codex in `<cwd>`"
hint instead of an exact session id until you do this. The `/hooks` review
screen shows a command preview starting with `_='Silo session tracking
(getsilo.dev)'` so you can tell it's Silo's before trusting it (if you
installed the hook before this identifier existed, toggle it off and back on
once to rewrite it).

Codex otherwise configures hooks in the same shape as Claude Code, and its
`SessionStart` payload carries the same `session_id` field — so the install
toggle writes the equivalent entry, just tagged `codex`. If you run Codex
under a non-default config directory, add the same hook manually to that
directory's `hooks.json` (and still run `/hooks` to trust it):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 -c \"_='Silo session tracking (getsilo.dev)';import json,sys,os,datetime;d=json.load(sys.stdin);sid=d.get('session_id') or d.get('sessionId') or '';os.makedirs(os.path.expanduser('~/.silo/agent-hooks'),exist_ok=True);open(os.path.expanduser('~/.silo/agent-hooks/events.jsonl'),'a').write(json.dumps({'pid':os.getppid(),'sessionId':sid,'cwd':d.get('cwd',''),'agent':'codex','timestamp':datetime.datetime.utcnow().isoformat()+'Z'})+chr(10))\" # silo-managed-agent-hook",
            "statusMessage": "Silo session tracking (getsilo.dev)"
          }
        ]
      }
    ]
  }
}
```

Confirmed against codex-cli 0.144.5: no feature flag is needed for hooks to
work, and `codex resume <id>` is the correct interactive resume command.

## Cursor Agent

Silo recognizes the `cursor-agent` CLI and gives it a generic resume hint
today, but does **not** yet install an exact-resume hook for it — Cursor's
`~/.cursor/hooks.json` uses a different schema than Claude/Codex, and Silo
won't write a config shape it can't do safely. Exact-resume support for
Cursor (`cursor-agent --resume <id>`) is planned once a Cursor-specific
installer lands. Until then, no toggle appears for it on the Agents page.
