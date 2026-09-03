import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  CaretRight,
  DotsSixVertical,
  SquaresFour,
} from "@phosphor-icons/react";
import type { Activity, ExtensionContext, MenuEntry } from "@silo-code/sdk";
import { ActivityGlyph, Badge, useServiceState } from "@silo-code/sdk";
import {
  buildAgentRows,
  compareRows,
  formatElapsed,
  groupAgentRows,
  groupAgentRowsByWorkspace,
  isAtLeastHoursOld,
  moveItem,
  orderAgeRows,
  reconcileAgeManualOrder,
  SECTION_ORDER,
  type AgentRow,
  type AgentSection,
} from "./agents-panel-view";
import { getDoneSince } from "./done-since";
import { manualOrderService } from "./manual-order";
import { AgentIconGlyph, type AgentIcon } from "@silo-code/sdk";
import { settingsService, type IconMode } from "./settings-store";

/** Ticks the panel so a rendered `formatElapsed` duration stays live. 1s
 * matches the host's own Workspaces-panel elapsed-time refresh. */
function useNow(intervalMs: number): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (intervalMs <= 0) return;
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

const SECTION_LABELS: Record<AgentSection, string> = {
  ready: "Ready",
  working: "Working",
  // The host's own term for the state is idle — an agent that has stopped
  // working and isn't waiting on you. "Done" implied a finished task rather
  // than a session sitting there.
  done: "Idle",
};

/** A section as the render below wants it, regardless of which grouping
 * produced it: a heading, its rows, and where each row's subtitle (the line
 * under the title) comes from — whichever axis isn't already the heading. */
export interface PanelSection {
  key: string;
  header: string;
  rows: AgentRow[];
  subtitle: (row: AgentRow) => string;
  /**
   * Whether `subtitle` yields a **workspace name** (so the row can mark it with
   * the workspace glyph) rather than a status label. The by-workspace view is
   * the one that answers `false`: there the workspace is already the heading,
   * so the subtitle carries the status instead — marking it with a workspace
   * glyph would label it as something it isn't.
   */
  subtitleIsWorkspace: boolean;
  /** Whether the render below collapses this heading's rows by default,
   * revealing them on hover or on click of the heading (see
   * `staleHoverExpandEnabled`) — only the "N+ hours old" heading does, since
   * it's the one that piles up with rows you're least likely to still care
   * about. */
  collapsible?: boolean;
}

// Stable key for the "N+ hours old" section — both what buildStatusSections
// tags it with and what the render below checks to apply the hover reveal.
const STALE_DONE_SECTION_KEY = "stale-done";

/**
 * Whether the "N+ hours old" heading should start open rather than waiting for
 * a hover. With nothing ready, working or idle it is the only content the view
 * has, and a panel showing three empty headings plus a collapsed one reads as
 * empty — the user shouldn't have to hover to discover it isn't.
 */
export function staleSectionStartsExpanded(
  sections: readonly PanelSection[],
): boolean {
  return sections.every(
    (s) => s.key === STALE_DONE_SECTION_KEY || s.rows.length === 0,
  );
}

function isStaleDone(row: AgentRow, staleDoneHours: number): boolean {
  return (
    row.since !== undefined && isAtLeastHoursOld(row.since, staleDoneHours)
  );
}

/**
 * `staleDoneEnabled`/`staleDoneHours` are the settings-configurable split
 * (see `DEFAULT_STALE_DONE_ENABLED`/`DEFAULT_STALE_DONE_HOURS`/
 * `MIN_STALE_DONE_HOURS` in `./settings-store`): while enabled, a "done" row
 * sitting for at least `staleDoneHours` drops out of the Done heading into
 * its own "N+ hours old" one, clearing space in Done for finishes still
 * worth a glance without losing the older ones entirely. Disabled, every
 * done row just stays in Done and the extra heading doesn't appear at all.
 */
