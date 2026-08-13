---
status: accepted
date: 2026-08-12
---

# 0037. A published, live git-state session (`GitAPI.watchRepo`)

## Context

`silo.git`'s `GitAPI` (`packages/extensions-silo/src/git/git-api.ts`) is a
clean, deep, one-shot command interface — 23 `cwd`-first methods, well-tested
(`git-service.test.ts`, 854 lines against 451 of implementation), one adapter.
It is not the problem and this decision does not change it.

The problem is everything built _on top_ of it. `GitView.tsx`
(`packages/extensions-silo/src/git-explorer/GitView.tsx`, 1061 lines) owns, in
one component: debounced fs-watch-triggered refresh, a background autofetch
`setInterval`, three module-level `Map` caches keyed by
`workspaceId + "::" + folder`, a `paused` flag that fully disables watching
whenever its workspace isn't in the foreground, a `committingRef` flag
manually threaded into the fs-watch callback so a commit's own final refresh
doesn't race a concurrent one, and push/pull/commit handlers that each
manually re-trigger a refresh afterward. `WorktreeManager.tsx` and
`BranchManager.tsx` each independently call `getGitApi()` and run their own,
separate fetch/refresh logic in parallel — three call sites reimplementing
"fetch git state and keep it fresh." Two more hand-rolled modules
(`notify-new-worktree.ts`, `notify-missing-folder.ts`) each re-derive "what
changed since last check" from the same polling by diffing consecutive
snapshots, each with its own session-lifetime dedup `Set`.

This is where a real product bug came from: because watching lives entirely
inside `GitView`'s effects, and only runs while `!paused` (the workspace is
foreground) _and_ the Git side panel has been mounted at least once
(`lazyMount: true`, `packages/extensions-silo/src/git-explorer/index.tsx:62`),
a workspace an agent runs `git worktree add` in while backgrounded is silently
never watched — and even switching to it later may not retroactively notify,
because the first-ever fetch for a cold cache deliberately skips the diff
(`GitView.tsx:226-229`) to avoid false-positiving every pre-existing worktree
on startup.

Separately, `GitAPI`'s own header comment says its type is "deliberately NOT
re-exported from the core SDK barrel... the shape a `@silo-code/git-api` types
package would export" — a package that was never built.
`packages/extensions-silo/src/index.ts`'s barrel exports zero types, and
`@silo-code/extensions-core` does not depend on `@silo-code/extensions-silo`
at all, so **no other bundled extension in this repo, let alone a third
party, can type-import `GitAPI` today.** This directly contradicts standing
intent: ADR 0009 already named `@silo-code/git-api` as the canonical example
of a provider types package, and Dave's own extension-ideas notes already
plan a "Mission Control" cross-workspace status board and treat `GitAPI` as
stable, importable infrastructure. The gap is already forcing reinvention —
this repo's own sample extension prompts tell an agent to shell out to raw
`git` via `ctx.process.exec` rather than use `GitAPI`, for exactly this
reason.

Four candidate interfaces were designed in parallel (Design It Twice —
minimal, maximally flexible, ports-and-adapters, optimized-for-the-common-
case) and compared for depth, locality, and seam placement. The chosen design
below is a hybrid, not any one of the four as-is; see Alternatives.

## Decision

**`GitAPI` gains exactly one new method; everything else composes underneath
it.**

```ts
export interface GitAPI {
  // ...existing 23 methods, unchanged...

  /**
   * A live, deduplicated `GitRepoStore` for `cwd`. Idempotent by normalized
   * path — repeated calls with the same `cwd` return the identical object,
   * so callers may call it directly in render without `useMemo`.
   */
  watchRepo(cwd: string): GitRepoStore;
}

export interface GitRepoSnapshot {
  status: GitStatus | null; // null only until the first read resolves
  worktrees: GitWorktree[] | null;
  loading: boolean;
  error: { op: "status" | "worktrees"; cause: unknown } | null;
}

export interface GitRepoStore {
  // Satisfies @silo-code/sdk's ReactiveService<GitRepoSnapshot> — the same
  // getState/subscribe contract ctx.workspaces and ctx.editors already use,
  // so useServiceState(repo) works with zero new pattern to learn.
  getState(): GitRepoSnapshot;
  subscribe(listener: (s: GitRepoSnapshot) => void): Disposable;
  refresh(): Promise<void>;

  // Structural-change signals, per ADR 0009's "domain-owned typed Event<T>,
  // no global bus" convention — replaces notify-new-worktree.ts and
  // notify-missing-folder.ts's own hand-rolled diffing.
  readonly onWorktreeAdded: Event<GitWorktree>;
  readonly onWorktreeRemoved: Event<GitWorktree>;
  readonly onFolderMissing: Event<void>;

  // Mutators mirror GitAPI 1:1 (same names/params, cwd implied) — zero new
  // vocabulary for a caller who already knows GitAPI. Each auto-refreshes on
  // success; fs-watch-triggered refreshes are suppressed for the duration so
  // a commit's own hooks can't race it (replaces GitView's committingRef).
  stage(paths: string[]): Promise<void>;
  commit(message: string): Promise<void>;
  push(options?: Parameters<GitAPI["push"]>[1]): Promise<void>;
  pull(): Promise<void>;
  // ...unstage/revertFile/clean/fetch/switchBranch/createBranch/
  //    deleteBranch/renameBranch/addWorktree/removeWorktree/pruneWorktrees

  readonly api: GitAPI; // escape hatch to the full one-shot surface (log, diff, branches, ...)
  dispose(): void; // only needed for a cwd outside any open workspace
}

export declare const NULL_GIT_REPO_STORE: GitRepoStore;
```

