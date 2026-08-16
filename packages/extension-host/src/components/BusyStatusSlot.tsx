import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { Badge } from "@silo-code/sdk";
import {
  getBusyStatusSnapshot,
  subscribeBusyStatus,
} from "../extension-host/busy-status";
import {
  getStatusFlash,
  subscribeStatusFlash,
} from "../extension-host/status-flash";
import type { BusyStatusEntry } from "../extension-host/busy-status-model";
import { useMenuDismiss, useMenuPlacement } from "./use-menu-dismiss";
import "./BusyStatusSlot.css";

/**
 * Host-owned StatusBar ambient region (RFC 0026):
 * - **Busy status** — multi-writer in-flight work (spinner + optional badge)
 * - **Status flash** — host-only ephemeral non-busy phrase (e.g. "Silo is ready")
 *
 * Flash takes the slot when active; otherwise the busy aggregate shows.
 */
export function BusyStatusSlot() {
  const flash = useSyncExternalStore(
    useCallback((cb) => subscribeStatusFlash(cb).dispose, []),
    getStatusFlash,
    getStatusFlash,
  );
  const snap = useSyncExternalStore(
    useCallback((cb) => subscribeBusyStatus(cb).dispose, []),
    getBusyStatusSnapshot,
    getBusyStatusSnapshot,
  );
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { primary, count } = snap.summary;

  if (flash) {
    return (
      <span
        className="busy-status-slot busy-status-slot--flash"
        aria-live="polite"
      >
        <span className="busy-status-slot__label">{flash.label}</span>
      </span>
    );
  }

  if (!primary) return null;

  const toggle = () => setOpen((v) => !v);

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        className="busy-status-slot"
        aria-live="polite"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          count > 1 ? `${primary.label} (${count} in progress)` : primary.label
        }
        onClick={toggle}
      >
        <ArrowsClockwise
          size={14}
          className="busy-status-slot__spin"
          aria-hidden
        />
        <span className="busy-status-slot__label">{primary.label}</span>
        {count > 1 ? (
          <Badge size="sm" tone="neutral" className="busy-status-slot__badge">
            {count}
          </Badge>
        ) : null}
      </button>
      {open && btnRef.current
        ? createPortal(
            <BusyStatusPopover
              anchor={btnRef.current}
              entries={snap.popoverEntries}
              onClose={() => setOpen(false)}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function BusyStatusPopover({
  anchor,
  entries,
  onClose,
}: {
  anchor: HTMLElement;
  entries: BusyStatusEntry[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useMenuDismiss(ref, anchor, onClose);
  const pos = useMenuPlacement(ref, { anchor, align: "start" });

  return (
    <div
      ref={ref}
      className="busy-status-popover"
      role="dialog"
      aria-label="In progress"
      style={{
        left: pos.x,
        top: pos.y,
        visibility: pos.visible ? "visible" : "hidden",
      }}
    >
      <div className="busy-status-popover__header">
        <span className="busy-status-popover__title">In progress</span>
        <Badge size="sm" tone="neutral">
          {entries.length}
        </Badge>
      </div>
      <ul className="busy-status-popover__list">
        {entries.map((e) => (
          <li key={e.id} className="busy-status-popover__row">
            <ArrowsClockwise
              size={14}
              className="busy-status-popover__spin"
              aria-hidden
            />
            <div className="busy-status-popover__text">
              <div className="busy-status-popover__label">{e.label}</div>
              {e.detail ? (
                <div className="busy-status-popover__detail">{e.detail}</div>
              ) : null}
            </div>
            {e.urgency === "high" ? (
              <Badge size="sm" tone="warn">
                high
              </Badge>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
