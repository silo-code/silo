# Interface: DockPanelKind\<T\>

Defined in: [packages/sdk/src/types.ts:632](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L632)

Registers a kind of dock panel (a tab that can live in the center dock area,
e.g. the terminal). Workspaces open panels of registered kinds by id. The
optional generic `T` is the shape of the params this kind's panels are
opened with — annotate your component with `DockPanelProps<T>` and
[ExtensionContext.registerDockPanelKind](ExtensionContext.md#registerdockpanelkind) infers it, no casts needed.

## Type Parameters

### T

`T` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:634](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L634)

Unique id for this panel kind.

***

### component

```ts
component: ComponentType<DockPanelProps<T>>;
```

Defined in: [packages/sdk/src/types.ts:636](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L636)

The React component that renders this panel; receives [DockPanelProps](DockPanelProps.md).

***

### toolbar?

```ts
optional toolbar?: object;
```

Defined in: [packages/sdk/src/types.ts:653](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L653)

Host-drawn chrome above this panel's component (RFC 0039). Omit for a bare
frame — the default, and correct for a panel that fills its own space.

With it set, the dock frame draws the same strip an editor gets: the
breadcrumb path (fed by [DockPanelApi.setBreadcrumb](DockPanelApi.md#setbreadcrumb)) plus a
contribution point, so any extension can
`registerToolbarItem({ surface: "panel", when: (_k, t) => t.kindId === "…" })`
and its button lands here. A first-party panel's own controls arrive the
same way — there is no `children` slot past the contribution point. The
built-in terminal declares this, so its toolbar contributions are ordinary
`"panel"` items.

`toolbar: {}` — declared but empty — still reserves the strip, for a panel
that wants only contributed items.

#### breadcrumb?

```ts
optional breadcrumb?: boolean;
```

Draw path crumbs in the strip, filled in by
[DockPanelApi.setBreadcrumb](DockPanelApi.md#setbreadcrumb). Without it the strip carries only
contributed items.

***

### chatProfileHost?

```ts
optional chatProfileHost?: boolean;
```

Defined in: [packages/sdk/src/types.ts:682](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L682)

Declares that this panel kind renders a **Chat session** for an Agent
Profile (RFC 0038), so Silo can open it on the user's behalf.

A Chat-armed Agent Profile has no terminal to launch — it needs a
transcript UI, and Silo does not own one. With this set, picking such a
profile from the center dock's **+** menu (or running its
`core.newAgent.<id>` command) opens this kind with
`params.profileId` set to that profile's id; your component passes it to
[AgentSessionsService.connect](AgentSessionsService.md#connect). Terminal-armed profiles are
unaffected and still launch a terminal.

This is how a third-party Chat panel becomes a first-class way to start an
agent rather than something the user has to reach by a different route: it
is a declaration, not a privilege, and the bundled panel claims it exactly
the same way. With more than one such kind registered, the first
registered wins — disable the one you don't want on Settings → Extensions.

Requires `params.profileId` to be honoured; a kind that ignores it will be
handed profiles it does not render.

***

### persistence?

```ts
optional persistence?: "recorded";
```

Defined in: [packages/sdk/src/types.ts:702](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L702)

Opt this kind's panels into being **recorded** (RFC 0041). With
`persistence: "recorded"`, every open panel of this kind gets a
[DockPanelRecord](DockPanelRecord.md) in [Workspace.panels](Workspace.md#panels): it is enumerable,
workspace-scoped, and — this is the point — **reopened from its record on
restart**, the same way an editor or a terminal tab is, rather than
surviving only as opaque geometry in the saved dock layout.

On restore the host recreates the panel and hands
[DockPanelRecord.state](DockPanelRecord.md#state) back as the component's params, so a panel
that needs to restore itself (a Chat transcript restoring its session —
RFC 0042) writes that state through [DockPanelApi.updateParameters](DockPanelApi.md#updateparameters)
and reads it back from params on the next launch.

Omit for a **transient** panel — a picker, a preview, anything that should
not come back on its own. A transient panel still persists its position in
the dock layout for the current session; it just has no record and is not
recreated after a restart.

***

### addMenuItem?

```ts
optional addMenuItem?: object;
```

Defined in: [packages/sdk/src/types.ts:707](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L707)

When set, this kind appears as an entry in the center dock's **+** add
menu (the per-group header button). Omit to keep the kind internal.

#### label

```ts
label: string;
```

Label shown in the menu, e.g. `"New Web Viewer"`.

#### icon?

```ts
optional icon?: ReactNode;
```

Optional icon rendered to the left of the label.

#### params?

```ts
optional params?: Record<string, unknown>;
```

Params forwarded to the new panel instance. Merged with a generated
panel id — include `title` here to control the tab label.