export function buildStatusSections(
  rows: readonly AgentRow[],
  staleDoneEnabled: boolean,
  staleDoneHours: number,
): PanelSection[] {
  const groups = groupAgentRows(rows);
  const subtitle = (row: AgentRow) => row.workspaceName;
  const statusSections = SECTION_ORDER.map((section) => ({
    key: section,
    header: SECTION_LABELS[section],
    rows:
      section === "done" && staleDoneEnabled
        ? groups.done.filter((row) => !isStaleDone(row, staleDoneHours))
        : groups[section],
    subtitle,
    subtitleIsWorkspace: true,
  }));
  if (!staleDoneEnabled) return statusSections;
  return [
    ...statusSections,
    {
      key: STALE_DONE_SECTION_KEY,
      header: `${staleDoneHours}+ hours old`,
      rows: groups.done.filter((row) => isStaleDone(row, staleDoneHours)),
      subtitle,
      subtitleIsWorkspace: true,
      collapsible: true,
    },
  ];
}

export function buildWorkspaceSections(
  rows: readonly AgentRow[],
): PanelSection[] {
  return groupAgentRowsByWorkspace(rows).map((group) => ({
    key: group.workspaceId,
    header: group.workspaceName,
    rows: group.rows,
    subtitle: (row) => SECTION_LABELS[row.section],
    subtitleIsWorkspace: false,
  }));
}

/**
 * The "Recent" view (internal `groupBy` value `"age"`): unlike status or
 * workspace grouping, every row sits in one flat, unheaded-by-status list —
 * no status or workspace bucketing above it. Order is entirely manual:
 * {@link orderAgeRows} / `manualOrder` (see `./manual-order`) — new agents
 * prepend at the top, and positions only change on drag-and-drop. There is
 * no automatic sort by duration/`since`. The one exception is the same
 * "N+ hours old" split `buildStatusSections` uses: a done row that's sat
 * past `staleDoneHours` still peels off into its own collapsible heading
 * (tagged with the same `STALE_DONE_SECTION_KEY`, so the panel's existing
 * hover-to-reveal behavior applies unchanged, and it stays un-reorderable —
 * see `agents-panel.tsx`'s render, which only wires drag handlers for
 * `key === "age"`), since burying genuinely stale rows among fresh ones
 * defeats the point of this view.
 */
export function buildAgeSections(
  rows: readonly AgentRow[],
  staleDoneEnabled: boolean,
  staleDoneHours: number,
  manualOrder: readonly string[],
): PanelSection[] {
  // Workspace only — no status prefix. The row's activity dot already says
  // what state the agent is in, and with this view sorted by age nearly every
  // row reads "Idle", so the label cost a line of width to repeat the glyph.
  const subtitle = (row: AgentRow) => row.workspaceName;
  const isStale = (row: AgentRow) =>
    staleDoneEnabled &&
    row.section === "done" &&
    isStaleDone(row, staleDoneHours);
  const activeRows = orderAgeRows(
    rows.filter((row) => !isStale(row)),
    manualOrder,
  );
  // No heading: the view's own title already says "Agents" — a heading here
  // would just restate it, unlike the by-status/by-workspace views where the
  // heading carries real information (which status, which workspace).
  const ageSection: PanelSection = {
    key: "age",
    header: "",
    rows: activeRows,
    subtitle,
    subtitleIsWorkspace: true,
  };
  if (!staleDoneEnabled) return [ageSection];
  return [
    ageSection,
    {
      key: STALE_DONE_SECTION_KEY,
      header: `${staleDoneHours}+ hours old`,
      rows: rows.filter(isStale).slice().sort(compareRows),
      subtitle,
      subtitleIsWorkspace: true,
      collapsible: true,
    },
  ];
}

/** The glyph for a row's section — "done" still distinguishes error/dead from
 * a plain acknowledged-idle finish (which gets the neutral gray dot). */
function glyphFor(row: AgentRow): Activity | undefined {
  switch (row.section) {
    case "ready":
      return "ready";
    case "working":
      return "working";
    case "done":
      if (row.activity === "error") return "error";
      if (row.activity === "dead") return "warn";
      return undefined;
  }
}

/** Drag affordance for a row, wired only in the "Recent" view's flat,
 * non-stale section (see `AgentsPanel`'s render — the stale section and the
 * status/workspace views never pass this). Pointer-based rather than native
 * HTML5 drag-and-drop — see the comment on `handleAgePointerDown` in
 * `AgentsPanel` for why. */
