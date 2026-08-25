import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useSnapshot } from "valtio";
import { yieldEscapeToInlineEdit } from "@silo-code/sdk";
import {
  nextSheetKey,
  pushOffset,
  pushSheet,
  removeSheet,
  sheetStack,
  updateSheet,
  type OpenSheet,
  type SheetAlign,
  type SheetAnchor,
  type SheetMode,
  type SheetSide,
} from "./sheet-service";
import {
  placeSheet,
  resolveSheetWidth,
  type Box,
  type SheetPlacement,
} from "./sheet-geometry";
import { getMenu } from "./menu-controller";
import { TABBABLE } from "./focus-dom";
import "./Sheet.css";

// PROTOTYPE — the side-anchored companion to `<Modal>`. See sheet-service.ts
// for the three axes (side / anchor / mode) and what each one means.
//
// Like `<Modal>`, a sheet stays in the caller's React tree and portals itself
// out: modal sheets to `document.body` (fixed, positioned from measured layout
// rects), push sheets into the slot AppShell reserves inside the center dock —
// which is what makes a push sheet *narrow* the center dock instead of covering
// it. Both register in the one `sheetStack` so z-order is host-arbitrated.
//
// A dock-anchored sheet does NOT take a `side`: it grows out of whichever dock
// the caller is rendered in, read off the DOM (see `useDockSide`). Letting the
// caller name a side would let a panel in the left dock open a sheet from the
// right one, which reads as an unrelated surface appearing across the window.
//
// Modality follows the anchor, not a flag: app-anchored sheets are modal (scrim,
// Escape, focus), dock-anchored ones never are. See sheet-service.ts.

/** z-index step between stacked sheets; the base is `--silo-z-sheet-base`. */
const Z_STEP = 10;

/** Matches `.app-shell.mac .app-col`'s traffic-light reservation. */
const MAC_TITLEBAR_PX = 36;

/** The chrome + behavior half of {@link SheetProps}, common to every anchor. */
interface SheetChrome {
  /** Header rendered at the top of the sheet; omit for a bare surface. */
  title?: ReactNode;
  /**
   * Width in CSS px. Omit for the anchor's default: an app-anchored sheet takes
   * 70% of the workbench width (capped at 1550px), a dock-anchored one 520px.
   */
  width?: number;
  /**
   * Skip the sheet's own header and body padding — your content *is* the
   * surface, and owns its own chrome (including a close affordance). The sheet
   * still owns placement, stacking, the scrim, and Escape. For full-bleed
   * layouts that can't live inside a padded scroll box; mirrors `<Modal bare>`.
   */
  bare?: boolean;
  /** Extra class on the sheet surface. */
  className?: string;
  /** Accessible name for sheets without a visible {@link SheetChrome.title}. */
  ariaLabel?: string;
  /** Invoked when the sheet should close. The caller owns the open state. */
  onClose: () => void;
  /** The sheet's content. */
  children: ReactNode;
}

/**
 * Props for the host {@link Sheet} component. The anchor decides both the
 * modality and what else you get to say: an **app**-anchored sheet is modal and
 * picks its own edge of the window, while a **dock**-anchored one is never
 * modal, inherits the dock it was opened from, and is the only kind with a
 * `mode`.
 */
export type SheetProps = SheetChrome &
  (
    | {
        /** Anchored to the app window — the modal sheet. Default. */
        anchor?: "app";
        /**
         * Where in the window it sits: against the `"left"` or `"right"` edge,
         * or `"center"` — floating in the middle with the scrim on both sides.
         * Default `"left"`.
         */
        align?: SheetAlign;
        /**
         * Allow `Escape` and scrim-click to close (resolving nothing — the
         * caller's `onClose` fires). Default `true`: a sheet is a place you
         * visit rather than a decision you owe an answer to.
         */
        dismissible?: boolean;
        mode?: never;
        side?: never;
      }
    | {
        /**
         * Anchored to the inner edge of the side dock the caller lives in, so
         * the sheet reads as that panel extending outward. Never modal: no
         * scrim, no click-outside, and the workbench beside it stays live.
         */
        anchor: "dock";
        /**
         * What happens to the center dock: `"overlay"` covers it, `"push"`
         * narrows it so the sheet takes real layout space. Default `"overlay"`.
         */
        mode?: SheetMode;
        /**
         * Which side to anchor to, bypassing the DOM-sentinel inference
         * (`useDockSide`) that normally reads it off the caller's own React
         * tree. Only needed by a caller whose `<Sheet>` isn't mounted inside
         * the dock it's anchoring to — today, only `SheetDialogHost`, which
         * renders every `ctx.layout.openPanelSheet` at the app root and
         * already knows the target panel's actual side from host state.
         * Omit for the normal declarative case.
         */
        side?: SheetSide;
        align?: never;
        dismissible?: never;
      }
  );

function boxOf(el: Element | null | undefined): Box | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    left: r.left,
    right: r.right,
    top: r.top,
    bottom: r.bottom,
    width: r.width,
  };
}

