/**
 * **Spike (docs/acp-recon.md) — not a shipped surface.** Registers the ACP
 * chat panel as a center-dock kind, reachable from the dock's **+** menu next
 * to New Terminal.
 *
 * A `core.*` extension rather than `silo.*` because it reaches the host's
 * privileged barrel for `createAcpTransport` — an extension may not import
 * `@tauri-apps/*` itself (the platform ban), so the host owns the connection.
 * That split is what a real implementation would keep.
 */

import type { DockPanelProps, Extension } from "@silo-code/sdk";
import { AcpChatPanel, type AcpChatPanelParams } from "./AcpChatPanel";

export const extension: Extension = {
  id: "core.acp-chat",
  activate(ctx) {
    ctx.registerDockPanelKind({
      id: "acp-chat",
      component: (props: DockPanelProps<AcpChatPanelParams>) => (
        <AcpChatPanel {...props} ctx={ctx} />
      ),
      addMenuItem: {
        label: "New Agent Chat (ACP spike)",
        params: { title: "Agent" },
      },
    });
    ctx.registerCommand({
      id: "core.acpChat.new",
      label: "New Agent Chat (ACP spike)",
      run: () => {
        ctx.layout.openPanel("acp-chat", { title: "Agent" });
      },
    });
  },
};
