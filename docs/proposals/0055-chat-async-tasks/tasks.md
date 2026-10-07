# Tasks — 0055. Delegated work in a Chat session

The implementation plan for the proposal's single implicit phase. Ordered —
the parser and the public surface come before anything that renders them.
Working artifact — removed when the proposal collapses.

## Before starting

- [ ] Confirm the two resolutions in `design.md` → "Two decisions this proposal
      left open" with Dave. They change what gets built.
      **Implemented to both as written, pending Dave's sign-off** (2026-10-07).
      Not blocked on the answer: each alternative is localized — the liveness
      rule is one predicate in `delegatedDispatchNotice`, and relocation is
      the option `design.md` already shows corrupts `groupTurns`' contiguous-
      slice invariant. Flagged in the implementation report.

## Parsing — the vendor quarantine

- [x] Add `packages/extension-host/src/extension-host/agents/chat-delegated-work.ts`
      with `DelegatedWorkFacts` and `delegatedWorkFacts(update)`, using the
      same `isRecord` / `str` guard style as `acp-update-model.ts`.
- [x] Document in its module header that this is the one place
      `_meta.claudeCode` is read for delegated work, and that the fields it
      reads are versioned by nothing.
- [x] Call it from `parseToolCall` (`acp-update-model.ts:106`) and spread the
      facts in with the existing omit-when-absent rule.

## Public surface

- [x] Add `subagent`, `handedOff`, and `parentToolCallId` to `AgentToolCall`
      (`packages/sdk/src/agents-service.ts:750`), each with TSDoc stating what
      it means and that it is a durable fact about one frame, never revised.
- [x] State in the TSDoc why liveness is **not** a field, so a future reader
      doesn't add one.
- [x] Confirm the barrel (`packages/sdk/src/index.ts`) needs no change —
      `AgentToolCall` is already exported, so the fields ride along.

## Transcript model

- [x] Add the three fields to `ToolEntry` (`transcript-model.ts:63`).
- [x] Accumulate them in `applyUpdate`'s patch branch with `?? prev.…`, so
      frames 12 / 19 / 20 add up to one correct row.
- [x] Carry them on the append branch too (the "update for a call whose
      `tool_call` never arrived" path).
- [x] Add the clause to `foldToolRuns` that breaks a run on a dispatch or a
      delegated call.
- [x] Comment `closeDanglingTools` to record that a handed-off row is already
      `completed` and deliberately untouched.
- [x] Extract the aggregate count as a pure function over
      `(entries, activity)` — not inline in the panel.

## Rendering

- [x] Render a `subagent` dispatch as `Agent(<title>)`, with Silo's agent glyph
      and no kind label (the agents probed all report a dispatch as `"think"`).
- [x] Give `handedOff` its own row treatment, as a third state alongside
      running and settled — do **not** widen `isRunning`
      (`AcpChatPanel.tsx:607`).
- [x] Indent a delegated call and label it with its dispatch; fall back to
      ordinary rendering when the dispatch is not in the transcript.
- [x] **Added on Dave's review of the running app, 2026-10-07** — see
      `design.md` → "Two decisions this proposal left open" #2 for why the
      original resolution was wrong. Gather a dispatch's calls _under_ it per
      turn (`groupDelegatedCalls` → `DelegatedGroupEntry`), presented like a
      tool-call group: caret header, members disclosed, last
      `TOOL_GROUP_INLINE_COUNT` inline. In-place rendering stays as the
      cross-turn fallback.
- [x] Show the delegated-call count on the dispatch row — **narrowed** to the
      case where the calls are _not_ gathered beneath it (a later turn, or a
      mid-delegation replay); beside visible rows it was just noise.
- [x] Add the aggregate line in the panel chrome. **Reworded 2026-10-07** to
      `N background agent(s) dispatched`, ungated: the liveness rule made it
      flicker off while subagents were still working, and "waiting to finish"
      promised a countdown that cannot happen. Scoped to the current exchange,
      static agent glyph instead of a spinner, caveat in the tooltip. See the
      proposal's "Revised after the capability spike".
- [x] Style all of it with design tokens only; use the SDK `Tooltip` for any
      hover hint.

## Tests

- [x] `chat-delegated-work.test.ts` — recognised shapes driven from the
      committed capture frames, plus the whole malformed-shape table in
      `design.md` → "Error handling".
- [x] `acp-update-model.test.ts` — the three fields surface, and each is
      omitted when the wire did not carry it.
- [x] `transcript-model.test.ts` — frames 12 → 16 → 19 → 20 accumulate into one
      row that is `subagent` + `handedOff` and not settled.
- [x] `transcript-model.test.ts` — `parentToolCallId` attribution survives a
      turn boundary; `foldToolRuns` breaks on both new cases;
      `closeDanglingTools` leaves a handed-off row alone.
- [x] Aggregate-count tests — both turn regimes, zero/one/many, idle clears.
- [x] Journal-replay test: seeding from the captured frames reproduces the same
      `ToolEntry` facts as applying them live.

## Documentation (`silo-docs-sync` — same change, not a follow-up)

- [x] `@public` / `@beta` / `@category Consumer Services` tags consistent with
      the rest of `AgentToolCall`.
- [x] Describe the delegated-work fields on `apps/docs/api/agents/sessions.md`.
- [x] Update the roadmap's Chat-sessions row (`apps/docs/roadmap.md:31`) to name
      the new modelled fields and link RFC 0055.
- [x] Run `pnpm docs:api` and commit the regenerated reference.
- [x] Add the term this change introduces to `docs/domain-language.md`, or
      record explicitly that it introduces none.

## Verification

- [x] Every requirement in `requirements.md` is met or explicitly noted as not.
      R1–R6 checked at the code and test level, and the on-screen halves of
      R1/R2/R3/R4 confirmed in the dev app (2026-10-07).
- [x] `pnpm test`, `pnpm --filter silo exec tsc --noEmit`, and `pnpm lint` pass.
- [x] Runtime check in the dev app against a real delegated session (the
      `verifier-gui` skill), not tests alone — the point of the change is what
      the row says on screen. **Done 2026-10-07**, sandbox workspace on a
      throwaway haiku-pinned profile against `claude-agent-acp@0.75.1`. Two
      live background dispatches: the row read `Agent(<description>)` with a
      _handed off_ badge (never a completion) while the vendor's own status was
      `completed`; each subagent's `Bash` call rendered indented and attributed
      to its dispatch; the dispatch carried its delegated-call count; and the
      aggregate line read "Waiting for 1 background agent to finish", then
      "…2 background agents…" with both outstanding, and cleared when the host
      reported the session idle.
- [ ] Decide whether the stability caveat warrants an ADR, or whether the
      collapsed proposal is the right home for it. The capability spike
      (2026-10-07) strengthens the case: three documented claims about the
      adapter turned out wrong when run, which is itself the argument for
      treating this whole surface as unversioned.
- [ ] Re-run `subagent-capability-2026-10-07.mjs` when the adapter or `claude`
      CLI moves, and with `PROBE_OPT_IN=air` (not yet run). "No finish signal"
      is the premise the aggregate's wording rests on.
- [ ] Collapse to a single curated `docs/proposals/0055-chat-async-tasks.md`
      with `status: implemented`, delete `requirements.md` / `design.md` /
      `tasks.md`, and repoint the index row in `docs/proposals/README.md`.
