# ctx.dnd <Badge type="tip" text="stable" />

First-class drag-and-drop: be a drag **source** and a drop **target**, with
typed payloads ([`DND_MIME`](/api/types/variables/DND_MIME)) that interoperate
across extensions — drag a file out of a tree and drop it into a terminal, an
editor, or another extension's panel. The host owns the drag affordance (the
floating chip + paste-mode overlay) and resolves the modifier
[mode](/api/types/type-aliases/DndMode), so extensions don't reimplement the
platform-specific drag plumbing.

```ts
ctx.dnd: DndService
```

## Example

```tsx
// --- drag SOURCE: start a drag from a dragstart handler ---
<div
  draggable
  onDragStart={(e) =>
    ctx.dnd.beginDrag(e, {
      items: [{ mime: DND_MIME.filePath, value: path }],
      label: name,
      effect: "move",
    })
  }
/>;

// --- drop TARGET: register a DOM element (e.g. via a ref) ---
useEffect(() => {
  const el = ref.current;
  if (!el) return;
  const reg = ctx.dnd.registerDropTarget(el, {
    accepts: [DND_MIME.filePath],
    onDragOver: () => "move", // sets the cursor; drives your hover styling
    onDrop: ({ items, mode }) => {
      const path = items.find((i) => i.mime === DND_MIME.filePath)?.value;
      if (!path) return false;
      mode === "paste" ? pasteInto(path) : open(path);
      return true; // handled — host stops it falling through to other targets
    },
  });
  return () => reg.dispose();
}, [ctx.dnd]);
```

## Members

**`DndService`** (`ctx.dnd`):

| Member                                                                             | What it does                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`beginDrag(event, init)`](/api/types/interfaces/DndService#begindrag)             | From a `dragstart` handler: write typed [`DragInit.items`](/api/types/interfaces/DragInit) onto the drag + start the chip / paste affordance.                                                                                  |
| [`registerDropTarget(el, h)`](/api/types/interfaces/DndService#registerdroptarget) | Make a DOM element a drop target; the host resolves the [mode](/api/types/type-aliases/DndMode) and delivers a [`DropContext`](/api/types/interfaces/DropContext). Returns a [`Disposable`](/api/types/interfaces/Disposable). |

## Types

[`DndService`](/api/types/interfaces/DndService) ·
[`DND_MIME`](/api/types/variables/DND_MIME) ·
[`DndItem`](/api/types/interfaces/DndItem) ·
[`DragInit`](/api/types/interfaces/DragInit) ·
[`DropContext`](/api/types/interfaces/DropContext) ·
[`DropTargetHandlers`](/api/types/interfaces/DropTargetHandlers) ·
[`DndMode`](/api/types/type-aliases/DndMode).

## Notes

Use the [`DND_MIME`](/api/types/variables/DND_MIME) constants for payload keys
rather than raw strings — that's what lets drags interoperate across extensions
and built-ins (e.g. the file explorer's `DND_MIME.filePath` drag is understood
by the editor and terminal).

`onDrop` returning `true` tells the host to `preventDefault()` +
`stopPropagation()`, so a handled drop does **not** fall through to another
target (such as the center dock opening the file in a new pane). Return
`false`/nothing to let it pass.

[`mode`](/api/types/type-aliases/DndMode) is `"paste"` while Shift is held and
`"copy"` otherwise; it's resolved robustly even mid-drag (some platforms suppress
key events during a drag), so prefer it over reading `nativeEvent.shiftKey`. The
items array is populated on `drop`; during `onDragOver` only MIME _types_ are
exposed (not values), so branch on `accepts` / `mode` there.
