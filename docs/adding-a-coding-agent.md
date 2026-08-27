# Adding a coding agent to Silo

How to make a new coding-agent CLI a **known agent** in Silo: detected by
name, showing live `working`/`idle` state, and (where the agent allows it)
resumable by exact session id after a restart.

The mechanism is RFC [0018](proposals/0018-ctx-agents-surface.md) (the
`ctx.agents` surface and the agent catalog), RFC
[0019](proposals/0019-agent-hook-shell-runtime.md) (the shell capture script),
and ADR [0028](decisions/0028-sealed-agent-detection.md) (detection is sealed,
not pluggable). Read this doc for the recipe; read those for the why.

## What "supported" means — three tiers

Support is not binary. An agent lands in one of three tiers, and it is fine to
ship a tier at a time:

| Tier                 | What the user sees                                                                    | What it takes                                                     |
| -------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **1 — Identified**   | The terminal is recognized as that agent (name, cwd) and gets the generic resume hint | A catalog entry with `leaderNames` and `resume: { kind: "none" }` |
| **2 — Activity**     | Plus a live `working`/`idle` dot on the tab and in Workspaces                         | One or more detectors on the entry                                |
| **3 — Exact resume** | Plus a copy-pasteable `<agent> --resume <id>` for the session that was running        | A `hook` or `session-file` resume strategy                        |

An agent with **no** catalog entry gets none of this. It still runs fine in a
Silo terminal — it just looks like any other program, which is exactly the
symptom that starts this task ("agent X doesn't show up in my list of agents").

## The one file that must change

`packages/extension-host/src/extension-host/agent-catalog.ts` is the single
source of truth today. Every subsystem derives its view from `AGENT_CATALOG`:

> **Layout evolving (ADR 0042):** agents with non-trivial runtime quirks (pi is
> the first) will move to host-internal `agents/<id>.ts` modules with
> declarative `runtime` policy. Until that migration lands, this file remains
> the entry point — the recipe below still applies.

- detection dispatch → `detectFromOsc` / `detectIdleAfterWorking` / `detectFromOutput`
- resume-hint gating → `agentByLeader`
- Settings → Agents rows → `hookInstallableAgents()` (install toggle) and
  `sessionFileAgents()` ("Works automatically")
- hook-event display names → `agentById`
- the capture script's known-name list → `knownAgentNames()`, templated into
  `buildTrackSessionScript()`

Adding an entry is therefore additive by construction. Everything else in this
doc is either **research feeding that entry** or **surfaces that mention agents
by name in prose** (docs, website, glossary), which the catalog can't reach.

## Step 1 — Reconnaissance

Answer these before writing any code. Every answer becomes a field or a
sentence in `contract`. Install the agent locally and look at the real thing —
none of this is reliably documented upstream.

**Identity**

- What is the foreground process's argv0 basename? (`ps -ax -o pid,pgid,args`
  while it runs.) Node-wrapped CLIs report `node`, which matters for the
  capture script's parent walk.
- Does it install under more than one binary name, and does any of them
  collide with another agent? Cursor's bare `agent` shim collides with Grok's
  — Silo deliberately maps only the unambiguous `cursor-agent`.

**Activity**

- Does it set an OSC 0 title, and does that title encode status (a spinner
  glyph, a `- Working…` suffix)?
- Does it emit OSC 9;4 progress (the ConEmu protocol — `4;1|2|3` working,
  `4;0|4` idle)? Several TUIs do, often behind an **off-by-default setting**.
- Does it emit OSC 133 shell-integration zones? Those are handled by the
  generic `detectShellIntegration` fallback and tagged `source: "shell"`, not
  `"agent"` — useful noise, not identity.
- If none of the above, does the TUI animate a distinctive multi-character
  spinner in the raw PTY stream? (Grep its `dist/` for frame arrays.)

**Resume**

- Where does it store sessions, and what is the session id?
- What is the exact non-interactive resume invocation? (`--resume <id>`,
  `resume <id>`, `--resume=<id>`, `--session <id>` — all four exist in the
  wild. Check `--help`, and check whether a bare id resolves per-project or
  globally.)
- Does it have a **session-start hook that runs a shell command**? If so:
  which config file, which schema, which event name, which payload field
  spelling (`session_id` vs `sessionId`), and is there a trust/approval step
  before an installed hook actually runs (Codex has one)?
- If it has no shell hook: does it keep a live `{ pid → session id }`
  registry (Grok does)? That is the hook-free path.

