import { subscribe } from "valtio";
import { store } from "../state/store";
import {
  activateWorkspace,
  addTerminal,
  removeTerminal,
  renameTerminal,
  findTerminal,
} from "../state/workspaces";
import { tauriTerminalClient } from "../services/tauri-terminal-client";
import { spawnTerminalSession } from "./process-service";
import {
  drainPendingLaunch,
  discardPendingLaunch,
  requestRawLaunch,
} from "./agents/pending-launch";
import { launchAgentProfile } from "./agents/agent-launch";
import { getAgentProfiles } from "../state/agent-profiles";
import { buildTerminalTabMenuItems } from "./terminal-tab-menu";
import type { TerminalRecord } from "../state/types";
import type {
  TerminalService,
  TerminalTabDecorationProvider,
  OscEvent,
} from "@silo-code/sdk";
import {
  tabAdornmentMethodsFor,
  tabAdornmentRegistry,
} from "./tab-adornment-registry";
import {
  getActiveTerminal,
  subscribeActiveTerminal,
} from "./active-terminal-registry";
import {
  focusPanelContent,
  getActiveDockApi,
  getActiveDockWorkspaceId,
} from "../docked/dock-api-registry";
import { requestPanelActivation } from "../docked/panel-activation-requests";
import { createHostChannel } from "./output-store";
import {
  collectLivePtys,
  formatPtyEventMessage,
  formatPtySummaryMessage,
  type PtyEntry,
} from "./pty-diagnostics";

// Dedicated Output channel for PTY lifecycle visibility — separate from
// `silo:application` so it doesn't crowd out other host logs, and so it can be
// found/filtered on its own when debugging a session that outlived its
// workspace (soft-close keeps PTYs alive by design; this channel is how you
// eyeball whether that's actually what's happening).
const terminalsChannel = createHostChannel("silo:terminals", "Terminals");

/** Log one PTY create/delete event, resolving the workspace name for the line. */
function logPtyEvent(
  action: "created" | "deleted",
  opts: {
    workspaceId: string;
    terminalId: string;
    sessionId: string;
    reason?: string;
    level?: "info" | "error";
  },
): void {
  const workspaceName =
    store.workspaces[opts.workspaceId]?.name ?? opts.workspaceId;
  const message = formatPtyEventMessage(action, { ...opts, workspaceName });
  const data = { ...opts, workspaceName };
  if (opts.level === "error") terminalsChannel.error(message, data);
  else terminalsChannel.info(message, data);
}

// ---- create/delete detection ------------------------------------------------
// A PTY's `sessionId` gets attached to its terminal record from several call
// sites — TerminalPanel.tsx spawning directly via `ctx.process.spawn` on mount
// (the common case), this module's own `ensureSession` (the `sendText` lazy-
// spawn fallback), `close()`, `reapWorkspaceTerminals` — and any future one.
// Rather than instrument every call site (guaranteed to miss the next one),
// mirror `processes-service.ts`'s approach: diff the live sessionId set on
// every store mutation. This is the one place that can't miss a spawn/kill
// regardless of which layer triggered it.

function logPtySummary(entries: PtyEntry[]): void {
  const { message, data } = formatPtySummaryMessage(entries);
  terminalsChannel.info(message, data);
}

// `null` until the post-hydration baseline is taken — the workspaces restored
// from disk aren't newly "created", so the first sync after hydration seeds
// the known set silently (logging one startup summary instead of a batch of
// false creates).
let knownPtys: Map<string, PtyEntry> | null = null;

function syncPtyDiagnostics(): void {
  if (!store.hydrated) return;
  const current = collectLivePtys(store.workspaces);
  const currentMap = new Map(current.map((e) => [e.sessionId, e]));

  if (knownPtys === null) {
    knownPtys = currentMap;
    logPtySummary(current);
    return;
  }

  for (const [sessionId, entry] of currentMap) {
    if (!knownPtys.has(sessionId)) {
      logPtyEvent("created", {
        workspaceId: entry.workspaceId,
        terminalId: entry.terminalId,
        sessionId,
      });
    }
  }
  for (const [sessionId, entry] of knownPtys) {
    if (!currentMap.has(sessionId)) {
      logPtyEvent("deleted", {
        workspaceId: entry.workspaceId,
        terminalId: entry.terminalId,
        sessionId,
        reason: "removed from workspace state",
      });
    }
  }
  knownPtys = currentMap;
}

subscribe(store, syncPtyDiagnostics);