/**
 * Which side dock the caller is rendered in, read from the DOM ancestry of a
 * sentinel left behind in the caller's own tree (the sheet itself portals away,
 * so it can't ask this of its own node). `null` until the first layout pass has
 * run; a caller that isn't in a side dock at all resolves to `"left"`.
 */
function useDockSide(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
): SheetSide | null {
  const [side, setSide] = useState<SheetSide | null>(null);
  useLayoutEffect(() => {
    if (!enabled) return;
    const col = ref.current?.closest<HTMLElement>("[data-app-col]");
    setSide(col?.dataset.appCol === "right" ? "right" : "left");
  }, [ref, enabled]);
  return enabled ? side : null;
}

/**
 * Track the fixed box a modal sheet occupies, re-measuring whenever the window
 * or either side dock changes size (a dock drag moves the anchor edge, a window
 * resize moves everything).
 */
function useSheetPlacement(
  align: SheetAlign | null,
  anchor: SheetAnchor,
  width: number | undefined,
  enabled: boolean,
): SheetPlacement | null {
  const [placement, setPlacement] = useState<SheetPlacement | null>(null);

  const measure = useCallback(() => {
    if (!enabled || align === null) return;
    const shell = document.querySelector<HTMLElement>(".app-shell");
    const group = boxOf(shell?.querySelector("[data-panel-group]"));
    if (!shell || !group) return;
    setPlacement(
      placeSheet({
        align,
        anchor,
        // Only an edge-aligned sheet has a dock to anchor to.
        col:
          align === "center"
            ? null
            : boxOf(shell.querySelector(`[data-app-col="${align}"]`)),
        group,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        macOffset: shell.classList.contains("mac") ? MAC_TITLEBAR_PX : 0,
        width,
      }),
    );
  }, [align, anchor, width, enabled]);

  useLayoutEffect(() => {
    if (!enabled || align === null) return;
    measure();
    const shell = document.querySelector<HTMLElement>(".app-shell");
    if (!shell) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(shell);
    // Observing both docks catches a resize-handle drag, which moves the
    // anchor edge without changing the shell's own size.
    for (const loc of ["left", "right"]) {
      const col = shell.querySelector(`[data-app-col="${loc}"]`);
      if (col) observer.observe(col);
    }
    return () => observer.disconnect();
  }, [measure, enabled, align]);

  return placement;
}

/** Resolve (and keep resolved) the push-mode portal target AppShell reserves. */
function usePushSlot(
  side: SheetSide | null,
  enabled: boolean,
): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!enabled || side === null) return;
    setSlot(
      document.querySelector<HTMLElement>(
        `.silo-sheet-push-slot[data-side="${side}"]`,
      ),
    );
  }, [side, enabled]);
  return enabled ? slot : null;
}

/**
 * A host-owned side sheet. Renders full-height against an edge of the app
 * window (modal) or of the side dock it was opened from (never modal — either
 * covering the center dock, or narrowing it to make room).
 */
