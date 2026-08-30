---
status: implemented
created: 2026-07-15
# supersedes:
# superseded-by:
---

# 0015. Workspace extension contributions — extending the workspace surface

> **Implemented.** Both contributions shipped and are stable:
> `ctx.workspaces.registerPropertyPage` (tabbed workspace property pages) and
> workspace context-menu contributions (`getWorkspaceMenuItems` /
> `getOpenWorkspaceMenuItems`), the latter as part of the surface vocabulary in
> [RFC 0013](./0013-context-menu-contributions.md).

## Summary

Introduce a new extension contribution type and extend an existing one:

1. **Workspace property pages** — tabbed panels inside the workspace properties
   modal, each rendering an extension's workspace-scoped settings and controls.
2. **Workspace context-menu items** — contributions to the workspace row's
   right-click context menu in the sidebar, via the `"workspace"` surface of
   [RFC 0013](./0013-context-menu-contributions.md)'s `registerContextMenuItem`
   model. The workspace itself is the typed context object passed to commands
   and predicates.

The initial consumer is the **github-actions extension**, which currently hides
per-workspace settings (branch filter, dismiss-on-success, clear alerts) inside
its modal — out of reach when a user wants to toggle them from the sidebar.
With this proposal, the github-actions extension contributes a **GitHub Actions
tab** to the workspace properties modal, adds "Refresh" and "Clear Alerts" to
the workspace context menu via the `"workspace"` surface, and keeps the existing
modal workflow for the full workflow list. It also adds a **per-workspace
enable/disable toggle** — surfaced both as a checkbox in the GitHub Actions tab
and as a checked/toggle context-menu row (via [RFC 0013](./0013-context-menu-contributions.md)'s
`checked` field) — built entirely on the primitives below with no new SDK
surface (see "Per-workspace enable/disable" under Design).

This proposal also redesigns the workspace properties modal's save model:
every field now persists immediately on change (matching the Settings-page
convention), the modal becomes dismissible, and the Name field — the one input
where an empty value would be visibly broken elsewhere in the UI — gets a
dedicated edit-mode component with explicit validation. See "Workspace
properties modal redesign" under Design.

## Motivation

Today, **extensions cannot customize the workspace-properties surface at all**.
The modal (`WorkspaceModals.tsx` / `workspace-properties.tsx`) is a hard-coded
form showing only name and folder fields, managed entirely by core. This creates
two problems:

### The github-actions pain point

The github-actions extension stores per-workspace settings (`branchOnly`,
`dismissOnSuccess`, `clearedAt`) in its own store, keyed by workspace id. These
settings live in two disjoint places:

| Setting                    | Where it lives today    | Problem                                                     |
| -------------------------- | ----------------------- | ----------------------------------------------------------- |
| "Only monitor this branch" | Modal footer (toggle)   | User must open the modal → switch workspaces → toggle again |
| "Auto-dismiss alerts"      | Modal footer (toggle)   | Same — buried inside the workflow list modal                |
| "Clear alerts"             | Status row context menu | Requires right-click, not discoverable from properties      |

There is no way for the extension to register a per-workspace settings UI
because the workspace-properties modal has **no extension seam**.

### The broader extensibility gap

Every extension that needs per-workspace configuration faces the same problem.
A git extension might want a "Git: track this workspace" toggle; a CI extension
might want webhook configuration; a linter extension might want workspace-specific
rule overrides. Today, authors either:

- **Put everything in the global settings page** — wrong when the setting is
  workspace-dependent (e.g. which branches to watch).
- **Hide toggles in status-item modals** — requires the user to already be
  looking at the status item; settings are not discoverable alongside workspace
  metadata.
- **Register a custom side panel** — heavy-handed for a few toggles; creates
  permanent UI chrome that isn't contextually related to the workspace being edited.

The workspace properties modal is the **intended surface for workspace-level
configuration**. Extensions need a path to contribute to it.

### Why not just extend `ExtensionStorage.workspace`?

