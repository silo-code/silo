---
status: draft
created: 2026-07-22
# supersedes:
# superseded-by:
---

# 0017. `ctx.agents` — unified, host-computed agent activity and resume-hint surface

## Summary

Add `ctx.agents`, a new host-computed SDK surface that reports, per terminal,
what coding-agent activity is going on — busy/waiting/done/error, whether a
prior run should be trusted after a restart, and (when a terminal's backend was
found dead after an unclean shutdown) an exact or best-effort resume hint.
Detection is fully sealed inside the host implementation — no extension,
first- or third-party, registers detectors or resume-hint resolvers. The
surface is read-only (`getState`/`getByTerminalId`/`subscribe`), unscoped for
all extensions (no new `Permission`), and ships marked `experimental` via the
existing roadmap/TSDoc convention while its shape is still moving.

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
  readonly activity: "none" | "working" | "waiting" | "done" | "error" | "dead";
  readonly needsAttention: boolean;
  readonly attentionSince?: string;
  readonly workingSince?: string;
  /** Soft, time-gap-based, self-clearing — "can't fully vouch for this restored
   *  duration, but the backend may still be alive." Cleared by the next live signal. */
  readonly stale: boolean;
  /** Only populated when activity === "dead": the backend was confirmed gone
   *  (no daemon to reattach to) and will never self-resolve. */
  readonly sessionId?: string;
  readonly resumeCommand?: string;
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

`stale` and `activity === "dead"` are deliberately different signals, not one
flag: `stale` means "restored after a gap long enough to be unsure, but the
next real signal will resolve it automatically." `"dead"` means "confirmed —
there is no backend left to reattach to, and nothing will ever arrive to
resolve this on its own." Resume-hint fields populate only in the `"dead"`
case; computing them for a merely-stale terminal would be wasted work and
could surface a resume command for a session that's actually fine.

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

### Resume-hint resolution is host-internal

