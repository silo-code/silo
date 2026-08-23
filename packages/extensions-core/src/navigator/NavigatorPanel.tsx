import { useEffect, useState } from "react";
import type { ExtensionContext } from "@silo-code/sdk";
import { useFocusGroup } from "@silo-code/sdk";
import {
  ErrorBoundary,
  navigatorViewRegistry,
} from "@silo-code/extension-host/internal";
import { ContributedToolbar } from "../shared/ContributedToolbar";
import {
  activeViewIndex,
  buildViewRows,
  resolveActiveView,
} from "./navigator-views";
import "./NavigatorPanel.css";

// Which view the Navigator is showing. Global scope, not workspace: the lens is
// a preference about how you read the panel, and swapping it on every workspace
// switch is exactly the disorientation views exist to remove.
const ACTIVE_VIEW_KEY = "activeView";

// Ids wiring each tab to its panel for assistive tech. View ids are
// `<extension-id>.<view-name>` by convention, so these contain dots — fine in
// an HTML id, and nothing selects them from CSS (where they'd need escaping).
const tabId = (viewId: string) => `nav-tab-${viewId}`;
const tabPanelId = (viewId: string) => `nav-tabpanel-${viewId}`;

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

  function pickView(viewId: string) {
    ctx.storage.global.set(ACTIVE_VIEW_KEY, viewId);
    setSavedViewId(viewId);
  }

  // The view list is one Tab stop with ↑/↓ between rows and Enter/Space to
  // switch — useFocusGroup owns that, plus the WebKit-safe keyboard ring the
  // host styles off `data-focus-item` (ADR 0021). Focus parks on the active
  // row so arrowing starts from what's on screen.
  const group = useFocusGroup({
    count: views.length,
    orientation: "vertical",
    start: activeViewIndex(views, activeViewId),
    onActivate: (i) => {
      const view = views[i];
      if (view) pickView(view.id);
    },
  });

  // Reserve the icon column for every row as soon as *any* view has an icon,
  // so a mix of icon and icon-less views still aligns down one edge. `icon` is
  // optional on NavigatorView, so all-text lists spend no space on it.
  const hasIcons = views.some((view) => view.icon);
  const activeView = views.find((view) => view.id === activeViewId);
  const viewRows = buildViewRows(views, activeViewId);
  // With nothing to switch to there is no tablist — so the bodies below stop
  // calling themselves tab panels too, rather than pointing `aria-labelledby`
  // at a tab that isn't rendered.
  const showViewList = views.length > 1;

  return (
    <div className="nav-panel">
      {/* Every registered view, named and one click away — no menu (RFC 0023's
          selector was a dropdown; the list is the same choice made visible).
          Which one is open is said by the header below rather than by
          highlighting a row up here, so the list reads as a set of
          destinations rather than a control with a stuck state.

          Dropped entirely below two views: a one-row list of destinations you
          are already at is pure chrome, and the header below still names the
          view and carries its actions. The old dropdown went inert in the same
          case; this reclaims the space instead.

          Sticky rather than a flex header so the host tab-pane stays the
          panel's sole scroller, which is what its scroll persistence (and
          every view) assumes. */}
      {showViewList && (
        <div
          className="nav-views"
          role="tablist"
          aria-orientation="vertical"
          aria-label="Navigator views"
          {...group.containerProps}
        >
          {viewRows.map((row, i) => (
            <div
              key={row.id}
              {...group.getItemProps(i)}
              role="tab"
              id={tabId(row.id)}
              // Selection is still announced even though it isn't painted on
              // the row — assistive tech needs it named here, where the choice
              // is.
              aria-selected={row.selected}
              // Omitted until the panel actually mounts (views mount lazily on
              // first activation, below) — pointing at an id that isn't in the
              // DOM yet would be a dangling reference for any view not yet
              // visited this session.
              aria-controls={
                mountedViewIds.has(row.id) ? tabPanelId(row.id) : undefined
              }
              className="nav-view-row"
              onClick={() => pickView(row.id)}
            >
              {hasIcons && (
                <span className="nav-view-row__icon">{row.icon}</span>
              )}
              <span className="nav-view-row__label">{row.title}</span>
            </div>
          ))}
        </div>
      )}

      {/* The active view, named — and the place its actions live. They're toolbar
          contributions on the "navigator" surface rather than anything this
          panel knows about, which is how the workspaces + button gets here
          without core.navigator importing a line of workspace code. */}
      {activeView && (
        // `data-focus-chrome`: header controls (the contributed toolbar), not
        // content — keyboard region-entry skips past this to land in the
        // active view itself (see `focusActivePaneContent`), the same way it
        // already skips a row's own out-of-order close button.
        <div
          className="nav-view-header"
          data-focus-chrome
          data-view-list={showViewList ? "true" : "false"}
        >
          <span className="nav-view-header__title">{activeView.title}</span>
          <ContributedToolbar
            surface="navigator"
            target={{ viewId: activeView.id }}
            showMenu={ctx.ui.showMenu}
          />
        </div>
      )}

      {views.map((view) => {
        if (!mountedViewIds.has(view.id)) return null;
        const isActive = activeViewId === view.id;
        const Comp = view.component;
        // Only a real tabpanel when there's a tablist for it to belong to —
        // the three ARIA attributes rise and fall together, so they're one
        // conditional rather than three that could drift out of sync.
        const tabPanelAttrs = showViewList
          ? {
              role: "tabpanel" as const,
              id: tabPanelId(view.id),
              "aria-labelledby": tabId(view.id),
            }
          : {};
        return (
          <div
            key={view.id}
            className="nav-view"
            {...tabPanelAttrs}
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
