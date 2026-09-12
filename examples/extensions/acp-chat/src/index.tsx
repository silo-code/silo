/**
 * `silo.acp-chat` — the **Chat panel** (RFC 0038 / 0039): a center-dock
 * transcript for one ACP Chat session, opened by starting a Chat Agent
 * Profile (the + menu's agent-profile section, the "New Agent" watermark
 * action, or `core.newAgent`).
 *
 * It was the bundled `core.acp-chat` until RFC 0039 moved it here, so it can be
 * iterated without shipping a Silo release. That move is also the proof the SDK
 * is sufficient: an example resolves `@silo-code/sdk` **only**, so the panel
 * drives `ctx.agents.sessions` — and gets its chrome strip — entirely through
 * the public surface, with nothing from `@silo-code/extension-host/internal`.
 *
 * It declares the `"agents"` permission (`ctx.agents.sessions.connect()` throws
 * without it) and `chatProfileHost: true` (so a Chat Agent Profile opens here).
 */

import type {
  DockPanelProps,
  Extension,
  ExtensionContext,
} from "@silo-code/sdk";
import { AcpChatPanel, type AcpChatPanelParams } from "./AcpChatPanel";
import styles from "./acp-chat.css";

const STYLE_ID = "silo-acp-chat-styles";

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = styles;
  document.head.appendChild(el);
}

function activate(ctx: ExtensionContext) {
  injectStyles();

  ctx.subscriptions.push(
    ctx.registerDockPanelKind({
      id: "acp-chat",
      component: (props: DockPanelProps<AcpChatPanelParams>) => (
        <AcpChatPanel {...props} ctx={ctx} />
      ),
      // Host-drawn chrome (RFC 0039): the dock frame draws the cwd breadcrumb
      // strip and the panel fills it via `api.setBreadcrumb`. No chrome
      // component is imported here.
      toolbar: { breadcrumb: true },
      // Recorded (RFC 0041): each open Chat panel becomes a DockPanelRecord on
      // its workspace, so it reopens on restart rather than surviving only as
      // dock-layout geometry. `{ sessionId, profileId, cwd }` rides in that
      // record's `state` (RFC 0042) — see `AcpChatPanel`'s restore flow.
      persistence: "recorded",
      // Claims the Chat half of the Agent Profile list: picking a Chat profile
      // from a dock's + menu, or running its `core.newAgent.<id>` command,
      // opens this panel with that profile's id. A declaration, not a
      // privilege — the same one the bundled panel used to make.
      chatProfileHost: true,
      // No generic entry point (`addMenuItem`, a `silo.acpChat.new` command, a
      // toolbar "+"): a Chat session starts from a *profile* — the
      // agent-profile section of the + menu, the "New Agent" watermark action,
      // or `core.newAgent` — never a profile-less picker.
    }),
  );
}

function deactivate() {
  document.getElementById(STYLE_ID)?.remove();
}

export const extension: Extension = {
  id: "silo.acp-chat",
  activate,
  deactivate,
};
