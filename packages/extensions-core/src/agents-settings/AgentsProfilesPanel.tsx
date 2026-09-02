/**
 * Settings → Agents → **Profiles** (RFC 0033 R13). The profile list (`List` /
 * `ListRow` / `AddRow` — ADR 0026), then a "Found on this machine" one-click-add
 * section below it. The editor is a host `Modal` (`ctx.ui.showModal`).
 */
import { useCallback, useEffect, useState } from "react";
import type { ExtensionContext } from "@silo-code/sdk";
import { AddRow, List, useServiceState } from "@silo-code/sdk";
import {
  getAgentProfiles,
  subscribeAgentProfiles,
  removeAgentProfile,
  moveAgentProfile,
  setDefaultAgentProfile,
  clearDefaultAgentProfile,
  hookInstallableAgents,
  sessionFileAgents,
  type AgentProfile,
} from "@silo-code/extension-host/internal";
import { ProfileRow } from "./ProfileRow";
import { ProfileEditorModal } from "./ProfileEditorModal";
import { FoundOnThisMachine } from "./FoundOnThisMachine";
import { installerFor } from "./install-strategy";
import { resolveHomeDir, settingsPathFor } from "./hook-self-heal";

/** Catalog agent ids whose resume is not best-effort — a session-file agent
 *  (always) or a hook-installable agent with its hook actually installed. */
async function resumeReadyAgentIds(
  ctx: ExtensionContext,
): Promise<Set<string>> {
  const ready = new Set<string>(sessionFileAgents().map((a) => a.id));
  const home = await resolveHomeDir(ctx);
  if (!home) return ready;
  for (const agent of hookInstallableAgents()) {
    try {
      const installed = await installerFor(agent.resume).isInstalled(
        ctx,
        agent.resume,
        settingsPathFor(agent, home),
      );
      if (installed) ready.add(agent.id);
    } catch {
      // treat "can't tell" as not-ready
    }
  }
  return ready;
}

export function AgentsProfilesPanel({
  ctx,
  onOpenSessions,
}: {
  ctx: ExtensionContext;
  onOpenSessions: () => void;
}) {
  const [, setTick] = useState(0);
  const [resumeReady, setResumeReady] = useState<Set<string>>(new Set());

  useEffect(() => subscribeAgentProfiles(() => setTick((t) => t + 1)), []);
  useEffect(() => {
    void resumeReadyAgentIds(ctx).then(setResumeReady);
  }, [ctx]);

  const profiles = getAgentProfiles();
  const themeState = useServiceState(ctx.theme);
  const colorScheme = ctx.theme.resolve(themeState.activeId).base;

  const openEditor = useCallback(
    (opts?: {
      /** The profile to edit. */
      profile?: AgentProfile;
      /** Prefill for a new profile (Duplicate). */
      initial?: Partial<AgentProfile>;
      focusConfigDir?: boolean;
    }) => {
      void ctx.ui.showModal(
        (close) => (
          <ProfileEditorModal
            ctx={ctx}
            profile={opts?.profile}
            initial={opts?.initial}
            focusConfigDir={opts?.focusConfigDir}
            close={() => close()}
          />
        ),
        {
          title: opts?.profile ? "Edit agent profile" : "New agent profile",
          size: "md",
        },
      );
    },
    [ctx],
  );

  const onDelete = useCallback(
    async (profile: AgentProfile) => {
      const ok = await ctx.ui.confirm({
        title: "Delete agent profile?",
        body: `“${profile.label}” will be removed. Terminals it started keep running.`,
        confirmLabel: "Delete",
        danger: true,
      });
      if (ok) removeAgentProfile(profile.id);
    },
    [ctx],
  );

  const covered = new Set(
    profiles.map((p) => p.assumedAgentId).filter((x): x is string => !!x),
  );
  const existingProfileIds = new Set(profiles.map((p) => p.id));

  return (
    <div className="apf-panel">
      {profiles.length > 0 ? (
        <>
          <List aria-label="Agent profiles">
            {profiles.map((p, i) => (
              <ProfileRow
                key={p.id}
                ctx={ctx}
                profile={p}
                colorScheme={colorScheme}
                index={i}
                count={profiles.length}
                bestEffortResume={
                  p.assumedAgentId != null && !resumeReady.has(p.assumedAgentId)
                }
                onEdit={() => openEditor({ profile: p })}
                onDuplicate={() =>
                  openEditor({
                    initial: {
                      command: p.command,
                      configDir: p.configDir,
                      assumedAgentId: p.assumedAgentId,
                      id: `${p.id}-copy`,
                      label: `${p.label} (copy)`,
                    },
                    focusConfigDir: true,
                  })
                }
                onMove={(delta) => moveAgentProfile(p.id, delta)}
                onDelete={() => void onDelete(p)}
                onSetDefault={() => setDefaultAgentProfile(p.id)}
                onClearDefault={() => clearDefaultAgentProfile()}
                onOpenSessions={onOpenSessions}
              />
            ))}
          </List>
          <AddRow onClick={() => openEditor()}>Add an agent profile…</AddRow>
        </>
      ) : (
        <div className="apf-empty">
          <p className="apf-empty-title">No agent profiles yet</p>
          <p className="apf-empty-desc">
            A profile is a named way to start a coding agent in a terminal — a
            label, a command, and optionally a second-account config directory.
            Add one below, or create your own.
          </p>
          <AddRow onClick={() => openEditor()}>Add an agent profile…</AddRow>
        </div>
      )}

      <FoundOnThisMachine
        ctx={ctx}
        coveredAgentIds={covered}
        existingProfileIds={existingProfileIds}
        colorScheme={colorScheme}
      />
    </div>
  );
}
