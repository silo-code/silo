---
status: implemented # draft | accepted | implemented | rejected | superseded-by NNNN
created: 2026-09-22
---

# 0052. Reporting where an agent session is working

## Summary

An Agent Session's working directory can move. A Terminal session's moves
whenever the user `cd`s; a Chat session's moves when the agent relocates into a
git worktree. Silo reported neither — `AgentInfo` had no working-directory field
at all, and the Chat panel's breadcrumb showed the folder the session started in
for as long as it lived.

This adds `AgentInfo.cwd`, host-computed, one field for both kinds. A Terminal
session fills it from its foreground process. A Chat session fills it from the
session root, unless the agent **states** that it has relocated.

The deliberate part is what this does _not_ do: it makes no attempt to infer a
Chat session's location. The measurements below are why.

## Motivation

A user who asks an agent to spin up a worktree and start a bug fix expects the
UI to follow. It didn't, and the cause is structural: ACP models `cwd` as an
input to `session/new` and never revises it. `SessionInfoUpdate` omits it
deliberately, on the stated premise that "`cwd` is immutable and set during
`session/new`". Claude Code's `EnterWorktree` violates that premise in shipped
code, reporting "The session is now working in the worktree" — in prose, because
prose is the only channel it has.

Terminal sessions never had this problem, because the host reads their working
directory from the OS. The asymmetry was the bug: `ctx.agents` promises "the
same `AgentInfo` shape for both kinds" (RFC 0038), and location was missing from
both halves of that promise.

## Design

`AgentInfo.cwd?: string` — where the session is currently working.

- **Terminal session** — the working directory of the foreground process,
  already delivered to the host on every foreground tick (`ForegroundInfo.cwd`,
  resolved via `tcgetpgrp` + `proc_pidinfo`). Ground truth, live within ~750ms,
  catching a bare `cd` at the prompt. This was already arriving; it just wasn't
  surfaced.
- **Chat session** — the session root, unless a relocation is announced.

### Relocation announcements

A small table keyed on **tool title** — Claude Code's `EnterWorktree` /
`ExitWorktree` — read from the call's _modelled content blocks_, never
`rawOutput`. Keying on the title is what keeps the same sentence quoted in a
`Bash` result from being mistaken for a relocation.

An announced path is honoured even **outside** the session root: a worktree
created with `git worktree add ../name` is a sibling, and the agent named the
destination explicitly. The directory is confirmed to exist before being
reported, so a torn-down worktree or a stale journal replay falls back to the
root rather than naming somewhere that isn't there.

`ExitWorktree` is matched on its name alone — the destination is always the
session root, so there is nothing to extract and one less thing to break when
the wording moves.

No other agent has an equivalent. Cursor and Codex sessions report their session
root, which is accurate; they are not silently wrong.

### Why the host owns it

The panel is a _subject_ of agent chrome, not an author of it — its own code
says so. An extension also physically cannot do this work: it needs a filesystem
probe and, for the Terminal half, OS process inspection, and the platform ban
blocks `@tauri-apps/*` and `node:*` in extension packages. The host already
holds every input.

## Alternatives considered

Each of these was implemented or measured against 327 recorded sessions
containing seven real relocations into a git worktree.

**Infer the location from tool-call `locations`.** Built first, then removed.
It produced **no true positives at all**: every genuine relocation in the corpus
was found by the announcement, never by inference. `locations` ride on
`edit`/`read` calls, so a session doing its file work through the shell emits
none — three of the seven relocations had zero, one consisting of 53 `execute`
calls and nothing else. What inference _did_ produce was a third of production
sessions proposing an ordinary subdirectory, held back only by a `.git` probe,
plus a latent false positive for git submodules (which carry a `.git` file).
A signal that never fires correctly is not a safety net.

**Use git worktree metadata as the source of truth.** Appealing — it is
agent-agnostic, and `<repo>/.git/worktrees/*/gitdir` yields every worktree root
without a subprocess. Two problems. Watching for a new worktree is
**unattributable**: with several agents in one workspace, nothing records which
session created it (Silo already has this event, ADR 0037, and correctly uses it
only for the workspace-level "add as a folder?" prompt). And using it instead as
a _classifier_ over paths a session reports inherits the coverage problem above —
it makes a single location conclusive, but half the sessions report none.

**Poll the agent process's working directory**, as the Terminal path does. The
analogy does not survive contact: a terminal's cwd _is_ its shell's process cwd;
a Chat session's is not its adapter's. Four running adapters were inspected and
every one sat at its spawn directory, as did their agent children. A shell `cd`
inside one tool call is also a _per-command_ working directory, which ACP models
separately (`CommandPermissionSubject.cwd`, `TerminalUpdate.cwd`) and which
should not move the session.

**Parse shell commands.** Across 2,951 `execute` calls, `rawInput` carries
`command`, `description`, `timeout` and `run_in_background` — never a `cwd`. In
the one session where a worktree path appeared in commands at all, it appeared
in 3 of 35.

**Read the agent's own session files.** The most accurate source that exists:
Claude Code records `cwd` _and_ `gitBranch` on every message of its transcript,
tracking `cd` into subdirectories live, and its transcript is keyed by the same
session id ACP uses. Rejected as a private, undocumented layout with no
compatibility promise — and one that buys nothing for other agents, since Cursor
(`~/.cursor/acp-sessions/<id>/meta.json`) and Codex both record only a start
directory.

**Accept ACP client terminals (`terminal: true`).** `terminal/create` takes an
absolute `cwd`, so Silo would see the working directory of every command the
agent runs. Deferred: it means Silo executing agent commands, with its own
security surface, and deserves its own proposal.

## Decision

Accepted and implemented as described. The scope is deliberately narrow: report
what is known, never guess. The vendor table is a contained exception to the
repo's preference against vendor-shaped behavior, taken because it is the only
signal that worked on every observed relocation and because it fails closed.

**Follow-up.** The investigation's most useful finding is that this is not a
Silo gap but a protocol one: the agent already knows. Claude Code maintains a
per-message `cwd` internally and persists it, while having no way to report it;
Cursor and Codex track only a start directory, which is exactly what one would
expect when nothing in the protocol can carry a change. An RFD has been drafted
for ACP proposing `cwd` on `SessionInfoUpdate` — which its own alignment rule
already implies, and which is excluded only by the immutability premise this
work shows to be false. If it lands, it becomes the signal for every agent and
the vendor table is deleted rather than reworked.
