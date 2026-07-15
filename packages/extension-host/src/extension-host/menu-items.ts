import {
  Menu,
  MenuItem,
  PredefinedMenuItem,
  Submenu,
} from "@tauri-apps/api/menu";
import { Registry } from "./registry";
import { commandRegistry, executeCommand } from "./commands";
import { contextKeys, onContextChange } from "./context-keys";
import {
  clearMenuDefaults,
  effectiveKey,
  onKeymapChange,
  recordMenuDefault,
  toTauriAccelerator,
} from "./keymap";
import type { Disposable, MenuId, MenuItemContribution } from "@silo-code/sdk";
import { checkForUpdatesInteractive } from "./update-service";
import { openSettings } from "./settings-dialog";
import { getExtensionManager } from "./extension-manager";

export const menuItemRegistry = new Registry<MenuItemContribution>();

// Rebuild the native menu whenever user keybinding overrides change, so a
// menu-homed command's accelerator reflects its effective key.
onKeymapChange(() => {
  void syncMenu();
});

// Same idea for the extension-updates entry in Help (below): the native menu
// has no reactive text, so a changed update count means a full rebuild —
// cheap and already the established pattern here (see onKeymapChange above).
// Deferred to first `syncMenu()` call (rather than module-eval time) so this
// stays inert if extension-manager.ts is mid-circular-import when this module
// first loads (as it is in extension-manager.test.ts's dependency graph).
let subscribedToExtensionManager = false;
function ensureExtensionManagerSubscription(): void {
  if (subscribedToExtensionManager) return;
  subscribedToExtensionManager = true;
  getExtensionManager().subscribe(() => {
    void syncMenu();
  });
}

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform);

type AnyMenuItem = MenuItem | PredefinedMenuItem | Submenu;

// Tracks live native MenuItem refs for contributions with `when` clauses so
// we can call setEnabled on context-key changes without rebuilding the menu.
interface LiveItem {
  native: MenuItem;
  contribution: MenuItemContribution;
}
let liveItems: LiveItem[] = [];
let contextSub: Disposable | null = null;

async function buildExtensionItem(
  item: MenuItemContribution,
): Promise<MenuItem> {
  const cmd = commandRegistry.get(item.command);
  const text = item.label ?? cmd?.label ?? item.command;
  const enabled = item.when ? item.when(contextKeys) : true;
  // The declared accelerator is the command's default; the effective key
  // (default unless the user overrode/unbound it) is what we actually bind.
  if (item.accelerator) recordMenuDefault(item.command, item.accelerator);
  const eff = effectiveKey(item.command);
  const native = await MenuItem.new({
    id: `ext:${item.id}`,
    text,
    accelerator: eff ? toTauriAccelerator(eff) : undefined,
    enabled,
    action: () => {
      executeCommand(item.command);
    },
  });
  if (item.when) liveItems.push({ native, contribution: item });
  return native;
}

function groupAndSort(items: MenuItemContribution[]): MenuItemContribution[][] {
  const byGroup = new Map<string, MenuItemContribution[]>();
  for (const item of items) {
    const g = item.group ?? "9_default";
    let arr = byGroup.get(g);
    if (!arr) {
      arr = [];
      byGroup.set(g, arr);
    }
    arr.push(item);
  }
  const groupNames = [...byGroup.keys()].sort();
  return groupNames.map((g) => {
    const arr = byGroup.get(g)!;
    arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return arr;
  });
}

async function buildSubmenu(
  text: string,
  predefinedGroups: PredefinedMenuItem[][],
  extras: MenuItemContribution[],
): Promise<Submenu> {
  const items: AnyMenuItem[] = [];

  for (let i = 0; i < predefinedGroups.length; i++) {
    if (i > 0) items.push(await PredefinedMenuItem.new({ item: "Separator" }));
    items.push(...predefinedGroups[i]);
  }

  const groups = groupAndSort(extras);
  for (const group of groups) {
    if (items.length > 0)
      items.push(await PredefinedMenuItem.new({ item: "Separator" }));
    for (const c of group) items.push(await buildExtensionItem(c));
  }

  return Submenu.new({ text, items });
}

