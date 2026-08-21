// The slot algebra: which slots exist, and how a panel's *recorded* slot
// resolves to one the app can actually render.
//
// Pure — no React, no store — so both the layout components and `ctx.layout`
// can share one answer to "where does this panel live" without either one
// re-deriving it. See RFC 0027, which turns the closed slot enum below into
// opaque pane ids; `resolveSidePanelSlot` is the rule that keeps a state file
// written by a build with more slots than this one readable here.

import type { SidePanelSlot } from "../state/types";

/** Every slot this build renders. */
export const SIDE_PANEL_SLOTS: readonly SidePanelSlot[] = [
  "left",
  "right",
  "left-bottom",
  "right-bottom",
];

export function isSidePanelSlot(value: unknown): value is SidePanelSlot {
  return (
    typeof value === "string" &&
    SIDE_PANEL_SLOTS.includes(value as SidePanelSlot)
  );
}

/** Which side column a slot belongs to. */
export function slotToLocation(slot: SidePanelSlot): "left" | "right" {
  return slot.startsWith("left") ? "left" : "right";
}

/**
 * The slot a panel actually renders in: its user override when that names a
 * slot this build knows, otherwise the location it registered with.
 *
 * The fallback is the point. `sidePanelLocations` is written by whichever build
 * last touched the workspace file, and an override naming a slot this build has
 * never heard of — a pane created by a newer build (RFC 0027), a hand-edited
 * file, a value left behind by an extension that has since changed — used to
 * match no slot at all, so the panel rendered *nowhere* while the visibility
 * menu still listed it as visible. Falling back to the registered location
 * degrades that to "the panel is in its default column".
 *
 * Resolution is deliberately **non-destructive**: the unrecognized override is
 * read past, never rewritten. Pruning it would make the panel's placement
 * lossy across a downgrade/upgrade round trip (and across uninstalling and
 * reinstalling the extension that owns it) for no gain — a stale entry is one
 * inert map key.
 */
export function resolveSidePanelSlot(
  override: string | undefined,
  registered: "left" | "right",
): SidePanelSlot {
  return isSidePanelSlot(override) ? override : registered;
}
