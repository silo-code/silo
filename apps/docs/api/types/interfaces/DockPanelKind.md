# Interface: DockPanelKind

Defined in: [packages/sdk/src/types.ts:317](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L317)

Registers a kind of dock panel (a tab that can live in the center dock area,
e.g. the terminal). Workspaces open panels of registered kinds by id.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:319](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L319)

Unique id for this panel kind.

***

### component

```ts
component: ComponentType<IDockviewPanelProps>;
```

Defined in: [packages/sdk/src/types.ts:321](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L321)

The React component; receives the raw dockview panel props.

***

### addMenuItem?

```ts
optional addMenuItem?: object;
```

Defined in: [packages/sdk/src/types.ts:326](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L326)

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
