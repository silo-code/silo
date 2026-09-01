# Design — 0033. Agent Profiles (phase 1)

How phase 1's requirements are satisfied. Working artifact — removed when the
proposal collapses; the durable pieces move into the collapsed proposal or an
ADR.

## Architecture

Everything in phase 1 lands in **this repo**, across four places:

| Package                                                 | What it owns here                                                                                                                                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@silo-code/extension-host` (`packages/extension-host`) | The `AgentProfile` record, its state slice and persistence, the pure model helpers, the probe, the pending-launch registry, the agent-icon data, and the `+` menu chrome.               |
| `@silo-code/sdk` (`packages/sdk`)                       | `TerminalRecord.profileId`, the `TerminalKind` / `AgentInfo.kind` deprecations, `AgentIcon` / `CatalogAgentSummary`, `AgentsService.catalog()`, and the `AgentIconGlyph` kit component. |
| `@silo-code/extensions-core` (`core.*`)                 | The Profiles settings tab and editor (`core.agents-settings`), and the profile rows plus session-ready reporting on the terminal (`core.terminal`).                                     |
| `@silo-code/extensions-silo` (`silo.*`)                 | `silo.agents` deletes its local `agent-icons.ts` and reads `ctx.agents.catalog()` instead.                                                                                              |

**Why the host owns profiles.** A profile is consumed by host chrome (the `+`
menu lives in `packages/extension-host/src/panels/GroupAddMenu.tsx`, which cannot
import an extension package) and it drives a host capability (creating a terminal
record and writing into its PTY). Extensions get at it through
`@silo-code/extension-host/internal`, which is exactly the trust tier this needs:
`core.agents-settings` and `core.terminal` are the only consumers in phase 1, and
the public `ctx.agents.profiles` is deliberately deferred (phase 5) rather than
shipped ahead of a public consumer — the public-first rule cuts this way because
there is no `silo.*`/third-party consumer yet.

## The launch model — an intent, not a spawn

This is the load-bearing decision of the phase, and it is a correction to the
RFC's sketch. The RFC said the host should own the sequence
`create record → ensureSession() → write`. Reading the terminal code shows that
cannot work as stated:

- `TerminalPanel` computes `needsCreate = !tRec.sessionId` on mount and spawns
  its own session through `spawnTerminalSession`.
- `terminal-service.ts`'s `ensureSession` — the lazy-spawn fallback behind
  `ctx.terminals.sendText` — spawns through a _different_ path, and its
  in-flight `spawning` map does not know about the panel's spawn at all.

The `+` menu opens the panel and calls the launch in the same tick, so both would
be in flight simultaneously. Whichever loses gets its session orphaned by
`ensureSession`'s `if (!rec.sessionId)` guard: **two PTYs per launch, one leaked
forever.**

So the launch does not spawn. It records an intent:

```ts
// packages/extension-host/src/extension-host/agents/pending-launch.ts
/** Record what should be typed into a terminal once its session is live. */
export function requestProfileLaunch(
  terminalId: string,
  profileId: string,
): void;
/** Claim it — returns the pending launch and removes it, or null. Idempotent. */
export function takePendingLaunch(terminalId: string): PendingLaunch | null;
/** Drop it unconsumed (the record was removed, or the workspace was reaped). */
export function discardPendingLaunch(terminalId: string): void;
```

Whoever brings the session up drains it:

- **Foreground** — `TerminalPanel`, at the point it already reaches
  `setLifecycle({ kind: "ready", sessionId })`, calls the drain. This is the same
  moment the deleted `kind` shim fired, so the timing is known-good; what changes
  is that the view no longer decides _what_ to type, only that it is ready.
- **Background** — a workspace whose panel never mounts has no one to report
  readiness, so `launchAgentProfile` additionally calls `ensureSession` for that
  case and drains on resolve. It decides which case it is by comparing the target
  workspace to the active one — no caller flag, nothing speculative.

The background branch has **no phase-1 caller**: both phase-1 surfaces (the `+`
menu and the terminal body menu) open a panel in the active workspace. It is
built now anyway, because it has two named consumers one and four phases out —
`silo agent run --profile <id>` in phase 2, which resolves its workspace from the
shell's cwd and may well not be the one on screen, and
`ctx.agents.profiles.launch({ workspaceId })` in phase 5. Note that the intent
registry alone does **not** fix the background case the RFC's motivation names:
an intent nobody drains does nothing, so without this branch a background launch
would sit inert until someone clicked the tab — which is exactly today's bug.
Phase 1 therefore verifies it by unit test rather than by hand; there is no
button that reaches it yet.

### Pending launches live in memory only

The registry is a module-level map, never persisted. That is a correctness
requirement, not an implementation shortcut: a launch intent that survived a
restart would type `claude` into a terminal the user reopened hours later,
unprompted, possibly mid-command. The failure mode of _not_ persisting is a
terminal that came back as a plain shell, which is the right way round.

The consequence to accept: a crash between record creation and drain loses the
launch. The record and its `profileId` persist; the intent does not.

### A third launch shape, for phase 2 to inherit

`silo agent run` typed **inside** a Silo terminal launches into that terminal —
which already has a live session, so there is nothing to spawn and no
session-ready signal to wait for. Its trigger is different: the host must wait
for `silo` itself to exit and hand the prompt back, which it can already observe
through `ctx.processes`. Same record-the-intent shape, different drain signal.

Keep `PendingLaunch` and its drain decoupled from session-readiness for that
reason — `takePendingLaunch(terminalId)` is already trigger-agnostic, so phase 2
adds a second caller rather than reworking the registry. Do not fold the
readiness check into the registry itself.

`takePendingLaunch` removing the entry is what makes double-drain impossible:
whichever path arrives second gets `null`. That is the whole concurrency
argument, and it is one map operation rather than a lock.

This is the pattern the repo already uses for exactly this class of
"two authorities, one outcome" problem — `editor-reveal.ts`'s
`takePendingReveal`, and `panel-activation-requests.ts`'s
`requestPanelActivation` (ADR 0034). Following it here also disposes of the
RFC's `setTimeout(…, 150)` replacement question: there is no timer and no
first-output heuristic, because the panel already knows when its session is
ready.

**The launch line is resolved at drain time**, not captured at click time, so an
edit or delete landing in between is respected — a deleted profile drains to
nothing and leaves a plain shell.

### Terminal identity: a pre-existing defect this phase must fix

`ensureSession` currently spawns through the **public** `getProcessService().spawn`,
whose own comment reads: _"No terminal id: a session spawned through the public
surface isn't a tab, so it gets the flag and the workspace facts and nothing
more."_ Only the privileged `spawnTerminalSession({ terminalId, … })` stamps
`SILO_TERMINAL_ID`.

So a tab whose PTY came up through `ensureSession` violates RFC 0028's guarantee
that every Silo terminal carries its own id. That is true today for
`ctx.terminals.sendText` on a never-shown tab; phase 1 would make it the normal
case for agent terminals, and phase 2's `silo agent run` — which reads
`$SILO_TERMINAL_ID` to launch into the terminal you typed it in — depends on the
guarantee holding precisely for those terminals.

**Fix:** `ensureSession` spawns through `spawnTerminalSession`. Both live in the
host, so this is an import change plus threading the terminal id through, and it
repairs the existing `sendText` gap in the same stroke.

## Components

### New — host

```
packages/extension-host/src/state/
  agent-profiles.ts            # the state slice: read/mutate/subscribe
  agent-profiles.test.ts

