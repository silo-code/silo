import type { Disposable } from "./types";
import type { MenuEntry } from "./ui-service";
import type { Workspace } from "./domain-types";
import type { Activity } from "./activity";

// Re-export the workspace domain types so consumers can name them from the SDK.
export type { Workspace, TerminalRecord } from "./domain-types";

/**
 * A single status row contributed by a {@link WorkspaceStatusProvider}.
 * Rows appear below the path line in the Workspaces side panel.
 *
 * @category Consumer Services
 * @public
 */
export interface WorkspaceStatusRow {
  /** Stable key unique within this provider's results; used for reconciliation. */
  id: string;
  /**
   * Host-owned {@link Activity} glyph to the left of the label. Omit for the
   * neutral gray fallback (same as today’s omitted `status`). See ADR 0030.
   */
  activity?: Activity;
  /** Short label — the host truncates with an ellipsis when space is tight. */
  label: string;
  /**
   * ISO timestamp for when this row started. The host renders it as elapsed
   * time using the same `formatElapsed` helper as workspace uptime ("6h", "2d",
   * "just now").
   */
  startedAt?: string;
}

/**
 * Props passed to a {@link WorkspaceSectionProvider} component for each
 * workspace row it is mounted in.
 *
 * @category Consumer Services
 * @public
 */
export interface WorkspaceSectionProps {
  /** The id of the workspace whose row this component is rendering inside. */
  workspaceId: string;
}

/**
 * A section provider that mounts a React component inside workspace rows in the
 * Workspaces side panel. Register via {@link WorkspaceService.registerSection}.
 *
 * Sections appear below the path line and any status rows. Multiple
 * providers stack vertically in ascending {@link WorkspaceSectionProvider.order}
 * order. Return `null` from your component for workspaces where the section
 * should not appear — this produces no DOM node and no visual gap.
 *
 * @category Consumer Services
 * @public
 */
export interface WorkspaceSectionProvider {
  /** Unique id, conventionally `"<extension-id>.section"`. */
  id: string;
  /** The React component mounted once per workspace row. */
  component: React.ComponentType<WorkspaceSectionProps>;
  /** Sort order among sections. Lower values appear first. Defaults to `0`. */
  order?: number;
}

/**
 * A badge displayed next to the workspace name in the Workspaces side panel.
 * Contributed by a {@link WorkspaceBadgeProvider}.
 *
 * @category Consumer Services
 * @public
 */
export interface WorkspaceBadge {
  /** Stable key unique within this provider's results; used for reconciliation. */
  id: string;
  /** Short text rendered inside the badge. */
  text: string;
  /**
   * Solid chip fill color. Text paints white on top for contrast. Falls back
   * to a muted solid background + hi text when omitted.
   */
  color?: string;
}

/**
 * A badge binder that contributes {@link WorkspaceBadge}s next to the
 * workspace name in the Workspaces side panel. Prefer
 * {@link WorkspaceService.bindBadge}; {@link WorkspaceService.registerBadge}
 * remains as a deprecated alias.
 *
 * @category Consumer Services
 * @public
 */
export interface WorkspaceBadgeProvider {
  /** Unique id for this binder — conventionally `"<extension-id>.badges"`. */
  id: string;
  /**
   * Called synchronously for each workspace during render. Return an empty
   * array to contribute nothing for this workspace.
   */
  provide(workspaceId: string): WorkspaceBadge[];
}

/**
 * A status binder that contributes {@link WorkspaceStatusRow}s to
 * workspace rows in the Workspaces side panel. Prefer
 * {@link WorkspaceService.bindStatus}; {@link WorkspaceService.registerStatus}
 * remains as a deprecated alias.
 *
 * Unlike CenterDock tab `bindIndicator` (single adornment | null), status
 * and badge binders return an **array** — one projection may emit many rows.
 *
 * @category Consumer Services
 * @public
 */
export interface WorkspaceStatusProvider {
  /** Unique id for this binder — conventionally `"<extension-id>.status"`. */
  id: string;
  /**
   * Called synchronously for each workspace during render. Return an empty
   * array to contribute nothing for this workspace.
   */
  provide(workspaceId: string): WorkspaceStatusRow[];
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
   * The workspace service — read workspace state and subscribe to changes.
   * Persist the page's own settings via `ctx.storage.workspace`, applying
   * them immediately on change (the properties modal has no Save button —
   * every field persists as it changes).
   */
  workspaces: WorkspaceService;
  /**
   * Force a re-render of this tab's content. The host never persists
   * extension state — the extension owns that via `ctx.storage.workspace` —
   * but after an out-of-band change (e.g. a background poll updating what
   * the page displays) call this to refresh the mounted component.
   */
  refresh?: () => void;
}

