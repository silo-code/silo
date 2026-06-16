// Pure, unit-testable rules for the `core.updates` status-bar indicator,
// extracted from index.tsx so the component stays thin glue (cf.
// view-switcher-model.ts). No React, no `ctx`.

import type { UpdatePhase } from "@silo-code/extension-host/internal";

/**
 * Label for the status-bar indicator, or `null` when it should render nothing.
 * It's visible only once a release is waiting (`available`) and while that
 * release is installing (`installing`, shown disabled); every other phase
 * (idle / checking / up-to-date / error) stays invisible.
 */
export function updateLinkLabel(phase: UpdatePhase): string | null {
  if (phase === "available") return "Update Silo";
  if (phase === "installing") return "Installing…";
  return null;
}

/** Whether the indicator is the actionable "Update Silo" link (vs. disabled "Installing…"). */
export function isUpdateActionable(phase: UpdatePhase): boolean {
  return phase === "available";
}

/**
 * Lead sentence for the pre-install prompt — names the release when known, else
 * a generic fallback. The "save your work" warning is rendered separately (and
 * emphasized) by the prompt component, so it isn't part of this string.
 */
export function buildUpdateLead(version: string | null): string {
  const release = version ? `Silo ${version}` : "A new version of Silo";
  return `${release} is ready to install.`;
}
