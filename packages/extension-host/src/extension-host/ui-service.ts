import { proxy } from "valtio";
import {
  open as openDialog,
  save as saveDialog,
} from "@tauri-apps/plugin-dialog";
import { open as openExternalUrl } from "@tauri-apps/plugin-shell";
import { openMenu } from "./menu-controller";
import {
  confirm as confirmDialog,
  prompt as promptDialog,
  showModal as showModalImpl,
} from "./modal-service";
import { getActiveSelectionText } from "./active-selection";
import type { NotifyAction, NotifyOptions, UiService } from "@silo-code/sdk";

// `ctx.ui` — the user-interaction domain. The host renders the chrome;
// extensions ask. This is the single sanctioned way an extension talks to the
// user: native OS dialogs (the host owns the privileged `@tauri-apps` import
// here, just like `file-service.ts` owns the fs commands), toast notifications,
// themed menus, host-owned confirm/prompt modals, and custom-content modals
// (showModal). The public contract lives in @silo-code/sdk (ui-service.ts);
// this is the host implementation.

/**
 * One active toast. Host-shell view state — created by {@link pushToast},
 * rendered by the `Toasts` component, removed by {@link dismissToast}.
 *
 * @internal
 */
export interface Toast {
  /** Monotonic id, unique per toast for keying and dismissal. */
  id: number;
  /** Severity, driving the toast's icon and accent. */
  level: "info" | "warn" | "error";
  /** The message text shown to the user. */
  message: string;
  /** Optional bold heading rendered above the message. */
  title?: string;
  /**
   * Serializable metadata for the toast's action buttons — the `run` callbacks
   * live off the proxy in {@link toastActions}, looked up via
   * {@link runToastAction}.
   */
  actions?: { label: string; keepOpen?: boolean }[];
}

/**
 * Ephemeral toast list backing {@link UiService.notify} — app-shell host state,
 * not persisted and not part of the workspace model. The `Toasts` component
 * renders from this proxy; extensions never touch it directly (they call
 * `ctx.ui.notify`). Mirrors the `settings-dialog` host-state pattern.
 *
 * @internal
 */
export const toastStore = proxy<{ toasts: Toast[] }>({ toasts: [] });

/** How long a toast stays up before auto-dismissing, in milliseconds. */
const TOAST_TTL_MS = 4000;

let nextToastId = 0;

/**
 * The non-serializable half of a toast's actions — the `run` callbacks — kept
 * off the valtio proxy and keyed by toast id, mirroring `modal-service`'s
 * `pending` map. `Toasts` invokes them via {@link runToastAction}.
 */
const toastActions = new Map<number, NotifyAction[]>();

/** @internal — append a toast and (unless sticky) schedule its auto-dismissal. */
export function pushToast(
  level: "info" | "warn" | "error",
  message: string,
  options?: NotifyOptions,
): void {
  const id = nextToastId++;
  const actions = options?.actions;
  const toast: Toast = { id, level, message };
  if (options?.title) toast.title = options.title;
  if (actions?.length) {
    toast.actions = actions.map((a) => ({
      label: a.label,
      keepOpen: a.keepOpen,
    }));
    toastActions.set(id, actions);
  }
  toastStore.toasts.push(toast);

  // Auto-dismiss delay (null = stay until dismissed). An explicit `durationMs`
  // wins: `0` is sticky, a positive value is that delay — even for an error.
  // With none given, errors and toasts with actions stay (so a "View details"
  // action isn't lost to the timer); everything else uses the default TTL.
  let delay: number | null = TOAST_TTL_MS;
  if (options?.durationMs !== undefined) {
    delay = options.durationMs === 0 ? null : options.durationMs;
  } else if (level === "error" || actions?.length) {
    delay = null;
  }
  if (delay !== null) setTimeout(() => dismissToast(id), delay);
}

/** @internal — remove a toast by id (auto-dismiss or user-dismiss). */
export function dismissToast(id: number): void {
  toastActions.delete(id);
  const i = toastStore.toasts.findIndex((t) => t.id === id);
  if (i !== -1) toastStore.toasts.splice(i, 1);
}

/**
 * @internal — run a toast's action by index, then dismiss the toast unless that
 * action set `keepOpen`. No-op if the toast or action is already gone.
 */
export function runToastAction(id: number, index: number): void {
  const action = toastActions.get(id)?.[index];
  if (!action) return;
  void action.run();
  if (!action.keepOpen) dismissToast(id);
}

/** Schemes {@link UiService.openExternal} will hand to the OS. */
const OPENABLE_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/**
 * @internal — true if `url` is a scheme {@link UiService.openExternal} may open
 * (`http:` / `https:` / `mailto:`). Rejects everything else, notably `file:`
 * and `javascript:`, so an untrusted URL (e.g. a clicked Markdown link) can't
 * smuggle a dangerous scheme into the OS opener. Unparseable URLs are rejected.
 */
export function isOpenableExternalUrl(url: string): boolean {
  try {
    return OPENABLE_SCHEMES.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

let service: UiService | null = null;

/** @internal — host factory; extensions receive this as `ctx.ui`. */
export function getUiService(): UiService {
  if (service) return service;
  service = {
    async pickFolder(opts) {
      const picked = await openDialog({
        directory: true,
        multiple: false,
        defaultPath: opts?.defaultPath,
      });
      return typeof picked === "string" ? picked : null;
    },
    async pickFile(opts) {
      const picked = await openDialog({
        multiple: false,
        defaultPath: opts?.defaultPath,
        filters: opts?.filters,
      });
      return typeof picked === "string" ? picked : null;
    },
    async savePath(opts) {
      const picked = await saveDialog({
        defaultPath: opts?.defaultPath,
        filters: opts?.filters,
      });
      return typeof picked === "string" ? picked : null;
    },
    notify(level, message, options) {
      pushToast(level, message, options);
    },
    showMenu(opts) {
      return openMenu(opts);
    },
    confirm(opts) {
      return confirmDialog(opts);
    },
    prompt(opts) {
      return promptDialog(opts);
    },
    showModal(render, options) {
      // The host channel is untyped (`Promise<unknown>`); the public generic
      // `showModal<T>` provides the typing to extension authors. `undefined` is
      // always in the `T | undefined` result union, so this cast is sound.
      return showModalImpl(render, options) as Promise<undefined>;
    },
    async openExternal(url) {
      // Scheme-guard before handing the URL to the OS: only http(s)/mailto, so
      // an untrusted link (e.g. one clicked in the Markdown preview) can't open
      // a `file:` or `javascript:` URL. Tauri's `shell:default` capability
      // scopes the opener similarly; this is the JS-side guard so a bad scheme
      // fails loudly here rather than silently at the capability layer.
      if (!isOpenableExternalUrl(url)) {
        throw new Error(`openExternal: refusing to open URL: ${url}`);
      }
      await openExternalUrl(url);
    },
    getActiveSelectionText() {
      return getActiveSelectionText();
    },
  };
  return service;
}
