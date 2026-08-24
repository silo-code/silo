import type { ButtonHTMLAttributes, ReactNode } from "react";
import { menuButtonClass, type MenuButtonSize } from "./menu-button-classes";

export type { MenuButtonSize };

/**
 * A **labelled** button that opens a menu — the counterpart to
 * {@link IconButton} for the cases where a bare `⋮` doesn't tell anyone what
 * they'd get. Renders its label with a trailing chevron, the standard signal
 * that pressing it reveals more rather than performing something.
 *
 * Reach for this over `IconButton` whenever the menu is a place a user is
 * *meant* to go rather than an escape hatch: a `⋮` is discoverable only by the
 * people who already know to look. Keep `IconButton` for dense rows and
 * toolbars where a label won't fit.
 *
 * It is the trigger only — it does not own the menu. Open one from `onClick`
 * with {@link UiService.showMenu}, anchoring to `e.currentTarget` so the menu
 * lines up under the button.
 *
 * Styled purely via host-provided `.silo-menu-button*` classes — no stylesheet
 * import is needed in the extension.
 *
 * @example
 * ```tsx
 * <MenuButton
 *   label="More"
 *   onClick={(e) =>
 *     ctx.ui.showMenu({
 *       items: [
 *         { id: "disable", label: "Disable", run: disable },
 *         { id: "uninstall", label: "Uninstall", run: uninstall },
 *       ],
 *       at: e.currentTarget,
 *     })
 *   }
 * />
 *
 * // compact — e.g. in a card footer or a ListRow's trailing slot
 * <MenuButton size="sm" label="More" onClick={openMenu} />
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function MenuButton({
  label,
  size = "normal",
  className,
  type = "button",
  children,
  ...rest
}: {
  /** The visible label — the whole point of reaching for this over `IconButton`. */
  label: ReactNode;
  /** `sm` for compact contexts (card footers, list rows). */
  size?: MenuButtonSize;
  /** Optional leading content, e.g. an icon before the label. */
  children?: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  const classes = menuButtonClass(size);
  return (
    <button
      type={type}
      className={className ? `${classes} ${className}` : classes}
      // The chevron is decorative — the label already names the control, and
      // announcing "down arrow" after it would be noise.
      aria-haspopup="menu"
      {...rest}
    >
      {children}
      <span className="silo-menu-button-label">{label}</span>
      <svg
        className="silo-menu-button-chevron"
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <path
          d="M4 6l4 4 4-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
