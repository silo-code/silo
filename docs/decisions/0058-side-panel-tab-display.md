---
status: accepted
date: 2026-11-06
---

# 0058. Side panel tab display is global, and its icon is a ReactNode

## Context

RFC 0065 adds an icon to the `SidePanel` contribution and lets the user pick per
tab whether that tab renders the icon, the title, or both. Two choices in it
would otherwise be re-argued every time someone touches the tab strip.

**Scope.** Silo already has a well-worn shape for a layout preference that could
be per-workspace: store it per workspace, and offer a global "share across
workspaces" flag with frozen dual state, a confirm dialog, and seeding on
enable/disable (ADR 0035, for Shared Side Panel Layout and Shared Side Panel
Widths). Reaching for it again here was the obvious move, and it is a lot of
machinery.

**Icon type.** The SDK is split on how an icon is supplied, and ADR 0038 flagged
the split as an inconsistency it would not resolve. `NavigatorView.icon`, the
leading `TabIconAdornment`, `MenuItem.icon` and the kit's `TabItem.icon` take a
`React.ReactNode`. `ToolbarItemFields.icon` and `TabIndicatorAdornment.icon` take
a `PhosphorIconName` string, and the toolbar surface moved _off_ nodes
deliberately ("Pass a React node is no longer supported — use the name"). A new
icon field has to pick a side.

## Decision

**Side Panel Tab Display is a global preference.** One value per tab, shared by
every workspace, persisted in the global index beside `uiFontSize` and kept out
of `SharedPanelState`. No per-workspace mode, and no opt-in flag.

**`SidePanel.icon` is a `React.ReactNode`**, with Phosphor at
`weight="duotone" size="1em"` as the documented convention rather than an
enforced one.

## Consequences

### Global scope

Easier: there is nothing to capture, apply, seed, freeze or confirm. The feature
is a map on `AppState`, a setter, and a `??` default at hydrate — no
`capturePanelState`/`applyPanelState` edit, no interaction with ADR 0035's frozen
dual state, no third switch on the Layout settings page. A user who compacts a
tab does it once rather than once per workspace, which is the behavior we expect
most people want: how a tab is _labelled_ is a reading preference, not part of a
workspace's arrangement the way which panels are open and how wide they are is.

Harder: a user who genuinely wants different tab labelling per workspace cannot
have it. We are betting that is rare. If it is asked for, the escape is additive
and does not touch the contribution — add a flag and a per-workspace copy
following ADR 0035, exactly as Shared Side Panel Widths was added beside Shared
Side Panel Layout. Nothing here forecloses that.

Reversible. The persisted key is optional and ignored by any version that
doesn't know it.

### ReactNode icon

Easier: it matches the two closest analogues — the Navigator view list and
leading center-dock tab icons — so a contributor who has supplied one icon in
Silo supplies this one the same way. It also admits the hand-authored two-tone
SVG (a solid glyph over a low-opacity plate) that the status bar uses where
Phosphor has no fitting glyph; a name string would have ruled that out. The
usual objection, that Phosphor is not a shared dep so third parties bundle their
own copy, does not bite: every side-panel-bearing extension in
`silo-code/silo-extensions` already depends on `@phosphor-icons/react` directly.

Harder, and the real cost: the host can force the icon's **size** but not its
**weight**. An extension passing a bold or regular outline glyph will look out of
place beside the duotone set, and nothing fails to compile or lint. Uniformity
here is convention, backed by three cheap things — the CSS slot pins the rendered
size so a stray `size={19}` cannot distort the strip, the TSDoc names the
convention, and the extension checklist states it where a third-party author
looks for what "matches Silo" means.

This also settles ADR 0038's open inconsistency, with a rule rather than a
one-off: **nodes for identity artwork** the extension owns (a panel's icon, a
Navigator view's, a menu row's), **strings for decoration the host paints
uniformly** (toolbar items, tab indicators, the Settings rail). That line is the
one the existing split already follows; it had just never been written down.

The known exit if the icon set drifts badly in practice: widen to
`PhosphorIconName | React.ReactNode` and make the string path the host-painted
one. Additive and non-breaking. We are choosing not to pay for two paint paths
before there is evidence we need them.

## Alternatives considered

- **Per-workspace with a global flag (ADR 0035's shape).** Deferred, not
  rejected — the machinery is real and the demand is hypothetical. Revisit if
  asked for.
- **`PhosphorIconName` string.** Rejected: it would have made uniformity
  enforceable, which is genuinely attractive, but it closes the door on
  hand-authored artwork for a surface where some panels will not map to a stock
  glyph, and it breaks symmetry with `NavigatorView.icon` right next to it.
- **A host-side id→icon map**, as the Settings rail and Extensions catalog do.
  Rejected here: those surfaces defer because the icon would have to come from
  an external registry schema. A side panel's tab is contributed by the
  extension that owns it, so there is nothing to defer.
- **One display mode for the whole strip.** Rejected in RFC 0065.

## References

- RFC 0065 — the change this decides.
- ADR 0035 — Shared Side Panel Layout; the per-workspace-plus-flag shape not
  followed here, and the template if a flag is ever added.
- ADR 0038 — Navigator view list; flagged the node-vs-string inconsistency.
- ADR 0029 / 0030 — side tab chrome vs center, and Activity as host-owned
  busy/ready/warn/error chrome (not identity artwork).
- ADR 0017 / 0026 — the CSS theming contract and the design-system kit, for why
  the icon is `em`-sized and `currentColor`.
- `docs/domain-language.md` — **Side Panel Tab Display**, **Two-Tone Icon**.
