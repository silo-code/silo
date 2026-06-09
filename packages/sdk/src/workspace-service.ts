import type { Disposable } from "./types";
import type { Workspace } from "./domain-types";

// Re-export the workspace domain types so consumers can name them from the SDK.
export type { Workspace, TerminalRecord } from "./domain-types";

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
}
