---
status: draft # draft | accepted | implemented | rejected | superseded-by NNNN
created: 2026-08-30
---

# 0031. Tasks extension — Silo-managed tasks, with third-party trackers as sources

## Summary

A `silo.tasks` extension that gives Silo **task management out of the box** —
tasks stored and owned by Silo, at a global level and per workspace, with no
external tracker required and nothing written into a repo. Third-party trackers
(Beads, dex, later Backlog.md / Linear / GitHub Issues) are supported
**additively** as extra sources in a workspace, not as a prerequisite. Two
surfaces: a workspace-scoped side panel for scanning and drilling in, and a
cross-workspace Navigator view whose rows open a fuller **Tasks app** in a dock
sheet. The extension lives in the external `silo-extensions` repo and consumes
Silo only through the public SDK.

## Motivation

Silo's audience keeps many projects alive at once and drives them with coding
agents. The work itself — what to do next, what's blocked, what an agent should
pick up — has no home in the app today. It lives in a terminal, a scratch file,
or someone else's tracker in a browser tab.

A survey of twelve comparable tools (Conductor, Superset, Orca, Vibe Kanban,
Emdash, Pane, JetBrains, GitLens, VS Code's GitHub Issues, Kiro, Backlog.md,
Beads) found that **not one ships a task manager that works with no tracker
installed and no agent running**:

- The parallel-worktree orchestrators use "task" as a synonym for "agent
  session." Their task list is a session dashboard — it has no rows before an
  agent exists and none after the branch merges.
- The editor integrations have real task semantics but are panels over
  someone else's tracker, so they need you to already run one.
- The only tools that store a task of their own are CLIs with no GUI, or
  in-repo formats that write files into a repo you may not own.

That last constraint matters for Silo specifically. Both credible in-repo
trackers modify the repository to get started: `bd init` writes an `AGENTS.md`,
installs git hooks, **and makes a git commit**; `backlog init` writes an
`AGENTS.md` and a config file. Neither is appropriate to run in a repo you're
only reading, and neither should ever be triggered on a user's behalf.

So the opening is a task manager that is useful the moment it's installed,
stores nothing in the repo unless asked, and treats external trackers as an
upgrade rather than an entry requirement.

The complementary opportunity is Silo-specific: **JetBrains' "Open Task"** —
which restores tabs, bookmarks, and breakpoints for a task — is the most-loved
pattern in the field and requires an explicit save/restore step. Silo's
workspaces never tear down, so binding a task to one is nearly free. That
differentiator is already built and has nothing pointing at it. This proposal
does not implement it (see Non-goals), but it is the reason the architecture
keeps a task's workspace association derivable.

## Design

### Core concept: the Task Source

A **Task Source** is one resolved store of tasks. Everything else hangs off it.

A source is identified by its location, and is one of:

- **Silo-managed** — a file Silo owns, outside any repo. One **global** source
  (the always-present personal list) and optionally one per workspace.
- **Repo-derived** — a third-party tracker detected in a workspace's folder.

The provider (Silo, Beads, dex) is an implementation detail _of_ a source. Two
Silo workspaces that are worktrees of the same repository resolve to the **same**
source — verified: all worktrees share the main repository's `.beads` workspace,
and `bd where --json` returns that path as a dedupe key.

Vocabulary note: Beads calls its own unit a "beads workspace." That term must
not reach the UI — it collides with Silo's Workspace. `docs/domain-language.md`
gains **Task**, **Task Source**, and **Ready**, and pins Task to the _intent_,
never to an agent run (six of the twelve tools surveyed use it the other way).

### Providers are additive, per workspace

Detection produces **candidates**; the user enables them. A workspace may have
any number of sources enabled at once.

- Cheap probe per workspace folder: `.beads/` → Beads · `.dex/tasks.jsonl` → dex
  · (later) `backlog/config.yml` → Backlog.md.
- **Detected but not enabled** shows as a dismissible offer row in the panel —
  _"This repo uses Beads — [Show tasks] [Not now]"_ — one click to enable,
  dismissible forever, always re-enableable from workspace properties. Not
  silent auto-enable, and not buried in settings.
- A **"New tasks go to"** setting per workspace names the default create target.
  When that source is disabled or disappears it falls back to **Silo**, which is
  guaranteed present. Quick-add shows the destination, with a one-off override
  that doesn't change the default.
- Disabling a source hides it but never deletes it. Workspace properties keeps
  showing _"Beads — disabled, 12 tasks"_ so it stays recoverable.

Silo **never** initialises a third-party tracker. Where a tracker is absent, the
UI names the command to run; it does not offer a button that runs it.

### The Silo provider is the richest one

Silo-managed storage is the default and the product; every third-party provider
is a subset of it. New task capabilities land in Silo first and other providers
simply lack them (dex has no labels and no assignees; Backlog.md has
user-configurable status strings; Beads has a dependency graph none of the
others match).

