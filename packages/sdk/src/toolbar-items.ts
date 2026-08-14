import type { ContextKeys } from "./context-keys";
import type { PhosphorIconName } from "./phosphor-icon";
import type { MenuEntry } from "./ui-service";

/**
 * Built-in surfaces that accept {@link ToolbarItemContribution}s. One surface
 * per registration.
 *
 * `"editor"` and `"terminal"` are CenterDock breadcrumb toolbars; `"navigator"`
 * is the header naming the Navigator's active view — the bar between its view
 * list and the view body — where contributions become that view's action
 * buttons. A navigator item's `when` receives the active
 * {@link NavigatorView | view}'s id, so an action can be scoped to one view or
 * left unscoped to follow the user across all of them.
 *
 * @category Registration
 * @public
 */
export type ToolbarSurface = "editor" | "terminal" | "navigator";

/**
 * The typed target each {@link ToolbarSurface} passes to an invoked command
 * and to `when` / `checked` / {@link ToolbarMenuItemContribution.menu} builders.
 *
 * @category Registration
 * @public
 */
export interface ToolbarItemContext {
  editor: { editorId: string };
  terminal: { terminalId: string };
  navigator: { viewId: string };
}

/**
 * Shared fields for interactive toolbar contributions. Render chrome is driven
 * by {@link ToolbarItemFields.icon | icon} + {@link ToolbarItemFields.title | title}:
 *
 * | icon | title | Control        |
 * | ---- | ----- | -------------- |
 * | ✓    | —     | icon-only      |
 * | —    | ✓     | text-only      |
 * | ✓    | ✓     | icon + text    |
 *
 * Icons are Phosphor export names ({@link PhosphorIconName}); the host
 * resolves and paints them bold at 1em so they match local-web-viewer and
 * track UI zoom. Pass a React node is no longer supported — use the name.
 *
 * @category Registration
 * @public
 */
export interface ToolbarItemFields<S extends ToolbarSurface = ToolbarSurface> {
  /** Unique id for this contribution. */
  id: string;
  /** Which toolbar to contribute to. */
  surface: S;
  /**
   * Leading glyph as a {@link PhosphorIconName} (e.g. `"Flag"`). Omit for a
   * text-only control (requires {@link ToolbarItemFields.title | title}).
   */
  icon?: PhosphorIconName;
  /**
   * Visible label painted in the control. Omit for icon-only. When both
   * `icon` and `title` are set, the host renders icon + text.
   */
  title?: string;
  /** Hover tooltip (falls back to title / label / command label). */
  tooltip?: string;
  /**
   * Accessible name (falls back to title / the command's label). Always used
   * for `aria-label`; not painted unless {@link ToolbarItemFields.title | title}
   * is also set.
   */
  label?: string;
  /** Ordering within the trailing cluster; lower sorts first. */
  order?: number;
  /**
   * Visibility predicate. Returning false hides the item for this target.
   */
  when?: (ctx: ContextKeys, target: ToolbarItemContext[S]) => boolean;
  /**
   * Toggle-state predicate for command items. When provided, the host renders
   * the control in a pressed/checked visual state whenever this returns true.
   * Menu items put checks on individual {@link MenuEntry} rows instead.
   */
  checked?: (ctx: ContextKeys, target: ToolbarItemContext[S]) => boolean;
}

/**
 * Command-backed toolbar control — click runs {@link ToolbarCommandItemContribution.command}.
 *
 * @category Registration
 * @public
 */
export interface ToolbarCommandItemContribution<
  S extends ToolbarSurface = ToolbarSurface,
> extends ToolbarItemFields<S> {
  /** The command to run; receives {@link ToolbarItemContext}[S] as its first arg. */
  command: string;
  menu?: undefined;
  type?: undefined;
}

/**
 * Menu-backed toolbar control — click opens a host dropdown via
 * {@link UiService.showMenu} with entries from
 * {@link ToolbarMenuItemContribution.menu}.
 *
 * @category Registration
 * @public
 */
export interface ToolbarMenuItemContribution<
  S extends ToolbarSurface = ToolbarSurface,
> extends ToolbarItemFields<S> {
  /**
   * Build the dropdown for this target. May be sync or async. The host
   * anchors the menu on the toolbar control (`align: "end"`, toggle on).
   */
  menu: (target: ToolbarItemContext[S]) => MenuEntry[] | Promise<MenuEntry[]>;
  command?: undefined;
  type?: undefined;
}

/**
 * Shared placement fields for non-interactive toolbar chrome
 * ({@link ToolbarSeparatorContribution} / {@link ToolbarSpacerContribution}).
 *
 * @category Registration
 * @public
 */
export interface ToolbarChromeFields<
  S extends ToolbarSurface = ToolbarSurface,
> {
  id: string;
  surface: S;
  order?: number;
  when?: (ctx: ContextKeys, target: ToolbarItemContext[S]) => boolean;
}

/**
 * A light vertical rule between toolbar controls. Softer than the Text |
 * Preview pipe — host paints it with a low-opacity mix of toolbar text, not
 * `--silo-color-toolbar-text-disabled`.
 *
 * @category Registration
 * @public
 */
export interface ToolbarSeparatorContribution<
  S extends ToolbarSurface = ToolbarSurface,
> extends ToolbarChromeFields<S> {
  type: "separator";
}

/**
 * Gap size for {@link ToolbarSpacerContribution}. Maps to em of the toolbar
 * font (`sm` 0.25em / `md` 0.5em / `lg` 0.75em).
 *
 * @category Registration
 * @public
 */
export type ToolbarSpacerSize = "sm" | "md" | "lg";

/**
 * An empty gap between toolbar controls (no rule). Use to group without a
 * hard split; prefer {@link ToolbarSeparatorContribution} when a hairline helps.
 *
 * @category Registration
 * @public
 */
export interface ToolbarSpacerContribution<
  S extends ToolbarSurface = ToolbarSurface,
> extends ToolbarChromeFields<S> {
  type: "spacer";
  /** Default `"md"`. */
  size?: ToolbarSpacerSize;
}

/**
 * Adds a control or chrome element to the trailing cluster of a built-in
 * editor or terminal toolbar. Register via
 * {@link ExtensionContext.registerToolbarItem}.
 *
 * Interactive items set exactly one of
 * {@link ToolbarCommandItemContribution.command | command} or
 * {@link ToolbarMenuItemContribution.menu | menu}. Separators and spacers use
 * `type: "separator" | "spacer"`.
 *
 * Contributions are independent of context-menu items — an extension may
 * register either, both, or neither. Hosts only render items while that
 * surface's breadcrumbs setting is on.
 *
 * @category Registration
 * @public
 */
export type ToolbarItemContribution<S extends ToolbarSurface = ToolbarSurface> =
  | ToolbarCommandItemContribution<S>
  | ToolbarMenuItemContribution<S>
  | ToolbarSeparatorContribution<S>
  | ToolbarSpacerContribution<S>;
