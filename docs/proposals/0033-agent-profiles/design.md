# Design — 0033. Agent Profiles, phase 2 (Addressing a profile by name)

How phase 2's requirements are satisfied. Phase 1's mechanisms — the
`AgentProfile` record, `state/agent-profiles.ts`, `agent-profile-model.ts`,
`launchAgentProfile`, the pending-launch registry — are the baseline and are
described only where phase 2 extends or finally exercises them. Working artifact
— removed when the proposal collapses.

## Architecture

Four seams, in dependency order:

| Seam                                                   | Package                                      | Carries                                                                     |
| ------------------------------------------------------ | -------------------------------------------- | --------------------------------------------------------------------------- |
| `AgentProfile.default` + its state mutator              | `packages/extension-host/src/state`          | R2 — the flag, its single-default invariant, persistence and load-hardening. |
| Profile command sync                                    | `packages/extensions-core/src/agents-settings` | R1, R3 — register/dispose `core.newAgent.*` against the live profile list.   |
| Keybinding dispatch guard + rename warning              | `extension-host/keybindings.ts`, agents-settings | R6, R7 — the dangling-id problem.                                        |
| `silo agent run`                                        | `apps/desktop/src-tauri` + `apps/desktop/src/cli` | R4, R5 — argv parsing, then cwd → workspace → launch.                   |

Nothing here touches `packages/sdk`. The commands ride the existing public
`ctx.registerCommand`; `AgentProfile` is host state, exposed to `core.*` through
`@silo-code/extension-host/internal` exactly as phase 1 left it.

## Components

### `AgentProfile.default` (R2)

One optional field on the phase-1 record:

```ts
/** Preselected when a launch names no profile — `core.newAgent` and a bare
 *  `silo agent run`. At most one profile carries it; set only by an explicit
 *  gesture on the Profiles tab. */
default?: boolean;
```

The single-default invariant belongs in `state/agent-profiles.ts` beside the
existing rename/delete sweeps, for the same reason those live there: it must
hold within one mutation so a persistence tick can never observe two defaults.

```ts
/** Mark `id` as the default profile, clearing the flag from every other. */
export function setDefaultAgentProfile(id: string): void;
/** Clear the default flag from every profile. */
export function clearDefaultAgentProfile(): void;
```

Deliberately **not** done in `removeAgentProfile`: deleting the default does not
promote a successor. Nothing infers this flag (R2, and the converse rule in
ADR 0046) — a list that silently re-elects a default is a list the user no
longer controls.

### `resolveDefaultProfile` — the one resolution rule (R3, R5)

Both no-profile-named callers must agree, so the rule is one exported pure
function in `agent-profile-model.ts` and is unit-tested there:

```ts
/** The profile a launch that names none should use: the explicit default, else
 *  the first in list order, else undefined (no profiles at all). */
export function resolveDefaultProfile(
  profiles: readonly AgentProfile[],
): AgentProfile | undefined;
```

"Else the first" is what makes the generic command useful before anyone sets a
default, and it matches the flag's original wording ("preselected"). Phase 9
replaces the *CLI's* fallback with an interactive picker; `core.newAgent` keeps
this rule.

### Profile command sync (R1, R3)

A new `profile-commands.ts` in `packages/extensions-core/src/agents-settings`,
wired from that extension's `activate`. It owns a `Map<string, Disposable>` from
profile id to its command registration and reconciles on every
`subscribeAgentProfiles` tick:

- id present in the store but not the map → register.
- id in the map but not the store → dispose and delete.
- id in both, but the profile's `label` changed → dispose and re-register
  (`Command` is a value in a `Registry`, with no update path; re-registering is
  the cheapest correct way to refresh the label).

An id **rename** falls out of this as a delete plus an add, which is exactly
right: the old command id must stop existing.

The generic `core.newAgent` registers once at activation and is never
re-registered — that stability is the point of it (R3).

