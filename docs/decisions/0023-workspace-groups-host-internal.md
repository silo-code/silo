---
status: accepted
date: 2026-06-30
---

# 0023. Workspace panel groups are host-internal, not public `ctx.workspaces`

## Context

The Workspaces panel gained **groups**: named, collapsible, optionally-colored
groupings of workspace rows that a user can create, reorder, recolor, and drag
workspaces into and out of. Groups are purely organizational — they do not affect
workspace activation, lifecycle, or any persisted workspace data beyond display
ordering.

This created a surface question. Workspace *lifecycle* operations (create, rename,
reorder, activate, close, delete) are part of the public `WorkspaceService`
contract on `ctx.workspaces` in `@silo-code/sdk`, callable by any extension. The
group CRUD/reorder operations, by contrast, are imported by the bundled
`core.workspaces` extension straight from the privileged
`@silo-code/extension-host/internal` barrel. So two sets of mutations that both
live in the same panel reach the store through different channels.

The repo's standing rule is "if an extension needs a capability the SDK lacks,
add it to `ctx`" (see CLAUDE.md, ADR 0004). Taken naively that argues for
promoting groups to the public service. But ADR 0007's core-primitive test asks
whether a capability is a *platform primitive third parties build on* or a
*first-party feature*. Group layout is the latter: it is the `core.workspaces`
panel organizing its own presentation. No third-party or `silo.*` extension has a
reason to create or reorder another extension's panel groupings, and `core.*`
already has legitimate access to the internal barrel (ADR 0013).

## Decision

Workspace panel groups stay a **host-internal, `core.*`-only** concern. Group
state (`AppState.groups` / `groupOrder`) and its mutators (`createGroup`,
`renameGroup`, `deleteGroup`, `setGroupColor`, `reorderGroups`,
`moveWorkspaceToGroup`, `removeWorkspaceFromGroup`, `reorderWorkspaceInGroup`,
`toggleGroupCollapsed`) plus the derived lookups (`groupIdForWorkspace`,
`workspaceGroupMap`) are exported from `@silo-code/extension-host/internal` and
consumed only by `core.workspaces`. They are **not** added to the public
`WorkspaceService` and carry no SDK docs or roadmap entry.

Group membership is single-sourced on each group's `workspaceOrder`; the
workspace→group reverse map is derived, never stored or persisted.

This is recorded as a deliberate exception to the "expose via `ctx`" default so it
is not later mistaken for an oversight.

## Consequences

- **Easier:** no public API surface to freeze, document, or version for a feature
  with exactly one (first-party) consumer; the group mutator set can evolve freely
  as the drag-and-drop work lands.
- **Easier:** keeps `WorkspaceService` focused on workspace *lifecycle* — the thing
  extensions actually integrate with — rather than panel-presentation details.
- **Harder / accepted:** the two mutation channels in `core.workspaces` remain
  asymmetric (lifecycle via `ctx.workspaces`, layout via the internal barrel). This
  is intentional and now documented rather than a smell to "fix."
- **Reversible:** if a real third-party need for programmatic grouping appears,
  promoting the existing mutators onto `ctx.workspaces` (with TSDoc, docs pages,
  and a roadmap flip) is additive and non-breaking. A superseding ADR would record
  the change.

## Alternatives considered

- **Promote to public `ctx.workspaces`.** Consistent with the "add it to `ctx`"
  default and the open-source surface bar, but commits us to maintaining a public
  group API for a feature no extension outside `core.workspaces` consumes.
  **Rejected for now** as premature surface; explicitly reversible above.
- **Defer until after the drag work.** Leave the channel undocumented until the
  mutator set stabilizes. **Rejected** because the asymmetry is already visible and
  cheap to explain now; deferring just leaves a re-litigation hazard in the
  meantime.

## References

- ADR 0004 — public `@silo-code/sdk` is types-first
- ADR 0007 — core-primitive vs extension-feature test
- ADR 0013 — extension trust tiers + two-barrel SDK (the `…/internal` surface)
- Code: `packages/extension-host/src/state/workspaces.ts` (group state + derivations),
  `packages/extension-host/src/extension-host/sdk-internal.ts` (internal exports),
  `packages/extensions-core/src/workspaces/` (sole consumer)