packages/extension-host/src/extension-host/agents/
  agent-profile-model.ts       # pure: slugify, validate, launch line, quoting,
                               #       probe-output parsing, fallback matching
  agent-profile-model.test.ts
  agent-profile-probe.ts       # the one interactive-shell `type --` call
  agent-profile-probe.test.ts
  agent-installed-scan.ts      # "Found on this machine" PATH lookup
  agent-installed-scan.test.ts
  pending-launch.ts            # request / take / discard
  pending-launch.test.ts
  agent-launch.ts              # create record + request launch (+ background spawn)
  agent-launch.test.ts
  agent-icons.ts               # moved from packages/extensions-silo/src/agents/
```

### New — SDK

```
packages/sdk/src/
  AgentIconGlyph.tsx           # moved from extensions-silo, now data-driven
```

### Changed

| File                                                                  | Change                                                                                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `packages/sdk/src/domain-types.ts`                                    | `TerminalRecord.profileId?`; `@deprecated` on `TerminalKind`'s `"claude"`/`"pi"`.                                               |
| `packages/sdk/src/agents-service.ts`                                  | `AgentIcon`, `CatalogAgentSummary`, `AgentsService.catalog()`; `@deprecated` on `AgentInfo.kind`.                               |
| `packages/sdk/src/index.ts`                                           | Barrel re-exports for the above + `AgentIconGlyph`.                                                                             |
| `packages/extension-host/src/state/types.ts`                          | `AgentProfile`; `agentProfiles` on the store shape.                                                                             |
| `packages/extension-host/src/state/store.ts`                          | `agentProfiles: []` in the initial state.                                                                                       |
| `packages/extension-host/src/state/persistence-model.ts`              | `agentProfiles?: AgentProfile[]` on `PersistedIndex`; terminal-kind normalization in the workspace load path.                   |
| `packages/extension-host/src/state/workspaces.ts`                     | `addTerminal` gains an options bag (`profileId`); reference sweep helpers for rename/delete; `discardPendingLaunch` on removal. |
| `packages/extension-host/src/extension-host/agents/agent-catalog.ts`  | `AgentDefinition.configDirEnvVar`; the memoized frozen catalog summaries.                                                       |
| `packages/extension-host/src/extension-host/agents/catalog/*.ts`      | Populate `configDirEnvVar` for four agents; record the negative finding in `contract` for the other three.                      |
| `packages/extension-host/src/extension-host/agents/agents-service.ts` | Implement `catalog()`.                                                                                                          |
| `packages/extension-host/src/extension-host/terminal-service.ts`      | `ensureSession` spawns via `spawnTerminalSession` and drains the pending launch; `create()` maps deprecated kinds.              |
| `packages/extension-host/src/panels/GroupAddMenu.tsx`                 | Profile rows, icons, folder resolution, the empty-state entry, and the broken-profile short-circuit.                            |
| `packages/extension-host/src/extension-host/sdk-internal.ts`          | Export the profile slice, launch, probe, scan, and model helpers to `core.*`.                                                   |
| `packages/extensions-core/src/agents-settings/index.tsx`              | New **Profiles** tab (first, default); **Hooks** → **Sessions**.                                                                |
| `packages/extensions-core/src/agents-settings/` (new files)           | `AgentsProfilesPanel.tsx`, `FoundOnThisMachine.tsx`, `ProfileRow.tsx`, `ProfileEditorModal.tsx`.                                |
| `packages/extensions-core/src/terminal/TerminalPanel.tsx`             | Delete the `kind` launch shim; drain the pending launch on `ready`; add profile rows to the body context menu.                  |
| `packages/extensions-silo/src/agents/*`                               | Delete `agent-icons.ts` / `AgentIconGlyph.tsx`; read `ctx.agents.catalog()`.                                                    |

## APIs / interfaces

### The record (host-internal in phase 1)

```ts
/** A named way to start an agent in a terminal. User-defined, host-owned. */
export interface AgentProfile {
  /** Short, user-authored, editable, unique. Prefilled by slugifying the
   *  label. This is what a human types at `silo agent run --profile <id>`. */
  id: string; // "claude-work"
  /** Shown in menus. Freely editable. */
  label: string; // "Claude (work)"
  /**
   * The shell command line, typed into the terminal's interactive shell
   * exactly as a user would type it. A *string*, not an argv array — that is
   * what makes aliases, shell functions, and version-manager shims work.
   */
  command: string; // "claude-work", or plain "claude"
  /** Absolute path to an agent config directory, for agents that support one.
   *  Prefixed onto the launch line as the catalog agent's `configDirEnvVar`. */
  configDir?: string; // "/Users/dave/.claude-work"
  /**
   * Which sealed catalog agent the *user says* this launches — detected by the
   * probe, overridable in the editor. Named `assumed…` on purpose: it is an
   * assertion, where `AgentInfo.agentId` is an observation. It supplies the
   * menu icon and the config-dir variable, and is **never** written into
   * `AgentInfo.agentId`.
   */
  assumedAgentId?: string; // AgentDefinition["id"]

