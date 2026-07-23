# Agent sessions

Silo can tell you what a coding agent running in a terminal is doing
(working, waiting, done, errored), and — if a terminal's backend dies
unexpectedly (an OS restart, a crashed daemon) — give you an exact command to
resume where it left off. This page covers **Settings → Agents**, where you
opt in to the precise version of that resume hint.

## Two ways a resume hint gets resolved

When a terminal's foreground process is recognized as a known agent CLI,
Silo tries to resolve which session it is, so it can tell you exactly how to
resume it later:

- **Inferred** — Silo asks the agent's own session history for whatever
  session best matches the terminal's working directory and start time. This
  always works, with no setup, but a best guess by directory and recency
  can't always tell two concurrent sessions in the same folder apart.
- **Exact** — for CLIs that support it, installing a small opt-in hook lets
  Silo identify the _exact_ session id, correlated directly against the
  terminal's own process — no guessing involved. This is what **Settings →
  Agents** turns on.

Every terminal still gets a resume hint either way; installing the hook just
makes it exact instead of inferred.

## Settings → Agents

This page lists every agent CLI Silo supports the exact mechanism for. Each
row is a single toggle:

- **Off** — Silo still detects the agent and gives an inferred resume hint.
- **On** — Silo installs a hook into that CLI's config so future sessions
  resolve exactly.

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
            "command": "python3 -c \"import json,sys,os,datetime;d=json.load(sys.stdin);sid=d.get('session_id') or d.get('sessionId') or '';os.makedirs(os.path.expanduser('~/.silo/agent-hooks'),exist_ok=True);open(os.path.expanduser('~/.silo/agent-hooks/events.jsonl'),'a').write(json.dumps({'pid':os.getppid(),'sessionId':sid,'cwd':d.get('cwd',''),'agent':'claude','timestamp':datetime.datetime.utcnow().isoformat()+'Z'})+chr(10))\" # silo-managed-agent-hook"
          }
        ]
      }
    ]
  }
}
```

Merge this into your existing `hooks.SessionStart` array rather than
replacing it if you already have other hooks configured there.
