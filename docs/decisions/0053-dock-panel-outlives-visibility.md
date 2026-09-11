---
status: accepted
date: 2026-09-11
---

# 0053. A dock panel outlives its visibility; the host resolves "on screen"

## Context

A dock panel is created **once per tab**. The dock renders it through a React
portal into a container element it owns, and deselecting the tab removes that
element from the document and re-appends it when the tab comes back. The
component is never unmounted: its state and its refs survive the round trip
untouched. Backgrounding a whole workspace does not even detach — every warmed
workspace keeps its dock in the tree, and the inactive ones are simply not
shown.

Detaching an element destroys its layout box, and with it everything the browser
keeps there rather than in the DOM. **Scroll offsets first among them.**

Those two facts together produce a trap that is invisible from inside a panel. A
panel that restores a scroll position, re-measures a canvas, or refits a
character grid "on mount" runs that code exactly once — at tab creation, when
there is nothing yet to restore — and never again, while the thing it was
guarding against happens on every tab switch. Two successive attempts to persist
the Chat panel's transcript scroll position failed here. Both hung the restore
off mount and then looked for the defect in the restore mechanics, because the
symptom (a position that never comes back) is identical either way. The terminal
carried the same defect from the other direction: its grid refit was driven by
the tab-visibility event alone, so coming back to a backgrounded workspace at a
different size never re-measured.

A second force runs alongside it. "The user can see this panel" has two halves
and the dock library knows only one. Its own notion of visibility covers the tab
being the selected one in its group; it has no concept of a workspace, so the
selected tab of a backgrounded workspace reports itself visible. A panel reading
that signal alone is confidently wrong. The Chat panel's first fix composed the
two halves itself — the panel api plus `ctx.workspaces` — which is the shape
ADR 0032 and ADR 0034 were both written against: more than one actor answering
one question, and no guarantee they agree.

## Decision

Two parts, and the second is what makes the first safe to rely on.

**A dock panel outlives every visibility change.** Anything a panel reads from
or writes to the DOM belongs on an **on-screen transition**, never on mount.
Mount happens once, when the tab is created, and never again.

**"On screen" is one question with one authority.** The host resolves both
halves and hands the answer to every dock panel as `DockPanelProps.onScreen` —
true only when the panel's tab is the selected one in its group _and_ its
workspace is the active one. A panel must not reconstruct it from
`DockPanelApi.isVisible` plus `ctx.workspaces`.

Two corollaries worth stating, because both were learned the expensive way:

- **Capture while on screen, never on the way out.** The element is already
  detached by the time the flag turns false, and a detached scroller reads `0`.
  A panel records DOM state from live events while it is on screen and reads the
  recorded value afterwards.
- **On screen is a third word.** It is not _visible_ (the tab half alone) and
  not _active_ (focus — the single panel in the whole dock that has it). All
  three now exist and have to stay distinguished; the glossary carries the
  distinction.

## Consequences

- **Easier:** the trap has one fix in one place. Applying `onScreen` to the
  terminal closed its latent refit bug as a side effect, with no new logic.
- **Easier:** the rule is now nameable in advance for every future panel that
  holds browser-owned state — scroll, text selection, canvas contents, a
  character grid, an uncommitted composer draft.
- **Harder / accepted:** three adjacent words for three adjacent states is a
  real teaching cost. Mitigated by documenting the distinction on the prop
  itself, on the registration page, and in the glossary, rather than trusting
  anyone to infer it.
- **Neutral:** the prop is additive and host-supplied. A panel that ignores it
  still compiles, and no extension can forge it.
- **Commits us to:** the host owning the workspace half. That is the point — a
  future layout that shows two docks at once (ADR 0033) changes one function
  instead of every panel that ever cared.
- **Reversible:** if a non-React consumer ever needs it, an api-side
  subscription can be added beside the prop without disturbing this decision.

## Alternatives considered

- **Each panel composes the two halves itself** (the panel api plus
  `ctx.workspaces`). What shipped first. **Rejected** — it duplicates knowledge
  the host already has, it silently breaks the day two docks are shown at once,
  and the terminal proved independently that a panel author given only the tab
  half will use it and be wrong. Same failure class as ADR 0032 and ADR 0034.

- **Keep every panel's element attached** — the dock library can hold a panel in
  a shared overlay container and hide it with `visibility` rather than detaching
  it, which preserves scroll offsets and makes this ADR's restore problem
  disappear at its root. **Deferred, not rejected**, for three reasons. It is
  not reachable today: the renderer is not part of the panel-kind contract, so
  adopting it is new public surface plus a host change — a larger change than
  the one it would replace, for a problem already solved. It would not remove
  this ADR's second half, because the library still cannot see workspaces. And
  the risk is asymmetric: being wrong about keeping every tab of every warmed
  workspace laid out and position-synced is the memory-amplification class of
  failure this app has already been bitten by, while being wrong about deferring
  costs one panel's retry loop. Revisit with a measurement, not an argument.

- **Have the host restore dock-panel scroll itself**, as it already does for
  side panels. **Rejected** — a side panel's scroller _is_ the pane element the
  host owns, which is why that works. A dock panel's scroller is arbitrary DOM
  inside the extension's own tree, and the host reaching into it would cross the
  chrome/content line ADR 0018 draws.

- **Expose it as an api member rather than a prop.** **Deferred** — a prop
  re-renders the panel when it changes, which is what a React panel wants, and
  it cannot be read at a stale moment the way a getter can.

## References

- ADR 0018 — host-owned UI chrome (the chrome/content line)
- ADR 0032 — one authority decides a dock's active panel
- ADR 0033 — Laptop Mode is a second independent layout
- ADR 0034 — focus/activation: the live dock, and only the active panel
- Code: `packages/extension-host/src/extension-host/dock-panel-kinds.ts`
  (`dockPanelIsOnScreen` — the rule, and the hook that feeds it),
  `packages/sdk/src/types.ts` (`DockPanelProps.onScreen`),
  `packages/extensions-silo/src/agents-chat-panel/` (the Chat panel's transcript
  scroll, the first consumer), `packages/extensions-core/src/terminal/` (the
  grid refit)
- Provenance, plain text: RFC 0041 introduced recorded dock panels and their
  per-panel restore state; RFC 0042 covers Chat session resurrection, whose
  transcript is what surfaced this. The detach itself happens in dockview 6.3's
  `ContentContainer.renderPanel`, under its default per-panel renderer.
