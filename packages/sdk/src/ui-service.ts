import type { ReactNode } from "react";
import type { Disposable } from "./types";

// `ctx.ui` — the user-interaction domain (public contract). The host renders the
// chrome; extensions ask. Native OS dialogs, toast notifications, themed menus,
// and host-owned confirm/prompt modals. The implementation lives in the host.

/**
 * A file-type filter for the native open/save dialogs ({@link UiService.pickFile},
 * {@link UiService.savePath}) — a human-readable group plus the extensions it
 * matches. Mirrors the OS dialog's file-type dropdown.
 *
 * @category Core Types
 * @public
 */
export interface FileFilter {
  /** Human-readable label for the group, e.g. `"JSON"` or `"Images"`. */
  name: string;
  /** Extensions this group matches, **without** the leading dot, e.g. `["json"]`. */
  extensions: string[];
}

/**
 * A secondary control rendered at the trailing edge of a {@link MenuItem} —
 * e.g. a delete button on a row whose primary click does something else
 * (reopen). Its click is isolated: it runs `onClick` and does **not** trigger
 * the row's {@link MenuItem.run}.
 *
 * @category Registration
 * @public
 */
export interface MenuItemTrailing {
  /** The control's glyph (e.g. a Phosphor icon element). */
  icon: ReactNode;
  /** Native tooltip for the control. */
  title?: string;
  /** Invoked when the control is clicked; the menu closes first. */
  onClick: () => void;
}

/**
 * One actionable row in a menu shown by {@link UiService.showMenu}. The host
 * renders and themes the chrome; the extension supplies the data and an action.
 *
 * @category Registration
 * @public
 */
export interface MenuItem {
  /** The row's text. */
  label: string;
  /**
   * A pre-formatted shortcut hint shown right-aligned, e.g. `"⌘C"` or
   * `"Ctrl+C"`. Display only — it does not bind the key. Format it for the
   * platform yourself.
   */
  accelerator?: string;
  /** Leading glyph (e.g. a Phosphor icon element). */
  icon?: ReactNode;
  /** Show a check in the leading gutter — for toggle / current-selection rows. */
  checked?: boolean;
  /** Render the row dimmed and inert. */
  disabled?: boolean;
  /** Style the row as destructive (e.g. Delete). */
  danger?: boolean;
  /** Native tooltip for the row. */
  title?: string;
  /** A secondary trailing control (see {@link MenuItemTrailing}). */
  trailing?: MenuItemTrailing;
  /**
   * A nested menu that cascades open to the side when this row is hovered or
   * clicked. A row with a `submenu` is a *parent*: it shows a trailing caret and
   * opening it reveals these {@link MenuEntry | entries} rather than running an
   * action. Give a row a `submenu` **or** a {@link MenuItem.run | run}, not both
   * (a `run` is ignored while the submenu is the active target).
   */
  submenu?: MenuEntry[];
  /**
   * Invoked when the row is chosen; the menu closes first. Optional only for
   * submenu parents (rows with a {@link MenuItem.submenu | submenu}); every leaf
   * row must supply one.
   */
  run?: () => void | Promise<void>;
}

/**
 * Options for {@link UiService.confirm} — a host-rendered yes/no dialog. Always
 * dismissible (`Escape` and backdrop-click both resolve to `false`, the safe
 * choice). Set {@link ConfirmOptions.danger | danger} for destructive actions.
 *
 * @category Core Types
 * @public
 */
export interface ConfirmOptions {
  /** The dialog's heading. */
  title: string;
  /** Optional explanatory line beneath the title. */
  body?: string;
  /** Label for the confirm button. Default `"OK"`. */
  confirmLabel?: string;
  /** Label for the cancel button. Default `"Cancel"`. */
  cancelLabel?: string;
  /** Style the confirm button as destructive (`.silo-button-danger`). */
  danger?: boolean;
}

/**
 * Options for {@link UiService.prompt} — a host-rendered single-line text input
 * dialog. Always dismissible (`Escape` and backdrop-click both resolve to
 * `null`, i.e. cancelled).
 *
 * @category Core Types
 * @public
 */
