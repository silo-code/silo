import type { Extension } from "@silo-code/sdk";
import { ImageViewer } from "./ImageViewer";

const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "ico",
  "svg",
  "avif",
]);

function matchImage(path: string | null): boolean {
  if (!path) return false;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTS.has(ext);
}

export const extension: Extension = {
  id: "silo.image-viewer",
  activate(ctx) {
    ctx.registerEditor({
      id: "image",
      label: "Image",
      match: matchImage,
      // Inject ctx so the presenter reads files through ctx.files (the public
      // primitive) instead of the host getter — see useServiceState's docs.
      component: (props) => <ImageViewer {...props} ctx={ctx} />,
      priority: 10,
      // Read-only presenter — the proof registerEditor's contribution point is
      // public (a third party adds a read-only editor for a file type the same
      // way). Can't own untitled buffers.
      capabilities: { readonly: true, handlesUntitled: false },
    });
  },
};
