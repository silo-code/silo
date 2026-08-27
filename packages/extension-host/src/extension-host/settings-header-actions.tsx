import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Slot in the Settings sheet's host-owned page header where a page can mount
 * tools (SegmentedTabs, IconButton, …) without taking a row in the body —
 * so content Y stays fixed whether the page contributes actions or not.
 *
 * Core-only for now (`@silo-code/extension-host/internal`); promote to the
 * public SDK if/when third-party settings pages need the same slot.
 */

const SettingsHeaderActionsContext = createContext<HTMLElement | null>(null);

export function SettingsHeaderActionsProvider({
  slot,
  children,
}: {
  slot: HTMLElement | null;
  children: ReactNode;
}) {
  return (
    <SettingsHeaderActionsContext.Provider value={slot}>
      {children}
    </SettingsHeaderActionsContext.Provider>
  );
}

/**
 * Portal children into the active settings page's header-actions slot.
 * Renders nothing when used outside Settings (no provider / slot not ready).
 */
export function SettingsHeaderActions({ children }: { children: ReactNode }) {
  const slot = useContext(SettingsHeaderActionsContext);
  if (!slot) return null;
  return createPortal(children, slot);
}
