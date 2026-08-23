# Interface: NavigatorViewProps

Defined in: [packages/sdk/src/types.ts:507](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L507)

Props passed to a [NavigatorView](NavigatorView.md) component.

## Properties

### active

```ts
active: boolean;
```

Defined in: [packages/sdk/src/types.ts:514](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L514)

Whether this view is the one currently on screen. A view mounts the first
time it is selected and then stays mounted — hidden, not unmounted — so it
keeps its scroll position and local state. Use this to throttle work while
the view is off screen.
