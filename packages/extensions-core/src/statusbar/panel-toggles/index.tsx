import type { Extension } from "@silo-code/sdk";
import { useServiceState } from "@silo-code/sdk";
import { Tooltip } from "@silo-code/extension-host/internal";
import "./panel-toggles.css";

function IconLeftPanel() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="1.15em"
      height="1.15em"
      aria-hidden="true"
      fill="currentColor"
    >
      <rect x="1" y="1" width="14" height="14" rx="2.5" opacity="0.15" />
      <rect
        x="1"
        y="1"
        width="14"
        height="14"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <rect x="1" y="1" width="4.5" height="14" rx="2" opacity="0.8" />
      <rect x="3.75" y="1" width="1.75" height="14" opacity="0.8" />
    </svg>
  );
}

function IconRightPanel() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="1.15em"
      height="1.15em"
      aria-hidden="true"
      fill="currentColor"
    >
      <rect x="1" y="1" width="14" height="14" rx="2.5" opacity="0.15" />
      <rect
        x="1"
        y="1"
        width="14"
        height="14"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <rect x="10.5" y="1" width="4.5" height="14" rx="2" opacity="0.8" />
      <rect x="10.5" y="1" width="1.75" height="14" opacity="0.8" />
    </svg>
  );
}

export const extension: Extension = {
  id: "core.panel-toggles",
  activate(ctx) {
    const { layout } = ctx;

    // Pure presentation: owns no commands/keybindings. Reads layout state for
    // the active styling; invokes the core-owned command for the action.
    // The component closes over `ctx`; identity is stable (activate runs once).
    function PanelToggles() {
      const snap = useServiceState(layout);
      return (
        <div className="panel-toggles">
          <Tooltip
            content={
              snap.left.collapsed ? "Show left panel" : "Hide left panel"
            }
          >
            <button
              className={`panel-toggle${snap.left.collapsed ? "" : " active"}`}
              onClick={() => ctx.executeCommand("view.toggleLeftPanel")}
            >
              <IconLeftPanel />
            </button>
          </Tooltip>
          <Tooltip
            content={
              snap.right.collapsed ? "Show right panel" : "Hide right panel"
            }
          >
            <button
              className={`panel-toggle${snap.right.collapsed ? "" : " active"}`}
              onClick={() => ctx.executeCommand("view.toggleRightPanel")}
            >
              <IconRightPanel />
            </button>
          </Tooltip>
        </div>
      );
    }

    ctx.registerStatusItem({
      id: "panel-toggles",
      alignment: "right",
      // Rightmost built-in item (at the right edge). Right items sort
      // descending so the most negative priority lands at the far right.
      priority: -20,
      component: PanelToggles,
    });
  },
};
