import type { Extension, ExtensionContext } from "@silo-code/sdk";
import {
  bumpUiFontSize,
  resetUiFontSize,
  openSettings,
  closeSettings,
  pickWorkspaceFolder,
  reloadWindow,
  openDevtools,
  cycleTabInFocusedArea,
  cycleActiveGroup,
  cycleRegionFocus,
} from "@silo-code/extension-host/internal";

async function openFilePicker(ctx: ExtensionContext): Promise<void> {
  const activeId = ctx.workspaces.getState().activeId;
  if (!activeId) return;
  const folder = await pickWorkspaceFolder(activeId);
  if (!folder) return;
  const picked = await ctx.ui.pickFile({ defaultPath: folder });
  if (picked) {
    ctx.editors.open(picked, { workspaceId: activeId });
  }
}

export const extension: Extension = {
  id: "core.menu",
  activate(ctx) {
    // Commands — the action surface of the base menu items.
    ctx.registerCommand({
      id: "core.newFile",
      label: "New File",
      run: () => {
        const id = ctx.workspaces.getState().activeId;
        if (id) ctx.editors.openUntitled({ workspaceId: id });
      },
    });
    ctx.registerCommand({
      id: "core.openFile",
      label: "Open File...",
      run: () => {
        void openFilePicker(ctx);
      },
    });
    ctx.registerCommand({
      id: "core.save",
      label: "Save",
      run: () => {
        ctx.editors.save();
      },
    });
    ctx.registerCommand({
      id: "core.saveAs",
      label: "Save As...",
      run: () => {
        ctx.editors.saveAs();
      },
    });
    ctx.registerCommand({
      id: "core.closeTab",
      label: "Close Tab",
      run: () => {
        ctx.editors.closeActive();
      },
    });

    // Tab cycling, scoped to the focused area: the focused side dock's tabs
    // when a side dock has focus, otherwise the center dock's strip. Keybinding-
    // only (no menu item), so they dispatch through the JS keybinding handler
    // and still surface in the Keybindings settings page via the keymap mirror —
    // same pattern as the workspace cycler. Cmd+Option+←/→ mirrors Safari/Chrome
    // tab navigation on macOS; the workspace cycler (Cmd+`) keeps the workspace
    // scope.
    ctx.registerCommand({
      id: "core.nextTab",
      label: "Next Tab",
      run: () => cycleTabInFocusedArea(1),
    });
    ctx.registerCommand({
      id: "core.previousTab",
      label: "Previous Tab",
      run: () => cycleTabInFocusedArea(-1),
    });
    ctx.registerKeybinding({
      id: "core.nextTab.key",
      key: "cmd+alt+right",
      command: "core.nextTab",
    });
    ctx.registerKeybinding({
      id: "core.previousTab.key",
      key: "cmd+alt+left",
      command: "core.previousTab",
    });

    // Group cycling — move focus across the split groups within the active dock.
    // Cmd+Option+↑/↓ pairs with the ←/→ tab cycling above: horizontal moves
    // between tabs, vertical moves between split groups.
    ctx.registerCommand({
      id: "core.nextGroup",
      label: "Next Group",
      run: () => cycleActiveGroup(1),
    });
    ctx.registerCommand({
      id: "core.previousGroup",
      label: "Previous Group",
      run: () => cycleActiveGroup(-1),
    });
    ctx.registerKeybinding({
      id: "core.nextGroup.key",
      key: "cmd+alt+down",
      command: "core.nextGroup",
    });
    ctx.registerKeybinding({
      id: "core.previousGroup.key",
      key: "cmd+alt+up",
      command: "core.previousGroup",
    });

    // Dock focus — move focus across the top-level docks (Left SideDock →
    // CenterDock → Right SideDock), skipping collapsed/empty side docks.
    // Cmd+Option+./Cmd+Option+, , the layer above tab/group cycling.
    ctx.registerCommand({
      id: "core.focusNextDock",
      label: "Focus Next Dock",
      run: () => cycleRegionFocus(1),
    });
    ctx.registerCommand({
      id: "core.focusPreviousDock",
      label: "Focus Previous Dock",
      run: () => cycleRegionFocus(-1),
    });
    ctx.registerKeybinding({
      id: "core.focusNextDock.key",
      key: "cmd+alt+.",
      command: "core.focusNextDock",
    });
    ctx.registerKeybinding({
      id: "core.focusPreviousDock.key",
      key: "cmd+alt+,",
      command: "core.focusPreviousDock",
    });
    ctx.registerCommand({
      id: "core.newTerminal",
      label: "New Terminal",
      run: async () => {
        const id = ctx.workspaces.getState().activeId;
        if (!id) return;
        const folder = await pickWorkspaceFolder(id);
        if (folder) ctx.terminals.create({ cwd: folder });
      },
    });
    ctx.registerCommand({
      id: "core.zoomIn",
      label: "Zoom In",
      run: () => bumpUiFontSize(+1),
    });
    ctx.registerCommand({
      id: "core.zoomOut",
      label: "Zoom Out",
      run: () => bumpUiFontSize(-1),
    });
    ctx.registerCommand({
      id: "core.zoomReset",
      label: "Reset Zoom",
      run: () => resetUiFontSize(),
    });

    // Layout — core owns the side-panel toggle capability. The status-bar
    // buttons, keybindings, and View-menu items below are all just triggers
    // for these commands, so they can never drift out of sync.
    ctx.registerCommand({
      id: "view.toggleLeftPanel",
      label: "Toggle Left Panel",
      run: () => ctx.layout.toggleSidePanel("left"),
    });
    ctx.registerCommand({
      id: "view.toggleRightPanel",
      label: "Toggle Right Panel",
      run: () => ctx.layout.toggleSidePanel("right"),
    });
    ctx.registerCommand({
      id: "settings.open",
      label: "Settings…",
      run: () => openSettings(),
    });
    ctx.registerCommand({
      id: "settings.close",
      label: "Close Settings",
      run: () => closeSettings(),
    });
    // Hotkeys ride on the View-menu accelerators below (CmdOrCtrl+Alt+[ /
    // CmdOrCtrl+Alt+]) — same mechanism as the zoom items. We deliberately do
    // NOT also registerKeybinding for these keys: the native menu accelerator
    // and the JS keybinding dispatcher would both fire, toggling twice.

    // File menu
    ctx.registerMenuItem({
      id: "core.menu.newFile",
      menu: "file",
      command: "core.newFile",
      accelerator: "CmdOrCtrl+N",
      group: "1_new",
      order: 1,
    });
    ctx.registerMenuItem({
      id: "core.menu.openFile",
      menu: "file",
      command: "core.openFile",
      accelerator: "CmdOrCtrl+O",
      group: "1_new",
      order: 2,
    });
    ctx.registerMenuItem({
      id: "core.menu.save",
      menu: "file",
      command: "core.save",
      accelerator: "CmdOrCtrl+S",
      group: "2_save",
      order: 1,
    });
    ctx.registerMenuItem({
      id: "core.menu.saveAs",
      menu: "file",
      command: "core.saveAs",
      accelerator: "CmdOrCtrl+Shift+S",
      group: "2_save",
      order: 2,
    });
    ctx.registerMenuItem({
      id: "core.menu.closeTab",
      menu: "file",
      command: "core.closeTab",
      accelerator: "CmdOrCtrl+W",
      group: "3_close",
      order: 1,
    });

    // View menu
    ctx.registerMenuItem({
      id: "settings.open.menu",
      menu: "view",
      command: "settings.open",
      accelerator: "CmdOrCtrl+,",
      group: "0_settings",
      order: 1,
    });
    ctx.registerMenuItem({
      id: "view.toggleLeftPanel.menu",
      menu: "view",
      command: "view.toggleLeftPanel",
      accelerator: "CmdOrCtrl+Alt+[",
      group: "1_layout",
      order: 1,
    });
    ctx.registerMenuItem({
      id: "view.toggleRightPanel.menu",
      menu: "view",
      command: "view.toggleRightPanel",
      accelerator: "CmdOrCtrl+Alt+]",
      group: "1_layout",
      order: 2,
    });
    ctx.registerMenuItem({
      id: "core.menu.zoomIn",
      menu: "view",
      command: "core.zoomIn",
      accelerator: "CmdOrCtrl+=",
      group: "1_zoom",
      order: 1,
    });
    ctx.registerMenuItem({
      id: "core.menu.zoomOut",
      menu: "view",
      command: "core.zoomOut",
      accelerator: "CmdOrCtrl+-",
      group: "1_zoom",
      order: 2,
    });
    ctx.registerMenuItem({
      id: "core.menu.zoomReset",
      menu: "view",
      command: "core.zoomReset",
      accelerator: "CmdOrCtrl+0",
      group: "1_zoom",
      order: 3,
    });

    // Window menu
    ctx.registerMenuItem({
      id: "core.menu.newTerminal",
      menu: "window",
      command: "core.newTerminal",
      accelerator: "CmdOrCtrl+T",
      group: "1_term",
      order: 1,
    });

    // Help menu — link items present on all platforms. About + Check for
    // Updates are injected by the host on non-Mac (see menu-items.ts).
    ctx.registerCommand({
      id: "core.openDocumentation",
      label: "Documentation",
      run: () => {
        void ctx.ui.openExternal("https://getsilo.dev/guide/");
      },
    });
    ctx.registerCommand({
      id: "core.openExtensions",
      label: "Extensions",
      run: () => {
        void ctx.ui.openExternal(
          "https://github.com/silo-code/silo-extensions",
        );
      },
    });
    ctx.registerCommand({
      id: "core.openGitHub",
      label: "GitHub",
      run: () => {
        void ctx.ui.openExternal("https://github.com/silo-code/silo");
      },
    });
    ctx.registerMenuItem({
      id: "core.help.docs",
      menu: "help",
      command: "core.openDocumentation",
      group: "1_links",
      order: 1,
    });
    ctx.registerMenuItem({
      id: "core.help.extensions",
      menu: "help",
      command: "core.openExtensions",
      group: "1_links",
      order: 2,
    });
    ctx.registerMenuItem({
      id: "core.help.github",
      menu: "help",
      command: "core.openGitHub",
      group: "1_links",
      order: 3,
    });

    // Dev-only Window items. Silo suppresses the webview's native context menu
    // app-wide, so the Reload / Inspect Element it used to offer live here while
    // developing. Gated on the dev build — they don't ship in release.
    if (import.meta.env.DEV) {
      ctx.registerCommand({
        id: "core.reloadWindow",
        label: "Reload",
        run: () => reloadWindow(),
      });
      ctx.registerCommand({
        id: "core.toggleDevtools",
        label: "Inspect Element",
        run: () => openDevtools(),
      });
      ctx.registerMenuItem({
        id: "core.menu.reloadWindow",
        menu: "window",
        command: "core.reloadWindow",
        accelerator: "CmdOrCtrl+R",
        group: "9_dev",
        order: 1,
      });
      ctx.registerMenuItem({
        id: "core.menu.toggleDevtools",
        menu: "window",
        command: "core.toggleDevtools",
        accelerator: "CmdOrCtrl+Alt+I",
        group: "9_dev",
        order: 2,
      });
    }
  },
};
