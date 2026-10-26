/**
 * Keeping the Mode picker honest when the user approves a plan.
 *
 * Approving a plan is the one place an agent changes its own permission mode
 * *as a side effect of answering a permission request*, and the adapter does
 * not consistently announce it. On `claude-agent-acp` 0.75.1 the
 * `ExitPlanMode` request offers up to four accepts, and only some of them
 * reach the client as a `current_mode_update`:
 *
 * | Selected option                   | Adapter does                                           | Client told? |
 * | --------------------------------- | ------------------------------------------------------ | ------------ |
 * | `exit-plan-clear-*`               | restarts the query, then publishes `current_mode_update` | yes         |
 * | `exit-plan-accept-edits` / `-auto` / `-bypass` / `-default` | returns `allow` + `updatedPermissions: [{ type: "setMode", … }]` | **no** |
 *
 * The second row is the gap: the Claude SDK really does move the session's
 * permission mode, but the adapter never mirrors it back onto its own `mode`
 * config option, so Silo's picker goes on reading "Plan" while the agent is
 * actually accepting edits. This module closes it by deriving the new mode
 * from the option the user picked.
 *
 * Two rules keep that inference from becoming a vendor guess:
 *
 * 1. **The tool name must be `ExitPlanMode`.** Option ids are a vendor's own
 *    vocabulary and `exit-plan-default` means nothing outside this request.
 * 2. **The derived mode must already be a choice on the session's `mode`
 *    config option.** An agent that reuses an id but has no such mode gets
 *    nothing applied, rather than a `currentValue` no `Select` can render.
 *
 * The result is applied **locally only** — it reflects a change the agent has
 * already made, so pushing it back as `session/set_config_option` would
 * re-set the mode the adapter just set, for nothing.
 *
 * Residual, deliberately not modelled: when the active model does not support
 * Auto, the adapter clamps `auto` to `acceptEdits` without publishing a mode
 * update, so the picker can read "Auto" while the session is on Accept edits.
 * Replicating that clamp would mean teaching the host which models support
 * Auto; the adapter already posts an "Auto mode unavailable" notice into the
 * transcript, which is the honest signal.
 */

/** The ACP tool whose permission request is a plan approval. */
export const EXIT_PLAN_TOOL_NAME = "ExitPlanMode";

/**
 * `claude-agent-acp`'s plan-approval option ids → the permission mode each
 * one leaves the session in (`permissions/options/shared.js`,
 * `permissions/effects.js` in that package).
 *
 * The `-clear-` variants are here for completeness, not because they need
 * fixing: that path publishes its own `current_mode_update`, which lands on
 * the same value through the same code. Mapping them keeps this table a
 * readable mirror of the adapter's rather than a list of exceptions.
 */
const PLAN_APPROVAL_MODE_BY_OPTION: Readonly<Record<string, string>> = {
  "exit-plan-default": "default",
  "exit-plan-accept-edits": "acceptEdits",
  "exit-plan-auto": "auto",
  "exit-plan-bypass": "bypassPermissions",
  "exit-plan-clear-accept-edits": "acceptEdits",
  "exit-plan-clear-auto": "auto",
  "exit-plan-clear-bypass": "bypassPermissions",
};

/**
 * The tool a `session/request_permission` is about, read out of its raw
 * params.
 *
 * `toolCall.name` is the adapter's own field rather than part of the ACP
 * `ToolCall` model, so it is read off `raw` defensively and may well be
 * absent on another agent — which simply means no mode is derived.
 */
export function permissionToolName(
  raw: Readonly<Record<string, unknown>>,
): string | undefined {
  const toolCall = raw.toolCall;
  if (typeof toolCall !== "object" || toolCall === null) return undefined;
  const name = (toolCall as Record<string, unknown>).name;
  return typeof name === "string" && name.length > 0 ? name : undefined;
}

/**
 * The mode the session is in after the user answered a plan approval with
 * `optionId`, or `undefined` when this answer says nothing about the mode —
 * a different tool, a decline ("No, keep planning"), an unrecognized option,
 * or a mode this session does not offer.
 *
 * @param availableModes - the `value`s of the session's `mode` config option.
 */
export function modeAfterPlanApproval(args: {
  readonly toolName: string | undefined;
  readonly optionId: string;
  readonly availableModes: readonly string[];
}): string | undefined {
  if (args.toolName !== EXIT_PLAN_TOOL_NAME) return undefined;
  const mode = PLAN_APPROVAL_MODE_BY_OPTION[args.optionId];
  if (!mode) return undefined;
  return args.availableModes.includes(mode) ? mode : undefined;
}