  // ── cached probe results: derived, never user-edited ──────────────────
  /** What `type -- <command>` resolved to, at save or Recheck. */
  resolvedCommand?: string; // "claude --dangerously-skip-permissions"
  /** When that resolution happened. Shown in the editor next to Recheck, so a
   *  stale expansion is visible rather than silently trusted. */
  resolvedAt?: string; // ISO
  /** True when the last probe found nothing to run, or a launch observed
   *  `command not found`. The `+` menu refuses to launch a broken profile. */
  broken?: boolean;
}
```

Deliberately absent: a free-form `env` map, a `cwd`, an `isAgent` flag,
`promptDelivery`, and **`default`**. The first four are argued in `proposal.md`;
`default` is deferred to phase 2 because phase 1's flat `+` menu names every
profile, so a default would be stored and never read. Phase 2's per-profile
commands and keybindings are what make "launch the default agent" a real gesture.

`AgentProfile` is **not** exported from `@silo-code/sdk` in phase 1. It becomes
public when `ctx.agents.profiles` does (phase 5); until then it rides the
internal barrel.

**Why `command` is a string, not an argv array.** Silo launches agents by typing
into an interactive login shell, not by exec'ing a binary. The PTY runs `$SHELL
-l` (`apps/desktop/src-tauri/src/main.rs`, overridable in Settings → Terminal),
and the launch is a `session.write()`. That shell sources the user's rc file, so
aliases, shell functions, `mise`/`nvm` shims, and `direnv` all resolve. An argv
array implies exec, and exec breaks all of it. So does the seemingly tidier
`$SHELL -lc "claude-work"`: `zsh -lc` is **non-interactive** and doesn't source
`.zshrc`; bash additionally needs `shopt -s expand_aliases`. Typing into an
interactive shell is a load-bearing design property, and the record says so by
holding a string.

### The catalog gains one field

```ts
export interface AgentDefinition {
  // …
  /** The environment variable this agent reads its config directory from
   *  (`"CLAUDE_CONFIG_DIR"`). Undefined for agents with no such mechanism —
   *  the profile editor then hides the field entirely. */
  configDirEnvVar?: string;
}
```

Same class as `leaderNames`, `buildResumeCommand`, and `runtime` policy: a fact
about that agent's CLI, sealed in the host catalog. Which agents get it, and the
recon behind each answer, is in `proposal.md`. Because the answer is not
guessable from the binary's strings, `docs/adding-a-coding-agent.md` gains the
question — including the "does it move the credentials too" test — so the next
agent added has to answer it deliberately.

### New public SDK surface

```ts
/** A Catalog Agent's brand mark. Path data + the two theme-dependent hexes. */
export interface AgentIcon {
  title: string;
  hexLight: string;
  hexDark: string;
  path: string;
  fillRule?: "evenodd";
  accentPath?: string;
  accentFillRule?: "evenodd";
}

/** One Catalog Agent, as an extension may read it. */
export interface CatalogAgentSummary {
  readonly id: string;
  readonly displayName: string;
  readonly icon?: AgentIcon;
}

