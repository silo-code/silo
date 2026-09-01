# Requirements — 0033. Agent Profiles, phase 2 (Addressing a profile by name)

The behavioral specification for **phase 2 only**. Phase 1 (the record, the `+`
menu, the Agents submenu, the Profiles settings tab, the pending-launch model)
is the baseline and is not restated here. Working artifact — removed when the
proposal collapses.

Requirement numbering restarts at R1 for this phase; phase-1 requirement numbers
are gone with its planning package and are not referenced.

---

## R1 — A command per profile

Every Agent Profile has a registered command, `core.newAgent.<profileId>`, that
launches it. The set of registered commands tracks the profile list — added on
create, removed on delete, and re-keyed on an id change — with no restart.

Running the command does exactly what clicking that profile in the `+` menu
does: resolve the workspace folder (prompting when the workspace has several),
create a profile-bound terminal, and let the pending-launch model deliver the
line.

### Acceptance criteria

- [ ] With profiles `claude-work` and `codex`, `commandRegistry` holds
      `core.newAgent.claude-work` and `core.newAgent.codex`.
- [ ] Adding a profile registers its command; deleting one unregisters it.
- [ ] Renaming a profile's id unregisters the old command id and registers the
      new one; no duplicate-id error is thrown by `Registry.register`.
- [ ] Editing a profile's label, command, `configDir`, or `assumedAgentId`
      without changing its id leaves the command registered and updates its
      label.
- [ ] A profile command's `label` is `New Agent: <profile label>`.
- [ ] Executing `core.newAgent.<id>` creates exactly one terminal record with
      `profileId === <id>` in the active workspace, and exactly one PTY.
- [ ] Executing it with no active workspace is a no-op (no terminal, no throw).
- [ ] Dismissing the multi-folder picker creates no terminal.
- [ ] The commands appear on Settings → Keyboard Shortcuts and can be bound to a
      chord, which then launches the profile.

## R2 — A default profile

`AgentProfile` gains an optional `default` flag. At most one profile carries it.
Setting it on one profile clears it from any other, in the same mutation.

The flag is set and cleared only by an explicit user gesture on the Profiles
tab. Nothing infers or assigns it — not on first profile creation, not on
migration, not on delete of the current default.

### Acceptance criteria

- [ ] A profile row's `⋮` menu offers **Set as default** (when not default) or
      **Clear default** (when it is).
- [ ] The default profile's row is visually marked; no other row is.
- [ ] Setting default on B while A is default leaves exactly one default (B).
- [ ] Deleting the default profile leaves no default — no other profile is
      promoted.
- [ ] Creating the first profile does not make it default.
- [ ] `default` round-trips through persistence.
- [ ] A persisted index in which two or more entries carry `default: true` loads
      with the flag kept on the first and stripped from the rest.
- [ ] An index whose `default` is a non-boolean loads with the flag absent, not
      with a truthy coercion, and the profile is otherwise kept.

## R3 — A generic `New Agent` command

A single `core.newAgent` command launches the **default** profile. When no
profile is marked default it launches the **first** profile in list order. When
there are no profiles at all it opens Settings → Agents, matching what the `+`
menu's empty state does.

This is the one agent-launch command id that survives a profile rename, and so
the one worth binding permanently.

### Acceptance criteria

- [ ] With a default set, `core.newAgent` launches that profile regardless of
      list position.
- [ ] With profiles but no default, it launches the first in list order.
- [ ] Reordering profiles with no default changes which one it launches.
- [ ] With zero profiles it opens the Agents settings page and creates no
      terminal.
- [ ] Its label is `New Agent`, and it is bindable on the Keyboard Shortcuts
      page.
- [ ] Renaming a profile's id does not change `core.newAgent`'s behavior or
      break a binding to it.

## R4 — `silo agent run` launches from a shell

`silo agent run --profile <id>` launches that profile. `silo agent run` with no
`--profile` launches the default (falling back to the first, as R3). Both work
warm (an instance is already running) and cold (this launch starts the app).

The token `agent` is treated as a subcommand **only** when followed by `run`;
otherwise argv falls through to the existing path-open behavior, so a directory
literally named `agent` still opens.

### Acceptance criteria

- [ ] `resolve_cli_request(["silo", "agent", "run", "--profile", "x"], cwd)`
      yields an agent-run request carrying profile id `x` and the normalized
      cwd.
- [ ] `--profile=x` is parsed identically to `--profile x`.
- [ ] `silo agent run` with no `--profile` yields an agent-run request with no
      profile id.
- [ ] `silo agent run --profile` with no value yields an agent-run request with
      no profile id (treated as bare), not a panic or a path open.
- [ ] `silo agent` (no `run`) and `silo agent/` resolve to the existing
      **open-path** request for `./agent`, unchanged from today.
- [ ] `silo agent run extra-positional` ignores the extra positional rather than
      treating it as a path.