**Storage**: newline-delimited JSON, one task per line, at a Silo-owned path —
`<extension storage dir>/tasks/global.jsonl` and `.../ws-<id>.jsonl`. A plain
file, not a blob inside app state, so it is greppable, backup-able, exportable,
and can be pointed at by an agent with one line in `AGENTS.md` until the Silo
CLI lands. The schema is Silo's own and documented; **interop is export, not
adoption** (see Alternatives).

This needs a per-extension storage directory, which the SDK does not have —
see [RFC 0032](./0032-ctx-extension-storage-directory.md).

### The normalized model: LCD core, provider-rendered detail

The core schema holds **only what the list sorts, filters, groups, or lays out
by**:

```
id · sourceId · title · lane · statusLabel · rank · parentId ·
labels · assignees · updatedAt
```

`lane` is the closed set `todo | in_progress | blocked | done` that every
provider maps into; `statusLabel` carries the provider's own word so nothing is
lost in display. Description, due dates, dependencies, milestones, acceptance
criteria and comments are **not** in core.

Everything beyond core is returned by the provider as **typed detail section
descriptors** — `{kind: "text"}`, `{kind: "field", label, value}`,
`{kind: "taskLinks", label, ids}` — which the core renders generically. Beads
contributes its dependency sections, Silo contributes acceptance criteria, and
the core knows about neither. Descriptors are plain data, not React, so they stay
serializable and unit-testable.

**No capability flags.** The PRD this supersedes proposed nine booleans; none are
needed:

- _Data_ capabilities are expressible in the data — dex returns `labels: []`,
  GitHub returns `parentId: null`.
- _Action_ capabilities are expressed by **optional methods** on the provider
  interface (`createTask?`, `closeTask?`, `assign?`). `if (provider.closeTask)`
  is type-safe and cannot drift out of sync with reality.

The health check for the whole abstraction: **`if (source.providerId === "…")`
must never appear in a view component** — including `"silo"`. Silo's extra
fields flow through the same descriptor channel as everyone else's.

### Surfaces

**Workspace side panel** — scoped to the active workspace. Actions row
(`Group by ▾`, `Filter ▾`, refresh, new) above an inline `SearchInput`, per
`docs/side-panel-design.md`. Rows are one line: **status glyph · title ·
priority**. Selecting a row **replaces the page** with a drill-in detail — quiet
accent `‹ Back` caret, secondary tools right-aligned on the Back row, primary
action on the title row, `Escape` pops one page.

**Navigator view** — cross-workspace, glanceable. Same row plus a **workspace**
label. No inline search: the Navigator hosts many views and a permanent search
field in one of them is chrome the others pay for. Closed workspaces are
excluded (`WorkspaceState.open` gives this for free); the global Silo source is
exempt, belonging to no workspace.

**The Tasks app sheet** — selecting a Navigator row opens
`ctx.layout.openPanelSheet("navigator", …)` **already drilled into that task**,
with `‹ Tasks` returning to the app root: a wider table (checkbox, glyph, ID,
title, labels, assignee, due, priority) with sortable columns, search, and the
editing surface. Batch selection is framed here for the phase-3 move operation.
The sheet is non-modal by contract — no scrim, `Escape` does nothing, the
workbench stays live. Note that `openPanelSheet`'s `render` is **captured once at
open** and does not re-render with the panel, so the app owns its own
subscription.

Grouping is a **toolbar control**, not separate views — ADR
[0038](../decisions/0038-navigator-view-list.md)'s precedent from agent-monitor.
Defaults: `None` in the panel, `Status` in the Navigator.

### Row vocabulary

- **Status** is a glyph, not a section header: hollow ring (ready), half-filled
  (in progress), struck ring (blocked), filled check (done, row struck through
  and muted).
- **Priority** is an arrow — up for high (the only one that takes color), down
  for low, a dash for normal.
- **No ID at the top level.** The title is what you scan; the ID survives in the
  tooltip, the detail, and the app table. This also hides dex's unspeakable
  nanoid IDs (`x3fxcqjr`) on the surfaces where they read worst.
- **Provenance is hidden; the locator is shown.** Which _provider_ a task came
  from is configuration-time information and appears only in detail. Which
  _workspace_ it belongs to is a navigation destination — clicking activates it
  — and appears in the Navigator row. These are different columns and only the
  first is suppressed.

The workspace label is **derived**, never a stored field. Locators are facts
about where a source currently lives; storing a Silo-local, deletable,
worktree-ambiguous workspace id into task data that may be shared or committed
would persist a pointer to something unstable. Where several workspaces share
one source, the label is the source's name.

### Refresh

The provider is authoritative; cached task state is disposable. Resolution
(`bd where`) is cached per folder and re-probed only on workspace/folder change —
detection is the expensive part, listing is cheap (`bd list --json` ≈ 0.4s,
`dex list --json` ≈ 0.2s). Last-known lists persist in extension storage for
instant paint, then refresh. Phase 1 refreshes on view open/focus plus manual;
`ctx.files.watch` on a source's directory replaces polling in phase 2 — it is the
only way to see an agent's `bd close` promptly, and costs nothing at idle.

