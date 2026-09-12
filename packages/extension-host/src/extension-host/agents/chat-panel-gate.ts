/**
 * Applying the `chatAgents` gate to the bundled Chat panel (RFC 0038).
 *
 * ## Why this is not just a branch in the composition root
 *
 * It was, and it could never work. `activateBuiltins()` runs
 * **synchronously before the first render** — the dock needs every panel kind
 * present when it deserializes the saved layout — but `chatAgents` lives in
 * the persisted index, which `hydrate()` loads **asynchronously, afterwards**.
 * So a flag read inside `activateBuiltins()` always sees the `false` default,
 * no matter what the user set or how many times they restart.
 *
 * The fix is to use the machinery built-ins already have for exactly this: the
 * panel is registered at boot but **not activated** (`activateExtensions`'
 * `disabledBuiltins` argument — "recorded but not activated, so a disabled
 * built-in never contributes to the first frame"), and this function activates
 * it once the real value is known. Nothing is registered while the gate is
 * off, so a release ships the code inert.
 *
 * It also runs when the user flips the switch, so turning Chat agents on takes
 * effect immediately instead of needing a restart.
 *
 * The extension id comes from the **caller**, not from here — the host has no
 * business knowing what the bundled Chat panel is called.
 */

import { getChatAgentsEnabled } from "../../state/store";
import { enableBuiltin, disableBuiltin } from "../builtins-registry";

/** Seams for the unit test; production callers pass nothing. */
export interface ChatAgentsGateDeps {
  enabled(): boolean;
  enable(id: string): void;
  disable(id: string): void;
}

const defaultDeps: ChatAgentsGateDeps = {
  enabled: getChatAgentsEnabled,
  enable: enableBuiltin,
  disable: disableBuiltin,
};

/**
 * Bring the bundled Chat panel in line with the `chatAgents` setting.
 *
 * Idempotent in both directions — `enableBuiltin` / `disableBuiltin` no-op
 * when the built-in is already in the requested state — so it is safe to call
 * on every hydrate and on every flip of the switch. Neither call persists
 * anything: the gate is derived from `chatAgents`, and writing to the user's
 * `disabledBuiltins` set would confuse "the feature is off" with "I turned
 * this extension off".
 */
export function applyChatAgentsGate(
  extensionId: string,
  deps: ChatAgentsGateDeps = defaultDeps,
): void {
  if (deps.enabled()) deps.enable(extensionId);
  else deps.disable(extensionId);
}
