# Requirements — 0033. Agent Profiles (phase 1)

The behavioral specification for **phase 1 only**: the record, its persistence,
the save-time probe, the host-owned launch path, the `+` menu, and the Profiles
settings tab. Working artifact — removed when the proposal collapses.

Phase 1 is done when a user who has never opened Settings can click `+`, be sent
to a tab that offers the agents already installed on their machine, add one in a
single click, and from then on start that agent from the `+` menu — with a second
account of the same agent distinguishable from the first.

Terms used below are as defined in `docs/domain-language.md`: **Catalog Agent**
(`AgentDefinition.id`), **Terminal Kind** (`TerminalKind`), and — new in this
change — **Agent Profile**.

---

## R1 — The Agent Profile record

A profile is a named, user-authored recipe for starting an agent in a terminal:
a label, a shell command line, an optional config directory, and an optional
catalog agent hint.

### Acceptance criteria

- [ ] A profile carries `id`, `label`, `command`, and optionally `configDir`,
      `assumedAgentId`, `resolvedCommand`, `resolvedAt`, `broken`.
- [ ] `command` is a **string**, not an argv array — an alias, shell function, or
      version-manager shim is a valid `command` and launches correctly.
- [ ] `id` matches `^[a-z0-9][a-z0-9-]*$` and is unique across profiles.
- [ ] `id` is prefilled by slugifying `label` (lowercase, strip
      non-alphanumerics, collapse runs to a single hyphen, trim leading/trailing
      hyphens): `"Claude (work)"` → `claude-work`.
- [ ] `id` is **editable at any time**, not frozen at creation.
- [ ] `label` and `command` are required and non-empty after trimming; a save
      with either empty is rejected with an inline field error.
- [ ] `configDir`, when set, is stored as an **absolute path** — `~` is expanded
      at save time, never at launch time.
- [ ] The field naming the catalog agent is **`assumedAgentId`**, not `agentId`
      or `agent`. It holds a user assertion; `AgentInfo.agentId` holds a proven
      observation. The two must not be confusable at a glance in the type or in
      prose — see R16.
- [ ] `resolvedCommand`, `resolvedAt`, and `broken` are derived by the probe and
      are never directly editable by the user.
- [ ] The record has **no** free-form `env` map, no `cwd`, no `isAgent`, no
      `promptDelivery`, and no `default` field (deferred to phase 2 — see Out of
      scope).

## R2 — Persistence and ordering

Profiles are host-owned global state that survives a restart, and their order is
the order they appear in menus.

### Acceptance criteria

- [ ] Profiles persist across an application restart.
- [ ] Profiles are **global**, not per-workspace — the same list appears in every
      workspace.
- [ ] The stored order is the `+` menu order and the settings-list order; the two
      never disagree.
- [ ] "Move up" / "Move down" reorder the list, are no-ops at the ends, and
      persist.
- [ ] An install with no persisted profiles loads an empty list, not an error.
- [ ] Silo ships **zero** profiles by default and writes none automatically at
      any point — every profile that exists was created by an explicit user
      action.
- [ ] A persisted profile whose stored shape is unreadable (missing `id`,
      `label`, or `command`) is dropped at load with a logged warning rather than
      crashing hydration, and the remaining profiles load.
- [ ] Profiles are hydrated before any extension activates, so the
      deprecated-kind mapping in R9 can resolve against a populated list.

## R3 — The catalog knows each agent's config-directory variable

`AgentDefinition` gains one field naming the environment variable that agent
reads its config directory from. This is a fact about the agent's CLI, not a user
preference, so it lives in the sealed catalog.

### Acceptance criteria

- [ ] `AgentDefinition.configDirEnvVar?: string` exists and is documented.
- [ ] It is populated for `claude` (`CLAUDE_CONFIG_DIR`), `codex` (`CODEX_HOME`),
      `grok` (`GROK_HOME`), and `pi` (`PI_CODING_AGENT_DIR`) — and for no other
      agent.
- [ ] It is left **undefined** for `cursor-agent`, `opencode`, and `copilot`, and
      each of those three entries' `contract` records **why** (credentials do not
      follow the variable; `COPILOT_HOME` only extends a plugin search path), so
      the finding is not re-derived.
