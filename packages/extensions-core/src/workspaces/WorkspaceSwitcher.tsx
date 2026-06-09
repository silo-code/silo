import { useSyncExternalStore, type RefObject } from "react";
import { createPortal } from "react-dom";
import { SquaresFour } from "@phosphor-icons/react";
import {
  getSwitcherSession,
  subscribeSwitcherSession,
} from "./workspace-switcher-session";
import "./WorkspaceSwitcher.css";

/** Gap in px between the popup and the status-bar button it floats above. */
const GAP = 6;

/**
 * The Cmd+`-cycle popup: a small menu-style list that floats directly above the
 * workspace name in the status bar while the cycle modifier is held, with the
 * about-to-activate workspace highlighted (macOS Cmd+Tab style). Display-only —
 * `workspace-cycle.ts` owns the keys and the actual switch on modifier release;
 * this just draws whatever `workspace-switcher-session` currently holds.
 *
 * Rendered by the always-mounted `WorkspaceStatusItem`, anchored to its button.
 */
export function WorkspaceSwitcher({
  anchorRef,
}: {
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const session = useSyncExternalStore(
    subscribeSwitcherSession,
    getSwitcherSession,
  );

  if (!session) return null;
  const anchor = anchorRef.current;
  if (!anchor) return null;

  const rect = anchor.getBoundingClientRect();
  // Grow upward from the button: pin the popup's bottom just above its top edge.
  const style = {
    left: `${rect.left}px`,
    bottom: `${window.innerHeight - rect.top + GAP}px`,
  };

  // The popup floats above the status bar and grows upward, so render the list
  // bottom-up: the current workspace sits at the bottom (nearest its name in the
  // status bar) and Cmd+` walks the highlight up through more-distant recents.
  const rows = [...session.entries].reverse();

  return createPortal(
    <div className="ws-switcher" style={style} role="listbox">
      {rows.map((entry) => {
        const selected = entry.id === session.selectedId;
        return (
          <div
            key={entry.id}
            role="option"
            aria-selected={selected}
            className={`ws-switcher-item${selected ? " selected" : ""}`}
          >
            <SquaresFour
              size={16}
              weight="duotone"
              className="ws-switcher-icon"
            />
            <span className="ws-switcher-name">{entry.name}</span>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