async function buildAppSubmenu(): Promise<Submenu> {
  const items = await Promise.all([
    PredefinedMenuItem.new({ item: { About: null } }),
    MenuItem.new({
      id: "app:check-for-updates",
      text: "Check for Updates…",
      action: () => {
        void checkForUpdatesInteractive();
      },
    }),
    PredefinedMenuItem.new({ item: "Separator" }),
    PredefinedMenuItem.new({ item: "Services" }),
    PredefinedMenuItem.new({ item: "Separator" }),
    PredefinedMenuItem.new({ item: "Hide" }),
    PredefinedMenuItem.new({ item: "HideOthers" }),
    PredefinedMenuItem.new({ item: "ShowAll" }),
    PredefinedMenuItem.new({ item: "Separator" }),
    PredefinedMenuItem.new({ item: "Quit" }),
  ]);
  return Submenu.new({ text: "Silo", items });
}

async function editPredefinedGroups(): Promise<PredefinedMenuItem[][]> {
  const undoRedo = await Promise.all([
    PredefinedMenuItem.new({ item: "Undo" }),
    PredefinedMenuItem.new({ item: "Redo" }),
  ]);
  const clipboard = await Promise.all([
    PredefinedMenuItem.new({ item: "Cut" }),
    PredefinedMenuItem.new({ item: "Copy" }),
    PredefinedMenuItem.new({ item: "Paste" }),
    PredefinedMenuItem.new({ item: "SelectAll" }),
  ]);
  return [undoRedo, clipboard];
}

async function windowPredefinedGroups(): Promise<PredefinedMenuItem[][]> {
  return [[await PredefinedMenuItem.new({ item: "Minimize" })]];
}

// The count is read fresh at each `syncMenu()` rebuild (triggered by the
// manager subscription above) — the native menu has no live-text mechanism,
// so "reactive" here means "rebuilt", same as the accelerator/keymap case.
async function buildExtensionUpdatesMenuItem(): Promise<MenuItem> {
  const count = getExtensionManager().getState().availableUpdates.length;
  return MenuItem.new({
    id: "help:extension-updates",
    text:
      count > 0
        ? `Extension Updates Available (${count})…`
        : "Check for Extension Updates…",
    action: () => {
      openSettings("extensions");
    },
  });
}

async function buildHelpSubmenu(
  extras: MenuItemContribution[],
): Promise<Submenu> {
  const items: AnyMenuItem[] = [];

  if (!isMac) {
    items.push(
      await MenuItem.new({
        id: "help:about",
        text: "About Silo",
        action: () => {
          openSettings("about");
        },
      }),
      await MenuItem.new({
        id: "help:check-for-updates",
        text: "Check for Updates…",
        action: () => {
          void checkForUpdatesInteractive();
        },
      }),
    );
  }

  items.push(await buildExtensionUpdatesMenuItem());

  const groups = groupAndSort(extras);
  for (const group of groups) {
    if (items.length > 0)
      items.push(await PredefinedMenuItem.new({ item: "Separator" }));
    for (const c of group) items.push(await buildExtensionItem(c));
  }

  return Submenu.new({ text: "Help", items });
}

async function applyWhenClauses(): Promise<void> {
  for (const { native, contribution } of liveItems) {
    const enabled = contribution.when ? contribution.when(contextKeys) : true;
    try {
      await native.setEnabled(enabled);
    } catch (err) {
      console.warn(`[menu] setEnabled failed for ${contribution.id}`, err);
    }
  }
}

export async function syncMenu(): Promise<void> {
  ensureExtensionManagerSubscription();
  // Drop any previous tracking from a prior sync.
  liveItems = [];
  contextSub?.dispose();
  contextSub = null;
  // Menu defaults are re-recorded as items are rebuilt below.
  clearMenuDefaults();

  const byMenu: Record<MenuId, MenuItemContribution[]> = {
    file: [],
    edit: [],
    view: [],
    window: [],
    help: [],
  };
  for (const item of menuItemRegistry.list()) {
    byMenu[item.menu].push(item);
  }

  const submenus: Submenu[] = [];
  if (isMac) submenus.push(await buildAppSubmenu());
  submenus.push(await buildSubmenu("File", [], byMenu.file));
  submenus.push(
    await buildSubmenu("Edit", await editPredefinedGroups(), byMenu.edit),
  );
  submenus.push(await buildSubmenu("View", [], byMenu.view));
  submenus.push(
    await buildSubmenu("Window", await windowPredefinedGroups(), byMenu.window),
  );
  submenus.push(await buildHelpSubmenu(byMenu.help));

  const menu = await Menu.new({ items: submenus });
  await menu.setAsAppMenu();

  // Re-evaluate when-clauses whenever context keys change. Fire-and-forget
  // since setEnabled is async over Tauri IPC.
  if (liveItems.length > 0) {
    contextSub = onContextChange(() => {
      void applyWhenClauses();
    });
  }
}
