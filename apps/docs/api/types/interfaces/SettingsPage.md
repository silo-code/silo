# Interface: SettingsPage

Defined in: [packages/sdk/src/types.ts:383](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L383)

A page in the Settings dialog, listed in the left rail.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:385](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L385)

Unique id for this settings page.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:387](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L387)

Label shown in the Settings left rail.

***

### group?

```ts
optional group?: string;
```

Defined in: [packages/sdk/src/types.ts:394](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L394)

Optional grouping key for the left rail (groups sorted lexically, separated
by a divider). Honored only for `core.*` pages; a page contributed by any
non-core extension is always grouped under **Extensions**, so `group` is
ignored for those.

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:396](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L396)

Sort order within the group. Lower sorts first. Defaults to 0.

***

### component

```ts
component: ComponentType;
```

Defined in: [packages/sdk/src/types.ts:398](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L398)

Renders the right-hand pane when this page is selected.
