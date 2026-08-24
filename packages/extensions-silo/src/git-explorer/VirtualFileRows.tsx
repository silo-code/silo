import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import type { GitFileStatus } from "../git/git-api";
import { measureScrollMargin } from "./git-virtual-model";

/** Rough initial row height — remeasured via {@link useVirtualizer}'s measureElement. */
const ROW_ESTIMATE_PX = 24;

/**
 * Windowed file rows for one Git section (staged or changes). The panel scrolls
 * on `.git-explorer-scroll`; only visible rows mount so large status lists stay
 * cheap on workspace switch.
 */
export function VirtualFileRows({
  files,
  enabled,
  virtualizerRef,
  renderRow,
}: {
  files: GitFileStatus[];
  /** When false (collapsed section), renders nothing and skips the virtualizer. */
  enabled: boolean;
  /** Imperative handle for keyboard-nav scroll-into-view. */
  virtualizerRef?: MutableRefObject<Virtualizer<HTMLElement, Element> | null>;
  renderRow: (file: GitFileStatus, index: number) => ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  const measureLayout = useCallback(() => {
    const listEl = listRef.current;
    if (!listEl) return;
    const parent = listEl.closest(".git-explorer-scroll");
    if (!(parent instanceof HTMLElement)) return;
    setScrollEl(parent);
    setScrollMargin(measureScrollMargin(parent, listEl));
  }, []);

  useLayoutEffect(() => {
    if (!enabled) return;
    measureLayout();
  }, [enabled, files.length, measureLayout]);

  useLayoutEffect(() => {
    if (!enabled || !scrollEl || !listRef.current) return;
    const ro = new ResizeObserver(() => measureLayout());
    ro.observe(scrollEl);
    ro.observe(listRef.current);
    return () => ro.disconnect();
  }, [enabled, scrollEl, measureLayout]);

  const virtualizer = useVirtualizer({
    count: enabled ? files.length : 0,
    getScrollElement: () => scrollEl,
    estimateSize: () => ROW_ESTIMATE_PX,
    scrollMargin,
    overscan: 8,
    enabled: enabled && scrollEl !== null,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  useLayoutEffect(() => {
    if (virtualizerRef) virtualizerRef.current = enabled ? virtualizer : null;
  });

  if (!enabled || files.length === 0) return null;

  const items = virtualizer.getVirtualItems();

  return (
    <div
      ref={listRef}
      className="git-virtual-rows"
      style={{
        height: virtualizer.getTotalSize(),
        width: "100%",
        position: "relative",
      }}
    >
      {items.map((v) => {
        const file = files[v.index];
        if (!file) return null;
        return (
          <div
            key={v.key}
            data-index={v.index}
            ref={virtualizer.measureElement}
            className="git-virtual-row-slot"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${v.start - virtualizer.options.scrollMargin}px)`,
            }}
          >
            {renderRow(file, v.index)}
          </div>
        );
      })}
    </div>
  );
}
