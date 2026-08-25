# ctx.layout

Read and drive side-panel collapse state through `LayoutService`, reveal a
registered side panel, and open a dock-anchored companion sheet for one. Read
collapse state reactively in React with
[`useServiceState`](/api/other/use-service-state).

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

### openPanelSheet — a companion sheet anchored to a side panel

```tsx
void ctx.layout.openPanelSheet(
  "skills",
  (close) => <BrowseBody onClose={close} />,
  { title: <BrandMark />, width: 560 },
);
```

Opens a host-owned, **dock-anchored** sheet that grows out of the side dock
currently hosting the given [`SidePanel`](/api/types/interfaces/SidePanel)'s
`id` — revealing that panel first (unhiding it, expanding a collapsed column,
activating its tab), then sliding the sheet out from its side. Never modal: no
scrim, `Escape` does nothing, the rest of the workbench stays live. Unlike
`ctx.ui.showModal`, there's no `anchor`/`side` to choose — the target panel's
own current dock decides it, so the sheet opens correctly whether triggered by
a click inside the panel or by a command/status-bar button from anywhere else.
Resolves once the sheet closes; rejects if `panelId` names no registered
panel.

## Methods

On [`ctx.layout`](/api/types/interfaces/LayoutService). Method names link to the
full signature.

| Method                                                                                                    | What it does                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`getState()`](/api/types/interfaces/LayoutService#getstate)                                              | Current frozen [`LayoutState`](/api/types/interfaces/LayoutState).                                                                                           |
| [`subscribe(listener)`](/api/types/interfaces/LayoutService#subscribe)                                    | Observe changes; returns a [`Disposable`](/api/types/interfaces/Disposable).                                                                                 |
| [`toggleSidePanel(location)`](/api/types/interfaces/LayoutService#togglesidepanel)                        | Toggle a side column collapsed/expanded.                                                                                                                     |
| [`setSidePanelCollapsed(location, collapsed)`](/api/types/interfaces/LayoutService#setsidepanelcollapsed) | Set a column's collapsed state explicitly.                                                                                                                   |
| [`revealSidePanel(id)`](/api/types/interfaces/LayoutService#revealsidepanel)                              | Bring a registered panel to the foreground — make it active in its column and expand that column. No-op for an unknown id.                                   |
| [`openPanelSheet(panelId, render, opts?)`](/api/types/interfaces/LayoutService#openpanelsheet)            | Open a dock-anchored sheet grown out of `panelId`'s side dock, revealing that panel first. Resolves when the sheet closes; rejects for an unknown `panelId`. |

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

Related: [`LayoutState`](/api/types/interfaces/LayoutState) · [`SidePanelColumnState`](/api/types/interfaces/SidePanelColumnState) · [`SideLocation`](/api/types/type-aliases/SideLocation) · [`SheetOptions`](/api/types/interfaces/SheetOptions) (for `openPanelSheet`).

## See also

Other [State](/api/#state) members on `ctx`.
