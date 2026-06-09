import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaretRight, Check } from "@phosphor-icons/react";
import type { MenuPlacement } from "../extension-host/menu-controller";
import {
  focusGroupNextIndex,
  type MenuEntry,
  type MenuItem,
} from "@silo-code/sdk";
import { useMenuDismiss, useMenuPlacement } from "./use-menu-dismiss";
import "./Menu.css";

// The one presentational primitive behind every floating menu in the app —
// right-click context menus and button-anchored dropdowns alike. Host chrome
// renders it via `<Menus>` from the menu-controller store; extensions never
// import this (they call `ctx.ui.showMenu`). Styled entirely from the
// `--silo-menu-*` component tokens (theme.css), so a theme re-skins every menu at once.
//
// A row with a `submenu` cascades a nested <Menu> to its side. Submenus render
// in their own portals, so they share the root's `data-silo-menu` id: the root
// alone listens for outside-click/Escape and treats any element carrying that id
// (root + cascaded submenus) as "inside" (see useMenuDismiss).
//
// Keyboard: opening a menu moves focus into it (so a dropdown opened with
// Space/Enter is navigable), and each level self-manages a roving focus —
// Up/Down move between rows, Home/End jump to the ends, Enter/Space runs the
// row, Right opens a submenu (focus follows in), Left steps back out of one.
// Closing restores focus to wherever it was (the anchor button) unless the user
// dismissed by clicking elsewhere. Submenus render in their own portals, so each
// level's key listener is bound to its own DOM node and never double-fires.

export interface MenuProps {
  items: MenuEntry[];
  placement: MenuPlacement;
  /** Run an item and close (host wires this to the controller). */
  onSelect: (item: MenuItem) => void;
  onClose: () => void;
  /**
   * Shared per-tree marker. Omitted on the root (which mints one and owns
   * dismissal); passed down to cascaded submenus so they skip their own
   * dismissal and tag themselves as part of the same tree.
   */
  rootId?: string;
  /** Step back out of this submenu (Left arrow); the root has nowhere to go. */
  onExit?: () => void;
}

function isItem(e: MenuEntry): e is MenuItem {
  return !("type" in e);
}

function hasSubmenu(item: MenuItem): boolean {
  return !!item.submenu && item.submenu.length > 0;
}

// A row can hold keyboard focus when it's an actionable item (not a separator /
// header) and not disabled. Menus navigate as a vertical focus group, so the
// roving index math comes from the SDK's `focusGroupNextIndex` (shared with
// `useFocusGroup`) — the menu just can't use the hook itself, because its
// highlight is state-driven and decoupled from DOM focus (a menu opens
// `visibility: hidden`, and WebKit won't move focus into a hidden node, so keys
// are handled at the document level rather than per item).
const isMenuNavigable = (items: MenuEntry[], i: number): boolean => {
  const e = items[i];
  return isItem(e) && !e.disabled;
};

/** The row a navigation key moves the menu highlight to, or `null` for no move. */
function menuNavIndex(
  items: MenuEntry[],
  from: number | null,
  key: string,
): number | null {
  return focusGroupNextIndex({
    current: from ?? 0,
    count: items.length,
    key,
    orientation: "vertical",
    wrap: true,
    isNavigable: (i) => isMenuNavigable(items, i),
  });
}