**Type location:** a new leaf package, `@silo-code/git-api` — almost entirely
types, depending only on `@silo-code/sdk` (for `Disposable`/`Event`), the same
tier as `@silo-code/sdk` itself, not descended from it. `GitAPI` and its
supporting types move there verbatim;
`packages/extensions-silo/src/git/git-api.ts` becomes a re-export shim.

The one exception to "types only" is `NULL_GIT_REPO_STORE`: a real runtime
object (`getState` returns a fixed empty snapshot; `subscribe`/`onWorktree*`/
`onFolderMissing` return no-op `Disposable`s; every mutator rejects with a
fixed "Git provider (silo.git) unavailable" error; `dispose` is a no-op) —
the null-object default for the one place a caller still needs a fallback:
`ctx.getExtension<GitAPI>("silo.git")?.api` can itself be `undefined` (the
provider disabled or not yet activated), same as any `getExtension` consumer
today. `watchRepo(cwd)` itself never returns `undefined` once `gitApi` exists
— so this is the _only_ null-check callers need, not a second one:
`gitApi?.watchRepo(folder) ?? NULL_GIT_REPO_STORE`, then `useServiceState`
always has a valid `ReactiveService` to call. A package that's "mostly types,
one small runtime constant" isn't unusual (`@silo-code/sdk` itself ships far
more runtime code — components, `useServiceState`, `EventEmitter` helpers —
under the same "types-first" framing), so this doesn't strain the package's
identity; it just means "zero runtime" wasn't the accurate way to describe it.
`@silo-code/extensions-silo` (implementation) and `@silo-code/extensions-core`
both add it as a normal `workspace:*` dependency. This is not a boundary
carve-out — the lint boundary (`eslint.config.js`) is package-graph-based
("the package's `dependencies` decide what it can resolve"), so this is the
intended extension mechanism, identical in kind to how `extensions-silo`
already depends on `@silo-code/sdk`. Third-party extensions get the same
types by depending on the published package, exactly as they already do for
`@silo-code/sdk`.

**Keyed by `cwd` alone, not by `(workspaceId, folder)`.** The same physical
repo open in two different workspaces (a real, existing case — see
`servicetitan-contactcenter`, open both standalone and as a `Sentry`
`extraFolder`) shares one tracker, one poll loop, one cold-start. Keying by
workspace pair (one candidate design's choice) was rejected specifically
because it reproduces the cold-start-swallows-the-notification bug this
decision exists to fix, just relocated to a per-pairing basis instead of
fixed at the root.

**Lifecycle is ambient and workspace-driven, not panel-driven.** `silo.git`'s
`activate()` subscribes to `ctx.workspaces` itself and starts tracking a
folder the moment its workspace opens (primary folder + every `extraFolders`
entry), tearing down on close — independent of whether any git-explorer panel
has ever been mounted for that workspace. This is the direct fix for the
reported bug, and it's where all four candidate designs independently
converged.

**Autofetch stays foreground-only.** The currently-active workspace's folders
autofetch on the existing 180s cadence; other open workspaces keep the cheap
fs-watch but don't autofetch — a deliberate trade-off (background
`ahead`/`behind` can drift stale) to avoid N parallel `git fetch` calls across
"keep all your projects alive at once." Dirty-file state (fs-watch-driven)
stays live everywhere regardless.