export interface AgentsService {
  // …
  /** Every coding agent Silo knows about — read-only. Detection stays sealed
   *  (ADR 0028); there is no way to register into this list. The returned
   *  array is memoized and deeply frozen: it is read inside tab-icon rendering,
   *  so a fresh allocation per call would be a per-render cost. */
  catalog(): readonly CatalogAgentSummary[];
}
```

`AgentIconGlyph` moves into the SDK kit and becomes **data-driven** — it takes an
`AgentIcon` rather than an `agentId`, so it has no dependency on the catalog:

```tsx
<AgentIconGlyph icon={icon} mode={mode} colorScheme={colorScheme} />
```

Its `mode` union (`"none" | "color" | "monotone"`) currently lives in
`silo.agents`' `settings-store.ts` as `IconMode`. Moving the component means that
union moves too — export it from the SDK as `AgentIconMode` and have
`silo.agents` re-derive its stored setting's type from it, rather than leaving a
public component typed against a private union.

**Decided: it goes in the SDK.** `catalog()` hands out icon data, and a surface
that hands out icon data with no way to draw it is half a feature — the external
`silo.agent-monitor` rides the published SDK and is the obvious next consumer.
One renderer serves host chrome, `silo.agents`, and third parties.

This addition runs the full `silo-docs-sync` workflow (TSDoc, `@public` +
`@category`, barrel re-export, the hand-authored `apps/docs/api/agents/` member
page, `pnpm docs:api`, roadmap row).

### Deprecations

`TerminalKind`'s `"claude"` and `"pi"` values get `@deprecated`, and so does
**`AgentInfo.kind`** — after hydration normalization it is always `"shell"`, so
an extension branching on it is reading a constant. Its TSDoc says so and points
at `agentId`. The type and the fields stay: both are `@public`, third parties
ride the published SDK with known lag, and removal is a later change gated on
`engine-compat.ts`. Phase 1 is purely additive to the public surface, so no
engine bump is needed.

### Internal barrel additions

```ts
// packages/extension-host/src/extension-host/sdk-internal.ts
export {
  getAgentProfiles,
  subscribeAgentProfiles,
  addAgentProfile,
  updateAgentProfile,
  removeAgentProfile,
  moveAgentProfile,
} from "../state/agent-profiles";
export { launchAgentProfile } from "./agents/agent-launch";
export { takePendingLaunch } from "./agents/pending-launch";
export { probeProfileCommand } from "./agents/agent-profile-probe";
export { scanInstalledAgents } from "./agents/agent-installed-scan";
export {
  slugifyProfileId,
  validateProfileDraft,
  buildLaunchLine,
} from "./agents/agent-profile-model";
export type { AgentProfile, ProfileProbeResult } from "../state/types";
```

Note what is **not** here: a catalog accessor. `core.agents-settings` needs the
agent list for its `Select` and its cards, and reads it through the public
`ctx.agents.catalog()` like anyone else. Two accessors for one list would be one
too many.

## Data flow

### Creating a profile

```
Profiles tab
  → user edits fields in ProfileEditorModal
  → Save (or Recheck, which runs only the probe)
      → probeProfileCommand(command)                    # $SHELL -i -c 'type -- …'
          → parseTypeOutput()  →  { resolvedCommand, argv0 }
          → agentByLeader(basename(argv0))              # catalog match
          → fallbackAgentForCommand(command)            # if the probe was no help
      → configDir: expandTilde() → absolute; stat; offer to create
      → validateProfileDraft(draft, existingProfiles)   # id shape, uniqueness
      → addAgentProfile(profile) / updateAgentProfile(id, patch)
      → persisted with the global index on the next save tick
```

### Launching

```
+ menu row  (or terminal context menu row)
  → profile.broken ?  →  notice + "Edit profile…"; stop. No terminal is opened.
  → resolve target folder (the same chooser "New Terminal" uses); cancelled → stop
  → launchAgentProfile({ profileId, workspaceId, cwd })
      → addTerminal(workspaceId, "shell", cwd, { profileId })
      → requestProfileLaunch(terminalId, profileId)
      → if no panel will mount (background workspace): ensureSession(terminalId)
  → caller opens and activates the dock panel   # unchanged from "New Terminal"

…later, whoever gets there first:
  TerminalPanel  → lifecycle "ready"     ─┐
  ensureSession  → session resolved      ─┴→ takePendingLaunch(terminalId)
      → profile still exists?  no → done, plain shell
      → sendInput(sessionId, `${buildLaunchLine(profile)}\r`)
      → watchForNotFound(sessionId, profile)   # bounded output scan
