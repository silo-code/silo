# Interface: SettingsPage

Defined in: [packages/sdk/src/types.ts:628](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L628)

A page in the Settings dialog, listed in the left rail.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:630](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L630)

Unique id for this settings page.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:632](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L632)

Label shown in the Settings left rail.

***

### group?

```ts
optional group?: string;
```

Defined in: [packages/sdk/src/types.ts:639](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L639)

Optional grouping key for the left rail (groups sorted lexically, separated
by a divider). Honored only for `core.*` pages; a page contributed by any
non-core extension is always grouped under **Extensions**, so `group` is
ignored for those.

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:641](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L641)

Sort order within the group. Lower sorts first. Defaults to 0.

***

### component

```ts
component: ComponentType;
```

Defined in: [packages/sdk/src/types.ts:643](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L643)

Renders the right-hand pane when this page is selected.

***

### badge?

```ts
optional badge?: ComponentType<{
}>;
```

Defined in: [packages/sdk/src/types.ts:650](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L650)

Optional small indicator rendered after the title in the left rail (e.g.
an update-available count). Rendered as its own component — separate from
[SettingsPage.component](#component) — so it can subscribe to reactive state and
update independently of whether the page itself is the active one.
