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

Defined in: [packages/sdk/src/domain-types.ts:157](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L157)

Stable id, unique within the workspace. This is **not** the transient
dock-view panel id — it survives the panel being closed and reopened from
its record across a restart.

***

### kindId

```ts
kindId: string;
```

Defined in: [packages/sdk/src/domain-types.ts:159](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L159)

The [DockPanelKind](DockPanelKind.md) id this panel is an instance of.

***

### workspaceId

```ts
workspaceId: string;
```

Defined in: [packages/sdk/src/domain-types.ts:161](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L161)

The id of the workspace this panel belongs to.

***

### state

```ts
state: Readonly<Record<string, unknown>>;
```

Defined in: [packages/sdk/src/domain-types.ts:169](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L169)

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

Defined in: [packages/sdk/src/domain-types.ts:181](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L181)

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

Defined in: [packages/sdk/src/domain-types.ts:183](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L183)

ISO-8601 timestamp of when the panel was first opened.

***

### lastActiveAt

```ts
lastActiveAt: string;
```

Defined in: [packages/sdk/src/domain-types.ts:185](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L185)

ISO-8601 timestamp of when the panel was last the active tab.