/**
 * A tab contributed by an extension inside the workspace properties modal.
 * Register via {@link WorkspaceService.registerPropertyPage}.
 *
 * The modal always shows a tab bar; the built-in **General** tab (name,
 * folders) is first, followed by registered pages sorted by
 * {@link WorkspacePropertyPage.order | order} within each extension.
 *
 * @category Consumer Services
 * @public
 */
export interface WorkspacePropertyPage {
  /** Unique id, conventionally `"<extension-id>.properties"`. */
  id: string;
  /** Tab label shown in the tab bar. */
  title: string;
  /** Optional icon rendered to the left of the tab label. */
  icon?: React.ReactNode;
  /**
   * The React component rendered as the tab's content. Receives the
   * workspace being edited and the workspace service
   * ({@link WorkspacePropertyPageProps}).
   */
  component: React.ComponentType<WorkspacePropertyPageProps>;
  /**
   * Whether this tab should appear for this workspace. Defaults to `true`
   * (always visible); return `false` to hide it for workspaces where the
   * extension is not relevant (e.g. a workspace with no git repo).
   */
  visible?: (ws: Workspace) => boolean;
  /**
   * Sort order within this extension's contributions. Lower values appear
   * first. Defaults to `0`.
   */
  order?: number;
}

/**
 * An immutable, frozen view of workspace state, returned by
 * {@link WorkspaceService.getState} and delivered to subscribers — read
 * access without a Valtio dependency.
 *
 * @category Consumer Services
 * @public
 */
export interface WorkspaceState {
  /** All workspaces, in user-defined order. */
  all: readonly Workspace[];
  /** Workspaces where closedAt is null/undefined, in user-defined order. */
  open: readonly Workspace[];
  /** Workspaces where closedAt is set, sorted by closedAt descending. */
  closed: readonly Workspace[];
  activeId: string | null;
  /** True once the persisted state has been loaded into the store. */
  hydrated: boolean;
}

/**
 * Input for {@link WorkspaceService.create}.
 *
 * @category Consumer Services
 * @public
 */
export interface CreateWorkspaceInput {
  /** Absolute path of the workspace's primary folder. */
  folder: string;
  /** Display name for the workspace. */
  name: string;
}

/**
 * Consumer API for workspace state, exposed as {@link ExtensionContext.workspaces}.
 * Read via {@link WorkspaceService.getState | getState} /
 * {@link WorkspaceService.subscribe | subscribe}; drive via the create/rename/
 * close methods. Opening editor tabs lives on {@link ExtensionContext.editors},
 * not here.
 *
 * @category Consumer Services
 * @public
 */
export interface WorkspaceService {
  /** Current frozen view of workspace state. */
  getState(): WorkspaceState;
  subscribe(listener: (s: WorkspaceState) => void): Disposable;
  /**
   * The workspace with this id, or `undefined`. A one-shot lookup for event
   * handlers; for reactive reads use {@link useServiceState} over the state.
   */
  get(id: string): Workspace | undefined;
  /** Show a folder picker and create a workspace from the chosen folder. */
  createFromFolderPicker(): Promise<Workspace | null>;
  create(input: CreateWorkspaceInput): Workspace;
  rename(id: string, name: string): void;
  /**
   * Move a workspace to a new position relative to a reference workspace.
   * @param from - Id of the workspace being dragged / moved.
   * @param to - Id of the reference workspace (the insertion anchor).
   * @param position - Whether to place `from` before or after `to`.
   */
  reorder(from: string, to: string, position: "before" | "after"): void;
  /** Activate (and reopen if closed). */
  activate(id: string): void;
  /** Soft close — workspace stays saved but is hidden from the active list. */
  close(id: string): void;
  /** Reverse of close. */
  reopen(id: string): void;
  /** Add an extra folder to a workspace (no-op if already present or is the primary). */
  addFolder(id: string, folder: string): void;
  /** Remove an extra folder from a workspace. */
  removeFolder(id: string, folder: string): void;
  /**
   * Hard delete — permanent removal. Also reaps every terminal in the
   * workspace (removes records and kills live PTY sessions); callers do not
   * need a separate {@link TerminalService.closeWorkspace} step. The entry is
   * removed from state synchronously (before this returns); the returned
   * promise resolves once the reaped PTYs have actually been killed, for
   * callers (e.g. tests) that need that guarantee. Most callers can ignore it.
   */
  delete(id: string): Promise<void>;

