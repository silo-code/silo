---
status: implemented
created: 2026-07-22
# supersedes:
# superseded-by:
---

# 0018. `ctx.agents` — unified, host-computed agent activity and resume-hint surface

> **Implemented.** `ctx.agents` shipped (beta on the roadmap): host-computed
> activity, resume hints, and the hook-sourced session-id correlation described in
> this RFC's addendum. Two amendments since:
> [RFC 0019](./0019-agent-hook-shell-runtime.md) replaced the Python/base64
> hook-command mechanism proposed here with a POSIX-shell runtime, and ADR
> [0042](../decisions/0042-agent-catalog-modularization.md) reshaped the agent
> catalog. Promoting hooks from session-id capture to a full activity channel is
> still open as [RFC 0020](./0020-agent-hook-activity-channel.md).

> **Agent-observability series** — read together: **0018 · `ctx.agents` surface**
> (this RFC) → [0019 · POSIX-shell hook runtime](./0019-agent-hook-shell-runtime.md)
> → [0020 · hook activity channel](./0020-agent-hook-activity-channel.md). The
> consolidated, human-facing narrative lives in the
> [agent sessions guide](../../apps/docs/guide/agent-sessions.md). Decisions of
> record: [ADR 0028](../decisions/0028-sealed-agent-detection.md).

## Summary

