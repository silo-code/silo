import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useSnapshot } from "valtio";
import type { SettingsPage } from "@silo-code/sdk";
import { Sheet } from "../extension-host/Sheet";
import { settingsPageRegistry } from "../extension-host/settings-pages";
import {
  railIconFor,
  railSections,
  resolveActivePage,
} from "../extension-host/settings-rail";
import {
  eatDuplicateSettingsTitle,
  paneTitleFor,
} from "../extension-host/settings-page-title";
import { SettingsHeaderActionsProvider } from "../extension-host/settings-header-actions";
import {
  settingsSheet as ui,
  closeSettings,
} from "../extension-host/settings-sheet";
import { resolvePhosphorIcon } from "./phosphor-icon";
import "./SettingsPage.css";
import "./SettingsSheet.css";

// Settings — a centered app sheet (extension-host/Sheet.tsx) holding the
// registered settings pages in a two-section icon rail. The host owns the
// page title (from SettingsPage.title); page components are body-only.
//
// Pages that need tools beside the title (SegmentedTabs, overflow ⋮, …)
// portal them into the header-actions slot via SettingsHeaderActions — the
// header is a fixed height, so contributing actions never bumps body content.
//
// During the migration window, SettingsPageBody also hides a page-drawn
// heading that duplicates the host title (eatDuplicateSettingsTitle) so
// third-party extensions that still render their own <h2> don't double up.
//
// The sheet primitive underneath is still experimental and host-internal.
// Settings is its first real consumer — which is the point of using it here
// before any of it is offered to extensions.

function useSettingsPages(): SettingsPage[] {
  return useSyncExternalStore(
    useCallback((cb) => settingsPageRegistry.onChange(cb).dispose, []),
    () => settingsPageRegistry.list(),
  );
}

function RailIcon({ page }: { page: SettingsPage }) {
  const Icon = resolvePhosphorIcon(railIconFor(page));
  if (!Icon) return <span className="settings-sheet-rail-icon" aria-hidden />;
  return (
    <span className="settings-sheet-rail-icon">
      <Icon size="1.15em" weight="regular" aria-hidden />
    </span>
  );
}

/**
 * Mounts the active page and eats a leading duplicate title if the page still
 * draws one. `pageId` re-runs the scan when the rail selection changes.
 */
function SettingsPageBody({
  title,
  pageId,
  children,
}: {
  title: string;
  pageId: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    eatDuplicateSettingsTitle(root, title);
  }, [title, pageId, children]);
  return (
    <div ref={ref} className="settings-sheet-page-body">
      {children}
    </div>
  );
}

export function SettingsSheet() {
  const snap = useSnapshot(ui);
  const sections = railSections(useSettingsPages());
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);

  if (!snap.open) return null;

  const active = resolveActivePage(sections, snap.pageId);
  const ActiveComponent = active?.component;
  const pageTitle = paneTitleFor(active);

  return (
    <Sheet
      anchor="app"
      align="center"
      bare
      dismissible
      ariaLabel="Settings"
      onClose={closeSettings}
    >
      <div className="settings-sheet">
        <nav className="settings-sheet-rail silo-scroll">
          <div className="settings-sheet-title">Settings</div>
          {sections.map((section) => (
            <div key={section.key} className="settings-sheet-section">
              <div className="settings-sheet-section-label">
                {section.label}
              </div>
              {section.pages.map((p) => {
                const Badge = p.badge;
                return (
                  <button
                    key={p.id}
                    className={`settings-sheet-rail-item${
                      p.id === active?.id ? " active" : ""
                    }`}
                    onClick={() => {
                      ui.pageId = p.id;
                    }}
                  >
                    <RailIcon page={p} />
                    <span className="settings-sheet-rail-label">{p.title}</span>
                    {Badge && <Badge />}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <section className="settings-sheet-pane">
          {pageTitle != null && active ? (
            <SettingsHeaderActionsProvider slot={actionsSlot}>
              <div className="settings-sheet-page-header">
                <h2 className="settings-sheet-page-title">{pageTitle}</h2>
                <div
                  ref={setActionsSlot}
                  className="settings-sheet-page-header-actions"
                />
              </div>
              <SettingsPageBody title={pageTitle} pageId={active.id}>
                {ActiveComponent ? <ActiveComponent /> : null}
              </SettingsPageBody>
            </SettingsHeaderActionsProvider>
          ) : (
            <div className="settings-sheet-empty">
              No settings pages registered.
            </div>
          )}
        </section>
        {/* Mouse-only by design (RFC 0016), matching Modal/Sheet's own close ✕:
            Escape is the keyboard path, so this never becomes a tab stop. The
            sheet is `bare`, so it doesn't render Sheet.tsx's own close and
            supplies this one instead. */}
        <button
          className="settings-sheet-close"
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
    </Sheet>
  );
}
