import { useCallback, useSyncExternalStore } from "react";
import { useSnapshot } from "valtio";
import { Modal } from "../extension-host/Modal";
import { settingsPageRegistry } from "../extension-host/settings-pages";
import {
  settingsDialog as ui,
  closeSettings,
} from "../extension-host/settings-dialog";
import type { SettingsPage } from "@silo-code/sdk";
import "./SettingsDialog.css";

function useSettingsPages(): SettingsPage[] {
  return useSyncExternalStore(
    useCallback((cb) => settingsPageRegistry.onChange(cb).dispose, []),
    () => settingsPageRegistry.list(),
  );
}

function sortPages(pages: SettingsPage[]): SettingsPage[] {
  return [...pages].sort((a, b) => {
    const g = (a.group ?? "").localeCompare(b.group ?? "");
    if (g !== 0) return g;
    const o = (a.order ?? 0) - (b.order ?? 0);
    return o !== 0 ? o : a.title.localeCompare(b.title);
  });
}

export function SettingsDialog() {
  const snap = useSnapshot(ui);
  const pages = sortPages(useSettingsPages());

  if (!snap.open) return null;

  const active = pages.find((p) => p.id === snap.pageId) ?? pages[0] ?? null;
  const ActiveComponent = active?.component;

  // Group consecutive pages by their group key for separators in the rail.
  let lastGroup: string | undefined;

  return (
    <Modal bare dismissible ariaLabel="Settings" onClose={closeSettings}>
      <div className="settings-dialog">
        <nav className="settings-rail">
          <div className="settings-rail-title">Settings</div>
          {pages.map((p) => {
            const newGroup = p.group !== lastGroup;
            lastGroup = p.group;
            return (
              <button
                key={p.id}
                className={`settings-rail-item${p.id === active?.id ? " active" : ""}${
                  newGroup ? " group-start" : ""
                }`}
                onClick={() => {
                  ui.pageId = p.id;
                }}
              >
                {p.title}
              </button>
            );
          })}
        </nav>
        <section className="settings-pane">
          {ActiveComponent ? (
            <ActiveComponent />
          ) : (
            <div className="settings-empty">No settings pages registered.</div>
          )}
        </section>
        <button
          className="settings-close"
          onClick={closeSettings}
          title="Close (Esc)"
          aria-label="Close settings"
        >
          ×
        </button>
      </div>
    </Modal>
  );
}
