# Interface: DockPanelRecord

Defined in: [packages/sdk/src/domain-types.ts:151](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L151)

The persisted identity and restore state of one dock panel — a
[DockPanelKind](DockPanelKind.md) panel that declared `persistence: "recorded"` (RFC
0041).

This is what makes a dock panel first-class the way an editor or a terminal
is: it exists as a workspace-scoped record ([Workspace.panels](Workspace.md#panels)), not
merely as opaque geometry inside the saved dock layout. The record list is
the source of truth for *which* recorded panels a workspace has; the dock
layout keeps only *where* they sit, and the two are reconciled on restore
exactly as editors and terminals already are.

An editor and a terminal are not `DockPanelRecord`s in this release —
[EditorRecord](EditorRecord.md) / [TerminalRecord](TerminalRecord.md) keep their own shape. Folding
the three lists into one is deliberately left for a later phase.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/domain-types.ts:158](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L158)

Stable id, unique within the workspace. This is **not** the transient
dock-view panel id — it survives the panel being closed and reopened from
its record across a restart. For that id, read
[DockPanelRecord.panelId](#panelid).

***

### panelId

```ts
readonly panelId: string;
```

Defined in: [packages/sdk/src/domain-types.ts:175](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L175)

The live dockview panel id of this panel's tab, composed by the host — the
id every panel-targeting API speaks: [PanelService](PanelService.md) tab adornments,
and the `panelId` a `"panel/tab"` context-menu hit or a `"panel"` toolbar
hit carries.

This is the supported bridge from *enumerating* a workspace's panels
([Workspace.panels](Workspace.md#panels)) to *acting* on one. Read it; never compose it.
Its format is host-owned and deliberately unspecified — an extension that
derived it from [DockPanelRecord.id](#id) and
[DockPanelRecord.kindId](#kindid) would break the day the host changed it.

Unlike [DockPanelRecord.id](#id), this is not persisted identity: the host
restamps it whenever the record is loaded, so it always matches the tab
that is on screen now.

***

### kindId

```ts
kindId: string;
```

Defined in: [packages/sdk/src/domain-types.ts:177](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L177)

The [DockPanelKind](DockPanelKind.md) id this panel is an instance of.

***

### workspaceId

```ts
workspaceId: string;
```

Defined in: [packages/sdk/src/domain-types.ts:179](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L179)

The id of the workspace this panel belongs to.

***

### state

```ts
state: Readonly<Record<string, unknown>>;
```

Defined in: [packages/sdk/src/domain-types.ts:187](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L187)

The panel kind's own restore state — a serializable bag whose shape is the
panel's contract, not the host's (the host never inspects or validates it).
The Agent Chat panel keeps `{ sessionId, profileId, cwd }` here (RFC
0042); a panel with nothing to restore leaves it `{}`. Handed back to the
kind's component as its params when the panel is recreated on restore.

***

### customTitle?

```ts
optional customTitle?: string;
```

Defined in: [packages/sdk/src/domain-types.ts:199](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L199)

The name the **user** gave this tab, if any — set from the tab's right-click
menu on a [renamable](DockPanelKind.md#renamable) kind, cleared by
renaming to an empty string.

Host-owned, and deliberately a sibling of [DockPanelRecord.state](#state)
rather than a key inside it: `state` is the panel kind's own bag, replaced
wholesale from [DockPanelApi.updateParameters](DockPanelApi.md#updateparameters), so a panel writing its
own state would eventually erase a host key living there. When set, it wins
over the title the panel reports, both on the tab and on restore.

***

### createdAt

```ts
createdAt: string;
```

Defined in: [packages/sdk/src/domain-types.ts:201](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L201)

ISO-8601 timestamp of when the panel was first opened.

***

### lastActiveAt

```ts
lastActiveAt: string;
```

Defined in: [packages/sdk/src/domain-types.ts:203](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L203)

ISO-8601 timestamp of when the panel was last the active tab.
