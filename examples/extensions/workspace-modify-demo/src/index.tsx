import type { Extension } from "@silo-code/sdk";
import { DemoPanel, injectStyles, removeStyles } from "./DemoPanel";

export const extension: Extension = {
  id: "silo.workspace-modify-demo",
  activate(ctx) {
    injectStyles();

    ctx.subscriptions.push(
      ctx.registerSidePanel({
        id: "silo.workspace-modify-demo.panel",
        title: "WS Demo",
        location: "right",
        order: 100,
        component: () => <DemoPanel ctx={ctx} />,
      }),
    );
  },
  deactivate() {
    removeStyles();
  },
};