**One injected port: a clock.** `ClockPort` (`setTimeout`/`clearTimeout`/
`setInterval`/`clearInterval`) is the sole seam introduced beyond what's
already available via `ctx`. It's the one dependency in this design that
isn't already substitutable — nothing in this codebase injects
`window.setTimeout` today, so the 400ms debounce and 180s autofetch cadence
are currently untestable without waiting in real time. `GitAPI` (already an
interface — a fake implementation is the test double, same pattern as
`git-service.test.ts`), `ctx.workspaces`, and `ctx.files.watch` are used
directly, not wrapped in bespoke ports — they're already injected SDK
services with their own fakes; wrapping them again was assessed and rejected
as indirection without payoff (see Alternatives).

**Branches are not live-tracked.** They only change via explicit user action
(switch/create/delete/rename), all already routed through this store's
mutators, so continuous polling would be pure waste. `BranchManager` reads
via `store.api.branches(cwd)` and calls `store.refresh()` isn't even needed —
its own mutators already trigger the store's refresh for `status`/`worktrees`
where relevant.

**`GitView`, `WorktreeManager`, and `BranchManager` become thin consumers.**
`GitView` drops its three module-level caches, `paused`-driven fs-watch
effect, autofetch interval, `committingRef`, and the imported
`notifyNewWorktrees`/`notifyMissingFolder` call sites (those move to subscribe
to `store.onWorktreeAdded`/`onFolderMissing` once, from `git/index.ts`'s
`activate()`, firing regardless of which panels are mounted). `WorktreeManager`
and `BranchManager` drop their own independent `getGitApi()` polling entirely
in favor of the same store instance `GitExplorerPanel` already holds;
`git-runtime.ts`'s singleton resolver is deleted.

## Consequences

**Easier:**

- `GitView` loses roughly 200 of its 1061 lines and ~8 of its 14 pieces of
  state — the data layer moves out entirely, leaving rendering, the "View
  Commits" takeover, and UI-only state (collapse toggles, per-button
  spinners) as a smaller follow-on cleanup.
- `WorktreeManager` and `BranchManager`'s independent polling and the
  callback-threading between them and `GitView` (`onChanged`/`onSwitched`
  props) disappear — a worktree removed from the manager modal is visible in
  `GitView`'s header pill the instant it resolves, same store.
- A background workspace's git state (dirty files, new/removed worktrees,
  missing folders) is tracked from the moment it opens, panel or no panel —
  the reported bug is fixed structurally, not patched.
- `core.*` extensions and third-party extensions can type-import `GitAPI` and
  consume `watchRepo` through the exact same `ctx.getExtension("silo.git")`
  seam a first-party caller uses — no special privilege, no new mechanism to
  learn beyond `ReactiveService`, which every other `ctx` domain already
  teaches.
- Debounce and autofetch cadence become unit-testable via `ClockPort` for the
  first time — currently untested behavior gets real coverage.

**Harder:**

- `extensions-silo`'s `package.json` gains a second dependency
  (`@silo-code/git-api`) beyond `@silo-code/sdk` — a real, visible change to
  today's "sdk-only" posture that should be called out explicitly in review,
  even though the package graph mechanism supports it as-designed.
- Every open workspace now carries at least an fs-watch subscription for its
  folders for as long as it's open, whether or not any UI or extension is
  actually watching — a user with many long-lived background workspaces pays
  this ambient cost even at zero consumers. Foreground-only autofetch caps
  the expensive part (network calls); the fs-watch base cost doesn't have an
  equivalent cap yet.
- `notify-new-worktree.ts` and `notify-missing-folder.ts` need rewriting as
  `store.onWorktreeAdded`/`onFolderMissing` subscribers registered once at
  `git/index.ts` activation, rather than called inline from `GitView`'s
  effects — a real migration, not a drop-in.
- The move fixes _fetching_ duplication but not _rendering_ duplication —
  `GitView` still needs its own follow-on breakup (takeover/navigation state,
  row rendering) to stop being a 800+-line component; this decision only
  covers the data layer.

**Neutral / committed to:**

- `GitAPI`'s existing 23 methods and their `cwd`-first, one-shot contract are
  untouched. Every existing one-shot caller (`log`, `diff`, `commitDetail`,
  the diff-content-provider in `git/index.ts:59-109`) is unaffected.
- Third-party extensions reach `watchRepo` only via `ctx.getExtension`,
  never a privileged surface — consistent with the existing `silo.*`
  boundary (SDK-only, no host access).

## Not in scope (explicit fast-follow)