  /**
   * Imperatively adorn a workspace row with a status line. `row.id` is the
   * adornment key for {@link WorkspaceService.clearStatus}.
   */
  setStatus(workspaceId: string, row: WorkspaceStatusRow): void;

  /** Remove an imperative status row previously set via {@link WorkspaceService.setStatus}. */
  clearStatus(workspaceId: string, rowId: string): void;

  /**
   * Keep a status projection in sync for every workspace. `provide` returns
   * an array of rows (may be empty). Prefer this over repeatedly calling
   * {@link WorkspaceService.setStatus}.
   *
   * @example
   * ```ts
   * ctx.subscriptions.push(
   *   ctx.workspaces.bindStatus({
   *     id: "my-ext.status",
   *     provide(workspaceId) {
   *       const running = getRunningTasks(workspaceId);
   *       return running.map(t => ({ id: t.id, activity: "working", label: t.name, startedAt: t.startedAt }));
   *     },
   *   }),
   * );
   * ```
   */
  bindStatus(binder: WorkspaceStatusProvider): Disposable;

  /**
   * @deprecated Prefer {@link WorkspaceService.bindStatus}.
   */
  registerStatus(provider: WorkspaceStatusProvider): Disposable;

  /**
   * Concatenate imperative rows and all binders' rows for one workspace (in
   * binder registration order). Called synchronously during panel render —
   * binders must be fast and side-effect-free.
   */
  getStatus(workspaceId: string): WorkspaceStatusRow[];

  /**
   * Signal that binder data has changed. Fires all listeners registered
   * via {@link WorkspaceService.subscribeStatus}, causing the Workspaces
   * panel to re-query binders and re-render the status rows.
   *
   * Call this after any mutation to the state your `provide` function reads.
   * Imperative {@link WorkspaceService.setStatus} / {@link WorkspaceService.clearStatus}
   * already notify listeners.
   */
  invalidateStatus(): void;

  /**
   * Subscribe to status invalidations. The listener is called whenever
   * {@link WorkspaceService.invalidateStatus} is invoked (or imperative
   * set/clear runs). Returns a {@link Disposable} that cancels the
   * subscription.
   */
  subscribeStatus(listener: () => void): Disposable;

  /**
   * Register a section provider that mounts a React component inside workspace
   * rows in the Workspaces side panel. Returns a {@link Disposable} that
   * unregisters the provider and unmounts the component from all rows.
   *
   * Return `null` from your component for workspaces where the section should
   * not appear — this produces no DOM node and no visual gap.
   *
   * @example
   * ```tsx
   * ctx.subscriptions.push(
   *   ctx.workspaces.registerSection({
   *     id: "my-ext.section",
   *     component: ({ workspaceId }) => {
   *       const ws = ctx.workspaces.get(workspaceId);
   *       if (!ws?.terminals.length) return null;
   *       return <MyCard terminals={ws.terminals} />;
   *     },
   *   }),
   * );
   * ```
   */
  registerSection(provider: WorkspaceSectionProvider): Disposable;

  /**
   * Subscribe to section registration changes. The listener is called whenever
   * a {@link WorkspaceSectionProvider} is registered or unregistered. Returns a
   * {@link Disposable} that cancels the subscription.
   *
   * The Workspaces panel subscribes internally to re-render when providers
   * are added or removed.
   *
   * **No `invalidateSection` by design.** Unlike status rows and badges, a
   * section is a live React component that re-renders on its own internal or
   * context-driven state changes — it is not a snapshot returned from a
   * `provide()` call, so there is nothing for the host to re-query. If a
   * section needs to trigger a full workspace-panel refresh (rare), it should
   * update its own state directly.
   */
  subscribeSection(listener: () => void): Disposable;

