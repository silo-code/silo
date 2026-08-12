import { proxy, snapshot, subscribe } from "valtio";
import type { Disposable } from "@silo-code/sdk";
import {
  checkForUpdate,
  installUpdate,
  isStableApp,
  type Update,
} from "../services/updater";
import {
  reportUpdateAction,
  type UpdateAction,
} from "../services/update-analytics";
import {
  changelogRange,
  fetchChangelog,
  type ChangelogEntry,
} from "./changelog-client";
import { createHostChannel } from "./output-store";

const channel = createHostChannel("silo:updates", "Updates");

export type { ChangelogEntry };

// Reactive auto-update state for **core** extensions, exposed on the PRIVILEGED
// `@silo-code/extension-host/internal` barrel — core.* only — rather than public
// `@silo-code/sdk`.
//
// Why internal, not public `ctx.updates`: self-updating the installed app is a
// host/platform capability whose only consumer is `core.updates` (Silo's own
// status-bar indicator, update-available modal, and the "Check for Updates…"
// command the app menu dispatches into — see ADR 0036). Per the public-first
// rule (ctx-domains.md → "Extension trust tiers"), a capability only a core
// extension needs lives on the internal barrel — importing it from
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
   * Download + install the newest release and relaunch into it. No-op when no
   * update is pending or an install is already in flight (guards against a
   * double-click). Moves `phase` to `"installing"` for the duration.
   *
   * Re-checks immediately before downloading rather than trusting the release
   * found by the last {@link UpdateService.check} — that check can be
   * significantly stale (e.g. the status-bar link stays actionable across a
   * long background re-check interval, so a click can fire against an
   * `Update` handle that's hours old). If the re-check finds nothing newer,
   * the state reverts to `"upToDate"` without installing. On any other
   * failure it reverts to `"available"` and re-throws so the caller can
   * report it (a successful install never returns — the app relaunches).
   */
  installAndRelaunch(): Promise<void>;
  /**
   * Changelog entries between the installed version and the available
   * release (newest first), for the update-available modal. Fetches and
   * range-slices `changelog.json`; on any fetch/parse failure, or an empty
   * range, falls back to a single synthetic entry built from the release
   * manifest's own notes. Resolves to `[]` when there's no available update.
   */
  getChangelog(): Promise<ChangelogEntry[]>;
  /**
   * Report the user's resulting choice to the update-check analytics
   * pipeline (ADR 0031 / ADR 0036) — fire-and-forget, never throws. A no-op
   * if there's no available version to attribute the action to.
   */
  reportAction(action: UpdateAction): void;
}

const state = proxy<{ phase: UpdatePhase; version: string | null }>({
  phase: "idle",
  version: null,
});

// The Tauri update handle for the currently-available release. Non-serializable,
// so kept off the valtio proxy (mirrors modal-service's `pending` map). Also
// the source of the changelog fallback (`pending.body`, the manifest's own
// single-version release notes) and the installed version to slice the
// changelog range against (`pending.currentVersion`) — both already present
// on the handle the check produced, so no separate app-version lookup is
// needed.
let pending: Update | null = null;

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
        channel.warn("[updater] check failed", err);
        state.phase = "error";
      }
    },
    async installAndRelaunch() {
      // Guard re-entry: no pending release, or an install already running.
      if (!pending || state.phase === "installing") return;
      state.phase = "installing";
      // Fire before the install call, not after — a successful install never
      // returns (the app relaunches), so this is the only chance to report it.
      if (state.version) void reportUpdateAction("installed", state.version);
      try {
        // `pending` may be from a background check up to RECHECK_INTERVAL_MS
        // old — re-check right before downloading so we never install a
        // stale `Update` handle (see the interface doc above).
        const fresh = await checkForUpdate();
        if (!fresh) {
          pending = null;
          state.version = null;
          state.phase = "upToDate";
          return;
        }
        pending = fresh;
        state.version = fresh.version;
        await installUpdate(fresh);
        // On success the app relaunches into the new version — control never
        // returns here.
      } catch (err) {
        channel.warn("[updater] install failed", err);
        // Revert so the link reappears and the user can retry.
        state.phase = "available";
        throw err;
      }
    },
    async getChangelog() {
      if (state.phase !== "available" || !state.version || !pending) return [];
      const installed = pending.currentVersion;
      const available = state.version;
      try {
        const all = await fetchChangelog();
        const range = changelogRange(all, installed, available);
        if (range.length > 0) return range;
      } catch (err) {
        channel.warn("[updater] changelog fetch failed", err);
      }
      // Fall back to the manifest's own single-version notes, if present.
      return pending.body
        ? [{ version: available, date: pending.date ?? "", body: pending.body }]
        : [];
    },
    reportAction(action) {
      if (!state.version) return;
      void reportUpdateAction(action, state.version); // fire-and-forget, not awaited
    },
  };
  return service;
}
