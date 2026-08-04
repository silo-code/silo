import type { ReactNode } from "react";
import type { Activity } from "./activity";
import type { PhosphorIconName } from "./phosphor-icon";
import type { Disposable } from "./types";

/**
 * Semantic color for a CenterDock tab trailing {@link TabIndicatorAdornment}
 * (and optional chip background).
 *
 * @category Consumer Services
 * @public
 */
export type TabAdornmentColor = "accent" | "warn" | "ok" | "error" | "muted";

/**
 * Leading identity adornment on a CenterDock tab — arbitrary React artwork
 * (e.g. an app logo). Set via {@link EditorService.setIcon} /
 * {@link TerminalService.setIcon}.
 *
 * @category Consumer Services
 * @public
 */
export interface TabIconAdornment {
  /** Extension-owned key; stacking + {@link EditorService.clearIcon} target. */
  id: string;
  /** Leading glyph / logo rendered before the tab title. */
  icon: ReactNode;
}

/**
 * Soft tinted highlight across the entire CenterDock tab (icon, title, and
 * every other adornment) — not just the label. Contributing one (via `set`
 * or a `bind` that returns non-`null`) is itself the on/off signal; there's
 * no separate boolean. At most one applies per tab — if multiple extensions
 * contribute one for the same target, the first found wins.
 *
 * Set via {@link EditorService.setHighlight} / {@link TerminalService.setHighlight}.
 *
 * @category Consumer Services
 * @public
 */
export interface TabHighlightAdornment {
  /** Extension-owned key; clear target. */
  id: string;
  /** Semantic color for the highlight fill. Defaults to `"accent"`. */
  color?: TabAdornmentColor;
}

/**
 * Trailing status adornment on a CenterDock tab — static Phosphor glyph.
 * For busy/ready/warn/error chrome use {@link TabActivityAdornment} instead
 * (ADR 0030).
 *
 * Set via {@link EditorService.setIndicator} /
 * {@link TerminalService.setIndicator}.
 *
 * @category Consumer Services
 * @public
 */
export interface TabIndicatorAdornment {
  /** Extension-owned key; stacking + clear target. */
  id: string;
  /**
   * Glyph as a {@link PhosphorIconName} (e.g. `"Flag"`). The host resolves
   * and paints it at 1em in regular weight by default. Set
   * {@link TabIndicatorAdornment.filled | filled} for Phosphor fill weight;
   * {@link TabIndicatorAdornment.color | color} tints the glyph; set
   * {@link TabIndicatorAdornment.chip | chip} for a soft tinted background.
   */
  icon: PhosphorIconName;
  /** Tooltip shown when hovering the indicator. */
  tooltip?: string;
  /** Semantic color for the glyph (and chip fill). */
  color?: TabAdornmentColor;
  /**
   * When true, paint a soft tinted chip behind the icon. Default is
   * glyph-only — no background.
   */
  chip?: boolean;
  /**
   * When true, paint the glyph with Phosphor `weight="fill"`. Default is
   * regular weight (outline).
   */
  filled?: boolean;
}

/**
 * Host-owned {@link Activity} on a CenterDock tab. Extensions pick the kind
 * (+ optional tooltip); never an icon or color (ADR 0030).
 *
 * @category Consumer Services
 * @public
 */
export interface TabActivityAdornment {
  /** Extension-owned key; stacking + clear target. */
  id: string;
  activity: Activity;
  tooltip?: string;
}

/**
 * Payload for {@link EditorService.flashIndicator} /
 * {@link TerminalService.flashIndicator} — timed one-shot; no stable `id`
 * (auto-cleared after `durationMs`).
 *
 * @category Consumer Services
 * @public
 */
export type TabIndicatorFlash = TabIndicatorContribution & {
  /** How long to show the flash. Defaults to host choice (typically ~800ms). */
  durationMs?: number;
};

/**
 * Payload for {@link EditorService.flashActivity} /
 * {@link TerminalService.flashActivity}.
 *
 * @category Consumer Services
 * @public
 */
export type TabActivityFlash = TabActivityContribution & {
  durationMs?: number;
};

/**
 * Fields contributed by a {@link TabIconBinder.provide} call (the binder’s
 * own `id` is applied by the host).
 *
 * @category Consumer Services
 * @public
 */
export type TabIconContribution = Omit<TabIconAdornment, "id">;