## Step 2 — Write the catalog entry

```ts
const example: AgentDefinition = {
  id: "example", // stable; also the hook event's `agent` tag
  displayName: "Example CLI",
  leaderNames: ["example"], // argv0 basenames, unambiguous ones only
  activityDetectors: [
    /* … */
  ], // OSC detectors, tried in order
  outputDetector: undefined, // raw-PTY fallback (Cursor-style)
  idleAfterWorking: undefined, // contextual OSC fallback (Codex-style)
  resume: { kind: "none" }, // or "hook" / "session-file" — see Step 4
  docsUrl: "https://getsilo.dev/guide/agent-sessions#example-cli",
  contract: "…", // see Step 6
  upstreamRefs: ["…"],
  lastVerified: "YYYY-MM-DD",
  verifiedAgainstVersion: "example@1.2.3",
};
```

Append it to `AGENT_CATALOG` (order is detection-dispatch order).

## Step 3 — Activity detection

Detectors are **pure functions** in `agent-osc-detectors.ts`. There is no
registration API — detection is sealed inside the host on purpose (ADR 0028).
Reuse before you write:

| Signal                                       | Reuse                                                        |
| -------------------------------------------- | ------------------------------------------------------------ |
| Braille or `◐◑◒◓` spinner in the OSC 0 title | `detectClaudeCode`                                           |
| OSC 9;4 progress                             | `detectCopilotCLI`                                           |
| "Turn ended, plain title again"              | `detectCodexIdleAfterWorking` (as `idleAfterWorking`)        |
| Distinctive spinner in the raw stream        | a new `OutputDetector`, modeled on `detectCursorAgentOutput` |

Rules worth knowing:

- Tag `source: "agent"`, not `"shell"` — only agent-sourced signals promote a
  terminal to an agent terminal.
- A detector with no explicit idle signal must return
  `timer: "schedule-agent"` so the debounce clears `working` on silence.
  Without it the terminal reads "working" forever.
- `idleAfterWorking` is only consulted when every ordinary detector returned
  null **and** the terminal was already agent-working. That gating is what
  keeps an unrelated program that sets a window title from being promoted.
- If the agent's status marker ends up inside the visible title, extend
  `stripAgentStatusMarkers` (it's built from the same constants the detectors
  match on, deliberately).
- **Beware bare single-glyph spinners in raw output.** Generic braille frames
  (`⠋⠙⠹…`) are used by many TUIs and by shell tools; matching them in the raw
  stream is a false-positive machine. Cursor's frames are two-character and
  distinctive, which is why that detector is safe.

## Step 4 — Exact resume

`AgentResume` is a discriminated union so "no exact-resume path" is an encoded
state, not an oversight.

### `kind: "hook"` — the agent runs a shell command at session start

Fill in `configPath`, `hookEvent`, `buildCommand: () => buildHookCommand(id)`,
`buildResumeCommand`, plus `statusMessage` / `postInstallNote` where the agent
needs them. The installed command is always a plain invocation of the shared
capture script (`~/.silo/agent-hooks/track-session.sh`), which extracts the
session id, walks up to the real agent process, and appends
`{pid: <pgid>, sessionId, agent, timestamp}` to `~/.silo/agent-hooks/events.jsonl`.

`installStrategy` selects the on-disk merge algorithm:

| Strategy            | Shape                                                 | Module                      |
| ------------------- | ----------------------------------------------------- | --------------------------- |
| `claude-settings`   | `hooks.<Event>[].hooks[]` (Claude, Codex)             | `hook-installer.ts`         |
| `cursor-hooks-json` | `{ version, hooks: { sessionStart: [{ command }] } }` | `cursor-hook-installer.ts`  |
| `copilot-hooks-dir` | a dedicated file under `~/.copilot/hooks/`            | `copilot-hook-installer.ts` |

If the new agent's schema matches one of those, reuse it. If not, add a
strategy: a new pure module in `packages/extensions-core/src/agents-settings/`
that takes a structural spec (like `HookInstallSpec`) and returns the merged
config, plus one entry in the `install-strategy.ts` registry (which owns the
I/O and keeps the settings page free of `if (strategy === …)` arms). Install
appends only; uninstall removes only entries carrying `SILO_HOOK_MARKER`.
Never clobber hooks another tool installed.

### `kind: "session-file"` — the agent already tracks its own sessions