- [ ] Every catalog entry touched has `lastVerified` (and
      `verifiedAgainstVersion` where known) updated in the same change, per the
      catalog's existing discipline.
- [ ] `docs/adding-a-coding-agent.md` is updated so that adding a new agent
      requires a deliberate `configDirEnvVar` answer, including the "does it move
      the credentials too" test that produced the table in `proposal.md`.

### Config-directory field visibility

- [ ] The profile editor shows the config-directory field when the profile's
      `assumedAgentId` resolves to an agent declaring a `configDirEnvVar`.
- [ ] The field is **hidden** when the resolved agent declares none.
- [ ] When no agent is resolved at all (an unresolved or failed probe, and no
      manual selection), the field is hidden and the editor says why — pointing
      at the agent `Select` as the way to enable it. A user must never be unable
      to set a config directory for an agent that supports one just because the
      probe failed.
- [ ] Changing `assumedAgentId` to an agent with no `configDirEnvVar` while a
      `configDir` is stored **clears** the stored `configDir` and tells the user
      it was dropped. A stored value that silently stops applying is worse than
      no value.

## R4 — The save-time probe

Saving a profile, and an explicit **Recheck**, run one bounded, user-initiated
interactive-shell lookup that validates the command, resolves aliases for
display, identifies the catalog agent, and warns on a config-dir conflict.

### Acceptance criteria

- [ ] The probe runs `$SHELL -i -c 'type -- <first token>'` through the host's
      one-shot exec, using the shell configured in Settings → Terminal.
- [ ] The command token is POSIX single-quoted before interpolation into the
      `-c` string, so a profile command can never inject shell code into the
      probe.
- [ ] The probe runs **only** on an explicit user action (Save, Recheck) — never
      on app start, never on menu open, never at launch time.
- [ ] It is bounded by a timeout; expiry is treated as "unresolved", not a hang.
- [ ] A command that resolves stores its expansion as `resolvedCommand`, stamps
      `resolvedAt`, and clears `broken`.
- [ ] A command that does not resolve sets `broken: true`, shown as such in the
      settings list; the profile is still saved and still editable.
- [ ] A probe that times out or returns unparseable output leaves the profile
      **unresolved but not broken** — no `resolvedCommand`, `broken` untouched.
- [ ] The probe identifies the catalog agent by matching the expansion's argv0
      **basename** against catalog `leaderNames`, so
      `claude-work → claude --dangerously-skip-permissions` resolves to `claude`.
- [ ] When the probe is unavailable or unparseable, the fallback matches the
      command's leading token **up to the first `-` or `_` boundary** against
      `leaderNames` (`claude-work` → `claude`).
- [ ] The fallback **never substring-matches**, and is skipped entirely for
      tokens shorter than three characters — `pi` must not match `pip`, and
      `copilot` must not match via `pilot`.
- [ ] An explicit agent choice in the editor's `Select` overrides both the probe
      and the fallback, and survives a later Recheck.
- [ ] If the expansion contains an assignment to the resolved agent's
      `configDirEnvVar`, the editor warns that the alias's own assignment will
      win over the profile's `configDir`.
- [ ] `resolvedCommand` is used for display and diagnostics only — the launch
      always types `command`, so an alias the user later changes takes effect
      immediately.
- [ ] `resolvedCommand` is never written to an Output channel or a log line (it
      may contain a secret the user inlined in their own alias).

### Recheck and staleness

A stored expansion goes stale the moment the user edits their shell config. Silo
does not re-probe on its own (above), so staleness is surfaced rather than
hidden.

- [ ] The profile editor has a **Recheck** action that re-runs the probe against
      the currently-entered command without saving the rest of the form.
- [ ] The editor displays when the profile was last checked, derived from
      `resolvedAt`.
- [ ] Recheck updates `resolvedCommand`, `resolvedAt`, and `broken`, and may
      change the detected agent — unless the user has explicitly chosen one.

## R5 — The launch line

The launch line is what Silo types into the terminal's interactive shell, and it
is exactly what the editor shows the user.

### Acceptance criteria

