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

/**
 * Auto Accept (Dave's call, ported from Paseo's `acp-agent.ts`) — a
 * client-side stand-in for agents whose own protocol has no "stop asking me"
 * mode of its own, answering every permission request without ever showing
 * it. Two pieces, mirroring Paseo's `selectPermissionOption` /
 * `isACPChooserRequest` exactly:
 */

/**
 * The `allow`-kind option to auto-select from a request's `options`,
 * preferring "once" over "always" — or `undefined` when nothing should be
 * auto-picked: no allow option at all, or two *distinct* options sharing the
 * same allow kind (a genuine chooser — e.g. "allow with sandbox" vs. "allow
 * full access" — with nothing safe to guess between).
 */
export function autoAcceptOptionId(
  options: readonly { readonly optionId: string; readonly kind: string }[],
): string | undefined {
  const seenAllowKinds = new Set<string>();
  for (const opt of options) {
    if (!opt.kind.startsWith("allow")) continue;
    if (seenAllowKinds.has(opt.kind)) return undefined;
    seenAllowKinds.add(opt.kind);
  }
  for (const kind of ["allow_once", "allow_always"]) {
    const match = options.find((opt) => opt.kind === kind);
    if (match) return match.optionId;
  }
  return undefined;
}

/**
 * Whether the connected agent already advertises its own full-bypass mode
 * (Claude's `bypassPermissions`, surfaced in its own mode dropdown) — when
 * it does, a separate Auto Accept toggle would just be a second, confusing
 * way to reach the same thing, so the composer hides it rather than stack
 * two controls with overlapping meaning.
 */
export function agentHasBypassMode(
  configOptions: readonly {
    readonly options: readonly { readonly value: string }[];
  }[],
): boolean {
  return configOptions.some((opt) =>
    opt.options.some((choice) => choice.value.toLowerCase().includes("bypass")),
  );
}
