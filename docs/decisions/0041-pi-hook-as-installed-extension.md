---
status: accepted
date: 2026-08-22
---

# 0041. Silo's pi session hook ships as an installed TypeScript extension

## Context

Every coding agent Silo supports exposes exact-resume identity one of two
ways (ADR 0028's sealed catalog): a **session-start hook that runs a shell
command**, configured as data in a JSON file (Claude, Codex, Cursor,
Copilot), or a **live session registry** the agent maintains itself that
Silo can read (Grok). Installing support is therefore either a merge into
someone's config file or nothing at all.

It fits neither. Verified live against pi 0.84.2:

- It has no shell-command hook mechanism. Its extension points are
  **TypeScript modules** auto-loaded from `~/.pi/agent/extensions/*.ts`,
  which subscribe via `pi.on("session_start", handler)`.
- It keeps no pid-bearing session registry. Sessions are per-project JSONL
  files (`~/.pi/agent/sessions/<slugified-cwd>/<timestamp>_<uuid>.jsonl`)
  with no record of the process that owns them, so Grok's correlation —
  match the terminal's foreground pgid against a recorded pid — has nothing
  to match against.

So the options were: give pi no exact resume (`kind: "none"`), infer the
session from file recency (explicitly rejected in RFC 0018 as unsound with
more than one session per directory), or **write code into the user's agent
config**. The last one is a real escalation: every other install Silo
performs is a data edit that a user can read at a glance, and RFC 0019 went
out of its way to make even the shell script legible rather than clever,
precisely because a coding-agent config is a sensitive place to be writing.

## Decision

Silo installs its pi hook as a Silo-owned TypeScript extension at
`~/.pi/agent/extensions/silo-track-session.ts`, via a fourth install
strategy, `pi-extension`.

The escalation from data to code is bounded by four constraints, all
enforced in the generated source (`agent-pi-extension.ts`) and its tests:

1. **It is an adapter, not a second implementation.** The extension reads
   the session id and spawns the _same_ shared capture script every other
   agent runs (RFC 0019), passing the payload on stdin. Capture logic has
   exactly one home.
2. **It is legible and attributed.** It leads with a plain-language header
   naming Silo and what it does, carries the `silo-managed-agent-hook`
   marker, imports only node built-ins (plus a type-only import that is
   erased at runtime), and contains no network access, no dynamic
   evaluation, and no filesystem writes of its own.
3. **It never overwrites what Silo doesn't own.** Install refuses if a file
   Silo didn't write already occupies the path; uninstall deletes only a
   file carrying the marker; drift-refresh rewrites only Silo's own file.
   No other part of pi's configuration is read or written — pi
   auto-discovers the directory, so there is no registration step.
4. **It never breaks a turn.** Every failure path is swallowed.

Because the extension runs _inside_ pi's process, it passes pi's pid to the
capture script as `SILO_AGENT_PID`, and the script skips its parent walk
(an additive branch alongside the `SILO_TERMINAL_ID` seam RFC 0020
reserves). The script still resolves that pid's **process group** itself,
which is what the host correlates against a terminal's foreground pgid —
verified live: a pi at pid 37886 in group 37879 recorded 37879.

That branch also sidesteps a trap the walk would otherwise hit. pi's argv0
is `node` (its bin is a shebang script), so the walk could only match it by
its _substring_ fallback — and `pi` is two characters, short enough to
match an unrelated ancestor's path. Passing the pid removes the guesswork
instead of tuning a heuristic.

Consequences:

- Uninstall is delete-only, so an orphaned hook cannot outlive an
  uninstall silently — the failure mode is a missing file, not a stale
  entry buried in a shared config.
- Silo's installed source is now a maintenance surface: a breaking change to
  pi's extension API breaks _installed_ hooks, not just new ones.
  Drift-refresh rewrites Silo's file on launch, which limits the blast
  radius to users who never relaunch Silo.
- The strategy is pi-specific on purpose. It is not a general "write code
  into agent configs" capability, and any future agent wanting it needs its
  own ADR.

## Alternatives considered

**`kind: "none"` (detection only).** Cheapest and safest. Rejected because
pi's session ids are trivially available at `session_start` and its resume
syntax (`pi --session <id>`) is exact — the capability is fully there, and
declining it would be Silo choosing not to support an agent it can support.

**Recency inference over the project's session directory.** No install at
all. Rejected on the same grounds RFC 0018 rejected it generally: it is
silently wrong whenever a user runs two pi sessions in one directory, which
is the exact workflow Silo exists to make easy.

**Ship the hook as a published pi package (`pi install`).** Would move the
code out of Silo's install path and into pi's own package manager.
Rejected for now: it adds a publish/version treadmill and a network
dependency to something a single generated file already does, and it would
still be Silo's code running in the user's agent — the same trust question,
with more moving parts.

## References

- ADR 0028 (sealed detection) · ADR 0042 (host-internal catalog layout for
  quirky agents — install strategy here is unchanged)
