/**
 * Deriving the Chat tab's own adornments (RFC 0038 Session 3.1) — pure so it is
 * unit-tested rather than exercised only through the component.
 *
 * A Chat tab must read like a terminal tab running the same agent: the same
 * activity badge and the same brand icon. `silo.agents` computes the terminal
 * version from an {@link AgentInfo} (`agent-view.ts` `deriveTab` /
 * `AgentIconGlyph`); this is the equivalent for a dock-panel tab, which the
 * panel pushes onto its own tab through `DockPanelApi.setTabActivity` /
 * `setTabIcon` instead of a host binder.
 */

import type { AgentInfo, TabActivityContribution } from "@silo-code/sdk";

/**
 * The activity badge the Chat tab should show for `info`, or `null` for "no
 * badge". Mirrors `silo.agents`' terminal-tab rule: a spinner while a turn
 * runs, a green "ready" dot for a finish the user has not looked at yet
 * (cleared by `ctx.agents.acknowledge` when the tab is viewed), an error mark
 * on a dead process, and nothing at rest.
 */
export function chatTabActivity(
  info: Pick<AgentInfo, "activity" | "needsAttention"> | undefined,
): TabActivityContribution | null {
  switch (info?.activity) {
    case "working":
      return { activity: "working", tooltip: "Agent working" };
    case "error":
    case "dead":
      return { activity: "error", tooltip: "Agent stopped" };
    case "idle":
      return info.needsAttention
        ? { activity: "ready", tooltip: "Agent finished" }
        : null;
    default:
      return null;
  }
}
