---
status: draft
created: 2026-06-04
---

# 0001. `ctx.ui` slice 2 — quickPick / inputBox / progress

## Summary

Complete the host-rendered user-interaction surface (`ctx.ui`) with the
remaining primitives: a filterable item picker (`quickPick`), a single-line input
(`inputBox`), and a `progress` indicator. Slice 1 (native OS dialogs, `notify`,
`showMenu`, `confirm`/`prompt` + `Modal`) is already stable.

## Motivation

Extensions need a command-palette-style searchable picker and a way to show
long-running progress. Hand-rolling these fragments the UX and can't match the
host's theming, z-stacking, and focus handling.

## Design

- `ctx.ui.quickPick(items, opts) → Promise<Item | undefined>` — filterable,
  keyboard-driven, cancelable.
- `ctx.ui.inputBox(opts) → Promise<string | undefined>` — with an optional
  validation hook. **Mostly delivered:** the plain single-line case shipped in
  slice 1 as `ctx.ui.prompt`; only the live validation hook is outstanding, which
  is why the roadmap now tracks this RFC as `quickPick` / `progress`.
- `ctx.ui.progress({ title, location }, task) → Promise<T>` — runs `task` behind a
  host-rendered progress indicator (cancellable task chrome — modal /
  notification locations as designed when this lands).

All host-owned chrome, consistent with modals/menus.

### Relationship to StatusBar **busy status** (RFC 0026)

RFC 0026 introduced a separate ambient surface — **busy status**: a host-owned
StatusBar aggregate for multi-writer _in-flight_ phrases (restore terminals,
remove worktree, …), with a numbered badge when N>1 and a click-through popover.
Errors use `notify`, not sticky status.

That work **shipped** (RFC 0026 is `implemented`) and stays host-internal /
`@internal` `ctx.ui.busyStatus` — proven with bundled first-party consumers and
the `busy-status-demo` example, deliberately short of a stable public API. It is
**not** a substitute for this RFC’s `progress` primitive:

|            | Busy status (RFC 0026)                     | `ctx.ui.progress` (this RFC)           |
| ---------- | ------------------------------------------ | -------------------------------------- |
| Purpose    | Ambient “what’s going on” in the StatusBar | Run a task behind host progress chrome |
| Shape      | Multi-writer registry, aggregate slot      | `progress(opts, task) → Promise<T>`    |
| Errors     | `notify`                                   | Task rejection + chrome                |
| Public API | Unstable / internal until graduated        | Planned stable here                    |

When `progress` lands, a natural follow-up is whether a `location: "statusBar"`
option should _feed_ busy status rather than invent a second StatusBar path.
That decision waits until both exist.

## Alternatives considered

- **Extension-rendered pickers/progress** — rejected: fragmented UX, no shared
  theming/stacking.
- **Fold busy status into this RFC as the only progress surface** — rejected:
  ambient multi-writer status ≠ task-scoped progress; see table above.

## Decision

Draft. Demand-driven — lands when a `silo.*`/third-party consumer needs it.
Busy status proceeds under RFC 0026 without blocking this draft.

## References

- [ADR 0018](../decisions/0018-host-owned-chrome.md) (host-owned chrome).
- [RFC 0026](./0026-terminal-session-host-backpressure.md) (busy status + terminal
  backpressure).
