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
 * a generic fallback. The restart-reassurance callout is rendered separately by
 * the prompt component, so it isn't part of this string.
 */
export function buildUpdateLead(version: string | null): string {
  const release = version ? `Silo ${version}` : "A new version of Silo";
  return `${release} is ready to install.`;
}

/**
 * Whether `version` should be suppressed on the passive status-bar link
 * because the user already dismissed it via "Skip this version" (or a
 * version at least as new — ADR 0036). Only applies to the passive surface —
 * a manual "Check for Updates" always bypasses this and shows the real result.
 */
export function isVersionSkipped(
  version: string | null,
  skippedVersion: string | null,
  compare: (a: string, b: string) => number,
): boolean {
  if (!version || !skippedVersion) return false;
  return compare(version, skippedVersion) <= 0;
}

/** What the unified "Check for Updates" command (menu + palette) should do for a given phase. */
export type CheckOutcome =
  | { kind: "prompt" }
  | { kind: "toast"; level: "info" | "error"; message: string }
  | { kind: "none" };

/**
 * Maps a check's resulting phase to a presentation action: `available` opens
 * the update modal; `upToDate`/`error` show a toast; everything else (e.g.
 * `checking`, transiently) does nothing.
 */
export function describeCheckOutcome(phase: UpdatePhase): CheckOutcome {
  if (phase === "available") return { kind: "prompt" };
  if (phase === "upToDate") {
    return {
      kind: "toast",
      level: "info",
      message: "You're on the latest version.",
    };
  }
  if (phase === "error") {
    return {
      kind: "toast",
      level: "error",
      message: "Couldn't check for updates.",
    };
  }
  return { kind: "none" };
}