`agents-settings` is the home because it already imports the profile internals
and already subscribes to the list. The alternative — `core.menu`, which owns
`core.newTerminal` — was rejected: `core.menu` exists to build the native menu
bar, and phase 2 adds no menu item (see requirements' Out of scope).

**Note on `ctx.registerCommand`:** `createContext`'s `track` appends every
disposable to an array it never prunes, so churning registrations grows that
array for the extension's lifetime. Disposing an already-disposed registry entry
is a no-op, so this is harmless and bounded by how many times a user edits
profiles in one session. Not worth changing `track` for; recorded so the next
reader does not rediscover it as a bug.

### Launch body, shared by both command shapes

Both `core.newAgent.<id>` and `core.newAgent` end in the same helper, which is
the `+` menu's `launchProfile` minus the dock-group placement:

```
activeWorkspaceId → (none) → return
pickWorkspaceFolder(wsId) → (dismissed) → return
launchAgentProfile({ profileId, workspaceId, cwd: folder })
```

No explicit panel creation: adding a terminal record is what makes a tab appear
(`core.newTerminal` works the same way). The `+` menu's `newPanelInGroup` exists
only to place the tab in a *specific* dock group, which a keybinding has no
notion of.

### Keybinding dispatch guard (R6)

The concrete harm of a dangling command id is in `dispatchOverrideOnly`
(`extension-host/keybindings.ts`). It matches the chord, calls `preventDefault`
and `stopPropagation`, calls `executeCommand`, and returns `true` — **before**
anything checks that the command exists. `executeCommand` then logs
`unknown command` and returns false, but the keystroke is already swallowed. So
deleting a profile today would leave a chord that eats keys and does nothing.

The fix is one guard in that loop: skip an override whose command is not in
`commandRegistry`. That is not deleting user data — the `keybindings.json` entry
stays, and the binding revives if a profile with that id is recreated. It also
removes the log-spam path entirely, since the only way `dispatchOverrideOnly`
could reach an unknown command was this one.

`dispatchKey`'s main loop needs no equivalent guard: it iterates
`keybindingRegistry`, whose entries are registered alongside their commands.

### Rename warning (R7)

In `ProfileEditorModal`'s save path, when editing an existing profile and the
draft id differs from the current id:

```
key = effectiveKey(`core.newAgent.${currentId}`)
bound = overrideKey(cmd) !== undefined || isRemoved(cmd)
if (bound) → ctx.ui.confirm({ … displayKey(key) … }) → cancelled ? abort save : proceed
```

`overrideKey` / `isRemoved` (not `effectiveKey`) decide *whether* to warn,
because only a **user** binding is a loss — the per-profile commands declare no
defaults, so anything `effectiveKey` returns for them came from the user
anyway; using the override check keeps that explicit and correct if defaults are
ever added. `displayKey` renders the chord platform-appropriately for the
message.

## Data flow — `silo agent run`

### Rust: `resolve_cli_request` (R4)

Two changes in `apps/desktop/src-tauri/src/commands/cli.rs`.

**1. Real flag parsing.** The current positional iterator drops every `-`-prefixed
token, which would make `--profile claude-work` indistinguishable from a bare
positional `claude-work`. `agent run` gets its own small scan over the raw argv
tail that understands both `--profile <value>` and `--profile=<value>`, ignores
unknown flags, and treats a valueless trailing `--profile` as absent. The
existing `install` / `uninstall` / path arms keep the positional iterator they
have — nothing about them changes.

**2. The `agent` arm, before the path fall-through.** The current `raw =>` arm
treats any unrecognized first token as a path, so `agent` must be matched
earlier. It is matched **only** when the next positional is `run`; otherwise the
match falls through to the path arm, so a directory named `agent` still opens
(R4). This narrow guard is what keeps the new subcommand from being a silent
breaking change.

`CliRequest` gains no new field: `action: "agent-run"` reuses `id` for the
profile id (`None` for a bare run) and `path` for the normalized cwd — the same
`Option` fields the other actions already use selectively. The struct is
`Serialize`/`Deserialize` and crosses to the webview unchanged; both the warm
(`cli:open` emit) and cold (`PendingLaunchArg`) paths carry it with no work.

### TypeScript: dispatch and workspace resolution (R5)

`apps/desktop/src/cli/index.ts` gains an `agent-run` arm on its `CliRequest`
union and dispatches to a new `agent-run-handler.ts` beside `open-handler.ts`.

Workspace resolution needs **containment**, not the equality
`findWorkspaceByFolder` provides — the whole point is running the command from
somewhere deep inside a repo. A new pure helper alongside it:

```ts
/** The open workspace whose primary folder or one of its extraFolders contains
 *  `cwd`; longest match wins. Segment-boundary aware, so `/a/b` does not match
 *  `/a/bc`. */
export function findWorkspaceContaining(
  workspaces: Record<string, Workspace>,
  cwd: string,
): Workspace | undefined;
```

Both existing helpers apply first: `normalizeFolder` for separator/trailing
handling, and the same `extraFolders` reach `findWorkspaceByFolder` already has.
"Contains" means equal, or a prefix ending at a `/` boundary — the boundary check
is the one thing worth a dedicated test (R5).

The handler's ordering is deliberate:

1. Resolve the profile — `--profile <id>` looked up by id, or
   `resolveDefaultProfile`. A miss (unknown id, or no profiles at all) logs to
   the Output panel via the existing `silo:application` channel and **stops** —
   creating nothing, per R5. There is no channel back to the caller's stdout;
   that is exactly what phase 9's Control API is for.
2. Resolve the workspace — `findWorkspaceContaining`, else `createWorkspace`
   rooted at the cwd. Creating one is an explicit typed-command gesture, so
   ADR 0046's converse permits it, and it matches what `silo <dir>` already does.
3. **Launch, then activate, then focus.** Launching while the target workspace
   is still not the active one takes `launchAgentProfile`'s background branch,
   which calls `ensureSession` and brings the PTY up eagerly. Activating first
   would instead leave the launch depending on the dock committing the new
   workspace and mounting a panel — a timing the `focus` implementation already
   documents as not synchronous with `store.activeWorkspaceId`. Launching first
   is both more robust and, at last, the real caller phase 1 built that branch
   for. The panel that mounts afterwards finds the intent already drained
   (`takePendingLaunch` is remove-on-read) and simply attaches.

The terminal's cwd is the forwarded cwd, not the workspace root — running the
command in `~/proj/src` should start the agent there.

## APIs / interfaces

No `@silo-code/sdk` change; the docs-sync workflow does not apply and
`pnpm docs:api` output must be byte-identical.

New host-internal exports (all re-exported through
`@silo-code/extension-host/internal` for `agents-settings`' use):

- `setDefaultAgentProfile(id)`, `clearDefaultAgentProfile()` —
  `state/agent-profiles.ts`.
- `resolveDefaultProfile(profiles)` — `agents/agent-profile-model.ts`.
- `profileCommandId(profileId)` — the one place `` `core.newAgent.${id}` `` is
  spelled, so the editor's rename check and the command sync cannot drift.

New command ids: `core.newAgent`, `core.newAgent.<profileId>`. On the Keyboard
Shortcuts page `groupFor` derives the group from the id, so the per-profile
commands land under **New Agent** (from `humanize("newAgent")`) and the generic
one lands in **General** (two segments, no menu item). The inconsistency is
cosmetic and accepted; fixing it means either a menu item or special-casing
shared grouping code, and neither is worth it here.

Profile ids match `^[a-z0-9][a-z0-9-]*$`, so no id can inject a `.` and change
how a command id parses.

## Persistence

`AgentProfile.default` is stored inside the existing
`PersistedIndex.agentProfiles` array — no new key, no migration, no version
bump. An older index simply has no profile carrying the flag, which is the
correct starting state.

`loadAgentProfiles` (`state/persistence-model.ts`) gains hardening consistent
with the fields already there:

- copy `default` only when it is **strictly `true`** — a truthy non-boolean is
  dropped rather than coerced, matching how `configDir` / `assumedAgentId`
  require a real string;
- keep the flag on the **first** entry that claims it and strip it from the
  rest, so a hand-edited file with two defaults cannot break the invariant the
  runtime mutators maintain.

## Error handling

| Failure                                                   | Handling                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Command run with no active workspace                       | No-op. Same as the `+` menu.                                                     |
| Multi-folder picker dismissed                              | No terminal created (phase-1 behavior, preserved).                               |
| Profile deleted between chord press and launch             | `launchAgentProfile` already returns `undefined` for an unknown id; no error UI. |
| `--profile <id>` names no profile                          | Output-panel warning; nothing created. No stdout channel exists (phase 9).       |
| Bare `silo agent run` with zero profiles                   | Output-panel warning naming that no profiles exist; nothing created.             |
| `silo agent` with a real `./agent` directory               | Falls through to the path arm and opens it — unchanged behavior.                 |
| Dangling `core.newAgent.<id>` binding                      | Skipped by dispatch; chord falls through. Entry kept in `keybindings.json`.      |
| Two persisted profiles marked `default`                    | First wins at load; the rest are stripped.                                       |
| Rename cancelled at the keybinding confirm                 | Save abandoned entirely; no field changes.                                       |

## Testing strategy

Repo convention (`.agents/skills/silo-testing/SKILL.md`): co-located Vitest,
pure-logic tests, host state driven through the `store` proxy — no
`@testing-library/react`.

New / extended TypeScript tests:

- `agent-profile-model.test.ts` — `resolveDefaultProfile` (explicit default; no
  default → first; empty → undefined; default not first in order),
  `profileCommandId`.
- `agent-profiles.test.ts` — `setDefaultAgentProfile` clears the previous
  default in one mutation; `clearDefaultAgentProfile`; deleting the default
  promotes nobody; an id rename preserves the flag.
- `persistence-model.test.ts` — `default` round-trip; two-defaults input keeps
  the first; non-boolean `default` dropped without dropping the profile.
- `profile-commands.test.ts` (new, `agents-settings`) — reconcile add / delete /
  rename / label-change against a fake registry; the generic command's
  resolution for default / first / empty.
- `keybindings.test.ts` — a dangling override does not `preventDefault` and does
  not dispatch; a registered override still does (regression guard).
- `agent-run-handler.test.ts` (new) — `findWorkspaceContaining`: exact match,
  nested-under match, `extraFolders` match, longest-wins between `~/a` and
  `~/a/b`, and the `/a/b` vs `/a/bc` boundary case; plus the handler's
  profile-miss path creating nothing.

New Rust tests, in `cli.rs`'s existing `mod tests`:

- `agent run --profile x`, `--profile=x`, bare `agent run`, valueless
  `--profile`, an extra positional, an unknown flag.
- `silo agent` (no `run`) still resolves to an open-path request — the
  regression guard for the fall-through.

Behavior that stays uncovered by unit tests, and why: the actual PTY spawn and
tab focus on the CLI path (needs the running app — the repo's `verifier-gui`
skill is the tool if manual confirmation is wanted before merge), and the
`ctx.ui.confirm` rendering of the rename warning (the decision logic around it
is pure and is tested).

## Constraints and existing decisions

- **ADR 0046** — the host never deletes user data unprompted, and (its
  phase-1 converse) never creates it unprompted either. Both directions bind
  here: dangling `keybindings.json` entries are kept rather than pruned, and no
  profile is auto-elected default.
- **ADR 0028** — sealed detection. Unchanged: `default` and the commands are
  launch vocabulary and must never touch `AgentInfo.agentId` / `isAgent`.
- **ADR 0034** — focus and activation authority. The CLI handler activates a
  workspace and focuses a tab; it must go through the existing authorities
  (`activateWorkspace`, `ctx.terminals.focus`) rather than reaching into
  dockview, and must respect that `store.activeWorkspaceId` leads the dock's
  commit rather than tracking it.
- **ADR 0041 / 0042** — the agent catalog stays sealed and modular. Phase 2
  reads it only through what phase 1 already exposes.
- **Architecture boundaries** (`AGENTS.md`) — `agents-settings` is `core.*`, so
  `@silo-code/extension-host/internal` is legal for it; no raw `@tauri-apps/*`
  in extension code; all host logging to the Output panel, never `console.*`.
- **Design system** — the default marker and the `⋮` entries use the existing
  SDK kit inside the phase-1 `ListRow`; no new bespoke chrome.
