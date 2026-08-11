import { useEffect, useRef, useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import type { ExtensionContext } from "@silo-code/sdk";
import {
  ErrorBoundary,
  navigatorViewRegistry,
} from "@silo-code/extension-host/internal";
import { ContributedToolbar } from "../shared/ContributedToolbar";
import {
  activeViewTitle,
  buildViewMenuItems,
  resolveActiveView,
} from "./navigator-views";
import "./NavigatorPanel.css";

// Which view the Navigator is showing. Global scope, not workspace: the lens is
// a preference about how you read the panel, and swapping it on every workspace
// switch is exactly the disorientation views exist to remove.
const ACTIVE_VIEW_KEY = "activeView";

export function NavigatorPanel({ ctx }: { ctx: ExtensionContext }) {
  // Re-render when views are registered or unregistered.
  const [, setViewTick] = useState(0);
  useEffect(
    () =>
      navigatorViewRegistry.subscribe(() => setViewTick((t) => t + 1)).dispose,
    [],
  );
  const views = navigatorViewRegistry.list();

  // The user's chosen view, mirrored from global storage so hydration (and a
  // change made in another window) lands here.
  const [savedViewId, setSavedViewId] = useState<string | undefined>(() =>
    ctx.storage.global.get<string>(ACTIVE_VIEW_KEY),
  );
  useEffect(() => {
    const sub = ctx.storage.global.subscribe(() => {
      setSavedViewId(ctx.storage.global.get<string>(ACTIVE_VIEW_KEY));
    });
    return () => sub.dispose();
  }, [ctx]);
  // Falls back when the saved view isn't registered (its extension is disabled
  // or gone) without rewriting storage, so re-enabling brings the choice back.
  const activeViewId = resolveActiveView(views, savedViewId);

  // Views mount on first activation and then stay mounted, hidden — the same
  // approach PanelPane takes for side panels, so a view keeps its scroll
  // position and local state across switches.
  const [mountedViewIds, setMountedViewIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  useEffect(() => {
    if (!activeViewId) return;
    setMountedViewIds((s) =>
      s.has(activeViewId) ? s : new Set(s).add(activeViewId),
    );
  }, [activeViewId]);

  const viewBtnRef = useRef<HTMLButtonElement | null>(null);

  function pickView(viewId: string) {
    ctx.storage.global.set(ACTIVE_VIEW_KEY, viewId);
    setSavedViewId(viewId);
  }

  function openViewMenu() {
    void ctx.ui.showMenu({
      items: buildViewMenuItems(views, activeViewId, pickView),
      anchor: viewBtnRef.current,
      align: "start",
    });
  }

  return (
    <div className="nav-panel">
      {/* Panel chrome, present whichever view is active: the view selector, and
          the active view's actions. The actions are toolbar contributions on
          the "navigator" surface rather than anything this panel knows about —
          that's how the workspaces + button gets here without core.navigator
          importing a line of workspace code. Sticky rather than a flex header
          so the host tab-pane stays the panel's sole scroller, which is what
          its scroll persistence (and every view) assumes. */}
      <div className="nav-header">
        <button
          type="button"
          className="nav-view-btn"
          ref={viewBtnRef}
          aria-haspopup="menu"
          onClick={openViewMenu}
          disabled={views.length < 2}
        >
          <span className="nav-view-btn__label">
            {activeViewTitle(views, activeViewId)}
          </span>
          {views.length > 1 && <CaretDown size={12} weight="bold" />}
        </button>
        {activeViewId && (
          <div className="nav-header__actions">
            <ContributedToolbar
              surface="navigator"
              target={{ viewId: activeViewId }}
              showMenu={ctx.ui.showMenu}
            />
          </div>
        )}
      </div>

      {views.map((view) => {
        if (!mountedViewIds.has(view.id)) return null;
        const isActive = activeViewId === view.id;
        const Comp = view.component;
        return (
          <div
            key={view.id}
            className="nav-view"
            data-active={isActive ? "true" : "false"}
          >
            <ErrorBoundary name={view.id}>
              <Comp active={isActive} />
            </ErrorBoundary>
          </div>
        );
      })}
    </div>
  );
}
