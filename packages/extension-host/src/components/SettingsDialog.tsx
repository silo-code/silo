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
        <nav className="settings-rail silo-scroll">
          <div className="settings-rail-title">Settings</div>
          {pages.map((p) => {
            const newGroup = p.group !== lastGroup;
            lastGroup = p.group;
            const Badge = p.badge;
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
                <span className="settings-rail-item-label">{p.title}</span>
                {Badge && <Badge />}
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
        {/* Mouse-only by design (RFC 0016), matching Modal.tsx's own close ✕ —
            its own title already says Esc is the keyboard path. Settings is
            a `bare` modal, so it doesn't get Modal.tsx's close button and
            renders this one instead; the tabIndex=-1 fix has to be applied
            here too. */}
        <button
          className="settings-close"
          onClick={closeSettings}
          title="Close (Esc)"
          aria-label="Close settings"
          tabIndex={-1}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </Modal>
  );
}
