import type { DockPanelProps, Extension } from "@silo-code/sdk";
import { Code } from "@phosphor-icons/react";
import { OutputPanel, type OutputPanelParams } from "./OutputPanel";

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
      component: (props: DockPanelProps<OutputPanelParams>) => (
        <OutputPanel {...props} ctx={ctx} />
      ),
    });

    ctx.registerCommand({
      id: "core.openOutput",
      label: "Output",
      run: () =>
        ctx.layout.openPanel(
          "output",
          { title: "Output" },
          { singleton: true },
        ),
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
            ctx.layout.openPanel(
              "output",
              { title: "Output" },
              { singleton: true },
            )
          }
        >
          {/* Bold glyph over Phosphor's duotone plate, at the panel-toggle
              light-body shade (currentColor @ 0.15) for the two-tone look. */}
          <Code size="1.3em" weight="bold">
            <path d="M240,128l-48,40H64L16,128,64,88H192Z" opacity={0.15} />
          </Code>
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
