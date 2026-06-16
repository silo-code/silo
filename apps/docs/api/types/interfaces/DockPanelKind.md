# Interface: DockPanelKind

Defined in: [packages/sdk/src/types.ts:303](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L303)

Registers a kind of dock panel (a tab that can live in the center dock area,
e.g. the terminal). Workspaces open panels of registered kinds by id.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:305](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L305)

Unique id for this panel kind.

***

### component

```ts
component: ComponentType<IDockviewPanelProps>;
```

Defined in: [packages/sdk/src/types.ts:307](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L307)

The React component; receives the raw dockview panel props.