```

`takePendingLaunch` is remove-on-read, so the second arrival is a no-op. Each
launch targets its own new terminal id, so concurrent launches never contend.

### Reading, in the `+` menu

`GroupAddMenu.tsx` reads `store.agentProfiles` directly (it is host chrome inside
the host package) and resolves each profile's icon through the host's own
`agent-icons.ts` — no extension import, which is the boundary problem that forced
the icon move in the first place.

## Persistence

`AgentProfile[]` is **global** state, so it goes in the global index blob
alongside the other global preferences (ADR 0022, tier 1 "config"):

```ts
// packages/extension-host/src/state/persistence-model.ts
export interface PersistedIndex {
  // …
  /** Agent Profiles (RFC 0033). Global, not per-workspace. Absent in an older
   *  index, in which case the list loads empty. */
  agentProfiles?: AgentProfile[];
}
```

Written to `<config root>/app-state.json`, the same file that already carries
`terminalSettings`, `editorSettings`, and `agentState`. Array order is the menu
order and is preserved verbatim. The index hydrates before extensions activate,
which is what lets the deprecated-kind mapping below resolve against a populated
list.

The alternative — a hand-editable `<config root>/profiles.json`, alongside
`keybindings.json` — is deferred, not rejected. It becomes the better shape if
profiles ever want to be edited by hand or synced separately; nothing in phase 1
needs that, and the index keeps the change to one migration-free field.

**Load-time hardening.** A persisted entry missing `id`, `label`, or `command` is
dropped with a logged warning rather than failing hydration; a duplicate `id`
keeps the first occurrence. Both cases are covered by unit tests on the pure
loader.

### Migration

There is no profile data to migrate — the feature is new. What migrates is
`TerminalKind`:

- **Persisted terminal records** with `kind: "claude"` or `"pi"` are normalized
  to `kind: "shell"` in the workspace load path, and no `profileId` is
  synthesized. The terminal already exists and its launch already happened; a
  profile reference invented at load time would be fiction.
- **Live `ctx.terminals.create({ kind: "claude" | "pi" })`** creates a `"shell"`
  terminal. If a profile exists whose `assumedAgentId` matches, that profile is
  launched; otherwise the bare command is typed, exactly reproducing today's
  observable behavior. **No profile record is written** — an extension call must
  not create user data behind the user's back (the same instinct ADR 0046
  encodes for deletion).

> **Deviation from the original RFC text, deliberate.** The RFC said `create()`
> "synthesizes a matching profile" and that persisted records migrate to
> `kind: "shell"` **plus a `profileId`**. Both are dropped here: silently adding
> a row to a user-owned list that the whole design otherwise promises is empty
> until they click something is a worse trade than losing a back-reference nobody
> can act on. The observable launch behavior is unchanged either way.

**One behavior change worth stating.** `initialState(kind)` in
`agent-activity-model.ts` seeds `isAgent: kind !== "shell"` — the "born agent"
path. After normalization, a previously-persisted `"claude"` terminal no longer
gets that seed and instead acquires agent identity by detection, like every other
terminal. That is the correct outcome under ADR 0028 (never claim what you cannot
prove) and under R16; it is also almost certainly unobservable, since no in-repo
call site has ever created such a record. The `kind !== "shell"` branches in the
activity model stay — they still describe the deprecated-but-supported input.

## Error handling

| Failure                                        | Where it surfaces                                                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Probe finds nothing (`type` exits non-zero)    | `broken: true`; the settings row shows it, and the `+` menu refuses to launch it (below).                                                      |
| Probe times out or output is unparseable       | "Unresolved": no `resolvedCommand`, `broken` untouched, agent falls back to the token-prefix match.                                            |
| Probe would run injected shell code            | Impossible by construction — the command token is POSIX single-quoted into the `-c` string.                                                    |
| Alias already assigns `configDirEnvVar`        | Inline warning in the editor at probe time; the profile still saves (the user may know exactly what they are doing).                           |
| Agent changed to one with no `configDirEnvVar` | The stored `configDir` is cleared and the editor says so — a value that silently stops applying is worse than none.                            |
| Config directory missing                       | Editor prompts to create it on save (`codex` fails rather than bootstrapping one).                                                             |
| Launching a **broken** profile                 | Short-circuited: notice + "Edit profile…", no terminal opened. Silo already knows it will fail; opening a shell to watch it teaches nothing.   |
| `command not found` at launch                  | Bounded scan of the session's first output; a `pushToast` notice naming the profile with an editor action, and the profile is marked `broken`. |
| Workspace has several folders                  | The existing `pickWorkspaceFolder` chooser; dismissing it creates no terminal.                                                                 |
| Profile deleted between click and drain        | `takePendingLaunch` finds no profile; nothing is written and the tab is a plain shell. No error dialog.                                        |
| Terminal removed before drain                  | `discardPendingLaunch` on record removal; `ensureSession` already kills a session orphaned mid-spawn.                                          |
| Duplicate / malformed id                       | Rejected in the editor with the conflict shown inline — never silently suffixed.                                                               |

**`resolvedCommand` is never logged.** It is the expansion of a user's own alias
and may contain an inlined secret. It is display-and-diagnostics only, shown in
the settings row and the editor, and excluded from every Output channel.

## The probe, in detail

One user-initiated call does four jobs:

1. **Does this command exist?** No resolution ⇒ `broken`, and the menu stops
   refusing to launch it only once a Recheck succeeds.
2. **Which catalog agent is it?** The expansion's argv0 basename against
   `leaderNames`, reusing `leaderBasename()` / `agentByLeader()` from the catalog
   so there is one matcher.
3. **What does this profile actually do?** The expansion is stored as
   `resolvedCommand` and shown in the settings row — the one piece of information
   that makes an opaque alias legible.
4. **Does the alias already set the config dir?** If the expansion contains an
   assignment to the agent's `configDirEnvVar`, the profile's own `configDir`
   would be silently overridden.

Implementation: `getProcessService().exec(shell, ["-i", "-c", "type -- <q>"])`,
where `shell` comes from the same `store.terminalSettings.shell` the PTY uses and
`<q>` is the POSIX-quoted first token of `command`.

**Fallback matching, when the probe can't help.** Match the command's leading
token up to the first `-`/`_` boundary against `leaderNames` (`claude-work` →
`claude`). **Never substring-match** — ADR 0042 already flagged that `pi` is a
two-character substring matching almost anything, and `copilot` contains `pilot`.
Skip the heuristic entirely for tokens shorter than three characters. The
editor's `Select` overrides both, always.

**Consent.** This probe runs the user's rc file, which is acceptable _because_ it
is user-initiated — they clicked Save or Recheck. The same probe run
automatically at first launch to sniff for aliases would not be, which is why
"Found on this machine" works differently.

**Staleness is surfaced, not chased.** Because Silo never re-probes on its own,
a stored expansion goes stale the moment the user edits their shell config. The
editor shows the `resolvedAt` time next to a **Recheck** action; that is the
whole staleness story, and it is why `resolvedAt` is stored rather than dropped.

## "Found on this machine"

A plain, non-interactive `PATH` lookup: for each catalog agent, for each
`leaderNames` entry, `exec("sh", ["-c", "command -v '<name>'"])`. POSIX `sh`
non-interactive sources nothing, so this deliberately **cannot** see aliases and
never runs the user's rc file. It runs when the Profiles tab mounts and on an
explicit refresh — never at app start.

Each hit renders as a one-click add card (icon, display name, resolved path).
Clicking writes one profile: `label` = `displayName`, `command` = the leader
name, `assumedAgentId` = the catalog id. A card disappears once a profile for
that agent exists; the section disappears when no cards remain.

The point of the redirect from the `+` menu is that it costs the user a detour
from what they actually wanted — a terminal — so the first screen has to produce
a working profile in **one click** rather than teach a data model. Detection is
what makes that possible: Silo can show the four agents you have instead of the
fourteen that exist.

## Surfaces

**The `+` menu** — profiles listed **flat**, after "New Terminal", each with its
agent's icon and label. Flat always: an adaptive menu that collapses into a
submenu past N profiles changes shape as the user adds one, which is worse than
either fixed form. If crowding ever bites, the fix is a separator, not a submenu.
With zero profiles, one **"Add an agent profile…"** entry replaces the list and
calls `openSettings("agents")`. Choosing a profile goes through the same
`pickWorkspaceFolder` step "New Terminal" already uses, and activates the new tab
the same way — the launch itself never moves focus.

**The terminal context menu** — the RFC placed these on "the terminal tab context
menu, which already offers 'new terminal here'". That is wrong about the code:
`ctx.terminals.getTabMenuItems` offers Rename plus contributions, and "New
Terminal Here" lives on `TerminalPanel`'s **body** context menu — which is also
the only surface holding the live foreground cwd these entries need. They go on
the body menu; the public tab-menu surface is untouched.

**Settings → Agents** —

```
Profiles | Behavior | Navigator | Display | Sessions
```

- **Profiles** (new, first, and the tab's default) — `List` / `ListRow` +
  `AddRow`. A row carries: label · resolved command · agent icon and name ·
  config directory when set · a resume-status badge · a broken marker · `⋮` for
  Edit / Duplicate / Move up / Move down / Delete. The config directory must be
  on the row: with it, two profiles can share the command `claude` and differ
  only by account, and a row reading just "claude" twice would be useless.
- **Sessions** — today's **Hooks** tab, renamed. What it configures is session
  capture, and `getsilo.dev/guide/agent-sessions` already uses that word.
- **Behavior / Navigator / Display** — unchanged.

Making **Profiles** the first and default tab is also how "Add an agent
profile…" deep-links: `openSettings(pageId)` targets a page, not a tab, and the
Agents page keeps its active tab in local `useState`. Defaulting to Profiles gets
the right landing with no new deep-link machinery.

**Row order is menu order**, so it has to be controllable; Move up / Move down
get there without depending on `ctx.dnd`, and unlike drag they work from the
keyboard. **Duplicate** is the two-account gesture: it copies the profile and
opens the editor with the config-directory field focused, since that is the only
field that has to differ.

**Hooks are not folded into profile rows.** Two things live on the Sessions tab
that profiles cannot absorb: hook install for agents launched by hand with no
profile, and `extraSettingsToggle` prerequisites (pi's terminal-progress setting)
that gate _activity detection_ and have nothing to do with launching. The
coupling is expressed as a cross-link instead — a profile row whose agent has no
installed hook shows a `Best-effort resume` badge that jumps to Sessions. The
removal trigger is real but later: once Managed Hooks installs on first sight,
that tab stops being a control panel and becomes a ledger.

**The profile editor** — a host `Modal` (ADR 0018) with kit fields (ADR 0026):
`Input` label, `Input` id beneath it (prefilled from the label, editable,
captioned as what the CLI takes as `--profile`), `Input` command, `Select` agent,
and — per the visibility rules below — an `Input` for the config directory. No
bespoke widgets. Alongside them: **Recheck**, and the last-checked time.

Config-directory field visibility has three states, not two:

| Resolved agent               | Field                                               |
| ---------------------------- | --------------------------------------------------- |
| Declares a `configDirEnvVar` | Shown.                                              |
| Declares none                | Hidden.                                             |
| **None resolved at all**     | Hidden, with a line pointing at the agent `Select`. |

The third row is the case a two-state rule gets wrong: a failed probe would
otherwise leave a Claude user unable to set `CLAUDE_CONFIG_DIR` at all. Choosing
the agent by hand re-enables the field.

Below the fields, the editor shows **the launch line Silo will type**, with a
Copy button:

```
$ CLAUDE_CONFIG_DIR='/Users/dave/.claude-work' claude-work
```

Silo launches by typing into an interactive login shell, and that is a
load-bearing design property rather than an implementation detail — so show it.
It turns the config-directory prefix from something magic into something obvious,
and it makes the alias resolution legible next to the `resolvedCommand` line.

**There is deliberately no "Test launch" button.** Copying the line is the better
test: it can be pasted into any terminal to watch the agent actually start, which
proves more than a throwaway terminal would, and it doesn't yank the user out of
Settings, need a host workspace to put a terminal in, or need a rule for cleaning
one up.

## Profile ids and reference integrity

The id is prefilled by slugifying the label and then presented as an editable
field — lowercase, strip non-alphanumerics, collapse runs to single hyphens,
trim, so `"Claude (work)"` → `claude-work`. Rules: unique,
`^[a-z0-9][a-z0-9-]*$`, rejected on collision with the conflict shown rather than
silently suffixed. Editing a profile without changing its id is not a collision
with itself.

**What a rename costs.** The id is a reference in three places, and they degrade
differently:

| Reference                        | On rename                                                 |
| -------------------------------- | --------------------------------------------------------- |
| `TerminalRecord.profileId`       | Host state — swept and rewritten in the same transaction. |
| `core.newAgent.<id>` keybindings | Phase 2. A binding to the old command id would go dead.   |
| The user's own scripts / aliases | Break, visibly, and that is the user's own trade to make. |

Only the middle one is a real loss, it is not phase-1 work, and the fix when it
arrives is to warn on rename when a binding exists rather than to forbid renaming
outright. A profile whose id can't be typed from memory fails at the thing this
whole surface exists for.

The sweep is one function in `state/agent-profiles.ts` that walks every workspace
in `store.workspaces` and rewrites matching `profileId`s — and, on delete, clears
them. Both run inside the same mutation as the profile change, so a persistence
tick can never observe a dangling reference.

**`profileId` is substrate.** Nothing reads it in phase 1; its first consumer is
resume composition in phase 4. The sweep exists so that when phase 4 arrives the
data is trustworthy, not because anything today would notice. Said plainly here
so a reviewer does not go looking for the feature it powers.

## What a profile may and may not claim

ADR 0028's stance is that Silo never claims what it cannot prove.
`assumedAgentId` is a **user assertion**, not an observation, and the field name
carries that:

- **May**: pick the `+` menu icon, select the `configDirEnvVar` to prefix, and
  (phase 4) supply resume flags at composition time.
- **May not**: be written into `AgentInfo.agentId`, or seed `isAgent`.

Detection already handles the alias case correctly and quickly: `claude-work`'s
foreground leader is `claude`, so `agentByLeader` matches within a second of the
agent's first OSC title. Seeding `isAgent` from the profile would buy that second
and cost a permanent phantom agent row — in the Navigator and on the tab —
whenever the command doesn't resolve. The trade is bad, and it is exactly the
kind of unprovable claim ADR 0028 exists to prevent.

`docs/domain-language.md` records the `assumedAgentId` / `agentId` split under
the new **Agent Profile** entry, because two near-identically-named fields with
opposite epistemic status is exactly the collision that glossary exists to stop.

A consequence worth stating plainly: **a terminal has a profile only if Silo
launched it with one.** A hand-typed agent gets full catalog identity —
`agentId`, activity, resume — and no profile. No surface guesses at one.

## Tab titles

A profile-launched terminal's title is PTY-derived, like every other terminal's.
Silo does **not** seed the profile label: `TerminalPanel` writes `rec.title` from
the foreground process and the OSC title within a second of the session starting,
so a seeded label would flash and vanish — worse than never showing it. Using
`customName` instead would be wrong in a different way: that field is the user's
own Rename value, and claiming it would permanently disable auto-titling for
every agent tab.

The agent's own title plus its tab icon are the identification; the profile label
lives in the menu that started it. If the label should genuinely appear on the
tab, that needs a title-seed that PTY derivation respects until an agent OSC
title arrives — a separate mechanism and a separate decision, not a side effect
of this phase.

## Testing strategy

Per `.agents/skills/silo-testing/SKILL.md`: co-located Vitest, pure-logic style,
no `@testing-library/react`, host state driven through the `store` proxy.

**Pure units** (`agent-profile-model.test.ts`) — the bulk of the coverage, because
the bulk of the risk is here:

- `slugifyProfileId`: punctuation, unicode, leading/trailing hyphens, collapsing
  runs, an all-punctuation label.
- `validateProfileDraft`: empty label/command, bad id shape, collision with
  another profile, collision with **itself** on edit (must pass).
- `posixSingleQuote`: a path containing `'`, spaces, `$`, backticks.
- `buildLaunchLine`: no configDir; configDir with a `configDirEnvVar`; configDir
  with an agent that has none (no prefix); a path needing escaping.
