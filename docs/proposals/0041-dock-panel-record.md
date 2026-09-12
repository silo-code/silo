---
status: accepted # draft | accepted | implemented | rejected | superseded-by NNNN
created: 2026-09-09
---

# 0041. `DockPanelRecord` — one persisted model for every dock panel

## Summary

Editors and terminals are first-class in Silo because each is a **domain
record** on the workspace (`EditorRecord`, `TerminalRecord`) — enumerable,
workspace-scoped, persisted independently of layout, restored on restart. Every
other dock panel — a Chat transcript, the Output panel, a web viewer, any
third-party `DockPanelKind` — exists only as opaque geometry inside the
`ws.dockLayout` blob, plus whatever the panel stuffed into its dockview
`params`. This proposes `DockPanelRecord` as the base type, with `EditorRecord`
and `TerminalRecord` becoming specializations of it, and a
`WorkspaceInternal.panels: DockPanelRecord[]` list with a public
`Workspace.panels` projection. It also adds the small SDK surface that falls out
of having a record: `ctx.panels` (enumeration + tab adornments for the `"panel"`
kind) and `workspaceId` on the RFC 0039 `"panel"` toolbar target.

## Motivation

### What "first-class" actually means today

`WorkspaceInternal` carries `terminals: TerminalRecord[]` and
`editors: EditorRecord[]` as structured, individually addressable state. The
host reconciles those records against `dockLayout` on restore: the records say
_which tabs exist_, `dockLayout` says _where they sit_. That split is why a
terminal tab reopens after a restart even though dockview's serialization is
just a tree of panel ids.

A `DockPanelKind` panel gets none of that. `dock-panel-kinds.ts` wraps the
component, dockview serializes its `params` into `dockLayout`, and that is the
entire persistence story. There is no list of open panels, no per-panel record,
no stable identity beyond the dockview panel id (which is reused and carries no
domain meaning). So a panel cannot be:

- **enumerated** — nothing answers "what Chat panels are open in this
  workspace"; `Workspace.panels` does not exist, and `LayoutState` covers only
  side-panel collapse state.
- **workspace-scoped by a third party** — the RFC 0039 `"panel"` toolbar target
  is `{ panelId, kindId, params }` with no `workspaceId`, and there is no
  `panelId → workspace` lookup in the SDK.
- **adorned through the SDK** — the host-side `tab-adornment-registry` already
  has `"panel"` as a first-class kind and `DockTab` renders it, but only
  `ctx.editors` / `ctx.terminals` expose `TabAdornmentMethods`. There is no
  `ctx.panels`.
