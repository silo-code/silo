---
status: draft
created: 2026-08-13
---

# 0024. A claim protocol for git detection UI (suppressing the built-in toast)

## Summary

Let a third-party (or first-party) extension **own the UI response** to a
detected worktree or missing folder — showing its own richer prompt instead
of, not alongside, Silo's built-in "New worktree detected" /
"Workspace folder not found" toasts. Adds a single-claim registration on
`GitAPI`, modeled directly on `DndService.registerDropTarget`'s
`onDrop(ctx): boolean | void` — return `true` to claim it. The passive
`GitRepoStore.onWorktreeAdded` / `onFolderMissing` events from ADR 0037 are
unchanged and keep working for anyone who just wants to observe.

## Motivation

ADR 0037 made worktree/missing-folder detection ambient and reliable, but it
didn't make the _response_ to a detection extensible. `notifyNewWorktree` /
`notifyMissingFolder` (`git-explorer/notify-new-worktree.ts`,
`notify-missing-folder.ts`) are wired directly to
`GitRepoStore.onWorktreeAdded` / `onFolderMissing` in `git/index.ts`'s
`activate()` — hardcoded, first-party, no seam.

If a third-party extension also subscribes to `onWorktreeAdded` to show a
richer UI (e.g. a prompt that lets you pick a branch-naming convention, or
auto-opens the worktree in a new pane), it gets that richer UI **in addition
to** Silo's own toast, not instead of it — `Event<T>` is pure multicast, with
no concept of "someone already handled this." Two prompts for one worktree is
worse than the one prompt we started with.

This was flagged and deliberately deferred while building ADR 0037 (see its
"Not in scope" section) — real design surface, no concrete consumer asking
for it yet at the time. It's written up now so the design isn't lost and
whoever picks it up (possibly a future pass on this same work) isn't starting
cold.

## Design

### The claim protocol

```ts
// @silo-code/git-api

/** Return `true` to claim this detection — suppresses every handler
 *  registered before this one, including the built-in toast (see
 *  "Built-in as just the first handler" below). Return `false`/`undefined`
 *  to let it fall through. */
export interface GitDetectionHandler {
  onWorktreeAdded?(workspaceId: string, wt: GitWorktree): boolean | void;
  onFolderMissing?(workspaceId: string, folder: string): boolean | void;
}

export interface GitAPI {
  // ...existing members, including watchRepo (ADR 0037)...

  /**
   * Register a handler that gets first refusal on how a detected worktree
   * or missing folder is surfaced. Handlers run most-recently-registered
   * first, so a third-party extension — which always activates after
   * built-ins — naturally gets to decide before the built-in toast does,
   * with no priority field needed. Returns a Disposable to unregister.
   */
  registerDetectionHandler(handler: GitDetectionHandler): Disposable;
}
```

### Built-in as just the first handler, not a special case

`notify-new-worktree.ts` / `notify-missing-folder.ts` stop being wired
directly to the store's events. Instead, `git/index.ts`'s `activate()`
registers itself as an ordinary `GitDetectionHandler` — the _first_ one, since
it registers at `silo.git`'s own activation, before any other extension has
had a chance to run:

```ts
// git/index.ts, roughly
ctx.subscriptions.push(
  api.registerDetectionHandler({
    onWorktreeAdded: (workspaceId, wt) => {
      notifyNewWorktree(ctx, workspaceId, wt);
      // never claims — always lets earlier-registered (i.e. third-party)
      // handlers already have had their turn first; see dispatch order.
    },
  }),
);
```

Dispatch, run from the same place `reconcileNotifications` currently calls
`notifyNewWorktree`/`notifyMissingFolder` directly:

```ts
function dispatchWorktreeAdded(workspaceId: string, wt: GitWorktree) {
  for (const handler of handlers.toReversed()) {
    // most-recently-registered first
    if (handler.onWorktreeAdded?.(workspaceId, wt) === true) return; // claimed
  }
}
```

Because the built-in registers _first_ (lowest priority under
"most-recent-first"), it's always the _last_ one checked — exactly the "default
behavior, overridable by anyone more specific" semantics `DndService`
already establishes for drop targets. No `GitDetectionHandler` needs to know
whether it's "the built-in" or "a third party"; the built-in just never
returns `true`.

### Why not a `preventDefault()`-style cancelable event instead

A DOM-style `{ worktree, preventDefault() }` payload on the _existing_
`onWorktreeAdded: Event<T>` was considered — closer to the web platform's own
idiom. Rejected: `Event<T>` listeners in this SDK have no defined ordering
contract (ADR 0009 doesn't promise one), and a `preventDefault()` only works
if the claiming listener runs _before_ the one it's suppressing — which,
without an explicit priority mechanism, is exactly as unpredictable as it
is over the web platform. A **separate, single-purpose registration** with an
explicit, documented ordering rule (`registerDetectionHandler`, not
`onWorktreeAdded`) sidesteps that entirely, and matches the precedent already
in this codebase (`DndService.registerDropTarget`) rather than inventing a
new one.

### Why provider-level (`GitAPI`), not per-repo (`GitRepoStore`)

A detection handler is answering "who owns the UI for _any_ detected
worktree app-wide," the same shape as today's single global
`reconcileNotifications` loop — not a per-repo concern. Putting it on
`GitRepoStore` would mean registering (and disposing) a handler once per
tracked repo, for behavior that's actually workspace/app-wide. `GitAPI` is
the right home, same tier as `watchRepo` itself.

## Alternatives considered

**Settings toggle** (`ctx.settings` boolean the user flips off manually, third
party's docs say "disable Silo's built-in toast and install this instead").
Much less code. Rejected as the primary mechanism because it's manual and
per-user — installing a richer extension doesn't make the built-in one get
out of the way on its own, which was the actual ask. Still a reasonable
fallback if the claim protocol turns out to be overkill for the first real
consumer that shows up.

**`preventDefault()` on the existing event.** See Design above — rejected on
ordering grounds.

**A generic `ctx`-level claim primitive** (not git-specific) for any
future "who owns the response to X" case. Rejected for now: `DndService`
already has its own bespoke version of this shape, and generalizing it
before a second concrete consumer exists (beyond drop targets and this) would
be exactly the premature abstraction this repo's engineering principles warn
against. If a third case shows up, generalize then.

## Decision

Filled in when this leaves `draft` — i.e., when a concrete extension (first-
or third-party) actually wants to replace the built-in worktree-detection UI.
