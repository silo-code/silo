import type { Extension } from "@silo-code/sdk";
import { FileExplorerPanel } from "./FileExplorerPanel";

export const extension: Extension = {
  id: "silo.file-explorer",
  activate(ctx) {
    ctx.registerSidePanel({
      id: "file-explorer",
      location: "right",
      title: "Files",
      // Inject ctx so the panel and tree reach workspaces/editors/files
      // through the public primitives, not host getters.
      component: (props) => (
        <FileExplorerPanel ctx={ctx} storage={props.storage} />
      ),
      order: 1,
    });
  },
};
