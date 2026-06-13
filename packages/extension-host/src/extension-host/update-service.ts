import { proxy, snapshot, subscribe } from "valtio";
import { ask, message } from "@tauri-apps/plugin-dialog";
import type { Disposable } from "@silo-code/sdk";
import {
  checkForUpdate,
  installUpdate,
  isStableApp,
  type Update,
} from "../services/updater";

// Reactive auto-update state for **core** extensions, exposed on the PRIVILEGED
// `@silo-code/extension-host/internal` barrel — core.* only — rather than public
// `@silo-code/sdk`.
//
// Why internal, not public `ctx.updates`: self-updating the installed app is a
// host/platform capability whose only consumer is `core.updates` (Silo's own
// status-bar indicator) and the app's "Check for Updates…" menu item. Per the
// public-first rule (ctx-domains.md → "Extension trust tiers"), a capability
// only a core extension needs lives on the internal barrel — importing it from
// `@silo-code/extension-host/internal` is the marked, greppable record of that
// privileged use. Handing arbitrary extensions the ability to download + install
// a binary and relaunch the app would be unsafe; if a public need ever appears
// this graduates to a `ctx.updates` domain instead.
//
// Stateless Tauri plumbing lives in the leaf seam `services/updater.ts`; this
// module owns the *state* (so a status item can react) and the launch-discovered
// vs. user-invoked policy.

/**
 * Where the updater is in its check/install lifecycle. The status-bar link
 * renders for `available` (actionable) and `installing` (disabled, in-flight).
 *
 * @internal
 */
export type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "installing"
  | "upToDate"
  | "error";

/**
 * Reactive auto-update state. `version` is the available release's version while
 * {@link UpdateState.phase | phase} is `"available"`, else `null`.
 *
 * @internal
 */
export interface UpdateState {
  readonly phase: UpdatePhase;
  readonly version: string | null;
}

/**
 * Host auto-update service for **core** extensions, exposed via the privileged
 * `@silo-code/extension-host/internal` barrel (not public `@silo-code/sdk`).
 * Satisfies the {@link @silo-code/sdk!ReactiveService} contract so a status item
 * can `useServiceState` it. Obtain the singleton with {@link getUpdateService}.
 *
 * @internal
 */
export interface UpdateService {
  /** Current state — a stable, frozen snapshot. */
  getState(): UpdateState;
  /** Subscribe to state changes (for `useServiceState`). */
  subscribe(listener: (s: UpdateState) => void): Disposable;
  /**
   * Check the configured endpoint for a newer release and update the state.
   * No-ops (leaving `phase: "idle"`) outside the packaged stable app, so neither
   * `tauri dev` nor the "Silo Dev" build ever offers to replace itself.
   */
  check(): Promise<void>;
  /**
   * Download + install the release found by the last {@link UpdateService.check}
   * and relaunch into it. No-op when no update is pending or an install is
   * already in flight (guards against a double-click). Moves `phase` to
   * `"installing"` for the duration; on failure it reverts to `"available"` and
   * re-throws so the caller can report it (a successful install never returns —
   * the app relaunches).
   */
  installAndRelaunch(): Promise<void>;
}

const state = proxy<{ phase: UpdatePhase; version: string | null }>({
  phase: "idle",
  version: null,
});

// The Tauri update handle for the currently-available release. Non-serializable,
// so kept off the valtio proxy (mirrors modal-service's `pending` map).
let pending: Update | null = null;

// The last check/install error string, kept off the proxy so the interactive
// menu path can surface the underlying detail (the state machine only needs the
// `"error"` phase).
let lastError: string | null = null;

let service: UpdateService | null = null;

/**
 * Host factory for {@link UpdateService}, re-exported from
 * `@silo-code/extension-host/internal` for core extensions (`core.updates`).
 * Returns a shared singleton.
 *
 * @internal
 */
export function getUpdateService(): UpdateService {
  if (service) return service;
  service = {
    getState: () => snapshot(state),
    subscribe(listener) {
      const unsub = subscribe(state, () => listener(snapshot(state)));
      return { dispose: unsub };
    },
    async check() {
      if (!(await isStableApp())) return;
      // Don't clobber an in-flight install (a stray re-check shouldn't reopen
      // the link mid-download).
      if (state.phase === "installing") return;
      state.phase = "checking";
      try {
        const update = await checkForUpdate();
        lastError = null;
        if (update) {
          pending = update;
          state.version = update.version;
          state.phase = "available";
        } else {
          pending = null;
          state.version = null;
          state.phase = "upToDate";
        }
      } catch (err) {
        lastError = String(err);
        console.warn("[updater] check failed", err);
        state.phase = "error";
      }
    },
    async installAndRelaunch() {
      // Guard re-entry: no pending release, or an install already running.
      if (!pending || state.phase === "installing") return;
      state.phase = "installing";
      try {
        await installUpdate(pending);
        // On success the app relaunches into the new version — control never
        // returns here.
      } catch (err) {
        lastError = String(err);
        console.warn("[updater] install failed", err);
        // Revert so the link reappears and the user can retry.
        state.phase = "available";
        throw err;
      }
    },
  };
  return service;
}

/**
 * Manual "Check for Updates…" — the macOS app-menu item (`menu-items.ts`). Runs
 * a check through the shared {@link UpdateService} (so a found update also lights
 * the status-bar link), then always reports via native dialogs: an install
 * prompt if a release is available, an error (with detail) if the check failed,
 * else "up to date". In dev / the "Silo Dev" build the check no-ops (`phase`
 * stays `"idle"`), which is reported as up-to-date so the menu still gives
 * feedback.
 *
 * @internal
 */
export async function checkForUpdatesInteractive(): Promise<void> {
  const svc = getUpdateService();
  await svc.check();
  const { phase, version } = svc.getState();
  if (phase === "available") {
    const ok = await ask(
      `Silo ${version} is available.\n\nInstall it and restart now?`,
      { title: "Update available", kind: "info" },
    );
    if (ok) await svc.installAndRelaunch();
  } else if (phase === "error") {
    const detail = lastError ? `\n\n${lastError}` : "";
    await message(`Couldn't check for updates.${detail}`, {
      title: "Silo",
      kind: "error",
    });
  } else {
    // "upToDate", or "idle" in dev / non-stable builds.
    await message("You're on the latest version.", { title: "Silo" });
  }
}
