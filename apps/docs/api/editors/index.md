# ctx.editors <Badge type="tip" text="stable" />

The editor & document domain: open files into editor tabs, drive the active
editor (save / close), and let editor viewers register save handlers. Opening
editors lives here — not on [`ctx.workspaces`](/api/state/workspaces).

```ts
ctx.editors: EditorService
```

## Example

```tsx
// open a file in the active workspace
ctx.editors.open("/path/to/file.ts");

// open it as a (single-click) preview tab
ctx.editors.open("/path/to/file.ts", { preview: true });

// jump to and select a match (e.g. from a search result) — 1-indexed
ctx.editors.open("/path/to/file.ts", {
  selection: { line: 42, column: 8, endLine: 42, endColumn: 13 },
});

// a command that saves the focused editor
ctx.registerCommand({
  id: "acme.save",
  label: "Save",
  run: () => ctx.editors.save(),
});
```

## Methods

| Method                                                                                                         | What it does                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`open(path, opts?)`](/api/types/interfaces/EditorService#open)                                                | Open a file in an editor tab (promotes a preview / focuses an open tab).                                                                                                      |
| [`openUntitled(opts?)`](/api/types/interfaces/EditorService#openuntitled)                                      | Open a fresh untitled editor.                                                                                                                                                 |
| [`openDiff(spec, opts?)`](/api/types/interfaces/EditorService#opendiff)                                        | Open a diff view; content comes from the named provider (see below).                                                                                                          |
| [`registerDiffContentProvider(id, provider)`](/api/types/interfaces/EditorService#registerdiffcontentprovider) | Register a [`DiffContentProvider`](/api/types/type-aliases/DiffContentProvider) that resolves a diff's two sides. Returns a [`Disposable`](/api/types/interfaces/Disposable). |
| [`save()`](/api/types/interfaces/EditorService#save)                                                           | Save the active editor (`false` if none).                                                                                                                                     |
| [`saveAs()`](/api/types/interfaces/EditorService#saveas)                                                       | Save-as the active editor.                                                                                                                                                    |
| [`closeActive()`](/api/types/interfaces/EditorService#closeactive)                                             | Close the active dock panel.                                                                                                                                                  |
| [`editorsFor(path)`](/api/types/interfaces/EditorService#editorsfor)                                           | List the [views](/api/types/interfaces/EditorViewInfo) that match a path (highest-priority first, default flagged) — for building "Open With" menus / a view-switcher.        |
| [`setViewType(editorId, viewType, opts?)`](/api/types/interfaces/EditorService#setviewtype)                    | Switch an open tab to a different [editor view](/api/registration/register-editor) in place, persisting the choice.                                                           |
| [`registerSaveHandler(editorId, handlers)`](/api/types/interfaces/EditorService#registersavehandler)           | Register an editor's `save`/`saveAs` so the active-editor commands dispatch to it. Returns a [`Disposable`](/api/types/interfaces/Disposable).                                |

`open` / `openUntitled` take [`OpenFileOptions`](/api/types/interfaces/OpenFileOptions)
(`workspaceId`, `preview`, `viewType`, `selection`). Pass `selection` (1-indexed
`line`/`column`, optional `endLine`/`endColumn`) to reveal and select a range on
open — the editor jumps to it whether the tab is newly opened or already open
(a re-jump). This is how a clicked [search result](/api/search/) lands on its
exact match.

## A file can have more than one view

When several editors match the same file (e.g. a `.md` opens as **Text** or
**Preview**), the host opens the highest-priority one by default but the user can
choose another. `editorsFor(path)` enumerates the matching
[views](/api/types/interfaces/EditorViewInfo) (each editor's `id` + `label`, with
the default flagged); open a specific one with `open(path, { viewType })`, or
switch an already-open tab in place with `setViewType`. The choice is persisted on
the tab and survives restart. The bundled file explorer turns this into an "Open
With" submenu, and the breadcrumb bar shows a view-switcher.

```tsx
// Offer the user every view that can render this file:
for (const view of ctx.editors.editorsFor("/path/to/readme.md")) {
  // view.id, view.label ("Text" / "Preview"), view.isDefault
  ctx.editors.open("/path/to/readme.md", { viewType: view.id });
}
```

## Diffs are generic — content comes from a provider

The diff view renders two contents and knows nothing about where they come from.
An extension that can produce a diff (e.g. git: HEAD vs working tree) **registers
a content provider**, then opens diffs that name it. The host calls the provider
on every mount, so content is a pure computed view (never persisted) and survives
tab switches and app restarts.

```tsx
// 1. register a provider (once, in activate)
ctx.editors.registerDiffContentProvider("acme.snapshot", async (req) => ({
  original: await loadSnapshot(req.filePath, req.args?.rev as string),
  modified: await ctx.files.readText(req.filePath),
}));

// 2. open a diff that uses it
ctx.editors.openDiff({
  filePath: "/path/to/file.ts",
  providerId: "acme.snapshot",
  args: { rev: "v1.2.0" },
  title: "file.ts (since v1.2.0)",
});
```

## Registering a save handler (for editor viewers)

A viewer that edits content registers how it saves, so the global Save command
(⌘S) routes to whichever editor is focused:

```tsx
useEffect(() => {
  const sub = ctx.editors.registerSaveHandler(editorId, { save, saveAs });
  return () => sub.dispose();
}, [editorId]);
```

## Types

[`EditorService`](/api/types/interfaces/EditorService) ·
[`EditorSaveHandlers`](/api/types/interfaces/EditorSaveHandlers) ·
[`OpenFileOptions`](/api/types/interfaces/OpenFileOptions) ·
[`EditorViewInfo`](/api/types/interfaces/EditorViewInfo) ·
[`OpenDiffSpec`](/api/types/interfaces/OpenDiffSpec) ·
[`DiffContentProvider`](/api/types/type-aliases/DiffContentProvider) ·
[`DiffContentRequest`](/api/types/interfaces/DiffContentRequest) ·
[`DiffContent`](/api/types/interfaces/DiffContent).

## Not yet here

Document _content_ access, edits, decorations, diagnostics, and language
providers (the Monaco/LSP surface) are [planned](/roadmap), not in this version.