// RFC 0033: discard a pending Agent Profile launch for any terminal record that
// disappears before its session came up. Same "one place that can't miss it"
// diff-on-mutation approach as syncPtyDiagnostics — cheaper than instrumenting
// every removeTerminal call site (the dock, reap, close, …). Explicit
// discards in `close` / `reapWorkspaceTerminals` stay for immediacy; this is
// the backstop.
let knownTerminalIds: Set<string> | null = null;
function sweepOrphanedPendingLaunches(): void {
  if (!store.hydrated) return;
  const current = new Set<string>();
  for (const ws of Object.values(store.workspaces))
    for (const t of ws.terminals) current.add(t.id);
  if (knownTerminalIds !== null) {
    for (const id of knownTerminalIds) {
      if (!current.has(id)) discardPendingLaunch(id);
    }
  }
  knownTerminalIds = current;
}
subscribe(store, sweepOrphanedPendingLaunches);

// Periodic PTY census — every 5 minutes after the startup log above, dump a
// per-workspace rollup (count + terminal names). The only way to notice a
// session that's still alive when nothing should be holding it open.
setInterval(() => {
  logPtySummary(collectLivePtys(store.workspaces));
}, 5 * 60_000);

// `ctx.terminals` — the public contract lives in @silo-code/sdk
// (terminal-service.ts); this is the host implementation.

/** Locate the workspace + record for a terminal id, across all workspaces. */
function locate(
  terminalId: string,
): { workspaceId: string; rec: TerminalRecord } | null {
  for (const ws of Object.values(store.workspaces)) {
    const rec = ws?.terminals.find((t) => t.id === terminalId);
    if (rec) return { workspaceId: ws.id, rec };
  }
  return null;
}

/** Current live PTY session id for a terminal id, or `null` if none. */
function sessionIdFor(terminalId: string): string | null {
  for (const ws of Object.values(store.workspaces)) {
    const rec = ws?.terminals.find((t) => t.id === terminalId);
    if (rec?.sessionId) return rec.sessionId;
  }
  return null;
}

/**
 * Subscribe to a terminal's *current* PTY session and keep that binding
 * following the session across recreation. `bind(sessionId)` opens the
 * underlying per-session listener and returns its teardown. This re-binds
 * whenever the terminal's `sessionId` changes — first spawn, and every
 * recreate (reboot / manual "Recreate terminal") that swaps in a new PTY
 * session under the same terminal id. Without this, a listener captured at the
 * original session goes silent after recreate even though the terminal id is
 * unchanged (the bug: OSC/output agent-detection stopped for a resumed agent).
 */
function subscribeToSession(
  terminalId: string,
  bind: (sessionId: string) => () => void,
): { dispose(): void } {
  let currentSid: string | null = null;
  let unbind: (() => void) | null = null;

  const sync = () => {
    const sid = sessionIdFor(terminalId);
    if (sid === currentSid) return;
    unbind?.();
    unbind = null;
    currentSid = sid;
    if (sid) unbind = bind(sid);
  };

  sync();
  const unsubscribeStore = subscribe(store, sync);
  return {
    dispose() {
      unsubscribeStore();
      unbind?.();
      unbind = null;
    },
  };
}

// In-flight force-spawns, keyed by terminal id, so concurrent `sendText` calls
// (or a call racing a normal mount) share one PTY rather than spawning several.
const spawning = new Map<string, Promise<string | null>>();

/**
 * Resolve a terminal's live PTY session id, spawning the PTY on demand when the
 * tab has never mounted (PTYs spawn lazily on first mount). Sets the new
 * `sessionId` on the record so a later mount attaches to it instead of spawning
 * a second session.
 *
 * Spawns through the **privileged** `spawnTerminalSession` (not the public
 * `getProcessService().spawn`), so a session brought up this way still carries
 * its `SILO_TERMINAL_ID` — RFC 0028's guarantee, which the public path
 * deliberately withholds ("a session spawned through the public surface isn't a
 * tab"). This closes the pre-existing gap for a never-shown tab whose PTY came
 * up via `ctx.terminals.sendText`, and is the normal agent-terminal path in
 * RFC 0033 (a profile launched into a background workspace).
 *
 * On resolve it drains any pending Agent Profile launch (RFC 0033) for this
 * terminal — this is the *background* drain path; the mounted panel drains the
 * foreground case.
 *
 * @internal
 */
