# Tasks — 0037. OMP as a standalone catalog agent

Ordered where dependencies matter. Keep checkboxes current as work proceeds.

Re-scoped after the live recon — see the proposal's **"Correction to the
accepted recon"** and the Decision section. The identity-precedence,
launch-identity, and ambiguous-prefix tasks are **dropped**, not deferred:
OMP's title cannot match `detectPiTitle`, so there is no collision for them to
resolve.

## Recon lock

- [x] Confirm against a live `omp@18.1.10`: OSC 0 title grammar, `tui.titleState`
      default, OSC 9;4 absence and its real setting key, settings file format,
      config home, session storage layout, `--resume` syntax, positional
      prompt staying interactive, and the Bun-wrapped `ps` argv. (R1, R2, R3)
- [x] Record the corrections in `proposal.md`; rewrite `requirements.md`,
      `design.md`, and this file against what was actually observed.

## Template extraction (do first — nothing else should fork it)

- [x] Move `renderPiTrackSessionExtension` and `PiExtensionParams` out of
      `catalog/pi.ts` into `catalog/pi-extension-template.ts`; re-point pi's
      entry and `agent-catalog.ts` at it.
- [x] Add `typeImportSpecifier` (default `"@earendil-works/pi-coding-agent"`)
      and `displayName` (default `"pi"`) for the header prose.
- [x] Confirm pi's generated source is byte-identical — its existing golden
      tests in `agent-catalog.test.ts` must pass unmodified. (R5)

## Detector

- [x] Add `OMP_TITLE_PREFIX` and `detectOmpTitle` to `agent-osc-detectors.ts`:
      `>` idle, braille frame working (`timer: "schedule-agent"`), `!` idle,
      `:` idle, bare `π` idle; `identity: true` on the idle forms;
      `agentId: "omp"` throughout. (R3, R6)
- [x] Document in the detector's comment why `!` maps to idle and why the
      spinner arms the debounce rather than promising an explicit idle. (R3)
- [x] Widen `LEADING_MARKER_RE` so an optional `π ` brand may precede an
      existing marker, plus a branch for OMP's `>`/`!`/`:` separators —
      scoped behind the `π` so an unrelated title starting with `>` is
      untouched. (R3)

## Catalog entry

- [x] Write `catalog/omp.ts` with `buildOmpAgentDefinition(deps)`, mirroring
      pi's factory shape and taking the same `deps`. (R1)
- [x] Fill every field from the proposal's table, including `contract`,
      `upstreamRefs`, `lastVerified`, and
      `verifiedAgainstVersion: "omp@18.1.10"`. No `extraSettingsToggle`. (R1, R6, R8)
- [x] Wire it into `AGENT_CATALOG` **before** `pi`, with a comment naming the
      `pi-coding-agent` marker collision as the reason. (R2)
- [x] Update `AGENT_CATALOG`'s "Order is the detection-dispatch order" comment:
      it also breaks `processArgsMarkers` ties and drives the order of the `+`
      menu, the Settings → Agents rows, and "Found on this machine". (R2)

- [x] Move the shared `deps` type out of `catalog/pi.ts` into
      `catalog/pi-extension-template.ts` as `PiExtensionAgentDeps`. OMP's
      factory originally imported `PiAgentDeps` from `./pi` — a catalog module
      importing a sibling (ADR 0042 decision 2), and a name that claimed OMP's
      dependencies were pi's. Caught in review. (R1)
- [x] Fix the promptDelivery recon count in `docs/adding-a-coding-agent.md`
      ("all seven" → all eight, with `omp` in the `argv` list). (R1)

## Interpreter-wrapped foreground

- [x] Export `isScriptInterpreter` from `agent-catalog.ts`. (R2)
- [x] Use it in `noteForeground`'s branch instead of the inline `=== "node"`;
      rename `resolveNodeWrappedAgent` → `resolveInterpreterWrappedAgent` and
      update its doc comment. (R2)

## Icon and prose surfaces

- [x] Add `AGENT_ICONS.omp` in `agent-icons.ts` with its own hexes and a path
      distinguishable from pi's at 16px. (R7)
- [x] Add `### OMP {#omp}` to `apps/docs/guide/agent-sessions.md`, covering
      `~/.omp/agent/`, `omp --resume`, how OMP is identified on every platform,
      the Windows static `:` working separator, and what `tui.titleState` off
      costs; match `docsUrl`. (R7, R8)
- [x] Update the "works with" lists: `apps/docs/index.md` and
      `apps/website/src/homepage-copy.ts` (copy line, `AgentIconId` union,
      trust-band entry). (R7)
- [x] Draw OMP's marketing mark in `apps/website/src/App.tsx`. Adding the id
      to `AgentIconId` was **not** enough: `AgentIcon` ended in a bare
      `return <OpencodeIcon />`, so OMP silently rendered OpenCode's brand in
      the trust band. Caught in review. Fixed by adding `OmpIcon` (mirroring
      the in-app badge) **and** converting the dispatch to an exhaustive
      `switch`, so the next agent added to the union is a compile error rather
      than another silent mis-brand. (R7)
- [x] Add `"omp"` to the catalog-agent id union in
      `docs/domain-language.md`. (R7)
- [x] Generalize `docs/agent-catalog-manual-checklist.md` to cover both
      pi-extension agents, parameterizing the agent name and config paths.
      (R7)

## Tests

