import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useSnapshot } from "valtio";
import type { ModalOptions } from "@silo-code/sdk";
import {
  modalStack,
  nextModalKey,
  pushModal,
  removeModal,
} from "./modal-service";
import { getMenu } from "./menu-controller";
import { TABBABLE } from "./focus-dom";

// The SDK `<Modal>` — host-owned dialog chrome for arbitrary custom content,
// the declarative companion to the imperative `ctx.ui.confirm` / `ctx.ui.prompt`
// (which are themselves built on it). It stays in the caller's React tree and
// self-portals into `document.body`, reading its z-index from the modal manager
// (modal-service.ts) so stacking is host-arbitrated — no hand-picked numbers,
// no races. It owns the focus trap, restore-focus-on-close, and (when
// `dismissible`) Escape + backdrop-click. Only the topmost modal traps/listens.
//
// Styled entirely from the `--silo-modal-*` component tokens + `.silo-modal*`
// classes (theme.css), so it themes with everything else.

/** z-index step between stacked modals; the base is `--silo-z-modal-base`. */
const Z_STEP = 10;

function focusableIn(card: HTMLElement): HTMLElement[] {
  return Array.from(card.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * Props for the host {@link Modal} component — the public {@link ModalOptions}
 * (title / dismissible / size / bare / className / ariaLabel) plus the two
 * members the host owns and the public `ctx.ui.showModal` surface hides:
 * `onClose` and `children`. Internal-only; the public capability is
 * `ctx.ui.showModal`.
 *
 * @internal
 */
export interface ModalProps extends ModalOptions {
  /**
   * Invoked when the modal should close — wired to every close affordance
   * (your own buttons, plus Escape/backdrop when {@link ModalOptions.dismissible}
   * is set). The caller owns the open/closed state; `onClose` just signals.
   */
  onClose: () => void;
  /** The modal's content. */
  children: ReactNode;
}

/**
 * A host-owned modal dialog. Renders a backdrop + card portalled to
 * `document.body`, with a host-assigned z-index, focus trap, and (opt-in)
 * dismissal. Pair the footer buttons with {@link ModalActions}.
 *
 * @example
 * ```tsx
 * <Modal title="Workspace Properties" onClose={close}>
 *   <MyForm />
 *   <ModalActions>
 *     <button className="silo-button" onClick={close}>Cancel</button>
 *     <button className="silo-button-primary" onClick={save}>Save</button>
 *   </ModalActions>
 * </Modal>
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function Modal({
  title,
  onClose,
  dismissible = false,
  size = "md",
  bare = false,
  className,
  ariaLabel,
  children,
}: ModalProps) {
  const id = useMemo(() => nextModalKey(), []);
  const cardRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const snap = useSnapshot(modalStack);

  // Register in the stack on mount; restore focus + unregister on unmount.
  useLayoutEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    pushModal(id);
    return () => {
      removeModal(id);
      restoreRef.current?.focus?.();
    };
  }, [id]);

  const index = snap.ids.indexOf(id);
  const isTop = index === snap.ids.length - 1;
  const z = index < 0 ? 0 : index;

  // Focus the first focusable when this becomes topmost — unless something
  // inside already holds focus (honors an `autoFocus` child, e.g. confirm's
  // primary button).
  useEffect(() => {
    if (!isTop) return;
    const card = cardRef.current;
    if (!card || card.contains(document.activeElement)) return;
    const first = card.querySelector<HTMLElement>(TABBABLE);
    (first ?? card).focus();
  }, [isTop]);

  // Escape (dismissible) + Tab focus trap, only while topmost.
  useEffect(() => {
    if (!isTop) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && dismissible) {
        // A menu open on top of the modal owns Escape — let it close first, and
        // the modal closes on the next Escape. Both listen on document/capture
        // and the modal's listener was registered first, so without this the
        // modal would close out from under the open menu.
        if (getMenu()) return;
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const card = cardRef.current;
      if (!card) return;
      const nodes = focusableIn(card);
      if (nodes.length === 0) {
        e.preventDefault();
        card.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !card.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !card.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [isTop, dismissible, onClose]);

  const cardClass = bare
    ? `silo-modal-bare${className ? ` ${className}` : ""}`
    : `silo-modal silo-modal-${size}${className ? ` ${className}` : ""}`;

  return createPortal(
    <div
      className="silo-modal-backdrop"
      style={{ zIndex: `calc(var(--silo-z-modal-base) + ${z * Z_STEP})` }}
      onMouseDown={dismissible ? onClose : undefined}
    >
      <div
        ref={cardRef}
        className={cardClass}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title != null && <div className="silo-modal-title">{title}</div>}
        {children}
        {/* Close affordance for dismissible modals — last in the DOM so it
            never steals the initial focus from the modal's real first control,
            but visually pinned to the top-right corner. Bare modals own their
            own chrome, so they opt out. */}
        {dismissible && !bare && (
          <button
            type="button"
            className="silo-modal-close"
            aria-label="Close"
            onClick={onClose}
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
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * The right-aligned footer row for a {@link Modal}'s action buttons — a thin
 * `.silo-modal-actions` wrapper so every modal's footer lines up without each
 * caller re-specifying the flex row.
 *
 * @category Consumer Services
 * @public
 */
export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="silo-modal-actions">{children}</div>;
}