- [ ] With no `configDir`, the launch line is the profile's `command` verbatim.
- [ ] With a `configDir` **and** a resolved agent declaring a `configDirEnvVar`,
      the line is `<VAR>='<absolute path>' <command>`.
- [ ] The path is POSIX single-quote wrapped, with embedded `'` escaped as
      `'\''`.
- [ ] With a `configDir` set but no `configDirEnvVar` on the resolved agent, no
      prefix is emitted (and R3 means the value was cleared rather than left to
      rot).
- [ ] The editor displays the exact launch line, with a Copy button that copies
      it verbatim.
- [ ] The launch writes the line followed by a carriage return (`\r`), matching
      a real keypress.

## R6 — One terminal, one shell: the launch is an intent, not a spawn

A launch must never race the terminal view for ownership of the PTY. The host
decides **what** to launch and records that intent; whoever brings the session up
carries it out.

Today `TerminalPanel` spawns its own session on mount (`needsCreate =
!tRec.sessionId`), while `ctx.terminals.sendText`'s lazy-spawn fallback spawns
through a separate path. A launch path that spawned on its own would race the
panel and leak a second PTY per launch.

### Acceptance criteria

- [ ] The `kind`-based launch shim in `TerminalPanel.tsx` is deleted. The view no
      longer decides _what_ to launch — it only reports that its session is
      ready.
- [ ] Launching a profile creates the terminal record and records a **pending
      launch** against that terminal id. It does not spawn a PTY as a side effect
      of being called.
- [ ] A pending launch is consumed **exactly once**, by whichever path first
      reports a ready session for that terminal — the mounted panel, or the
      host's own lazy spawn.
- [ ] Launching a profile results in **exactly one** PTY session for that
      terminal, under every ordering of panel mount and launch call. No orphaned
      session is created and none is leaked.
- [ ] Launching a profile into a **background** workspace, where no panel ever
      mounts, still starts the agent. `launchAgentProfile` decides which case it
      is by comparing the target workspace to the active one. **No phase-1
      surface reaches this branch** — both menus target the active workspace — so
      it is verified by unit test, not by hand. It is built now because
      `silo agent run --profile <id>` (phase 2) resolves its workspace from a
      shell's cwd and `ctx.agents.profiles.launch({ workspaceId })` (phase 5)
      takes one explicitly.
- [ ] Two launches issued back to back both start their agent; neither steals the
      other's session, and neither pending launch is dropped.
- [ ] A launch does not reorder existing tabs, and does not move focus on its
      own — the caller that opened a tab owns activating it, exactly as the `+`
      menu does today for "New Terminal".
- [ ] If the terminal record is removed before its pending launch is consumed,
      the pending launch is discarded and nothing is written.
- [ ] If the profile no longer exists when the pending launch is consumed (it was
      deleted between the click and the session coming up), nothing is written
      and the terminal is left as a plain shell.
- [ ] The launch line is resolved from the profile **at consumption time**, not
      captured at click time, so an edit landing in between takes effect.
- [ ] Pending launches are held **in memory only** and are never persisted. A
      launch intent that survived a restart would type into a terminal the user
      reopened later, unprompted; losing the intent on a crash and getting a
      plain shell is the correct failure instead.
- [ ] The registry's drain is **trigger-agnostic** — `takePendingLaunch` does not
      itself check session readiness. Phase 2's `silo agent run` inside a live
      terminal drains on a different signal (the foreground process handing the
      prompt back), and must be able to add a caller rather than rework the
      registry.

## R7 — Every profile-launched terminal carries its terminal identity

RFC 0028 guarantees that every Silo terminal's session environment carries
`SILO_TERMINAL_ID`. Only the privileged `spawnTerminalSession` stamps it; the
public `ctx.process.spawn` deliberately does not, because a session spawned
through the public surface "isn't a tab". `ctx.terminals.sendText`'s lazy-spawn
fallback currently uses the public one — so a tab whose PTY came up that way is
missing its identity today.

This is a **pre-existing defect**, not one this change introduces; it is in scope
because phase 1 makes that path the normal way an agent terminal starts, and
phase 2's `silo agent run` depends on the guarantee holding.

