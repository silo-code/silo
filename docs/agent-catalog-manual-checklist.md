# Agent Settings page — manual verification checklist (pi)

`packages/extensions-core/src/agents-settings/index.tsx` has no automated test
coverage of its own (the repo's testing convention is pure-logic Vitest, no
`@testing-library/react` — see `.agents/skills/silo-testing/SKILL.md`), so the
`agent.id === "pi"` carve-outs in that file are only checked by hand. Run this
checklist:

- After any change to `index.tsx`, `pi-settings.ts`, `pi-extension-installer.ts`,
  or `agent-catalog.ts`'s `pi` entry.
- Before merging any phase of
  [ADR 0042](decisions/0042-agent-catalog-modularization.md) that touches pi's
  settings-page behavior (2, 4, 4b, 5, 9 in particular).

Referenced by ADR 0042 phase 0 ("manual checklist for settings UI").

## Setup

macOS or Linux only — the hook/self-heal/terminal-progress behavior below is
detection-only on Windows (see the Windows case at the end). Have a real `pi`
CLI install available (`pi --version`).

## Checklist

1. **Open Settings → Agents.** Pi appears as its own row under "Session hooks"
   alongside Claude/Codex/Cursor/Copilot, with an Install button.
2. **Install pi's hook.** Click Install on the pi row.
   - Row flips to "Uninstall", hint shows the post-install note (restart pi,
     enable Terminal progress).
   - A **"Terminal progress"** sub-row appears immediately beneath pi's row —
     this sub-row must NOT appear under any other agent's row.
   - `~/.silo/agent-hooks/track-session.sh` exists and pi's hook config
     (`~/.pi/agent/settings.json` or wherever `resume.configPath` points) now
     references it.
3. **Terminal progress toggle, off → on.**
   - Toggle it on. `~/.pi/agent/settings.json`'s
     `terminal.showTerminalProgress` becomes `true`.
   - Restart the pi CLI in a Silo terminal (the hint says this is required).
   - Confirm the terminal tab shows pi as working while it's mid-turn and idle
     between turns (OSC 9;4 progress).
4. **Terminal progress toggle, on → off.**
   - Toggle off. Setting flips back to `false` on disk.
   - Restart pi again. The tab still identifies as pi (exact resume still
     works) but no longer lights up working/idle.
5. **Self-heal on reload.** Manually edit pi's hook command in its config file
   to something stale (e.g. truncate it), reload the Settings → Agents page.
   Confirm it's silently rewritten back to the current form and an
   informational line lands in Output → Application.
6. **Uninstall.** Click Uninstall on the pi row. Hook entry is removed from
   pi's config; the Terminal progress sub-row disappears with it.
7. **Docs link.** "Setup details" on pi's row opens
   `https://getsilo.dev/guide/agent-sessions#pi`.
8. **Windows.** On a Windows machine (or simulate `os === "windows"` if
   testing elsewhere isn't practical), confirm: no Install button on any row
   (detection-only), no Terminal progress sub-row for pi even when otherwise
   installed, and the "Exact resume … Windows" callout is visible.

## What "pass" means

Every step above matches the description with no console/Output errors beyond
the deliberate ones (self-heal's informational log). Any deviation is a
regression in the pi settings-UI carve-out and blocks the phase's merge.
