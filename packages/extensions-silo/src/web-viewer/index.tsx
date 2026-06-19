import { Globe } from "@phosphor-icons/react";
import type { DockPanelProps, Extension } from "@silo-code/sdk";
import { WebViewerPanel } from "./WebViewerPanel";

export const extension: Extension = {
  id: "silo.web-viewer",
  manifest: {
    name: "Web Viewer",
    description:
      "Browse URLs — remote docs, local dev servers, or file:// HTML — alongside your code.",
  },
  activate(ctx) {
    ctx.registerDockPanelKind({
      id: "web-viewer",
      component: ((props) => (
        <WebViewerPanel {...props} ctx={ctx} />
      )) as React.ComponentType<DockPanelProps>,
      addMenuItem: {
        label: "New Web Viewer",
        icon: <Globe size={14} weight="regular" />,
        params: { title: "Web" },
      },
    });

    ctx.registerCommand({
      id: "silo.web-viewer.open",
      label: "Web Viewer: Open",
      run: () => ctx.layout.openPanel("web-viewer", { title: "Web" }),
    });
  },
};
