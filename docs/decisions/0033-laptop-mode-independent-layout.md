---
status: accepted
date: 2026-08-06
---

# 0033. Laptop Mode is a second independent layout

## Context

When the app window is narrow (e.g. a laptop without an external monitor),
users collapse side columns and resize them to cope. That used to mutate the
one saved layout: opening a panel for the small screen followed you back to
the wide monitor, and a workspace switch threw the narrow arrangement away
entirely. The forces:

- A narrow window needs different collapse and width choices than a wide one.
- Those choices must survive a workspace switch and come back when the window
  is narrow again.
- Side columns should stay a fixed pixel width across resize; percentage
  layouts rescale with the window and undo what the user set.

## Decision

**Laptop Mode** is a second, independent layout mode — not a temporary tweak
of the normal-width layout. Each workspace remembers both:

1. Normal-width collapse (`leftPanelCollapsed` / `rightPanelCollapsed`)
2. Laptop Mode collapse (`smallScreenCollapsed`, absent until the mode has
   applied)

The mode that isn't on screen sits in `inactiveModeCollapsed`; entering or
leaving Laptop Mode is a swap. Column widths are stored the same way — one
px pair per mode — and derived against the live window so sides stay put and
the center absorbs resize. **Peek** (edge overlay of a collapsed side) is
available whenever a side is collapsed, not only in Laptop Mode.

## Consequences

- Narrow-window coping no longer pollutes the wide layout, and vice versa.
- Persistence and the live store must keep both modes in sync on every
  workspace switch (captured in `SharedPanelState` / `panel-state.ts`).
- "Small-screen mode" remains the code name; user-facing language is Laptop
  Mode (`CONTEXT.md`).

## Alternatives considered

- **One layout, temporarily collapsed on narrow windows** — rejected: the
  narrow choices leak into the wide layout and are lost on workspace switch.
- **Keep percentage column widths** — rejected: sides rescale with the
  window instead of holding the px size the user set.

## References

- Glossary: `CONTEXT.md` (Laptop Mode, Peek).
- Related: [0022](./0022-on-disk-storage-layout.md) (where layout prefs live).
- Related: [0035](./0035-global-side-panel-layout.md) — an opt-in, off-by-default
  flag that shares side-panel arrangement (including both of this ADR's layout
  modes) across every workspace. An earlier version of this ADR rejected a
  _global_ Laptop Mode layout outright; 0035 supersedes that specific point —
  per-workspace remains the default, but sharing is now available as a
  deliberate opt-in built for that purpose, which the original alternative
  never considered.
