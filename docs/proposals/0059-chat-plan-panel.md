---
status: draft
created: 2026-10-09
---

# 0059. The agent's plan as a pinned panel region

## Summary

Promote the agent's plan from an entry buried in the transcript to a pinned
region above the composer: collapsed to a one-line progress summary by default,
expandable to the full step list, and visible for as long as the plan is live.
Along the way, fix the edge cases the current rendering gets wrong — a
subagent's plan overwriting its parent's, a cleared plan leaving an empty box,
a parsed `priority` that nothing displays — and write down which agents emit
plans at all, and how.

## Motivation

Silo already receives and renders the ACP `plan` update. The problem is where
it lands. `applyUpdate` appends the plan as an ordinary transcript entry at the
position of the first `plan` update and replaces it in place thereafter
(`transcript-model.ts:730`). One plan per session, correctly — but anchored to
wherever the agent first announced it. A long turn pushes it off screen within
seconds, and the one thing it exists to answer — _where is the agent in its
work right now_ — is the thing you have to scroll backwards to find.

The signal is worth more than its current placement. The agent reissues the
whole plan on every change, so Silo always holds the authoritative current
state; it is live progress, not conversation history, and it should be rendered
as the former.

Three defects fall out of the same code path and are worth fixing in the same
change:

- **A subagent's plan overwrites its parent's.** `applyUpdate` matches on
  `e.type === "plan"` alone, with no `subagentId` check — unlike the message
  and tool-call branches, which both scope by it (`transcript-model.ts:614`,
  `:623`). Since RFC 0057 routes delegated updates into the same transcript, a
  subagent that plans its own work silently replaces the plan the user is
  actually watching.
- **A cleared plan renders an empty box.** An agent clearing its plan sends an
  empty `entries` array. The update path only guards the _append_ case
  (`rows.length === 0` returns early); replacing an existing entry with zero
  rows leaves a bordered "PLAN" heading with nothing under it.
- **`priority` is parsed and discarded.** `parsePlanEntries` carries it through
  the SDK and `planRows` forwards it into `PlanRow`, and no renderer reads it.

## Design

**One plan per session, owned by the panel.** The plan stops being a
`TranscriptEntry` and becomes panel-level state, keyed by `subagentId` (with
`undefined` meaning the root session). The transcript keeps its "replace in
place" semantics for free, since there is exactly one current plan per owner.
The root session's plan is the one that pins; a subagent's plan belongs to its
delegation row, not the pinned region.

**The pinned region** sits between the transcript scroller and the composer,
outside the scroller so it does not move. Collapsed by default to a single
line — the step count, the completed count, and the current `in_progress` step
when there is one. Clicking expands it to the full list. State is per session
and remembered for the session's lifetime, so a user who expands it once keeps
it expanded.

The region is present only while a plan is. No plan, an empty plan, or a
cleared plan all render nothing at all — not an empty container.

**Status vocabulary.** `pending`, `in_progress`, `completed` are the three the
protocol names and the three we style. An unknown vendor status renders with
the `pending` treatment rather than being dropped, matching how
`AgentPlanEntry` already documents the field ("or a vendor's own"). `planRows`
keeps defaulting a missing status to `pending`.

**`priority`.** Render it or drop it — this RFC proposes **dropping** it from
`PlanRow`. No agent observed so far sends it, and a priority badge on a list
the agent is already walking in order adds noise, not information. Removing it
from `PlanRow` keeps the panel's model honest; `AgentPlanEntry.priority` stays
on the SDK surface, since the protocol defines it and an extension may want it.

**Chrome, not kit.** The pinned region is panel chrome in the sense ADR 0026
draws the line — it is part of the Chat panel's frame, beside the composer, not
modal or settings content. It stays bespoke and styled via design tokens, as
the current plan block already is. The collapse affordance should use the SDK
`Tooltip` for its hover hint rather than a native `title`.

**Capability documentation.** Which agents emit a plan, and by what mechanism,
is currently undocumented and was non-obvious enough to cost this session
several wrong guesses. `claude-agent-acp` 0.75.1 publishes a plan from two
different tool vocabularies — the current `TaskCreate` / `TaskUpdate` /
`TaskList` tools plus `TaskCreated` / `TaskCompleted` hooks, and the legacy
`TodoWrite` path — and an agent that simply writes a markdown checklist as
assistant text produces no plan update at all, which is indistinguishable from
a broken feature when you are looking at the panel. That belongs in
`docs/adding-a-coding-agent.md` as a per-agent fact, with the ACP-side
mechanism noted in `docs/acp-coverage.md`.

**Tests.** Per `silo-testing`, the logic extracts to pure helpers and is tested
without `@testing-library/react`: plan routing by `subagentId` (root vs.
delegated), the clear-to-empty case, unknown status fallthrough, the collapsed
summary string across zero/some/all-complete and the no-`in_progress` case, and
replace-in-place across successive reissues.

**Domain language.** `docs/domain-language.md` has no entry for the plan. If
the pinned region gets a name of its own, that name goes in the glossary in the
same change.

## Alternatives considered

**Leave it in the transcript, auto-scroll to it.** Cheaper, but it fights the
user's scroll position and still loses the plan whenever they scroll away
deliberately. The plan is not a moment in the conversation.

**Pin it to the top of the panel.** Symmetric with the breadcrumb, but it
competes with the workspace path and sits furthest from where the user's
attention is during a turn — the bottom, where output streams in and the
composer lives.

**A dedicated dock panel.** Over-built for a list that is usually four lines
long, and it separates the plan from the session it belongs to, which is
exactly wrong once several Chat tabs are open.

**Expanded by default.** Rejected as the default because most plans are short
and most of the time the summary line is enough; a plan that expands on its own
steals vertical space from the transcript on every turn. The expand state is
sticky, so a user who disagrees pays the cost once.

## Decision

_Pending._
