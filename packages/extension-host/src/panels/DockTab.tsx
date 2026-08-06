import { useCallback, useEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";
import type { IDockviewPanelHeaderProps } from "dockview";
import type {
  MenuEntry,
  TabActivityAdornment,
  TabHighlightAdornment,
  TabIconAdornment,
  TabIndicatorAdornment,
} from "@silo-code/sdk";
import { ActivityGlyph } from "@silo-code/sdk";
import { store } from "../state/store";
import { promotePreviewEditor } from "../state/workspaces";
import { tabAdornmentRegistry } from "../extension-host/tab-adornment-registry";
import { contextMenuEntriesFor } from "../extension-host/context-menu-items";
import { buildTerminalTabMenuItems } from "../extension-host/terminal-tab-menu";
import { openMenu } from "../extension-host/menu-controller";
import { Tooltip } from "../components/Tooltip";
import { TabIndicatorGlyph } from "./TabIndicatorGlyph";

// Custom tab: mirrors dockview's default tab DOM, but renders the dirty marker
// as its own styled span so we can size/color it independently. (DockviewDefaultTab
// hardcodes className and ignores children, so wrapping it doesn't work — we
// re-implement the tab markup directly.)
//
// Dirty state is owned by the viewer and surfaced through dockview panel params
// (`api.updateParameters({ dirty })`); the tab is purely a renderer of that flag.
export function DockTab(props: IDockviewPanelHeaderProps) {
  const { api } = props;
  const panelId = api.id;
  const editorId = panelId.startsWith("editor:") ? panelId.slice(7) : null;
  const terminalId = panelId.startsWith("terminal:") ? panelId.slice(9) : null;
  const [title, setTitle] = useState(api.title ?? "");
  const [isDirty, setIsDirty] = useState(
    () => !!api.getParameters<{ dirty?: boolean }>().dirty,
  );
  // True when the viewer's backing file no longer exists on disk (deleted
  // externally). Same params channel as `dirty` — see TextViewer.
  const [isDeleted, setIsDeleted] = useState(
    () => !!api.getParameters<{ deleted?: boolean }>().deleted,
  );
  // Only surface the hover tooltip when the label is actually clipped by the
  // shrink-to-fit tab strip (see CenterDock.css) — otherwise it just gets in
  // the way. `scrollWidth > clientWidth` on the label span detects the ellipsis;
  // a ResizeObserver re-checks whenever the strip resizes or tabs open/close.
  const contentRef = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const snap = useSnapshot(store);
  const adornKind =
    editorId != null
      ? ("editor" as const)
      : terminalId != null
        ? ("terminal" as const)
        : null;
  const adornTargetId = editorId ?? terminalId;
  const [tabIcons, setTabIcons] = useState<TabIconAdornment[]>(() =>
    adornKind && adornTargetId
      ? tabAdornmentRegistry.getIcons(adornKind, adornTargetId)
      : [],
  );
  const [tabHighlight, setTabHighlight] =
    useState<TabHighlightAdornment | null>(() =>
      adornKind && adornTargetId
        ? tabAdornmentRegistry.getHighlight(adornKind, adornTargetId)
        : null,
    );
  const [tabIndicators, setTabIndicators] = useState<TabIndicatorAdornment[]>(
    () =>
      adornKind && adornTargetId
        ? tabAdornmentRegistry.getIndicators(adornKind, adornTargetId)
        : [],
  );
  const [tabActivities, setTabActivities] = useState<TabActivityAdornment[]>(
    () =>
      adornKind && adornTargetId
        ? tabAdornmentRegistry.getActivities(adornKind, adornTargetId)
        : [],
  );

  useEffect(() => {
    if (!adornKind || !adornTargetId) {
      setTabIcons([]);
      setTabHighlight(null);
      setTabIndicators([]);
      setTabActivities([]);
      return;
    }
    const refresh = () => {
      setTabIcons(tabAdornmentRegistry.getIcons(adornKind, adornTargetId));
      setTabHighlight(
        tabAdornmentRegistry.getHighlight(adornKind, adornTargetId),
      );
      setTabIndicators(
        tabAdornmentRegistry.getIndicators(adornKind, adornTargetId),
      );
      setTabActivities(
        tabAdornmentRegistry.getActivities(adornKind, adornTargetId),
      );
    };
    const sub = tabAdornmentRegistry.subscribe(refresh);
    refresh();
    return sub.dispose;
  }, [adornKind, adornTargetId]);

  useEffect(() => {
    const sub = api.onDidTitleChange((e) => setTitle(e.title ?? ""));
    setTitle(api.title ?? "");
    return () => sub.dispose();
  }, [api]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const check = () => setIsTruncated(el.scrollWidth > el.clientWidth);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [title, isDirty]);

  // Re-read getParameters() on each change rather than trusting the event
  // payload, which only carries the keys that changed in that update.
  useEffect(() => {
    const read = () => {
      const params = api.getParameters<{
        dirty?: boolean;
        deleted?: boolean;
      }>();
      setIsDirty(!!params.dirty);
      setIsDeleted(!!params.deleted);
    };
    read();
    const sub = api.onDidParametersChange(read);
    return () => sub.dispose();
  }, [api]);

  // Derive preview state reactively from valtio.
  const wsId = snap.activeWorkspaceId;
  const ws = wsId ? snap.workspaces[wsId] : null;
  const isPreview = !!(editorId && ws?.previewEditorId === editorId);

  const onClose = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      // When closing from inside the overflow popup, stopPropagation prevents
      // dockview's wrapper click-handler from running (which normally closes the
      // popup). We handle it here instead: remove the row or close the popup.
      const closeBtn = event.currentTarget as HTMLElement;
      const overflowContainer = closeBtn.closest(".dv-tabs-overflow-container");

      if (editorId && isDirty) {
        window.dispatchEvent(
          new CustomEvent("app:confirm-close-editor", {
            detail: { panelId, title },
          }),
        );
        // Close the popup so the confirm modal isn't obscured.
        if (overflowContainer) {
          document.body.dispatchEvent(
            new PointerEvent("pointerdown", { bubbles: true }),
          );
        }
      } else {
        api.close();
        if (overflowContainer) {
          // Remove this tab's row from the list; close the popup if it's now empty.
          closeBtn.closest(".dv-tab")?.remove();
          if (!overflowContainer.querySelector(".dv-tab")) {
            document.body.dispatchEvent(
              new PointerEvent("pointerdown", { bubbles: true }),
            );
          }
        }
      }
    },
    [api, editorId, panelId, title, isDirty],
  );

  // Double-click on a preview tab promotes it to permanent.
  const onTabDoubleClick = useCallback(() => {
    if (editorId && isPreview) {
      promotePreviewEditor(store.activeWorkspaceId!, editorId);
    }
  }, [editorId, isPreview]);

  // Middle-click on tab content closes the tab immediately (no dirty prompt).
  // Use onMouseDown (not onClick) because React synthetic events don't
  // reliably carry the `button` property on click.
  const onTabMouseDown = useCallback(
    (event: React.MouseEvent) => {
      if (event.button === 1) {
        event.preventDefault();
        event.stopPropagation();
        api.close();
      }
    },
    [api],
  );

  const onBtnPointerDown = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
  }, []);

  // Right-click → real menu: Rename (terminals) + extension contributions
  // on editor/tab or terminal/tab (RFC 0021 / RFC 0013).
  const onTabContextMenu = useCallback(
    (event: React.MouseEvent) => {
      if (!editorId && !terminalId) return;
      event.preventDefault();
      event.stopPropagation();

      const items: MenuEntry[] = [];

      if (editorId) {
        const record = wsId
          ? store.workspaces[wsId]?.editors.find((e) => e.id === editorId)
          : undefined;
        const contributed = contextMenuEntriesFor("editor/tab", {
          editorId,
          filePath: record?.filePath ?? null,
          viewId: record?.viewType ?? "unknown",
        });
        items.push(...contributed);
      } else if (terminalId) {
        // Shared with every other surface that lists this terminal — see
        // extension-host/terminal-tab-menu.ts. `onRenamed` is the one bit only
        // a dock tab needs: pushing the label into its dockview panel api.
        items.push(
          ...buildTerminalTabMenuItems(terminalId, {
            workspaceId: wsId ?? undefined,
            onRenamed: (name) => api.setTitle(name),
          }),
        );
      }

      if (items.length === 0) return;
      void openMenu({
        items,
        at: { x: event.clientX, y: event.clientY },
        toggle: false,
      });
    },
    [api, editorId, terminalId, wsId],
  );

  return (
    <div
      className={`dv-default-tab${tabHighlight ? " dvi-tab-highlight" : ""}`}
      data-testid="dockview-dv-default-tab"
      data-color={tabHighlight ? (tabHighlight.color ?? "accent") : undefined}
      onMouseDown={onTabMouseDown}
      onDoubleClick={onTabDoubleClick}
      onContextMenu={onTabContextMenu}
    >
      <Tooltip content={title} disabled={!isTruncated}>
        <span
          ref={contentRef}
          className={`dv-default-tab-content${isPreview ? " preview-title" : ""}${isDeleted ? " deleted-title" : ""}`}
        >
          {tabIcons.map((icon) => (
            <span key={icon.id} className="dvi-tab-icon" aria-hidden>
              {icon.icon}
            </span>
          ))}
          {isDirty && <span className="dvi-dirty-indicator">●</span>}
          {title}
        </span>
      </Tooltip>
      {tabIndicators.map((indicator) => (
        <Tooltip
          key={indicator.id}
          content={indicator.tooltip ?? ""}
          disabled={!indicator.tooltip}
        >
          <span
            className="dvi-tab-decoration"
            data-color={indicator.color ?? "muted"}
            data-chip={indicator.chip ? "" : undefined}
            aria-label={indicator.tooltip}
          >
            <TabIndicatorGlyph indicator={indicator} />
          </span>
        </Tooltip>
      ))}
      {tabActivities.map((act) => (
        <Tooltip
          key={act.id}
          content={act.tooltip ?? ""}
          disabled={!act.tooltip}
        >
          <span className="dvi-tab-activity" aria-label={act.tooltip}>
            <ActivityGlyph activity={act.activity} size="md" />
          </span>
        </Tooltip>
      ))}
      <div
        className="dv-default-tab-action"
        onPointerDown={onBtnPointerDown}
        onClick={onClose}
      >
        <svg
          height="11"
          width="11"
          viewBox="0 0 28 28"
          aria-hidden="false"
          focusable={false}
          className="dv-svg"
        >
          <path d="M2.1 27.3L0 25.2L11.55 13.65L0 2.1L2.1 0L13.65 11.55L25.2 0L27.3 2.1L15.75 13.65L27.3 25.2L25.2 27.3L13.65 15.75L2.1 27.3Z" />
        </svg>
      </div>
    </div>
  );
}
