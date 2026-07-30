---
status: draft
created: 2026-07-29
builds-on: 0018 # the ctx.agents surface this enriches
depends-on: 0019 # the shell-script hook runtime this extends
---

# 0020. Hooks as an authoritative agent-activity channel (over OSC)

> **Agent-observability series** — read together:
> [0018 · `ctx.agents` surface](./0018-ctx-agents-surface.md) →
> [0019 · POSIX-shell hook runtime](./0019-agent-hook-shell-runtime.md) →
> **0020 · hook activity channel** (this RFC). The consolidated, human-facing
> narrative lives in the
> [agent sessions guide](../../apps/docs/guide/agent-sessions.md).

## Summary

Promote Silo's agent hooks from a **session-id-only** capture (RFC 0018's
`SessionStart` correlation) to a full, **authoritative activity channel** that
sits _over_ the existing OSC/output detection — strictly additive, never a
precondition. Concretely:

1. Install a richer hook set (turn boundaries, tool-use, permission, stop,
   subagent-stop, session-end) for agents that support it, and derive activity
   from those events where present.
2. Add a hook-sourced **`blocked`** state (an agent paused on a
   permission/approval decision) that OSC fundamentally cannot distinguish from
   idle.
3. Fix the **sub-agent idle bug**: key the idle transition on the parent
   `Stop` event, so a sub-agent completing mid-turn no longer flips the session
   to idle.
4. Surface **sub-agent awareness** in the `ctx.agents` payload as a nested
   count/type list on the parent `AgentInfo` — not as peer entries.
5. Adopt a **hybrid install model**: Silo-_spawned_ agent terminals get
   env-injected, guaranteed-correlated hooks with zero user action;
   user-_launched_ agents keep the OSC baseline plus the opt-in global hook.
6. Close the **orphaned-hook lifecycle gap**: an installed hook must degrade to
   a silent, self-bounded no-op if Silo is uninstalled without removing it
   first.

The OSC layer (`agent-osc-detectors.ts`) is unchanged and remains the sole
zero-install detection path. Everything here activates only when a hook is
installed, and every state below falls back to today's OSC behavior when it is
not.

## Motivation

### The anchoring bug: sub-agent completion flips the session to idle

When a Claude Code agent spawns sub-agents (the `Task` tool), Silo transitions
the terminal to **idle the moment a sub-agent finishes**, not when the parent
turn finishes. The mechanism is unavoidable at the OSC layer: on a sub-agent's
completion, control returns to the parent, and Claude briefly emits its `✳`
idle marker before the parent spins back up. To the byte stream that is
**byte-identical** to a real turn-end `✳`. Our only lever is the
`AGENT_IDLE_DEBOUNCE_MS` (1500ms) timer in `agent-detection-dispatch.ts`, which
bets the parent resumes within 1.5s — a bet it loses whenever the parent takes
longer to process sub-agent results and re-prompt the model. There is **no
debounce value that is always right**: too short false-idles here; too long
adds latency to every legitimate idle across all agents.

Hooks resolve this by construction. Per the Claude Code hook contract
(verified against the official reference):

- **`Stop`** fires **only when the main agent finishes responding** — it does
  **not** fire when a sub-agent finishes.
- **`SubagentStop`** is a separate event that fires on sub-agent completion.

