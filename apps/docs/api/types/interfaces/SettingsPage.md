# Interface: SettingsPage

Defined in: [packages/sdk/src/types.ts:650](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L650)

A page in the Settings dialog, listed in the left rail.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:652](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L652)

Unique id for this settings page.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:654](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L654)

Label shown in the Settings left rail.

***

### group?

```ts
optional group?: string;
```

Defined in: [packages/sdk/src/types.ts:661](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L661)

Optional grouping key for the left rail (groups sorted lexically, separated
by a divider). Honored only for `core.*` pages; a page contributed by any
non-core extension is always grouped under **Extensions**, so `group` is
ignored for those.

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:663](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L663)

Sort order within the group. Lower sorts first. Defaults to 0.

***

### component

```ts
component: ComponentType;
```

Defined in: [packages/sdk/src/types.ts:665](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L665)

Renders the right-hand pane when this page is selected.

***

### badge?

```ts
optional badge?: ComponentType<{
}>;
```

Defined in: [packages/sdk/src/types.ts:672](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L672)

Optional small indicator rendered after the title in the left rail (e.g.
an update-available count). Rendered as its own component — separate from
[SettingsPage.component](#component) — so it can subscribe to reactive state and
update independently of whether the page itself is the active one.