### Acceptance criteria

- [ ] The host's lazy-spawn path for a terminal tab spawns through
      `spawnTerminalSession`, so the session is stamped with its
      `SILO_TERMINAL_ID`.
- [ ] A terminal launched from a profile into a never-mounted background
      workspace has `SILO_TERMINAL_ID` set in its environment, matching the value
      it would have had if the tab had been opened by hand.
- [ ] A terminal whose PTY came up via `ctx.terminals.sendText` on a never-shown
      tab likewise has `SILO_TERMINAL_ID` set — the pre-existing gap is closed,
      not merely routed around.
- [ ] The workspace identity variables (`SILO_WORKSPACE_ID`,
      `SILO_WORKSPACE_PATH`) are stamped on the same sessions, from the same
      source as the ordinary path.
- [ ] No caller can supply or override any `SILO_*` value through this path — the
      reserved namespace still belongs to the host.

## R8 — A terminal remembers the profile it was launched from

`profileId` is **substrate**: phase 1 writes and maintains it, and nothing reads
it until resume composition (phase 4). The requirements here are about the
integrity of the stored reference, not about visible behavior.

### Acceptance criteria

- [ ] `TerminalRecord.profileId?: string` exists, is `@public`, and is persisted.
- [ ] A terminal launched from a profile carries that profile's id.
- [ ] A terminal created any other way (New Terminal, watermark,
      `core.newTerminal`, "New Terminal Here", `ctx.terminals.create`) has **no**
      `profileId`. Silo never guesses one for a hand-typed agent.
- [ ] Renaming a profile's id rewrites every `TerminalRecord.profileId` that
      referenced it, in the same mutation as the rename, so a persistence tick
      can never observe a dangling reference.
- [ ] Deleting a profile clears `profileId` on terminals that referenced it; the
      terminals themselves are untouched and keep running.
- [ ] The tab title of a profile-launched terminal is derived from the PTY
      exactly as every other terminal's is. Silo does **not** seed the profile
      label as the title: `TerminalPanel` overwrites `title` from the foreground
      process and OSC within a second, so a seeded label would flash and vanish.
      The agent's own title plus its tab icon are the identification; the profile
      label lives in the menu that started it.

## R9 — `TerminalKind`'s agent values are deprecated, not removed

### Acceptance criteria

- [ ] `TerminalKind` still includes `"claude"` and `"pi"`, and
      `TerminalRecord.kind` / `CreateTerminalInput.kind` still exist — no
      breaking change to published `@public` API.
- [ ] Both values are marked `@deprecated` in TSDoc, naming Agent Profiles as the
      replacement.
- [ ] `AgentInfo.kind` is marked `@deprecated` in the same change: after
      normalization it is always `"shell"`, so a consumer branching on it is
      reading a constant. Its TSDoc says so and points at `agentId` for identity.
- [ ] `ctx.terminals.create({ kind: "claude" | "pi" })` creates a `"shell"`
      terminal. If a profile exists whose `assumedAgentId` matches, that profile
      is launched; otherwise the bare command (`claude` / `pi`) is typed,
      preserving today's observable behavior.
- [ ] That path **never creates a profile record** — Silo does not write user
      data from a programmatic call.
- [ ] A persisted terminal record carrying `kind: "claude"` or `"pi"` is
      normalized to `kind: "shell"` at hydration.
- [ ] The consequence of that normalization is deliberate and documented: such a
      terminal no longer seeds `isAgent: true` from its kind, and instead
      acquires agent identity the same way every other terminal does — by
      detection (ADR 0028).
- [ ] `docs/domain-language.md`'s "Terminal Kind vs Catalog Agent" entry is
      rewritten in the same change: **Agent Profile is the launch vocabulary,
      Catalog Agent is the identity vocabulary**, and Terminal Kind is neither.

## R10 — The `+` menu can start an agent

### Acceptance criteria

- [ ] With one or more profiles, the `+` menu lists them **flat**, immediately
      after "New Terminal", each with its resolved agent's icon and the profile's
      label.
- [ ] Menu order matches the stored profile order (R2).
- [ ] The list never collapses into a submenu, regardless of how many profiles
      exist.
