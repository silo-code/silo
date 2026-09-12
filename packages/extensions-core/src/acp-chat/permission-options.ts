/**
 * Styling the buttons on an inline permission request (RFC 0038 phase 3).
 *
 * The protocol's option `kind` is a coarse category — `"allow_once"`,
 * `"allow_always"`, `"reject_once"`, `"reject_always"` — and **a vendor may
 * send something else entirely**, so this maps by prefix and falls back to the
 * neutral treatment rather than guessing.
 */

import type { ButtonVariant } from "@silo-code/sdk";

/**
 * Which {@link ButtonVariant} an option's `kind` earns.
 *
 * An allow is the affirmative action, so it takes the accent. A reject is
 * **not** `"danger"`: declining a tool call is the safe, reversible answer,
 * and painting it red would invert which button reads as the cautious one.
 */
export function permissionButtonVariant(kind: string): ButtonVariant {
  if (kind.startsWith("allow")) return "primary";
  return "normal";
}