/**
 * Fields contributed by a {@link TabHighlightBinder.provide} call.
 *
 * @category Consumer Services
 * @public
 */
export type TabHighlightContribution = Omit<TabHighlightAdornment, "id">;

/**
 * Fields contributed by a {@link TabIndicatorBinder.provide} call.
 *
 * @category Consumer Services
 * @public
 */
export type TabIndicatorContribution = Omit<TabIndicatorAdornment, "id">;

/**
 * Fields contributed by a {@link TabActivityBinder.provide} call.
 *
 * @category Consumer Services
 * @public
 */
export type TabActivityContribution = Omit<TabActivityAdornment, "id">;

/**
 * Keep a leading-icon projection in sync for every editor/terminal tab.
 * Prefer over repeatedly calling {@link EditorService.setIcon}.
 *
 * @category Consumer Services
 * @public
 */
export interface TabIconBinder {
  /** Extension-owned key — conventionally `"<extension-id>.tab-icon"`. */
  id: string;
  /**
   * Called synchronously per tab during render. Return `null` to contribute
   * nothing for this target id (editor id or terminal session id).
   */
  provide(targetId: string): TabIconContribution | null;
}

/**
 * Keep a whole-tab highlight projection in sync for every editor/terminal
 * tab.
 *
 * @category Consumer Services
 * @public
 */
export interface TabHighlightBinder {
  /** Extension-owned key — conventionally `"<extension-id>.tab-highlight"`. */
  id: string;
  /**
   * Called synchronously per tab during render. Return `null` to contribute
   * no highlight for this target id.
   */
  provide(targetId: string): TabHighlightContribution | null;
}

/**
 * Keep a trailing-indicator projection in sync for every editor/terminal tab.
 *
 * @category Consumer Services
 * @public
 */
export interface TabIndicatorBinder {
  /** Extension-owned key — conventionally `"<extension-id>.tab-indicator"`. */
  id: string;
  /**
   * Called synchronously per tab during render. Return `null` to contribute
   * nothing for this target id.
   */
  provide(targetId: string): TabIndicatorContribution | null;
}

/**
 * Keep a trailing-activity projection in sync for every editor/terminal tab.
 *
 * @category Consumer Services
 * @public
 */
export interface TabActivityBinder {
  /** Extension-owned key — conventionally `"<extension-id>.tab-activity"`. */
  id: string;
  provide(targetId: string): TabActivityContribution | null;
}

/**
 * Shared adorn verbs for CenterDock editor and terminal tabs. Implemented by
 * {@link EditorService} and {@link TerminalService} (target id is the editor
 * or terminal session id respectively).
 *
 * @category Consumer Services
 * @public
 */
export interface TabAdornmentMethods {
  setIcon(targetId: string, adornment: TabIconAdornment): void;
  clearIcon(targetId: string, adornmentId: string): void;
  bindIcon(binder: TabIconBinder): Disposable;

  setHighlight(targetId: string, adornment: TabHighlightAdornment): void;
  clearHighlight(targetId: string, adornmentId: string): void;
  bindHighlight(binder: TabHighlightBinder): Disposable;

  setIndicator(targetId: string, adornment: TabIndicatorAdornment): void;
  clearIndicator(targetId: string, adornmentId: string): void;
  flashIndicator(targetId: string, flash: TabIndicatorFlash): void;
  bindIndicator(binder: TabIndicatorBinder): Disposable;

  setActivity(targetId: string, adornment: TabActivityAdornment): void;
  clearActivity(targetId: string, adornmentId: string): void;
  flashActivity(targetId: string, flash: TabActivityFlash): void;
  bindActivity(binder: TabActivityBinder): Disposable;

  /** All leading icons for `targetId`, in set/bind order. */
  getIcons(targetId: string): TabIconAdornment[];
  /**
   * The whole-tab highlight for `targetId`, or `null` if none. At most one
   * applies — first found across `set`/`bind` order.
   */
  getHighlight(targetId: string): TabHighlightAdornment | null;
  /** All trailing indicators for `targetId`, in set/bind/flash order. */
  getIndicators(targetId: string): TabIndicatorAdornment[];
  /** All trailing activities for `targetId`, in set/bind/flash order. */
  getActivities(targetId: string): TabActivityAdornment[];
  /** Signal that binder data changed — re-query `provide` and re-render. */
  invalidateTabAdornments(): void;
  subscribeTabAdornments(listener: () => void): Disposable;
}
