import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  menuButtonClass,
  type MenuButtonSize,
  type MenuButtonVariant,
} from "./menu-button-classes";

export type { MenuButtonSize, MenuButtonVariant };

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
 * import is needed in the extension. `variant="field"` gives it `Input` /
 * `Select` chrome (border, full width, trailing chevron) for use as a value
 * picker in a form, where a rich menu (icons, checks) beats a native `<select>`.
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
 *
 * // as a form field — a value picker inside a `Section`
 * <MenuButton
 *   variant="field"
 *   label={agent?.displayName ?? "Auto-detect"}
 *   onClick={(e) => ctx.ui.showMenu({ anchor: e.currentTarget, items })}
 * >
 *   <AgentIconGlyph icon={agent?.icon} mode="color" colorScheme={scheme} />
 * </MenuButton>
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function MenuButton({
  label,
  size = "normal",
  variant = "bare",
  className,
  type = "button",
  children,
  ...rest
}: {
  /** The visible label — the whole point of reaching for this over `IconButton`. */
  label: ReactNode;
  /** `sm` for compact contexts (card footers, list rows). */
  size?: MenuButtonSize;
  /**
   * `"bare"` (default) is a borderless label + chevron for toolbars and rows;
   * `"field"` wears `Input` / `Select` chrome so it lines up as a form field.
   */
  variant?: MenuButtonVariant;
  /** Optional leading content, e.g. an icon before the label. */
  children?: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  const classes = menuButtonClass(size, variant);
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