- [ ] Unknown flags on `agent run` are ignored, not fatal.
- [ ] A cold launch stashes the request and the webview drains it once.

## R5 — `silo agent run` targets the workspace the shell is in

The launch resolves its workspace from the **forwarded cwd**, not from whichever
workspace happens to be active:

1. The open workspace whose primary folder or one of its `extraFolders`
   **contains** the cwd — longest match wins when several do.
2. Failing that, a workspace rooted at the cwd is created and used, exactly as
   `silo <dir>` does.

The terminal's working directory is the **forwarded cwd**, not the workspace
root. After launching, the target workspace is activated and the new terminal
focused.

### Acceptance criteria

- [ ] Run from `~/proj/src` with a workspace at `~/proj`: the terminal is
      created in that workspace with cwd `~/proj/src`.
- [ ] Run from a folder under a workspace's `extraFolders`: that workspace is
      chosen.
- [ ] With workspaces at `~/a` and `~/a/b`, running from `~/a/b/c` chooses
      `~/a/b`.
- [ ] A workspace at `~/a/b` does **not** match a cwd of `~/a/bc`.
- [ ] Run from a folder no open workspace contains: a workspace rooted at that
      folder is created and activated.
- [ ] The target workspace ends up active and the new terminal is the focused
      tab, whether or not it was active beforehand.
- [ ] Launching into a workspace that was **not** active spawns exactly one PTY
      (the background branch's `ensureSession`), and the panel mounting
      afterwards attaches to it rather than spawning a second.
- [ ] Naming a `--profile` id that does not exist creates no terminal and no
      workspace, and reports the miss to the Output panel.
- [ ] Bare `silo agent run` with no profiles at all creates no terminal and
      reports why to the Output panel.

## R6 — A dangling profile command never swallows a chord

A user keybinding whose command is not in the registry — the state left behind
after a profile is deleted or its id renamed — must not consume the keystroke.
The chord falls through to whatever would otherwise handle it.

The stale entry in `keybindings.json` is **kept**, not pruned: it is user data
(ADR 0046), and it revives correctly if a profile with that id is recreated.

### Acceptance criteria

- [ ] With a `keybindings.json` override for `core.newAgent.gone` (no such
      command registered), pressing that chord does not `preventDefault`, does
      not `stopPropagation`, and logs no "unknown command" warning.
- [ ] The same chord bound to a **registered** command still dispatches, with
      `preventDefault` — no regression to the override-only dispatch path.
- [ ] Deleting a profile does not modify `keybindings.json`.
- [ ] Recreating a profile with the deleted id restores the chord's effect with
      no user action.

## R7 — Renaming a profile with a keybinding warns first

Changing a profile's id in the editor, when a user binding (an override or an
unbind) exists for that profile's current command id, asks for confirmation
first. The message names the chord that will stop working. Cancelling abandons
the save; confirming saves the rename and leaves the binding dangling and inert
(per R6).

### Acceptance criteria

- [ ] Saving an id change with a bound command shows a confirm naming the chord
      in its display form (e.g. `Cmd+Shift+C`).
- [ ] Cancelling leaves the profile — id and every other field — unchanged.
- [ ] Confirming applies the rename; the old command id is unregistered and the
      new one registered (R1).
- [ ] An id change with **no** binding on the old command id shows no confirm.
- [ ] Changing only the label / command / `configDir` / `assumedAgentId` shows
      no confirm even when a binding exists.
- [ ] A binding on the generic `core.newAgent` never triggers the confirm.

## R8 — Documentation

The user-facing docs describe the new CLI subcommand and the default profile in
the same change.

### Acceptance criteria

- [ ] `apps/docs/guide/cli.md` documents `silo agent run [--profile <id>]`,
      including cwd-based workspace resolution and the default fallback.
- [ ] `apps/docs/roadmap.md`'s CLI entry names `silo agent run`.
- [ ] `docs/domain-language.md`'s **Agent Profile** entry records the **default
      profile** term and that the id is also a command-id component.
- [ ] The doc-index test passes.

## Out of scope

- Any `@silo-code/sdk` addition. `ctx.agents.profiles` is phase 5; the roadmap's
  `Agent Profiles (ctx.agents.profiles)` badge stays `planned` and
  `pnpm docs:api` output is unchanged.
- `silo agent list`, `--json`, and bare `silo agent run`'s interactive picker
  (phase 9 — they need a Control API to return data to the caller).
- Building a command palette. Phase 2's commands are palette-ready; Silo has
  none yet.
- Carrying a keybinding across a rename, or pruning a dangling one — both
  rejected in `proposal.md`'s alternatives.
- Per-workspace default profiles (phase 8).
- Prompt delivery (phase 3) and resume composition (phase 4) — `default` and the
  CLI say nothing about either.
- A Window-menu **New Agent** item beside **New Terminal**. Reasonable, but
  menu placement is a separate product call and would change `core.newAgent`'s
  Keyboard Shortcuts group as a side effect.
