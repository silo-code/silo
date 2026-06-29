import type { Extension } from "@silo-code/sdk";
import type { IDockviewPanelProps } from "dockview";
import { Code } from "@phosphor-icons/react";
import { OutputPanel } from "./OutputPanel";

export const extension: Extension = {
  id: "core.output",
  manifest: {
    name: "Output",
    description:
      "Aggregated log output from extensions and built-in subsystems.",
  },
  activate(ctx) {
    ctx.registerDockPanelKind({
      id: "output",
      component: ((props: IDockviewPanelProps) => (
        <OutputPanel {...props} ctx={ctx} />
      )) as React.ComponentType<IDockviewPanelProps>,
    });

    ctx.registerCommand({
      id: "core.openOutput",
      label: "Output",
      run: () => ctx.layout.openSingletonPanel("output", { title: "Output" }),
    });

    ctx.registerMenuItem({
      id: "core.menu.openOutput",
      menu: "view",
      command: "core.openOutput",
      group: "2_panels",
      order: -10,
    });

    function OutputButton() {
      return (
        <button
          className="settings-button"
          aria-label="Output"
          onClick={() =>
            ctx.layout.openSingletonPanel("output", { title: "Output" })
          }
        >
          <Code size="1.3em" weight="bold" />
        </button>
      );
    }

    ctx.registerStatusItem({
      id: "core.output.button",
      alignment: "right",
      // Right of settings (-10), left of panel-toggles (-20). Right items sort
      // descending so lower priority = closer to the right edge.
      priority: -12,
      tooltip: "Open Output panel",
      component: OutputButton,
    });
  },
};
