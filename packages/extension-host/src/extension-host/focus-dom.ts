// The host's one tabbable/focusable DOM vocabulary (RFC 0012 §C). Before this,
// four near-identical selectors lived in side-pane-focus, dock-api-registry,
// Modal, and StatusBar — each subtly different, and one carried the
// `tabindex="-1"`-on-buttons bug. They all import from here now, so "what counts
// as tabbable" is defined once. (The public SDK focus-group hook keeps its own
// copy on the public side, by design — this is host-internal.)

// The focusable element kinds, bare — the single source both selectors derive
// from, so the "INTERACTIVE ⊇ TABBABLE" relationship is structural, not a pair of
// lists to keep in sync by hand.
const KINDS = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "[tabindex]",
  '[contenteditable="true"]',
];
// The kinds that carry a `disabled` state (a disabled one isn't tabbable).
const DISABLEABLE = new Set(["button", "input", "select", "textarea"]);

// Controls that own their own click focus — a pointerdown on one of these is NOT
// "background", so click-to-enter leaves it alone (it focuses itself). The bare
// kinds: a clicked control focuses itself regardless of `disabled`/`tabindex`.
export const INTERACTIVE = KINDS.join(", ");

// Elements that take keyboard Tab focus — the kinds narrowed to real tab stops:
// disableable controls must be enabled, and every clause excludes `tabindex="-1"`
// so a deliberately-untabbable control (e.g. a list row's close button) is never
// treated as a tab stop, no matter which clause it would otherwise match.
export const TABBABLE = KINDS.map(
  (k) =>
    `${DISABLEABLE.has(k) ? `${k}:not([disabled])` : k}:not([tabindex="-1"])`,
).join(", ");

/** The first tabbable element under `root`, or null. */
export function firstTabbable(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>(TABBABLE);
}

/** Every tabbable element under `root`, in document order. */
export function tabbablesIn(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE));
}

/**
 * Focus the first tabbable element under `host`, else `host` itself (made
 * programmatically focusable with `tabindex="-1"` if needed). Always lands focus
 * somewhere inside `host` and returns true — the entry fallback for a region
 * whose content has no natural tab stop.
 */
export function focusFirstOrContainer(host: HTMLElement): boolean {
  const focusable = firstTabbable(host);
  if (focusable) {
    focusable.focus();
    return true;
  }
  if (!host.hasAttribute("tabindex")) host.setAttribute("tabindex", "-1");
  host.focus();
  return true;
}
