import type { CSSProperties } from "react";
import { SquaresFour } from "@phosphor-icons/react";
import { store } from "../state/store";
import {
  addTerminal,
  openEditor,
  openUntitledEditor,
} from "../state/workspaces";
import { pickWorkspaceFolder } from "../extension-host/pick-folder";
import { listCreatableFileTypes } from "../extension-host/file-types";
import { pickFileForWorkspace } from "./dock-helpers";

// Empty watermark — shown when a workspace has no panels yet. Mirrors the
// items in the per-group + dropdown so the user can bootstrap the workspace
// with one click.
export function EmptyWatermark() {
  async function onOpenFile() {
    const wsId = store.activeWorkspaceId;
    if (!wsId) return;
    const path = await pickFileForWorkspace(wsId);
    if (path) openEditor(wsId, path);
  }
  function onNewFile(extension?: string) {
    const wsId = store.activeWorkspaceId;
    if (!wsId) return;
    openUntitledEditor(wsId, extension);
  }
  async function onNewTerminal() {
    const wsId = store.activeWorkspaceId;
    if (!wsId) return;
    const folder = await pickWorkspaceFolder(wsId);
    if (!folder) return;
    addTerminal(wsId, "shell", folder);
  }
  const actionStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    background: "transparent",
    border: "none",
    borderRadius: 0,
    padding: "4px 0",
    color: "var(--silo-color-accent)",
    fontSize: "var(--silo-internal-font-size-right-panel)",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
  };
  const kbdStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 20,
    padding: "2px 5px",
    background: "var(--silo-color-bg-hover)",
    border: "1px solid var(--silo-color-border)",
    borderRadius: 3,
    fontFamily: "var(--silo-font-ui)",
    fontSize: "var(--silo-font-size-sm)",
    color: "var(--silo-color-text)",
    lineHeight: 1.4,
  };
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div className="dock-watermark">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 16,
            width: 280,
            color: "var(--silo-color-text)",
            fontWeight: 500,
            fontSize: "calc(var(--silo-font-size-base) + 4px)",
          }}
        >
          <SquaresFour size={28} weight="duotone" />
          <span>Empty Workspace</span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            width: 280,
          }}
        >
          <button style={actionStyle} onClick={onNewTerminal}>
            <span>New Terminal</span>
            <span style={{ display: "flex", gap: 3 }}>
              <kbd style={kbdStyle}>⌘</kbd>
              <kbd style={kbdStyle}>T</kbd>
            </span>
          </button>
          <button style={actionStyle} onClick={() => onNewFile()}>
            <span>New File</span>
            <span style={{ display: "flex", gap: 3 }}>
              <kbd style={kbdStyle}>⌘</kbd>
              <kbd style={kbdStyle}>N</kbd>
            </span>
          </button>
          {listCreatableFileTypes().map((t) => (
            <button
              key={t.id}
              style={actionStyle}
              onClick={() => onNewFile(t.extensions[0])}
            >
              <span>New {t.label}</span>
            </button>
          ))}
          <button style={actionStyle} onClick={onOpenFile}>
            <span>Open File…</span>
            <span style={{ display: "flex", gap: 3 }}>
              <kbd style={kbdStyle}>⌘</kbd>
              <kbd style={kbdStyle}>O</kbd>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