No `registerResumeHintProvider`, no `ctx.agentResume`. Resolution happens
**live, at agent-start detection, not post-hoc at death** — this is the
important part. The moment a terminal's leader is first detected as a known
agent kind (`isAgent` flips true), the host resolves and persists `sessionId`
immediately via `ctx.process.exec("npx", ["--yes", "continues@<pinned>",
"list", "--json", "-s", "<tool>", "-n", "50"], { cwd })`
([`continues`](https://github.com/yigitkonur/cli-continues) — MIT,
community-maintained, covers 11 real terminal-CLI agents as of its April
hardening pass) — an arm's-length subprocess call, never bundled or required
by Silo's own install. That resolved value rides along in the same persisted
`store` slice as the rest of the terminal's `AgentInfo`, so by the time
`activity` transitions to `"dead"`, no further resolution is needed — the
fields are just read back from what was already recorded.

**Correction from live testing**: the design originally assumed `continues`
scopes its results to the invoking process's cwd by default (an earlier draft
of this doc even passed a nonexistent `--cwd` flag). Confirmed empirically
false for `continues@4.1.1`'s `list --json`: it returns the globally
most-recently-active sessions across every project on the machine,
regardless of which directory the command runs from. Relying on that
assumption resolved a completely unrelated project's session in real testing
(`claude --resume <id>` failed with "No conversation found" because the id
belonged to a different project entirely). The fix: fetch a wide batch
(`-n 50`, matching `continues`'s own default ceiling) and filter for the
matching `cwd` field client-side, in Silo's own code
(`findSessionForCwd` in `agent-resume-hint.ts`) — not something delegated to
`continues`'s own (nonexistent, for this purpose) filtering.

A second, separate correction from the same testing session: `continues`
prefers an internal `sessionId` field recorded _inside_ a session's JSONL
messages over the file's own name. For compacted/chained conversations that
recorded id can reference a different (sometimes since-deleted) session than
the file `continues` actually matched, which also produced a "No
conversation found" failure in testing. Fixed by deriving the resumable
session id from the matched session's own `originalPath` file name instead
of trusting the `id` field directly — guaranteed to correspond to a file
that actually exists, since that's exactly the file that was found.

A third correction, found _after_ the cwd-scoping fix above: `continues`
also caches its own scanned session index with a **5-minute TTL**
(`~/.continues/sessions.jsonl`). Two resolutions inside that window — a
completely normal thing, e.g. starting a second Claude terminal a minute
after the first — read the same stale, pre-existing index and both resolved
to the same wrong, older session sharing the cwd, confirmed in testing.
Fixed with `--rebuild` (forces a fresh filesystem scan every time; costs a
few extra seconds, acceptable since resolution only happens once per
terminal). That surfaced a fourth, deeper issue underneath it: resolution
fires the instant a terminal's leader is first detected as `"claude"` —
essentially at process spawn — which is often _before_ the agent has
written its own session file at all. Even with a fresh index, a single,
genuinely new session with nothing on disk yet is indistinguishable from "no
new session," so the query confidently returned the most recent _pre-existing_
session for that cwd instead — confirmed with a real, solo (non-concurrent)
session that still resolved to an old one. Fixed by rejecting any match
older than roughly when resolution started (a small grace window tolerates
clock/detection skew, not staleness) and retrying for a bounded window
(`MAX_ATTEMPTS` × `RETRY_INTERVAL_MS` in `agent-resume-hint.ts`) if nothing
recent enough is found yet, rather than accepting an old match on the first
try.

A fifth correction: the initial retry budget (6 attempts × 3s ≈ 25s) was too
short — a real, concurrent second session in the same directory found
nothing at all within it. The session file isn't written at process spawn;
apparently only once the user's first real message exchange completes, and
there's no reliable upper bound on how long that takes. Extended to 15
attempts × 5s (~115s worst case) — generous, not exhaustive; an unusually
slow first message still falls back to the generic hint.

A sixth correction: multiple Claude accounts via `CLAUDE_CONFIG_DIR` (e.g. an
enterprise account using the default `~/.claude`, a personal one using a
separate config dir) is a real, confirmed case — `continues` only reads
whichever `CLAUDE_CONFIG_DIR` is in _its own_ process environment, and
spawning it via `ctx.process.exec` doesn't inherit or replicate the
shell-rc logic that would normally set that variable for a real interactive
terminal (confirmed: sessions under a non-default config dir were never
found at all, regardless of retry budget). Rather than reproduce the user's
shell environment exactly (risks interleaving unrelated shell-startup output
— e.g. `nvm`'s own warnings, seen elsewhere in this same environment — into
the JSON output this depends on parsing cleanly), the fix queries the known
alternate config dir explicitly (`$HOME/.claude-personal`, resolved via a
one-shot `$HOME` exec since there's no `process.env` in this webview
context) and merges results. This is a narrower, confirmed-case fix, not a
general "discover every possible config dir" solution.

A seventh correction, found immediately once the sixth's own diagnostic
logging was added: that one-shot `$HOME` exec used `sh -c "echo -n $HOME"`,
and `-n` is not a portable `echo` flag — depending on which shell backs
`/bin/sh`, it printed as **literal text** instead of suppressing the
newline, corrupting the resolved path into `"-n /Users/dweaver"` (confirmed
directly in the log's own "trying these config dirs" debug line, which is
exactly why that logging was added in the first place). Fixed by using
`printf '%s' "$HOME"` instead — POSIX-standard, no flag-portability
ambiguity to get wrong.

Resolving at start time rather than at death time is not a stylistic choice —
it's what keeps this accurate for concurrent sessions in the same directory.
If resolution happened post-hoc (query `continues` by cwd only after the
backend is confirmed dead), two terminals that both ran Claude in the same
workspace would both ask the identical cwd-scoped question at the same later
moment and get the identical answer — at most one of them right, the other
pointed at someone else's session. Resolving at each terminal's own start
time means each capture happens when its own session file is (almost always)
the newest one for that cwd, before any later sibling session may even exist.
Residual risk: two sessions in the same cwd starting within the same tight
window, before either's session file is distinguishable by mtime yet — rarer
than "concurrent existence" but not zero; a short settle-delay before
resolving narrows it further.

If the command is missing or errors, or `continues` has no match, the
resolution falls back to a generic "was running `<leader>` in `<cwd>`" hint
with no exact session id, still captured at start time. Known gap: Aider is a
real terminal agent absent from `continues`'s registry (it has no
session-id concept at all — cwd-based auto-history load, simpler than the
rest); plan is to contribute it upstream using `continues`'s documented
3-file "Adding a New Platform" recipe rather than fork or reimplement.