  /**
   * Register a property page that adds a tab to the workspace properties
   * modal. The host composes all registered pages into the modal's tab bar,
   * after the built-in General tab. The extension is responsible for
   * persisting its settings via `ctx.storage.workspace`, immediately on
   * change — the modal has no Save button.
   *
   * Returns a {@link Disposable} that unregisters the page and unmounts the
   * component from any open properties modal.
   *
   * @example
   * ```tsx
   * ctx.subscriptions.push(
   *   ctx.workspaces.registerPropertyPage({
   *     id: "silo.github-actions.properties",
   *     title: "GitHub Actions",
   *     icon: <IconGitHub size={14} />,
   *     component: GhActionsWorkspaceSettings,
   *     visible: (ws) => hasDetectedRepo(ws.id),
   *   }),
   * );
   * ```
   */
  registerPropertyPage(page: WorkspacePropertyPage): Disposable;

  /**
   * The rows of the **Open Workspace** menu — the same menu the Navigator's
   * `+` button opens: any saved groups, then closed workspaces to reopen (a
   * missing folder is flagged), a separator, then "New workspace…" and
   * "New Group…".
   *
   * Use it to offer workspace switching from your own UI without rebuilding
   * the list — the returned {@link MenuEntry | entries} drop straight into
   * {@link UiService.showMenu}, including as a `submenu` of one of your own
   * rows. Async because the closed-workspace rows check whether each folder
   * still exists on disk.
   *
   * @example
   * ```ts
   * ctx.ui.showMenu({
   *   items: [
   *     { label: "Refresh", run: refresh },
   *     { type: "separator" },
   *     { label: "Workspace", submenu: await ctx.workspaces.getOpenWorkspaceMenuItems() },
   *   ],
   *   anchor,
   * });
   * ```
   */
  getOpenWorkspaceMenuItems(): Promise<MenuEntry[]>;

  /**
   * The rows of one workspace's context menu — **Properties…**, **Close**, then
   * whatever extensions contributed on the `"workspace"`
   * {@link MenuSurface | surface}.
   *
   * Use it when your own UI names a workspace without *being* the workspace
   * list — an agent row showing which workspace its terminal lives in, a
   * search result grouped by workspace — so the same actions are one
   * right-click away there too. Returns an empty array for an unknown id.
   *
   * Group membership actions (Move to Group, Remove from Group) are **not**
   * included: group state is host-internal (ADR 0023), so the Workspaces view
   * appends those itself.
   *
   * @example
   * ```ts
   * ctx.ui.showMenu({
   *   items: [
   *     { label: "Mark as seen", run: acknowledge },
   *     { type: "separator" },
   *     { label: ws.name, submenu: ctx.workspaces.getWorkspaceMenuItems(ws.id) },
   *   ],
   *   at: { x: e.clientX, y: e.clientY },
   * });
   * ```
   */
  getWorkspaceMenuItems(workspaceId: string): MenuEntry[];

  /**
   * Imperatively adorn a workspace name with a badge. `badge.id` is the
   * adornment key for {@link WorkspaceService.clearBadge}.
   */
  setBadge(workspaceId: string, badge: WorkspaceBadge): void;

  /** Remove an imperative badge previously set via {@link WorkspaceService.setBadge}. */
  clearBadge(workspaceId: string, badgeId: string): void;

  /**
   * Keep a badge projection in sync for every workspace. `provide` returns
   * an array of badges (may be empty).
   *
   * @example
   * ```ts
   * ctx.subscriptions.push(
   *   ctx.workspaces.bindBadge({
   *     id: "my-ext.badges",
   *     provide(workspaceId) {
   *       const status = getStatus(workspaceId);
   *       if (!status) return [];
   *       return [{ id: "status", text: status.label, color: status.color }];
   *     },
   *   }),
   * );
   * ```
   */
  bindBadge(binder: WorkspaceBadgeProvider): Disposable;

  /**
   * @deprecated Prefer {@link WorkspaceService.bindBadge}.
   */
  registerBadge(provider: WorkspaceBadgeProvider): Disposable;

  /**
   * Concatenate imperative badges and all binders' badges for one workspace
   * (in binder registration order).
   */
  getBadges(workspaceId: string): WorkspaceBadge[];

  /**
   * Signal that badge binder data has changed. Imperative set/clear already
   * notify listeners.
   */
  invalidateBadges(): void;

  /**
   * Subscribe to badge invalidations.
   */
  subscribeBadges(listener: () => void): Disposable;
}
