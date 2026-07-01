import type { DockPanelProps, Extension } from "@silo-code/sdk";
import { TerminalPanel } from "./TerminalPanel";
import { TerminalSettingsPage } from "./TerminalSettingsPage";

export const extension: Extension = {
  id: "core.terminal",
  activate(ctx) {
    ctx.registerDockPanelKind({
      id: "terminal",
      // Inject ctx so the panel drives PTY sessions (ctx.process), opens files
      // (ctx.editors), and handles drops (ctx.dnd) through the public surface —
      // the editor DockKinds show the shape.
      component: ((props: DockPanelProps) => (
        <TerminalPanel
          {...(props as unknown as Parameters<typeof TerminalPanel>[0])}
          ctx={ctx}
        />
      )) as React.ComponentType<DockPanelProps>,
    });
    ctx.registerSettingsPage({
      id: "terminal",
      title: "Terminal",
      group: "1_general",
      // After Keyboard Shortcuts (0) and Editor (1) within the general group.
      order: 2,
      component: TerminalSettingsPage,
    });
  },
};