- [x] `agent-osc-detectors.test.ts` — every OMP title form and status; all ten
      spinner frames; label-less forms; non-zero OSC code; `π` not leading.
      (R3)
- [x] `agent-osc-detectors.test.ts` — disjointness asserted **both** ways:
      `detectOmpTitle` is null for pi's title, `detectPiTitle` is null for
      every OMP form. (R3)
- [x] `agent-osc-detectors.test.ts` — `stripAgentStatusMarkers` clears OMP's
      brand + separator, and leaves pi's `π - …` untouched. (R3)
- [x] `catalog/omp.test.ts` — resume command, `configPath`, extension source
      tag and marker, TypeScript syntax validation, no `extraSettingsToggle`.
      (R4, R6)
- [x] `agent-catalog.test.ts` — `agentByProcessArgs("bun …/omp")` → `omp`;
      `agentByProcessArgs("bun …/@oh-my-pi/pi-coding-agent/dist/cli.js")` →
      `omp`, with an assertion that locks OMP ahead of pi in the catalog. (R2)
- [x] `agent-catalog.test.ts` — one assertion per OMP marker, including an
      unscoped path that exercises `oh-my-pi`; otherwise that marker never
      runs and the suite still passes. (R2)
- [x] `agent-catalog.test.ts` — OMP appears in `hookInstallableAgents()`. (R4)
- [x] `agents-service.test.ts` — the interpreter branch fires for a `bun`
      leader and still fires for `node`. (R2)
- [x] `agent-icons.test.ts` — OMP entry present with hexes and a path that
      differs from pi's. (R7)
- [x] Confirm `agent-hook-runtime.test.ts` and the hook-gate tests pass
      **unmodified**. (R4)

## Decision record

- [x] Write ADR 0051: Silo resolves an agent from full argv for any script
      interpreter the catalog recognizes, not `node` alone. Record what the
      live recon retired — the identity-precedence rule accepted before it —
      and why the hook compatibility gate needed no change. Add its row to
      `docs/decisions/README.md`. (R9)

## Manual / live verification

Run in-app 2026-09-06 against the real `~/.omp/agent/`. All passed.

- [x] Install OMP's hook from Settings → Agents; confirm only
      `~/.omp/agent/extensions/silo-track-session.ts` is written and `~/.pi/`
      is untouched. (R4)
- [x] Confirm the extension actually loads under OMP and captures a session
      id. **Settled: it does.** The earlier out-of-app attempt was
      inconclusive because a probe dropped into a throwaway `--profile` and a
      scratch `PI_CODING_AGENT_DIR` was never imported — an artifact of an
      unconfigured agent dir, not a defect. In the real agent dir the
      extension loads, `session_start` fires, and
      `ctx.sessionManager.getSessionId()` returns a real UUIDv7, which the
      capture script writes to `~/.silo/agent-hooks/events.jsonl` tagged
      `omp`. The default `@oh-my-pi/pi-coding-agent` type import is correct
      and needs no change. Note the script is inert outside a Silo terminal by
      design (the `$SILO` hook guard, RFC 0028), which is why no ordinary
      shell can verify this. (R5)
- [x] Run OMP, restart Silo, and confirm the offered `omp --resume <id>`
      resumes the session. (R4)
- [x] Confirm the tab tracks working/idle across a turn with nothing enabled
      by hand, and that an approval prompt reads as idle + attention. (R6)
- [x] With both `omp` and `pi` running in separate terminals at once, confirm
      each keeps its own identity, icon, and resume command. (R3)
- [x] Check the OMP icon by eye at terminal-tab size next to pi's. (R7)
- [x] Toggle `hideAgentStatusGlyphs` both ways and confirm the OMP tab title
      reads correctly in each. (R3)

### One unexplained first-run miss — watch for it

The **first** OMP launch after installing the hook wrote a correct event
(right session id, right pid) that Silo never matched: it sat unmatched in
`events.jsonl` while the terminal ran. Every launch since — including two
fresh ones — matched within seconds, so it did not reproduce and is **not**
a standing defect.

What was ruled out: the extension, the session id, the capture script, the
pid (the event's pid was exactly the live foreground pgid,
`silo → zsh → bun/omp`), and the correlation path itself (appending a line
with that same live pid matched and applied immediately).

The consistent-but-unproven explanation is a startup race: the hook fires
within a second of launch, and if Silo's foreground poll has not yet resolved
`bun` → `omp`, the event finds `currentPgid` still on the shell and
`agentPgid` null. The retry that should catch it —
`scheduleHookCatchupReads()` at 0/500/2000 ms — only fires from
`stickKnownAgentForeground` on `becameAgent`, and for OMP that path is gated
behind an async `ps` round-trip, where pi and Claude are recognized
synchronously by leader name. If this recurs, capture Output → **Agents** at
launch: the `Read N new hook event(s)`, `still unmatched … tracked terminal
pgids`, and `foreground interpreter-wrapped` lines pin the ordering exactly.

## Verification

- [x] Every requirement in `requirements.md` is met or explicitly noted as not.
- [x] `pnpm test`, `pnpm --filter silo exec tsc --noEmit`, and `pnpm lint` pass.
- [x] Durable decision recorded as ADR 0051.
- [ ] Proposal collapsed to a single curated
      `docs/proposals/0037-omp-agent-catalog.md` with `status: implemented`,
      the index row repointed, and the doc-index test green. At collapse, the
      "Correction to the accepted recon" section folds into the narrative —
      the durable record should read as one coherent decision, not a diary.
