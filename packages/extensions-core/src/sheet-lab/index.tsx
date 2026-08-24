import type { Extension } from "@silo-code/sdk";
import { SheetLabPanel } from "./SheetLabPanel";

// `core.sheet-lab` — PROTOTYPE. A bench for the <Sheet> surface: one panel in
// each dock, each with a button per (side × anchor × mode) permutation, so the
// shapes can be compared from a left invoker and a right one before any of this
// becomes SDK surface. Not a shipping feature — delete it, or fold it into the
// example extensions, once the design settles.

const LEFT_PANEL_ID = "sheet-lab-left";
const RIGHT_PANEL_ID = "sheet-lab-right";

export const extension: Extension = {
  id: "core.sheet-lab",
  manifest: {
    name: "Sheet Lab",
    description: "Prototype bench for the side-anchored sheet surface.",
  },
  activate(ctx) {
    // Registered in both docks rather than one movable panel: a dock-anchored
    // sheet grows out of whichever dock its caller lives in, so exercising both
    // directions wants a bench on each side at once.
    ctx.registerSidePanel({
      id: LEFT_PANEL_ID,
      location: "left",
      title: "Sheet Lab",
      component: () => <SheetLabPanel ctx={ctx} />,
      order: 99,
      lazyMount: true,
    });
    ctx.registerSidePanel({
      id: RIGHT_PANEL_ID,
      location: "right",
      title: "Sheet Lab",
      component: () => <SheetLabPanel ctx={ctx} />,
      order: 99,
      lazyMount: true,
    });

    ctx.registerCommand({
      id: "silo.sheet-lab.reveal",
      label: "Sheet Lab: Show Bench",
      run: () => ctx.layout.revealSidePanel(LEFT_PANEL_ID),
    });
  },
};
