import { createHostChannel } from "./output-store";

/** Output-panel channel for `ctx.agents` diagnostics — visible in Silo's own
 * Output window, not the devtools console. */
export const agentsChannel = createHostChannel("silo:agents", "Agents");