export function ensureSession(terminalId: string): Promise<string | null> {
  const found = locate(terminalId);
  if (!found) return Promise.resolve(null);
  if (found.rec.sessionId) return Promise.resolve(found.rec.sessionId);
  const pending = spawning.get(terminalId);
  if (pending) return pending;

  const ws = store.workspaces[found.workspaceId];
  const cwd = found.rec.cwd ?? ws?.folder;
  if (!cwd) return Promise.resolve(null);

  const p = spawnTerminalSession({ terminalId, cwd })
    .then((session) => {
      // Re-resolve the record — it may have moved/closed during the await.
      const rec = findTerminal(found.workspaceId, terminalId);
      if (!rec) {
        // The terminal was removed while its PTY was still spawning — kill the
        // now-orphaned session rather than leaking it.
        void session.kill();
        discardPendingLaunch(terminalId);
        logPtyEvent("deleted", {
          workspaceId: found.workspaceId,
          terminalId,
          sessionId: session.id,
          reason: "terminal removed mid-spawn",
        });
        return null;
      }
      if (!rec.sessionId) rec.sessionId = session.id;
      drainPendingLaunch(terminalId, rec.sessionId);
      return rec.sessionId;
    })
    .finally(() => spawning.delete(terminalId));
  spawning.set(terminalId, p);
  return p;
}

let service: TerminalService | null = null;

/**
 * Remove every terminal record in a workspace and await force-kill of each live
 * PTY. Used by {@link TerminalService.closeWorkspace} (fire-and-forget) and by
 * the automation bridge (awaited so delete replies after reaps finish).
 *
 * @internal
 */
export async function reapWorkspaceTerminals(
  workspaceId: string,
): Promise<void> {
  const ws = store.workspaces[workspaceId];
  if (!ws) return;
  // Snapshot ids first — removeTerminal mutates the array.
  const ids = ws.terminals.map((t) => t.id);
  const kills: Promise<void>[] = [];
  for (const id of ids) {
    discardPendingLaunch(id);
    const rec = removeTerminal(workspaceId, id);
    if (rec?.sessionId) {
      const sessionId = rec.sessionId;
      // The successful path is already covered by the store-diff (removeTerminal
      // above drops the sessionId immediately, so the next sync logs "deleted").
      // A failed kill is the one thing the diff can't see — store already thinks
      // the PTY is gone, so this is the only trace of a session outliving the
      // workspace it belonged to.
      kills.push(
        tauriTerminalClient.deleteTerminal(sessionId).catch((err) => {
          console.warn("delete terminal failed", err);
          logPtyEvent("deleted", {
            workspaceId,
            terminalId: id,
            sessionId,
            reason: `workspace reap FAILED: ${String(err)}`,
            level: "error",
          });
        }),
      );
    }
  }
  await Promise.all(kills);
}

