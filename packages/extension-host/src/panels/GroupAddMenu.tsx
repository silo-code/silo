import { useRef } from "react";
import {
  type IDockviewHeaderActionsProps,
  type DockviewGroupPanel,
} from "dockview";
import {
  Plus,
  Terminal as TerminalIcon,
  FilePlus,
  FolderOpen,
} from "@phosphor-icons/react";
import { store } from "../state/store";
import {
  addTerminal,
  openEditor,
  openUntitledEditor,
} from "../state/workspaces";
import { pickWorkspaceFolder } from "../extension-host/pick-folder";
import { listCreatableFileTypes } from "../extension-host/file-types";
import { dockPanelKindRegistry } from "../extension-host/dock-panel-kinds";
import { openMenu } from "../extension-host/menu-controller";
import type { MenuEntry } from "@silo-code/sdk";
import type { TerminalKind } from "../state/types";
import { pickFileForWorkspace } from "./dock-helpers";

// Mounted by dockview as the right-side header-actions slot of every tab
// group. Clicking + adds new panels into *this* group via referenceGroup.
export function GroupAddMenu(props: IDockviewHeaderActionsProps) {
  const btnRef = useRef<HTMLButtonElement | null>(null);

  function newPanelInGroup(opts: {
    id: string;
    component: string;
    title: string;
    params: Record<string, unknown>;
  }) {
    const group = props.group as DockviewGroupPanel;
    const panel = props.containerApi.addPanel({
      id: opts.id,
      component: opts.component,
      title: opts.title,
      params: opts.params,
      position: { referenceGroup: group },
    });
    // Explicit setActive — without this the previously-active tab in another
    // group can keep DOM focus, swallowing keystrokes meant for the new tab.
    panel.api.setActive();
  }

  async function spawnTerminal(kind: TerminalKind) {
    const wsId = store.activeWorkspaceId;
    if (!wsId) return;
    const folder = await pickWorkspaceFolder(wsId);
    if (!folder) return;
    const rec = addTerminal(wsId, kind, folder);
    newPanelInGroup({
      id: `terminal:${rec.id}`,
      component: "terminal",
      title: rec.title,
      params: { terminalId: rec.id },
    });
  }

  async function pickFile() {
    const wsId = store.activeWorkspaceId;
    if (!wsId) return;
    const picked = await pickFileForWorkspace(wsId);
    if (!picked) return;
    const rec = openEditor(wsId, picked);
    newPanelInGroup({
      id: `editor:${rec.id}`,
      component: "editor",
      title: rec.title,
      params: { editorId: rec.id },
    });
  }

  function newFile(extension?: string) {
    const wsId = store.activeWorkspaceId;
    if (!wsId) return;
    const rec = openUntitledEditor(wsId, extension);
    newPanelInGroup({
      id: `editor:${rec.id}`,
      component: "editor",
      title: rec.title,
      params: { editorId: rec.id },
    });
  }

  function openAddMenu(e: React.MouseEvent) {
    e.stopPropagation();
    const group = props.group as DockviewGroupPanel;

    const extensionKindItems: MenuEntry[] = dockPanelKindRegistry
      .list()
      .filter((k) => k.addMenuItem != null)
      .map(
        (k): MenuEntry => ({
          label: k.addMenuItem!.label,
          icon: k.addMenuItem!.icon,
          run: () => {
            const params = k.addMenuItem!.params ?? {};
            const id = `${k.id}:${crypto.randomUUID()}`;
            const title = (params.title as string | undefined) ?? k.id;
            const panel = props.containerApi.addPanel({
              id,
              component: k.id,
              title,
              params,
              position: { referenceGroup: group },
            });
            panel.api.setActive();
          },
        }),
      );

    const items: MenuEntry[] = [
      {
        label: "New Terminal",
        icon: <TerminalIcon size={14} weight="regular" />,
        run: () => spawnTerminal("shell"),
      },
      ...extensionKindItems,
      { type: "separator" },
      {
        label: "New file…",
        icon: <FilePlus size={14} weight="regular" />,
        run: () => newFile(),
      },
      ...listCreatableFileTypes().map(
        (t): MenuEntry => ({
          label: `New ${t.label}…`,
          icon: <FilePlus size={14} weight="regular" />,
          run: () => newFile(t.extensions[0]),
        }),
      ),
      {
        label: "Open file…",
        icon: <FolderOpen size={14} weight="regular" />,
        run: pickFile,
      },
    ];
    void openMenu({ items, anchor: btnRef.current });
  }

  return (
    <div className="group-add-menu">
      <button
        ref={btnRef}
        className="group-add-btn"
        title="Add to this group"
        // Mouse-driven dock chrome — kept out of the keyboard Tab order so Tab
        // through the center doesn't stop on it (the center is entered at its
        // content, not its chrome).
        tabIndex={-1}
        onClick={openAddMenu}
      >
        <Plus size={14} weight="bold" />
      </button>
    </div>
  );
}
