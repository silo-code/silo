import { lazy } from "react";
import type { Extension } from "@silo-code/sdk";
import { matchMarkdown } from "./match";

// Lazy so react-markdown / remark-gfm stay off the startup bundle — Preview is
// opt-in (the default view for a .md file is still Text). The Suspense boundary
// lives in the editor panel that mounts this component.
const MarkdownPreview = lazy(async () => {
  const { MarkdownPreview } = await import("./MarkdownPreview");
  return { default: MarkdownPreview };
});

export const extension: Extension = {
  id: "silo.markdown-preview",
  activate(ctx) {
    ctx.registerEditor({
      id: "silo.markdown-preview",
      label: "Preview",
      match: matchMarkdown,
      // Inject ctx so the presenter reads files through ctx.files (the public
      // primitive) — see silo.image-viewer for the same pattern.
      component: (props) => <MarkdownPreview {...props} ctx={ctx} />,
      // Same priority as the core text editor (0). Ties go to the
      // first-registered editor, and `editor` is wired before this one in
      // builtins.ts — so a plain click on a .md still opens Text, and Preview is
      // reached via "Open With" / the breadcrumb view-switcher.
      priority: 0,
      // Read-only presenter; can't own an unsaved (untitled) buffer.
      capabilities: { readonly: true, handlesUntitled: false },
    });
  },
};
