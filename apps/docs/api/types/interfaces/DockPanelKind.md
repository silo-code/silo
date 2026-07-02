# Interface: DockPanelKind

Defined in: [packages/sdk/src/types.ts:365](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L365)

Registers a kind of dock panel (a tab that can live in the center dock area,
e.g. the terminal). Workspaces open panels of registered kinds by id.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:367](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L367)

Unique id for this panel kind.

***

### component

```ts
component: ComponentType<DockPanelProps<Record<string, unknown>>>;
```

Defined in: [packages/sdk/src/types.ts:369](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L369)

The React component that renders this panel; receives [DockPanelProps](DockPanelProps.md).

***

### addMenuItem?

```ts
optional addMenuItem?: object;
```

Defined in: [packages/sdk/src/types.ts:374](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L374)

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
