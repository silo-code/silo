# Tasks — 0033. Agent Profiles (phase 1)

The implementation plan for **phase 1 only**. Ordered where dependencies matter:
groups 1–5 are the substrate, 6–8 are the surfaces, 9–11 close it out. Keep the
checkboxes current as work proceeds. Working artifact — removed when the proposal
collapses.

Requirement ids in parentheses map back to `requirements.md`.

## 1. Data model and state

- [ ] Add `AgentProfile` to `packages/extension-host/src/state/types.ts`, with
      TSDoc explaining why `command` is a string, why the agent field is named
      `assumedAgentId`, and what the cached probe fields are for. (R1, R16)
- [ ] Add `agentProfiles: AgentProfile[]` to the store shape and seed it as `[]`
      in `state/store.ts`. (R2)
- [ ] Write `state/agent-profiles.ts`: `getAgentProfiles`,
      `subscribeAgentProfiles`, `addAgentProfile`, `updateAgentProfile`,
      `removeAgentProfile`, `moveAgentProfile`. Mirrors
      `state/terminal-settings.ts` as the single read/write seam. (R1, R2)
- [ ] Reference sweep: renaming a profile's id rewrites every
      `TerminalRecord.profileId` across all workspaces in the same mutation;
      deleting clears them. (R8)
- [ ] Write `agents/agent-profile-model.ts` (pure): `slugifyProfileId`,
      `validateProfileDraft`, `posixSingleQuote`, `expandTilde`,
      `buildLaunchLine`, `parseTypeOutput`, `fallbackAgentForCommand`. (R1, R4, R5)
- [ ] Add `agentProfiles?: AgentProfile[]` to `PersistedIndex` and wire it through
      save/hydrate in `state/persistence-model.ts` + `state/persistence.ts`. (R2)
- [ ] Harden the load: drop entries missing `id`/`label`/`command` with a logged
      warning; keep the first of a duplicate id; absent key → empty list. (R2)
- [ ] Confirm profiles hydrate before extension activation, so the
      deprecated-kind mapping in group 5 resolves against a populated list. Add a
      comment at the hydration site recording the ordering dependency. (R2, R9)

## 2. Catalog

- [ ] Add `configDirEnvVar?: string` to `AgentDefinition` with TSDoc. (R3)
- [ ] Populate it in `catalog/claude.ts` (`CLAUDE_CONFIG_DIR`), `catalog/codex.ts`
      (`CODEX_HOME`), `catalog/grok.ts` (`GROK_HOME`), and `catalog/pi.ts`
      (`PI_CODING_AGENT_DIR`). (R3)
- [ ] Record the **negative** finding in `contract` for `catalog/cursor.ts`,
      `catalog/opencode.ts`, and `catalog/copilot.ts` — credentials do not follow
      the variable; `COPILOT_HOME` only extends a plugin search path — so it is
      not re-derived. (R3)
- [ ] Update `lastVerified` (and `verifiedAgainstVersion` where known) on every
      entry touched. (R3)
- [ ] Add the memoized, deeply-frozen catalog summaries
      (`{ id, displayName, icon? }`) to `agent-catalog.ts`. (R17)

## 3. Probe and installed-agent scan

- [ ] Write `agents/agent-profile-probe.ts`: `probeProfileCommand(command)` →
      `$SHELL -i -c "type -- '<token>'"` through `getProcessService().exec`, using
      `store.terminalSettings.shell`, bounded by a timeout. (R4)
- [ ] Quote the command token with `posixSingleQuote` before interpolation — no
      path from a profile command to shell injection in the probe. (R4)
- [ ] Resolve the catalog agent from the expansion's argv0 basename via the
      catalog's own `leaderBasename` / `agentByLeader`; fall back to
      `fallbackAgentForCommand`; never substring-match. (R4)
- [ ] Distinguish the three outcomes: resolved (sets `resolvedCommand`,
      `resolvedAt`, clears `broken`), not-found (sets `broken`), and
      timeout/unparseable (leaves `broken` untouched). (R4)
- [ ] Detect an alias that already assigns the agent's `configDirEnvVar` and
      report it as a warning on the probe result. (R4)
