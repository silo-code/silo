// Single-file built-in extension contributing the two side-panel toggle
// buttons to the status bar. Authored exactly as a future external (npm /
// github / local-folder) extension would be: it imports nothing from the app
// except public SDK *types*, and touches the running app only through `ctx`.
// (React is a shared host dependency, not an app internal.)
//
// These two glyphs are bespoke SVG on purpose — the project standardizes on
// @phosphor-icons/react elsewhere, but the rounded-rect-with-side-strip mark
// reads clearer here than any Phosphor sidebar icon.

import type { Extension } from "@silo-code/sdk";
import { useServiceState } from "@silo-code/sdk";
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
  id: "silo.panel-toggles",
  activate(ctx) {
    const { layout } = ctx;

    // Pure presentation: owns no commands/keybindings. Reads layout state for
    // the active styling; invokes the core-owned command for the action.
    // The component closes over `ctx`; identity is stable (activate runs once).
    function PanelToggles() {
      const snap = useServiceState(layout);
      return (
        <div className="panel-toggles">
          <button
            className={`panel-toggle${snap.left.collapsed ? "" : " active"}`}
            title={snap.left.collapsed ? "Show left panel" : "Hide left panel"}
            onClick={() => ctx.executeCommand("view.toggleLeftPanel")}
          >
            <IconLeftPanel />
          </button>
          <button
            className={`panel-toggle${snap.right.collapsed ? "" : " active"}`}
            title={
              snap.right.collapsed ? "Show right panel" : "Hide right panel"
            }
            onClick={() => ctx.executeCommand("view.toggleRightPanel")}
          >
            <IconRightPanel />
          </button>
        </div>
      );
    }

    ctx.registerStatusItem({
      id: "panel-toggles",
      alignment: "right",
      priority: 0,
      component: PanelToggles,
    });
  },
};
