---
status: implemented
created: 2026-08-25
---

# 0029. Public SDK: `showSheet`, `homeDir`, `confirmWithDontShowAgain`

## Summary

Promote three host-internal capabilities to the public `@silo-code/sdk` so a
third-party extension (e.g. Agent Skills → `silo-extensions`) can ship without
importing `@silo-code/extension-host/internal`:

1. **`ctx.layout.openPanelSheet`** — a dock-anchored companion sheet for a
   registered side panel (today: host `<Sheet>`). Shipped on `ctx.layout`, not
   `ctx.ui` as sketched below — see **Decision**.
2. **`ctx.system.homeDir()`** — absolute user home path (today: `homeDir()`).
3. **`ctx.ui.confirmWithDontShowAgain`** — confirm/info with a persisted
   “Don’t show this again” checkbox (today: `confirmWithDontShowAgain`).

This RFC is also the **implementation plan** for an agent: follow
[Implementation plan](#implementation-plan) in order, then the docs-sync
checklist.

## Motivation

`core.skills` (Skills panel + skills.sh browse sheet) currently depends on three
`@silo-code/extension-host/internal` exports. Third-party / `silo-extensions`
packages may **only** import `@silo-code/sdk`. Until these land and the SDK is
**published** to npm, a faithful Skills port cannot leave the monorepo.

Driving product need: browse/install UX wants a **dock sheet** (not a modal);
user-scope skill roots live under **`$HOME`**; install/uninstall confirms want
**don’t-show-again** without every extension re-implementing modal chrome.

Related notes already in-tree:

- `packages/extension-host/src/extension-host/sdk-internal.ts` — Sheet is
  prototype; “public capability, if it lands, will be an imperative
  `ctx.ui.showSheet` mirroring `showModal`.”
- `docs/silo-extensions-repo.md` — untrusted path scope + `silo.permissions`.
- `docs/side-panel-design.md` — sheet UX conventions (caption, drill-in, scroll).

## Design

### 1. `ctx.layout.openPanelSheet` <small>(shipped shape — see below for the original sketch)</small>

**As implemented, this diverges from the sketch originally drafted here** —
resolved in conversation with Dave before coding (not a mid-implementation
guess). Two changes, both load-bearing:

1. **Dock-only for v1** — the `anchor`/`align`/`dismissible` axes are dropped
   entirely. There is no “focused side dock” host state to infer `side` from
   for a pure-imperative call, and inferring from _focus_ would be wrong even
   if it existed: `core.skills`’ `BROWSE_COMMAND` opens the browse sheet from
   the command palette, where no side dock has focus at that moment. Modal
   (`anchor: "app"`) sheets (Settings, Sheet Lab) are unaffected — the
   declarative `<Sheet>` component keeps that capability; only the new
   imperative public API is dock-scoped.
2. **Explicit `panelId`, lives on `ctx.layout`, named `openPanelSheet`** — the
   original sketch tried to _infer_ the panel from “whichever side panel the
   calling extension owns.” That breaks for a caller with no panel of its own
   (a status-bar button) and silently skips activating the panel the sheet is
   supposed to grow out of (a collapsed column, a backgrounded tab). An
   explicit `panelId` removes the inference and lets the host **reveal that
   panel** (the same unhide + activate-tab + expand-column work
   `ctx.layout.revealSidePanel` already does) as part of opening the sheet.
   It lives on `ctx.layout`, next to `revealSidePanel` / `openPanel` /
   `toggleSidePanel` — all panel/layout operations — rather than `ctx.ui`,
   whose `show*` family (`showModal`, `showMenu`) is page-level and takes no
   panel context.

```ts
// packages/sdk/src/layout-service.ts (as shipped)

/** Options for {@link LayoutService.openPanelSheet}. */
export interface SheetOptions {
  title?: ReactNode;
  width?: number;
  bare?: boolean;
  className?: string;
  ariaLabel?: string;
  /** "overlay" covers the center dock, "push" narrows it. Default "overlay". */
  mode?: "overlay" | "push";
}

export interface LayoutService {
  // …
  /**
   * Open a host-owned sheet that grows out of the side dock currently hosting
   * `panelId` — reveals that panel first, then slides the sheet out from its
   * side. Never modal. Rejects if `panelId` names no registered panel.
   */
  openPanelSheet(
    panelId: string,
    render: (close: () => void) => ReactNode,
    opts?: SheetOptions,
  ): Promise<void>;
}
```

**Host implementation**

- The imperative queue (`sheet-dialog.ts`) mirrors `modal-service.ts`’s
  `dialogStore`/`pending`/`showModal`/`resolveDialog` shape exactly, but for
  sheets — off-proxy `pending` map (render fn + a possibly-`ReactNode` `title`
  aren’t proxy-safe), a `sheetDialogStore` queue, `resolveSheetDialog` settles
  - clears.
- `SheetDialogHost` (mirrors `ModalHost`’s custom-modal slot) mounts once at
  the app root next to `<ModalHost>`, rendering each pending entry as
  `<Sheet anchor="dock" side={entry.side} …>`.
- `Sheet.tsx` gained one addition: an optional `side?: SheetSide` on the
  `anchor: "dock"` branch, bypassing the DOM-sentinel inference (`useDockSide`)
  that only works when `<Sheet>` is mounted inside the caller’s own tree — true
  for a declarative dock sheet, false for `SheetDialogHost` (mounted at the app
  root). Declarative dock sheets keep working unchanged since they don’t pass
  it.
- `side` resolution reuses `revealSidePanel`’s existing logic exactly
  (`resolvePaneId` + `dockOfPane` against `store.sideDockTrees` /
  `store.sidePanelLocations`, factored into a shared private helper) — “which
  dock is this panel actually in right now” already accounts for a user having
  dragged it to the other column.
- No per-extension scoping needed (unlike `confirmWithDontShowAgain` below) —
  `panelId` is explicit, so `getLayoutService()` stays the singleton it always
  was, and, matching `revealSidePanel`’s existing precedent, `panelId` isn’t
  restricted to a panel the calling extension itself registered.

**Consumer migration (skills)**

Today (before this RFC):

```tsx
if (!open) return null;
return (
  <Sheet title={…} anchor="dock" mode="overlay" width={560} onClose={onClose}>
    …
  </Sheet>
);
```

Shipped:

```tsx
void ctx.layout.openPanelSheet(
  PANEL_ID,
  () => <BrowseSheet ctx={ctx} localSkills={skills} … />,
  { title: <SkillsBrandMark />, width: 560, className: "skills-sheet" },
);
```

`BrowseSheet` dropped its `open`/`onClose` props entirely — a fresh instance
now mounts each time the sheet opens (the host only renders it while pending),
so there’s no `open` flag to gate on, and it closes via the host `<Sheet>`
chrome rather than anything of its own. `BROWSE_COMMAND`’s existing
`ctx.layout.revealSidePanel(PANEL_ID)` call stays — it force-mounts the panel
when it’s still lazy (never yet revealed) so `SkillsPanel`’s browse-intent
listener exists to catch the request at all; `openPanelSheet` also reveals,
redundantly but harmlessly, once that listener fires.

**Known trade-off, accepted as-is**: the `render` callback is captured once,
at the moment `openPanelSheet` is called — `SheetDialogHost` doesn’t re-invoke
it just because the caller’s own component re-renders. So props like
`localSkills` reflect the panel’s state _at open time_, not live afterward
(the same characteristic `ctx.ui.showModal` content already has). A future
pass could thread a reactive getter/subscribe pair through if live-refresh
turns out to matter in practice; not built here since it wasn’t a stated
requirement.

**Out of scope for v1**

- Publishing a public React `<Sheet>` component (Modal stayed imperative-only).
- Changing default caption padding / brand caption standards (skills-local CSS
  stays extension-owned).
- The `anchor: "app"` modal-sheet case on the public API — Settings and Sheet
  Lab keep using the internal declarative `<Sheet anchor="app">` directly;
  nothing drove a public need for it yet.

<details>
<summary>Original sketch (superseded by the design above)</summary>

Mirror **`ctx.ui.showModal`**: imperative, host-owned chrome/stack/Escape, caller
supplies content via a render function that receives `close`.

```ts
// packages/sdk/src/ui-service.ts (original sketch — not what shipped)

/** Options for {@link UiService.showSheet}. */
export type SheetOptions = {
  title?: ReactNode;
  width?: number;
  bare?: boolean;
  className?: string;
  ariaLabel?: string;
} & (
  | {
      /** Modal sheet against the app window. Default. */
      anchor?: "app";
      align?: "left" | "right" | "center";
      /** Escape + scrim close. Default `true`. */
      dismissible?: boolean;
      mode?: never;
    }
  | {
      /** Companion to a side dock — never modal. */
      anchor: "dock";
      /** `"overlay"` covers the center; `"push"` narrows it. Default `"overlay"`. */
      mode?: "overlay" | "push";
      /**
       * Which dock the sheet grows from. Required when the call is not made
       * from a React tree under that dock (e.g. a command palette handler).
       * When omitted, the host infers from the focused side panel / caller
       * sentinel if possible; otherwise rejects.
       */
      side?: "left" | "right";
      align?: never;
      dismissible?: never;
    }
);

export interface UiService {
  // …
  showSheet(
    render: (close: () => void) => ReactNode,
    opts?: SheetOptions,
  ): Promise<void>;
}
```

This required host state that doesn’t exist (a “focused side dock” tracker)
and, even with it, would have resolved the wrong side for a command-palette
invocation. See the shipped design above.

</details>

### 2. `ctx.system.homeDir()`

```ts
// packages/sdk/src/system-service.ts

export interface SystemService {
  getInfo(): Promise<SystemInfo>;
  /**
   * Absolute path of the current user's home directory (`$HOME` /
   * `%USERPROFILE%`). Host-mediated (no Node/`os` in extensions).
   */
  homeDir(): Promise<string>;
}
```

**Host:** wire to existing `platform.ts` → `@tauri-apps/api/path` `homeDir`.
Cache after first resolve (same lifetime as `getInfo`).

**Permissions:** returning the path string is not a file read. Reading/watching
under it still requires the extension’s normal `ctx.files` rules — typically
`fs:read` in `silo.permissions` for untrusted extensions. Document that on the
member page and in the permissions guide.

**Do not** put a growing grab-bag of env vars on `ctx` in this RFC; home is the
known product need (user skill roots, agent configs).

### 3. `ctx.ui.confirmWithDontShowAgain`

Promote the existing helper without widening `ConfirmOptions` (plain confirm
stays two-button). New method on `UiService`:

```ts
export type ConfirmDontShowAgainMode =
  | { kind: "confirm"; danger?: boolean }
  | { kind: "info" };

export interface ConfirmDontShowAgainOptions {
  /**
   * Key in the **calling extension’s** global storage. Host binds storage;
   * callers do not pass an `ExtensionStorage` handle.
   */
  storageKey: string;
  title: string;
  body: string;
  confirmLabel: string;
  mode: ConfirmDontShowAgainMode;
}

export interface UiService {
  // …
  /**
   * Confirm/info dialog with a “Don’t show this again” checkbox. If the key is
   * already set, resolves `true` immediately without UI. Cancel never persists
   * the checkbox (even if checked).
   */
  confirmWithDontShowAgain(opts: ConfirmDontShowAgainOptions): Promise<boolean>;
}
```

**Host:** move/adapt
`packages/extension-host/src/extension-host/confirm-with-dont-show-again.tsx`.
`getUiService()` implementation must receive the **active extension’s**
`ctx.storage.global` (same scoping as other per-extension APIs). Keep pure
`resolveDialogOutcome` + unit tests.

**Core callers** (`install-skill`, workspace delete menus, etc.): switch to
`ctx.ui.confirmWithDontShowAgain` and drop the internal import. Leave a thin
deprecated re-export on the internal barrel for one release if needed, or
delete once all in-repo callers migrate in the same PR.

## Alternatives considered

| Option                                                                                               | Why not (for now)                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public React `<Sheet>` in the SDK kit                                                                | Sheet is host-stack + portal state (like Modal). Imperative `openPanelSheet` matches `showModal` and the existing internal note.                                                                    |
| Only document DIY don’t-show-again via `showModal`                                                   | Works, but Skills + several core flows already share one helper; promoting avoids N copies and inconsistent checkbox chrome.                                                                        |
| Stuff `homeDir` into `SystemInfo` only                                                               | Also fine; a dedicated method keeps `getInfo` stable and matches today’s `platform.homeDir`. Either is acceptable if docs are clear — prefer the method in this RFC.                                |
| Defer Sheet; Skills browse uses `showModal`                                                          | Product regression vs dock companion UX; not acceptable as the long-term third-party story.                                                                                                         |
| `ctx.ui.showSheet` inferring the panel from the caller's own registered side panel (original sketch) | Breaks for a caller with no panel of its own (a status-bar button); doesn't reveal a collapsed/backgrounded panel. Superseded by explicit `panelId` on `ctx.layout.openPanelSheet` — see Design §1. |

## Decision

Accepted and implemented as described in Design, with the `showSheet`
deviation in §1 (dock-only; explicit `panelId` on `ctx.layout`, not `ctx.ui`)
resolved with Dave before coding — not a unilateral mid-implementation choice.
`homeDir` and `confirmWithDontShowAgain` shipped as sketched.

## Implementation plan

Work in the Silo monorepo (`packages/sdk`, `packages/extension-host`,
`apps/docs`). Follow
[`.agents/skills/silo-docs-sync/SKILL.md`](../../.agents/skills/silo-docs-sync/SKILL.md)
for **every** public symbol. Follow
[`.agents/skills/silo-testing/SKILL.md`](../../.agents/skills/silo-testing/SKILL.md)
for unit tests. Conventional Commits; do **not** publish npm from this plan
unless asked — note publish as a follow-up for `silo-extensions`.

### Phase 0 — Roadmap + acceptance

1. Add three `planned` rows on `apps/docs/roadmap.md` (under Extension API /
   `ctx.ui` / `ctx.system`) linking to this RFC.
2. Get a quick thumbs-up on the sketched signatures (especially dock `side`
   inference rules) before coding if anything is ambiguous — otherwise proceed
   with Design as written.
3. Flip this RFC `draft` → `accepted` when starting implementation (or in the
   same PR that lands the code).

### Phase 1 — `ctx.system.homeDir()` (smallest)

1. Add `homeDir(): Promise<string>` to `SystemService` in
   `packages/sdk/src/system-service.ts` with TSDoc `@public` + `@category
Consumer Services`.
2. Implement in host system service (call existing `platform.homeDir`, cache).
3. Unit test: resolves a string path; second call hits cache if applicable.
4. Hand-authored docs: extend `apps/docs/api/system/` (or new member page) +
   `apiSidebar` / overview table if needed.
5. `pnpm docs:api`; roadmap badge → `stable` for this row only (or wait and
   flip all three together — prefer one PR per phase or one PR for all three;
   either is fine if the PR description lists phases).
6. Migrate `core.skills` `SkillsPanel` off internal `homeDir` import.

### Phase 2 — `ctx.ui.confirmWithDontShowAgain`

1. Add types + method to `packages/sdk/src/ui-service.ts`; re-export from
   `packages/sdk/src/index.ts`.
2. Wire host `ui-service.ts` so the method closes over the **calling
   extension’s** global storage (inspect how other ctx methods receive
   extension identity — do not make callers pass `ExtensionStorage`).
3. Port dialog UI + `resolveDialogOutcome` tests; keep behavior:
   - prior stored `true` → resolve `true`, no UI;
   - cancel → `false`, never persist;
   - proceed + checkbox → persist then `true`.
4. Migrate in-repo callers (`install-skill`, `uninstall-skill`, workspace
   menus, etc.) to `ctx.ui.confirmWithDontShowAgain`.
5. Remove or deprecate internal barrel export.
6. Docs: `apps/docs/api/ui/` member page + example; roadmap → `stable`.
7. `pnpm docs:api`; unit tests green.

### Phase 3 — `ctx.ui.showSheet` (largest)

1. Add `SheetOptions` + `showSheet` to SDK `ui-service.ts` / barrel.
2. Implement host imperative entry (model on `modal-service.ts` `showModal`):
   push stack entry, render via existing sheet placement, resolve promise on
   close.
3. Dock `side`: implement inference + explicit `side` requirement; unit-test
   geometry/placement helpers where pure; add focused host tests for open/close
   / Escape / push vs overlay if feasible without full GUI.
4. Sheet Lab (`core.sheet-lab`): add a recipe that opens via `ctx.ui.showSheet`
   so the public path is exercised in-app.
5. Migrate `core.skills` `BrowseSheet` off internal `<Sheet>`.
6. Docs: new `apps/docs/api/ui/show-sheet.md` (or equivalent), design guide
   cross-link from `docs/side-panel-design.md` “Sheets specifically”, roadmap
   → `stable`.
7. `pnpm docs:api`; `pnpm lint`; `pnpm test` for touched packages.

### Phase 4 — Docs / domain / packaging follow-ups

1. RFC status → `implemented`; link roadmap badges.
2. Optional ADR only if a contentious dock-side rule crystallizes differently
   from Design.
3. **Publish** `@silo-code/sdk` (semver minor) — separate release chore; then
   `silo-extensions` can bump and declare:
   ```json
   "silo": {
     "permissions": ["fs:read", "network"],
     "engine": "<published version>"
   }
   ```
4. Porting Skills into `silo-extensions` is **out of scope** of this RFC’s
   code PR(s); this RFC only unlocks it.

### Verification checklist (per PR)

- [x] No new `@silo-code/extension-host/internal` imports in
      `packages/extensions-silo` / future third-party for these three needs —
      `homeDir` stayed on the internal barrel too (still needed by
      `terminal-links.ts` / `workspaces/`, out of this RFC's scope; new callers
      should prefer the public `ctx.system.homeDir()`)
- [x] `pnpm --filter @silo-code/sdk` / host tests green for new surface —
      full `pnpm test` (11/11 tasks) and `pnpm --filter silo exec tsc --noEmit`
      both green
- [x] `pnpm docs:api` committed if types changed
- [x] Roadmap badges match reality
- [x] Skills panel still opens browse sheet + scans user home skills —
      confirmed via `verifier-gui`: `core.skills.browse` (the command-palette
      path, the scenario that specifically drove the `panelId`-based design)
      reveals the panel and opens the sheet correctly anchored right, catalog
      loads, and the host close button works

### Suggested PR split

| PR  | Contents                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------- |
| A   | Phase 1 `homeDir` + skills migrate                                                                                     |
| B   | Phase 2 confirm don’t-show-again + in-repo migrate (`install-skill.ts`, `uninstall-skill.ts`, `workspace-confirms.ts`) |
| C   | Phase 3 `openPanelSheet` + Sheet Lab + skills BrowseSheet migrate                                                      |

Single PR is acceptable if kept reviewable; prefer split if Sheet work balloons.
Implemented as one working-tree change; not yet split into PRs A/B/C.

## Reference — internal call sites migrated off (skills)

Historical — these were the internal-barrel imports this RFC's implementation
removed from `core.skills`. `homeDir` in `SkillsPanel.tsx` was the only one
scoped to Skills specifically; `confirmWithDontShowAgain` also had a fourth
in-repo extension caller found during implementation
(`workspaces/workspace-confirms.ts`), migrated in the same pass.

| Need    | File(s)                                                                      | Internal import (removed)  |
| ------- | ---------------------------------------------------------------------------- | -------------------------- |
| Sheet   | `packages/extensions-core/src/skills/BrowseSheet.tsx`                        | `Sheet`                    |
| Home    | `packages/extensions-core/src/skills/SkillsPanel.tsx`                        | `homeDir`                  |
| Confirm | `install-skill.ts`, `uninstall-skill.ts`, `workspaces/workspace-confirms.ts` | `confirmWithDontShowAgain` |

## See also

- [docs/silo-extensions-repo.md](../silo-extensions-repo.md)
- [docs/side-panel-design.md](../side-panel-design.md)
- [apps/docs/guide/extension-checklist.md](../../apps/docs/guide/extension-checklist.md)
- Modal counterpart: `ctx.ui.showModal` / `packages/extension-host/.../modal-service.ts`
