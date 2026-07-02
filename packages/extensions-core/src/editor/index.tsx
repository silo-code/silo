import { lazy } from "react";
import type { DockPanelProps, Extension } from "@silo-code/sdk";
import { EditorPanel, type EditorPanelParams } from "./EditorPanel";
import { EditorSettingsPage } from "./EditorSettingsPage";

// The text editor mounts lazily alongside Monaco (kept off the startup bundle).
const TextEditor = lazy(async () => {
  const [{ TextViewer }] = await Promise.all([
    import("./TextViewer"),
    import("@silo-code/extension-host/internal").then((m) => m.ensureMonaco()),
  ]);
  return { default: TextViewer };
});

// `core.editor` — one extension, four modules on the shared Monaco core: the
// editor host panel, text mode, diff mode, and editor settings. These were four
// separate built-ins; consolidated per ctx-domains.md "The editor surface" so
// the editor is a single identity / enablement unit layered over the
// ctx.editors document model (text + diff + settings share editor-core.ts).
export const extension: Extension = {
  id: "core.editor",
  activate(ctx) {
    // One `editor:` dock kind for both modes. Text and diff are modes of the
    // same editor record (`mode: "text" | "diff"`), so a diff is NOT its own
    // DockPanelKind — EditorPanel renders the diff mode when the record asks for
    // it. ctx is injected so EditorPanel can hand the diff its theme (ctx.theme,
    // the public primitive). See ctx-domains.md "The editor surface".
    ctx.registerDockPanelKind({
      id: "editor",
      component: (props: DockPanelProps<EditorPanelParams>) => (
        <EditorPanel {...props} ctx={ctx} />
      ),
    });
    ctx.registerEditor({
      id: "text",
      label: "Text",
      match: () => true,
      // Inject ctx so the text editor reads files (ctx.files), drives the
      // document model (ctx.editors), reads the theme (ctx.theme), and handles
      // drops (ctx.dnd) through the public surface — see silo.image-viewer.
      component: (props) => <TextEditor {...props} ctx={ctx} />,
      priority: 0,
      // Editable by default; declares it can own untitled buffers.
      capabilities: { handlesUntitled: true },
    });
    ctx.registerSettingsPage({
      id: "editor",
      title: "Editor",
      group: "1_general",
      // After Keyboard Shortcuts (order 0) within the general group.
      order: 1,
      component: EditorSettingsPage,
    });
  },
};
