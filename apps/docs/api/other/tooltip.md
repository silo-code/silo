# Tooltip

A lightweight hover popup that matches the host's status-bar tooltip style.
Wrap any trigger element — a button, icon, or inline control — and `Tooltip`
shows a styled label above it after a 600 ms delay. Renders via a portal so
`overflow: hidden` parents and stacking contexts never clip it.

```ts
import { Tooltip } from "@silo-code/sdk";
```

## Example

```tsx
import { Tooltip } from "@silo-code/sdk";
import { FilePlus, FolderPlus, ArrowClockwise } from "@phosphor-icons/react";

function PanelActions({ onNewFile, onNewFolder, onRefresh }) {
  return (
    <span className="panel-actions">
      <Tooltip content="New File">
        <button tabIndex={-1} onClick={onNewFile}>
          <FilePlus size="1.2em" />
        </button>
      </Tooltip>
      <Tooltip content="New Folder">
        <button tabIndex={-1} onClick={onNewFolder}>
          <FolderPlus size="1.2em" />
        </button>
      </Tooltip>
      <Tooltip content="Refresh">
        <button tabIndex={-1} onClick={onRefresh}>
          <ArrowClockwise size="1.2em" />
        </button>
      </Tooltip>
    </span>
  );
}
```

`content` is the label string. `children` is any single React element — the
trigger. Drop the native `title` attribute when you add `Tooltip`; they serve
the same purpose and the native one produces a second popup.

## Behaviour

- **600 ms hover delay** — avoids visual noise while the cursor moves across
  the UI. The timer resets on `mouseleave` and cancels on `pointerdown`.
- **Portal rendering** — the popup mounts on `document.body` via
  `createPortal`, so it is never clipped by an `overflow: hidden` scroll
  container or a low `z-index` stacking context.
- **Viewport clamping** — the popup centres above the trigger and clamps
  horizontally so it never bleeds off the edge of the screen. If there is not
  enough room above, it flips below.
- **Display-only** — `pointer-events: none` on the popup; it never
  interferes with the element beneath it.

## Styling

The popup uses the host's design tokens — `--silo-color-button-bg`,
`--silo-color-border-strong`, `--silo-color-input-text`, `--silo-font-ui`,
`--silo-font-size-sm`, `--silo-radius-sm` — and matches the status-bar
tooltip style exactly. No stylesheet import is needed in the extension; the
host loads the CSS.

## Types

- [`Tooltip`](/api/types/functions/Tooltip) — the component's generated type
  reference (props: `content: string`, `children: ReactNode`).

## See also

- [`useFocusGroup`](/api/other/use-focus-group) — keyboard navigation for panel lists and toolbars.
- [`ctx.ui.showMenu`](/api/ui/) — for richer action surfaces (labelled rows, icons, submenus).
- [Design tokens](/api/theming) — the full `--silo-*` token reference.
