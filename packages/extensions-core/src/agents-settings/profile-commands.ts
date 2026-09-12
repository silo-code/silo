/**
 * Agent-launch commands (RFC 0033 phase 2 — R1, R3). Turns each Agent Profile
 * into a `core.newAgent.<profileId>` command, plus one generic `core.newAgent`
 * that launches the default profile. Registered through the public
 * `ctx.registerCommand`, so both are bindable on the Keyboard Shortcuts page
 * and palette-ready whenever a palette lands.
 *
 * The per-profile set is reconciled against the live profile list on every
 * change: an add registers, a delete disposes, an id rename is a dispose plus
 * an add (the old command id must stop existing — that is what makes a stale
 * keybinding go inert, R6), and a label change re-registers to refresh the
 * command label.
 */
import type { ExtensionContext, Disposable } from "@silo-code/sdk";
import {
  store,
  getAgentProfiles,
  subscribeAgentProfiles,
  startAgentProfile,
  resolveDefaultProfile,
  profileCommandId,
  openSettings,
  type AgentProfile,
} from "@silo-code/extension-host/internal";

/** Start a profile from a keybinding or the palette — `startAgentProfile`
 *  decides *what* that means, and this adds only the placement a command can
 *  offer, which is none. A Terminal profile's tab appears from the record
 *  itself (like `core.newTerminal`); a Chat profile opens into the layout's
 *  default position, since a keybinding has no dock group to target the way
 *  the `+` menu does. Both go through the same dispatch as the menu, so a
 *  keybinding and a click cannot disagree. */
async function launch(ctx: ExtensionContext, profileId: string): Promise<void> {
  const wsId = store.activeWorkspaceId;
  if (!wsId) return;
  const profile = getAgentProfiles().find((p) => p.id === profileId);
  if (!profile) return;

  const start = await startAgentProfile(profile, wsId);
  if (start.outcome === "panel") {
    ctx.layout.openPanel(start.panelKindId, start.params);
  } else if (start.outcome === "refused") {
    ctx.ui.notify("warn", start.message);
  }
  // "terminal" needs nothing — the record is what makes the tab appear.
  // "cancelled" is silent by design.
}

/** Register the two command shapes and keep the per-profile set synced.
 *  Returns one disposer that tears down every registration and the
 *  subscription. */
export function registerProfileCommands(ctx: ExtensionContext): Disposable {
  // profile id → { command disposable, the label it was registered with }
  const perProfile = new Map<string, { dispose: Disposable; label: string }>();

  function registerOne(p: AgentProfile): void {
    const dispose = ctx.registerCommand({
      id: profileCommandId(p.id),
      label: `New Agent: ${p.label}`,
      run: () => void launch(ctx, p.id),
    });
    perProfile.set(p.id, { dispose, label: p.label });
  }

  function reconcile(): void {
    const profiles = getAgentProfiles();
    const live = new Set(profiles.map((p) => p.id));

    // Drop commands for ids no longer present (delete, or the old side of a
    // rename).
    for (const [id, entry] of perProfile) {
      if (!live.has(id)) {
        entry.dispose.dispose();
        perProfile.delete(id);
      }
    }

    // Add new ids; re-register when only the label moved (Command is a value in
    // the registry with no in-place update).
    for (const p of profiles) {
      const entry = perProfile.get(p.id);
      if (!entry) {
        registerOne(p);
      } else if (entry.label !== p.label) {
        entry.dispose.dispose();
        perProfile.delete(p.id);
        registerOne(p);
      }
    }
  }

  // The generic command registers once and never re-registers — that stable id
  // is the whole point of it (R3). With no profiles it opens Settings → Agents,
  // matching the `+` menu's empty state.
  const generic = ctx.registerCommand({
    id: "core.newAgent",
    label: "New Agent",
    run: () => {
      const target = resolveDefaultProfile(getAgentProfiles());
      if (!target) {
        openSettings("agents");
        return;
      }
      void launch(ctx, target.id);
    },
  });

  reconcile();
  const unsubscribe = subscribeAgentProfiles(reconcile);

  return {
    dispose() {
      unsubscribe();
      generic.dispose();
      for (const entry of perProfile.values()) entry.dispose.dispose();
      perProfile.clear();
    },
  };
}
