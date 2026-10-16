import type { ContextKeys } from "./context-keys";
import type { PhosphorIconName } from "./phosphor-icon";
import type { MenuEntry } from "./ui-service";

/**
 * Built-in surfaces that accept {@link ToolbarItemContribution}s. One surface
 * per registration.
 *
 * `"editor"` is the editor breadcrumb toolbar (beside the Text | Preview view
 * switcher). `"navigator"` is the header naming the Navigator's active view —
 * the bar between its view list and the view body — where contributions become
 * that view's action buttons; a navigator item's `when` receives the active
 * {@link NavigatorView | view}'s id, so an action can be scoped to one view or
 * left unscoped to follow the user across all of them.
 *
 * `"panel"` is the host-drawn strip above any {@link DockPanelKind} that
 * declares `toolbar` (RFC 0039) — including the built-in **terminal**. Its
 * target carries the panel instance id, its `kindId`, its `workspaceId`, and
 * the panel's own `params`, so an item meant for one kind of panel scopes
 * itself with
 * `when: (_keys, t) => t.kindId === "terminal"` and reads instance data off
 * `t.params` (e.g. `t.params.terminalId`). Without a `kindId` guard a
 * `"panel"` item shows on every panel that has a strip.
 *
 * @category Registration
 * @public
 */
export type ToolbarSurface = "editor" | "navigator" | "panel";

/**
 * The typed target each {@link ToolbarSurface} passes to an invoked command
 * and to `when` / `checked` / {@link ToolbarMenuItemContribution.menu} builders.
 *
 * @category Registration
 * @public
 */
export interface ToolbarItemContext {
  editor: { editorId: string };
  navigator: { viewId: string };
  /**
   * `panelId` and `kindId` identify the panel; `workspaceId` is the workspace
   * whose dock the panel lives in (each workspace has its own dock, and the
   * host knows which at the time it draws the strip); `params` is the panel's
   * own serialized parameters (`DockPanelProps["params"]`) — read-only, so an
   * item can key on instance data (e.g. the terminal's `params.terminalId`) or
   * act on the owning workspace without a lookup the SDK does not offer.
   */
  panel: {
    panelId: string;
    kindId: string;
    workspaceId: string;
    params: Readonly<Record<string, unknown>>;
    /**
     * This panel's {@link DockPanelRecord.id} — the same id {@link
     * Workspace.panels} enumerates. `undefined` for a panel kind that isn't
     * `persistence: "recorded"` (no record exists to name).
     */
    recordId?: string;
  };
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
 * The dropdown half of a {@link ToolbarCommandItemContribution} that sets
 * {@link ToolbarCommandItemContribution.dropdown | dropdown} — the caret the
 * host welds onto the right edge of the command control.
 *
 * It carries its own {@link ToolbarItemDropdown.label | label} and
 * {@link ToolbarItemDropdown.tooltip | tooltip} because the two halves answer
 * different questions: the action half names what clicking *does* ("Mark as
 * follow-up: Bug"), the caret names what opening it *offers* ("Follow-up
 * options"). Visibility is not its own concern — the whole control appears or
 * hides together via {@link ToolbarItemFields.when | when}.
 *
 * @category Registration
 * @public
 */
export interface ToolbarItemDropdown<
  S extends ToolbarSurface = ToolbarSurface,
> {
  /**
   * Build the dropdown for this target. May be sync or async. The host
   * anchors the menu on the caret half (`align: "end"`, toggle on) — the same
   * chrome a {@link ToolbarMenuItemContribution} gets.
   */
  menu: (target: ToolbarItemContext[S]) => MenuEntry[] | Promise<MenuEntry[]>;
  /**
   * Accessible name for the caret half. Falls back to the item's
   * {@link ToolbarItemFields.label | label} suffixed with "options".
   */
  label?: string;
  /** Hover tooltip for the caret half. Falls back to `label`. */
  tooltip?: string;
}

/**
 * Command-backed toolbar control — click runs {@link ToolbarCommandItemContribution.command}.
 *
 * Adding {@link ToolbarCommandItemContribution.dropdown | dropdown} turns it
 * into a **split control**: one welded unit whose left half runs the command
 * and whose right half opens a menu. Reach for that when a toolbar has a
 * single obvious default action plus variations on it — "mark with the default
 * label" next to "mark with…" — rather than registering two adjacent items,
 * which the host is free to separate, reorder, or collapse chrome between.
 *
 * @category Registration
 * @public
 */
export interface ToolbarCommandItemContribution<
  S extends ToolbarSurface = ToolbarSurface,
> extends ToolbarItemFields<S> {
  /** The command to run; receives {@link ToolbarItemContext}[S] as its first arg. */
  command: string;
  /**
   * Optional dropdown half, welded to the command half as one split control.
   * Omit for a plain command button.
   *
   * {@link ToolbarItemFields.checked | checked} still describes the *command* —
   * but the host tints the whole control, caret included, so a marked split
   * control reads as one pressed thing rather than a pressed button beside an
   * unpressed caret.
   */
  dropdown?: ToolbarItemDropdown<S>;
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
  /**
   * A menu-only control is already all dropdown — there is no action half to
   * weld one onto. Use {@link ToolbarCommandItemContribution.dropdown} for a
   * split control.
   */
  dropdown?: undefined;
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
 * Adds a control or chrome element to the trailing cluster of a host-drawn
 * toolbar — the editor breadcrumb, the Navigator header, or a dock panel's
 * strip (the terminal included; see {@link ToolbarSurface}). Register via
 * {@link ExtensionContext.registerToolbarItem}.
 *
 * Interactive items set exactly one of
 * {@link ToolbarCommandItemContribution.command | command} or
 * {@link ToolbarMenuItemContribution.menu | menu}; a command item may also set
 * {@link ToolbarCommandItemContribution.dropdown | dropdown} to become a split
 * control. Separators and spacers use `type: "separator" | "spacer"`.
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
