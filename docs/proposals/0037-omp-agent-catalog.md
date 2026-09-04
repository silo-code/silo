---
status: draft
created: 2026-09-04
---

# 0037. OMP as a standalone catalog agent

## Summary

Add **`omp`** as its own entry in Silo's sealed agent catalog — distinct from
**`pi`** — so terminals running [Oh My Pi](https://github.com/can1357/oh-my-pi)
(OMP, the `omp` CLI) are identified, tracked, and resumed as OMP, not as
upstream pi. OMP is a pi-forked harness (same extension API, same OSC
progress protocol, same `π - …` window title today), but it is a **different
binary**, **different config home** (`~/.omp/agent/`), and **different resume
syntax** (`omp --resume <id>`). Silo must treat it accordingly.

Ship **Tier 3** (identified + activity + exact resume), reusing the existing
`pi-extension` install strategy and pi's OSC detectors where the wire format
matches — with explicit disambiguation work so OMP and pi cannot stamp each
other's identity.

## Motivation

OMP is already in daily use as a Silo terminal agent. Today it is misclassified
as **`pi`** because:

1. **OSC 0 title** — OMP's TUI still sets the window title to
   `π - <session> - <cwd>`, and `detectPiTitle` hard-codes `agentId: "pi"` for
   that prefix.
2. **Shared detectors** — OMP emits the same OSC 9;4 progress sequences pi uses
   (`detectCopilotCLI`), gated on the same `terminal.showTerminalProgress`
   setting shape.
3. **Foreground resolution gap** — OMP runs as `bun ~/.bun/bin/omp` (argv0 is
   `bun`, not `omp`). `agentByProcessArgs` already understands bun-wrapped
   leaders, but `noteForeground` only triggers that path when the leader
   basename is `node`, not `bun`.

The symptom is not cosmetic. Wrong `agentId` means wrong Settings → Agents hook
path (pi's `~/.pi/agent/extensions/` instead of OMP's `~/.omp/agent/extensions/`),
wrong resume command (`pi --session …` instead of `omp --resume …`), wrong
`configDirEnvVar` semantics for Agent Profiles, and wrong display name/icon in
Workspaces and the Agents panel.

Pi support (ADR 0041, catalog entry in `agents/catalog/pi.ts`) established the
**pi-shaped** recipe: TypeScript extension hook, OSC 9;4 activity, title-based
identity. OMP fits that shape but is **not** pi — it needs its own catalog row
and disambiguation, not an assumption that "pi-shaped" means "pi."

## Reconnaissance (live, 2026-09-04)

Confirmed against **omp 18.1.10** (`~/.bun/bin/omp`) on macOS, with pi 0.85.0
also installed for comparison.

| Question | OMP answer |
| -------- | ---------- |
| Binary / argv0 | `omp` on PATH is a Bun script (`#!/usr/bin/env bun`); `ps` reports **`bun /…/omp`**, not `omp` |
| Package identity | Bundled as `@oh-my-pi/pi-coding-agent` 18.1.10; markers `oh-my-pi`, `@oh-my-pi/pi-coding-agent` appear in argv when invoked through the package |
| Config home | `~/.omp/agent/` (sessions, extensions, settings); OMP sets `PI_CODING_AGENT_DIR` at runtime to this path |
| Profiles | `--profile=<name>` isolates auth, sessions, settings, caches (`OMP_PROFILE` / `PI_PROFILE` env aliases documented in binary) |
| OSC 0 title | **`π - <session> - <cwd>`** — identical prefix to pi today (**collision**) |
| OSC 9;4 progress | Same ConEmu protocol as pi (`4;3` working, `4;0` idle), behind `terminal.showTerminalProgress` (defaults **false**) |
| OSC 133 | Message-zone wrappers — same "useful noise, not identity" class as pi |
| Session storage | `~/.omp/agent/sessions/<slugified-cwd>/<timestamp>_<uuid>.jsonl` |
| Live pid registry | **None** — same as pi; exact resume requires the in-process extension hook |
| Session-start hook | TypeScript extension API (`pi.on("session_start", …)`), auto-loaded from `~/.omp/agent/extensions/*.ts` |
| Exact resume | **`omp --resume <id>`** (ID prefix, path, or picker if omitted); `-c/--continue` for previous session |
| Opening prompt | Positional `[messages…]` stays interactive (same class as pi's `{ kind: "argv" }`) |

**UNVERIFIED / follow-up during implementation:** whether `@earendil-works/pi-coding-agent` type imports in Silo's generated extension still type-check under OMP's jiti loader (OMP also ships legacy shims; user's `xerro-mem.ts` uses `@earendil-works/pi-coding-agent` successfully). Confirm during hook install QA.

## Design

### 1. Catalog entry (`agents/catalog/omp.ts`)

Add a factory mirroring `buildPiAgentDefinition`, wired into `AGENT_CATALOG`
**before** `pi` (detection-dispatch order matters for any shared detector that
might otherwise stamp the wrong id).

| Field | Value |
| ----- | ----- |
| `id` | `omp` |
| `displayName` | `OMP` |
| `leaderNames` | `["omp"]` |
| `configDirEnvVar` | `PI_CODING_AGENT_DIR` (OMP resolves this to `~/.omp/agent` by default; document in `contract` that `OMP_PROFILE` / `--profile` further isolates accounts — same discipline as RFC 0033's per-agent recon) |
| `promptDelivery` | `{ kind: "argv" }` |
| `titleIdentityPrefix` | TBD — see §3 |
| `activityDetectors` | Identity detector (§3) + `detectCopilotCLI` |
| `resume` | `kind: "hook"`, `installStrategy: "pi-extension"`, `configPath: ".omp/agent/extensions/silo-track-session.ts"`, `buildResumeCommand: (id) => \`omp --resume ${id}\`` |
| `runtime.processArgsMarkers` | `["oh-my-pi", "@oh-my-pi/pi-coding-agent"]` |
| `runtime.suppressShellIntegrationWhenIdentified` | `true` (same policy as pi) |
| `runtime.identityFromDetection` | `true` |
| `extraSettingsToggle` | Same shape as pi's "Terminal progress" row, `settingsPathRel: ".omp/agent/settings.json"` |

Reuse `renderPiTrackSessionExtension` with `agentId: "omp"` — the extension
template is already parameterized; only the capture-script tag and hook
`configPath` change.

Generalize `buildPiExtensionSource()` in `agent-catalog.ts` to accept an
`agentId` parameter (today it hard-codes `"pi"`), or add `buildOmpExtensionSource()`
that delegates to the same renderer — prefer the parameterized form so the
SSOT stays one template.

### 2. Foreground resolution for Bun-wrapped OMP

`SCRIPT_INTERPRETERS` in `agentByProcessArgs` already includes `bun`, but
`noteForeground` in `agents-service.ts` only calls `resolveNodeWrappedAgent`
when `leaderBasename(fg.leader) === "node"`.

**Change:** treat `bun` (and, for consistency, `deno`) the same as `node` in
that branch — when the leader is an interpreter and the terminal is not at a
shell prompt, resolve the full argv via `agentByProcessArgs`. This is
agent-agnostic; OMP is the motivating case, but any future Bun-distributed CLI
benefits.

Add a fixture test: `agentByProcessArgs("bun /Users/x/.bun/bin/omp")` → `omp`.

### 3. Identity disambiguation (required)

Adding the catalog entry alone is **not** sufficient while both agents share
the `π - ` OSC 0 title prefix.

**Preferred (OMP upstream):** OMP changes its window title to a distinct
prefix, e.g. `omp - <session> - <cwd>`. Silo adds `detectOmpTitle` (or a
parameterized title detector) with `agentId: "omp"` and `OMP_TITLE_PREFIX`.
Pi keeps `detectPiTitle` / `PI_TITLE_PREFIX`.

**Silo-side minimum (if title unchanged):**

- Rely on foreground argv resolution (`bun …/omp` → `omp`) as the **primary**
  identity source when process args are available.
- Do **not** let `detectPiTitle` stamp `pi` when `agentByProcessArgs` would
  return `omp` for the foreground pgid — requires threading process context
  into detection or post-filtering identity stamps (design detail in
  implementation; document the chosen approach in the ADR if non-obvious).
- Catalog order: `omp` before `pi` only helps if a future shared detector
  carries per-agent `agentId`; today's `detectPiTitle` is pi-hardcoded.

**Recommendation in this RFC:** pursue **both** — land Silo catalog + bun
foreground fix immediately; open a small OMP PR for a distinct title prefix so
identity works even before foreground ticks arrive (plain-shell promotion path).

### 4. Settings → Agents

No new install strategy. `pi-extension` is already path-driven via
`resume.configPath` — OMP gets its own row installing
`~/.omp/agent/extensions/silo-track-session.ts`. Extend
`docs/agent-catalog-manual-checklist.md` with an OMP section (or generalize the
pi checklist to "pi-extension agents").

### 5. Surfaces beyond the catalog

Per `docs/adding-a-coding-agent.md` Step 8:

- `agent-icons.ts` — OMP icon (distinct from pi's π glyph; suggest "OMP" wordmark
  or a fork-specific mark — design TBD)
- `agent-catalog.test.ts` — leader maps, process-args markers, resume command,
  extension source contains `agentId: "omp"` / `[script, "omp"]`
- `agent-osc-detectors.test.ts` — if a distinct title prefix lands
- `agents-service.test.ts` — bun-wrapped foreground sticks `omp`; identity not
  overwritten by pi title when both could fire
- `apps/docs/guide/agent-sessions.md` — `### OMP {#omp}` section; `docsUrl` on
  the entry
- Website "works with" copy + `AgentIconId` union if applicable
- `docs/domain-language.md` — extend catalog agent list with `"omp"`

### 6. Relationship to pi

OMP and pi remain **separate catalog agents**. Users may run both; Agent
Profiles may point at either command. Silo does not collapse them into one
"pi family" id — that would recreate the misclassification problem at the
profile layer.

Shared implementation (detectors, extension template, install strategy) is
encouraged; shared **identity** is not.

## Alternatives considered

| Option | Why not |
| ------ | ------- |
| **Alias OMP → pi in the catalog** | Wrong resume syntax, wrong hook path, wrong config dir; breaks multi-account OMP profiles and confuses users who run both CLIs |
| **Detect only via `processArgsMarkers`, no catalog row** | No Settings row, no resume builder, no icon, no `ctx.agents.catalog()` entry — not "supported" per RFC 0018 tiers |
| **Tier 1–2 only (no hook / resume)** | OMP has the same extension hook mechanism pi has; deferring Tier 3 saves little and leaves exact resume broken for a primary daily driver |
| **New `omp-extension` install strategy** | `pi-extension` is already generic; only `configPath` and `buildFileContents` differ — a second strategy would duplicate `pi-extension-installer.ts` for no schema difference |
| **Wait for OMP to diverge on wire protocol** | Activity and hook shapes already match; the only blocker for standalone identity is title collision + bun foreground — both are solvable now |

## Scope

**In scope**

- Catalog module, tests, icon, docs, bun foreground fix, generalized extension
  source builder, manual checklist update
- Coordination note / upstream issue for distinct OMP window title (can ship
  after Silo lands)

**Out of scope**

- Merging OMP and pi Agent Profile defaults
- Changes to the sealed detection model (ADR 0028)
- OpenCode-style deferred resume — OMP has a verified hook path on day one
- Auto-installing Silo's hook without user action (same opt-in contract as pi)

## Implementation plan (high level)

1. **Recon lock** — paste `verifiedAgainstVersion: "omp@18.1.10"` into the entry;
   re-run opening-prompt and `--resume` smoke tests if OMP bumps.
2. **Catalog + tests** — `omp.ts`, wire `AGENT_CATALOG`, marker tests.
3. **Host fix** — bun/deno branch in `noteForeground`; service test.
4. **Identity** — distinct title detector or pi-title guard; coordinate OMP
   title prefix upstream.
5. **Settings/docs/icon** — user-visible surfaces.
6. **ADR** — short accepted ADR (or extend 0042 implementation note) recording
   the bun foreground generalization and OMP/pi disambiguation decision.

## Decision

_Draft — to be filled when accepted._

## References

- `docs/adding-a-coding-agent.md` — recipe and tiers
- [RFC 0018](./0018-ctx-agents-surface.md) — `ctx.agents`, sealed catalog
- [RFC 0033](./0033-agent-profiles.md) — `configDirEnvVar`, opening prompts
- [ADR 0041](../decisions/0041-pi-hook-as-installed-extension.md) — pi extension hook
- [ADR 0042](../decisions/0042-agent-catalog-modularization.md) — catalog modules, `runtime` policy
- [ADR 0043](../decisions/0043-opencode-tiered-support.md) — tiered shipping precedent (OMP ships all three tiers)