- [ ] Choosing a profile row opens a new terminal in the current group in the
      active workspace and launches that profile in it, activating the new tab
      the same way "New Terminal" does.
- [ ] A profile with no resolved agent still appears, with a neutral fallback
      icon rather than being hidden.
- [ ] In a workspace with more than one folder, choosing a profile resolves the
      target folder through the same chooser "New Terminal" uses, and creates no
      terminal if the user dismisses it.
- [ ] A profile deleted between the menu opening and the row being clicked
      creates no terminal and surfaces no error dialog.

### Broken profiles

- [ ] A profile marked `broken` (R4) still appears in the menu — hiding something
      the user created is more confusing than showing it as broken.
- [ ] Choosing a broken profile **does not launch it and does not open a
      terminal**. It surfaces the notice from R15 immediately, with the action
      that opens its editor. Silo already knows the command will not resolve;
      opening a shell to watch it fail teaches the user nothing.

## R11 — The terminal context menu offers the same entries

The RFC placed these on "the terminal tab context menu, which already offers
'new terminal here'". That is factually wrong about the code: the **tab** menu
(`ctx.terminals.getTabMenuItems`) offers Rename plus contributions, while "New
Terminal Here" lives on the terminal **body**'s context menu, which is also the
only one holding the live foreground cwd. These entries therefore go on the body
menu.

### Acceptance criteria

- [ ] The terminal body's context menu lists the same profiles, labelled
      `"<label> here"`, beside the existing "New Terminal Here".
- [ ] Those entries launch against the terminal's **live foreground cwd**, the
      same cwd "New Terminal Here" already uses.
- [ ] Broken profiles behave as in R10.
- [ ] With no profiles defined, no profile entries and no empty-state entry are
      added to this menu (it is not an onboarding surface).
- [ ] `ctx.terminals.getTabMenuItems` is unchanged — no profile entries are added
      to the tab menu, and no new public menu surface is introduced.

## R12 — Empty state and "Found on this machine"

The `+` menu's empty state is the whole of onboarding, and the tab it leads to
must produce a working profile in one click.

### Acceptance criteria

- [ ] With zero profiles, the `+` menu shows exactly one profile-related entry,
      **"Add an agent profile…"**, in place of the list.
- [ ] Choosing it opens Settings → Agents with the **Profiles** tab active.
- [ ] There is no first-run wizard and no modal gate at app start.
- [ ] The empty watermark and `core.newTerminal` are unchanged — neither gains a
      profile surface in phase 1.
- [ ] The Profiles tab leads with a **"Found on this machine"** section listing
      each catalog agent whose `leaderNames` resolve on `PATH`, as a one-click
      add card showing the agent icon, display name, and resolved command.
- [ ] Detection is a plain non-interactive `PATH` lookup — it does **not** source
      the user's rc file and therefore deliberately cannot find aliases.
- [ ] A card writes nothing until it is clicked. Clicking it creates a profile
      with the agent's display name as `label`, its resolved binary name as
      `command`, and its catalog id as `assumedAgentId`.
- [ ] A card disappears once a profile for that agent exists, and the whole
      section disappears when no cards remain, so it never becomes permanent
      chrome.
- [ ] Below the cards sits the honest empty state, which is what the tab shows
      once the cards are gone.
- [ ] Detection runs when the tab is opened and on an explicit refresh — never at
      app start.

## R13 — Settings → Agents → Profiles

### Acceptance criteria

- [ ] Settings → Agents has the tabs Profiles, Behavior, Navigator, Display,
      Sessions — with **Profiles** first and active by default.
- [ ] The list is built from the SDK kit (`List` / `ListRow` / `AddRow`), not
      hand-rolled markup, per ADR 0026.
- [ ] A row shows: the label, the resolved command in monospace, the agent icon
      and name, the config directory when set, and a resume-status badge.
- [ ] The config directory is visible **on the row**, so two profiles sharing the
      command `claude` and differing only by account are distinguishable.
- [ ] The row's `⋮` menu offers Edit, Duplicate, Move up, Move down, and Delete.
- [ ] **Duplicate** copies the profile and opens the editor with the
      config-directory field focused.
