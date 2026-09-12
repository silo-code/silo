# Interface: SettingsPage

Defined in: [packages/sdk/src/types.ts:701](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L701)

A page in the Settings dialog, listed in the left rail.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:703](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L703)

Unique id for this settings page.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:708](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L708)

Label shown in the Settings left rail **and** as the host-owned page
title in the pane. Do not render your own `<h2>` — the host draws this.

***

### group?

```ts
optional group?: string;
```

Defined in: [packages/sdk/src/types.ts:715](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L715)

Optional grouping key for the left rail (groups sorted lexically, separated
by a divider). Honored only for `core.*` pages; a page contributed by any
non-core extension is always grouped under **Extensions**, so `group` is
ignored for those.

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:717](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L717)

Sort order within the group. Lower sorts first. Defaults to 0.

***

### component

```ts
component: ComponentType;
```

Defined in: [packages/sdk/src/types.ts:719](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L719)

Renders the right-hand pane when this page is selected.

***

### badge?

```ts
optional badge?: ComponentType<{
}>;
```

Defined in: [packages/sdk/src/types.ts:726](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L726)

Optional small indicator rendered after the title in the left rail (e.g.
an update-available count). Rendered as its own component — separate from
[SettingsPage.component](#component) — so it can subscribe to reactive state and
update independently of whether the page itself is the active one.