**A third party cannot yet suppress the built-in `notify-new-worktree`/
`notify-missing-folder` UI in favor of its own.** `Event<T>` is pure
multicast — every subscriber fires independently, so a third-party extension
subscribing to `store.onWorktreeAdded` to show a richer UI would currently
get that UI _alongside_ Silo's own toast, not instead of it. Fixing this
needs a claim/ownership protocol distinct from the passive event — this repo
already has direct precedent for exactly that shape in
`DndService.registerDropTarget`'s `onDrop(ctx): boolean | void`
(`packages/sdk/src/dnd-service.ts:101-127`): return `true` to claim the
interaction, and the host suppresses the default/other handling. A future
decision should add something in that shape (e.g. a single-claim
`registerWorktreeDetectionHandler`, most-recently-registered-first so
third-party extensions — which always activate after built-ins — win by
default) alongside the passive `onWorktreeAdded` event this decision adds.
Deferred rather than bundled in here because it's a UI-ownership policy
question orthogonal to the data/session layer, and because it's genuinely
speculative until a concrete extension wants it — consistent with ADR 0009's
own posture that "the event surface is still partly unshipped, demand-driven
on the roadmap."

## Alternatives considered

**A. Key the store by `(workspaceId, folder)` instead of `cwd`.** One
candidate design's choice — smallest possible interface (3 methods:
`subscribe`/`getSnapshot`/`refresh`, both keyed by the pair). Rejected: it
reproduces the exact bug this decision fixes for any repo open in more than
one workspace (two independent caches, two independent cold starts, two
independent `git status` processes against the same directory), just at
finer grain than today's per-`GitView` caches instead of eliminated.

**B. Facet-based subscription (`watchRepo(cwd, { facets: ["status",
"worktrees", "branches"] })`) with shared, unioned cost across callers.**
Explored for its flexibility — a caller opts into only what it needs, cost is
shared. Rejected: the design's own trade-offs admitted what a subscriber
actually receives depends on which _other_, unrelated callers are also
watching the same `cwd` — a caller-visible coupling that's surprising and
hard to test in isolation. Simpler to always track `status` + `worktrees`
(cheap, already coupled in today's polling) and leave `branches` as
pull-through-`.api`, matching two of the four designs' independent choice to
exclude it from live tracking.

**C. Four explicit injected ports (`FsWatchPort`, `ClockPort`,
`WorkspaceActivationPort`, plus `GitAPI` itself) with production and fake
adapters for each.** `ClockPort` adopted (see Decision) — it's the one
dependency without an existing local-substitutable seam. `FsWatchPort` and
`WorkspaceActivationPort` rejected: both would wrap `ctx.files.watch` and
`ctx.workspaces`, which are already injected, already stable SDK services
with their own fakes — the design that proposed them conceded as much in its
own trade-offs ("closest to indirection for its own sake"). Using them
directly satisfies the same local-substitutable dependency category
(DEEPENING.md) without a second layer of interfaces to maintain.

**D. Fold `runMutation(fn)` — a generic higher-order wrapper around any
mutating `GitAPI` call — into the store instead of mirroring each mutator by
name.** Rejected in favor of 1:1 mirrored methods (`store.commit(message)`
vs. `store.runMutation(() => api.commit(cwd, message))`): the wrapper
approach has fewer named members but introduces a new wrapping idiom a caller
has to learn, where mirrored methods reuse vocabulary `GitAPI` callers
already know. Depth is leverage per concept learned, not raw member count.

**E. Bundle the third-party override/suppression mechanism into this
decision.** Deferred — see "Not in scope" above.

## References

- `packages/extensions-silo/src/git/git-api.ts` — existing `GitAPI`, moving
  to `@silo-code/git-api` unchanged
- `packages/extensions-silo/src/git/git-service.ts` /
  `git-service.test.ts` — the sole adapter and its fake-`exec` test pattern,
  reused for `GitRepoStore`'s own tests
- `packages/extensions-silo/src/git/index.ts` — where `watchRepo` is
  constructed and published from `activate()`
- `packages/extensions-silo/src/git-explorer/GitView.tsx`,
  `WorktreeManager.tsx`, `BranchManager.tsx`, `git-runtime.ts` — consumers to
  refactor; `git-runtime.ts` deleted
- `packages/extensions-silo/src/git-explorer/notify-new-worktree.ts`,
  `notify-missing-folder.ts` — rewritten as `store.onWorktreeAdded`/
  `onFolderMissing` subscribers
- `packages/sdk/src/use-service-state.ts` — `ReactiveService<T>` /
  `useServiceState`, the existing convention `GitRepoStore` conforms to
- `packages/sdk/src/event.ts` — `Event<T>`, the existing convention
  `onWorktreeAdded`/`onWorktreeRemoved`/`onFolderMissing` conform to
- `packages/sdk/src/dnd-service.ts:101-127` — `DndService.registerDropTarget`,
  the precedent for the deferred claim/suppression mechanism
- ADR 0009 — typed published APIs + domain-owned events, no global bus; names
  `@silo-code/git-api` as its example provider types package
