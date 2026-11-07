# Interface: NavigatorViewProps

Defined in: [packages/sdk/src/types.ts:695](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L695)

Props passed to a [NavigatorView](NavigatorView.md) component.

## Properties

### active

```ts
active: boolean;
```

Defined in: [packages/sdk/src/types.ts:702](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L702)

Whether this view is the one currently on screen. A view mounts the first
time it is selected and then stays mounted — hidden, not unmounted — so it
keeps its scroll position and local state. Use this to throttle work while
the view is off screen.

***

### panelId

```ts
panelId: string;
```

Defined in: [packages/sdk/src/types.ts:709](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L709)

The [SidePanel.id](SidePanel.md#id) of the side panel hosting the Navigator. Pass it
to [LayoutService.openPanelSheet](LayoutService.md#openpanelsheet) so a sheet the view opens anchors
to the column the Navigator is actually docked in, rather than assuming a
fixed side.
