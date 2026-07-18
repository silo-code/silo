import { useEffect, useState } from "react";
import {
  AddRow,
  Badge,
  IconButton,
  InlineEdit,
  List,
  ListRow,
  Section,
  TabPanel,
  Tabs,
  Tooltip,
  path,
  useServiceState,
  type FileService,
  type WorkspaceService,
} from "@silo-code/sdk";
import { workspacePropertyPageRegistry } from "@silo-code/extension-host/internal";
import {
  isLinkedWorktreeGitEntry,
  partitionWorkspaceFolders,
  validateWorkspaceName,
  visiblePropertyPages,
} from "./workspace-properties-model";
import { fullPath, type Workspace } from "./workspace-helpers";

export interface WorkspacePropertiesModalProps {
  wsId: string;
  home: string;
  workspaces: WorkspaceService;
  files: FileService;
  /** Opens the native folder picker; resolves to the chosen path or null. */
  onPickFolder: () => Promise<string | null>;
  /** Open the Manage Worktrees modal for this workspace. */
  onManageWorktrees: () => void;
}

interface GeneralTabProps {
  ws: Workspace;
  home: string;
  workspaces: WorkspaceService;
  files: FileService;
  onPickFolder: () => Promise<string | null>;
  onManageWorktrees: () => void;
}

const GENERAL_TAB_ID = "general";

function RemoveIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The workspace properties modal's content — a tab bar (built-in **General**
 * plus registered {@link WorkspacePropertyPage}s) over a form where every
 * field persists immediately on change. This is the *content* of the dialog;
 * the host owns the surrounding modal chrome (`ctx.ui.showModal`, rendered
 * `dismissible: true` so Escape/backdrop/✕ all close it — nothing here is
 * staged, so there's nothing left to lose by an accidental close except an
 * in-progress name edit, which {@link InlineEdit} owns via two-stage Escape).
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
  files,
  onPickFolder,
  onManageWorktrees,
}: WorkspacePropertiesModalProps) {
  const state = useServiceState(workspaces);
  const ws = state.all.find((w) => w.id === wsId);

  // Every hook below must run unconditionally, on every render, before the
  // `!ws` early return further down — otherwise a workspace deleted out from
  // under an open modal would change the hook count between renders (React's
  // Rules of Hooks), not just make the content disappear.

  // Re-render when a property page is registered/unregistered (rare —
  // e.g. an extension activating while the modal happens to be open).
  const [, setPagesTick] = useState(0);
  useEffect(() => {
    return workspacePropertyPageRegistry.subscribe(() =>
      setPagesTick((t) => t + 1),
    ).dispose;
  }, []);

  // A page's own `refresh()` — distinct from the registration tick above, so
  // an extension asking to re-render its tab never gets confused with the
  // tab bar's own membership changing.
  const [, setRefreshTick] = useState(0);

  const [activeTab, setActiveTab] = useState<string>(GENERAL_TAB_ID);

  if (!ws) return null; // deleted out from under the open modal — dismissible, so the ✕/Escape still closes it

  const pages = visiblePropertyPages(workspacePropertyPageRegistry.list(), ws);
  const activePage = pages.find((p) => p.id === activeTab);
  // If the active extension tab disappears (unregistered, or its `visible`
  // flipped false) fall back to General rather than rendering a blank pane.
  const effectiveTab =
    activeTab === GENERAL_TAB_ID || activePage ? activeTab : GENERAL_TAB_ID;

  const tabs = [
    { id: GENERAL_TAB_ID, label: "General" },
    ...pages.map((page) => ({ id: page.id, label: page.title })),
  ];

  return (
    <div className="ws-props-modal">
      <Tabs tabs={tabs} active={effectiveTab} onSelect={setActiveTab} />
      <TabPanel>
        {effectiveTab === GENERAL_TAB_ID ? (
          <GeneralTab
            ws={ws}
            home={home}
            workspaces={workspaces}
            files={files}
            onPickFolder={onPickFolder}
            onManageWorktrees={onManageWorktrees}
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
      </TabPanel>
    </div>
  );
}

/**
 * Classify which of `extras` are linked git worktrees by stating each
 * folder's `.git` entry. Linked worktrees use a `.git` file; ordinary
 * folders / the main worktree use a directory (or have no `.git`).
 */
function useLinkedWorktreeExtras(
  extras: readonly string[],
  files: FileService,
): ReadonlySet<string> {
  const [linked, setLinked] = useState<ReadonlySet<string>>(() => new Set());
  // Stable key so reordering-identical lists don't re-stat.
  const extrasKey = extras.join("\0");

  useEffect(() => {
    let cancelled = false;
    if (extras.length === 0) {
      setLinked(new Set());
      return;
    }
    void (async () => {
      const next = new Set<string>();
      await Promise.all(
        extras.map(async (folder) => {
          try {
            const meta = await files.stat(path.join(folder, ".git"));
            if (isLinkedWorktreeGitEntry(meta)) next.add(folder);
          } catch {
            // Permission / I/O errors — treat as ordinary folder.
          }
        }),
      );
      if (!cancelled) setLinked(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [extrasKey, extras, files]);

  return linked;
}

function GeneralTab({
  ws,
  home,
  workspaces,
  files,
  onPickFolder,
  onManageWorktrees,
}: GeneralTabProps) {
  const extraFolders = ws.extraFolders ?? [];
  const linkedWorktrees = useLinkedWorktreeExtras(extraFolders, files);
  const { folders, worktrees } = partitionWorkspaceFolders(
    ws.folder,
    extraFolders,
    linkedWorktrees,
  );

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
      <Section label="Name">
        <InlineEdit
          value={ws.name}
          onSave={(name) => workspaces.rename(ws.id, name)}
          validate={validateWorkspaceName}
          aria-label="Rename workspace"
        />
      </Section>

      <Section label="Folders" accessory={<Badge>{folders.length}</Badge>}>
        <List aria-label="Workspace folders">
          {folders.map((folder, i) => (
            <ListRow
              key={folder}
              selected={i === 0}
              truncate="start"
              trailing={
                i === 0 ? (
                  <Badge tone="accent">primary</Badge>
                ) : (
                  <Tooltip content="Remove folder">
                    <IconButton
                      size="sm"
                      aria-label="Remove folder"
                      onClick={() => removeFolder(folder)}
                    >
                      <RemoveIcon />
                    </IconButton>
                  </Tooltip>
                )
              }
            >
              {fullPath(folder, home)}
            </ListRow>
          ))}
        </List>
        <AddRow onClick={addFolder}>Add Folder…</AddRow>
      </Section>

      <Section label="Worktrees" accessory={<Badge>{worktrees.length}</Badge>}>
        {worktrees.length > 0 && (
          <List aria-label="Workspace worktrees">
            {worktrees.map((folder) => (
              <ListRow
                key={folder}
                truncate="start"
                trailing={
                  <Tooltip content="Close worktree view">
                    <IconButton
                      size="sm"
                      aria-label="Close worktree view"
                      onClick={() => removeFolder(folder)}
                    >
                      <RemoveIcon />
                    </IconButton>
                  </Tooltip>
                }
              >
                {fullPath(folder, home)}
              </ListRow>
            ))}
          </List>
        )}
        <AddRow onClick={onManageWorktrees}>Manage Worktrees…</AddRow>
      </Section>
    </div>
  );
}
