---
status: draft
created: 2026-07-15
# supersedes:
# superseded-by:
---

# 0015. Workspace extension contributions — extending the workspace surface

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
modal workflow for the full workflow list.

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

1. Renders the **base properties** (name, folders) as today.
2. Collects all registered **workspace property pages** from loaded extensions.
3. If there are any, renders a **tab bar** above the properties content with
   extension contribution tabs.
4. The first tab is always "General" (the built-in properties); subsequent tabs
   are sorted by `order` within each extension.

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

### GitHub Actions example implementation

The github-actions extension registers two things:

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
ctx.registerCommand({
  id: "silo.github-actions.refresh-workspace",
  label: "GitHub Actions: Refresh",
  run: (ws: Workspace) => service.refreshWorkspace(ws.id),
});

ctx.registerCommand({
  id: "silo.github-actions.clear-alerts-workspace",
  label: "GitHub Actions: Clear Alerts",
  run: (ws: Workspace) => service.clearAlerts(ws.id),
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

```tsx
function GhActionsWorkspaceSettings({
  ws,
  workspaces,
}: WorkspacePropertyPageProps) {
  const states = ghStore.getRepoStates(ws.id);
  const hasRepo = states.some((s) => s.repoInfo !== null);
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

_Draft._ Open questions:

1. **Tab behavior when no pages are registered.** Should the tab bar be hidden
   entirely when only the built-in "General" tab exists? (The github-actions modal
   today is a flat form; if an extension registers a page, we introduce tabs.)
   **Proposed: yes, show the tab bar only when extensions contribute pages.**

2. **Save semantics for extension tabs.** The workspace-properties modal saves
   name + folders on Save. Extension property pages persist their own state via
   `ctx.storage.workspace` — they don't need the modal's Save button. Should the
   modal still show a Save/Cancel footer when extension tabs are present?
   **Proposed: no footer when only extension tabs are rendered; the modal
   auto-closes on extension save. Show footer when the General tab has changes.**
   This mirrors the natural pattern: extension settings save immediately on change,
   workspace metadata saves on explicit Save.

3. **Property page lifecycle across modal reopen.** If the user opens workspace
   properties, navigates to the github-actions tab, changes a toggle, closes the
   modal, then reopens it — should the toggle persist? Yes, because it's persisted
   to `ctx.storage.workspace`. The host doesn't need to know about extension state;
   the extension re-hydrates from storage on mount.

4. **Multi-workspace editing.** Can the user open one properties modal and see
   workspace B's settings? No — the modal is single-workspace. Extensions register
   against `ctx`, not against a workspace, so the component always renders for the
   workspace passed as `ws`. **Not a gap** — this matches the current workspace
   properties behavior.

5. **Security / sandbox.** Property pages render in the extension's React tree
   (same as side panels, dock panels, status items). No new permission surface —
   the extension already has access to `ctx.workspaces` and `ctx.storage.workspace`.
   No sandbox change needed.

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
