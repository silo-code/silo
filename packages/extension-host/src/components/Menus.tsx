import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  closeMenu,
  getMenu,
  installMenuGlobals,
  subscribeMenu,
} from "../extension-host/menu-controller";
import type { MenuItem } from "@silo-code/sdk";
import { Menu } from "./Menu";

// Host-rendered chrome for the menu controller — the single mount point for
// every floating menu in the app. Mounted once in App.tsx next to <Toasts>.
// Subscribes to the open-menu store and renders the one <Menu> (if any).
// Extensions reach this only through `ctx.ui.showMenu`.

export function Menus() {
  const menu = useSyncExternalStore(subscribeMenu, getMenu);

  // Track the cursor (so `ctx.ui.showMenu` with no position opens at the mouse)
  // and suppress the webview's native context menu app-wide.
  useEffect(() => {
    installMenuGlobals();
  }, []);

  const onSelect = useCallback((item: MenuItem) => {
    closeMenu();
    void item.run?.();
  }, []);

  if (!menu) return null;

  return (
    <Menu
      key={menu.id}
      items={menu.items}
      placement={{ at: menu.at, anchor: menu.anchor, align: menu.align }}
      onSelect={onSelect}
      onClose={closeMenu}
    />
  );
}
