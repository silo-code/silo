---
status: implemented
created: 2026-09-16
---

# 0049. `usePanelEntryFocus` — entry focus as one published call

## Summary

Landing the caret inside a dock panel when the user enters it is harder than it
looks — a single `focus()` loses dockview's focus shuffle — and Silo had three
answers to it: a correct one the host kept `@internal`, a hand-rolled copy
inside `silo.agents-chat-panel` written because a `silo.*` extension cannot
import host internals, and a third, knowingly-wrong one in the public docs that
told third parties to call `focus()` once. This promotes the correct answer to
the public SDK as `usePanelEntryFocus`, and collapses the other two onto it.

Nothing new crosses the host ↔ extension boundary in terms of _capability_ —
the hook is pure DOM/React and already ran inside extensions. What moves is
**authorship**: entry focus stops being something every panel re-derives and
becomes one supported call with one behavior.

## Motivation

### One problem, three implementations, one of them wrong

A freshly-mounted or newly-activated dock panel does not reliably inherit DOM
focus. dockview runs its own focus shuffle on mount/activate, and rich content
(Monaco, xterm) only accepts focus once its internal textarea has non-zero
dimensions. A single `focus()` call loses that race, which is why a viewer would
otherwise need a second click before you can type. ADR 0034 records the rest of
the shape: the grab must be guarded on `isActive` for the _life_ of the retry
(an unguarded mount-time grab in a background tab steals focus and, because
dockview activates the group that receives focus, silently changes the visible
active tab), and it must stand down when focus legitimately lands in an open
context menu.

ADR 0034's third signal — `DockPanelApi.onDidRequestFocus`, the tab click that
leaves the active panel unchanged — made the correct shape strictly larger: two
subscriptions _plus_ a guarded retry.

Before this change that shape existed three times:

| Where                                                    | What it did                                                                                                      |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `useFocusOnActive` (host, `@internal`)                   | Both subscriptions + guarded retry. Correct.                                                                     |
| `AcpChatPanel` (`silo.*`)                                | A hand-rolled 20-frame rAF copy, with the reason in a comment: a `silo.*` extension cannot import the host hook. |
| `apps/docs/api/registration/register-dock-panel-kind.md` | A bare `focus()` on both events, no retry.                                                                       |

The docs example is the one that matters most. It is the only version a
third-party author ever sees, and the repo already knows it doesn't work — both
in-repo implementations exist _because_ it doesn't. Documenting a pattern we've
twice refused to ship is worse than documenting nothing.

### Why the boundary forces this and not a shortcut

`@silo-code/extensions-silo` depends on `@silo-code/sdk` alone; it physically
cannot resolve `@silo-code/extension-host/internal`. That is the package graph
doing its job, and widening the internal subpath to `silo.*` to fix this would
trade the boundary for a convenience. The only move that serves `silo.*`, third
parties, and the bundled `core.*` viewers at once is to put the hook in the
public SDK — where React hooks (`useFocusGroup`, `useServiceState`) already
live.

## Design

### The surface

```ts
interface PanelEntryFocusTarget {
  focus: () => void;
  isFocused: () => boolean;
  blur?: () => void;
}

function usePanelEntryFocus(
  api: DockPanelApi,
  target: PanelEntryFocusTarget,
): () => void;
```

The hook subscribes to **both** entry signals — `onDidActiveChange` and
`onDidRequestFocus` — and drives the `isActive`-guarded frame retry for each,
so the whole "subscribe to both, guard both, retry until it lands" shape is one
call. On deactivation it calls the optional `blur`, which is what keeps a
kept-alive Monaco/xterm from stealing keystrokes from the tab you switched to.

It **returns a stable imperative trigger** running the same guarded retry. That
return value is the part the previous host hook lacked, and it is what lets the
hook serve every real consumer:

- `AcpChatPanel` focuses its composer when the composer becomes writable —
  which is neither a mount nor an activation.
- `TerminalPanel` focuses after the PTY spawns, well after activation.
- `TextViewer` / `DiffPanel` focus when Monaco mounts.

Each of those previously called the host's raw `retryFocus` with a hand-written
`if (api.isActive)` in front. Without the trigger, the retry primitive itself
would have to be published to make the hook usable by a third party with any
readiness condition at all — a strictly larger public surface for a strictly
worse story. `retryFocus` therefore stays exported from the SDK barrel but
tagged `@internal`, the same treatment `setActiveInlineEditCancel` gets: host
and `core.*` plumbing, excluded from the generated reference.

Target callbacks are read through a latest-ref, so an inline closure over props
or state is current every time the hook invokes it. That matters for a public
hook — the effect deliberately depends on `api` alone (re-subscribing on every
render would be worse), and without the ref an author's `focus` closure would
silently freeze at its first render.

### Naming

`useFocusOnActive` described two thirds of what the hook does. "Entry focus" is
already the term ADR 0034 reaches for in prose, and the gesture half is the
glossary's **Focus Request**; `usePanelEntryFocus` names the whole job in the
vocabulary that already exists. **Entry Focus** is added to
`docs/domain-language.md` as part of this change.

### Behavior unified along the way

The two in-repo copies disagreed on which open menus suppress the grab: the
host matched Monaco's `.context-view` / `.monaco-menu` but not Silo's own menus,
while the chat panel matched `[data-silo-menu]` / `[role="menu"]` but not
Monaco's. Neither was right. The published hook matches the union, so
right-clicking an inactive panel no longer risks the retry stealing focus back
from the menu that click just opened — for either menu implementation.

## Alternatives considered

- **Widen `@silo-code/extension-host/internal` to `silo.*`.** Breaks the
  package-graph boundary that makes the host/extension contract enforceable
  rather than aspirational, and does nothing for third parties — the audience
  whose copy of this logic is the broken one.
- **Leave the docs example as-is.** It documents a pattern the repo knows
  doesn't work. Third-party panels built from it get the "needs a second click"
  bug with no way to discover why.
- **Publish `retryFocus` instead of the hook.** Cheaper to export, but leaves
  every author to re-derive the two subscriptions and the `isActive` guard —
  which is exactly the part all three implementations got subtly different.
- **Take a ref instead of callbacks** (`usePanelEntryFocus(api, inputRef)`).
  Ergonomic for a plain `<textarea>`, useless for Monaco and xterm, which are
  three of the four real consumers. Rejected as a second shape to document for
  the minority case.
- **Add an `enabled` option** for content that isn't ready to take focus.
  Unnecessary: a disabled input's `focus()` is already a no-op, and anything
  with a real readiness condition wants the imperative trigger anyway.

## Decision

Accepted and implemented in the same change. `usePanelEntryFocus` +
`PanelEntryFocusTarget` are exported from `@silo-code/sdk`; `useFocusOnActive`
is gone from `@silo-code/extension-host/internal`; `AcpChatPanel`'s copy and the
docs example both call the hook. The roadmap row ships alongside
`DockPanelApi.onDidRequestFocus` (RFC-adjacent work in the same branch) and both
flip to `stable` with the SDK release that carries them.

Related: [ADR 0034](../decisions/0034-focus-and-activation-authority.md) —
focus and activation authority, which this hook is the one sanctioned
implementation of for panel content.