- **persisted as domain state** — anything a panel wants to survive a restart
  has to be smuggled through dockview `params`, which is how RFC 0038's Chat
  `sessionId` restore is wired today, and it
  [does not reliably round-trip](../acp-recon.md#the-panel-wiring-is-written-but-not-yet-working).

### The forcing cases

1. **Chat session restore (ACP sprint Session 4).** Persisting
   `{ sessionId, profileId, cwd }` per Chat panel through `api.updateParameters`
   → `ws.dockLayout` was written and typechecked but never worked — the params
   did not carry `sessionId` back on remount. A structured record removes the
   round-trip entirely. RFC 0042 depends on this.
2. **A `follow-ups`-style extension that flags any panel.** With no
   `workspaceId` on the target, no `ctx.panels.bindHighlight`, and no
   enumeration for a Workspaces-panel rollup, a generic "flag this panel"
   feature degrades to a bare toggle button. That is the "add it to `ctx`"
   signal the boundary rules describe, not a gap to route around.
3. **The Chat panel moving back in-tree** (RFC 0038 acceptance criteria). A
   bundled Chat panel that wants parity with the terminal — reopen on restart,
   tab adornments, a workspace rollup — needs the same record the terminal has.

### Why now

The `"panel"` toolbar surface shipped in RFC 0039 and is thin — three in-repo
consumers (`decoration-demo`, `follow-ups` pending, `acp-chat`). Settling the
target shape and the identity model while the blast radius is three extensions
is cheap; doing it after `surface: "panel"` adoption grows means migrating every
consumer. The ACP sprint is also actively adding panel-adjacent shims
(`setAgentSession`, the `panelId ↔ sessionId` translation in
`agent-surface-registry.ts`) — each is a workaround for the missing base model,
and each hardens the longer it ships.

## Design

### The record

```ts
/**
 * The persisted identity + state of one recorded dock panel — a DockPanelKind
 * panel that declared `persistence: "recorded"`.
 *
 * @public
 */
interface DockPanelRecord {
  /** Stable, workspace-unique. NOT the dockview panel id. */
  id: string;
  /** The DockPanelKind id — an extension's kind (`"acp-chat"`, …). */
  kindId: string;
  /** Owning workspace. */
  workspaceId: string;
  /**
   * Panel-kind-defined restore state — serializable, the panel's own contract.
   * A Chat panel keeps `{ sessionId, profileId, cwd }` here (RFC 0042). Handed
   * back to the kind's component as its params when the panel is recreated on
   * restore. The host never inspects it.
   */
  state: Readonly<Record<string, unknown>>;
  createdAt: string;
  lastActiveAt: string;
}
```

**Phase 1 keeps `DockPanelRecord` a standalone type.** `EditorRecord` and
`TerminalRecord` do **not** extend it and are not in `Workspace.panels` — they
keep their own lists and their own shape, and code reading `ws.editors[n].filePath`
is untouched. Making them specializations of the base (so `Workspace.panels`
becomes _every_ dock tab) is the Phase 3 convergence below, taken only if
Phase 1–2 shows the split earning nothing. This is Decision 1.

### Workspace state

```ts
interface WorkspaceInternal {
  editors: EditorRecord[]; // unchanged
  terminals: TerminalRecord[]; // unchanged
  panels: DockPanelRecord[]; // NEW — every OTHER dock panel
  dockLayout: unknown | null; // unchanged — geometry only
}

// public projection
interface Workspace {
  readonly editors: readonly EditorRecord[];
  readonly terminals: readonly TerminalRecord[];
  readonly panels: readonly DockPanelRecord[]; // NEW
}
```

`panels` holds recorded non-editor / non-terminal panels only (Decision 1).
`dockLayout` stays exactly as it is — a geometry tree of panel ids, reconciled
against the record lists on restore, the same reconciliation editors and
terminals already go through. A recorded panel's dockview id is
`${kindId}:${recordId}` — the same `kind:id` shape `editor:` / `terminal:`
panels use.

### `ctx.panels`

```ts
interface PanelsService extends TabAdornmentMethods {
  /** Open panels in the active workspace (all workspaces with a flag). */
  getState(options?: { allWorkspaces?: boolean }): readonly DockPanelInfo[];
  subscribe(listener: () => void): Disposable;
  /** panelId → workspaceId, or null if unknown. */
  workspaceOf(panelId: string): string | null;
}

interface DockPanelInfo {
  id: string; // dockview panel id — the adornment + toolbar target key
  recordId: string; // DockPanelRecord.id
  kindId: string;
  workspaceId: string;
  active: boolean;
}
```

`TabAdornmentMethods` on the `"panel"` kind is a wiring exercise — the host
registry already supports the kind. The binder's `provide(panelId)` is how an
extension learns panel ids it otherwise has no way to know (the same way the
terminal `bindHighlight` binder is handed session ids it discovers).

### The RFC 0039 toolbar target gains `workspaceId`

```ts
interface ToolbarItemContext {
  panel: {
    panelId: string;
    kindId: string;
    workspaceId: string; // NEW
    params: Readonly<Record<string, unknown>>;
  };
}
```

Additive — the host knows the workspace at chrome-render time (each workspace
has its own dockview instance; `WorkspaceDock` passes `workspaceId` down). This
alone unblocks workspace-scoped toolbar actions without the full record.

### Persistence & restore

The record list is the source of truth for _which panels exist_; `dockLayout`
keeps geometry only. On workspace restore:

1. Rehydrate `panels` from the workspace record.
2. Recreate each panel via its `DockPanelKind`, passing
   `DockPanelRecord.state` as the restore payload.
3. Apply `dockLayout` geometry, dropping any panel id with no matching record
   (stale layout) and floating any record with no geometry into a default
   position (new record, older layout) — identical to the editor/terminal path.

A `DockPanelKind` opts into being recorded with `persistence: "recorded"` on
the kind — a transient panel like a picker stays layout-only, exactly as a kind
without `toolbar` stays chrome-less today.

### Phasing

- **Phase 1 (what the ACP sprint needs):** the base type, `Workspace.panels`,
  the record list + reconciliation, `workspaceId` on the toolbar target.
  Editors/terminals adopt the base with no shape change. RFC 0042 builds on
  this.
- **Phase 2 (what extensions need):** `ctx.panels` — enumeration +
  `TabAdornmentMethods` + `workspaceOf`. `follow-ups` migrates to flag panels.
- **Phase 3 (optional convergence):** collapse `editors` / `terminals` /
  `panels` into one list keyed by `kindId`, if Phase 1–2 shows the split
  earning nothing.

## Alternatives considered

- **Keep params-in-`dockLayout` (status quo).** No new types. But no
  enumeration, no third-party scoping, no adornments, and the Chat restore bug
  stays a params round-trip problem instead of disappearing. Rejected — it is
  the reason this RFC exists.
- **A parallel panel registry not unified with editor/terminal.** Ship
  `ctx.panels` + a `PanelRecord` that is _its own_ thing, leave `EditorRecord` /
  `TerminalRecord` alone. Smaller diff, no domain-core churn. But it locks in
  two persistence models forever and makes "treated the same way as editors and
  terminals" permanently an approximation. Deferred at best — if we are going to
  do it, the base belongs under all three.
- **Daemon-owned panel state (like the terminal session-host).** Overkill for
  persistence — the record is a serializable struct, not a live process. The
  daemon question is real for _keeping an agent running_, and that is RFC 0042's
  problem, not this one's.

## Decision

**Accepted 2026-09-09.** Phase 1 is implemented in the same change (ACP sprint
Session 3.11): the `DockPanelRecord` type, `Workspace.panels`,
`DockPanelKind.persistence: "recorded"`, `workspaceId` on the `"panel"` toolbar
target, and the record ⟷ dock-layout reconciliation in `WorkspaceDock`. The
`acp-chat` example declares `persistence: "recorded"` as the first consumer.

The four open questions resolve as follows, checked against the code:

1. **Do `editors` / `terminals` fold into one list now?** **No.** They keep
   their own lists and their own shape; `DockPanelRecord` is a standalone base
   and `Workspace.panels` holds only the recorded panels that are neither. The
   reconciliation in `WorkspaceDock` is already three near-identical loops
   (terminals, editors, and now recorded panels) — that duplication is the
   evidence for or against folding, and it costs little to keep watching it.
   Collapsing the three lists touches `EditorRecord` / `TerminalRecord`
   persistence and every consumer that reads `ws.editors[n].filePath`; doing it
   speculatively, before `ctx.panels` (Phase 2) has shown what a unified
   enumeration API actually wants, is exactly the premature convergence the
   engineering principles warn against. Phase 3, if at all.

2. **`DockPanelRecord.state` — free-form or a registered per-kind schema?**
   **Free-form `Readonly<Record<string, unknown>>`.** The host has no business
   validating a panel's restore payload — it is the panel kind's own contract,
   the same way dockview `params` and `EditorRecord.args` (the diff-provider
   bag) already are. A registered schema is configuration and indirection with
   no current caller: RFC 0042's `ChatPanelState` is the panel's type to keep,
   not the host's to police. The host copies `state` in and hands it back as
   params on restore; it never reads a field.

3. **The name.** **`DockPanelRecord`** / **"Dock Panel Record"**. It sits
   beside the glossary's existing **Panel** (the handle) and **Dock Panel
   Kind** (the class) — the record is one instance of a kind. `PanelRecord`
   collides with the side-panel vocabulary; `ContentPanelRecord` presumes a
   center-dock-only scope the type does not encode. The glossary entry lands in
   this change.

4. **Does `ctx.panels` land in Phase 1 or 2?** **Phase 2.** Phase 1 ships no
   enumeration or adornment API. RFC 0042's restore code reads the record
   through the panel's own `DockPanelProps` (the host passes `record.state` as
   params on recreate) — it does not need `ctx.panels`. Shipping the read API
   now would mean designing `workspaceOf` / `getState` / `TabAdornmentMethods`
   for the `"panel"` kind against a single consumer; `follow-ups` (Phase 2's
   real driver) is what should shape it.

Roadmap: a `Recorded dock panels` row is added as **experimental** (the type +
`Workspace.panels` ship now; `ctx.panels` is later). The glossary gains **Dock
Panel Record**.

## Related

- RFC 0039 — the `"panel"` toolbar surface this extends.
- RFC 0038 — Agent Sessions; the Chat panel is the forcing consumer.
- RFC 0042 — Chat session resurrection; persists into the record this defines.
- RFC 0022 — side-panel tab adornments; the side-dock analogue of the
  center-dock gap here.
