# Interface: NavigatorViewProps

Defined in: [packages/sdk/src/types.ts:485](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L485)

Props passed to a [NavigatorView](NavigatorView.md) component.

## Properties

### active

```ts
active: boolean;
```

Defined in: [packages/sdk/src/types.ts:492](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L492)

Whether this view is the one currently on screen. A view mounts the first
time it is selected and then stays mounted — hidden, not unmounted — so it
keeps its scroll position and local state. Use this to throttle work while
the view is off screen.
