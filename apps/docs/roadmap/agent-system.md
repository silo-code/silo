# Agent system architecture <Badge type="warning" text="experimental" />

How Silo knows what a coding agent in a terminal is doing, and how it offers an
exact command to resume a dead session. This page is the **high-level map** for
people building Silo or building extensions on top of it — the detail lives in
the three RFCs this subsystem is tracked by:

- [RFC 0018 — `ctx.agents` surface](https://github.com/silo-code/silo/blob/main/docs/proposals/0018-ctx-agents-surface.md)
- [RFC 0019 — POSIX-shell hook runtime](https://github.com/silo-code/silo/blob/main/docs/proposals/0019-agent-hook-shell-runtime.md)
- [RFC 0020 — hooks as an authoritative activity channel](https://github.com/silo-code/silo/blob/main/docs/proposals/0020-agent-hook-activity-channel.md)

The subsystem is **experimental** — the shape below is still moving. Treat this
page as the current target, not a settled contract.

## The core idea

Silo **observes** agents a user launched themselves — you type `claude` (or
`codex`, `cursor-agent`, `copilot`) into any terminal and Silo recognizes it,
with no cooperation from the agent and nothing for you to install first. That
is the defining constraint, and it's different from orchestrator-style tools
that _own_ the agents they spawn: because Silo doesn't launch the process, it
can't assume it controls the environment, the working tree, or a hook channel.

Two signal sources, in a fixed precedence:

- **OSC / terminal output — the zero-install floor.** Silo parses the escape
  sequences and spinner frames agents already emit (Claude/Codex braille
  spinners, Cursor's OSC-0 titles, Copilot's OSC 9;4 progress, generic OSC 133
  shell integration). This works for _any_ agent in _any_ terminal with no
  setup. It's the reason detection "just works."
- **Hooks — the authoritative ceiling.** When installed, a hook reports facts
  OSC physically cannot see: the exact session id, and (per RFC 0020) crisp
  turn boundaries and whether the agent is _blocked on a permission decision_
  vs. merely idle.

**Invariant:** hooks only ever _enrich_. Remove every hook and detection still
works via OSC — a hook is never required to see or classify an agent.

## The layers

The system is a strict **collection → surface → presentation** stack. The first
two are the host; the third is **extensions**.

| Layer            | Owner               | What it does                                                                                                                                                                        |
| ---------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Collection**   | Host (sealed)       | OSC detectors + hook events feed a per-terminal activity state machine. Not pluggable — no extension registers detectors.                                                           |
| **Surface**      | Host — `ctx.agents` | Exposes the computed state as a read-only `AgentInfo` per terminal (`getState` / `getByTerminalId` / `subscribe` / `acknowledge`). The one SDK boundary.                            |
| **Presentation** | **Extensions**      | Consume `ctx.agents` and render it. `agent-monitor` draws the activity decorations on workspace rows and terminal tabs; `agent-inspector` is the reference consumer (a panel demo). |

The most important thing to understand about this stack: **the host renders
almost none of it.** It collects everything and publishes `ctx.agents`, but the
visible "agent monitoring" UI — the dots on tabs and workspace rows, the
needs-attention indicators — comes from an extension consuming that surface.

The only visual side effects that ship _in the host itself_ are:

1. A `── session ended — <resume command> ──` line printed into a terminal
   whose backend was confirmed dead, so the resume hint is visible even with no
   monitoring extension.
2. **Settings → Agents** — the page that installs/removes the hooks. This is a
   bundled `core.*` extension. Note it's _config_, not status display.

So on a stock Silo with no monitoring extension installed, the host still
detects and tracks every agent — you just wouldn't _see_ the activity anywhere
in the chrome. Making the agent state visible is a presentation concern that
lives one layer up, by design (consistent with Silo's "features are extensions
on `ctx`, not core chrome" direction).

## What each RFC owns

| RFC                                                                                                        | Owns                                                                                                                                                                                              | Status              |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| **[0018](https://github.com/silo-code/silo/blob/main/docs/proposals/0018-ctx-agents-surface.md)**          | The `ctx.agents` **surface** + the sealed OSC/activity collection, and hook-based _exact session-id_ resolution.                                                                                  | Largely implemented |
| **[0019](https://github.com/silo-code/silo/blob/main/docs/proposals/0019-agent-hook-shell-runtime.md)**    | The hook **runtime** — a readable POSIX-shell script replacing the base64/Python one-liner (which trips endpoint security and needs an interpreter that isn't guaranteed present). macOS + Linux. | Implemented         |
| **[0020](https://github.com/silo-code/silo/blob/main/docs/proposals/0020-agent-hook-activity-channel.md)** | Promoting hooks from _session-id only_ to an **authoritative activity channel**: turn boundaries, a `blocked` state, sub-agent awareness, and a hybrid install model.                             | Proposed            |

The three compose as **surface (18) ← runtime (19) → channel (20)**: 18 defines
what extensions read and does the collection; 19 makes the hook safe and
portable enough to install widely; 20 uses that hook to feed richer, more
trustworthy state into 18's surface.

## The activity model

Each terminal carries one `AgentInfo`. The fields worth knowing at a glance:

- **`activity`** — `none` · `working` · `idle` · `error` · `dead`. A fact about
  the _agent_, independent of who's looking. `dead` is the hard, confirmed
  "backend is gone after an unclean shutdown" state. RFC 0020 proposes adding a
  hook-only **`blocked`** signal (paused on a permission decision — unsafe to
  send input), which OSC cannot distinguish from idle.
- **`needsAttention`** — the _viewer-dependent_ "finished, go look" flag: set
  only when an agent goes idle in a terminal that wasn't active at that moment,
  cleared by `acknowledge`. Kept separate from `activity` on purpose.
- **`stale`** — soft, self-clearing "can't fully vouch for this restored
  duration after a long gap"; the next live signal clears it.
- **`sessionId` / `resumeCommand`** — present only when a hook reported an exact
  id. Without one, Silo gives an honest, session-id-less hint ("was running
  claude in `<cwd>`") — it never _guesses_ an id it can't back up.

OSC can set `working`/`idle`/`error` and promote a plain shell to an agent.
Hooks are what make `sessionId`, exact resume, and (RFC 0020) `blocked` and
sub-agent facts possible.

## Why hooks, and how they install

Hooks buy what OSC can't see — most importantly the exact session id today, and
under RFC 0020 the permission-`blocked` distinction and correct sub-agent
handling (a sub-agent finishing must not flip the whole session to idle; only
the parent's turn-end does). RFC 0020 also proposes a **hybrid install**:

- **Silo-spawned agent terminals** — Silo owns the process, so it can inject an
  env var and get authoritative, correlation-free activity with **zero user
  action**.
- **User-launched agents** — Silo owns nothing, so it keeps the OSC baseline
  plus the opt-in global hook (correlated by process-group id).

See RFC 0019 for the hook runtime and RFC 0020 for the activity channel.

## Open questions

These are unsettled — the reason this page is `experimental`:

- **Who owns presentation?** The hook-**config** UI (`agents-settings`) ships
  bundled, but the status-**display** (`agent-monitor`) is an external
  extension. Should the presentation layer be bundled too, or stay a
  discoverable extension? A stock Silo currently shows no agent decorations
  until one is installed.
- **How much of the hook set to install by default** (RFC 0020, decision C) —
  session-id-only vs. full activity, and whether that differs for
  Silo-spawned vs. user-launched agents.
- **`blocked` as a flag vs. an `activity` member** (RFC 0020, decision A).
- **Sub-agent correlation** — the hook events give a count and a bag of running
  types, but no key to pair a specific sub-agent start with its stop; a precise
  tree is out of scope.
- **Platform** — macOS + Linux only, and for two separate reasons. _Exact
  resume_ needs a foreground process-group id to correlate the hook's event
  against, which ConPTY has no equivalent for. _Agent identity_ has the same
  root: `agentByLeader` reads the foreground process name, so on Windows a
  terminal is classified as active-or-idle from its OSC signals but never
  named — pi is the sole exception, being the only catalog agent whose own
  title carries its identity. Windows is therefore **activity-only**, not
  "detection-only": the status is real, the agent's name is not resolved.

## Non-goals

- **Silo is not an orchestrator.** It doesn't spawn agents, create worktrees, or
  manage branches/PRs. It observes what the user runs.
- **Detection is not pluggable.** The OSC/activity logic is sealed in the host;
  extensions read `ctx.agents`, they don't extend the detector set.
- **No inferred session ids.** Exact (with a hook) or honestly vague (without
  one) — never a confident guess that could hand you a resume command that
  fails.

## Where to go next

- **Build on it:** the [`ctx.agents` surface](https://github.com/silo-code/silo/blob/main/docs/proposals/0018-ctx-agents-surface.md) (read-only `AgentInfo` per terminal).
- **Use it:** the [Agent sessions guide](/guide/agent-sessions) for the
  user-facing side — what's detected, and how to install the hooks and the
  monitoring extension.
- **The designs:** RFCs [0018](https://github.com/silo-code/silo/blob/main/docs/proposals/0018-ctx-agents-surface.md), [0019](https://github.com/silo-code/silo/blob/main/docs/proposals/0019-agent-hook-shell-runtime.md), [0020](https://github.com/silo-code/silo/blob/main/docs/proposals/0020-agent-hook-activity-channel.md).