interface RowDrag {
  /** This row's position within the flat section — both for the checks
   * below and as the `data-drag-index` `AgentsPanel` uses to scope its
   * pointermove rect-measuring to just the draggable rows. */
  index: number;
  dragging: boolean;
  /** The drop indicator goes on whichever row edge is adjacent to the
   * insertion point: `insertBefore` draws it above this row (the common
   * case — every insertion point except the very last has a "next row" to
   * anchor to), `insertAfter` draws it below this row instead, and only the
   * section's last row ever gets it (there's no row after the very last
   * insertion point to be "before"). */
  insertBefore: boolean;
  insertAfter: boolean;
  onPointerDown: (e: ReactPointerEvent<HTMLSpanElement>) => void;
}

function AgentRowItem({
  row,
  subtitle,
  subtitleIsWorkspace,
  active,
  icon,
  iconMode,
  colorScheme,
  onFocus,
  onContextMenu,
  drag,
}: {
  row: AgentRow;
  /** Workspace name in the "by status" and "Recent" views; status label in the
   * "by workspace" view — whichever isn't already the enclosing section
   * header. */
  subtitle: string;
  /** See `PanelSection.subtitleIsWorkspace` — gates the workspace glyph. */
  subtitleIsWorkspace: boolean;
  active: boolean;
  icon: AgentIcon | undefined;
  iconMode: IconMode;
  colorScheme: "dark" | "light";
  onFocus: (terminalId: string) => void;
  onContextMenu: (row: AgentRow, at: { x: number; y: number }) => void;
  drag?: RowDrag;
}) {
  const classNames = ["ap-row"];
  if (active) classNames.push("active");
  if (drag?.dragging) classNames.push("ap-row-dragging");
  if (drag?.insertBefore) classNames.push("ap-row-drop-target-before");
  if (drag?.insertAfter) classNames.push("ap-row-drop-target-after");
  return (
    <div
      className={classNames.join(" ")}
      role="option"
      aria-selected={active}
      tabIndex={0}
      data-drag-index={drag?.index}
      onClick={() => onFocus(row.terminalId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onFocus(row.terminalId);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(row, { x: e.clientX, y: e.clientY });
      }}
    >
      {/* `md`, not the default `sm`: on the row's trailing edge the dot is the
          only thing carrying state, so it needs the weight the leading slot's
          smaller glyph used to borrow from its position. */}
      <ActivityGlyph
        activity={glyphFor(row)}
        size="md"
        className="ap-row-glyph"
        jitterKey={row.terminalId}
      />
      <div className="ap-row-text">
        <span className="ap-row-title-line">
          <AgentIconGlyph
            icon={icon}
            mode={iconMode}
            colorScheme={colorScheme}
            className="ap-row-icon"
          />
          <span className="ap-row-title">{row.title}</span>
        </span>
        <span className="ap-row-subtitle">
          {subtitleIsWorkspace && (
            <SquaresFour
              className="ap-row-ws-icon"
              size={12}
              weight="fill"
              aria-hidden="true"
            />
          )}
          <span className="ap-row-workspace">{subtitle}</span>
          {row.since && (
            <>
              <span className="ap-row-sep">·</span>
              <span className="ap-row-elapsed">{formatElapsed(row.since)}</span>
            </>
          )}
        </span>
      </div>
      {/* Hover-only affordance on the row's right edge — and, since this is a
          pointer-driven drag rather than native HTML5 drag-and-drop, the
          actual drag gesture starts here too (not from anywhere on the row):
          full control over the pointer means there's no need for the old
          "draggable has to be the whole row or the drag image is a tiny
          glyph" tradeoff. */}
      {drag && (
        <span
          className="ap-row-grip"
          title="Drag to reorder"
          onPointerDown={drag.onPointerDown}
        >
          <DotsSixVertical size={14} weight="bold" />
        </span>
      )}
    </div>
  );
}

