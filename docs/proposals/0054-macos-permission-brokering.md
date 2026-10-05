---
status: draft
created: 2026-10-05
---

# 0054. macOS permission brokering for hosted processes

## Summary

Silo is the **responsible process** for every terminal, agent, and dev server it
hosts, which makes it the TCC identity macOS consults when any of them touches a
protected resource. Silo currently fills that role by accident: it carries no
usage strings or entitlements beyond what one bug at a time has forced, it gives
the user no way to see or re-acquire a permission, and its headline terminal
persistence silently defeats the one remedy every macOS troubleshooting guide
prescribes. This proposes treating "host of other people's processes" as a
designed responsibility: a complete and deliberate permission manifest, a
diagnosable permission state, and a session-restart path that lets a new grant
take effect without discarding a workspace.

## Motivation

A user ran a screen-and-audio capture script in a Silo terminal. It failed with
a capture of 0 bytes and no permission dialog, and took hours across two
sessions to diagnose — ending only when the script was moved to Terminal.app,
where a different and _correct_ diagnosis became visible. Three separate
failures compounded, and each is a design gap rather than a bug:

1. **The manifest was incomplete, and silently so.** `Info.plist` carried one
   usage string, `NSLocalNetworkUsageDescription`, added when exactly this bug
   was hit for local network access. Microphone was missing, so macOS could not
   render a consent prompt and denied the request without asking. Release
   builds are signed with the hardened runtime and _no_ entitlements file at
   all, which refuses audio input and Apple Events ahead of any TCC decision.
   The precedent is the tell: the local-network key was added reactively, as
   will the next one, because nothing says what the full set should be.

2. **There is no way to observe permission state.** A denied TCC request is
   indistinguishable from a broken tool. Silo knows it is the responsible
   process for every session it spawns, so it is the only component positioned
   to say "this failed because the microphone is denied to Silo" — and it says
   nothing. The user's own notes resorted to querying `TCC.db` with `sqlite3`.

3. **Terminal persistence defeats the standard remedy, invisibly.** macOS
   applies a new grant only to processes started after it. Every persistent
   session is a detached daemon reparented to launchd (RFC
   [0010](./0010-pty-host-daemon.md)) that by design survives Cmd+Q — so
   "grant it, then quit and relaunch the app" is a no-op in Silo, and
   relaunching reattaches to the same pre-grant daemons. The user followed
   correct advice repeatedly and correctly concluded it had not worked.

Point 3 is the one that cost the hours, and it generalizes past permissions: any
state a session captured at spawn is now immortal relative to the app. That is a
consequence of a deliberate product promise, which is why it needs a designed
escape hatch rather than a fix.

## Design

### A declared permission manifest

Treat the set of TCC services a host app must cover as a decision of record
rather than an accumulation. Silo hosts arbitrary user processes, so the
baseline is "every service a terminal, agent, or dev server could plausibly
reach" — the set VS Code ships, which is the closest comparable host. Two
artifacts, both required and easy to get half-right:

- `Info.plist` usage strings — let macOS _ask_.
- An entitlements file wired to `bundle.macOS.entitlements` — let the hardened
  runtime _permit_.

Either alone still fails, which is worth stating in both files, because the
symptom of getting it half right is a silent denial.

### Observable permission state

`ctx` gains a way to query whether a named macOS permission is granted to Silo,
and the host surfaces it: a diagnostics view that lists each service with its
current state and a deep link to the right System Settings pane. The point is
to collapse "my tool is broken" into "Silo is denied the microphone" without
leaving the app. Shape, naming, and whether this is a settings page, an Output
channel, or both are open — see Alternatives.

### Session restart as a first-class action

A command that tears down a session's host daemon and respawns it in place,
preserving the terminal's identity, workspace membership, and scrollback where
possible. This is what the user actually needed and had to discover by
accident (closing the terminal and opening a new one). Making it explicit and
named is most of the value, because it also gives the permission diagnostics
something to point at: "granted — restart this session for it to take effect."

### A constraint worth recording

RFC [0053](./0053-session-host-binary-staging.md) stages the session-host binary
outside the app install on Windows and Linux, and notes that "macOS stays on the
direct re-exec permanently." There is now a second, independent reason that must
stay true: macOS resolves a process's TCC identity from its enclosing bundle, so
a session host copied out of `Silo.app` would lose the `com.silo.desktop`
identity and every grant made to Silo would stop applying to terminals — a
regression that would present as the exact silent denial described above.

## Alternatives considered

- **Keep adding usage strings reactively.** What happens today. Cheap per
  incident, but each one costs a user a multi-hour diagnosis first, and the
  diagnosis is unusually hard because the failure mode is silence.
- **Document the quit/relaunch gotcha and stop there.** Worth doing regardless,
  and it is the cheapest part of this proposal. It does not help the user who
  never suspected a permission, which was the actual failure here.
- **Have Silo prompt for permissions proactively at startup.** Rejected: a
  developer tool that asks for the microphone and camera on first launch, for
  reasons it cannot yet explain, spends trust it needs later. Request on
  demand, explain on failure.
- **Detect TCC denials by reading `TCC.db`.** Rejected as a foundation: it needs
  Full Disk Access, is undocumented, and Apple has changed its schema. Usable
  only as a last-resort diagnostic, not as the mechanism behind `ctx`.
- **Kill session hosts on app quit** so grants apply after a relaunch. Rejected
  outright — it trades the headline persistence promise for a permission edge
  case.

## Decision

Open.
