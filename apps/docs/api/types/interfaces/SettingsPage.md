# Interface: SettingsPage

Defined in: [packages/sdk/src/types.ts:333](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L333)

A page in the Settings dialog, listed in the left rail.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:335](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L335)

Unique id for this settings page.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:337](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L337)

Label shown in the Settings left rail.

***

### group?

```ts
optional group?: string;
```

Defined in: [packages/sdk/src/types.ts:344](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L344)

Optional grouping key for the left rail (groups sorted lexically, separated
by a divider). Honored only for `core.*` pages; a page contributed by any
non-core extension is always grouped under **Extensions**, so `group` is
ignored for those.

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:346](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L346)

Sort order within the group. Lower sorts first. Defaults to 0.

***

### component

```ts
component: ComponentType;
```

Defined in: [packages/sdk/src/types.ts:348](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L348)

Renders the right-hand pane when this page is selected.