- [ ] Delete asks for confirmation and, on confirm, removes the profile and
      applies R8's reference cleanup.
- [ ] Move up/down are reachable from the keyboard and do not depend on drag and
      drop.
- [ ] A broken profile is visibly marked as broken in its row.
- [ ] A profile whose resolved agent has no installed session hook shows a
      `Best-effort resume` badge that navigates to the **Sessions** tab.

## R14 — The profile editor

### Acceptance criteria

- [ ] The editor is a host `Modal` (ADR 0018) whose content is SDK kit fields
      (ADR 0026): `Input` label, `Input` id, `Input` command, `Select` agent, and
      — subject to R3's visibility rules — an `Input` config directory. No
      bespoke widgets.
- [ ] The id field is prefilled from the label while the user has not edited it,
      and stops tracking the label once they have.
- [ ] The id field's caption states that this is the value
      `silo agent run --profile <id>` takes.
- [ ] An id that collides with another profile is rejected with the conflict
      shown inline — never silently suffixed. Editing a profile without changing
      its id is not a collision with itself.
- [ ] The editor shows the exact launch line (R5) with a Copy button.
- [ ] The editor offers **Recheck** and shows the last-checked time (R4).
- [ ] There is **no** "Test launch" button.
- [ ] On save, `~` in the config directory is expanded to an absolute path.
- [ ] On save, a config directory that does not exist prompts to create it, and
      creates it on confirm. (`codex` fails to load config rather than
      bootstrapping a missing `CODEX_HOME`.)
- [ ] Cancel discards every edit, including any probe result produced by a
      Recheck during the session, leaving the stored profile untouched.

## R15 — Failure is visible

Silo types into a PTY; there is no exit code. Both failure points are surfaced.

### Acceptance criteria

- [ ] **At save time**, an unresolvable command marks the profile broken (R4),
      and the `+` menu refuses to launch it (R10).
- [ ] **At launch time**, for a profile that was _not_ known broken, a
      `command not found`-shaped line in the session's first output within a
      bounded window raises a non-blocking notice naming the profile, with an
      action that opens its editor.
- [ ] The launch-time scan is bounded in time and stops as soon as it fires or
      the window closes, so ordinary agent output is never scanned indefinitely.
- [ ] The scan does not fire on unrelated output — it matches only a
      shell-not-found shape mentioning the profile's own command token.
- [ ] A profile that fails at launch this way is marked broken, so the next
      attempt is refused up front rather than repeating the failure.

## R16 — What a profile may and may not claim

A profile's `assumedAgentId` is a user assertion, not an observation. ADR 0028's
"never claim what you cannot prove" governs.

### Acceptance criteria

- [ ] `assumedAgentId` **may** select the `+` menu icon, select the
      `configDirEnvVar` used in the launch prefix, and (later) supply resume
      flags.
- [ ] `assumedAgentId` **may never** be written into `AgentInfo.agentId`.
- [ ] A profile **may never** seed `AgentInfo.isAgent`. A profile-launched
      terminal becomes an agent only when detection says so.
- [ ] `docs/domain-language.md` records the distinction between the asserted
      `assumedAgentId` and the observed `agentId` under the new **Agent Profile**
      entry, so the two are not conflated in future code or prose.
- [ ] No new public detector- or profile-registration API is added — detection
      stays sealed, and profiles stay user-authored (no extension-contributed
      profiles).

## R17 — `ctx.agents.catalog()` and agent icons

Agent brand marks are a fact about a Catalog Agent and must be readable by the
host chrome that renders the `+` menu, which cannot import an extension package.

### Acceptance criteria

- [ ] `agent-icons.ts` lives next to the sealed catalog in
      `packages/extension-host`, not in `packages/extensions-silo`.
- [ ] `ctx.agents.catalog()` returns a read-only list of
      `{ id, displayName, icon? }` for every catalog agent.
- [ ] The surface is **read-only** — there is no way for an extension to register
      into the catalog.
- [ ] The returned value is stable across calls (memoized) and deeply frozen. It
      is consumed inside `ctx.terminals.bindIcon`, which runs per tab render, so
      allocating a fresh array per call is a performance defect and a mutable one
      is a correctness defect.