- `parseTypeOutput`: bash and zsh phrasings for an alias, a function, a bare
  binary path, and "not found"; an empty/garbage output.
- `fallbackAgentForCommand`: `claude-work` → `claude`; `pi` (too short) → none;
  `pip` → none (no substring match); `copilot` → `copilot`, never via `pilot`.
- `expandTilde`: `~`, `~/x`, an already-absolute path, `~user` (left alone).
- Terminal-kind normalization: `"claude"`/`"pi"`/`"shell"` records in, `"shell"`
  out, other fields untouched.
- Persisted-index load: missing fields dropped, duplicate ids collapsed, absent
  key → empty list.

**Pending launch** (`pending-launch.test.ts`) — the concurrency contract:
take-after-request returns it; the **second** take returns `null`; discard makes
a later take return `null`; two terminals' pending launches are independent.

**State slice** (`agent-profiles.test.ts`) — driven through the `store` proxy:
add/update/remove/move; the rename sweep rewriting `profileId` across two
workspaces; delete clearing it.

**Launch** (`agent-launch.test.ts`) — with the terminal client and process
service stubbed: the record is created with `profileId` and no seeded title; a
pending launch is registered; **no PTY is spawned** for a foreground launch; the
background path does spawn; the launch line is written exactly once under both
orderings (panel-ready first, and ensureSession first); nothing is written when
the profile was deleted before the drain; nothing is written when the record was
removed.

