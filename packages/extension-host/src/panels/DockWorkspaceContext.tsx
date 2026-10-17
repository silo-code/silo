import { createContext, useContext, type ReactNode } from "react";

/**
 * The workspace a dock — and therefore every panel, tab and chrome strip
 * inside it — belongs to.
 *
 * `CenterDock` mounts one `WorkspaceDock` per warmed workspace, each with its
 * own dockview instance, and keeps the inactive ones mounted-but-hidden. So a
 * panel cannot read its workspace off global state (`store.activeWorkspaceId`
 * is wherever the *user* is standing, not where the panel lives), and it
 * cannot read it off dockview, which knows nothing about workspaces.
 *
 * It comes down the React tree instead. dockview renders every panel, tab and
 * header component as a portal inside `<DockviewReact>`'s own JSX, so
 * everything in the dock is a React descendant of the provider regardless of
 * where its DOM lands — and the value is correct on a panel's very first
 * render, for a panel restored from a saved layout exactly as for one added
 * live.
 *
 * This replaced a `WeakMap<DockviewApi, string>` keyed on the dockview api
 * object (`dock-api-registry`'s `registerDockApiWorkspace`). That key is not
 * stable across the restore path: `api.addPanel` hands a panel the
 * component's shared api instance, but dockview's deserializer
 * (`DefaultDockviewDeserialzier.fromJSON`) constructs each restored panel with
 * `new DockviewApi(accessor)` — a different object — so the lookup missed for
 * every panel that came back from a saved layout and silently resolved to
 * `""`.
 */
const DockWorkspaceContext = createContext<string | null>(null);

export function DockWorkspaceProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  return (
    <DockWorkspaceContext.Provider value={workspaceId}>
      {children}
    </DockWorkspaceContext.Provider>
  );
}

/**
 * The workspace id of the dock this component is rendered inside, or `null`
 * outside any dock. Callers that must have one (a panel's chrome, its toolbar
 * target) are always inside a `WorkspaceDock`.
 */
export function useDockWorkspaceId(): string | null {
  return useContext(DockWorkspaceContext);
}
