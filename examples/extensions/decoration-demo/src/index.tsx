import type { Extension } from "@silo-code/sdk";
import { DemoPanel, injectStyles, removeStyles } from "./DemoPanel";

export const extension: Extension = {
  id: "silo.decoration-demo",
  activate(ctx) {
    injectStyles();

    ctx.subscriptions.push(
      ctx.registerSidePanel({
        id: "silo.decoration-demo.panel",
        title: "Decorations",
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
