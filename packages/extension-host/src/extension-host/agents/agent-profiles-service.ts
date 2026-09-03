// `ctx.agents.profiles` — the public Agent Profiles surface (RFC 0033 phase 3).
//
// This is the first consumer of prompt delivery and the reason the phase ships
// a product rather than a seam. Two methods, mirroring how
// `ctx.agents.catalog()` shipped in phase 1: a read-only, deeply frozen
// **summary** list (never the host's `AgentProfile` record), and a `launch()`
// that returns a **result** rather than `void`.
//
// The result is the whole point. A prompt Silo cannot quote exactly is refused,
// and an extension that asked for one needs to see *why* so it can tell its own
// user — which is what a Forward-mode CLI flag could never manage (ADR 0047's
// 2026-09-02 amendment).

import { store } from "../../state/store";
import { getAgentProfiles } from "../../state/agent-profiles";
import { activateWorkspace } from "../../state/workspaces";
import { getTerminalService } from "../terminal-service";
import { promptDeliveryForAgent } from "./agent-catalog";
import {
  profileLaunchLine,
  resolveDefaultProfile,
} from "./agent-profile-model";
import {
  composePromptLaunchLine,
  profileAcceptsPrompt,
  resolveProfileAgentId,
} from "./agent-prompt";
import { launchAgentProfile, launchShellDialect } from "./agent-launch";
import type {
  AgentProfilesService,
  AgentProfileSummary,
  LaunchAgentProfileOptions,
  LaunchAgentProfileResult,
} from "@silo-code/sdk";

/**
 * Memoized summaries, invalidated whenever the profile list changes. Same
 * reasoning as `catalogAgentSummaries()`: a caller may read this while
 * rendering, so a fresh allocation per call is a per-render cost and a mutable
 * one a correctness hazard.
 *
 * `acceptsPrompt` is derived from the catalog at build time rather than
 * persisted (R10) — it is a fact about the agent, not about the profile.
 */
let summaries: readonly AgentProfileSummary[] | null = null;

/** Drop the memoized summaries. Called on any change to the profile list. */
export function invalidateProfileSummaries(): void {
  summaries = null;
}

function buildSummaries(): readonly AgentProfileSummary[] {
  if (summaries) return summaries;
  summaries = Object.freeze(
    getAgentProfiles().map((p) =>
      Object.freeze({
        id: p.id,
        label: p.label,
        isDefault: p.default === true,
        acceptsPrompt: profileAcceptsPrompt(p),
      }),
    ),
  );
  return summaries;
}

/** @internal — host factory; extensions receive this as `ctx.agents.profiles`. */
export function createAgentProfilesService(): AgentProfilesService {
  return {
    list() {
      return buildSummaries();
    },

    launch(options: LaunchAgentProfileOptions = {}): LaunchAgentProfileResult {
      const profiles = getAgentProfiles();
      const profile = options.profileId
        ? profiles.find((p) => p.id === options.profileId)
        : resolveDefaultProfile(profiles);
      if (!profile) return { ok: false, refusal: "no-profile" };

      const workspaceId = options.workspaceId ?? store.activeWorkspaceId;
      if (!workspaceId || !store.workspaces[workspaceId])
        return { ok: false, refusal: "no-workspace" };

      // Precheck (R7): a prompt that cannot be delivered aborts here, before
      // anything is created — no terminal record, no activation, no focus. The
      // dialect is decided once, right now, and carried on the pending launch,
      // so the drain cannot reach a different conclusion about it.
      const dialect = launchShellDialect();
      if (options.prompt !== undefined) {
        const agentId = resolveProfileAgentId(profile);
        const composed = composePromptLaunchLine({
          launchLine: profileLaunchLine(profile),
          prompt: options.prompt,
          agentId,
          delivery: promptDeliveryForAgent(agentId),
          dialect,
        });
        if ("refusal" in composed)
          return { ok: false, refusal: composed.refusal };
      }

      const rec = launchAgentProfile({
        profileId: profile.id,
        workspaceId,
        cwd: options.cwd,
        ...(options.prompt === undefined
          ? {}
          : { prompt: options.prompt, dialect }),
      });
      // `launchAgentProfile` re-checks the same two things this method already
      // resolved, so this is unreachable in practice — but it returns
      // `undefined` for "no workspace or no profile", and that is the honest
      // mapping if it ever does.
      if (!rec) return { ok: false, refusal: "no-profile" };

      if (options.activate !== false) {
        activateWorkspace(workspaceId);
        getTerminalService().focus(rec.id);
      }
      return { ok: true, terminalId: rec.id };
    },
  };
}
