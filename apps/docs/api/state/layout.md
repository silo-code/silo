# ctx.layout

Read and drive side-panel collapse state through `LayoutService`. Read it
reactively in React with [`useServiceState`](/api/other/use-service-state).

```ts
ctx.layout: LayoutService
```

## Example

```tsx
import { useServiceState } from "@silo-code/sdk";

function MyWidget() {
  const state = useServiceState(ctx.layout);
  return (
    <button onClick={() => ctx.layout.toggleSidePanel("left")}>
      {state.left.collapsed ? "Show" : "Hide"} left
    </button>
  );
}
```

## Methods

On [`ctx.layout`](/api/types/interfaces/LayoutService). Method names link to the
full signature.

| Method                                                                                                    | What it does                                                                 |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [`getState()`](/api/types/interfaces/LayoutService#getstate)                                              | Current frozen [`LayoutState`](/api/types/interfaces/LayoutState).           |
| [`subscribe(listener)`](/api/types/interfaces/LayoutService#subscribe)                                    | Observe changes; returns a [`Disposable`](/api/types/interfaces/Disposable). |
| [`toggleSidePanel(location)`](/api/types/interfaces/LayoutService#togglesidepanel)                        | Toggle a side column collapsed/expanded.                                     |
| [`setSidePanelCollapsed(location, collapsed)`](/api/types/interfaces/LayoutService#setsidepanelcollapsed) | Set a column's collapsed state explicitly.                                   |

## State

The readable state — a frozen [`LayoutState`](/api/types/interfaces/LayoutState)
from [`getState()`](/api/types/interfaces/LayoutService#getstate),
[`subscribe`](/api/types/interfaces/LayoutService#subscribe), or
[`useServiceState`](/api/other/use-service-state):

| Property | Type                                                                 | What it is                                    |
| -------- | -------------------------------------------------------------------- | --------------------------------------------- |
| `left`   | [`SidePanelColumnState`](/api/types/interfaces/SidePanelColumnState) | left column collapse state (`{ collapsed }`)  |
| `right`  | [`SidePanelColumnState`](/api/types/interfaces/SidePanelColumnState) | right column collapse state (`{ collapsed }`) |

## Types

Pass [`LayoutService`](/api/types/interfaces/LayoutService).

Related: [`LayoutState`](/api/types/interfaces/LayoutState) · [`SidePanelColumnState`](/api/types/interfaces/SidePanelColumnState) · [`SideLocation`](/api/types/type-aliases/SideLocation).

## See also

Other [State](/api/#state) members on `ctx`.