export function Sheet({
  title,
  width,
  bare = false,
  className,
  ariaLabel,
  onClose,
  children,
  ...rest
}: SheetProps) {
  const anchor: SheetAnchor = rest.anchor ?? "app";
  // Modality follows the anchor: only an app-anchored sheet blocks the app.
  const isModal = anchor === "app";
  const isDock = !isModal;
  const mode: SheetMode = isDock ? (rest.mode ?? "overlay") : "overlay";
  const isPush = mode === "push";
  const dismissible = isModal ? (rest.dismissible ?? true) : false;

  const id = useMemo(() => nextSheetKey(), []);
  const sentinelRef = useRef<HTMLSpanElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const snap = useSnapshot(sheetStack);

  // A dock-anchored sheet takes its side from where the caller sits — unless
  // `side` is given explicitly (the imperative `ctx.layout.openPanelSheet`
  // path, whose `<Sheet>` isn't mounted inside the dock it anchors to; see
  // SheetProps). An app-anchored one is told (defaulting to the left edge).
  const explicitSide = isDock ? rest.side : undefined;
  const inferredSide = useDockSide(
    sentinelRef,
    isDock && explicitSide === undefined,
  );
  const dockSide = isDock ? (explicitSide ?? inferredSide) : null;
  const align: SheetAlign | null = isDock ? dockSide : (rest.align ?? "left");

  // Everything but a push sheet is positioned from measured layout rects; a
  // push sheet is laid out by the gap the AppShell opens for it instead.
  const placement = useSheetPlacement(align, anchor, width, !isPush);
  const pushSlot = usePushSlot(dockSide, isPush);

  // A push sheet's width has to be known before it renders — the AppShell reads
  // it off the stack to size that gap. Everything else takes whatever the
  // placement resolved to.
  const widthPx = isPush
    ? resolveSheetWidth(anchor, window.innerWidth, width)
    : (placement?.width ?? resolveSheetWidth(anchor, window.innerWidth, width));

  // Register on mount; restore focus + unregister on unmount. Waits for the
  // side, since that's what decides which gap the AppShell has to open.
  useLayoutEffect(() => {
    if (align === null) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const entry: OpenSheet = { id, align, anchor, mode, widthPx };
    pushSheet(entry);
    return () => {
      removeSheet(id);
      restoreRef.current?.focus?.();
    };
    // widthPx is synced by the effect below, not by re-registering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, align, anchor, mode]);

  useLayoutEffect(() => {
    updateSheet(id, { widthPx });
  }, [id, widthPx]);

  const index = snap.open.findIndex((s) => s.id === id);
  const isTop = index === snap.open.length - 1;
  const z = index < 0 ? 0 : index;

  // Focus the first control when a modal sheet becomes topmost, unless
  // something inside already holds focus (honors an `autoFocus` child). A dock
  // sheet deliberately doesn't: it's workbench furniture appearing beside your
  // work, and panels don't yank the caret out of a terminal when they open.
  useEffect(() => {
    if (!isModal || !isTop) return;
    const el = surfaceRef.current;
    if (!el || el.contains(document.activeElement)) return;
    const first = el.querySelector<HTMLElement>(TABBABLE);
    (first ?? el).focus();
  }, [isModal, isTop]);

  // Escape closes a dismissible modal sheet, while it is topmost. A dock sheet
  // never listens: the workbench beside it is live, and Escape belongs to
  // whatever the user is actually typing into. Deliberately no Tab trap either
  // — even a modal sheet is a place rather than a decision, so Escape is the
  // whole exit contract.
  useEffect(() => {
    if (!isModal || !isTop || !dismissible) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // An in-progress InlineEdit owns the first Escape (cancelling its edit).
      if (yieldEscapeToInlineEdit()) {
        e.preventDefault();
        return;
      }
      // A menu open on top of the sheet owns Escape — same ordering fix as
      // Modal.tsx: both listen on document/capture, sheet registered first.
      if (getMenu()) return;
      e.preventDefault();
      onClose();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [isModal, isTop, dismissible, onClose]);

  // The sentinel stays behind in the caller's tree — it's what `useDockSide`
  // reads the owning dock from, so it must never be portalled with the rest.
  const sentinel = (
    <span ref={sentinelRef} className="silo-sheet-anchor" aria-hidden="true" />
  );

  // Alignment is unknown on the very first render of a dock-anchored sheet.
  // Layout effects run before paint, so the real surface lands in the same frame.
  if (align === null) return sentinel;

  const surface = (
    <div
      ref={surfaceRef}
      className={
        `silo-sheet silo-sheet--${align} silo-sheet--${anchor} silo-sheet--${mode}` +
        (bare ? " silo-sheet--bare" : "") +
        (className ? ` ${className}` : "")
      }
      role={isModal ? "dialog" : "complementary"}
      aria-modal={isModal || undefined}
      aria-label={ariaLabel}
      tabIndex={-1}
      onMouseDown={(e) => e.stopPropagation()}
      style={
        !isPush
          ? {
              position: "fixed",
              top: placement?.top,
              bottom: placement?.bottom,
              left: placement?.left,
              right: placement?.right,
              width: placement?.width,
              zIndex: `calc(var(--silo-z-sheet-base) + ${z * Z_STEP} + 1)`,
              visibility: placement ? undefined : "hidden",
            }
          : {
              position: "absolute",
              top: 0,
              bottom: 0,
              width: widthPx,
              // Push implies a dock anchor, so `dockSide` is the real side here.
              [dockSide ?? "left"]: pushOffset(
                snap.open as OpenSheet[],
                id,
                dockSide ?? "left",
              ),
            }
      }
    >
      {bare ? (
        children
      ) : (
        <>
          <div className="silo-sheet-header">
            {title != null && <div className="silo-sheet-title">{title}</div>}
            <button
              type="button"
              className="silo-sheet-close"
              aria-label="Close"
              onClick={onClose}
            >
              <svg
                viewBox="0 0 16 16"
                width="14"
                height="14"
                aria-hidden="true"
              >
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <div className="silo-sheet-body">{children}</div>
        </>
      )}
    </div>
  );

  if (isPush) {
    return (
      <>
        {sentinel}
        {pushSlot ? createPortal(surface, pushSlot) : null}
      </>
    );
  }

  return (
    <>
      {sentinel}
      {createPortal(
        <>
          {/* Only the modal (app-anchored) sheet draws a scrim. A dock sheet
              sits over the center dock with nothing between them, so whatever
              the sheet doesn't cover stays fully interactive. */}
          {isModal && (
            <div
              className="silo-sheet-backdrop"
              style={{
                // Begins where the sheet ends, so the dimmed area is exactly
                // what the sheet doesn't occupy (see SheetPlacement.scrim).
                left: placement?.scrim.left ?? 0,
                right: placement?.scrim.right ?? 0,
                zIndex: `calc(var(--silo-z-sheet-base) + ${z * Z_STEP})`,
                visibility: placement ? undefined : "hidden",
              }}
              onMouseDown={dismissible ? onClose : undefined}
            />
          )}
          {surface}
        </>,
        document.body,
      )}
    </>
  );
}
