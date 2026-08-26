import type {
  AgentInfo,
  Extension,
  ExtensionContext,
  WorkspaceStatusRow,
} from "@silo-code/sdk";
import type { AgentsExtensionAPI } from "./agents-api";
import { Robot } from "@phosphor-icons/react";
import {
  deriveStatusRow,
  deriveTab,
  stripStatusMarker,
  staleSuffix,
  stoppedWorking,
} from "./agent-view";
import { maybePlayTransitionSound } from "./sound";
import {
  initSettings,
  clearSettingsListeners,
  AgentsOptionsPanel,
  settingsService,
} from "./settings";
import { AgentsPanel } from "./agents-panel";
import { initDoneSince, recordDoneSince } from "./done-since";
import { initManualOrder } from "./manual-order";
import { AgentIconGlyph } from "./AgentIconGlyph";
import styles from "./styles.css?inline";

const STYLE_ID = "silo-agents-styles";

function activate(ctx: ExtensionContext): AgentsExtensionAPI {
  ctx.subscriptions.push(initSettings(ctx.storage.global));
  ctx.subscriptions.push(initDoneSince(ctx.storage.global));
  ctx.subscriptions.push(initManualOrder(ctx.storage.global));

  // Latest host-computed agent state, keyed by terminal record id. Since Silo
  // 0.39 the host (`ctx.agents`) owns every hard part — OSC detection, the
  // working/idle/dead state machine, cross-restart persistence, and stale-gap
  // recovery — so this extension only *projects* that shared state into rows,
  // tab badges, and a chime. The map is read synchronously by the three
  // binder `provide` callbacks below, so it's kept current on every agents
  // change.
  const agents = new Map<string, AgentInfo>();
  // Terminals that have finished a run and not yet started another, mapped to
  // when they finished. This is the extension's own "finished, unseen" record,
  // used *only* by the "Keep it until the next run" focus mode: the host clears
  // (or never raises) `needsAttention` for a finish you were watching live, so
  // this local flag is what keeps such a finish green until the agent works
  // again. The `clear`/`hide` modes ignore it and rely on host `needsAttention`.
  const finishedUnseen = new Map<string, string>();
  let activeTerminalId = ctx.terminals.getActive();

  // "color" icon mode needs to know the host's actual active light/dark base
  // to pick a hex with contrast — see AgentIconGlyph. Tracked imperatively
  // (like `agents` above) since bindIcon's provide() isn't a React component.
  let colorScheme = ctx.theme.resolve(ctx.theme.getState().activeId).base;
  ctx.subscriptions.push(
    ctx.theme.subscribe(() => {
      colorScheme = ctx.theme.resolve(ctx.theme.getState().activeId).base;
      ctx.terminals.invalidateTabAdornments();
    }),
  );

  function applySnapshot(state: AgentInfo[]) {
    let ring = false;
    const next = new Map<string, AgentInfo>();
    const liveIds = new Set<string>();
    for (const a of state) {
      liveIds.add(a.terminalId);
      // Chime once when any agent finishes a run, whether or not its terminal
      // is focused — the host lands watched finishes straight on idle too, so
      // this covers both. maybePlayTransitionSound debounces simultaneous ones.
      if (stoppedWorking(agents.get(a.terminalId), a)) {
        ring = true;
        finishedUnseen.set(a.terminalId, new Date().toISOString());
      }
      // A new run clears the finished flag — "until the next run" ends here.
      if (a.activity === "working") finishedUnseen.delete(a.terminalId);
      next.set(a.terminalId, a);
    }
    // Drop flags for terminals the host no longer tracks (closed).
    for (const id of [...finishedUnseen.keys()]) {
      if (!liveIds.has(id)) finishedUnseen.delete(id);
    }
    agents.clear();
    for (const [id, a] of next) agents.set(id, a);
    // Stamp newly-done rows here rather than during a panel render, so the
    // "done for 3h" durations keep accruing even with no agent view open.
    recordDoneSince(state);
    if (ring) maybePlayTransitionSound();
    ctx.workspaces.invalidateStatus();
    ctx.terminals.invalidateTabDecorations();
    // Refreshes bindActivity too, but that's already covered above — added
    // for bindIcon (agentId can newly resolve after the terminal's already
    // been seen once, e.g. once a hook confirms the session).
    ctx.terminals.invalidateTabAdornments();
  }

  ctx.subscriptions.push(
    ctx.agents.subscribe((state) => applySnapshot(state), {
      allWorkspaces: true,
    }),
  );
  // subscribe() only fires on change, so seed the current state now — the
  // first render must already have it. Seeding compares against an empty map,
  // so it never rings the chime.
  applySnapshot(ctx.agents.getState({ allWorkspaces: true }));

  ctx.subscriptions.push(
    ctx.workspaces.bindStatus({
      id: "silo.agents.status",
      provide(workspaceId): WorkspaceStatusRow[] {
        const ws = ctx.workspaces.get(workspaceId);
        if (!ws) return [];
        const rows: WorkspaceStatusRow[] = [];
        const behavior = settingsService.getState().focusBehavior;
        const hideFocusedRow = behavior === "hide";
        for (const t of ws.terminals) {
          const a = agents.get(t.id);
          if (!a) continue;
          if (hideFocusedRow && t.id === activeTerminalId) continue;
          // Only "none" mode holds a watched finish green (see finishedUnseen).
          const forcedSince =
            behavior === "none" ? finishedUnseen.get(t.id) : undefined;
          const row = deriveStatusRow(a, forcedSince);
          if (!row) continue;
          const label = t.customName ?? stripStatusMarker(t.title);
          rows.push({
            id: t.id,
            // A restored busy/attention duration the host couldn't confirm
            // after a long app-closed gap is flagged rather than shown as if
            // freshly observed.
            label: `${label}${staleSuffix(a.stale, "label")}`,
            activity: row.activity,
            startedAt: row.startedAt,
          });
        }
        return rows;
      },
    }),
  );

  ctx.subscriptions.push(
    ctx.terminals.bindActivity({
      id: "silo.agents.tab",
      provide(terminalId) {
        const a = agents.get(terminalId);
        if (!a) return null;
        const forceAttention =
          settingsService.getState().focusBehavior === "none" &&
          finishedUnseen.has(terminalId);
        const tab = deriveTab(a, forceAttention);
        if (!tab) return null;
        return { activity: tab.activity, tooltip: tab.tooltip };
      },
    }),
  );

  ctx.subscriptions.push(
    ctx.terminals.bindIcon({
      id: "silo.agents.tab-icon",
      provide(terminalId) {
        const a = agents.get(terminalId);
        if (!a) return null;
        // Called as a plain function (not JSX) so `icon` is the component's
        // *actual* return value now — AgentIconGlyph renders null for "none"
        // mode or an unknown agent, and that has to gate whether a
        // contribution is returned at all. Constructing `<AgentIconGlyph/>`
        // instead would give a truthy element descriptor even when the
        // component ultimately renders nothing, tricking the host into
        // reserving tab space (margin, flex gap) for an empty icon slot.
        const icon = AgentIconGlyph({
          agentId: a.agentId,
          mode: settingsService.getState().iconMode,
          colorScheme,
        });
        return icon ? { icon } : null;
      },
    }),
  );

  ctx.subscriptions.push(
    ctx.terminals.subscribeActive((terminalId) => {
      activeTerminalId = terminalId;
      // Viewing a terminal acknowledges a pending finish (clears the green
      // "needs attention" flag) — unless the user chose "none", where focus
      // never touches status. `acknowledge` is a host-side no-op when the
      // terminal wasn't pending, so calling it unconditionally is safe.
      if (terminalId && settingsService.getState().focusBehavior !== "none") {
        ctx.agents.acknowledge(terminalId);
      }
      // Re-render rows on every focus change so the "hide focused row" setting
      // tracks the active terminal even when the acknowledge above was a no-op.
      ctx.workspaces.invalidateStatus();
    }),
  );

  ctx.subscriptions.push(
    ctx.workspaces.subscribe(() => {
      // Terminal titles/customNames live on workspace state, so status-row
      // labels can change even when the agent state itself hasn't.
      ctx.workspaces.invalidateStatus();
    }),
  );

  let lastGroupBy = settingsService.getState().groupBy;
  ctx.subscriptions.push(
    settingsService.subscribe((s) => {
      // Toggling "hide focused row" changes which rows render.
      ctx.workspaces.invalidateStatus();
      // Toggling iconMode changes what silo.agents.tab-icon returns.
      ctx.terminals.invalidateTabAdornments();
      // The View by control's closed-state label names the active mode, so
      // it has to be re-registered (title isn't a function like when/checked)
      // whenever the mode actually flips — not on every unrelated setting.
      if (s.groupBy !== lastGroupBy) {
        lastGroupBy = s.groupBy;
        registerGroupByToolbarItem();
      }
    }),
  );

  // A view *of the Navigator*, not a panel of its own (RFC 0023). A second
  // side panel would be a second navigator sitting beside the first, which
  // leaves no rule for which one to trust — and side-panel state is
  // per-workspace, so which navigator you were looking at could change as you
  // switched workspaces. As a view, agents are another way to read the one
  // panel. It reads `ctx.agents`/`ctx.workspaces` directly rather than the
  // `agents` map above, since it needs its own re-render subscriptions.
  // registerNavigatorView is auto-tracked on ctx.subscriptions, so no push.
  //
  // One view, not two. Status and workspace grouping were separate registered
  // views while the Navigator's selector was a dropdown; now that every view
  // is listed in the panel, two entries for one list cost a permanent row and
  // made "which Agents view am I in" a question worth asking. Grouping is a
  // preference of this view (see `groupBy` in ./settings-store), flipped from
  // the View by control below.
  //
  // The id keeps its by-status suffix: it's the persisted key for "which view
  // is active", so renaming it would drop the choice of everyone already on
  // it. `silo.agents.by-workspace` is retired — anyone parked on it
  // falls back to the Workspaces view once, and picks Agents out of the
  // Navigator's list to come back.
  ctx.registerNavigatorView({
    id: "silo.agents.by-status",
    title: "Agents",
    order: 1,
    icon: <Robot size={19} weight="duotone" />,
    component: ({ active }) => <AgentsPanel ctx={ctx} active={active} />,
  });

  // Grouping lives in the Navigator header rather than inside the list: it's
  // chrome for the view, and putting it here gets the host's button + dropdown
  // chrome, `when` scoping, and menu anchoring for free instead of spending a
  // row of the panel on a control that's flipped occasionally.
  //
  // `title` is a plain string in the SDK, not a function like `when`/`checked`,
  // so the closed-state label can't just read `groupBy` live — the control is
  // re-registered under the same id whenever the mode changes (see the
  // settingsService subscriber above) to keep the label in sync.
  let groupByToolbarItem: { dispose(): void } | undefined;
  function registerGroupByToolbarItem() {
    groupByToolbarItem?.dispose();
    const { groupBy } = settingsService.getState();
    groupByToolbarItem = ctx.registerToolbarItem({
      id: "silo.agents.group-by",
      surface: "navigator",
      // The closed-state label is the picked menu item's own label verbatim
      // (no "By ..." transform) — one string to keep in sync with the menu
      // below instead of two.
      title:
        groupBy === "age"
          ? "Recent"
          : groupBy === "workspace"
            ? "Workspace"
            : "Status",
      tooltip: "View agents by status, workspace, or recent activity",
      order: -1,
      when: (_keys, target) => target.viewId === "silo.agents.by-status",
      menu: () => {
        const { groupBy } = settingsService.getState();
        return [
          { type: "header", label: "View by" },
          {
            label: "Recent",
            checked: groupBy === "age",
            run: () => settingsService.set({ groupBy: "age" }),
          },
          {
            label: "Status",
            checked: groupBy === "status",
            run: () => settingsService.set({ groupBy: "status" }),
          },
          {
            label: "Workspace",
            checked: groupBy === "workspace",
            run: () => settingsService.set({ groupBy: "workspace" }),
          },
        ];
      },
    });
  }
  registerGroupByToolbarItem();
  ctx.subscriptions.push({ dispose: () => groupByToolbarItem?.dispose() });

  injectStyles();

  return { OptionsPanel: AgentsOptionsPanel };
}

function deactivate() {
  document.getElementById(STYLE_ID)?.remove();
  clearSettingsListeners();
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = styles;
  document.head.appendChild(style);
}

export const extension: Extension<AgentsExtensionAPI> = {
  id: "silo.agents",
  manifest: {
    name: "Agents",
    description:
      "At-a-glance agent status: an Agents view in the Navigator groupable by status or workspace, status rows on each workspace, and terminal tab badges/icons, cleared when you view the terminal.",
    version: "0.2.10",
  },
  activate,
  deactivate,
};
