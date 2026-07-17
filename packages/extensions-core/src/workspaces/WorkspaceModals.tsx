import { useEffect, useState } from "react";
import { FolderPlus } from "@phosphor-icons/react";
import { workspacePropertyPageRegistry } from "@silo-code/extension-host/internal";
import {
  Tooltip,
  useServiceState,
  type WorkspaceService,
} from "@silo-code/sdk";
import { EditableWorkspaceName } from "./EditableWorkspaceName";
import { visiblePropertyPages } from "./workspace-properties-model";
import { fullPath, type Workspace } from "./workspace-helpers";

export interface WorkspacePropertiesModalProps {
  wsId: string;
  home: string;
  workspaces: WorkspaceService;
  /** Opens the native folder picker; resolves to the chosen path or null. */
  onPickFolder: () => Promise<string | null>;
}

interface GeneralTabProps {
  ws: Workspace;
  home: string;
  workspaces: WorkspaceService;
  onPickFolder: () => Promise<string | null>;
}

const GENERAL_TAB_ID = "general";

/**
 * The workspace properties modal's content — a tab bar (built-in **General**
 * plus registered {@link WorkspacePropertyPage}s) over a form where every
 * field persists immediately on change. This is the *content* of the dialog;
 * the host owns the surrounding modal chrome (`ctx.ui.showModal`, rendered
 * `dismissible: true` so Escape/backdrop/✕ all close it — nothing here is
 * staged, so there's nothing left to lose by an accidental close except an
 * in-progress name edit, which {@link EditableWorkspaceName} owns).
 *
 * Takes `wsId` rather than a `Workspace` snapshot and re-derives the live
 * workspace on every render via {@link useServiceState} — unlike the old
 * staged-edit modal (which closed immediately on Save, so a frozen snapshot
 * never had a chance to go stale), this modal stays open across edits, so a
 * captured-at-open-time `ws` would display an outdated name/folder list the
 * instant something saved.
 */
export function WorkspacePropertiesModal({
  wsId,
  home,
  workspaces,
  onPickFolder,
}: WorkspacePropertiesModalProps) {
  const state = useServiceState(workspaces);
  const ws = state.all.find((w) => w.id === wsId);
  if (!ws) return null; // deleted out from under the open modal — dismissible, so the ✕/Escape still closes it
  // Re-render when a property page is registered/unregistered (rare —
  // e.g. an extension activating while the modal happens to be open).
  const [, setPagesTick] = useState(0);
  useEffect(() => {
    return workspacePropertyPageRegistry.subscribe(() =>
      setPagesTick((t) => t + 1),
    ).dispose;
  }, []);
  const pages = visiblePropertyPages(workspacePropertyPageRegistry.list(), ws);

  // A page's own `refresh()` — distinct from the registration tick above, so
  // an extension asking to re-render its tab never gets confused with the
  // tab bar's own membership changing.
  const [, setRefreshTick] = useState(0);

  const [activeTab, setActiveTab] = useState<string>(GENERAL_TAB_ID);
  const activePage = pages.find((p) => p.id === activeTab);
  // If the active extension tab disappears (unregistered, or its `visible`
  // flipped false) fall back to General rather than rendering a blank pane.
  const effectiveTab =
    activeTab === GENERAL_TAB_ID || activePage ? activeTab : GENERAL_TAB_ID;

  return (
    <div className="ws-props-modal">
      <div className="ws-props-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={effectiveTab === GENERAL_TAB_ID}
          className={`ws-props-tab${effectiveTab === GENERAL_TAB_ID ? " ws-props-tab-active" : ""}`}
          onClick={() => setActiveTab(GENERAL_TAB_ID)}
        >
          General
        </button>
        {pages.map((page) => (
          <button
            key={page.id}
            type="button"
            role="tab"
            aria-selected={effectiveTab === page.id}
            className={`ws-props-tab${effectiveTab === page.id ? " ws-props-tab-active" : ""}`}
            onClick={() => setActiveTab(page.id)}
          >
            {page.icon}
            {page.title}
          </button>
        ))}
      </div>
      <div className="ws-props-tab-content">
        {effectiveTab === GENERAL_TAB_ID ? (
          <GeneralTab
            ws={ws}
            home={home}
            workspaces={workspaces}
            onPickFolder={onPickFolder}
          />
        ) : (
          activePage && (
            <activePage.component
              ws={ws}
              workspaces={workspaces}
              refresh={() => setRefreshTick((t) => t + 1)}
            />
          )
        )}
      </div>
    </div>
  );
}

function GeneralTab({ ws, home, workspaces, onPickFolder }: GeneralTabProps) {
  const extraFolders = ws.extraFolders ?? [];
  const allFolders = [ws.folder, ...extraFolders];

  async function addFolder() {
    const picked = await onPickFolder();
    if (!picked) return;
    if (picked === ws.folder || extraFolders.includes(picked)) return;
    workspaces.addFolder(ws.id, picked);
  }

  function removeFolder(folder: string) {
    workspaces.removeFolder(ws.id, folder);
  }

  return (
    <div className="ws-props-form">
      <div className="ws-prop-section">
        <span className="ws-prop-label">Name</span>
        <EditableWorkspaceName
          name={ws.name}
          onSave={(name) => workspaces.rename(ws.id, name)}
        />
      </div>

      <div className="ws-prop-section">
        <div className="ws-prop-label-row">
          <span className="ws-prop-label">Folders</span>
          <span className="ws-prop-count">{allFolders.length}</span>
        </div>
        <div className="ws-folders-list">
          {allFolders.map((folder, i) => (
            <div key={folder} className="ws-folder-list-item">
              <Tooltip content={folder}>
                <span className="ws-folder-list-path" dir="ltr">
                  {fullPath(folder, home)}
                </span>
              </Tooltip>
              {i === 0 ? (
                <span className="ws-folder-primary-badge">primary</span>
              ) : (
                <Tooltip content="Remove folder">
                  <button
                    type="button"
                    className="ws-folder-list-remove"
                    onClick={() => removeFolder(folder)}
                  >
                    ×
                  </button>
                </Tooltip>
              )}
            </div>
          ))}
        </div>
        <button type="button" className="ws-prop-add" onClick={addFolder}>
          <FolderPlus size={14} weight="bold" />
          Add Folder…
        </button>
      </div>
    </div>
  );
}