**Invocation: `npx`, pinned to an exact version, not a caret range.**
`npx <pkg>` caches aggressively and does **not** reliably re-check the
registry for a newer matching version on subsequent runs (a well-documented,
recurring complaint in the npm ecosystem, e.g. `npm/cli#7838`) — so a loose
range like `continues@^2.0.0` doesn't actually give reliable freshness, and
different users' machines could end up frozen on different actual versions
depending on when they first triggered the feature. Pinning an **exact**
version (`npx --yes continues@4.1.1`) instead gives predictable, identical
behavior across every Silo install on a given release; bumping that literal
pinned string (verifying the JSON-shape validation still passes) becomes
routine Silo-side maintenance, not something left to npx's cache behavior.
This also requires nothing be installed persistently — Node/npm/npx are not
present on a typical **end-user** Silo install at all (Tauri ships a native
binary + OS webview, no bundled Node runtime; the Node requirement in this
repo's own `pnpm dev`/`build` commands is a _development_-time-only
dependency). Machines without Node get the same generic fallback as any other
exec failure — accepted as the normal case for a plain Silo install, not an
edge case being waved away.

**Deferred: a compiled sidecar binary instead of `npx`.** Seriously
considered, for full guaranteed presence regardless of whether the user has
Node, and to avoid any dependence on `npx`'s cache semantics at all. Not
pursued now: `continues` needs real `node:fs`/`node:sqlite`, so it can't be a
`package.json`/import dependency — the only real path is compiling it to a
standalone executable and shipping it as a Tauri sidecar binary, which means
Silo standing up cross-platform (macOS/Windows/Linux) build/CI infrastructure
for it (no prebuilt binaries exist upstream today), an open feasibility
question around whether single-executable-app tooling cleanly bundles
`node:sqlite` (a newer built-in `continues` depends on for OpenCode parsing),
and pulling `continues`'s own dependency tree (chalk, commander, zod, ora,
`@clack/prompts`, yaml) into Silo's own build and security-audit surface. That
's a disproportionate lift to stand up before `ctx.agents` and the
resume-hint feature have proven worth the investment. Revisit as a hardening
step once the feature is shipped and known to matter.

### Hook-based resolution (tier-1, exact) — addendum

