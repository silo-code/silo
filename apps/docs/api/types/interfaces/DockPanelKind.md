# Interface: DockPanelKind

Defined in: [packages/sdk/src/types.ts:302](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L302)

Registers a kind of dock panel (a tab that can live in the center dock area,
e.g. the terminal). Workspaces open panels of registered kinds by id.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:304](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L304)

Unique id for this panel kind.

***

### component

```ts
component: ComponentType<IDockviewPanelProps>;
```

Defined in: [packages/sdk/src/types.ts:306](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L306)

The React component; receives the raw dockview panel props.
