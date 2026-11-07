---
status: implemented
created: 2026-11-06
---

# 0065. Side panel tab icons and per-tab display

## Summary

Give every Side Panel optional identity artwork, and let the user decide per tab
whether that tab shows the icon, the title, or both. Adds `icon` to the public
`SidePanel` contribution and a `SidePanelTabDisplay` user preference the
extension never touches.

## Motivation

The SideDock tab strip was the one piece of Silo chrome with no visual identity.
Workspaces, the Navigator view list, the Settings rail, the Extensions catalog
and the status bar all carry two-tone icons; the tab strip was uppercase 12px
text and nothing else. A user with six panels docked on the right reads six
words where the rest of the app gives them a glyph to aim at, and the strip gets
wide enough to need scrolling well before it runs out of useful panels.

RFC 0022 already anticipated this. It scoped itself to _adornments_ — the
owner-supplied Activity on a side tab — and explicitly left identity to "a future
static icon on the contribution", reserving the leading-icon slot for the
registration rather than an adorn API. This is that field.

The display mode is the other half. An icon alone is not obviously better: an
unlabelled glyph is harder to learn, and a panel that never got an icon has
nothing to draw. Making it a per-tab user choice means the compact strip is
available to whoever wants it without changing anyone's app on upgrade, and
without forcing every extension author to ship artwork before their panel looks
right.

## Design

### The contribution

`SidePanel.icon?: React.ReactNode` — a node, matching `NavigatorView.icon` and
the leading `TabIconAdornment` on center-dock tabs, with Phosphor at
`weight="duotone" size="1em"` as the documented convention. ADR 0058 records why
a node rather than a `PhosphorIconName` string, and what that costs.

Supplying an icon does not display it. The extension offers artwork; the user
decides. A panel must still carry a meaningful `title`.

### The preference

`SidePanelTabDisplay = "icon" | "title" | "both"`, stored as a map keyed by side
panel id and **global** — one value per tab across every workspace. It lives on
`AppState` beside `uiFontSize` and in the global index, deliberately outside
`SharedPanelState`, so it never passes through the capture/apply pair or ADR
0035's frozen-dual-state machinery. ADR 0058 records that choice.

Two clamps keep the strip readable:

- An absent entry is `"title"` — the pre-icon rendering, so nothing changes on
  upgrade. The default is also never written: setting a tab back to `"title"`
  deletes its key, and an untouched map is omitted from the persisted index
  entirely.
- A panel with **no** icon always resolves to `"title"`, whatever is stored for
  its id. This is what keeps a third-party panel built against an older SDK, or
  one that dropped its icon in an update, from rendering an empty tab.

Every value is re-narrowed at hydrate: the map is hand-editable and keyed by
arbitrary panel ids, so one junk mode must degrade to a readable tab rather than
break the strip.

### Where it is chosen

A "Tab Display" submenu on the tab's existing context menu — three checkable
rows, the effective one checked. A submenu rather than a flat section because
that menu already carries move, split, and the full Side Panels visibility list;
three more top-level rows would push it past a glanceable length. A panel with no
icon contributes no submenu at all, since "Title" would be the only reachable
option.

### Paint

Both children render **inside** `button.tab`. Every pointer handler on the bar
resolves its target with `closest("button.tab")` and the drop-index query counts
`.tab` elements, so a sibling span would break drag ordering the way the
Wordmark deliberately sits outside them.

An icon-only tab loses its accessible name with the text gone, so it states
`aria-label` outright and is the one element in the strip with a hover hint — the
SDK `Tooltip`, never a native `title`.

The icon slot pins the rendered size rather than trusting the contribution:
`icon` is a node, so a panel may hand over `size={19}` or an SVG with its own
dimensions, and one oversized glyph would push the whole strip taller.

## Alternatives considered

- **One mode for the whole strip, or one per SideDock.** Simpler to persist and
  guarantees a uniform strip. Rejected: panels differ in how recognisable their
  glyph is and how much the title earns its width, and a per-tab choice is what
  lets a user compact the three panels they know while leaving a rarely-used one
  labelled. Accepted cost: a strip can look ragged if a user mixes modes
  arbitrarily.
- **Per-workspace with an opt-in "apply to all" flag**, the shape Shared Side
  Panel Layout and Shared Side Panel Widths use (ADR 0035). Rejected for now —
  see ADR 0058. A flag can be added later without changing the contribution.
- **A host-side id→icon map**, the way the Settings rail (`PAGE_ICONS`) and the
  Extensions catalog (`extension-icons.ts`) do it. That deferral made sense for
  those surfaces because third-party icons would have needed a registry schema
  change first. It does not apply here: a side panel's tab is contributed by the
  extension that owns the panel, so the icon belongs on the contribution.
- **`PhosphorIconName` string.** Weighed seriously; see ADR 0058.
- **Defaulting to `"both"`** to showcase the new icons. Rejected: it changes
  every user's tab strip on upgrade, and third-party panels would render a
  reserved-but-empty slot until they bump the SDK.

## Decision

Accepted and implemented as described. ADR 0058 records the two decisions that
would otherwise be re-litigated — the global (not per-workspace) scope, and the
node-not-string icon type.

The companion change in `silo-code/silo-extensions` — adding `icon` to the six
third-party side panels — is **not** part of this and is blocked on the SDK
publish, since third-party extensions ride the last published SDK.

## References

- ADR 0058 — the two decisions this crystallizes.
- RFC 0022 — side-panel tab adornments; reserved this field and did not fill it.
- ADR 0029 / 0030 — why side tab chrome is thinner than center, and Activity as
  the shared busy/ready language (distinct from identity artwork).
- ADR 0035 — Shared Side Panel Layout, the per-workspace-plus-flag shape this
  deliberately does not follow.
- ADR 0038 — noted the ReactNode-vs-string inconsistency this settles.
- `apps/docs/api/registration/register-side-panel.md` — the authored contract.