**Terminal identity** — assert that the tab lazy-spawn path calls
`spawnTerminalSession` with the terminal id, not the public `spawn`. This is the
regression test for R7 and for the pre-existing `sendText` gap.

**Probe / scan** — exec stubbed. Assert the exact argv (`["-i", "-c", "type --
'claude-work'"]`), that a non-zero exit sets `broken`, that a timeout does not,
and that the scan's argv uses `sh -c 'command -v …'` (never the interactive
shell).

**Catalog** — `configDirEnvVar` is set for exactly the four agents and undefined
for the other three, so a future agent addition has to make a deliberate choice.
`catalog()` returns the same frozen reference across calls.

Not unit-tested, verified by hand against the running app (`verifier-gui`): menu
rendering and ordering, the settings tab layout, and the background-workspace
launch.

## Constraints and existing decisions

This design must respect, and does not reopen:

- **ADR 0028 — sealed agent detection and honest resume.** No public
  `registerAgent`; no profile-derived `agentId`/`isAgent`; no
  extension-contributed profiles.
- **ADR 0034 — focus and activation authority.** The pending-launch registry is
  the same record-the-intent shape, applied to session readiness instead of panel
  activation. The launch never grabs focus; the caller that opened a tab owns
  activating it.
- **ADR 0041 / 0042 — agent catalog modularization.** `configDirEnvVar` is
  declarative catalog data; no `agent.id === "…"` branch is added to host code.
  Every touched entry updates `contract` / `lastVerified`.