- [ ] `AgentIconGlyph`'s mode union moves to the SDK alongside it, so the public
      component is not typed against a union private to `silo.agents`.
- [ ] `silo.agents` deletes its local icon module and renders icons from
      `ctx.agents.catalog()`, with no visual change to the Agents panel or the
      terminal tab icon.
- [ ] The `+` menu renders each profile's icon from the host's own copy of the
      same data, with no import from an extension package.
- [ ] Core extensions read the catalog through the public `ctx.agents.catalog()`.
      No parallel catalog accessor is added to the privileged internal barrel.
- [ ] The addition runs the full `silo-docs-sync` workflow: TSDoc,
      `@public`/`@category` tags, barrel re-export, the hand-authored
      `ctx.agents` member page, `pnpm docs:api`, and a roadmap row.

## R18 — Hooks becomes Sessions

### Acceptance criteria

- [ ] The **Hooks** tab is renamed **Sessions**; its content is unchanged.
- [ ] Prose that refers to the tab by name is updated in the same change,
      including `apps/docs` (the guide already calls this "agent sessions").
- [ ] Hook install and `extraSettingsToggle` rows stay on that tab — they are
      **not** folded into profile rows, because a hand-typed agent with no
      profile still needs them.

## R19 — Documentation and tests ship with the change

### Acceptance criteria

- [ ] `docs/domain-language.md` gains **Agent Profile** (including the
      asserted-vs-observed agent-id distinction from R16) and rewrites the
      Terminal Kind entry (R9).
- [ ] `docs/adding-a-coding-agent.md` covers the new `configDirEnvVar` decision
      (R3).
- [ ] The roadmap gains a row for `ctx.agents.catalog()` and one for Agent
      Profiles, with accurate badges.
- [ ] Every new pure helper (slugify, id validation, launch-line building, POSIX
      quoting, probe-output parsing, catalog-agent fallback matching, migration)
      has unit tests covering its contract and its edges.
- [ ] The pending-launch registry has tests covering consume-exactly-once across
      both orderings, discard on record removal, and discard on profile deletion.
- [ ] `pnpm test`, `pnpm --filter silo exec tsc --noEmit`, and `pnpm lint` pass.

## Out of scope

These are phases 2–9 in `proposal.md`. Named here so a reader does not expect
them from this package:

- **A default profile.** The `default` flag, the "Set default" row action, and
  default resolution are deferred to phase 2, where per-profile commands and
  keybindings give "launch the default agent" an actual gesture. Phase 1's `+`
  menu is a flat list where every profile is named, so a default would be stored
  and never read.
- Commands and keybindings per profile (`core.newAgent.<profileId>`).
- Prompt delivery — `promptDelivery`, the quoted-heredoc transport, and the
  line-editor sanitizer.
- Resume composition — splitting `buildResumeCommand` into catalog-owned
  `resumeArgs` plus the profile's command and env prefix. Phase 1 leaves resume
  exactly as it is today, including the known flag-dropping behavior for a
  profile launched with an alias. This is the first consumer of `profileId`.
- A public `ctx.agents.profiles` (`list()` / `launch()`). Phase 1 exposes
  profiles to `core.*` through `@silo-code/extension-host/internal` only.
- `SILO_AGENT_PROFILE` in the session environment and hook-confirmed profile
  identity.
- Per-account hooks keyed on `(agentId, configDir)`. A second-account profile
  launches correctly and still gets a best-effort resume hint — which is not a
  regression, since that account gets a generic hint today too.
- A per-workspace default profile.
- The CLI, in both halves. `silo agent run --profile <id>` lands in **phase 2** —
  it needs no new IPC, only another arm in the existing single-instance argv
  handler — and is the first caller that can target a background workspace.
  `silo agent list` and bare `silo agent run`'s picker stay in phase 9, because
  they must return data to the caller and the existing `cli:open` path is
  fire-and-forget. The full surface is fixed by `proposal.md`; nothing in phase 1
  depends on either shipping.
- Extension-contributed profiles, a first-run wizard, an `env` map, and a "Test
  launch" button — rejected outright, not deferred.