- [ ] Write `agents/agent-installed-scan.ts`: `scanInstalledAgents()` →
      `sh -c "command -v '<leaderName>'"` per catalog agent. Non-interactive by
      design — it must not source the user's rc file. (R12)
- [ ] Verify no code path logs `resolvedCommand` to an Output channel. (R4)

## 4. Launch: pending-launch registry and terminal identity

This group is the correction to the RFC's launch sketch — see `design.md` → "The
launch model". Land it before any surface calls a launch.

- [ ] Write `agents/pending-launch.ts`: `requestProfileLaunch`,
      `takePendingLaunch` (remove-on-read), `discardPendingLaunch`. Module-level
      map, **never persisted**; keep the drain trigger-agnostic so phase 2's
      `silo agent run` can add a caller without reworking it. (R6)
- [ ] Write `agents/agent-launch.ts` — a `launchAgentProfile` taking
      `profileId` plus optional `workspaceId` / `cwd`: create the record with its
      `profileId`, register the pending launch, and spawn **only** for the
      background case where no panel will mount — decided by comparing the target
      workspace to the active one. It must not spawn as a side effect of being
      called. No phase-1 surface reaches the background branch; it exists for
      phase 2's CLI and phase 5's API, and is covered by unit test only. (R6)
- [ ] Resolve the launch line from the profile at **drain** time, not click time;
      a profile deleted in between drains to nothing. (R6)
- [ ] Drain in `terminal-service.ts`'s `ensureSession` once the session resolves. (R6)
- [ ] Drain in `TerminalPanel.tsx` at the existing
      `setLifecycle({ kind: "ready", … })` point, replacing the deleted `kind`
      shim. The view reports readiness; it no longer decides what to type. (R6)
- [ ] Call `discardPendingLaunch` wherever a terminal record is removed
      (`removeTerminal`, `reapWorkspaceTerminals`). (R6)
- [ ] **Fix the terminal-identity gap:** change `ensureSession` to spawn through
      `spawnTerminalSession` (passing the terminal id) instead of the public
      `getProcessService().spawn`, so the session is stamped with
      `SILO_TERMINAL_ID`. This also repairs the pre-existing gap for a tab whose
      PTY came up via `sendText` on a never-shown tab. (R7)
- [ ] Add the bounded `command not found` output scan; on a hit, push the notice
      with an "Edit profile…" action and mark the profile `broken`. (R15)

## 5. Terminal record and `TerminalKind`

- [ ] Add `TerminalRecord.profileId?: string` to
      `packages/sdk/src/domain-types.ts`, `@public`, with TSDoc noting it is
      written at launch and first read by resume composition. (R8)
- [ ] Mark `TerminalKind`'s `"claude"` and `"pi"` values `@deprecated`, naming
      Agent Profiles as the replacement; keep the type and both `kind` fields. (R9)
- [ ] Mark `AgentInfo.kind` `@deprecated`, noting it is always `"shell"` after
      normalization and pointing at `agentId`. (R9)
- [ ] Give `addTerminal` an options bag (`{ profileId? }`) and drop the
      kind-derived title branch. Do **not** seed the profile label as the title —
      `TerminalPanel` overwrites it within a second. (R8)
- [ ] Map `ctx.terminals.create({ kind: "claude" | "pi" })` to a `"shell"`
      terminal that launches a matching profile if one exists, else types the bare
      command. **No profile record is written.** (R9)
- [ ] Normalize persisted `kind: "claude" | "pi"` records to `"shell"` at
      hydration, without synthesizing a `profileId`. (R9)

## 6. Icons and `ctx.agents.catalog()`

- [ ] Move `agent-icons.ts` from `packages/extensions-silo/src/agents/` to
      `packages/extension-host/src/extension-host/agents/`, carrying its tests. (R17)
- [ ] Add `AgentIcon` and `CatalogAgentSummary` to
      `packages/sdk/src/agents-service.ts` and `AgentsService.catalog()`;
      re-export from the SDK barrel. (R17)
- [ ] Implement `catalog()` in `agents/agents-service.ts` returning the memoized
      frozen summaries from group 2. (R17)
- [ ] Move `AgentIconGlyph` into `packages/sdk/src/AgentIconGlyph.tsx`, taking an
      `AgentIcon` prop instead of an `agentId`; re-export from the barrel. (R17)