No install, no trust step, no Settings toggle: point `sessionFilePath` at the
agent's live registry and implement `resolveSessionId(fileText, pgid)`. This
works only if the agent records a **pid** you can correlate against the
terminal's foreground pgid (agents run as process-group leaders, so pgid ==
pid). An agent that stores sessions but no pid does not qualify — recency
inference was considered and rejected (RFC 0018, "Rejected: cwd + recency").

### `kind: "none"`

Honest default. The terminal gets the generic hint and nothing pretends to
know the session id.

## Step 5 — Leader names and the parent walk

Two traps, both real:

1. **Ambiguous binary names.** Only list a name that unambiguously identifies
   this agent. A shared shim (`agent`) mis-detects and, worse, produces a
   resume command that launches the _wrong_ CLI.
2. **Short names weaken the capture script's substring fallback.** The walk
   prefers an exact argv0-basename match and falls back to a substring match
   on the full argv (needed for node-wrapped agents whose argv0 is `node`).
   Every name added to `leaderNames` joins the `KNOWN` list used by _both_
   passes, so a very short name (two or three characters) can substring-match
   an unrelated ancestor's path and misattribute another agent's pgid. If the
   name is that short, verify the walk with the fixture tests in
   `agent-catalog.test.ts` before shipping, and prefer a signal that doesn't
   depend on the walk at all.

## Step 6 — Provenance (this is not optional)

`contract`, `upstreamRefs`, `lastVerified`, `verifiedAgainstVersion` exist so
the periodic agent-support audit can judge an upstream release **against what
we actually depend on** rather than diffing docs. Write `contract` as prose a
future maintainer can check: config path, event name, payload field spellings,
the exact glyph ranges, the resume syntax, and explicitly what is CONFIRMED
live versus still UNVERIFIED. State the failure symptom where you know it
("a glyph change here breaks 'working' only — the terminal never lights up").

## Step 7 — Tests

Co-located Vitest, pure logic (see `.agents/skills/silo-testing/SKILL.md`):

- `agent-catalog.test.ts` — unique id, provenance present, hook command is a
  single legible line that identifies Silo in its first 80 characters,
  `agentByLeader` maps (and, for a colliding shim, deliberately does _not_
  map), the right derived view includes the agent, `buildResumeCommand` output.
- `agent-osc-detectors.test.ts` — a golden sample per signal: the real byte
  sequence captured from the running agent, working → idle, and a negative
  case that must not promote.
- The script fixture tests in `agent-catalog.test.ts` if the parent walk needs
  a new shape proved.

## Step 8 — Everything that names agents in prose

The catalog can't reach these; grep for an existing agent's name to find them all:

- `apps/docs/guide/agent-sessions.md` — a `### Name {#anchor}` section with
  the config path and resume command. The anchor must match the entry's
  `docsUrl`.
- `apps/docs/index.md` and `apps/website/src/homepage-copy.ts` — the "works
  with" line and the trust band (`AgentIconId` + an icon).
- `packages/extensions-silo/src/agents/agent-icons.ts` — the **in-app** brand
  mark, a separate icon from the marketing site's, shown in the Agents panel
  and on CenterDock terminal tabs (`AgentIconGlyph.tsx`). Add an
  `AGENT_ICONS[id]` entry (title, light/dark hex, single `0 0 24 24` SVG
  path) even when the catalog entry is detection-only (Tier 1/2, no resume) —
  the icon isn't gated on resume support. Easy to miss because nothing fails
  loudly without it: `agentIconFor` just returns `undefined` and the row
  renders with no icon.
- `docs/domain-language.md` — if the agent introduces a new concept (a new
  resume kind, a new install strategy), the glossary changes with it.
- An ADR or RFC only if you added a **mechanism** (a new resume kind, a new
  detection channel), not for another entry in an existing shape.

## Checklist

