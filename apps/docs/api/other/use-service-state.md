# useServiceState

The one blessed way to read a `ctx` service's reactive state in React. Returns
the service's current state and re-renders your component when it changes — so
you never hand-roll `useSyncExternalStore` per call site. Works for every stateful
service ([`ctx.workspaces`](/api/state/workspaces),
[`ctx.layout`](/api/state/layout), [`ctx.theme`](/api/theme/), …) because they all
share the same [`ReactiveService`](/api/types/interfaces/ReactiveService) shape
(`getState` + `subscribe`).

```ts
import { useServiceState } from "@silo-code/sdk";

useServiceState<T>(service: ReactiveService<T>): T
```

## Example

```tsx
import { useServiceState } from "@silo-code/sdk";

function Panel({ ctx }: { ctx: ExtensionContext }) {
  const ws = useServiceState(ctx.workspaces);
  const layout = useServiceState(ctx.layout);
  return (
    <span>
      {ws.open.length} open · left {layout.left.collapsed ? "hidden" : "shown"}
    </span>
  );
}
```

## Types

Pass a [`ReactiveService`](/api/types/interfaces/ReactiveService) (any service
exposing `getState` + `subscribe`).

## See also

Other [Other](/api/#other) members on `ctx`.