- [ ] Move its mode union to the SDK as `AgentIconMode` and point
      `silo.agents`' `settings-store.ts` `IconMode` at it, so the public
      component is not typed against a private union. (R17)
- [ ] Point `silo.agents` at `ctx.agents.catalog()` + the SDK glyph and delete its
      local icon module and component. Confirm the Agents panel and terminal tab
      icons are visually unchanged. (R17)

### Docs-sync for the new public surface (R17, R19)

- [ ] TSDoc with `@public` / `@category` on `catalog()`, `AgentIcon`,
      `CatalogAgentSummary`, and `AgentIconGlyph`.
- [ ] Barrel re-exports from `packages/sdk/src/index.ts`.
- [ ] Hand-authored member documentation in `apps/docs/api/agents/`.
- [ ] `pnpm docs:api` regenerated and committed.
- [ ] Roadmap row for `ctx.agents.catalog()` with the right badge.
- [ ] Context7 indexing contract (`context7.json`) checked for impact.

## 7. Settings → Agents

### Tabs

- [ ] Rename the **Hooks** tab to **Sessions** in
      `packages/extensions-core/src/agents-settings/index.tsx`. (R18)
- [ ] Add the **Profiles** tab as the first tab and the page's default. (R13, R12)

### The list

- [ ] `AgentsProfilesPanel.tsx` — the `List` / `ListRow` / `AddRow` shell,
      subscribed to the profile slice. (R13)
- [ ] `ProfileRow.tsx` — label, resolved command in monospace, agent icon and
      name, config directory, broken marker. (R13)
- [ ] Row `⋮` menu: Edit, Duplicate, Move up, Move down, Delete — keyboard
      reachable, no drag dependency. (R13)
- [ ] Delete behind a confirmation, applying the R8 reference cleanup. (R13)
- [ ] `Best-effort resume` badge for a profile whose agent has no installed hook,
      navigating to the **Sessions** tab. (R13)

### Found on this machine

- [ ] `FoundOnThisMachine.tsx` — cards driven by `scanInstalledAgents()`, run on
      tab mount and on explicit refresh. (R12)
- [ ] One-click add writes a profile (`label` = display name, `command` = leader
      name, `assumedAgentId` = catalog id) and nothing before the click. (R12)
- [ ] Cards disappear as profiles for their agent appear; the section disappears
      when empty, leaving the honest empty state. (R12)

### The editor

- [ ] `ProfileEditorModal.tsx` shell — host `<Modal>` with kit fields and actions. (R14)
- [ ] Label → id prefill that stops tracking once the user edits the id. (R14)
- [ ] Inline validation: empty label/command, id shape, id collision (excluding
      self). (R1, R14)
- [ ] Agent `Select`, and the three-state config-directory visibility rule
      (declared / not declared / no agent resolved). (R3, R14)
- [ ] Clear a stored `configDir` when the agent changes to one with no
      `configDirEnvVar`, and tell the user. (R3)
- [ ] **Recheck** action plus the last-checked display from `resolvedAt`. (R4, R14)
- [ ] Launch-line preview with a Copy button. (R5, R14)
- [ ] On save: expand `~`, stat the config directory, prompt to create it when
      missing. (R14)
- [ ] Cancel discards every edit including a Recheck result. (R14)

### Plumbing

- [ ] Add the internal-barrel exports listed in `design.md` → "Internal barrel
      additions", each with the comment the barrel's convention expects. Do
      **not** add a catalog accessor — core reads `ctx.agents.catalog()`. (R13, R17)
- [ ] Any new CSS uses design tokens only — no hard-coded colours, fonts, or px
      sizes. (ADR 0017)

## 8. Menus

- [ ] `GroupAddMenu.tsx`: render profiles flat after "New Terminal", with icons,
      in stored order. (R10)
- [ ] `GroupAddMenu.tsx`: resolve the target folder through `pickWorkspaceFolder`
      exactly as "New Terminal" does; a dismissed chooser creates nothing. (R10)
- [ ] `GroupAddMenu.tsx`: short-circuit a `broken` profile — notice with "Edit
      profile…", no terminal opened. (R10, R15)
- [ ] `GroupAddMenu.tsx`: a profile deleted between menu open and click creates no
      terminal and raises no error dialog. (R10)