Everything above this point is **inference**: `continues` guesses the right
session by directory + recency, and every correction logged in this section is
a way that guess can still be wrong (concurrent sessions, stale caches, a
session file that doesn't exist yet). Testing converged on a structural
ceiling: no amount of hardening the guess makes it _exact_, because directory +
recency is fundamentally not a unique key — two terminals can share both.

The question that reopened this: **"will the `continues` package work for
us?"** The answer is no, not as the _only_ mechanism, once concurrent same-cwd
sessions are a real case rather than a hypothetical. Research into how
comparable tools solve the identical problem
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
   `CLAUDE_CONFIG_DIR`-aware — unlike the `continues`-based path's
   `candidateConfigDirs`, this toggle assumes the CLI's standard setup and
   links out to a docs page (`apps/docs/guide/agent-sessions.md`) for adding
   the hook manually under a non-default config. This is a deliberate
   simplification, not an oversight: the hook path's correlation is
   PID-based, not config-dir-based, so which account's config file carries
   the hook entry has no bearing on which terminal an event matches — the
   per-config-dir differentiation the `continues` fallback needs doesn't
   apply here. Toggling appends a `SessionStart` hook entry to that file
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
2. **Read** (`agent-hook-events.ts`): the host tails that file (new lines only,
   via an in-memory line-count checkpoint — resets harmlessly on app restart),
   discarding any event older than 10 minutes (`MAX_EVENT_AGE_MS`) as a guard
   against the OS reusing a pid long after the hook that reported it fired.
3. **Correlate** (`matchHookEventsToTerminals`, a pure function so the
   matching rule itself is unit-testable without the rest of the
   session-tracking machinery): each tracked terminal's `SessionEntry` now
   also carries `currentPgid`, updated on every foreground tick (both the live
   `onTerminalForeground` stream and the one-time
   `terminal_foreground_snapshot` seed). A hook event's `pid` matched against
   a terminal's `currentPgid` is an exact identification — no cwd, no
   recency, no guessing.
4. **Precedence**: a hook match sets `hookConfirmed` on that terminal's entry;
   once set, a same-terminal `continues`-based resolution that resolves
   _later_ (the two race, since both can be in flight at once — the hook poll
   runs on its own 3s interval independent of the `continues` retry loop) is
   discarded rather than allowed to overwrite the exact result. Whichever
   arrives first still wins in the sense that either can populate
   `sessionId`/`resumeCommand` — the guard is one-directional (exact beats
   inferred), not "hook must always finish first."

This is additive, not a replacement: **not every agent leader has a
Claude-only, hook-capable equivalent, and the hook is opt-in per config dir**
(a user who hasn't installed it, or is running an agent Claude Code's hook
system doesn't cover, still gets the `continues`-based inferred hint as
before). Nothing above changes `AgentInfo`'s public shape — `sessionId`/
`resumeCommand`/`agentName` are populated the same way regardless of which
tier produced them; extensions consuming `ctx.agents` cannot tell (and don't
need to) which mechanism resolved a given terminal's identity.

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
(`matchHookEventsToTerminals`) is unit-tested in isolation; installing the
hook via the Settings → Agents page and confirming a live Claude session
actually gets exact, hook-confirmed correlation end-to-end (events.jsonl gets
written, pid matches the right terminal, precedence over an in-flight
`continues` resolution holds) is still pending live testing, not yet done.
Quit and relaunch Silo afterward to trigger reattach and observe the
transition.

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
  agent doing / who is it," share identity keys, and the cost-profile
  difference (cheap continuous OSC parsing vs. rare expensive subprocess exec)
  is handled by gating resume-hint fields on `activity === "dead"` rather than
  splitting the type.
- **Public `registerResumeHintProvider`.** Rejected: the "cover a dozen
  agents" extensibility need for resume-hints is already delegated externally
  to `continues`; Silo doesn't need its own plugin system on top of an
  existing one.
- **Public `registerDetector`/`registerOscDetector`/`registerOutputDetector`.**
  Seriously considered (there's no `continues`-equivalent catalog for OSC
  detection coverage), but rejected in favor of full sealing, for consistency
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
  generic-fallback case (no `continues` match) is inherently a compound shell
  command (`"cd ~/foo && claude --resume"`), not a clean binary+args
  invocation, so structured fields would need a real discriminated union to
  cover it and would still leave an unstructured path for that case anyway —
  no clean win. Structured args sitting on the payload also invite silently
  wiring up execution (`ctx.process.spawn(binaryName, resumeArgs)` with no
  confirmation step), directly undermining the explicit no-auto-relaunch
  decision from early in this design. And because `ctx.agents` is marked
  `experimental` specifically to make the shape cheap to change later, the
  future-proofing benefit of guessing at a richer shape now is smaller than
  usual — better to add real structure once an actual auto-launch feature is
  proposed and its concrete needs (confirmation UX, which spawn primitive) are
  known. `sessionId` stays as the one field that keeps that door open.
- **Shipping `continues` as a compiled sidecar binary** bundled with Silo's
  own install, instead of shelling out via `npx`. Would guarantee presence
  regardless of whether the user has Node, and sidestep `npx`'s
  cache-doesn't-reliably-update behavior entirely. Deferred rather than
  rejected outright: it requires standing up cross-platform build/CI
  infrastructure Silo doesn't have today (no prebuilt binaries exist
  upstream), carries an open feasibility question around bundling
  `node:sqlite` via single-executable-app tooling, and pulls `continues`'s
  own dependency tree into Silo's build/security surface — a bigger lift than
  is justified before the feature has shipped and proven itself. Revisit once
  it has.
- **Pulling `agent-monitor` into the monorepo** as a bundled extension for the
  duration of the experimental phase, for tighter iteration coupling.
  Considered, but decided against — `agent-monitor` stays external and
  unchanged; the new example extension validates the surface instead, so the
  real (community-facing) extension's release cadence isn't entangled with an
  API that's still moving.

## Decision

Not yet — filed as `draft` for continued iteration.