- [ ] Agent installed locally; recon answered against the running binary
- [ ] `agent-catalog.ts` entry appended, with provenance filled in
- [ ] Detectors added or reused; idle path (explicit signal or timer) proven
- [ ] Resume strategy chosen; installer reused or added
- [ ] Unit tests: catalog integrity, detector goldens, resume command
- [ ] `agent-sessions.md` section + matching `docsUrl` anchor
- [ ] Website / docs "works with" lists and icon
- [ ] In-app icon: `agent-icons.ts` entry (separate from the website's)
- [ ] `pnpm lint`, `pnpm test`, `pnpm --filter silo exec tsc --noEmit` green
- [ ] Verified in the real app: agent shows in Settings → Agents, tab dot
      tracks a turn, resume command copies and works after a restart

---

## Worked example: pi (`@earendil-works/pi-coding-agent`)

Recon done 2026-08-22 against **pi 0.84.2** on macOS, and shipped as
`AGENT_CATALOG`'s sixth entry. Kept here as the reference walk-through,
because pi is the one agent so far that fit none of the existing shapes.

| Question            | Answer                                                                                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Binary / argv0      | `pi` on PATH → symlink to `dist/cli.js` with a `#!/usr/bin/env node` shebang, so the process reports as node-wrapped                                                                                                             |
| OSC 0 title         | `π - <session name> - <cwd basename>` — **no status encoded**, so no title-based activity                                                                                                                                        |
| OSC 9;4 progress    | **Yes**: `ESC]9;4;3 BEL` on turn start, `ESC]9;4;0 BEL` on turn end — the exact protocol `detectCopilotCLI` already parses. Gated on `terminal.showTerminalProgress` in `~/.pi/agent/settings.json`, which **defaults to false** |
| OSC 133             | Emits `133;A/B/C` zones around messages — generic shell fallback only, no agent identity                                                                                                                                         |
| Raw spinner         | Braille `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` from its TUI loader — too generic to match safely                                                                                                                                                           |
| Sessions            | JSONL per project: `~/.pi/agent/sessions/<slugified-cwd>/<timestamp>_<uuid>.jsonl`; the id is a UUID on the first line                                                                                                           |
| Live pid registry   | **None** — so the Grok-style `session-file` path does not apply                                                                                                                                                                  |
| Shell session hook  | **None.** pi's hooks are TypeScript **extensions**, auto-discovered from `~/.pi/agent/extensions/*.ts` (global; project-local `.pi/extensions` needs project trust)                                                              |
| Session-start event | `pi.on("session_start", …)` with `reason` of `startup` / `reload` / `new` / `resume` / `fork`; `ctx.sessionManager.getSessionId()` returns the id                                                                                |
| Exact resume        | `pi --session <id>` (full or partial UUID; resolves the current project first, then globally) — pi itself relaunches this way                                                                                                    |

**What supporting it took**

1. **Identity + activity.** A catalog entry with `leaderNames: ["pi"]` and
   `activityDetectors: [detectCopilotCLI]` — pi speaks the same OSC 9;4
   progress protocol Copilot does, so it shares that detector instead of
   getting a near-identical copy. Working/idle tracks turns exactly, but only
   for users who enable `terminal.showTerminalProgress`, which is off by
   default (the same situation as Cursor's `showStatusIndicators`), so the
   guide section says to turn it on.

2. **A fourth install strategy, `pi-extension`** (ADR 0041). Pi has no
   shell-command hook mechanism at all, so Silo's hook ships as a Silo-owned
   TypeScript extension at `~/.pi/agent/extensions/silo-track-session.ts`
   that calls the same shared capture script on `session_start`. Writing
   _code_ rather than data into a user's agent config is the escalation the
   ADR exists to justify and bound: adapter only, marker-carrying, node
   built-ins only, refuses to overwrite a file Silo doesn't own, deletes on
   uninstall, swallows every error.

3. **A capture-script branch, `SILO_AGENT_PID`.** Because the extension runs
   _inside_ pi, it passes pi's pid and the script skips its parent walk —
   additive, alongside the `SILO_TERMINAL_ID` seam RFC 0020 reserves. This is
   the Step 5 trap resolved rather than tuned: pi's argv0 is `node`, so the
   walk could only ever match `pi` by two-character substring. The script
   still resolves the _process group_ from that pid, which is what the host
   correlates against — verified live, a pi at pid 37886 in group 37879
   recorded 37879.

Three things this example is worth remembering for:

- **Reuse beat symmetry.** Pi got Copilot's detector and Copilot's
  dedicated-file install pattern; only the parts that genuinely differ are
  new.
- **The installer stayed pure.** The extension's source is reached through
  `AgentHookResume.buildFileContents` on the catalog entry, not by the
  installer importing the catalog — the same structural-spec rule the other
  three installers follow. (Importing it directly also drags the whole host
  barrel into a pure unit test, which is how the mistake announced itself.)
- **The verification that mattered was live.** Unit tests prove the shapes;
  running real pi with `-e <generated file>` against a scratch `$HOME`-
  relative script proved the event line, the pgid, and that
  `pi --session <id>` actually restores the conversation.