export interface PromptOptions {
  /** The dialog's heading. */
  title: string;
  /** Optional label shown above the input. */
  label?: string;
  /** Pre-fills the input (and is selected for easy replacement). */
  initialValue?: string;
  /** Placeholder shown when the input is empty. */
  placeholder?: string;
  /** Label for the confirm button. Default `"OK"`. */
  confirmLabel?: string;
  /** Label for the cancel button. Default `"Cancel"`. */
  cancelLabel?: string;
}

/**
 * One action button rendered in a toast — see {@link NotifyOptions.actions}.
 * The host themes the button; the extension supplies the label and what to do.
 *
 * @category Core Types
 * @public
 */
export interface NotifyAction {
  /** The button's text. */
  label: string;
  /**
   * Invoked when the button is clicked. The toast then dismisses unless
   * {@link NotifyAction.keepOpen} is set — so a "View details" action that opens
   * a modal can close the toast behind it.
   */
  run: () => void | Promise<void>;
  /** Keep the toast open after {@link NotifyAction.run} (default: dismiss it). */
  keepOpen?: boolean;
}

/**
 * Options for {@link UiService.notify} — an optional title, action buttons, and
 * auto-dismiss control layered on top of the toast's `level` + `message`.
 *
 * @category Core Types
 * @public
 */
export interface NotifyOptions {
  /** A short bold heading rendered above the `message`. */
  title?: string;
  /** Action buttons rendered in the toast's footer (see {@link NotifyAction}). */
  actions?: NotifyAction[];
  /**
   * Auto-dismiss delay in milliseconds. Omit for the default behavior: `error`
   * toasts and any toast with {@link NotifyOptions.actions | actions} stay until
   * the user dismisses them, while `info` / `warn` auto-dismiss after ~4s. Pass
   * `0` to force "stay until dismissed"; a positive number sets an explicit delay.
   */
  durationMs?: number;
}

/**
 * Options for {@link UiService.showModal} — the host-owned chrome around your
 * custom modal content. The host owns the backdrop, z-order (stacking above all
 * host chrome, arbitrated centrally), focus trap, and restore-focus-on-close;
 * you supply the content and these presentation options.
 *
 * Unlike {@link ConfirmOptions} / {@link PromptOptions}, a `showModal` dialog is
 * **not dismissible by default** — set {@link ModalOptions.dismissible} to wire
 * `Escape` + backdrop-click to close (guarding staged edits otherwise).
 *
 * @category Core Types
 * @public
 */
export interface ModalOptions {
  /** Optional header rendered at the top of the card; omit for bare layouts. */
  title?: ReactNode;
  /**
   * Allow `Escape` and backdrop-click to close the modal (resolving the
   * {@link UiService.showModal} promise with `undefined`). Defaults to
   * **`false`** — the modal stays open until your content calls `close`,
   * guarding against accidental loss of staged edits.
   */
  dismissible?: boolean;
  /** Width preset for the card. Default `"md"`. Ignored when `bare`. */
  size?: "sm" | "md" | "lg";
  /**
   * Skip the card chrome — your content *is* the card (it supplies its own
   * background/size). The host still owns the backdrop, stacking, and focus
   * trap. Used by full-bleed layouts.
   */
  bare?: boolean;
  /** Extra class on the card, for special-case layouts. */
  className?: string;
  /** Accessible name for dialogs without a visible {@link ModalOptions.title}. */
  ariaLabel?: string;
}

/**
 * A horizontal rule between groups of menu items.
 *
 * @category Registration
 * @public
 */
export interface MenuSeparator {
  type: "separator";
}

/**
 * A non-interactive group label within a menu.
 *
 * @category Registration
 * @public
 */
export interface MenuHeader {
  type: "header";
  /** The label text (rendered uppercase). */
  label: string;
}

/**
 * One entry in a menu — an actionable {@link MenuItem}, a {@link MenuSeparator},
 * or a {@link MenuHeader}.
 *
 * @category Registration
 * @public
 */
export type MenuEntry = MenuItem | MenuSeparator | MenuHeader;