Add `ctx.agents`, a new host-computed SDK surface that reports, per terminal,
what coding-agent activity is going on — `none` / `working` / `idle` /
`error` / `dead`, plus a separate sticky `needsAttention` cleared by
`acknowledge` — whether a prior run should be trusted after a restart, and
(when a terminal's backend was found dead after an unclean shutdown) an exact
or best-effort resume hint. Detection is fully sealed inside the host
implementation — no extension, first- or third-party, registers detectors or
resume-hint resolvers. The surface is mostly read-only
(`getState`/`getByTerminalId`/`subscribe`), with `acknowledge` as the one
scoped mutation; unscoped for all extensions (no new `Permission`), and ships
marked `@beta` via the existing roadmap/TSDoc convention while its shape is
still moving.

## Motivation

Two problems converged into one design:

1. **PTY sessions survive an app quit but not an OS reboot.** `crates/pty-host`
   already detaches sessions from the app process (see
   [RFC 0010](./0010-pty-host-daemon.md)), and scrollback is persisted and
   restored via `terminal_buffer.rs`. But a real reboot kills the daemon too —
   there is no way to keep a process alive across that, and no existing
   mechanism tells the user which agent/session was running or how to resume
   it once Silo relaunches into a dead session.
2. **Agent-activity detection already exists, but it's private and
   non-reusable.** The `agent-monitor` extension (extracted to
   `silo-code/silo-extensions` in commit `f70ddce`) has a proven, battle-tested
   OSC/output-based state machine (`agent-status.ts`, `osc-detectors.ts`) for
   classifying what an agent in a terminal is doing, including restart-gap
   staleness handling. That logic is entirely private to one extension. A
   second consumer (e.g. anything wanting to know "is an agent idle" for its
   own UI, or the resume-hint feature this RFC also needs) would otherwise
   have to reimplement it — redundant computation, and a real risk of two
   independently-tuned copies disagreeing at the edges.

Centralizing both concerns in one host-computed surface avoids duplicating the
hard-won edge-case logic and gives the resume-hint feature a natural home next
to the activity data it's closely related to.

## Design

### `AgentInfo` — the unified payload

One object per terminal, combining activity and resume-identity fields:

```ts
interface AgentInfo {
  readonly terminalId: string;
  readonly workspaceId: string;
  readonly kind: TerminalKind;
  readonly isAgent: boolean;
  readonly activity: "none" | "working" | "idle" | "error" | "dead";
  readonly needsAttention: boolean;
  readonly attentionSince?: string;
  readonly workingSince?: string;
  /** Soft, time-gap-based, self-clearing — "can't fully vouch for this restored
   *  duration, but the backend may still be alive." Cleared by the next live signal. */
  readonly stale: boolean;
  /** Exact session id — present only when an opt-in hook (or native session
   *  file) reported it; Silo never infers one. Populated live, then persisted,
   *  so it's readable at death. */
  readonly sessionId?: string;
  /** Ready-to-show resume hint: exact `claude --resume <id>` (with a hook) or
   *  an honest `was running claude in <cwd>` note (without). */
  readonly resumeCommand?: string;
  /** Which agent CLI this is (`"Claude Code"`, `"Codex CLI"`, ...) —
   *  populated as soon as a known leader is detected at all, not gated on
   *  an exact session id (see correction below). */
  readonly agentName?: string;
}

interface AgentsService {
  getState(options?: { allWorkspaces?: boolean }): AgentInfo[];
  getByTerminalId(terminalId: string): AgentInfo | undefined;
  subscribe(
    listener: (state: AgentInfo[]) => void,
    options?: { allWorkspaces?: boolean },
  ): Disposable;
}
```

**Correction: `agentName` used to be gated on exact resolution, which was
wrong.** `genericHint()` (the no-hook fallback) originally left `agentName`
undefined, only ever setting it once a hook match resolved an exact session
id — conflating two genuinely separate facts: _which agent CLI is this_ vs.
_do we have its exact session id_. The former is known the instant a leader
is recognized at all (`isKnownAgentLeader`/`agentByLeader` already had to
resolve the catalog entry to get that far), regardless of whether the hook
ever fires. Fixed by having `genericHint()` also populate `agentName` from
the catalog's `displayName` — every terminal with a known agent leader now
reports which one it is immediately, not just the ones that happen to have
an installed hook.

**Addition: `agentId`, a stable key alongside `agentName`.** Prompted by a
design question: should an extension be able to rely on _which_ agent this is
without pattern-matching a human-readable string? Yes — `agentName` is a
display string ("Claude Code"), meant to be shown to a user, and free to be
reworded later; an extension that wants to branch on "is this Claude"
shouldn't be coupled to that wording. `agentId` is the catalog's own stable
`id` ("claude", "codex", ...) — already used internally as the hook-event tag
and catalog lookup key, now also surfaced on `AgentInfo`. Populated at the
exact same moment and through the same lifecycle as `agentName` (both
`genericHint()` and the hook-match path set both together; both clear
together on demotion) — deliberately _not_ two independent facts that could
drift out of sync.

**Considered and deferred: exposing the catalog itself.** The natural
follow-up — "since `agentId` is a real key now, should extensions be able to
look up more about an agent from it?" — was raised and deliberately not
pursued yet. `AGENT_DETECTORS`/`AgentDefinition` mixes genuinely public-safe
data (`id`, `displayName`) with host-internal mechanics that must not leak as
written today: hook shell-command builders (`buildCommand`, literal Python
source), trust-workaround notes (`postInstallNote`), and audit-skill
bookkeeping (`contract`, `upstreamRefs`, `verifiedAgainstVersion`). Exposing
`AgentDefinition` as-is would both leak internals and hand out functions on a
public type that doesn't need them. If a concrete extension need for this
shows up, the right shape is a small curated public projection (e.g.
`{ id, displayName, supportsExactResume }` behind something like
`ctx.agents`'s own lookup, not a raw catalog dump) — consistent with this
project's "don't expand `ctx` ahead of a real requirement" convention.
`agentId` is deliberately the seam this would hang off of later, without
needing a rename or migration.

### `acknowledge()` — the one deliberately scoped mutation

`ctx.agents` was read-only until this addition. The reducer
(`agent-activity-model.ts`) has always supported an `"activated"` event —
clears `needsAttention`, advances `waiting` → `done` — ported directly from
`agent-monitor`'s own state machine, but `agents-service.ts` never dispatched
it. Practically, this meant the _only_ way `needsAttention` ever cleared was
a coincidence: a new OSC/foreground signal happening to arrive while the
terminal was already the active tab (typing a new message, or the agent
finishing while you're already looking). Simply focusing an already-finished
terminal did nothing until some later signal arrived.

**First instinct — wire it into the host, unconditionally:** subscribe to
active-terminal changes inside `agents-service.ts` itself and dispatch
`"activated"` automatically. Rejected once checked against `agent-monitor`'s
real, shipping settings page: it offers three answers to "does viewing a
finished terminal count as acknowledging it" — _clear the indicator_, _clear
it and hide the row_, or **"keep it until the next run" (viewing changes
nothing at all)**. If the host unconditionally mutated the canonical
`needsAttention`/`activity` state the instant a terminal became active, the
third option would be impossible to honor for any consumer built on
`ctx.agents` — the fact would already be gone by the time a consumer's own
policy could decide whether to act on it. There's no "undo" once the host
has applied the transition.

**Landed on: an explicit method, `ctx.agents.acknowledge(terminalId)`**, that
any consumer calls on its own terms. This keeps the _mechanism_ (what
"acknowledged" actually does to the state machine) centralized and canonical
— not reimplemented per extension, which was the actual duplication problem
worth solving — while leaving the _policy_ (when does viewing something
count) entirely with the consumer, exactly where a genuinely
per-preference decision belongs. Verified this covers `agent-monitor`'s
three-way setting with a clean 1:1 mapping, _if_ it ever migrates its
activity computation onto `ctx.agents` (a separate, larger, not-yet-decided
task — `agent-monitor` needs zero changes today either way, same
compatibility guarantee as the rest of this RFC):

- "Clear the finished indicator" → call `acknowledge(terminalId)` whenever
  the newly-active terminal has one pending (or unconditionally — the
  reducer's own `"activated"` handler already no-ops when nothing is
  pending, so an unconditional call is safe, not just a shortcut).
- "Clear it, and hide the row" → the same `acknowledge()` call, plus hiding
  the currently-focused terminal's row — a pure rendering decision, entirely
  `agent-monitor`'s own UI layer, untouched by this at all.
- "Keep it until the next run" → simply never call `acknowledge()` — the
  exact same conditional (`if (focusBehavior !== "none")`) `agent-monitor`
  already gates its own internal dispatch behind today; only the _target_ of
  that dispatch would change.

The new example extension (`agent-inspector`) demonstrates the plain case:
it has no settings of its own, so it just calls `acknowledge()` unconditionally
whenever `ctx.terminals.subscribeActive` reports a new active terminal — the
exact pattern shown in `ctx.terminals.subscribeActive`'s own doc example.

`stale` and `activity === "dead"` are deliberately different signals, not one
flag: `stale` means "restored after a gap long enough to be unsure, but the
next real signal will resolve it automatically." `"dead"` means "confirmed —
there is no backend left to reattach to, and nothing will ever arrive to
resolve this on its own." The resume-hint fields are attached at agent-start
and persisted (so they're already there to read the moment `"dead"` is
reached), but they matter to a consumer specifically in the `"dead"` case —
that's when a resume command is worth surfacing, rather than for a live or
merely-stale terminal whose backend is fine.

### `waiting`/`done` collapsed to `idle` (correction)

**The bug that surfaced this:** staying focused on an agent terminal and
sending messages made it settle on `"done"` after every turn; leaving it
unfocused made it settle on `"waiting"` + `needsAttention: true` instead —
reported as "slightly inconsistent." Tracing `reduce()` found the actual
shape of the problem: no detector ever emits `"done"` — every detector
(`detectClaudeCode`, `detectCodexCLI`, `detectCursorAgent`, `detectCopilotCLI`,
`detectShellIntegration`) only ever reports an idle turn as `"waiting"`.
`"done"` was purely computed, in exactly one branch:

```ts
needsAttention = isAgent && !ev.isActiveTerminal;
if (isAgent && ev.isActiveTerminal) nextActivity = "done";
```

For an agent terminal, this meant `activity === "waiting"` ⟺
`needsAttention === true`, and `activity === "done"` ⟺ `needsAttention ===
false` — always, with no independent case. The `waiting`/`done` split on
`activity` carried **zero information beyond what `needsAttention` already
encoded** — the same fact, spelled two ways. Checking `agent-monitor`'s own
source (`agent-status.ts`, the model this was ported from) confirmed its
author already knew this: _"Agents never emit 'done' themselves; this is
[acknowledgment]."_ `agent-monitor` just never acted on that observation by
removing the redundant split.

**Resolution:** `activity`'s `"waiting"`/`"done"` split is removed and
replaced with a single `"idle"` value — `AgentActivity` is now `"none" |
"working" | "idle" | "error" | "dead"`. `activity` now reports only a fact
about the agent itself (working, idle, errored, dead), independent of who's
watching. `needsAttention` remains the sole viewer-dependent fact, exactly as
before: set only if the terminal wasn't active the instant the agent went
idle, cleared only by `acknowledge()`. The mechanism that suppresses
`needsAttention` for a terminal being watched live (`!ev.isActiveTerminal`)
is unchanged — that's a mechanism fact (was a human looking at the exact
instant), not a preference axis, unlike the three-way "does viewing count as
acknowledging _after_ the fact" policy `acknowledge()` already leaves to the
consumer. `acknowledge()` itself simplifies to just clearing
`needsAttention`/`attentionSince` — there's no longer a `waiting` → `done`
promotion to perform, since `"idle"` already correctly describes the agent
both before and after acknowledgment.

The rename propagates all the way down through the detection pipeline for
consistency — `DetectionResult.status` (`agent-osc-detectors.ts`),
`agent-detection-dispatch.ts`'s `planDetection`, and every detector's return
value all say `"idle"` now too, not just the public `AgentActivity` type;
`DetectionResult.status` also drops `"done"`, which no real detector ever
produced (only a hand-written test literal exercised it). Keeping the
detector-level vocabulary as `"waiting"` while the public type said `"idle"`
would have meant a translation step existing nowhere in the code, for no
benefit. No shipped consumer was affected — `ctx.agents` is still `@beta`,
and the only real consumers at the time (`TerminalPanel.tsx`'s death/resume
handling, the `agent-inspector` example) never branched on `"done"` vs
`"waiting"` in the first place.

**Follow-up: resetting `activity` on demotion too.** A related question
surfaced right after this landed: when a promoted-shell terminal's `isAgent`
demotes back to `false` (an ordinary `exit`, the shell reclaiming its own
prompt), should `activity` reset to `"none"`? Tracing `reduce()` showed it
didn't — the same shell-sourced event that triggers the demotion had already
run through the working→idle transition block first, landing `activity` on
`"idle"`, and nothing downstream touched it back down. The result:
`{ isAgent: false, activity: "idle" }` — self-contradictory, since `"idle"`
describes an agent's turn state and there's no agent here anymore. In
`agent-inspector` this meant a demoted shell kept showing a green "idle" dot
indefinitely, indistinguishable from a genuinely idle agent.

The fix folds into the existing demotion-cleanup step rather than adding a
new one: `clearResumeIdentityOnDemotion` (which already reset
`sessionId`/`resumeCommand`/`agentName`/`agentId` on this exact transition,
with the identical rationale — "no longer meaningful once the shell is back
to being just a shell") is renamed **`resetOnDemotion`** and now also resets
`activity` to `"none"`, plus `workingSince`/`workingSource` to `null`
defensively (the demotion check in `reduce()` doesn't gate on `ev.status`, so
this doesn't lean on an assumption that `activity` has always settled to
`"idle"` by the time demotion fires — `needsAttention`/`attentionSince`/
`stale` don't need the same defensive treatment, since the demotion gate
itself already requires `needsAttention` false, and `stale` is unconditionally
cleared by `isLiveSignal` earlier in the same `reduce()` call for any
non-timer-sourced event, which every demotion-triggering event is).

### The agent catalog — single source of truth

Every per-agent fact lives in **one** host-internal registry,
`agent-catalog.ts` (`AGENT_CATALOG: AgentDefinition[]`). Before it, Claude's
knowledge was scattered across ~6 files — leader names, activity detectors,
the hook command, the settings-page install list, display names — and adding
an agent meant touching all of them with nothing forcing you to. Now each
agent is one entry, and every subsystem derives its view from the catalog:

- detection dispatch → `detectFromOsc` (iterates each entry's
  `activityDetectors`, then the one generic OSC-133 shell fallback),
  `detectIdleAfterWorking` (contextual OSC fallback, e.g. Codex's plain-title
  idle), `detectFromOutput` (raw-PTY fallback, e.g. Cursor's spinner)
- resume-hint gating → `agentByLeader` / `isKnownAgentLeader`
- hook-install UI (Settings → Agents) → `hookInstallableAgents`
- hook-event display names → `agentById`

An `AgentDefinition` carries: `id`, `displayName`, `leaderNames` (foreground
basenames), `activityDetectors`, an optional `outputDetector`, an optional
`idleAfterWorking`, `resume`, and `docsUrl`. **`resume` is a discriminated
union** — `{ kind: "hook"; configPath; hookEvent; marker; buildCommand;
buildResumeCommand }` or `{ kind: "none" }` — so "Silo has no exact-resume
path for this agent" is a first-class encoded state, not a gap someone forgot
to fill. Both the hook command and the resume command (`claude --resume <id>`
vs `codex resume <id>`) are per-entry, so nothing about an agent's syntax is
hardcoded in the host. The generic OSC-133 shell detector is deliberately
_not_ a catalog entry: it's the agent-agnostic fallback, tried after every
agent's own detectors.

The catalog ships with four entries:

- **Claude Code** — full support: activity detection + auto-installable hook
  (`installStrategy: "claude-settings"`).
- **Codex CLI** — full activity detection (see "Detection parity" below) +
  auto-installable hook (its `~/.codex/hooks.json` is the same
  `hooks.<Event>[].hooks[]` shape as Claude and its payload uses the same
  `session_id` field, so it reuses the Claude installer and hook command
  verbatim, confirmed live against codex-cli 0.144.5).
- **Cursor Agent** — full activity detection + auto-installable hook via
  `installStrategy: "cursor-hooks-json"` (Cursor's `~/.cursor/hooks.json`
  uses `{ version, hooks: { sessionStart: [{ command }] } }`, not Claude's
  nested groups — `cursor-hook-installer.ts` merges that shape). Confirmed
  live against cursor-agent 2026.07.23: CLI `sessionStart` fires with
  `session_id`; resume is `agent --resume <id>`.
- **GitHub Copilot CLI** — full activity detection + auto-installable hook
  via `installStrategy: "copilot-hooks-dir"` (dedicated file under
  `~/.copilot/hooks/`). Confirmed live: `sessionStart` payload carries
  camelCase `sessionId`; resume is `copilot --resume=<id>`.

The catalog stays host-internal (detection/resume are sealed — see below);
`core.agents-settings` reads it through the `@silo-code/extension-host/internal`
barrel. Each `installStrategy` has its own pure installer module
(`hook-installer.ts`, `cursor-hook-installer.ts`, `copilot-hook-installer.ts`)
operating on a structural spec the catalog entry satisfies, rather than
importing the catalog itself.

### Tracking upstream agent changes

Each catalog entry also carries provenance built for the periodic
**agent-support audit skill** (a repo skill run on demand — see the build
notes below): `contract` (a plain-language statement of exactly what upstream
behavior we depend on — hook config path, event name, payload fields, the
spinner glyphs), `upstreamRefs` (the agent's own docs we track), `lastVerified`,
and `verifiedAgainstVersion`.

These make the maintenance treadmill cheap and visible rather than eliminating
it (there's no standard across agents, and they churn). The design decision
worth recording is **why a skill, and why not a dumb differ**: a scheduled
version/doc differ fires on every release and every typo regardless of whether
our contract is affected, so it drowns in false positives and becomes an
alert channel people ignore. The audit skill instead uses the running agent as
a _classifier_: it compares each agent's current published version against
`verifiedAgainstVersion` (the catalog is the durable checkpoint — the skill is
stateless), and only when they differ does it judge the upstream change
_against `contract`_, flagging with a severity and never silently suppressing
an uncertain one. The deterministic backstop underneath it is golden-sample
tests (a captured real hook payload + spinner byte sequence per agent) that
lock in the parser once a human re-verifies — the skill is allowed to miss;
the test isn't. This keeps false negatives (the scarier failure for a
correctness-critical integration) surfaced rather than swallowed.

### Detection is sealed, not pluggable

There is no `registerDetector`/`registerOscDetector`/`registerOutputDetector`.
All per-agent OSC/output interpretation (Claude's braille spinner + `✳` idle
marker, Cursor Agent's title format and raw-spinner fallback, Codex's OSC 0/9
payloads, Copilot's OSC 9;4 progress protocol, generic OSC 133 shell
integration) lives inside `ctx.agents`'s own host implementation, maintained by
Silo directly. The host implementation reuses the _existing_ shared
`parseOscSequences`/`oscListeners`/`outputListeners` dispatch already in
`packages/extension-host/src/services/tauri-terminal-client.ts` (which already
supports multiple listeners per session at no extra parsing cost) — it becomes
one more internal listener, not a second parser. `ctx.terminals.subscribeOsc`/
`subscribeOutput` remain fully available, unchanged, as the generic primitive
for anything unrelated to agent detection.

### Detection parity with `agent-monitor` (correction)

The initial port of this RFC's detection layer was **incomplete** in a way
that wasn't caught until live Codex testing: only `detectClaudeCode` and the
generic `detectShellIntegration` were ported, plus (from the earlier Codex
diagnosis in this same doc) `detectCodexCLI`/`detectCodexIdleAfterWorking`.
Cursor Agent and GitHub Copilot CLI had **no detectors at all** — they'd
appear via `ctx.processes`-level `leader`/`cwd` facts only, with no
`working`/`waiting` state ever. Worse, a whole _mechanism_ was silently
missing, not just per-agent detectors: `agents-service.ts` never acted on
`DetectionResult.timer` at all — the debounce-timer scheduling that
`agent-monitor`'s `terminal-tracker.ts` builds around `applyDetection()` had
no equivalent here. Concretely, this meant:

- A shell-integration-only agent (`pi`, which emits OSC 133;C per step but
  never explicitly signals done) would read "working" forever — no fallback
  existed to clear it on silence.
- Claude's own `✳` idle marker (emitted briefly _between_ tool calls, not
  just at genuine completion) had no debounce, risking flicker.
- Cursor's raw-output spinner fallback is fundamentally unimplementable
  without a timer — silence after the last frame is its _only_ "done" signal.

Full parity was ported from `silo-extensions/agent-monitor`'s
`osc-detectors.ts`/`terminal-tracker.ts`:

- **`agent-osc-detectors.ts`** gained `detectCursorAgent` (OSC 0 title
  parsing — emitted only when `display.showStatusIndicators` is true in
  `~/.cursor/cli-config.json`, upstream default `false`),
  `detectCursorAgentOutput` (ink-spinner byte-sequence matching in raw
  output — the fallback that actually matters for most installs), and
  `detectCopilotCLI` (OSC 9;4 progress protocol).
- **`agent-catalog.ts`** gained an optional `outputDetector` (Cursor) and
  `idleAfterWorking` (Codex) per-entry field, plus dispatch functions
  `detectFromOutput`/`detectIdleAfterWorking` alongside the existing
  `detectFromOsc` — and a fourth catalog entry, **GitHub Copilot CLI**
  (`resume: { kind: "hook", installStrategy: "copilot-hooks-dir" }`;
  dedicated file under `~/.copilot/hooks/`).
- **`agent-detection-dispatch.ts`** (new) is the ported, pure equivalent of
  `applyDetection()`'s branching — extracted (rather than left inline in
  `agents-service.ts`, unlike upstream) specifically so the decision logic is
  unit-testable without driving real timers. `agents-service.ts` gained the
  actual `SHELL_IDLE_MS`/`AGENT_IDLE_DEBOUNCE_MS` timer state (`setTimeout`
  maps keyed by terminal id) that was simply absent before, plus a raw-output
  subscription (`getTerminalService().subscribeOutput`, mirroring the OSC one)
  for the Cursor fallback.

**Deliberately not ported**: `detectFromOscTitle`/`seedFromTitle` —
`agent-monitor`'s mechanism for re-deriving state from a terminal's _current_
title when the extension's own OSC subscription lapsed (disabled/updated/
reloaded independently of the app, then re-enabled, missing whatever live
frames occurred in between). `ctx.agents` lives inside the extension-host
package itself; there is no "reloaded independently of the app, app keeps
running" lifecycle for it to correct for the same way a third-party extension
needs to — a full app restart is already `restoreState`'s `stale`-gap job,
proven throughout this RFC's earlier testing. Porting `seedFromTitle` would
solve a problem `ctx.agents` doesn't structurally have.

### Resume-hint resolution is host-internal

No `registerResumeHintProvider`, no `ctx.agentResume`. A terminal's resume
hint has exactly two possible forms, and **neither one guesses a session id**:

- **Exact** — an opt-in `SessionStart` hook reports the terminal's own real
  session id, PID-correlated against the terminal's foreground process (see
  "Hook-based resolution" below). This is the only source of an exact
  `claude --resume <id>`.
- **Generic** — with no hook installed, the host attaches an honest,
  session-id-less note ("was running `<leader>` in `<cwd>`"), computed
  synchronously from the last-known foreground leader/cwd. It promises
  nothing it can't back up, so it is never wrong — only, at worst, vague.

Both are attached the first time a known agent leader is detected for the
terminal (`genericHint` in `agent-resume-hint.ts`, stashed via
`applyResumeHint` in `agents-service.ts`), persisted into the same `store`
slice as the rest of the terminal's `AgentInfo`, and read back unchanged at
death. If the hook later reports an exact id, it upgrades the generic hint in
place; a generic hint never overwrites an exact one (it carries no
`sessionId`).

#### Rejected: cwd + recency inference (the `continues` tier)

An earlier version of this design added a middle tier: shell out to
[`continues`](https://github.com/yigitkonur/cli-continues) at agent-start and
infer the session id from the most-recent session matching the terminal's
cwd. It was implemented, tested extensively against real multi-account,
concurrent-session usage, and then **removed** — the findings are recorded
here because they are the justification for _not_ inferring, and a warning to
anyone tempted to re-add it.

Directory + recency is not a unique key, so the approach has a structural
ceiling no amount of hardening clears: two terminals in the same folder
share both. Live testing surfaced seven distinct ways it produced a
_confidently wrong_ id (the worst failure mode — a `claude --resume <id>`
that fails with "No conversation found", not an empty result): `continues`
doesn't scope to cwd at all (returns the global most-recent); it prefers an
internal `sessionId` field that can point at a since-deleted session for
compacted conversations; it caches its own index with a 5-minute TTL, so two
resolutions in that window collide; the session file often doesn't exist yet
at spawn, so a brand-new session resolves to a pre-existing one; the retry
budget needed to cover "until the user's first message" is unbounded in
practice; multi-account `CLAUDE_CONFIG_DIR` sessions aren't found without
replicating the shell environment; and the `$HOME` exec that fix relied on
hit a non-portable-`echo` bug. Each got a fix; the pile of fixes was the
signal. A guess that needs seven corrections and still occasionally lies is
worse than an honest "I don't know exactly" — so the tier was cut in favor
of exact-or-generic. It also removes a runtime `npx continues` subprocess
dependency (and the deferred question of shipping it as a compiled Tauri
sidecar) from Silo entirely.

### Hook-based resolution (exact)

The exact tier. Testing on the rejected inference tier converged on a
structural ceiling: no amount of hardening a directory + recency guess makes
it _exact_, because directory + recency is fundamentally not a unique key —
two terminals can share both.

The question that reopened this: **"will the `continues` package work for
us?"** The answer is no — not reliably, once concurrent same-cwd sessions are
a real case rather than a hypothetical, which is why the inference tier was
cut entirely rather than kept as a fallback. Research into how comparable
tools solve the identical problem
(`tmux-plugins/tmux-resurrect`-style session tracking, `kraten/chimlo`,
`stablyai/orca`) surfaced the actual precise mechanism available here: Claude
Code's own `SessionStart` hook, which reports the exact session id of the
process that's starting, with no guessing involved.

The remaining problem hooks alone don't solve is **which terminal**. A hook
process is a detached, one-shot subprocess — it has no notion of "which Silo
terminal," and Silo doesn't launch Claude itself (the user does, directly in a
terminal), so there's no PID Silo already knows to hand the hook. `Orca` solves
this by requiring **self-launch**: it launches the agent process itself and
injects an environment variable the hook can read back. That path is closed
here — ruled out explicitly ("we can't do 1 because we don't launch claude,
the user does, in the terminal").

The insight that makes exact correlation possible anyway: Silo **already**
continuously tracks each terminal's own foreground process group, via the
`tcgetpgrp`-based foreground-tracking infrastructure built for RFC 0010
(`foreground.rs`, `onTerminalForeground`/`terminal_foreground_snapshot`) — this
was built for OSC-less agent detection, not for this, but it's exactly the
missing correlation key. A `SessionStart` hook process's own `$PPID` **is**
Claude's PID, which **is** the terminal's foreground pgid at the moment the
hook fires. So:

1. **Install** (opt-in, via the new Settings → Agents page —
   `packages/extensions-core/src/agents-settings/`): the page lists every
   agent CLI Silo supports this mechanism for (`SUPPORTED_AGENTS` in
   `index.tsx` — today, just Claude Code) as a single toggle per CLI, each
   pointed at that CLI's **default** config location
   (`~/.claude/settings.json`). Deliberately **not** account/
   `CLAUDE_CONFIG_DIR`-aware — the toggle assumes the CLI's standard setup and
   links out to a docs page (`apps/docs/guide/agent-sessions.md`) for adding
   the hook manually under a non-default config. This is a deliberate
   simplification, not an oversight: the hook path's correlation is
   PID-based, not config-dir-based, so which account's config file carries
   the hook entry has no bearing on which terminal an event matches. Toggling
   appends a `SessionStart` hook entry to that file
   (`hook-installer.ts`; idempotent, merge-safe — only ever adds/removes
   entries carrying Silo's own marker comment, never touches a user's or
   another tool's existing hooks). The installed command is a single-line
   `python3 -c` one-liner (no new runtime dependency beyond what Claude Code
   itself already assumes) that reads the hook's own JSON stdin payload and
   appends one JSON line — `{pid: os.getppid(), sessionId, cwd, agent:
"claude", timestamp}` — to a fixed, app-identity-agnostic path,
   `~/.silo/agent-hooks/events.jsonl` (deliberately _not_ under
   `~/.config/silo[-dev]`, since the hook has no way to know at install time
   which Silo build/identity will eventually read it).
2. **Read** (`agent-hook-events.ts` + `agents-service.ts`): the host watches
   `~/.silo/agent-hooks/` via the existing Rust `notify` watcher (`start_watch`
   / `file:changed`) and tails `events.jsonl` on create/modify (new lines
   only, via an in-memory line-count checkpoint — resets harmlessly on app
   restart). A short catch-up read also runs at startup and when a terminal's
   foreground first becomes a known agent (SessionStart can land a second or
   two after `agentPgid` is set; Cursor fires on the first typed character;
   Codex may fire on the first user message).
   Delivery is **not** a periodic JS poll — polling through webview `invoke`
   stalled while the page was backgrounded and missed live writes.
3. **Correlate** (`matchHookEventsToTerminals`, a pure function so the
   matching rule itself is unit-testable without the rest of the
   session-tracking machinery): each tracked terminal's `SessionEntry` now
   also carries `currentPgid`, updated on every foreground tick (both the live
   `onTerminalForeground` stream and the one-time
   `terminal_foreground_snapshot` seed). A hook event's `pid` matched against
   a terminal's `currentPgid` (or sticky `agentPgid`) is an exact identification — no cwd, no
   recency, no guessing.
4. **Apply** (`applyHookMatch` → `applyResumeHint` in `agents-service.ts`):
   a hook match upgrades the terminal's generic hint to an exact
   `claude --resume <id>` in place, refreshing its `AgentInfo` and persisting
   immediately (hook events are discrete one-offs, not a continuous tick
   stream, so there's no guarantee of a follow-up activity tick to piggyback
   the update on). The upgrade is one-directional: an exact id, once set, is
   never overwritten by a generic hint (`applyResumeHint` only fills
   `sessionId` when the incoming hint carries one), so the generic path
   re-running on a later foreground tick can't clobber it.

**Correction from live testing (Codex)**: the first Codex hook install
appeared to do nothing — no exact id, ever. Root-caused via the real
`~/.codex/hooks.json`/`config.toml`: Codex requires each hook entry to be
individually reviewed and trusted (`/hooks` inside a session) before it will
run one at all, confirmed by comparing `[hooks.state]`'s per-hook-index
`trusted_hash` entries (Superset's pre-existing hook had one; Silo's freshly
appended entry didn't). Not a Silo bug — see `resume.postInstallNote` and the
guide's Codex section for the fix (a required manual step, surfaced in the
Settings UI). A second, follow-on discovery while confirming the trust fix
worked: after trusting the hook, `events.jsonl` _did_ get a correct entry (its
`pid` verified, via `ps`, to be Codex's own real pid/pgid) — but the terminal
still never picked up the exact id. That one **was** a real Silo bug: `Read`
above is a one-time checkpoint, so an event that doesn't match on the single
poll it happens to be read on was lost forever, and Codex's `SessionStart`
hook fires near-instantly at launch — early enough to plausibly race ahead of
Silo's own foreground-tracking catching up to the terminal's new pgid (the
two run on independent timers). Fixed with a small pending-events buffer
(`pendingHookEvents` in `agents-service.ts`, pruned by a pure, unit-tested
`pruneUnmatchedEvents`): an unmatched-but-still-fresh event is retried on the
next poll instead of discarded, turning "must land in the same ~3s tick" into
"eventually consistent within `MAX_EVENT_AGE_MS`." Claude never surfaced this
because manual testing never happened to land on that exact race window —
the bug was latent, not Codex-specific, and applies equally to any agent's
hook.

A third correction, found while chasing why the retry-buffer fix still
didn't produce an exact id in some tests: `readNewHookEvents()`'s freshness
check, applied at _ingestion_ (10 minutes from "now" at read time, not from
when the terminal started tracking), discards a perfectly valid, still-alive
session's hook event whenever Silo restarts more than 10 minutes after that
session began — confirmed directly: a long-running Claude session's hook
event was verified correct (`ps` showed the exact same process, matching
timestamp to the second) but was silently rejected the moment Silo's
extension-host module restarted and re-read the whole `events.jsonl` backlog
fresh. This is a design flaw, not a Codex issue: the age check conflates "too
old to trust" (guarding against pid reuse) with "too old to be useful," and
a normal quit-and-relaunch onto still-running sessions hits it every time.
Fixed by removing the ingestion-time age filter from `readNewHookEvents()`
entirely — staleness handling now lives solely at the correlation/retry-buffer
layer (`pruneUnmatchedEvents`), which already has the stronger signal: does
this pid match a _currently tracked, currently alive_ terminal's foreground
pgid (independently re-verified by Silo's own foreground-tracking, not just
trusted from the hook's self-report). An event that matches is accepted
regardless of its own age; an event that never matches anything is still
bounded by `MAX_EVENT_AGE_MS` in the retry buffer, so a restart's one-time
backlog-as-new re-read doesn't retain orphaned events forever.

A fourth correction, found immediately after: even once a hook event
existed, was correctly captured, and the terminal's foreground pgid was
already correctly tracked, one specific case still silently never matched —
no rejection log, no mismatch log, nothing, for many minutes. Root cause:
`readNewHookEvents()` makes a real native subprocess round-trip
(`process_exec`) every poll tick, and `setInterval(() => void
pollHookEvents(), ...)` never waits for the previous tick to finish before
scheduling the next one. If that round-trip ever takes longer than
`HOOK_POLL_INTERVAL_MS` (observed: the poll's own diagnostic heartbeat
cadence drifted from ~3.0s/tick up to ~4.0s/tick over a few minutes of live
testing — circumstantial but real evidence latency isn't constant), two
ticks can be in flight at once, each independently reading the file and
racing to overwrite the shared `linesProcessed` checkpoint — whichever
resolves _last_ wins, silently, with no exception and nothing to log. Fixed
with a simple in-flight guard (`pollInFlight` in `agents-service.ts`): a
tick that fires while the previous one is still running skips outright
(logged at debug level) rather than ever executing concurrently. Confirmed
fixed live immediately after: both a fresh Claude session and a fresh Codex
session in the same test resolved their exact session id and correct
per-agent resume command (`claude --resume <id>` / `codex resume <id>`) on
the very next restart.

The hook is the exact tier; the generic hint is the honest fallback. A user
who hasn't installed the hook — or is running an agent Silo's hook installer
doesn't cover — simply gets the generic "was running `<leader>` in `<cwd>`"
note, never an inferred (and possibly wrong) session id. Nothing here changes
`AgentInfo`'s public shape — `sessionId`/`resumeCommand`/`agentName` are
populated the same way regardless of which tier produced them; extensions
consuming `ctx.agents` cannot tell (and don't need to) which mechanism
resolved a given terminal's identity, only whether a `sessionId` is present.

### Persistence

A new slice on the existing `store` (the valtio proxy in
`packages/extension-host/src/state/store.ts`) — not a new file, not routed
through `ctx.storage` (which is a per-extension-namespaced view into that same
store; this is host-only data, never extension-writable). Rides the same
persistence pipeline everything else in `store` already uses.

### Permissions

None. The existing `Permission` union (`fs:read`/`fs:write`/`process`/
`network`/`webview`) is specifically about crossing the workspace boundary;
reading `ctx.agents` for terminals in workspaces the extension already has
access to doesn't cross that boundary, exactly like `ctx.processes` (which is
unscoped for reads, including `{ allWorkspaces: true }`, and gates only its
mutating `kill()`). `ctx.agents` follows the identical precedent.

### Stability marking

Ships marked `experimental` using the **existing, already-proven** roadmap
convention — `<Badge type="warning" text="experimental" />` (same as
"Automation RPC (dev)" today), plus a `@beta` TSDoc tag (standard
TypeDoc/API-Extractor release-stage tag; first use in this SDK, but not a new
mechanism). No access gating — this is a communication signal, not an
enforced restriction, so third-party extensions can use it immediately, with
the explicit warning that the shape may still change.

### Compatibility

Fully additive. No existing type, method, or contract changes. `ctx.processes`
stays separate and complementary (OS-level facts — cpu/memory/process tree —
vs. `ctx.agents`'s application-level facts) — not superseded, not merged. No
deprecations. `silo-extensions/agent-monitor` needs zero code changes and
keeps working exactly as it does today, built entirely on primitives this RFC
doesn't touch (`subscribeOsc`/`subscribeOutput` directly, `ctx.storage.global`,
`registerTabDecoration`, `registerStatus`).

### Validation plan

A new example extension under `examples/extensions/` — **not** a change to
the existing `agent-monitor`, which stays in `silo-extensions` untouched. A
side panel that reads `ctx.agents.getState()`/`subscribe()` for the active
workspace, with a toggle for `{ allWorkspaces: true }`, rendered as a plain
list/table. `resumeCommand`/`sessionId` are shown for **every** entry that has
them, live entries included — not just `"dead"` ones — since that's what lets
the resolve-at-start-and-persist half of the design be verified with zero
restart involved (open a Claude terminal, watch the field populate). `"dead"`
entries additionally get a distinct callout (the one state most worth
deliberately proving, since it's the newest and least-proven part of the
design). Deliberately scoped to exercise only the new surface —
`registerTabDecoration`/`registerStatus` are unchanged APIs already validated
by `agent-monitor` itself, so re-testing them here would be redundant.

**Testing the `"dead"` transition without an actual OS reboot**: not
necessary — the daemon (`crates/pty-host`, binary name `pty-host`) is a
genuinely separate, detached OS process, and a reboot's only relevant effect
here is killing it. `pkill -f pty-host` (or targeting one session's daemon by
PID) reproduces the identical condition directly; Silo has no way to
distinguish "daemon killed directly" from "daemon killed by OS shutdown."

**Hook-based resolution status**: the matching rule
(`matchHookEventsToTerminals`) and the retry-buffer prune rule
(`pruneUnmatchedEvents`) are both unit-tested in isolation. End-to-end exact
correlation has been verified interactively for **both** Claude and Codex,
in the same clean test, after the overlapping-poll fix above (events.jsonl
gets written, pid matches the right terminal, the generic hint upgrades to
the correct per-agent exact resume command). The restart-staleness gap (the
third correction above) is also fixed — a long-running session's exact id is
now recovered on restart regardless of how long it had been running,
verified via the same live process/`ps` cross-check method used throughout
this testing. **Not yet separately re-verified live** after the fix (the
overlapping-poll fix's own confirmation test happened to be on freshly
started sessions, not ones that predated the restart by more than 10
minutes) — logically sound and unit-testable behavior is unchanged
(`pruneUnmatchedEvents` itself didn't change), but the specific
restart-onto-long-running-session scenario is worth one more live pass.
Quit and relaunch Silo afterward to trigger reattach and observe the
`"dead"` transition carrying the exact command.

Once `ctx.agents` stabilizes, `agent-monitor` can optionally migrate onto it
(dropping `agent-status.ts`'s state machine and most of `terminal-tracker.ts`'s
orchestration in favor of `subscribe()` + pure render-mapping functions) — but
that migration is out of scope for this RFC and not required for it to ship.

## Alternatives considered

- **SDK-exported pure library instead of a host-computed service.** Rejected:
  every consumer would run its own copy of the reducer, reintroducing the
  duplicate-computation and correctness-divergence problem this RFC exists to
  avoid — the same reasoning `ctx.processes` already settled.
- **Two separate services** (`ctx.agents` for activity, a separate service for
  resume-hints) instead of one `AgentInfo`. Rejected: both answer "what's this
  agent doing / who is it" and share identity keys, so splitting the type buys
  nothing — resume-identity fields are simply present-or-absent on the one
  payload.
- **Public `registerResumeHintProvider`.** Rejected: resume identity now has
  exactly one exact source (the per-agent `SessionStart` hook) and one honest
  fallback (the generic hint); there's no open-ended "cover a dozen agents by
  inference" need left for a plugin system to serve. Adding a new agent means
  a hook installer entry (`SUPPORTED_AGENTS` + `hook-installer.ts`), which is a
  sealed, first-party concern, not an extension point.
- **Public `registerDetector`/`registerOscDetector`/`registerOutputDetector`.**
  Seriously considered, but rejected in favor of full sealing, for consistency
  with the resume-hint decision above and to keep the public API surface as
  small as possible during the experimental phase. Accepted cost: covering a
  new agent's activity detection requires a Silo core change and release, not
  an independent extension update.
- **New `Permission` for `ctx.agents` reads.** Rejected: doesn't fit the
  existing taxonomy (workspace-boundary crossing), and `ctx.processes` already
  sets the unscoped-reads precedent for this exact shape of data.
- **Enforced "unstable" access gating** (first-party-only, e.g. reusing the
  "first-party extensions are unscoped" tiering) instead of a docs-only
  signal. Rejected: the goal is alerting developers the shape isn't settled,
  not preventing use — the existing `experimental` roadmap badge already does
  this and is a proven, low-effort convention.
- **A new dedicated persistence file** (mirroring `session_registry.json` /
  `terminal-buffers/`) instead of a `store` slice. Rejected: the computation is
  already 100% TypeScript-side (OSC parsing happens in
  `tauri-terminal-client.ts`, not Rust), so there's no reason to introduce a
  Rust round-trip or a fourth distinct persistence mechanism.
- **Structured, executable resume data** (`binaryName`, `resumeArgs: string[]`,
  a spawn/shell discriminated union) instead of a flat `resumeCommand` display
  string, to future-proof for an eventual auto-launch feature. Rejected: the
  generic-fallback case (no hook-resolved id) is inherently a free-text note
  (`"was running claude in ~/foo"`), not a clean binary+args invocation, so
  structured fields would need a real discriminated union to cover it and
  would still leave an unstructured path for that case anyway — no clean win.
  Structured args sitting on the payload also invite silently
  wiring up execution (`ctx.process.spawn(binaryName, resumeArgs)` with no
  confirmation step), directly undermining the explicit no-auto-relaunch
  decision from early in this design. And because `ctx.agents` is marked
  `experimental` specifically to make the shape cheap to change later, the
  future-proofing benefit of guessing at a richer shape now is smaller than
  usual — better to add real structure once an actual auto-launch feature is
  proposed and its concrete needs (confirmation UX, which spawn primitive) are
  known. `sessionId` stays as the one field that keeps that door open.
- **A cwd + recency inference tier** (shell out to `continues` at agent-start
  to guess a session id when no hook is installed). Built, tested, and
  removed — see "Rejected: cwd + recency inference" under Resume-hint
  resolution for the full findings. Short version: directory + recency is not
  a unique key, so it produces confidently-wrong ids for concurrent
  same-directory sessions, and no amount of hardening (seven distinct fixes
  were attempted) changes that structural ceiling. A resume hint that is
  either exact or honestly vague beats one that sometimes silently lies.
- **Pulling `agent-monitor` into the monorepo** as a bundled extension for the
  duration of the experimental phase, for tighter iteration coupling.
  Considered, but decided against — `agent-monitor` stays external and
  unchanged; the new example extension validates the surface instead, so the
  real (community-facing) extension's release cadence isn't entangled with an
  API that's still moving.

## Decision

Not yet — filed as `draft` for continued iteration.
