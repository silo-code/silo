import { useLayoutEffect, useRef, useState } from "react";
import { FolderPlus } from "@phosphor-icons/react";
import { ModalActions } from "@silo-code/extension-host/internal";
import {
  fullPath,
  type Workspace,
  type WorkspacePropertiesChanges,
} from "./workspace-helpers";

export interface WorkspacePropertiesContentProps {
  ws: Workspace;
  home: string;
  /** Opens the native folder picker; resolves to the chosen path or null. */
  onPickFolder: () => Promise<string | null>;
  /** Cancel — discard staged edits and close. */
  onCancel: () => void;
  /** Save — apply the staged changes and close. */
  onSave: (changes: WorkspacePropertiesChanges) => void;
}

/**
 * Combined workspace properties form — edit the title and manage the folder set
 * in one place. Changes are staged locally and only applied on Save; Cancel
 * discards everything. This is the *content* of the dialog; the host owns the
 * surrounding modal chrome (rendered via `ctx.ui.showModal` as a non-dismissible
 * modal, so staged edits can't be lost by an accidental click-away).
 */
export function WorkspacePropertiesContent({
  ws,
  home,
  onPickFolder,
  onCancel,
  onSave,
}: WorkspacePropertiesContentProps) {
  const [name, setName] = useState(ws.name);
  const [extraFolders, setExtraFolders] = useState<string[]>(
    ws.extraFolders ?? [],
  );
  const nameRef = useRef<HTMLInputElement | null>(null);

  useLayoutEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  const allFolders = [ws.folder, ...extraFolders];
  const trimmed = name.trim();
  const origExtra = ws.extraFolders ?? [];
  const nameDirty = trimmed.length > 0 && trimmed !== ws.name;
  const foldersDirty =
    extraFolders.length !== origExtra.length ||
    extraFolders.some((f) => !origExtra.includes(f));
  const dirty = nameDirty || foldersDirty;

  async function addFolder() {
    const picked = await onPickFolder();
    if (!picked) return;
    if (picked === ws.folder || extraFolders.includes(picked)) return;
    setExtraFolders((prev) => [...prev, picked]);
  }

  function removeFolder(folder: string) {
    setExtraFolders((prev) => prev.filter((f) => f !== folder));
  }

  function commit() {
    if (dirty) onSave({ name: trimmed || ws.name, extraFolders });
    else onCancel();
  }

  return (
    <form
      className="ws-props-form"
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <div className="ws-prop-section">
        <label className="ws-prop-label" htmlFor="ws-prop-name">
          Name
        </label>
        <input
          id="ws-prop-name"
          ref={nameRef}
          className="ws-rename-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
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
              <span className="ws-folder-list-path" dir="ltr" title={folder}>
                {fullPath(folder, home)}
              </span>
              {i === 0 ? (
                <span className="ws-folder-primary-badge">primary</span>
              ) : (
                <button
                  type="button"
                  className="ws-folder-list-remove"
                  title="Remove folder"
                  onClick={() => removeFolder(folder)}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <button type="button" className="ws-prop-add" onClick={addFolder}>
          <FolderPlus size={14} weight="bold" />
          Add Folder…
        </button>
      </div>

      <ModalActions>
        <button type="button" className="silo-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="silo-button-primary" disabled={!dirty}>
          Save
        </button>
      </ModalActions>
    </form>
  );
}