/**
 * Options for {@link UiService.showMenu}. Position resolves in the order
 * `anchor` → `at` → the current cursor (so `showMenu({ items })` with no
 * position opens at the mouse, which is what a right-click handler wants).
 *
 * @category Registration
 * @public
 */
export interface ShowMenuOptions {
  /** The rows to show, top to bottom. */
  items: MenuEntry[];
  /** Explicit viewport point — e.g. a right-click's `clientX`/`clientY`. */
  at?: { x: number; y: number };
  /** Anchor element to hang the menu off (for a button dropdown). */
  anchor?: HTMLElement | null;
  /** Align the menu to the anchor's left (`"start"`, default) or right (`"end"`). */
  align?: "start" | "end";
  /**
   * Toggle an anchored dropdown. When `true` (the default), calling `showMenu`
   * again with the **same `anchor`** while that menu is still open closes it
   * instead of reopening — so a second click on the button dismisses its
   * dropdown. Set `false` to keep the legacy always-(re)open behaviour. Has no
   * effect without an `anchor` (cursor / `at` menus always open).
   */
  toggle?: boolean;
}

/**
 * The user-interaction domain, exposed as {@link ExtensionContext.ui}. The host
 * renders the chrome; an extension only asks. Interactions today:
 *
 * - **Native OS dialogs** — {@link UiService.pickFolder | pickFolder},
 *   {@link UiService.pickFile | pickFile}, {@link UiService.savePath | savePath}.
 *   Thin wrappers over the platform dialogs the host owns; each resolves to an
 *   absolute path or `null` when the user cancels.
 * - **Notifications** — {@link UiService.notify | notify} shows a transient
 *   toast, optionally with a title and action buttons (see {@link NotifyOptions}).
 *   The only way an extension can proactively message the user.
 * - **Menus** — {@link UiService.showMenu | showMenu} pops a context menu or
 *   button dropdown, themed to match the rest of the app.
 * - **Modal dialogs** — {@link UiService.confirm | confirm} and
 *   {@link UiService.prompt | prompt} pop a host-owned modal and resolve on the
 *   user's choice; {@link UiService.showModal | showModal} pops one around your
 *   own custom content (a form or bespoke layout).
 * - **External links** — {@link UiService.openExternal | openExternal} hands a
 *   URL to the OS (browser / mail client), the host's gateway to the world
 *   outside the app.
 *
 * Mirrors VS Code's `window.show*`. More host-rendered chrome (quick-pick,
 * progress) is planned — see the roadmap.
 *
 * @category Consumer Services
 * @public
 */
