# Agent Settings page — manual verification checklist (pi-extension agents)

`packages/extensions-core/src/agents-settings/index.tsx` has no automated test
coverage of its own (the repo's testing convention is pure-logic Vitest, no
`@testing-library/react` — see `.agents/skills/silo-testing/SKILL.md`), so the
`pi-extension` install strategy and the `extraSettingsToggle` carve-out in that
file are only checked by hand. Run this checklist:

- After any change to `index.tsx`, `pi-settings.ts`, `pi-extension-installer.ts`,
  `agent-catalog.ts`'s `pi` or `omp` entries, or
  `catalog/pi-extension-template.ts` (shared by both).
- Before merging any phase of
  [ADR 0042](decisions/0042-agent-catalog-modularization.md) that touches
  settings-page behavior for these agents (2, 4, 4b, 5, 9 in particular).

Referenced by ADR 0042 phase 0 ("manual checklist for settings UI").

## The two pi-extension agents

Both install a Silo-owned TypeScript **extension file** rather than a hook
entry in a JSON config (ADR 0041) — that is what `pi-extension` means, and it
is the only thing they share at the settings layer. Run the checklist once per
agent, substituting from this table:

|                               | pi                                             | OMP                                             |
| ----------------------------- | ---------------------------------------------- | ----------------------------------------------- |
| Row label                     | `pi`                                           | `OMP`                                           |
| CLI                           | `pi --version`                                 | `omp --version`                                 |
| Extension file (`configPath`) | `~/.pi/agent/extensions/silo-track-session.ts` | `~/.omp/agent/extensions/silo-track-session.ts` |
| Settings file                 | `~/.pi/agent/settings.json` (JSON)             | `~/.omp/agent/config.yml` (**YAML**)            |
| Activity sub-row              | **"Terminal progress"**                        | **none** — see step 3                           |
| Resume command                | `pi --session <id>`                            | `omp --resume <id>`                             |
| Docs anchor                   | `…/agent-sessions#pi`                          | `…/agent-sessions#omp`                          |

The two must stay **completely independent on disk**: installing one must never
create, modify, or delete anything under the other's config home. That is the
single most important thing this checklist verifies, because both agents write
a file of the same name and RFC 0037 exists because OMP used to be mistaken for
pi.

## Setup

macOS or Linux only — the hook/self-heal behavior below is detection-only on
Windows (see the Windows case at the end). Have a real install of the agent
under test available.

## Checklist

1. **Open Settings → Agents.** The agent appears as its own row under "Session
   hooks" alongside Claude/Codex/Cursor/Copilot, with an Install button. pi and
   OMP are two separate rows with distinct names and icons — confirm the icons
   are told apart at a glance, since both brand with `π`.
2. **Install the hook.** Click Install on the agent's row.
   - Row flips to "Uninstall", hint shows the post-install note (restart the
     agent).
   - `~/.silo/agent-hooks/track-session.sh` exists, and the extension file at
     the agent's own `configPath` now references it.
   - **The other agent's config home is untouched** — check its modification
     time, and confirm no `silo-track-session.ts` appeared there.
   - Open the written file: its header names the agent you installed for (an
     OMP file must not say it is tracking a pi session), and its type import
     names that agent's own package.
3. **Activity sub-row.**
   - **pi:** a **"Terminal progress"** sub-row appears immediately beneath its
     row. Toggle on → `terminal.showTerminalProgress` becomes `true` in
     `~/.pi/agent/settings.json`; restart pi; the tab shows working mid-turn
     and idle between turns. Toggle off → back to `false`; restart; the tab
     still identifies pi and still offers exact resume, but never lights up.
   - **OMP:** there must be **no** sub-row. OMP reports state in its terminal
     title by default, so there is nothing to enable — and its settings are
     YAML, which the toggle mechanism cannot write. Confirm the tab tracks
     working/idle with nothing switched on, and that an approval prompt reads
     as waiting rather than stuck on working.
4. **Both at once.** Run `pi` and `omp` in two terminals simultaneously.
   Each keeps its own name, icon, and resume command for the whole session,
   including while one is mid-turn and the other is idle.
5. **Self-heal on reload.** Manually edit the installed extension file to
   something stale (e.g. truncate it), reload the Settings → Agents page.
   Confirm it's silently rewritten back to the current form and an
   informational line lands in Output → Application.
6. **Exact resume.** With the hook installed, start a session, restart Silo,
   and confirm the offered resume command is the agent's own (`pi --session`
   vs `omp --resume`) and that running it actually resumes that session.
7. **Uninstall.** Click Uninstall on the row. The extension file is removed
   from that agent's config home; any sub-row disappears with it; the other
   agent's install is unaffected.
8. **Docs link.** "Setup details" opens the agent's own anchor from the table
   above.
9. **Windows.** On a Windows machine (or simulate `os === "windows"` if
   testing elsewhere isn't practical), confirm: no Install button on any row
   (detection-only), no activity sub-row for pi even when otherwise installed,
   and the "Exact resume … Windows" callout is visible. An OMP terminal should
   still be **named** there — it is identified from its own title, which needs
   no hook and no process read.

## What "pass" means

Every step above matches the description with no console/Output errors beyond
the deliberate ones (self-heal's informational log). Any deviation is a
regression in the pi-extension settings-UI carve-out and blocks the phase's
merge.
