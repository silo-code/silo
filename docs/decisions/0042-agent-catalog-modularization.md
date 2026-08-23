---
status: accepted
date: 2026-08-22
---

# 0042. Agent catalog modularization and declarative runtime policy

## Context

ADR 0028 sealed agent detection in the host: one curated catalog, no public
`registerAgent` API. ADR 0041 added pi via a fourth install strategy
(`pi-extension`) and live recon that exposed gaps the catalog-as-single-file
layout was never designed for:

- **Node-wrapped argv0** (`leader` is `node`; identity comes from full argv).
- **OSC 133 shell-integration zones** that look like shell working/idle once an
  agent is identified.
- **Identity-only OSC titles** (`π - …`) that must stamp `agentId` immediately.
- **Activity behind an off-by-default agent setting** (pi's
  `terminal.showTerminalProgress` for OSC 9;4).
- **In-process hooks** that pass `SILO_AGENT_PID` so the shared capture script
  can skip its parent walk (ADR 0041).

Pi support landed by threading these concerns through shared host files
(`agent-catalog.ts`, `agents-service.ts`, `agent-activity-model.ts`,
`agent-detection-dispatch.ts`) plus settings UI carve-outs
(`agents-settings/index.tsx`, `pi-settings.ts`). The behavior is correct and
well-tested; the **organization does not scale** to the next agent with a
similar shape — each quirk accretes another host-level branch.

Recon for a future agent should not require grep across a 1,100-line service
file. The sealed boundary (ADR 0028) stays; only **host-internal layout and
policy declaration** change.

## Decision

1. **Keep detection sealed.** Extensions still read `ctx.agents` only. This
   ADR does not reopen public detector registration.

2. **Split the catalog by concern, not by symmetry.** Shared infrastructure
   stays shared (`agent-osc-detectors.ts` for reusable parsers,
   `agent-hook-script.ts` for the one capture script, install strategies in
   `install-strategy.ts`). Agents with **non-trivial runtime quirks** get a
   host-internal module under `agents/` (pi first: `agents/pi.ts`). Agents
   that are mostly data (Claude, Codex, Cursor, Copilot, Grok) stay thin
   catalog entries — no forced one-file-per-agent layout for its own sake.

3. **Declare runtime policy on the catalog entry.** Extend `AgentDefinition`
   with an optional `runtime` object for host behavior that is not resume,
   install, or detection data:
   - `suppressShellIntegrationWhenIdentified` — ignore generic shell OSC
     (133 zones) once `agentId` is stamped.
   - `identityFromDetection` — a detector may set `identity: true` to stamp
     catalog id immediately (pi title).
   - `processArgsMarkers` — substring markers for `agentByProcessArgs` when
     argv0 is `node` (replaces hardcoded pi branches in derived views).

   The host applies these generically; **`agents-service.ts` must not branch
   on agent id strings.**

4. **Declare optional settings prerequisites separately from `runtime`.**
   Some agents need an opt-in toggle in Settings → Agents before activity
   detectors can fire (pi: Terminal progress →
   `~/.pi/agent/settings.json`). Model this as catalog metadata
   (`extraSettingsToggle` or equivalent), not as a `row.agent.id === "pi"`
   branch in UI code. Cursor's off-by-default `showStatusIndicators` is the
   same class of problem and should use the same mechanism when addressed.

5. **Migrate with zero user-visible regression.** Phased strangler-fig:

   | Phase | Work                                                                                                                  |
   | ----- | --------------------------------------------------------------------------------------------------------------------- |
   | 0     | Audit existing pi characterization tests; fill gaps (process-args collision safety, manual checklist for settings UI) |
   | 1     | Add `runtime` / settings types (unused)                                                                               |
   | 2     | Wire pi policy declaratively, including `processArgsMarkers`                                                          |
   | 3     | `agents/` seam with re-exports from old paths                                                                         |
   | 4     | Extract `agents/pi.ts`; decide `SILO_AGENT_PID` ownership (pi owns the value; shared script keeps the env-var gate)   |
   | 4b    | Scoped settings-UI generalization for `extraSettingsToggle`                                                           |
   | 5     | Generic `agentByProcessArgs` loop over catalog markers                                                                |
   | 6     | Extract policy-engine module **only after** a second consumer exists (real agent or test-only synthetic)              |
   | 7     | Migrate other agents to `agents/*.ts` only when a module earns it                                                     |
   | 8     | Detector ownership cleanup (shared vs per-agent rule)                                                                 |
   | 9     | Update `docs/adding-a-coding-agent.md`; remove compat shims                                                           |
   | 10    | Full generic settings UI from catalog metadata (if not done in 4b)                                                    |

   Each phase lands with `pnpm test` green and pi manual verification unchanged.

6. **Budget policy-layer work before the next pi-shaped agent.** If recon finds
   node-wrapped argv0, fake shell OSC, in-process hooks, or settings-gated
   activity, plan `runtime` / `extraSettingsToggle` fields in the same change
   that adds the catalog entry — not as a follow-up refactor.

## Consequences

- Adding a **simple** agent remains mostly a catalog entry + detectors.
- Adding a **quirky** agent has an obvious home (`agents/<id>.ts`) and
  declarative policy fields instead of host string branches.
- `agent-catalog.ts` shrinks to an index importing agent modules; derived
  views (`agentByProcessArgs`, `detectFromOsc`, …) stay generic.
- Install strategies (ADR 0041's `pi-extension`, JSON merges, session-file)
  are unchanged in principle — only where the entry lives moves.
- Phase 6 is explicitly deferred until a second policy consumer exists, per
  the repo's anti-speculation principle — the current host mechanisms already
  behave generically; extraction is for clarity, not correctness.
- `docs/adding-a-coding-agent.md`'s "one file that must change" guidance
  updates in Phase 9 to describe `agents/<id>.ts` for quirky agents.

## Alternatives considered

- **Per-agent module for every agent immediately** — rejected; Claude/Codex
  entries are mostly data and forcing symmetry only relocates boilerplate.
- **Leave pi's spread until a second quirky agent lands** — deferred as the
  default only if no new agents are planned soon; the refactor cost is lower
  now with pi's tests as a safety net.
- **Public `registerAgent` / pluggable detectors** — rejected (ADR 0028).
- **Big-bang rewrite** — rejected; live-verification-dependent behavior needs
  the phased gates above.

## References

- ADR 0028 (sealed detection boundary — unchanged)
- ADR 0041 (pi install strategy — unchanged)
- RFC 0018 · RFC 0019
- `docs/adding-a-coding-agent.md`
- `packages/extension-host/src/extension-host/agent-catalog.ts`
- `packages/extension-host/src/extension-host/agents-service.ts`