/** @internal — host factory; extensions receive this as `ctx.terminals`. */
export function getTerminalService(): TerminalService {
  if (service) return service;
  service = {
    create(input) {
      const workspaceId = input?.workspaceId ?? store.activeWorkspaceId;
      if (!workspaceId) return undefined;
      const kind = input?.kind ?? "shell";
      // RFC 0033: the deprecated `"claude"` / `"pi"` kinds create a `"shell"`
      // terminal. If a profile asserts that agent, launch it; otherwise type
      // the bare command — preserving today's observable behavior. This path
      // NEVER writes a profile record: a programmatic call must not create
      // user data behind the user's back.
      if (kind === "claude" || kind === "pi") {
        const profile = getAgentProfiles().find(
          (p) => p.assumedAgentId === kind,
        );
        if (profile) {
          return launchAgentProfile({
            profileId: profile.id,
            workspaceId,
            cwd: input?.cwd,
          });
        }
        const rec = addTerminal(workspaceId, "shell", input?.cwd);
        requestRawLaunch(rec.id, kind);
        if (workspaceId !== store.activeWorkspaceId) void ensureSession(rec.id);
        return rec;
      }
      return addTerminal(workspaceId, "shell", input?.cwd);
    },
    getTabMenuItems(terminalId) {
      return buildTerminalTabMenuItems(terminalId);
    },
    focus(terminalId) {
      // Find which workspace owns this terminal.
      const wsId = Object.values(store.workspaces).find((ws) =>
        ws.terminals.some((t) => t.id === terminalId),
      )?.id;
      if (!wsId) return;

      const panelId = `terminal:${terminalId}`;

      if (getActiveDockWorkspaceId() !== wsId) {
        // Cross-workspace — or same-workspace-on-paper-but-not-live-yet: check
        // dock identity, not store.activeWorkspaceId. A caller that already
        // flipped store.activeWorkspaceId itself (e.g. ctx.workspaces.activate()
        // immediately followed by this call — see agent-inspector's
        // openAndFocus(), and per RFC 0023 the real agent-monitor extension's
        // Navigator row click) can win the store check before WorkspaceDock's
        // authority effect has actually committed the new dock as live,
        // making `store.activeWorkspaceId === wsId` true while the dock behind
        // it is still the old one. Trusting that would silently no-op here
        // (the old dock has no panel for this terminal) and drop the request
        // entirely — the tab never activates at all, not even a flash. Do NOT
        // reach for the dock from here either way: the target workspace's dock
        // may not be mounted yet, and the moment it becomes active it runs its
        // own active-panel restore — a setActive() fired on a timer here is
        // racing that restore, and whichever call lands last wins (the
        // requested tab flashes active, then flips back). Record the intent
        // instead and let WorkspaceDock, the single authority over its own
        // active panel, apply it — and drive focus — once its dock is up.
        // activateWorkspace() is a no-op if wsId is already store.activeWorkspaceId
        // (see state/workspaces.ts), so this is safe to call unconditionally.
        // See ADR 0034.
        requestPanelActivation(wsId, panelId);
        activateWorkspace(wsId);
        return;
      }

      // Same workspace, dock confirmed live — nothing else is deciding its
      // active panel right now, so activate the tab directly.
      const panel = getActiveDockApi()?.getPanel(panelId);
      panel?.api.setActive();
      if (!panel) return;
      // Defer the actual focus grab past this tick, and scope it to this
      // specific panel's own content — not focusCenterDock()'s "whatever's
      // visible in the active group" search. With two-plus terminal tabs in
      // the same group, that generic search can win the race against
      // dockview's own (async, not synchronous with setActive()) visibility
      // toggle and land on the *previous* tab's still-visible content,
      // which reads as "some textarea in the group is focused" and never
      // retries again — confirmed live: clicking between two terminal rows
      // in agent-inspector sometimes focused the wrong one. Scoping to
      // panel.view.content.element removes every other panel from the
      // search, so there's nothing left to grab but the right one.
      requestAnimationFrame(() =>
        focusPanelContent(panel.view.content.element),
      );
    },
    closeWorkspace(workspaceId) {
      void reapWorkspaceTerminals(workspaceId);
    },
    sendText(terminalId, text, addNewline = true) {
      // A PTY treats Enter as a carriage return, so append "\r" (not "\n") to
      // execute — matching a real keypress.
      const payload = addNewline ? `${text}\r` : text;
      void ensureSession(terminalId).then((sessionId) => {
        if (sessionId) tauriTerminalClient.sendInput(sessionId, payload);
      });
    },
    close(terminalId) {
      const found = locate(terminalId);
      if (!found) return; // unknown id → no-op
      discardPendingLaunch(terminalId);
      const rec = removeTerminal(found.workspaceId, terminalId);
      if (rec?.sessionId) {
        const { workspaceId } = found;
        const sessionId = rec.sessionId;
        // As in reapWorkspaceTerminals: the successful path is covered by the
        // store-diff; only a failed kill needs its own log.
        tauriTerminalClient.deleteTerminal(sessionId).catch((err) => {
          console.warn("close terminal failed", err);
          logPtyEvent("deleted", {
            workspaceId,
            terminalId,
            sessionId,
            reason: `terminal close FAILED: ${String(err)}`,
            level: "error",
          });
        });
      }
    },
    rename(terminalId, name) {
      const found = locate(terminalId);
      if (!found) return;
      renameTerminal(found.workspaceId, terminalId, name);
    },
    getActive: getActiveTerminal,
    subscribeActive: subscribeActiveTerminal,
    ...tabAdornmentMethodsFor("terminal"),
    registerTabDecoration(provider: TerminalTabDecorationProvider) {
      return tabAdornmentRegistry.registerTerminalDecorationShim(provider);
    },
    getTabDecoration:
      tabAdornmentRegistry.getFirstTerminalIndicator.bind(tabAdornmentRegistry),
    invalidateTabDecorations() {
      tabAdornmentRegistry.invalidate();
    },
    subscribeTabDecorations(listener: () => void) {
      return tabAdornmentRegistry.subscribe(listener);
    },
    subscribeOsc(terminalId: string, handler: (event: OscEvent) => void) {
      // Bound to the terminal's *current* PTY session and re-bound whenever
      // that session changes — a terminal that hasn't spawned yet binds once
      // its sessionId lands, and a recreated one (reboot) re-binds to the new
      // session instead of going silent. See subscribeToSession.
      return subscribeToSession(terminalId, (sid) =>
        tauriTerminalClient.onOsc(sid, handler),
      );
    },
    subscribeOutput(terminalId: string, handler: (data: string) => void) {
      return subscribeToSession(terminalId, (sid) =>
        tauriTerminalClient.onOutput(sid, handler),
      );
    },
  };
  return service;
}