Extensions already have `ctx.storage.workspace` — per-workspace key/value storage
that swaps on workspace change. The github-actions extension uses it to persist
`workspaceCurrentBranchOnly`, `workspaceDismissOnSuccess`, and `workspaceClearedAt`.
**Storage alone is not enough** because:

1. The **UI to change those values** doesn't exist — storage is read/write, not
   a UI surface.
2. The user has no **discoverable way** to find and adjust extension settings
   for a workspace. The settings page only shows global settings.
3. We need **typed contribution points** (the SDK declares what the host renders)
   so extensions declare their intent and the host composes the surface.

## Design

### Contribution surface: the workspace properties modal

When `openWorkspaceProperties` is called, the host:

1. Renders a **tab bar** above the properties content — always present, even
   with zero extension contributions (revised from the original "only when
   extensions contribute" proposal; see Decision).
2. The first tab is always **"General"** (the built-in name/folders
   properties); subsequent tabs are the registered **workspace property
   pages**, sorted by `order` within each extension.
3. Renders the active tab's content.

### API surface

````ts
// ── Workspace property page ─────────────────────────────────────────────

/**
 * A tab contributed by an extension inside the workspace properties modal.
 * Register via {@link WorkspaceService.registerPropertyPage}.
 *
 * @category Consumer Services
 * @public
 */
export interface WorkspacePropertyPage {
  /**
   * Unique id, conventionally `"<extension-id>.properties"`.
   */
  id: string;
  /**
   * Tab label shown in the tab bar. Shown as a tooltip alongside the
   * icon if provided.
   */
  title: string;
  /**
   * Optional icon rendered to the left of the tab label.
   */
  icon?: React.ReactNode;
  /**
   * The React component rendered as the tab's content. Receives the
   * workspace being edited and the workspace service.
   */
  component: React.ComponentType<WorkspacePropertyPageProps>;
  /**
   * Whether this tab should appear for this workspace. Default is true
   * (always visible); return false to hide it for workspaces where
   * the extension is not relevant (e.g., a workspace that has no git
   // repo).
   */
  visible?: (ws: Workspace) => boolean;
  /**
   * Sort order within this extension's contributions. Lower values
   * appear first. Defaults to 0.
   */
  order?: number;
}

/**
 * Props passed to a {@link WorkspacePropertyPage} component.
 *
 * @category Consumer Services
 * @public
 */
export interface WorkspacePropertyPageProps {
  /** The workspace whose properties are being edited. */
  ws: Workspace;
  /**
   * The workspace service — read state and fire events, but do not mutate
   * workspace properties here (those are committed by the modal's Save button).
   */
  workspaces: WorkspaceService;
  /**
   * Signal that extension-scoped state has changed. The modal does not
   // auto-save this — the extension is responsible for persisting. However,
   * if the extension wants the modal to re-render its tab content (e.g. after
   * a settings change), it calls this to force a refresh.
   */
  refresh?: () => void;
}

// ── Workspace service additions ─────────────────────────────────────────

interface WorkspaceService {
  // ... existing methods ...

  /**
   * Register a property page that adds a tab to the workspace properties
   * modal. The host composes all registered pages into a tabbed panel.
   * The extension is responsible for persisting its settings via
   * {@link ExtensionStorage.workspace}.
   *
   * Returns a {@link Disposable} that unregisters the page and unmounts
   * the component from all open property modals.
   *
   * @example
   * ```ts
   * ctx.subscriptions.push(
   *   ctx.workspaces.registerPropertyPage({
   *     id: "silo.github-actions.properties",
   *     title: "GitHub Actions",
   *     icon: <IconGitHub />,
   *     component: GhActionsWorkspaceSettings,
   *   }),
   * );
   * ```
   */
  registerPropertyPage(page: WorkspacePropertyPage): Disposable;
}
````

### Workspace properties modal redesign

This proposal also changes the **General** tab's save model, replacing the
existing staged-edit + Save/Cancel footer (`packages/extensions-core/src/workspaces/workspace-properties.tsx`)
with immediate persistence, consistent with how extension property pages
already work and with the Settings-page convention elsewhere in the app
(`TerminalSettingsPage.tsx`, `EditorSettingsPage.tsx`: plain `onChange` commits
straight to the store, no debounce, no staging).

**Folders** (add / remove) already commit as atomic, one-shot actions today —
no change needed, they translate to immediate-persist for free.

**Name** is the one field where immediate per-keystroke persistence is the
wrong model: unlike a Settings text field (harmless if momentarily empty — e.g.
"Shell path" falls back to `$SHELL`), a workspace with an empty name is
visibly broken everywhere it's rendered (tabs, sidebar, window title). Name
gets a dedicated edit-mode component instead, following the existing
inline-rename pattern already used by the file explorer
(`packages/extensions-silo/src/file-explorer/Tree.tsx` / `TreeNodes.tsx`):

- Displayed as static text by default, with a pencil-icon affordance.
- Clicking the pencil icon enters edit mode: the static text becomes an
  input, with explicit **Save** and **Cancel** icon buttons appearing to its
  right.
- **Save** validates the trimmed value is non-empty. Unlike the file
  explorer's silent no-op-on-empty, this shows an inline error instead — the
  workspace-properties context makes an empty name enough of a mistake to
  surface, rather than silently discarding it.
- **Enter** triggers the same path as clicking Save.
- **Escape** cancels the edit (discarding the typed value, reverting to the
  static display) and **stops propagation** so it doesn't also trigger the
  modal's own Escape-to-close — mirroring the existing precedent in
  `Modal.tsx` for layered Escape ownership ("a menu open on top of the modal
  owns Escape — let it close first").
- Opening the modal no longer auto-focuses/auto-selects the name field (it
  did previously, when renaming was the modal's only job) — the tab bar and
  General tab now serve broader purposes, so a single pencil-icon click to
  opt into renaming is preferred over presuming that's what the user is here
  for.

**The modal itself becomes dismissible** — `ctx.ui.showModal(..., { dismissible: true })`
instead of the current non-dismissible default. The non-dismissible behavior
existed specifically to protect staged edits from an accidental click-away;
with folders, extension tabs, and now Name (outside of an active edit) all
persisting immediately, there is nothing left to lose except an in-progress
name edit — which the Escape/close-while-editing rule above already handles by
discarding it explicitly, rather than by blocking the modal from closing at
all.

### GitHub Actions example implementation

The github-actions extension registers three things:

**1. A property page (per-workspace settings):**

```tsx
ctx.subscriptions.push(
  ctx.workspaces.registerPropertyPage({
    id: "silo.github-actions.properties",
    title: "GitHub Actions",
    icon: <IconGitHub size={14} />,
    component: GhActionsWorkspaceSettings,
    visible: (ws) => {
      const states = ghStore.getRepoStates(ws.id);
      return states.some((s) => s.repoInfo !== null);
    },
  }),
);
```

**2. Context menu actions via RFC 0013's `"workspace"` surface:**

```ts
// Command.run is `(...args: unknown[])` — narrow args[0] in the body rather
// than typing the parameter directly (implemented and confirmed by tsc
// during the workspace-context-menu ticket; the latter form doesn't satisfy
// Command.run's actual signature).
ctx.registerCommand({
  id: "silo.github-actions.refresh-workspace",
  label: "GitHub Actions: Refresh",
  run: (...args) => service.refreshWorkspace((args[0] as Workspace).id),
});

ctx.registerCommand({
  id: "silo.github-actions.clear-alerts-workspace",
  label: "GitHub Actions: Clear Alerts",
  run: (...args) => service.clearAlerts((args[0] as Workspace).id),
});

ctx.subscriptions.push(
  ctx.registerContextMenuItem({
    surface: "workspace",
    command: "silo.github-actions.refresh-workspace",
    label: "GitHub Actions: Refresh",
    group: "gh-actions",
    when: (_, ws) =>
      ghStore.getRepoStates(ws.id).some((s) => s.repoInfo !== null),
  }),
  ctx.registerContextMenuItem({
    surface: "workspace",
    command: "silo.github-actions.clear-alerts-workspace",
    label: "GitHub Actions: Clear Alerts",
    group: "gh-actions",
    when: (_, ws) => {
      const states = ghStore.getRepoStates(ws.id);
      return states.some(
        (s) =>
          s.repoInfo !== null && s.runs.some((r) => r.conclusion === "failure"),
      );
    },
  }),
);
```

Note: this contribution is coordinated with [RFC 0013](./0013-context-menu-contributions.md),
which introduces the `MenuSurface` type and `registerContextMenuItem`. The
`"workspace"` surface adds the workspace row as a fourth context-menu surface.
See the **references** section at the bottom of this RFC.

**3. Per-workspace enable/disable:**

No new SDK surface — this is application logic built entirely on
`ctx.storage.workspace`, following the exact pattern already used for
`workspaceCurrentBranchOnly` / `workspaceDismissOnSuccess` (`store.ts`):

```ts
// store.ts — same Map<string, boolean> + Record<string, boolean> pattern as
// the existing per-workspace booleans; defaults to `true` so upgrading users
// see zero behavior change until they explicitly disable a workspace.
getWorkspaceEnabled(workspaceId: string): boolean {
  return this._workspaceEnabled.get(workspaceId) ?? true;
}

setWorkspaceEnabled(workspaceId: string, value: boolean): void {
  this._workspaceEnabled.set(workspaceId, value);
  // ...persist to storage, mirroring setWorkspaceCurrentBranchOnly
}
```

`gh-actions-service.tsx`'s `_scheduleReconcile` gates polling on this flag —
a disabled workspace gets no timer started (or an existing one stopped), and
its status-bar item and workspace decorations (badges/status rows) are hidden
rather than left showing frozen, stale data. The GitHub Actions property-page
tab stays visible regardless of the flag (gated on repo-detection via
`visible`, not on `enabled`) — it's the only way back to re-enable a disabled
workspace.

A single command with a `checked` predicate (RFC 0013) renders as a toggle
row — not two mutually-exclusive commands like Refresh/Clear Alerts, since
this represents persistent on/off state rather than a one-shot action:

```ts
ctx.registerCommand({
  id: "silo.github-actions.toggle-enabled-workspace",
  label: "GitHub Actions: Enabled",
  run: (...args) => {
    const ws = args[0] as Workspace;
    ghStore.setWorkspaceEnabled(ws.id, !ghStore.getWorkspaceEnabled(ws.id));
  },
});

ctx.subscriptions.push(
  ctx.registerContextMenuItem({
    surface: "workspace",
    command: "silo.github-actions.toggle-enabled-workspace",
    label: "GitHub Actions: Enabled",
    group: "gh-actions",
    when: (_, ws) =>
      ghStore.getRepoStates(ws.id).some((s) => s.repoInfo !== null),
    checked: (_, ws) => ghStore.getWorkspaceEnabled(ws.id),
  }),
);
```

The same flag is also a checkbox in the property page (see
`GhActionsWorkspaceSettings` below) — both surfaces read/write
`getWorkspaceEnabled`/`setWorkspaceEnabled`, so they can never drift out of
sync.

```tsx
function GhActionsWorkspaceSettings({
  ws,
  workspaces,
}: WorkspacePropertyPageProps) {
  const states = ghStore.getRepoStates(ws.id);
  const hasRepo = states.some((s) => s.repoInfo !== null);
  const enabled = ghStore.getWorkspaceEnabled(ws.id);
  const branchOnly = ghStore.getWorkspaceCurrentBranchOnly(ws.id);
  const dismissOnSuccess = ghStore.getWorkspaceDismissOnSuccess(ws.id);
  const clearedAt = ghStore.getClearedAt(ws.id);

  if (!hasRepo) {
    return (
      <div className="gha-ws-props">
        <p className="gha-ws-props__hint">
          No GitHub repository detected for this workspace.
        </p>
      </div>
    );
  }

  return (
    <div className="gha-ws-props">
      <section className="gha-ws-props__section">
        <h3 className="gha-ws-props__title">Monitoring</h3>
        <label className="gha-ws-props__row">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) =>
              ghStore.setWorkspaceEnabled(ws.id, e.target.checked)
            }
          />
          <span className="gha-ws-props__label">Monitor this workspace</span>
        </label>
        <label className="gha-ws-props__row">
          <input
            type="checkbox"
            checked={branchOnly}
            onChange={(e) =>
              ghStore.setWorkspaceCurrentBranchOnly(ws.id, e.target.checked)
            }
          />
          <span className="gha-ws-props__label">
            Only monitor the checked-out branch
          </span>
        </label>
        <label className="gha-ws-props__row">
          <input
            type="checkbox"
            checked={dismissOnSuccess}
            onChange={(e) =>
              ghStore.setWorkspaceDismissOnSuccess(ws.id, e.target.checked)
            }
          />
          <span className="gha-ws-props__label">
            Auto-dismiss alerts when workflows pass
          </span>
        </label>
      </section>

      <section className="gha-ws-props__section">
        <h3 className="gha-ws-props__title">Alerts</h3>
        {clearedAt ? (
          <p className="gha-ws-props__status">
            All alerts cleared {formatElapsed(clearedAt)}.
          </p>
        ) : (
          <p className="gha-ws-props__status">No alerts.</p>
        )}
        <button
          className="silo-button"
          onClick={() => {
            ghStore.clearWorkspaceRuns(ws.id);
            ghStore.clearAlerts(ws.id);
          }}
        >
          Clear alerts
        </button>
      </section>

      {states.map(
        (state) =>
          state.repoInfo && (
            <section key={state.folder} className="gha-ws-props__section">
              <h3 className="gha-ws-props__title">
                {state.repoInfo.owner}/{state.repoInfo.repo}
              </h3>
              <p className="gha-ws-props__hint">
                Branch: <code>{state.branch}</code>
              </p>
            </section>
          ),
      )}
    </div>
  );
}
```

### Note on existing workspace decoration surfaces

The workspace row in the Workspaces panel already has three extension decoration
surfaces: **badges** (inline next to the workspace name), **status rows**
(colored dot + label below the path), and **sections** (full React components
below status rows). These cover display-oriented extensions well. Together with
the two contributions in this RFC, the full picture is:

| Surface                                       | Purpose                                       | Owner     |
| --------------------------------------------- | --------------------------------------------- | --------- |
| Badges                                        | Compact status labels inline with the name    | Extension |
| Status rows                                   | Colored dot + label below the path            | Extension |
| Sections                                      | Full React component below status rows        | Extension |
| Context menu (RFC 0013 `"workspace"` surface) | Quick actions per workspace                   | Extension |
| Property pages (this RFC)                     | Configurable settings tab in properties modal | Extension |

Context menu items fill the gap for **one-shot actions** (refresh, clear alerts)
that are fast to execute, optionally visible via `when`, and natural to reach
from the sidebar without opening the full properties modal. Property pages fill
the gap for **configuration** — persistent settings the user adjusts through
forms.

## Alternatives considered

- **Re-use the global settings page with per-workspace sections.**
  Could add a "per-workspace" sub-section to settings, but this scatters
  workspace-specific settings away from the workspace itself. Users configuring
  workspace A would have to switch to workspace B in the settings page to find
  its settings. **Rejected** — the workspace-properties modal is the right place
  because it's where the user already is when managing workspace-level concerns.

- **Add a "Extensions" tab to the workspace properties modal hardcoded by the host.**
  Would require the host to enumerate extensions and their settings, creating a
  tight coupling. The tabbed-extension-page model is cleaner: each extension owns
  its tab, the host just provides the tab chrome. **Rejected** — breaks the
  extension-first principle and creates a host-maintained settings catalog.

- **Use the workspace context-menu for everything (settings + actions).**
  Context menus are great for one-shot actions but poor for configuration —
  there's no persistent UI, no forms, no grouping. A property page gives a
  proper form surface. The two contributions are complementary, not redundant:
  property pages are for _configuration_ (persistent settings the user adjusts);
  action items are for _actions_ (quick, one-shot operations). Both are needed.

- **Contribute to the workspace row in the sidebar (already done via sections).**
  `registerSection` already lets extensions render content inside workspace rows.
  The section is great for _display_ (showing terminal counts, status, etc.) but
  not for _configuration_ — you can't put checkboxes, text inputs, or multi-row
  forms inside a 24px-tall sidebar row. Property pages provide a full surface.
  **Rejected** — sections and property pages serve different purposes: display
  vs. configuration.

- **Re-use the `registerSection` surface to show inline action buttons.**
  Extensions _could_ put toggle buttons and quick actions inside a section
  component, which is currently possible. But this has two drawbacks:
  (1) the section always consumes row space even when the user doesn't need
  the controls, and (2) actions in a section can't have per-workspace
  visibility predicates that respond to dynamic state (a section renders
  every workspace that registers the provider, it can't easily hide itself
  conditionally without returning null — and even then, the space is wasted).
  A context menu is cleaner for sparse, conditional actions.

## Decision

**Accepted.**

1. **Tab behavior when no pages are registered.** Revised from the original
   proposal: the tab bar is **always shown**, including a permanent "General"
   tab, even with zero extension contributions. (Originally proposed hiding it
   entirely in that case; reconsidered during design review — a tab bar that
   sometimes exists and sometimes doesn't was judged more surprising than one
   that's simply always there.)

2. **Save semantics.** Revised from the original proposal: there is **no
   Save/Cancel footer at all**. Every field persists immediately on change —
   folders (already atomic actions), extension property pages (unchanged from
   the original proposal), and now the General tab's fields too, matching the
   Settings-page convention. The one exception is **Name**, which uses a
   dedicated edit-mode component with explicit Save/Cancel and empty-value
   validation (see "Workspace properties modal redesign" under Design) — the
   only field where immediate per-keystroke persistence would be visibly
   broken elsewhere in the UI. The modal itself is now `dismissible: true`;
   closing it while Name is mid-edit discards that edit specifically, which is
   the only state left that can be lost.

3. **Property page lifecycle across modal reopen.** Unchanged from the
   original proposal: yes, persists via `ctx.storage.workspace`. The host
   doesn't need to know about extension state; the extension re-hydrates from
   storage on mount.

4. **Multi-workspace editing.** Unchanged: not a gap. The modal is
   single-workspace; extensions register against `ctx`, not a workspace, so
   the component always renders for the `ws` passed to it.

5. **Security / sandbox.** Unchanged: no new permission surface, no sandbox
   change. Property pages render in the extension's React tree with the same
   access (`ctx.workspaces`, `ctx.storage.workspace`) it already has.

6. **Per-workspace enable/disable (new, not in the original proposal).**
   Github-actions-specific application logic, no new SDK primitive — see
   "Per-workspace enable/disable" under Design. Summary of the resolved
   design: `ctx.storage.workspace`-backed, following the existing
   `workspaceCurrentBranchOnly` pattern exactly; a single toggling command
   with RFC 0013's `checked` predicate for the context-menu row (not two
   mutually-exclusive commands); a mirrored checkbox in the property page;
   default `true` (zero behavior change on upgrade); disabling fully
   suppresses polling and hides the status-bar item/decorations for that
   workspace, rather than leaving stale data visible.

## References

- [RFC 0013](./0013-context-menu-contributions.md) — **workspace context-menu
  items use the `"workspace"` surface** from RFC 0013's `registerContextMenuItem`
  model. This RFC adds `"workspace"` to the `MenuSurface` type union and the
  `MenuContext` mapping. Coordinates with RFC 0013 to avoid two separate
  context-menu APIs.
- [RFC 0005](./0005-declarative-contributes-activation.md) — declarative
  `contributes` + activation events (future: workspace property pages could become
  a declarative manifest contribution).
- [RFC 0008](./0008-extension-package-format-remote-install.md) — extension
  package format (property pages are registered imperatively via `ctx`, consistent
  with the current model).
- [ADR 0002](../decisions/0002-imperative-registration-no-manifest.md) — imperative
  registration model.
