# Interface: SettingsPage

Defined in: [packages/sdk/src/types.ts:459](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L459)

A page in the Settings dialog, listed in the left rail.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:461](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L461)

Unique id for this settings page.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:463](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L463)

Label shown in the Settings left rail.

***

### group?

```ts
optional group?: string;
```

Defined in: [packages/sdk/src/types.ts:470](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L470)

Optional grouping key for the left rail (groups sorted lexically, separated
by a divider). Honored only for `core.*` pages; a page contributed by any
non-core extension is always grouped under **Extensions**, so `group` is
ignored for those.

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:472](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L472)

Sort order within the group. Lower sorts first. Defaults to 0.

***

### component

```ts
component: ComponentType;
```

Defined in: [packages/sdk/src/types.ts:474](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L474)

Renders the right-hand pane when this page is selected.