export interface UiService {
  /**
   * Show the native folder picker. Resolves to the chosen absolute path, or
   * `null` if the user cancelled.
   *
   * @param opts.defaultPath - Absolute path to open the dialog at.
   */
  pickFolder(opts?: { defaultPath?: string }): Promise<string | null>;
  /**
   * Show the native open-file picker (single selection). Resolves to the chosen
   * absolute path, or `null` if the user cancelled.
   *
   * @param opts.defaultPath - Absolute path to open the dialog at.
   * @param opts.filters - Restrict the selectable file types (see {@link FileFilter}).
   */
  pickFile(opts?: {
    defaultPath?: string;
    filters?: FileFilter[];
  }): Promise<string | null>;
  /**
   * Show the native save dialog. Resolves to the chosen destination's absolute
   * path, or `null` if the user cancelled.
   *
   * @param opts.defaultPath - Seeds the dialog's location and suggested filename.
   * @param opts.filters - Restrict the file-type dropdown (see {@link FileFilter}).
   */
  savePath(opts?: {
    defaultPath?: string;
    filters?: FileFilter[];
  }): Promise<string | null>;
  /**
   * Show a transient toast notification to the user. Fire-and-forget — the host
   * renders it (and, for `info` / `warn` without actions, auto-dismisses it).
   * `level` drives the icon and accent.
   *
   * Pass {@link NotifyOptions} for a bold `title`, footer `actions`, or an
   * explicit `durationMs`. Errors and toasts with actions stay until dismissed
   * (so a "View details" action isn't lost to the timer); everything else
   * auto-dismisses after ~4s.
   *
   * @example
   * ```ts
   * // a plain info toast (auto-dismisses)
   * ctx.ui.notify("info", "Theme exported.");
   *
   * // an error with a title and an action that opens the full detail in a modal
   * ctx.ui.notify("error", String(err), {
   *   title: "Commit failed",
   *   actions: [
   *     {
   *       label: "View details",
   *       run: () =>
   *         ctx.ui.showModal((close) => <pre>{String(err)}</pre>, {
   *           title: "Commit failed",
   *           dismissible: true,
   *         }),
   *     },
   *   ],
   * });
   * ```
   */
  notify(
    level: "info" | "warn" | "error",
    message: string,
    options?: NotifyOptions,
  ): void;
  /**
   * Pop a menu — the same themed primitive behind every context menu and
   * dropdown in Silo. Supply the {@link MenuEntry | rows} and where to place it
   * (see {@link ShowMenuOptions}); the host renders it, runs the chosen item's
   * {@link MenuItem.run | run}, and dismisses on outside-click or Escape.
   *
   * Only one menu is open at a time — calling `showMenu` again replaces it,
   * except that re-opening with the same {@link ShowMenuOptions.anchor | anchor}
   * toggles it closed (a second click on a dropdown button dismisses it); opt
   * out with {@link ShowMenuOptions.toggle | toggle: false}. Resolves once an
   * item runs or the menu is dismissed.
   *
   * @example
   * ```ts
   * // A right-click context menu at the cursor.
   * element.addEventListener("contextmenu", (e) => {
   *   e.preventDefault();
   *   ctx.ui.showMenu({
   *     items: [
   *       { label: "Rename", run: rename },
   *       { type: "separator" },
   *       { label: "Delete", danger: true, run: del },
   *     ],
   *   });
   * });
   *
   * // A dropdown anchored under a button.
   * ctx.ui.showMenu({ items, anchor: buttonEl });
   * ```
   */
  showMenu(opts: ShowMenuOptions): Promise<void>;
  /**
   * Pop a host-rendered confirm dialog and resolve to the user's choice —
   * `true` for confirm, `false` for cancel. Always dismissible: `Escape` and
   * backdrop-click both resolve `false`. The dialog stacks above all host
   * chrome via the modal manager, so it works from anywhere.
   *
   * @example
   * ```ts
   * if (await ctx.ui.confirm({
   *   title: "Delete workspace?",
   *   body: `"${name}" and its saved terminals will be permanently removed.`,
   *   confirmLabel: "Delete",
   *   danger: true,
   * })) {
   *   service.delete(id);
   * }
   * ```
   */
  confirm(opts: ConfirmOptions): Promise<boolean>;
  /**
   * Pop a host-rendered single-line input dialog and resolve to the entered
   * string, or `null` if the user cancelled (`Escape` / backdrop / Cancel).
   *
   * @example
   * ```ts
   * const name = await ctx.ui.prompt({ title: "Rename", initialValue: current });
   * if (name !== null) rename(name);
   * ```
   */
  prompt(opts: PromptOptions): Promise<string | null>;
  /**
   * Pop a host-rendered modal around your **own custom content** — the escape
   * hatch beyond {@link UiService.confirm | confirm} / {@link UiService.prompt |
   * prompt} when you need a form or bespoke layout. The host owns the hard parts
   * (backdrop, central z-stacking above all chrome, focus trap,
   * restore-focus-on-close); you own the content.
   *
   * Supply a `render` callback that receives a `close` function and returns the
   * modal's content; wire your own buttons to `close(result)` (or `close()` to
   * cancel). The returned promise resolves with the value passed to `close`, or
   * `undefined` if the modal was dismissed (only possible when
   * {@link ModalOptions.dismissible} is set) or `close()` was called with no
   * argument — paralleling `confirm`→`false` / `prompt`→`null`. If you must tell
   * "dismissed" from "closed with no result" apart, pass a distinct sentinel.
   *
   * **Not dismissible by default:** unless you set
   * {@link ModalOptions.dismissible}, `Escape` and backdrop-click do nothing and
   * the modal stays open until your content calls `close`. A non-dismissible
   * modal whose content never calls `close` leaves the promise pending forever —
   * by design, so staged edits can't be lost to an accidental click-away.
   *
   * @typeParam T - The result type your content resolves with via `close`.
   * @param render - Returns the modal content; receives `close` to settle it.
   * @param options - Presentation options (see {@link ModalOptions}).
   *
   * @example
   * ```tsx
   * const changes = await ctx.ui.showModal<Changes>(
   *   (close) => (
   *     <MyForm onCancel={() => close()} onSave={(c) => close(c)} />
   *   ),
   *   { title: "Properties", size: "md" },
   * );
   * if (changes) apply(changes);
   * ```
   */
  showModal<T = void>(
    render: (close: (result?: T) => void) => ReactNode,
    options?: ModalOptions,
  ): Promise<T | undefined>;
  /**
   * Hand a URL to the operating system — open an `http`/`https` link in the
   * user's default browser, or a `mailto:` link in their mail client. The host
   * owns the privileged platform access; this is an extension's only sanctioned
   * way to send the user out of the app.
   *
   * **Scheme-guarded.** Only `http:`, `https:`, and `mailto:` URLs are opened;
   * any other scheme (notably `file:` and `javascript:`) is rejected — the
   * returned promise rejects, nothing is opened. This makes it safe to pass
   * untrusted URLs (e.g. links inside a rendered Markdown document) straight
   * through without first vetting the scheme yourself.
   *
   * @param url - The URL to open. Must be `http:`, `https:`, or `mailto:`.
   * @throws If `url` has any other scheme (or is unparseable).
   *
   * @example
   * ```ts
   * // open a docs link in the browser
   * await ctx.ui.openExternal("https://getsilo.dev/docs");
   *
   * // route a clicked Markdown link safely — bad schemes just reject
   * try {
   *   await ctx.ui.openExternal(href);
   * } catch {
   *   ctx.ui.notify("warn", "That link can't be opened.");
   * }
   * ```
   */
  openExternal(url: string): Promise<void>;
  /**
   * The text currently selected in the **focused surface** — the active editor
   * or a focused terminal — or `null` when nothing is selected. Reads the
   * most-recently-focused of the two, so a command (e.g. "Find in Files") can
   * seed itself with whatever the user has highlighted regardless of which
   * surface has focus. Returns `null` (never throws) when no surface is focused
   * or the selection is empty.
   *
   * @example
   * ```ts
   * const seed = ctx.ui.getActiveSelectionText();
   * if (seed) runSearch(seed);
   * ```
   */
  getActiveSelectionText(): string | null;
  /**
   * Host StatusBar **busy status** aggregate (RFC 0026) — multi-writer in-flight
   * phrases with a numbered badge when more than one is active.
   *
   * @internal Unstable. For bundled first-party extensions proving the UX;
   * not a documented public API. Third parties must not rely on it until a
   * graduation RFC. Prefer {@link UiService.notify} for errors / outcomes.
   */
  readonly busyStatus: BusyStatusApi;
}

/**
 * One in-flight busy-status entry (RFC 0026).
 *
 * @internal
 */
export type BusyStatusUrgency = "normal" | "high";

/**
 * @internal
 */
export interface BusyStatusEntry {
  /** Stable id for update/clear — namespaced by owner, e.g. `terminals.restore`. */
  id: string;
  /** Single-line StatusBar / popover title. */
  label: string;
  /** Optional detail shown as the menu row tooltip. */
  detail?: string;
  /**
   * Summary-line ranking when several entries are active. Default `"normal"`.
   * `"high"` always outranks `"normal"`; within a tier, most-recently-updated wins.
   */
  urgency?: BusyStatusUrgency;
}

/**
 * @internal Unstable busy-status writer API on {@link UiService.busyStatus}.
 */
export interface BusyStatusApi {
  /** Push or replace by id. Disposable clears this id. */
  set(entry: BusyStatusEntry): Disposable;
  /** Remove one entry by id. */
  clear(id: string): void;
}