export function AgentsPanel({
  ctx,
  active,
}: {
  ctx: ExtensionContext;
  /** False while this view is mounted but off screen — the 1s elapsed-time
   * tick is the only per-second work here, so parking it is the whole win. */
  active: boolean;
}) {
  // 1s so formatElapsed's seconds-resolution display (<1 minute) ticks live;
  // rows past a minute don't strictly need it, but the tick is cheap.
  useNow(active ? 1_000 : 0);

  const [, setTick] = useState(0);
  useEffect(
    () =>
      ctx.agents.subscribe(() => setTick((t) => t + 1), { allWorkspaces: true })
        .dispose,
    [ctx.agents],
  );
  useEffect(
    () => ctx.workspaces.subscribe(() => setTick((t) => t + 1)).dispose,
    [ctx.workspaces],
  );

  // The terminal currently focused in the center dock, wherever its
  // workspace — `getActive`/`subscribeActive` return a single, globally
  // unique terminal id, so a plain equality check is enough to mark its row.
  const [activeTerminalId, setActiveTerminalId] = useState(() =>
    ctx.terminals.getActive(),
  );
  useEffect(
    () => ctx.terminals.subscribeActive(setActiveTerminalId).dispose,
    [ctx.terminals],
  );

  // `groupBy` is a setting rather than a prop now: the two groupings were two
  // registered Navigator views until SDK 0.34, and are one view with a
  // "View by" header control since.
  const {
    iconMode,
    groupBy,
    staleDoneEnabled,
    staleDoneHours,
    staleHoverExpandEnabled,
  } = useServiceState(settingsService);

  // "color" mode picks a brand hex that has to have contrast against the
  // host's actual active background, not just against Silo's dark theme —
  // see AgentIconGlyph. `ctx.theme` matches ReactiveService's getState/
  // subscribe shape directly, so useServiceState works without adapting it.
  const themeState = useServiceState(ctx.theme);
  const colorScheme = ctx.theme.resolve(themeState.activeId).base;

  // The "Recent" view's persisted drag order (see ./manual-order) — reactive
  // for the same reason `groupBy` above is: a drag anywhere in this
  // component has to show up immediately, not just on the next unrelated
  // re-render.
  const manualOrder = useServiceState(manualOrderService);

  // Drag-to-reorder for the "Recent" view's flat section only, driven by raw
  // Pointer Events rather than native HTML5 drag-and-drop. Native drag was
  // the first cut here, but WebKit (Silo's Tauri webview) only rasterizes
  // *some* of a row into its automatic drag image — the status dot came
  // through, the flex/ellipsis-heavy text column and the row's own
  // background didn't — and that held even after switching to an explicit
  // `setDragImage` call. Pointer Events sidestep the browser's drag-image
  // machinery entirely: `handleAgePointerDown` below clones the row into a
  // plain `position: fixed` element we move ourselves on every
  // `pointermove`, so what follows the cursor is guaranteed to be a real,
  // fully-painted copy of the row, not a browser-generated snapshot.
  //
  // `dragIndexRef`/`dropTargetIndexRef` are refs because the move/up
  // listeners below are plain `window.addEventListener` callbacks (outside
  // React's render cycle) — they need a synchronously-current value, not
  // whatever `dropTargetIndex` closed over back when the drag started.
  // `setDropTargetIndex` keeps the ref and the state (which the row-map below
  // reads, to rerender the drop-target styling as the drag crosses rows) in
  // lockstep.
  //
  // `dropTargetIndex` is an *insertion point*, not "which row is hovered" —
  // it ranges from `0` (before the first row) through `sectionRows.length`
  // (after the last row) inclusive. That extra value past the last row's own
  // index is what makes "drop at the very bottom" representable at all: a
  // hit-test keyed on "which row am I over" has no row to report once the
  // cursor passes the last one, so it went stale there and both the border
  // and the final drop position silently fell back to a smaller row instead.
  const dragIndexRef = useRef<number | null>(null);
  const dropTargetIndexRef = useRef<number | null>(null);
  const [dropTargetIndex, setDropTargetIndexState] = useState<number | null>(
    null,
  );
  function setDropTargetIndex(index: number | null) {
    dropTargetIndexRef.current = index;
    setDropTargetIndexState(index);
  }
  const dragGhostRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // Set only while a drag is in flight, so the panel can tear down its ghost
  // element and window listeners if it unmounts mid-drag (e.g. the user
  // switches Navigator views without releasing the pointer).
  const dragCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => dragCleanupRef.current?.(), []);

  function handleAgePointerDown(
    e: ReactPointerEvent<HTMLSpanElement>,
    index: number,
    sectionRows: readonly AgentRow[],
  ) {
    const rowEl = e.currentTarget.closest<HTMLDivElement>(".ap-row");
    if (!rowEl) return;
    e.preventDefault();

    const rect = rowEl.getBoundingClientRect();
    dragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    dragIndexRef.current = index;
    setDropTargetIndex(index);

    const ghost = rowEl.cloneNode(true) as HTMLDivElement;
    ghost.classList.add("ap-row-ghost");
    ghost.style.width = `${rect.width}px`;
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    document.body.appendChild(ghost);
    dragGhostRef.current = ghost;

    // Every row still in the DOM for this section, in display order —
    // measured once here rather than re-queried on every `pointermove`. Rows
    // don't reorder mid-drag (`manualOrder` only changes on drop), so their
    // relative order stays valid for the whole gesture; each row's *rect* is
    // still re-read live below, so scrolling mid-drag is accounted for.
    const rowEls = Array.from(
      rowEl.parentElement?.querySelectorAll<HTMLElement>(
        ":scope > .ap-row[data-drag-index]",
      ) ?? [],
    );

    // Cursor-relative-to-row-midpoints hit-testing, not
    // `elementFromPoint`-on-a-row: the cursor spends plenty of time over
    // blank space below the last row (or between rows, given the row
    // spacing) where no row element exists to hit-test against at all, and
    // that blank space is exactly where "insert at the very end" lives.
    // Comparing against midpoints instead means every cursor position maps
    // to *some* insertion point, all the way through `rowEls.length`.
    function insertionIndexAt(clientY: number): number {
      for (let i = 0; i < rowEls.length; i++) {
        const r = rowEls[i].getBoundingClientRect();
        if (clientY < r.top + r.height / 2) return i;
      }
      return rowEls.length;
    }

    function handleMove(ev: PointerEvent) {
      const g = dragGhostRef.current;
      if (g) {
        g.style.left = `${ev.clientX - dragOffsetRef.current.x}px`;
        g.style.top = `${ev.clientY - dragOffsetRef.current.y}px`;
      }
      const idx = insertionIndexAt(ev.clientY);
      if (idx !== dropTargetIndexRef.current) setDropTargetIndex(idx);
    }

    function cleanup() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", cleanup);
      dragGhostRef.current?.remove();
      dragGhostRef.current = null;
      dragIndexRef.current = null;
      setDropTargetIndex(null);
      dragCleanupRef.current = null;
    }

    function handleUp() {
      const from = dragIndexRef.current;
      const insertAt = dropTargetIndexRef.current;
      if (from !== null && insertAt !== null && insertAt !== from) {
        // `insertAt` is expressed in the *original* (pre-removal) row order
        // — "insert before whichever row used to sit at this index" — but
        // `moveItem`'s `to` means "the moved item's index in the final
        // array". Those only coincide when `insertAt <= from`: dragging
        // downward past `from` shifts everything between `from` and
        // `insertAt` up by one once the dragged row is removed, so the
        // final index is one less than the original insertion point.
        const finalIndex = insertAt > from ? insertAt - 1 : insertAt;
        // Persist the whole visible order after the move — every flat-section
        // id is already in `manualOrder` (reconcile prepends newcomers), so
        // this is just rewriting positions from the drag.
        manualOrderService.set(
          moveItem(
            sectionRows.map((r) => r.terminalId),
            from,
            finalIndex,
          ),
        );
      }
      cleanup();
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", cleanup);
    dragCleanupRef.current = cleanup;
  }

  // The "N+ hours old" section starts collapsed. With `staleHoverExpandEnabled`
  // on, it reveals its rows while the mouse is over it — attached to the
  // section's own container (not the heading), so a click on a row inside it
  // (which doesn't move the mouse) never collapses it mid-click; only
  // actually leaving the section does. With it off (the default), hover does
  // nothing and the heading is a click-to-toggle disclosure instead — a
  // stray hover while scrolling past the section can't pop it open.
  //
  // Collapse is debounced rather than instant: WebKit (and Chromium) re-hit-test
  // and fire mouseleave/mouseenter transitions on scroll, not just on real
  // pointer movement, so scrolling the panel with the cursor sitting still over
  // this section can momentarily "leave" it mid-scroll. Without the delay that
  // collapsed the section — and shrank ap-body's scroll height — before the
  // user could ever scroll down into the rows they'd just revealed. A leave
  // that's immediately followed by a re-enter (the common case while scrolling
  // through the section's own rows) cancels the pending collapse; only a leave
  // that sticks around actually collapses it.
  // One flag serves both interaction modes (rather than a separate flag per
  // mode) so toggling `staleHoverExpandEnabled` while the panel is mounted
  // can't desync the two — the section's current open/closed state simply
  // carries over to whichever mode is now active.
  const [staleExpanded, setStaleExpanded] = useState(false);
  const staleCollapseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  useEffect(
    () => () => {
      if (staleCollapseTimeoutRef.current !== null) {
        clearTimeout(staleCollapseTimeoutRef.current);
      }
    },
    [],
  );
  function handleStaleMouseEnter() {
    if (staleCollapseTimeoutRef.current !== null) {
      clearTimeout(staleCollapseTimeoutRef.current);
      staleCollapseTimeoutRef.current = null;
    }
    setStaleExpanded(true);
  }
  function handleStaleMouseLeave() {
    staleCollapseTimeoutRef.current = setTimeout(() => {
      staleCollapseTimeoutRef.current = null;
      setStaleExpanded(false);
    }, 300);
  }
  function handleStaleHeadingClick() {
    setStaleExpanded((expanded) => !expanded);
  }

  const agentsSnapshot = ctx.agents.getState({ allWorkspaces: true });
  // "Done since" is tracked at extension scope (see ./done-since) rather than
  // here: both views read the same stamps, and tracking has to keep running
  // whichever view — if any — the user has open.
  const rows = buildAgentRows(
    agentsSnapshot,
    ctx.workspaces.getState().all,
    getDoneSince(),
  );

  const sections =
    groupBy === "workspace"
      ? buildWorkspaceSections(rows)
      : groupBy === "age"
        ? buildAgeSections(rows, staleDoneEnabled, staleDoneHours, manualOrder)
        : buildStatusSections(rows, staleDoneEnabled, staleDoneHours);

  const staleStartsExpanded = staleSectionStartsExpanded(sections);

  // Keep `manualOrder` in sync with the flat section: prepend any newly
  // visible terminal ids (so they stay at the top across reloads) and drop
  // ids that left for good (closed, or aged into "N+ hours old"). Display
  // already applies the same rule via `orderAgeRows`; this only persists it.
  useEffect(() => {
    if (groupBy !== "age") return;
    const flatIds =
      sections.find((s) => s.key === "age")?.rows.map((r) => r.terminalId) ??
      [];
    const next = reconcileAgeManualOrder(manualOrder, flatIds);
    if (
      next.length !== manualOrder.length ||
      next.some((id, i) => id !== manualOrder[i])
    ) {
      manualOrderService.set(next);
    }
  });

  function openRowMenu(row: AgentRow, at: { x: number; y: number }) {
    const items: MenuEntry[] = [];
    // Only a row that's actually flagged has anything to acknowledge —
    // `acknowledge` is a host-side no-op otherwise, and an always-present row
    // that usually does nothing is worse than one that comes and goes.
    if (row.section === "ready") {
      items.push({
        label: "Mark as seen",
        run: () => ctx.agents.acknowledge(row.terminalId),
      });
      items.push({ type: "separator" });
    }

    // Rename… and any `terminal/tab` contributions — the same rows the
    // terminal's own tab offers, rather than a menu that drifts from it.
    items.push(...ctx.terminals.getTabMenuItems(row.terminalId));

    // The workspace this agent is running in. A submenu rather than inline
    // because rows span every workspace in the Agents view, so the actions
    // need to say which one they apply to.
    const workspaceItems = ctx.workspaces.getWorkspaceMenuItems(
      row.workspaceId,
    );
    if (workspaceItems.length > 0) {
      if (items.length > 0) items.push({ type: "separator" });
      items.push({ label: row.workspaceName, submenu: workspaceItems });
    }

    if (items.length > 0) items.push({ type: "separator" });
    items.push({
      label: "Close terminal",
      danger: true,
      run: () => {
        void (async () => {
          const ok = await ctx.ui.confirm({
            title: "Close terminal?",
            body: `"${row.title}" and anything running in it will be stopped.`,
            confirmLabel: "Close",
            danger: true,
          });
          if (ok) ctx.terminals.close(row.terminalId);
        })();
      },
    });

    void ctx.ui.showMenu({ items, at, toggle: false });
  }

  // Only the workspace grouping can produce zero sections (no workspace to
  // group by) — the status grouping always has its three fixed headings, even
  // with no agents at all, so it never hits this.
  if (sections.length === 0) {
    return (
      <div className="ap-panel">
        <div className="ap-body">
          <div className="ap-empty">
            <p>No agents running.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ap-panel">
      <div className="ap-body">
        {sections.map((section) => {
          const isStaleSection = section.key === STALE_DONE_SECTION_KEY;
          const isDraggableSection = section.key === "age";
          const expanded =
            !isStaleSection || staleStartsExpanded || staleExpanded;
          // The stale section's disclosure trigger is either mode, never
          // both: hover-mode wires the mouse handlers, click-mode makes the
          // heading itself the toggle.
          const isStaleHoverTrigger = isStaleSection && staleHoverExpandEnabled;
          const isStaleClickTrigger =
            isStaleSection && !staleHoverExpandEnabled;
          return (
            <div
              key={section.key}
              className="ap-section"
              onMouseEnter={
                isStaleHoverTrigger ? handleStaleMouseEnter : undefined
              }
              onMouseLeave={
                isStaleHoverTrigger ? handleStaleMouseLeave : undefined
              }
            >
              {/* Every heading carries its row count. The status grouping's
                  three headings are fixed and so are often empty — a `0` says
                  "nothing ready" in less space than a placeholder row. An
                  empty `header` (the "Recent" view's flat list) skips the
                  heading row entirely — "Agents" would only restate the
                  view's own title. */}
              {section.header !== "" && (
                <div
                  className={
                    isStaleClickTrigger
                      ? "ap-section-title ap-section-title-clickable"
                      : "ap-section-title"
                  }
                  onClick={
                    isStaleClickTrigger ? handleStaleHeadingClick : undefined
                  }
                >
                  {isStaleSection && (
                    <CaretRight
                      size="0.7em"
                      weight="bold"
                      className={
                        expanded
                          ? "ap-section-caret expanded"
                          : "ap-section-caret"
                      }
                    />
                  )}
                  {section.header}
                  <Badge size="sm" className="ap-section-count">
                    {section.rows.length}
                  </Badge>
                </div>
              )}
              {expanded &&
                section.rows.map((row, i) => (
                  <AgentRowItem
                    key={row.terminalId}
                    row={row}
                    subtitle={section.subtitle(row)}
                    subtitleIsWorkspace={section.subtitleIsWorkspace}
                    active={row.terminalId === activeTerminalId}
                    icon={
                      ctx.agents.catalog().find((c) => c.id === row.agentId)
                        ?.icon
                    }
                    iconMode={iconMode}
                    colorScheme={colorScheme}
                    onFocus={(terminalId) => ctx.terminals.focus(terminalId)}
                    onContextMenu={openRowMenu}
                    drag={
                      isDraggableSection
                        ? {
                            index: i,
                            dragging: dragIndexRef.current === i,
                            insertBefore: dropTargetIndex === i,
                            insertAfter:
                              i === section.rows.length - 1 &&
                              dropTargetIndex === section.rows.length,
                            onPointerDown: (e) =>
                              handleAgePointerDown(e, i, section.rows),
                          }
                        : undefined
                    }
                  />
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
