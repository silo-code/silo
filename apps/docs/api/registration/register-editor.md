# ctx.registerEditor

Register an **editor** — a presenter that renders the contents of an editor tab
for the files it matches. Everything that opens in the editor area is an editor
(a read-write text editor, a read-only image viewer, a Markdown preview…). When a
file opens, the host picks the highest-priority editor whose `match` returns true.

More than one editor can match the same file. The default is still the
highest-priority match, but the others become **alternate views** the user can
choose — give each a human-facing [`label`](/api/types/interfaces/Editor) ("Text",
"Preview") and they surface in the explorer's "Open With" submenu and the
breadcrumb view-switcher (see [`ctx.editors`](/api/editors/#a-file-can-have-more-than-one-view)).
Want to be the alternate rather than the default? Register at the **same priority**
as the editor you want to defer to — ties go to whoever registered first.

> Not to be confused with [`ctx.editors`](/api/editors/), the document/tab
> **model** (open, save, active tab). `registerEditor` contributes a
> **presenter** for a file type — like VS Code's custom-editor providers vs. its
> editor API.

```ts
ctx.registerEditor(editor: Editor): Disposable
```

## Example

```tsx
// A read-write editor for a file type:
ctx.registerEditor({
  id: "acme.foo-editor",
  match: (path) => path?.endsWith(".foo") ?? false,
  component: FooEditor, // React component, receives EditorProps
});

// A read-only alternate view (e.g. a previewer) that opts out of editing and
// becomes a second view alongside the existing editor for the type:
ctx.registerEditor({
  id: "acme.foo-preview",
  label: "Preview",
  match: (path) => path?.endsWith(".foo") ?? false,
  component: FooPreview,
  capabilities: { readonly: true },
});
```

Editors are **editable by default**; declare `capabilities.readonly: true` for a
display-only editor (the image viewer and the Markdown preview are exactly this
— the proof the contribution point is public). Declare
`capabilities.handlesUntitled: true` to let an editor own never-saved buffers.

## Types

Pass [`Editor`](/api/types/interfaces/Editor).

Related: [`EditorProps`](/api/types/interfaces/EditorProps) ·
[`EditorCapabilities`](/api/types/interfaces/EditorCapabilities).

## See also

Other [Registration](/api/#registration) members on `ctx`.
