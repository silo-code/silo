import { useEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";
import type { SidePanel } from "@silo-code/sdk";
import type { SidePanelSlot } from "../state/types";
import { getExtensionStorage } from "../extension-host/extension-storage";
import { store } from "../state/store";
import { useSideTabDrag } from "./side-column-helpers";
import { registerSidePane } from "./side-pane-registry";
import { enterRegionOnPointer } from "../extension-host/focus-regions";
import { TabBar } from "./TabBar";

interface PanelPaneProps {
  panels: SidePanel[];
  slot: SidePanelSlot;
  location: "left" | "right";
  /** When true this pane can be split by dropping on its bottom half */
  canSplit: boolean;
}

export function PanelPane({
  panels,
  slot,
  location,
  canSplit,
}: PanelPaneProps) {
  const activeDrag = useSideTabDrag();
  const snap = useSnapshot(store);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mountedIds, setMountedIds] = useState<Set<string>>(() => new Set());
  const [scrollbarVisible, setScrollbarVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Map of panel id → DOM element for scroll save/restore
  const paneRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // Map of panel id → scroll save timer
  const scrollTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  // Map of panel id → ResizeObserver watching for content growth (for restore)
  const restoreObservers = useRef<Map<string, ResizeObserver>>(new Map());
  // Stable callback refs per panel id. Re-creating the arrow each render
  // would make React invoke cleanup → setup on every render, clobbering
  // saved scroll positions and stacking duplicate listeners.
  const refCallbacks = useRef<Map<string, (el: HTMLDivElement | null) => void>>(
    new Map(),
  );
  // Tracks whether each pane has had user scroll activity since mount.
  // Only then is it safe to persist scrollTop on unmount.
  const scrolledSinceMount = useRef<Map<string, boolean>>(new Map());

  function applyScrollRestore(panelId: string, el: HTMLDivElement) {
    const target = store.sidePanelScrollPositions[panelId];
    if (target === undefined || target === 0) return;
    el.scrollTop = target;
    if (el.scrollTop < target) {
      if (restoreObservers.current.has(panelId)) return;
      const obs = new ResizeObserver(() => {
        // Don't fight the user: if they've scrolled since mount, stop trying.
        if (scrolledSinceMount.current.get(panelId)) {
          obs.disconnect();
          restoreObservers.current.delete(panelId);
          return;
        }
        el.scrollTop = target;
        if (el.scrollTop >= target) {
          obs.disconnect();
          restoreObservers.current.delete(panelId);
        }
      });
      obs.observe(el);
      restoreObservers.current.set(panelId, obs);
    }
  }

  function getRefCallback(
    panelId: string,
  ): (el: HTMLDivElement | null) => void {
    const cached = refCallbacks.current.get(panelId);
    if (cached) return cached;
    const cb = (el: HTMLDivElement | null) => {
      const map = paneRefs.current;
      const timers = scrollTimers.current;
      const prevEl = map.get(panelId);
      if (prevEl === el) return;
      if (!el) {
        // Element actually unmounted (panel removed). Save only if user scrolled.
        if (prevEl && scrolledSinceMount.current.get(panelId)) {
          store.sidePanelScrollPositions[panelId] = prevEl.scrollTop;
        }
        const t = timers.get(panelId);
        if (t !== undefined) clearTimeout(t);
        timers.delete(panelId);
        restoreObservers.current.get(panelId)?.disconnect();
        restoreObservers.current.delete(panelId);
        scrolledSinceMount.current.delete(panelId);
        map.delete(panelId);
        return;
      }
      map.set(panelId, el);
      scrolledSinceMount.current.set(panelId, false);
      applyScrollRestore(panelId, el);
      el.addEventListener("scroll", () => {
        // Programmatic restore writes also fire scroll events; ignore until
        // the user actually interacts. We detect "real" scrolls by checking
        // that the restore observer is no longer active.
        if (!restoreObservers.current.has(panelId)) {
          scrolledSinceMount.current.set(panelId, true);
        }
        const prev = timers.get(panelId);
        if (prev !== undefined) clearTimeout(prev);
        timers.set(
          panelId,
          setTimeout(() => {
            store.sidePanelScrollPositions[panelId] = el.scrollTop;
            timers.delete(panelId);
          }, 300),
        );
      });
    };
    refCallbacks.current.set(panelId, cb);
    return cb;
  }

  function activatePanel(id: string) {
    setActiveId(id);
    store.activeSidePanelTabs[slot] = id;
  }

  // Publish an imperative handle so tab-cycle commands (Cmd+Alt+←/→ when this
  // pane has focus) can drive selection from outside React. Refs keep the
  // handle reading the latest panels/active without re-registering each render.
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  useEffect(() => {
    const d = registerSidePane(slot, {
      panelIds: () => panelsRef.current.map((p) => p.id),
      activeId: () => activeIdRef.current,
      activate: (id) => {
        setActiveId(id);
        store.activeSidePanelTabs[slot] = id;
      },
    });
    return () => d.dispose();
  }, [slot]);

  const isCrossColumn =
    activeDrag !== null &&
    activeDrag.sourceSlot !== location &&
    activeDrag.sourceSlot !== `${location}-bottom`;

  const isSameColumn =
    activeDrag !== null &&
    (activeDrag.sourceSlot === location ||
      activeDrag.sourceSlot === `${location}-bottom`);

  const dragEligible = isSameColumn || isCrossColumn;

  // Read hover zone from global drag state; normalise for non-splittable panes
  const rawHoverZone =
    activeDrag?.hoverSlot === slot && activeDrag.hoverZone != null
      ? activeDrag.hoverZone
      : null;
  const hoverZone = canSplit
    ? rawHoverZone
    : rawHoverZone !== null
      ? "top"
      : null;

  useEffect(() => {
    if (panels.length === 0) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    const saved = store.activeSidePanelTabs[slot];
    if (!activeId || !panels.some((p) => p.id === activeId)) {
      // No valid active tab yet — prefer saved, fall back to first
      const preferred =
        saved && panels.some((p) => p.id === saved) ? saved : panels[0].id;
      setActiveId(preferred);
    } else if (
      saved &&
      saved !== activeId &&
      panels.some((p) => p.id === saved)
    ) {
      // Hydration completed after we already picked a default — switch to saved
      setActiveId(saved);
    }
    // snap.hydrated ensures this re-runs after hydration loads saved tabs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels, activeId, slot, snap.hydrated]);

  useEffect(() => {
    if (!activeId) return;
    setMountedIds((s) => {
      if (s.has(activeId)) return s;
      const next = new Set(s);
      next.add(activeId);
      return next;
    });
  }, [activeId]);

  // Re-apply scroll positions after hydration completes.
  useEffect(() => {
    if (!snap.hydrated) return;
    for (const [panelId, el] of paneRefs.current) {
      applyScrollRestore(panelId, el);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.hydrated]);

  // Click-to-enter: clicking the pane's empty background focuses the active
  // panel's first focusable element so the keyboard can take over. Clicks on
  // real controls (tabs, items, buttons) are left alone — they focus themselves.
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onMouseDown = (e: MouseEvent) => {
      if (enterRegionOnPointer(e.target)) e.preventDefault();
    };
    host.addEventListener("mousedown", onMouseDown);
    return () => host.removeEventListener("mousedown", onMouseDown);
  }, []);

  return (
    <div className="side-pane" data-slot={slot}>
      <TabBar
        panels={panels}
        slot={slot}
        location={location}
        activeId={activeId}
        onActivate={activatePanel}
      />
      <div
        ref={hostRef}
        className={`panel-body side-tab-host${scrollbarVisible ? " scrollbar-visible" : ""}`}
        onMouseEnter={() => {
          if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
          }
          setScrollbarVisible(true);
        }}
        onMouseLeave={() => {
          hideTimerRef.current = setTimeout(
            () => setScrollbarVisible(false),
            300,
          );
        }}
      >
        {panels.map((p) => {
          const isActive = activeId === p.id;
          const shouldMount = !p.lazyMount || mountedIds.has(p.id);
          const Comp = p.component;
          return (
            <div
              key={p.id}
              ref={getRefCallback(p.id)}
              className="tab-pane"
              data-active={isActive ? "true" : "false"}
            >
              {shouldMount ? (
                <Comp
                  active={isActive}
                  storage={getExtensionStorage(p.id)}
                  hydrated={snap.hydrated}
                />
              ) : null}
            </div>
          );
        })}

        {dragEligible && hoverZone !== null && (
          <div
            className={`side-drop-overlay side-drop-overlay--${hoverZone}`}
          />
        )}
      </div>
    </div>
  );
}
