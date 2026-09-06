---
status: accepted
created: 2026-09-04
---

# 0037. OMP as a standalone catalog agent

## Summary

Add **`omp`** as its own entry in Silo's sealed agent catalog — distinct from
**`pi`** — so terminals running [Oh My Pi](https://github.com/can1357/oh-my-pi)
(OMP, the `omp` CLI) are identified, tracked, and resumed as OMP, not as
upstream pi. OMP is a pi-forked harness (same extension-hook mechanism, same
`π` brand glyph in its window title), but it is a **different binary**,
**different config home** (`~/.omp/agent/`), **different settings format**
(YAML), and **different resume syntax** (`omp --resume <id>`). Silo must treat
it accordingly.

Ship **Tier 3** (identified + activity + exact resume), reusing the existing
`pi-extension` install strategy and the extension template pi already uses,
with a dedicated OMP title detector for identity and activity.

## Planning scope

**This is a single-phase proposal** — no phase table. The planning package
covers the whole change: the `omp` catalog entry, `detectOmpTitle`, the
interpreter-wrapped foreground fix, the shared pi-extension template, and
every user-visible surface that names an agent.

Baseline is HEAD on `main`: pi ships as a Tier 3 catalog agent
(`agents/catalog/pi.ts`, ADR 0041 / ADR 0042), and OMP is not in the catalog
at all.

## Motivation

OMP is already in daily use as a Silo terminal agent, and today Silo does not
know it exists. An OMP terminal is invisible to the catalog on three counts:

1. **No catalog row** — `omp` is not an id Silo knows, so there is no display
   name, no icon, no Settings → Agents install row, and no
   `ctx.agents.catalog()` entry.
2. **No detector** — OMP's OSC 0 title is its own shape, matched by none of
   the existing detectors, so an OMP terminal never lights up as working or
   idle and is never promoted to an agent terminal by its output.
3. **Foreground resolution gap** — OMP runs as `bun ~/.bun/bin/omp` (argv0 is
   `bun`, not `omp`). `agentByProcessArgs` already understands bun-wrapped
   leaders, but `noteForeground` only triggers that path when the leader
   basename is `node`, not `bun` — so even the process-level answer never gets
   asked for.

The one place OMP _is_ seen, it is seen wrongly: `agentByProcessArgs`'s
package-path pass matches pi's `pi-coding-agent` marker inside OMP's own
`@oh-my-pi/pi-coding-agent` path. An OMP install invoked through its package
file therefore resolves to **pi** — the wrong Settings → Agents hook path
(`~/.pi/agent/extensions/` instead of `~/.omp/agent/extensions/`), the wrong
resume command (`pi --session …` instead of `omp --resume …`), and the wrong
name and icon everywhere Silo shows one.

Pi support (ADR 0041, catalog entry in `agents/catalog/pi.ts`) established the
**pi-shaped** recipe: a TypeScript extension hook, and identity from an OSC 0
title. OMP reuses the hook mechanism exactly and diverges on everything a
catalog row records — which is precisely why it is a row of its own rather
than an alias.

## Reconnaissance (live, 2026-09-04)

Confirmed against **omp 18.1.10** (`~/.bun/bin/omp`) on macOS: a real PTY
capture of a full session (`script`, OSC sequences extracted from the raw
stream), a `ps` poll against the live process, and OMP's own shipped sources
(`src/utils/title-generator.ts`, `src/config/settings-schema.ts`,
`src/config/settings.ts`, `examples/extensions/`).

| Question              | OMP answer                                                                                                                                                                                                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Binary / argv0        | `omp` on PATH is a Bun script (`#!/usr/bin/env bun`); `ps` reports `comm=bun`, `args=`**`bun /Users/…/.bun/bin/omp`** — confirmed against the live process                                                                                                                                                     |
| Package identity      | Bundled as `@oh-my-pi/pi-coding-agent` 18.1.10, installed at `~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent`                                                                                                                                                                                    |
| Config home           | `~/.omp/agent/` (sessions, extensions, config); OMP resolves `PI_CODING_AGENT_DIR` to this path and re-exports it at runtime                                                                                                                                                                                   |
| Profiles              | `--profile=<name>` isolates auth, sessions, settings, caches; `OMP_PROFILE` / `PI_PROFILE` are the env aliases                                                                                                                                                                                                 |
| **OSC 0 title**       | **`π > <label>`** idle · **`π ⠋ <label>`** working (10-frame braille, 80 ms) · **`π ! <label>`** waiting on the user · **`π: <label>`** when `tui.titleState` is off. `<label>` is the generated session name, else the cwd basename. Without a label the separator trails the brand (`π >`). **Never `π - `** |
| Title state setting   | `tui.titleState`, **defaults `true`** — the run-state separator is on out of the box                                                                                                                                                                                                                           |
| OSC 9;4 progress      | Exists, but behind **`terminal.showProgress`** (not pi's `terminal.showTerminalProgress`), default **false** — none observed in the capture                                                                                                                                                                    |
| Settings file         | **`~/.omp/agent/config.yml` (YAML)**. `settings.json` is a legacy path OMP migrates from once and renames to `.bak`                                                                                                                                                                                            |
| Session storage       | `~/.omp/agent/sessions/<slugified-cwd>/<timestamp>_<uuid>.jsonl` — confirmed on disk                                                                                                                                                                                                                           |
| Live pid registry     | **None** — same as pi; exact resume requires the in-process extension hook                                                                                                                                                                                                                                     |
| Session-start hook    | TypeScript extension API (`pi.on("session_start", …)`), auto-loaded from `~/.omp/agent/extensions/*.ts`; `ctx.sessionManager.getSessionId()` is on the `ReadonlySessionManager` it hands the handler                                                                                                           |
| Extension type import | OMP's own bundled examples import `@oh-my-pi/pi-coding-agent`, which is the package actually installed for it; `ExtensionAPI` / `ExtensionContext` are both exported from it                                                                                                                                   |
| Exact resume          | **`omp --resume <id>`** — OMP itself prints `Resume this session with omp --resume <uuid>` on exit                                                                                                                                                                                                             |
| Opening prompt        | Positional `[MESSAGES…]`; run in a real PTY, `omp "say hello and nothing else"` accepted the message and stayed in the TUI mid-turn → `{ kind: "argv" }`                                                                                                                                                       |

### Correction to the accepted recon

The version of this proposal accepted earlier the same day recorded OMP's
title as `π - <session> - <cwd>`, identical to pi's, and built its whole
identity design around resolving that collision. **That is wrong at 18.1.10**
— OMP's title is the `π <separator> <label>` shape above, and `π - ` is not a
separator OMP can produce. There is no collision with `detectPiTitle`.

Two further corrections fell out of the same pass: OMP's OSC 9;4 setting is
`terminal.showProgress`, not pi's `terminal.showTerminalProgress`, and OMP's
settings live in YAML rather than JSON.

What this changes is recorded in the **Decision** section below.

## Design

### 1. Catalog entry (`agents/catalog/omp.ts`)

Add a factory mirroring `buildPiAgentDefinition`, wired into `AGENT_CATALOG`
**before** `pi` — load-bearing, because pi's `pi-coding-agent` marker matches
inside OMP's own `@oh-my-pi/pi-coding-agent` package path (§3).

| Field                                            | Value                                                                                                                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                             | `omp`                                                                                                                                                                |
| `displayName`                                    | `OMP`                                                                                                                                                                |
| `leaderNames`                                    | `["omp"]`                                                                                                                                                            |
| `configDirEnvVar`                                | `PI_CODING_AGENT_DIR` (OMP resolves it to `~/.omp/agent`; `contract` records that `--profile` / `OMP_PROFILE` isolate accounts further)                              |
| `promptDelivery`                                 | `{ kind: "argv" }`                                                                                                                                                   |
| `titleIdentityPrefix`                            | `"π "` — the brand-plus-space every OMP title leads with, stripped for display once the tab shows OMP's own icon                                                     |
| `activityDetectors`                              | `[detectOmpTitle]` (§2)                                                                                                                                              |
| `resume`                                         | `kind: "hook"`, `installStrategy: "pi-extension"`, `configPath: ".omp/agent/extensions/silo-track-session.ts"`, `buildResumeCommand: (id) => \`omp --resume ${id}\`` |
| `runtime.processArgsMarkers`                     | `["oh-my-pi", "@oh-my-pi/pi-coding-agent"]`                                                                                                                          |
| `runtime.suppressShellIntegrationWhenIdentified` | `true` (same policy as pi)                                                                                                                                           |
| `runtime.identityFromDetection`                  | `true`                                                                                                                                                               |
| `extraSettingsToggle`                            | **None.** OMP's OSC 9;4 setting lives in YAML, and its title already reports state by default (§2)                                                                   |

The extension body is the template pi already emits, called with
`agentId: "omp"`, OMP's display name for the header prose, and
`@oh-my-pi/pi-coding-agent` as the type-import specifier.

### 2. `detectOmpTitle` — identity _and_ activity from one title

OMP's OSC 0 title is `π <separator> <label>`, and the separator **is** the run
state: `>` idle, a braille spinner frame working, `!` waiting on the user,
`:` when `tui.titleState` is off. That setting defaults **on**, so this signal
is live out of the box — unlike OSC 9;4, which OMP gates behind
`terminal.showProgress` (default off) and which Silo therefore does not read
at all.

This is the same shape as `detectCopilotTitle`: one detector carrying
`agentId` plus a status. `!` maps to `idle` — the agent is waiting on the
user, which is exactly when Silo should raise attention.

Because the shape is OMP-specific and `π - ` is not a separator OMP can
produce, `detectPiTitle` and `detectOmpTitle` are disjoint. Neither can stamp
the other's id, on any platform.

### 3. Catalog order and the `pi-coding-agent` marker collision

`agentByProcessArgs`'s third pass walks the catalog testing
`runtime.processArgsMarkers` with `includesPathMarker`, whose boundary
characters exclude `-` and `@`. pi's marker `pi-coding-agent` occurs inside
`@oh-my-pi/pi-coding-agent` preceded by `/` — a valid boundary — so an OMP
install invoked through its package file matches **pi's** marker. Only catalog
order decides the winner.

Ordering is the fix rather than tightening pi's marker to its scoped form,
because a scoped-only marker would stop matching an unscoped or vendored pi
install. A test locks the ordering so a reorder fails loudly.

### 4. Foreground resolution for Bun-wrapped OMP

`SCRIPT_INTERPRETERS` in `agent-catalog.ts` already holds `node`, `bun`, and
`deno`; `noteForeground` in `agents-service.ts` just doesn't use it, testing
`leaderBasename(fg.leader) === "node"` inline. Export a predicate and call it
from that branch, so the set is stated once. Agent-agnostic: OMP is the
motivating case, but any Bun- or Deno-distributed CLI benefits.

### 5. Settings → Agents

No new install strategy. `pi-extension` is already path-driven via
`resume.configPath` — OMP gets its own row installing
`~/.omp/agent/extensions/silo-track-session.ts`. Generalize
`docs/agent-catalog-manual-checklist.md` to cover both pi-extension agents.

### 6. Surfaces beyond the catalog

Per `docs/adding-a-coding-agent.md` Step 8: an OMP icon distinguishable from
pi's at tab size; an `### OMP {#omp}` section in
`apps/docs/guide/agent-sessions.md` matching the entry's `docsUrl`; the
"works with" copy in `apps/docs/index.md` and
`apps/website/src/homepage-copy.ts`; and `"omp"` in the catalog-agent id union
in `docs/domain-language.md`.

### 7. Relationship to pi

OMP and pi remain **separate catalog agents**. Users may run both; Agent
Profiles may point at either command. Silo does not collapse them into one
"pi family" id — that would recreate the misclassification problem at the
profile layer.

Shared implementation (the extension template, the `pi-extension` install
strategy) is encouraged; shared **identity** is not.

## Alternatives considered

| Option                                                                       | Why not                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Alias OMP → pi in the catalog**                                            | Wrong resume syntax, wrong hook path, wrong config dir; breaks multi-account OMP profiles and confuses users who run both CLIs                                                                                                                                                                                                                                                                                                                                             |
| **Detect only via `processArgsMarkers`, no catalog row**                     | No Settings row, no resume builder, no icon, no `ctx.agents.catalog()` entry — not "supported" per RFC 0018 tiers                                                                                                                                                                                                                                                                                                                                                          |
| **Tier 1–2 only (no hook / resume)**                                         | OMP has the same extension hook mechanism pi has; deferring Tier 3 saves little and leaves exact resume broken for a primary daily driver                                                                                                                                                                                                                                                                                                                                  |
| **New `omp-extension` install strategy**                                     | `pi-extension` is already generic; only `configPath` and `buildFileContents` differ — a second strategy would duplicate `pi-extension-installer.ts` for no schema difference                                                                                                                                                                                                                                                                                               |
| **Reuse `detectPiTitle` for OMP**                                            | Superficially attractive while both titles start with `π`, but OMP's separator carries run state pi's has no equivalent for. A shared detector would either throw that away or teach pi's detector an OMP-only vocabulary. Two disjoint detectors is both simpler and strictly more capable                                                                                                                                                                                |
| **Read OMP's OSC 9;4 progress (pi's activity source)**                       | It is gated behind `terminal.showProgress`, default off, in a YAML file Silo has no writer for — while the title already reports working/idle/attention with `tui.titleState` on by default. Reading it would add a settings-page mechanism to surface a strictly worse signal                                                                                                                                                                                             |
| **A general identity-source precedence rule (process > launch > detection)** | Designed and accepted before the live recon, to stop `detectPiTitle` stamping `pi` over a correctly-identified OMP terminal. The recon showed OMP's title never matches `detectPiTitle`, so there is no collision left for the rule to resolve — building it now would be a `TrackedAgent` field, a precedence function, a pending-launch seam and a memoized catalog view justified by nothing in the tree. Revisit if two agents ever genuinely share an identity signal |
| **Specificity-based marker matching (longest marker wins)**                  | Would remove the OMP/pi `processArgsMarkers` order dependency outright rather than locking it with a test. Rejected as scope: it changes how _every_ agent resolves, for one collision that catalog order already settles, and it trades a dependency a test can pin for a ranking rule that is harder to reason about when a future agent's markers overlap three ways. Revisit if a second overlap appears                                                               |

## Scope

**In scope**

- Catalog module, `detectOmpTitle`, tests, icon, docs, the interpreter-wrapped
  foreground fix, the shared extension template, manual checklist update

**Out of scope**

- Merging OMP and pi Agent Profile defaults
- Changes to the sealed detection model (ADR 0028)
- OpenCode-style deferred resume — OMP has a verified hook path on day one
- Auto-installing Silo's hook without user action (same opt-in contract as pi)
- Surfacing OMP's `terminal.showProgress` — Silo has no YAML settings writer,
  and the title is the better signal

## Decision

**Accepted 2026-09-04**, and **re-scoped the same day** once the live recon
landed (see "Correction to the accepted recon" above).

Ship OMP as its own Tier 3 catalog agent:

1. **A dedicated `detectOmpTitle`.** OMP's OSC 0 title carries both identity
   and run state, and its state separator is on by default. Because `π - ` is
   not a separator OMP produces, it is disjoint from `detectPiTitle` — no
   agent can stamp the other's id, on any platform, so no cross-agent identity
   arbitration is needed.
2. **Catalog order pinned by a test.** `omp` sits before `pi` so an OMP
   install invoked through its package file doesn't match pi's
   `pi-coding-agent` marker.
3. **Interpreter-wrapped foreground resolution.** `noteForeground` resolves
   full argv for any script interpreter the catalog already recognizes
   (`node`, `bun`, `deno`), not `node` alone. This is the one durable
   architectural change, and the ADR records it.

**Dropped from the accepted design**, because the collision that motivated
them does not exist: the `identitySource` precedence rule, the launch-sourced
identity seam, and the ambiguous-title-prefix view. The hook compatibility
gate stays untouched either way. The upstream request for a distinct title
prefix is also dropped — OMP's title is already distinct.

Reconnaissance is locked at `omp@18.1.10`; re-run the opening-prompt, title,
and `--resume` checks when OMP bumps.

## References

- `docs/adding-a-coding-agent.md` — recipe and tiers
- [RFC 0018](./0018-ctx-agents-surface.md) — `ctx.agents`, sealed catalog
- [RFC 0033](./0033-agent-profiles.md) — `configDirEnvVar`, opening prompts
- [ADR 0041](../decisions/0041-pi-hook-as-installed-extension.md) — pi extension hook
- [ADR 0042](../decisions/0042-agent-catalog-modularization.md) — catalog modules, `runtime` policy
- [ADR 0043](../decisions/0043-opencode-tiered-support.md) — tiered shipping precedent (OMP ships all three tiers)