export function Menu({
  items,
  placement,
  onSelect,
  onClose,
  rootId,
  onExit,
}: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const isSubmenu = rootId != null;
  const treeId = rootId ?? generatedId;
  // Only the root arms dismissal; it counts any menu in the tree as inside.
  useMenuDismiss(
    ref,
    placement.anchor,
    onClose,
    isSubmenu ? null : `[data-silo-menu="${treeId}"]`,
  );
  const pos = useMenuPlacement(ref, placement);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  // The element focused when this menu opened — restored on close. Captured in a
  // useState initializer (first render, BEFORE our mount focus effect moves focus
  // into the menu) so it's the real opener (e.g. the button), never a menu row.
  const [opener] = useState<HTMLElement | null>(() => {
    const a = document.activeElement;
    return a instanceof HTMLElement ? a : null;
  });
  const itemRefs = useRef<Record<number, HTMLDivElement | null>>({});
  // Read in the key listener without re-binding it on every arrow press.
  const activeIdxRef = useRef<number | null>(null);
  activeIdxRef.current = activeIdx;
  const openIdxRef = useRef<number | null>(null);
  openIdxRef.current = openIdx;

  const focusRow = (i: number) => {
    setActiveIdx(i);
    itemRefs.current[i]?.focus();
  };

  // Move focus into the menu on open: keyboard users land on the first row, and
  // the menu becomes the key target so the rest of this navigation works.
  useEffect(() => {
    const first = menuNavIndex(items, 0, "Home");
    if (first != null) {
      setActiveIdx(first);
      itemRefs.current[first]?.focus();
    } else {
      ref.current?.focus();
    }
    // Mount only: re-running on `items` identity changes would steal focus mid-use.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore focus to the opener (e.g. the anchor button) when the whole tree
  // closes, in the two cases where focus is "ours" to give back: focus is still
  // inside the menu (a selection/Escape close while a row was highlighted but
  // never DOM-focused), OR the close orphaned focus to <body> (the highlighted
  // row WAS focused via the arrows, and unmounting it dropped focus to <body> —
  // the bug this guards against: arrow-then-Escape used to strand focus). We do
  // NOT restore when focus moved to a real element outside the menu — that's a
  // click-outside, and pulling focus back would fight the user. Root only;
  // submenus hand focus back to their parent row via `onExit`.
  useEffect(() => {
    if (isSubmenu || !opener) return;
    return () => {
      const active = document.activeElement;
      const inMenu =
        active instanceof Element && !!active.closest("[data-silo-menu]");
      const orphaned = active === null || active === document.body;
      if (inMenu || orphaned) opener.focus();
    };
  }, [isSubmenu, opener]);

  // Keyboard navigation. Bound on the document in the **capture** phase — the
  // same place `useMenuDismiss` catches Escape — rather than on the menu node,
  // so navigation never depends on exactly where DOM focus landed (a menu opens
  // `visibility: hidden` until placed, and WebKit won't focus a hidden node, so
  // a node-bound listener can miss keys). The highlight is driven by `activeIdx`
  // state, so it moves whether or not `.focus()` took. Each open level installs
  // its own listener but defers to its open submenu (`openIdx != null`), so only
  // the deepest level acts. `preventDefault` on Enter/Space also stops the
  // anchor button from re-firing if focus stayed on it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (openIdxRef.current != null) return; // an open submenu owns the keys
      const cur = activeIdxRef.current;
      const active = cur != null && isItem(items[cur]) ? items[cur] : null;
      const handle = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      switch (e.key) {
        case "ArrowDown":
        case "ArrowUp":
        case "Home":
        case "End": {
          handle();
          const n = menuNavIndex(items, cur, e.key);
          if (n != null) focusRow(n);
          break;
        }
        case "ArrowRight":
          if (active && hasSubmenu(active)) {
            handle();
            setOpenIdx(cur);
          }
          break;
        case "ArrowLeft":
          if (isSubmenu) {
            handle();
            onExit?.();
          }
          break;
        case "Enter":
        case " ":
          if (active) {
            handle();
            if (hasSubmenu(active)) setOpenIdx(cur);
            else onSelect(active);
          }
          break;
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, isSubmenu, onExit, onSelect]);

  return createPortal(
    <div
      ref={ref}
      className="silo-menu"
      role="menu"
      tabIndex={-1}
      data-silo-menu={treeId}
      style={{
        left: pos.x,
        top: pos.y,
        visibility: pos.visible ? "visible" : "hidden",
      }}
    >
      {items.map((entry, i) => {
        if (!isItem(entry)) {
          return entry.type === "separator" ? (
            <div key={i} className="silo-menu-separator" role="separator" />
          ) : (
            <div key={i} className="silo-menu-header">
              {entry.label}
            </div>
          );
        }
        const item = entry;
        const sub = hasSubmenu(item);
        const open = sub && openIdx === i;
        return (
          <div
            key={i}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            className={`silo-menu-item${item.disabled ? " disabled" : ""}${
              item.danger ? " danger" : ""
            }${open ? " open" : ""}${activeIdx === i ? " active" : ""}`}
            role={sub ? "menuitem" : "menuitemcheckbox"}
            tabIndex={!item.disabled && activeIdx === i ? 0 : -1}
            aria-haspopup={sub || undefined}
            aria-expanded={sub ? open : undefined}
            aria-checked={sub ? undefined : (item.checked ?? false)}
            aria-disabled={item.disabled ?? false}
            title={item.title}
            // Hovering a row highlights it (keeping keyboard + pointer on the
            // same row) and opens its submenu, so moving across the menu tracks
            // the pointer like a native menu.
            onMouseEnter={() => {
              if (item.disabled) return;
              setActiveIdx(i);
              setOpenIdx(sub ? i : null);
            }}
            // mousedown + preventDefault: act before focus moves out of the
            // editor/terminal, and don't steal selection.
            onMouseDown={(e) => {
              e.preventDefault();
              if (item.disabled) return;
              if (sub) setOpenIdx(i);
              else onSelect(item);
            }}
          >
            <span className="silo-menu-check" aria-hidden="true">
              {item.checked && <Check size={13} weight="bold" />}
            </span>
            {item.icon && (
              <span className="silo-menu-icon" aria-hidden="true">
                {item.icon}
              </span>
            )}
            <span className="silo-menu-label">{item.label}</span>
            {item.accelerator && (
              <span className="silo-menu-accel">{item.accelerator}</span>
            )}
            {sub && (
              <span className="silo-menu-caret" aria-hidden="true">
                <CaretRight size={12} weight="bold" />
              </span>
            )}
            {item.trailing && (
              <button
                type="button"
                className="silo-menu-trailing"
                title={item.trailing.title}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  item.trailing?.onClick();
                }}
              >
                {item.trailing.icon}
              </button>
            )}
            {open && (
              <Menu
                items={item.submenu!}
                placement={{ anchor: itemRefs.current[i], side: "right" }}
                onSelect={onSelect}
                onClose={onClose}
                rootId={treeId}
                onExit={() => {
                  setOpenIdx(null);
                  focusRow(i);
                }}
              />
            )}
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
