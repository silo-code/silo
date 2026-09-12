/**
 * `core.acp-chat` — the bundled **Chat panel** (RFC 0038 phase 3): a
 * center-dock transcript for one Chat session, reachable from the dock's **+**
 * menu next to New Terminal.
 *
 * **Registered only when the `bundledChatPanel` setting is on.** The
 * composition root (`apps/desktop/src/builtins.ts`) reads the flag and leaves
 * this extension out of the built-in list while it is off, so the panel kind,
 * the menu entry and the command do not exist at all — which is what makes
 * "turn off the bundled panel and use a third-party one instead" a real
 * option rather than a fight over the same `+` menu row.
 *
 * A `core.*` extension by convention (it is bundled Silo UI, sequenced by the
 * composition root), **not** because it needs privileges: it touches the app
 * only through `ctx` and `@silo-code/sdk`, exactly as a third-party Chat panel
 * would. There is no `@silo-code/extension-host/internal` import anywhere in
 * this directory, and that is the phase's whole acceptance criterion.
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
        label: "New Agent Chat",
      },
    });
    ctx.registerCommand({
      id: "core.acpChat.new",
      label: "New Agent Chat",
      run: () => {
        ctx.layout.openPanel("acp-chat", {});
      },
    });
  },
};