So keying idle on the parent `Stop`, with the continuous `PreToolUse`/
`PostToolUse` stream (sub-agents' own tool calls fire these too) holding the
session "working" through the gaps, makes the transition correct. AO
(agent-orchestrator) already gets this right precisely because it installs
`Stop → idle` and the tool-use trio → active, and never installs
`SubagentStop`; its design is the existence proof.

### The general limit: what OSC cannot see

The sub-agent bug is one instance of a broader ceiling. OSC/output parsing is
excellent for the **zero-install** case — it detects an agent a user launched
with no cooperation from anyone, which is Silo's defining advantage over
orchestrator-owned tools like AO (which can only observe sessions it spawned).
But it is semantically bounded. It cannot see:

- **Blocked-vs-idle.** A stopped spinner may mean "turn done" or "paused on a
  permission dialog where a stray Enter answers _for_ the user." Identical on
  the wire; opposite in meaning.
- **Session id / resume handle.** Only a hook carries it (RFC 0018 already
  exploits exactly one hook for exactly this).
- **Exit _reason_.** A `/clear` or `--resume` looks like "went idle"; a real
  exit looks like process death. `SessionEnd`'s reason field distinguishes
  them.
- **Agent identity.** Claude Code and Codex CLI share the _same_ braille
  spinner range (`detectClaudeCode`'s own note), so from OSC alone we cannot
  reliably tell them apart; the hook's `agent` tag settles it.
- **Sub-agent fan-out.** Invisible to OSC; explicit in the hook stream.

None of this argues for replacing OSC. It argues for **layering** an
authoritative channel on top of it, active only when a hook is present.

## Design

### Principle: OSC is the floor, hooks are the ceiling

`ctx.agents` is computed from two sources with a fixed precedence:

- **OSC/output (always on, zero-install)** — the current detectors. Sets
  `working`/`idle`/`error`, promotes plain shells to agents, resolves the
  generic (session-id-less) resume hint. This is the _floor_: every agent gets
  at least this, with no user action.
- **Hooks (opt-in, or auto for Silo-spawned)** — when installed, supplies the
  exact session id (already), authoritative turn boundaries, the `blocked`
  state, exit reason, agent identity, and sub-agent facts. This is the
  _ceiling_: it refines, and where it speaks, it wins over an OSC inference for
  the same fact.

**Invariant:** removing all hooks returns behavior to exactly today's OSC-only
path. A hook is never required to detect or classify an agent.

### The expanded hook set (Claude Code)

Beyond today's `SessionStart` (kept, for the session id), install:

| Native event         | AO sub-command analog   | Activity meaning                               |
| -------------------- | ----------------------- | ---------------------------------------------- |
| `UserPromptSubmit`   | user-prompt-submit      | turn start → `working`                         |
| `PreToolUse`         | pre-tool-use            | `working` (carries `tool_name`, `tool_use_id`) |
| `PostToolUse`        | post-tool-use           | `working` (see precedence rule below)          |
| `PostToolUseFailure` | post-tool-use-failure   | `working`                                      |
| `PermissionRequest`  | permission-request      | `blocked` (carries the blocking `tool_name`)   |
| `Stop`               | stop                    | **parent** turn end → `idle`                   |
| `SubagentStop`       | _(not installed by AO)_ | sub-agent counter decrement; **never** idle    |
| `Notification`       | notification            | split by `notification_type` (below)           |
| `SessionEnd`         | session-end             | exit reason → `dead` / no-op                   |

`Notification` splits the same way AO's `notificationState` does:
`idle_prompt`/`agent_completed` → `idle`; `agent_needs_input` → attention (safe
to send); `permission_prompt` → `blocked` (duplicates the earlier, richer
`PermissionRequest`).

Other agents get the subset their harness exposes; the mapping is declared
per-agent in the catalog, mirroring how OSC detectors already are. Missing
events simply leave that fact to OSC.

### New state: `blocked` (hook-sourced only)

Today `AgentActivity = "none" | "working" | "idle" | "error" | "dead"`, plus
the viewer-dependent `needsAttention` boolean. Add a **hook-only** notion of
_blocked_ — an agent stopped on a pending decision, where injecting input is
unsafe. Two shapes are viable; recommendation below.

- **Recommended — an orthogonal flag.** Keep `activity` as-is and add
  `readonly blocked?: boolean` (+ `blockedSince?`) to `AgentInfo`, set only by
  `PermissionRequest`/`Notification(permission_prompt)` and cleared by the
  _correlated_ tool's `PostToolUse` (precedence rule below) or the turn's
  `Stop`. This preserves the existing state machine and the `needsAttention`
  semantics untouched; `blocked` is simply a sharper, hook-only qualifier on an
  attention state. It also degrades cleanly: OSC never sets it, so it's
  `false`/absent for zero-install agents.
- **Alternative — a new `activity` member** (`"blocked"`), matching AO's model
  where `waiting_input`/`blocked` are distinct sticky states. Cleaner
  taxonomically, but it's a breaking widening of a `@public` enum and forces
  every consumer to handle a value OSC can never produce.

We defer a distinct `waiting_input` (idle-but-safe-to-message) vs plain `idle`
split: it only pays off once Silo can _send_ input to an agent
programmatically, which it can't today. `blocked` is the actionable
distinction now (it's the "do **not** send" signal), so it lands first;
`waiting_input` is a noted follow-on.

### The sub-agent idle fix + the precedence rule (steal the scar tissue)

Two rules, both learned from AO's PR #5 review, ported into the activity model
(`agent-activity-model.ts`):

1. **Only the parent `Stop` ends a turn.** `SubagentStop` never transitions the
   session to `idle`; it only adjusts the sub-agent counter (below).
2. **A completion never demotes a sticky state it didn't own.** With parallel
   sub-agents, `PostToolUse` events for _other_ tools stream in while the parent
   is `blocked` on a specific tool. A naive "any post-tool ⇒ working/clear"
   would clear a live `blocked`. So `blocked` is cleared **only** by the
   `PostToolUse` (or `PostToolUseFailure`) whose `tool_use_id` matches the
   `PreToolUse`/`PermissionRequest` that set it — answering a permission dialog
   fires no hook of its own, so the correlated tool _running_ is the earliest
   observable "decision resolved." This requires carrying `tool_use_id` on the
   wire from day one; retrofitting correlation later is the exact bug AO
   reverted.

### Sub-agent awareness in the payload

Sub-agents are facets of **one** session's turn: not separate terminals, not
separately resumable, not their own PTYs. They belong **nested under the parent
`AgentInfo`**, never as peer `ctx.agents` entries (which would mislead every
consumer — and any future board — into treating them as independent sessions,
breaking RFC 0018's one-`AgentInfo`-per-terminal invariant).

```ts
readonly subagents?: {          // present only when activity hooks are installed
  readonly activeCount: number; // Task PreToolUse ++ ; SubagentStop --
  readonly types: string[];     // e.g. ["Explore", "Explore", "Plan"]
};
```

**Correlation limit (design around it, don't fight it).** The start signal
(`PreToolUse`, `tool_name === "Task"`) carries `tool_use_id` and
`tool_input.agent`/`tool_input.description`, but **no** `agent_id`. The stop
signal (`SubagentStop`) carries `agent_id`/`agent_type` but **no**
`tool_use_id`. There is **no shared key** to pair a specific start with its
specific stop. Therefore we track a **count and a bag of running types**, which
is robust under parallelism; a precisely correlated per-sub-agent tree is _not_
cleanly supported by the documented fields and would require transcript
parsing — explicitly out of scope. A count is enough to render "working — 3
sub-agents (Explore ×2, Plan)".

### Hybrid install model

The install strategy forks on **who spawned the terminal**:

- **Silo-spawned agent terminals** (`kind` `"claude"`/`"pi"` — the "new agent
  terminal" path). Silo owns the command line and environment, so it can do
  what AO does: at spawn, inject **`SILO_TERMINAL_ID`** (and enable activity
  reporting) into the agent's env. The hook then writes the terminal id
  **directly** into its event line — no pid↔pgid correlation heuristic needed,
  and authoritative activity for free, with **zero user action**. This is the
  single sharpest borrow from AO, adapted to a tool that doesn't own worktrees:
  we don't own the repo, but we _do_ own the process we launched.
- **User-launched agents** (`claude` typed into a plain shell). Silo owns
  nothing here, so this keeps today's model exactly: OSC baseline always, plus
  the opt-in global hook (RFC 0019's `track-session.sh`) correlated by pgid.
  The `SILO_TERMINAL_ID` env is simply absent, and the script falls back to the
  pgid walk it already does.

One shared script (0019) serves both; the only difference is whether
`SILO_TERMINAL_ID` is present in the environment when it runs. This preserves
the zero-install crown jewel for the common case while making the case we
_do_ control fully authoritative.

### Lifecycle: orphaned hooks after an app uninstall

The global hook (written to `${home}/${configPath}`, e.g.
`~/.claude/settings.json`) **outlives the app**: deleting the Silo bundle
removes nothing under `$HOME`, and neither macOS nor Linux offers an uninstall
hook to run cleanup at removal time. So an installed hook keeps firing after
Silo is gone — appending to an `events.jsonl` nobody prunes (the pruner lived
in the host), and, in the pre-0019 base64 form, **continuing to trip EDR on
every session** for a user who already left. The hook must therefore be
**self-guarding**, since we cannot rely on running anything at uninstall time:

- **Liveness guard.** `track-session.sh` no-ops (exit 0, writes nothing) unless
  a Silo-owned sentinel is present and fresh — e.g. `~/.silo/agent-hooks/`
  carries a heartbeat file the running host touches, and the script skips
  writing when it's older than a threshold (or absent). An orphaned hook thus
  becomes a silent no-op within one heartbeat window, with no config edit
  required.
- **Self-bound.** The script caps `events.jsonl` (truncate-on-append past a
  size ceiling), so even a still-active-but-unread file can never grow without
  limit — the same defense AO's daemon applies to `hooks.log`.
- **Clean, legible runtime (already 0019).** Because the orphan is a readable
  shell script, not a base64-python blob, a stranded hook is benign to inspect
  and does not carry the EDR signature — the acute harm is gone the moment 0019
  lands; this section removes the residual cruft/growth.
- **In-app removal stays the primary path.** Settings → Agents' uninstall
  (`withHookUninstalled`) remains the clean removal, and we document a
  one-line manual cleanup (delete the marked entry + `rm -rf ~/.silo`) for
  users who removed the app first.

AO avoids this entire class of problem by installing per-worktree, ephemeral
hooks torn down with the worktree; our global install is the deliberate
trade for not owning worktrees, and the self-guard is its required companion.

### A durable failure sink (small, borrowed)

Agent hook runners swallow stderr, so a silently-dead activity feed is
invisible. Mirror AO's capped `hooks.log`: route hook read/parse/correlate
failures to the existing `silo:agents` Output channel (host side, which we
already have) so a broken pipeline is diagnosable instead of mute.

## Interaction with prior RFCs

- **RFC 0018 (the surface).** This extends `AgentInfo` (`blocked`?,
  `subagents`?) and the reducer; the read-only, sealed-detection, unscoped
  nature of `ctx.agents` is unchanged. 0018's activity-vs-`needsAttention`
  split stands; `blocked` is a new hook-only qualifier, not a re-litigation of
  the dropped `waiting`/`done` split.
- **RFC 0019 (the runtime).** This rides 0019's `track-session.sh` and adds two
  things to it: reading `SILO_TERMINAL_ID` from the environment (hybrid
  install) and the liveness-guard/self-bound (lifecycle). No change to the wire
  format or the pgid correlation. 0019's open decision B (drop `cwd`) is
  unaffected.

## Alternatives considered

- **Fix the sub-agent bug in OSC alone (tune the debounce / suppress `✳`-idle
  while tool traffic is recent).** Cheaper and helps the zero-install case, but
  stays a heuristic with no always-correct threshold. Keep it as the
  _degraded_ path when hooks are absent; don't pretend it's the fix.
- **Model `blocked` as a new `activity` enum member (AO parity).** Taxonomically
  cleaner but a breaking widening of a `@public` enum for a value OSC can never
  emit. Deferred in favor of the orthogonal flag; revisit if/when
  `waiting_input` also lands and a unified sticky-state enum earns its keep.
- **Per-sub-agent tree in the payload.** Rejected: the documented hook fields
  give no start↔stop correlation key; a faithful tree needs transcript
  parsing, disproportionate to the display value of a count.
- **Sub-agents as top-level `ctx.agents` entries.** Rejected: breaks the
  one-`AgentInfo`-per-terminal invariant and misleads consumers.
- **Require hooks for activity (drop/deprecate OSC).** Rejected outright — it
  would forfeit zero-install detection, the project's defining advantage here.

## Open decisions (need sign-off before implementation)

- **A — `blocked` as a flag vs. an `activity` member.** Recommend the
  orthogonal `blocked?: boolean` flag (non-breaking, degrades cleanly).
- **B — heartbeat mechanism for the liveness guard.** A host-touched mtime file
  under `~/.silo/agent-hooks/` is simplest; alternatives (a lockfile the daemon
  holds, a pid check) add complexity. Recommend the mtime file with a generous
  staleness window (hours) so a merely-closed app doesn't disarm a hook a user
  still wants.
- **C — how much of the expanded hook set to install by default.** Installing
  the full trio + permission + stop maximizes fidelity but widens the config
  footprint (and the EDR/attention surface, even post-0019). Option: a tiered
  toggle — "session id only" (today) vs. "full activity" — in Settings →
  Agents. Recommend defaulting Silo-spawned terminals to full activity and
  making it opt-in for user-launched global installs.
- **D — `SILO_TERMINAL_ID` direct-write vs. keeping pgid correlation even for
  Silo-spawned.** Direct-write is unambiguous; keeping correlation as a
  fallback costs nothing. Recommend writing both (terminal id when present,
  pgid always) so the reader can prefer the exact id and fall back.

## Decision

_Pending._