- **ADR 0022 — on-disk storage layout.** Profiles are tier-1 config in the
  identity-keyed config root, in the existing global index.
- **ADR 0046 — never delete user data unprompted.** Its converse governs the
  migration decision above: don't _create_ user data unprompted either.
- **ADR 0018 — host-owned chrome.** The editor is a host `<Modal>`; the settings
  content inside it is kit.
- **ADR 0026 — one SDK component set.** The Profiles list and editor use `List` /
  `ListRow` / `AddRow` / `Input` / `Select` / `Badge` / `Button`, not hand-rolled
  markup. `AgentIconGlyph` joins that set.
- **ADR 0013 — trust tiers, two-barrel SDK.** Profiles reach `core.*` through
  `@silo-code/extension-host/internal` and reach no one else in phase 1; the
  barrel entry is the reviewable mark. The catalog is read through public `ctx`.
- **ADR 0017 — CSS theming contract.** Any new CSS in the Profiles panel uses
  design tokens only; no hard-coded colours, fonts, or px sizes.
- **RFC 0028 — terminal identity in the environment.** `SILO_AGENT_PROFILE` stays
  out of the session environment; profile identity belongs on the launch line.
  The `SILO_TERMINAL_ID` guarantee is repaired rather than worked around.
- **The boundary itself.** `silo.agents` may not import the catalog — which is
  precisely why the icons move to the host and come back out through
  `ctx.agents.catalog()`.

## Seams left for the deferred phases

Recorded here so phase 1 doesn't foreclose them:

- **Commands / keybindings + the default profile (phase 2)** — one
  `core.newAgent.<profileId>` per profile, registered and disposed as the list
  changes, plus the `default` flag that gives "launch the default agent" a
  gesture worth having. The only new problem is dangling command ids after a
  delete.
- **Prompt delivery (phase 3)** — `promptDelivery` belongs on `AgentDefinition`,
  not on the profile: how Claude Code accepts a prompt is a fact about Claude
  Code. Caller text must never be interpolated raw into a shell line; the payload
  rides a **quoted heredoc** and must be **sanitized for a line editor** first.
- **Resume composition (phase 4)** — split `buildResumeCommand` into
  catalog-owned `resumeArgs` and the profile's command, composed as
  `<envPrefix> <command> <resumeArgs>`. This is the first consumer of
  `profileId`. The env prefix is not optional: without it, resume attaches to the
  wrong account. Compose only when `resolvedCommand` shows a bare token plus
  flags; otherwise fall back to the catalog default and say so. The catalog is
  not uniform — `codex resume <id>` is a positional subcommand and
  `copilot --resume=<id>` is `=`-joined — so a naive `${command} ${args}` is not
  safe everywhere.
- **`ctx.agents.profiles` (phase 5)** — `list()` and
  `launch({ profileId?, workspaceId?, cwd?, prompt? })`. Not `pick()` (an
  extension builds one from `list()` + `ctx.ui.showMenu` in five lines) and not
  `get()` (`list().find()`). `launchAgentProfile`'s signature is already that
  shape, so phase 5 is a barrel move plus docs.
- **`silo agent run --profile <id>` (phase 2)** — needs no new IPC. A `silo`
  invocation already reaches the running app: `tauri-plugin-single-instance`
  forwards the second process's argv and cwd, `resolve_cli_request`
  (`apps/desktop/src-tauri/src/commands/cli.rs`) parses subcommands out of them,
  the app emits `cli:open`, and `apps/desktop/src/cli/index.ts` acts on it — warm
  and cold launches both handled. This is one more arm in that parser, one more
  field on `CliRequest`, and one more branch in that handler calling
  `launchAgentProfile`, with the workspace resolved from the forwarded cwd. That
  cwd is frequently **not** the active workspace, which is the background branch's
  first real caller.

  Launching into **the terminal you typed it in** needs `SILO_TERMINAL_ID`, and
  single-instance forwards argv and cwd but **not** environment — so the id has
  to ride in argv. Silo already writes its own `silo` shim into
  `<app-data>/bin` and puts it on its terminals' `PATH` (RFC 0028), separate from
  the `~/.local/bin` one a user optionally installs; bake the id into the managed
  shim alone and the user's own shim stays a plain passthrough. The sequencing
  from there: (1) `silo` names the terminal and the profile; (2) the host cannot
  write the launch line yet — `silo` itself is the foreground process of that
  PTY, so anything written now is queued as type-ahead behind it; (3) the host
  waits for the foreground process to return to the shell, which it already
  tracks via `ctx.processes`, and then drains the pending launch; (4) outside a
  Silo terminal, the same command creates a new terminal in the resolved
  workspace instead, and says so.

- **CLI read-back (phase 9)** — `silo agent list [--json]` and bare
  `silo agent run`'s picker. These are the parts that must return data to the
  caller's stdout or draw in the caller's terminal, and `cli:open` is
  `app.emit` — fire-and-forget, with no channel back. They are the only pieces
  that genuinely wait on a Control API. Bare `silo agent run` also resolves
  through the default profile, so it depends on phase 2 twice over.
