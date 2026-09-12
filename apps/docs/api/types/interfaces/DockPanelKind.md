# Interface: DockPanelKind\<T\>

Defined in: [packages/sdk/src/types.ts:606](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L606)

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

Defined in: [packages/sdk/src/types.ts:608](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L608)

Unique id for this panel kind.

***

### component

```ts
component: ComponentType<DockPanelProps<T>>;
```

Defined in: [packages/sdk/src/types.ts:610](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L610)

The React component that renders this panel; receives [DockPanelProps](DockPanelProps.md).

***

### chatProfileHost?

```ts
optional chatProfileHost?: boolean;
```

Defined in: [packages/sdk/src/types.ts:632](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L632)

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

### addMenuItem?

```ts
optional addMenuItem?: object;
```

Defined in: [packages/sdk/src/types.ts:637](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L637)

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