Deduping by source is the largest single win: five worktrees of one repo are
**one** `bd list`, not five.

### Where it lives

`silo-extensions`, as `silo.tasks`, per-package npm, consuming the published
`@silo-code/sdk`. It declares `process` (running a tracker CLI with a cwd outside
the active workspace) and `fs:read` + `fs:write` (its own storage directory).
Not published to the registry until several phases in; installed from GitHub
until then.

### Phases

| Phase     | Scope                                                                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**     | Silo provider only — global + per-workspace lists, side panel, list with filter/sort, drill-in detail, create/edit/complete. No provider UI at all, because there is nothing to choose.     |
| **2**     | Beads **and** dex together. Detection offers, per-workspace enablement, "new tasks go to", the Navigator view and Tasks app sheet, provider-rendered detail sections, file-watched refresh. |
| **3**     | Writes across providers; move/migrate between sources with its lossy-field warnings and dependency-id remapping.                                                                            |
| **4**     | Decorations — workspace badges, status rows, status bar — all **default off**.                                                                                                              |
| **Later** | Backlog.md, Linear, GitHub Issues; Silo CLI for agent access; Start Task.                                                                                                                   |

Phase 2 pairs Beads and dex deliberately: they are maximally different
(subprocess + Dolt + rich dependency graph vs. a plain file with no labels and no
assignees), and with Silo as a superset that gives one provider _richer_ than the
core schema and one _poorer_ — the actual test of whether the LCD line is drawn
correctly. dex is nearly free, being a file reader with no CLI dependency.

Phases 1–3 must stand on their own for a human user; agent integration is
additive, and the extension's usefulness must not depend on the unshipped CLI
work.

## Non-goals

- **Start Task** — deferred until Agent Profiles make the flow obvious. Noted as
  a risk: all twelve surveyed tools converge on the task list's job being to
  launch work, and it is what earns a permanent Navigator slot.
- **A published `TasksApi`.** Publishing a typed API before a consumer exists is
  untestable design; commands (`registerCommand` / `executeCommand`) give other
  extensions and agents a driving surface for free.
- **Cross-source dependencies.** A Silo task blocked by a Beads task has no way
  to stay consistent. Sources are independent graphs.
- **A kanban board, calendar, time tracking, team features, cloud sync, an MCP
  server, or a second persistent store of canonical task state.**
- **Multiple folders per workspace.** Detection resolves against the primary
  folder; a workspace whose _second_ folder holds the tracker won't offer it.
  Known limitation, deferred.

## Alternatives considered

**One provider per workspace (exclusive).** Simpler to explain, and switching
would prompt to migrate. Rejected because declining migration leaves tasks that
still exist but are invisible — a data-loss complaint waiting to happen — and it
makes "try dex, don't like it, go back" a scary one-way door. Additive sources
dissolve the problem: nothing ever disappears, and migration becomes optional and
incremental.

**Adopt dex's file format as Silo's native store.** Attractive while Silo storage
was a stopgap: it would mean never inventing a format, and `dex --storage-path`
would drive Silo's own file. Rejected once Silo Tasks became the primary product
— dex has no labels, no assignees, and no due dates, so adopting its schema caps
the product's feature set to preserve a round-trip most users will never perform.
Interop is served by **export** and by the provider model instead.

**A generic `project` taxonomy that workspaces map into.** Would let a global-list
task carry project affinity with no source pointing at it. Rejected as a second
taxonomy for a case labels already cover — labels are in the core schema,
filterable, and cross-source. Revisit if label discipline demonstrably fails in
practice.

**Provider selection by global default with per-workspace inheritance** (the
original PRD's model). Rejected: a task source is a _detection_, not a
preference. Configuration exists to disable what was found, not to select among
hypotheticals, and the single-provider assumption contradicted the goal of
cross-provider aggregation.

**A `TaskProviderCapabilities` flag object.** Rejected — see Design; absence is
expressible in data and optional methods carry the rest.

**Beads-first, Silo storage as a fallback.** The original plan. Reversed because
it makes the extension useless to anyone not already running Beads, and because
`bd init`'s repo modifications make Beads a poor default for repos you don't own.

**Sectioning strictly by status** (the PRD's layout). Softened to a glyph plus a
`Group by` control, so a short list stays flat and a long cross-workspace one
still buckets.

## Decision

_Pending._ Fill in when this leaves `draft`.

## References

- Surface study (interactive): panel drill-in, Navigator view, Tasks app sheet.
- Competitive teardown of task UI across twelve agent orchestrators and editors.
- [RFC 0032](./0032-ctx-extension-storage-directory.md) — the per-extension
  storage directory this depends on.
- [`docs/side-panel-design.md`](../side-panel-design.md) — panel typography,
  toolbar chrome, and the drill-in "Back" contract.
- ADR [0038](../decisions/0038-navigator-view-list.md) /
  [0044](../decisions/0044-navigator-stacked-arrangement.md) — Navigator view
  list, `Group by` as a toolbar control, and why `active` does not throttle in
  stacked mode.