- [ ] `GroupAddMenu.tsx`: with zero profiles, render the single "Add an agent
      profile…" entry that calls `openSettings("agents")`. (R12)
- [ ] `TerminalPanel.tsx`: add `"<label> here"` rows beside "New Terminal Here" on
      the **body** context menu, launching against the live foreground cwd; add
      nothing when there are no profiles; leave `getTabMenuItems` untouched. (R11)

## 9. Documentation

- [ ] `docs/domain-language.md`: add **Agent Profile**, including the asserted
      `assumedAgentId` vs. observed `agentId` distinction; rewrite the "Terminal
      Kind vs Catalog Agent" entry so Profile is the launch vocabulary and Catalog
      Agent is the identity vocabulary. Run the `silo-domain-modeling` workflow.
      (R9, R16, R19)
- [ ] `docs/adding-a-coding-agent.md`: add the `configDirEnvVar` recon step,
      including the "does it move the credentials too" test. (R3, R19)
- [ ] `apps/docs/roadmap.md`: row for Agent Profiles with an accurate badge. (R19)
- [ ] Update guide prose describing how an agent is started, and the
      Hooks→Sessions rename. (R18)

## 10. Tests

Written alongside the code in each group above, not batched at the end. Listed
here so the coverage bar is explicit (see `design.md` → Testing strategy).

- [ ] `agent-profile-model.test.ts` — slugify, validation (including
      self-collision on edit), POSIX quoting, tilde expansion, launch-line
      building, `parseTypeOutput` across bash/zsh phrasings, fallback matching
      (`pi`, `pip`, `copilot`/`pilot`).
- [ ] Persisted-index load/normalize tests — malformed entries, duplicate ids,
      absent key, terminal-kind normalization.
- [ ] `agent-profiles.test.ts` — CRUD, reorder, the rename sweep across two
      workspaces, delete clearing `profileId`.
- [ ] `pending-launch.test.ts` — take after request returns it; the second take
      returns `null`; discard makes a later take return `null`; two terminals are
      independent; nothing about the registry reaches persistence.
- [ ] `agent-launch.test.ts` — record carries `profileId` and no seeded title; a
      foreground launch spawns **no** PTY; the background path does; the launch
      line is written exactly once under both drain orderings; nothing is written
      when the profile was deleted or the record removed before the drain; a
      launch targeting a **non-active** workspace spawns and drains on its own
      (the background branch, which no phase-1 UI reaches).
- [ ] Terminal-identity regression — the tab lazy-spawn path calls
      `spawnTerminalSession` with the terminal id, never the public `spawn`.
- [ ] `agent-profile-probe.test.ts` — exact argv, non-zero exit → `broken`,
      timeout → unresolved-not-broken, config-dir conflict warning.
- [ ] `agent-installed-scan.test.ts` — exact argv uses `sh -c`, never the
      interactive shell; hits map to catalog ids.
- [ ] Catalog tests — `configDirEnvVar` set for exactly the four agents and
      undefined for the other three; `catalog()` returns the same frozen
      reference across calls.

## 11. Verification

- [ ] Every requirement in `requirements.md` is met or explicitly noted as not.
- [ ] Runtime check with `verifier-gui`: `+` menu ordering and icons; add a
      profile from a "Found on this machine" card in one click; launch it and
      confirm **exactly one** PTY appears in Output → Terminals; launch a second
      profile differing only by `configDir` and confirm the two accounts are
      separate; `echo $SILO_TERMINAL_ID` in a
      profile-launched terminal prints that tab's id; a broken profile is refused
      with a notice and opens no terminal.
- [ ] `pnpm test`, `pnpm --filter silo exec tsc --noEmit`, and `pnpm lint` pass.
- [ ] `pnpm --filter @silo-code/docs test` passes (the proposals-index sync check).
- [ ] Durable decisions recorded as ADRs — candidates: the pending-launch
      intent-registry as the general answer to "two authorities, one session", and
      "don't create user data unprompted" as the converse of ADR 0046. Write one
      only if the reasoning outlives this proposal.
- [ ] Proposal collapsed to a single curated `0033-agent-profiles.md`, status
      **`accepted`** (not `implemented`) with the phase table updated — phases 2–9
      remain. Repoint the `docs/proposals/README.md` row at the collapsed file.
