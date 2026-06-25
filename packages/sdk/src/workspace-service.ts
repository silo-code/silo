import type { Disposable } from "./types";
import type { Workspace } from "./domain-types";

// Re-export the workspace domain types so consumers can name them from the SDK.
export type { Workspace, TerminalRecord } from "./domain-types";

/**
 * A single status row contributed by a {@link WorkspaceDecorationProvider}.
 * Rows appear below the path line in the Workspaces side panel.
 *
 * @category Consumer Services
 * @public
 */
export interface WorkspaceStatusRow {
  /** Stable key unique within this provider's results; used for reconciliation. */
  id: string;
  /** Semantic status dot shown to the left of the label. */
  status?: "ok" | "warn" | "busy" | "error";
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
 * Sections appear below the path line and any status-row decorations. Multiple
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
 * A decoration provider that contributes {@link WorkspaceStatusRow}s to
 * workspace rows in the Workspaces side panel. Register via
 * {@link WorkspaceService.registerDecoration}.
 *
 * @category Consumer Services
 * @public
 */
export interface WorkspaceDecorationProvider {
  /** Unique id for this provider — conventionally `"<extension-id>.decoration"`. */
  id: string;
  /**
   * Called synchronously for each workspace during render. Return an empty
   * array to contribute nothing for this workspace.
   */
  provide(workspaceId: string): WorkspaceStatusRow[];
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
  /** Hard delete — permanent removal. */
  delete(id: string): void;

  /**
   * Register a decoration provider that contributes status rows to workspace
   * rows in the Workspaces side panel. Multiple providers may be registered;
   * their rows are concatenated in registration order. Returns a
   * {@link Disposable} that unregisters the provider.
   *
   * @example
   * ```ts
   * ctx.subscriptions.push(
   *   ctx.workspaces.registerDecoration({
   *     id: "my-ext.decoration",
   *     provide(workspaceId) {
   *       const running = getRunningTasks(workspaceId);
   *       return running.map(t => ({ id: t.id, status: "busy", label: t.name, startedAt: t.startedAt }));
   *     },
   *   }),
   *   ctx.workspaces.subscribeDecorations(() => ctx.workspaces.invalidateDecorations()),
   * );
   * ```
   */
  registerDecoration(provider: WorkspaceDecorationProvider): Disposable;

  /**
   * Concatenate all registered providers' rows for one workspace (in
   * registration order). Called synchronously during panel render — providers
   * must be fast and side-effect-free.
   */
  getDecorations(workspaceId: string): WorkspaceStatusRow[];

  /**
   * Signal that decoration data has changed. Fires all listeners registered
   * via {@link WorkspaceService.subscribeDecorations}, causing the Workspaces
   * panel to re-query providers and re-render the status rows.
   *
   * Call this after any mutation to the state your `provide` function reads.
   */
  invalidateDecorations(): void;

  /**
   * Subscribe to decoration invalidations. The listener is called whenever
   * {@link WorkspaceService.invalidateDecorations} is invoked. Returns a
   * {@link Disposable} that cancels the subscription.
   *
   * The Workspaces panel subscribes internally; extensions may also subscribe
   * to observe invalidations.
   */
  subscribeDecorations(listener: () => void): Disposable;

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
   */
  subscribeSection(listener: () => void): Disposable;
}
