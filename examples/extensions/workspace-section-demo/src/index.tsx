import type { Extension } from "@silo-code/sdk";
import {
  injectStyles,
  removeStyles,
  makeTerminalSummarySection,
} from "./TerminalSummarySection";

export const extension: Extension = {
  id: "silo.workspace-section-demo",
  activate(ctx) {
    injectStyles();

    ctx.subscriptions.push(
      ctx.workspaces.registerSection({
        id: "silo.workspace-section-demo.terminals",
        component: makeTerminalSummarySection(ctx),
        order: 0,
      }),
    );
  },
  deactivate() {
    removeStyles();
  },
};
