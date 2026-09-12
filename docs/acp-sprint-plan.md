# Agent Sessions sprint — working plan

**Temporary.** Delete this file when the sprint lands. The durable record is
[RFC 0038](./proposals/0038-acp-agent-sessions.md); the evidence is
[`acp-recon.md`](./acp-recon.md).

**Branch:** `feat/agent-sessions`. Do not merge to `main` until Session 4 passes.
**Docs already on `main`** via PR #512 (`docs/rfc-0038-agent-sessions`).

---

## What this sprint is for

A **top-to-bottom working version, shipped disabled.** Real releases can go out
to users with this code inside, inert, while Dave runs it locally behind a flag.

Three things must be true at the end. They are the acceptance criteria; features
are not:

1. **Silo does not care whether an agent is Chat or Terminal.** Status, the
   Agents navigator view, attention badges — identical for both.
2. **An extension can build its own Chat UI** using only `@silo-code/sdk`, with
   no privileged host import.
3. **Dave can turn off the bundled panel and use a third-party one instead.**

If 2 fails, the SDK is wrong and it is better to learn that now than after
shipping.

## Rules for every session

- **Read [RFC 0038](./proposals/0038-acp-agent-sessions.md) first.** It carries
  the decisions; this file only carries the order of work.
- **Commit at the end of every session.** Conventional Commits, lowercase
  subject (commitlint rejects sentence-case). The pre-commit hook runs boundary
  lint + the full unit suite — expect ~90s.
- **Ship tests in the same commit** (`.agents/skills/silo-testing/SKILL.md`).
- **Never merge to `main` mid-sprint.**
- **The `chatAgents` gate defaults `false`.** Nothing user-visible changes
  until it is on. (Session 1 shipped a second flag, `bundledChatPanel`; Session
  3.1 retired it — see the handoff log.) It is **not readable before
  `hydrate()`**, so nothing at boot may branch on it — see Session 3.3.
- Leave a one-paragraph handoff at the bottom of this file when you stop.

## What already exists on this branch

Working and tested — do not rebuild:

| Piece                 | Where                                                                | State                                               |
| --------------------- | -------------------------------------------------------------------- | --------------------------------------------------- |
| Piped-stdio transport | `apps/desktop/src-tauri/src/commands/acp.rs`                         | 6 tests green, incl. a real-agent `#[ignore]` test  |
| Chunk grouper         | `packages/extension-host/src/extension-host/agents/acp-transport.ts` | 7 tests green                                       |
| Chat panel            | `packages/extensions-core/src/acp-chat/`                             | on `ctx.agents.sessions` alone; behind `chatAgents` |
| Debug op              | `acpProbe` in `apps/desktop/src/automation/bridge.ts`                | dev-only; keep for testing                          |

**Debts paid in Session 3:** the privileged `createAcpTransport` import and the
`@acp-components` dependency are both gone; the transcript is a pure reducer
over `AgentSessionUpdate` in `transcript-model.ts`.

---

## Session 1 — the model

**Goal:** `ctx.agents` stops being terminal-shaped. No UI.

- `AgentInfo`: add `id` (the Agent Session id), `kind: "terminal" | "chat"`,
  `canResume`. Make `terminalId` optional. **`id`, not `sessionId`** —
  `sessionId` already means the agent's _own_ id and must keep that meaning.
- Add `ctx.agents.reveal(id)` and `ctx.agents.resume(id)`. `reveal` dispatches to
  focus-a-terminal-tab or focus-a-chat-panel without the caller knowing which.
- Widen `acknowledge(id)` to accept either id. Non-breaking.
- `AgentProfile.launch` discriminated union (RFC 0038 §"Keep RFC 0033's
  addressing"). Migrate existing persisted profiles into the `terminal` arm at
  load; hardening drops malformed entries as today.
- `AgentDefinition.acpLaunch` — built-in args, adapter package, or none. Fill it
  from the recon table in `acp-recon.md` §5h.
- Two settings flags, both default `false`: `chatAgents`, `bundledChatPanel`.
  (`bundledChatPanel` was retired in Session 3.1 — one gate now.)
- Update `docs/domain-language.md` (Agent Session, Terminal/Chat session,
  declared identity as a third provenance) and amend
  `docs/decisions/0028-sealed-agent-detection.md`: detection stays sealed;
  _declared_ identity is accepted.

**Done when:** `pnpm test` and `tsc --noEmit` green, existing terminal agents
behave exactly as before, and `docs:api` regenerated
(`.agents/skills/silo-docs-sync/SKILL.md`).

**Watch for:** the only breaking SDK change in this sprint is `terminalId`
becoming optional. `ctx.agents` is `@beta`, so this is allowed — but fix every
in-repo consumer, starting with `packages/extensions-silo/src/agents/`.

## Session 2 — `ctx.agents.sessions`

**Goal:** the public surface an extension drives.

- `ctx.agents.sessions.connect(profileId, opts)` → a session handle with
  `prompt(blocks)`, `cancel()`, `onUpdate()`, `onPermission()`, `dispose()`.
- Sourced from **user-authored profiles only** — never a command string an
  extension supplies.
- Mark `@beta`. Roadmap row, TSDoc, barrel re-export, `pnpm docs:api`.
- Reuse the existing transport; do not rewrite it.
- Feed `ctx.agents` from live sessions so a Chat session shows up in `getState()`
  with the same shape as a terminal one.

**Done when:** a Chat session appears in the Agents navigator view with correct
status, having never touched a terminal.

## Session 3 — the panel, on the real surface

**Goal:** prove the SDK is sufficient. **This is the session that matters.**

- Delete the `createAcpTransport` import from `AcpChatPanel.tsx`. It must build
  on `ctx.agents.sessions` alone.
- Register it only behind a flag (`bundledChatPanel` at the time; `chatAgents`
  after Session 3.1).
- Keep `@acp-components` for rendering if it helps — but its data must come
  through the SDK, not the host.

**Done when:** the panel works with **no** `@silo-code/extension-host/internal`
import anywhere in `packages/extensions-core/src/acp-chat/`.

**A panel that only works via the privileged import is a FAIL, not a pass.** If
the SDK is missing something, add it to `ctx.agents.sessions` — do not reach
around it.

## Session 3.1 — parity at the edges

**Goal:** the affordances the spike's `@acp-components` panel had and the
hand-built one does not, plus the one place criterion 1 still fails.

Session 3 rebuilt the panel on `ctx.agents.sessions` and deliberately dropped
`@acp-components` (it owns the protocol client and wants a _transport_, which
the SDK does not hand out). Three things went with it, and all three are SDK
gaps rather than panel gaps — which is exactly the kind of finding phase 3 was
for.

- **Chat tabs have no status badge or brand icon.** Terminal tabs get theirs
  from `ctx.terminals.bindActivity` / `bindIcon`, and `TabAdornmentMethods` is
  implemented **only** by `EditorService` and `TerminalService` — a dock-panel
  tab has no adornment surface at all. So criterion 1 ("Silo does not care
  whether an agent is Chat or Terminal") holds in the Agents navigator and
  fails at the tab strip. Add the adorn verbs to **`DockPanelApi`**, not a
  binder keyed by panel id: the panel knows its own session and its own tab, so
  there is no panel-id → session-id mapping to invent, and a third-party Chat
  panel gets the same treatment for free. Needs host plumbing so CenterDock
  renders adornments for panel tabs.
- **No session controls at all — and the protocol hands us a generic one.**
  Recon 2026-09-08 (spawned both agents, read `session/new`):

  | agent  | `modes` | `models`                        | `configOptions`                        |
  | ------ | ------- | ------------------------------- | -------------------------------------- |
  | cursor | yes     | yes — 7 (Auto, Grok, Opus 5, …) | yes — a `mode` **and** a `model` entry |
  | claude | yes     | **null**                        | yes — a `mode` entry (permission mode) |

  `configOptions` is **self-describing** and **subsumes** the other two:
  `{ id, name, description, category, type: "select", currentValue, options[{value,name,description}] }`.
  Cursor's list carries mode _and_ model; Claude's carries its permission mode
  (Manual / Accept edits / Plan / Auto / Bypass). `acp-jsonrpc.ts` currently
  keeps only `sessionId` and drops all three on the floor.

  > **Corrected 2026-09-08 (Session 3.1).** The table below was wrong about
  > `session/set_config_option` and sent the design down the typed-write path.
  > **The generic setter works on both agents.** Its parameter is **`configId`**,
  > not `optionId` — the original probe passed the wrong field name, read the
  > resulting error as "the method is broken", and never printed `error.data`,
  > which names the field outright. Re-probed:
  >
  > | method                                                 | cursor                          | claude                                |
  > | ------------------------------------------------------ | ------------------------------- | ------------------------------------- |
  > | `session/set_config_option {sessionId,configId,value}` | **OK** — mode, model            | **OK** — mode, model, `thought_level` |
  > | `session/set_mode`                                     | OK, emits `current_mode_update` | OK                                    |
  > | `session/set_model`                                    | OK                              | -32601 Method not found               |
  >
  > It returns the agent's **whole updated `configOptions` list**, and the
  > change persists into a fresh session. So the design is **generic read,
  > generic write**: call `set_config_option`, replace the snapshot from its
  > response, and keep the typed setters only as a fallback for an agent that
  > answers `-32601`. This matters beyond tidiness — Claude's `thought_level`
  > (Effort) has no typed method anywhere in the protocol, so category dispatch
  > could never have set it. Category dispatch can only ever reach the
  > categories Silo hard-codes, which is precisely the coupling `configOptions`
  > exists to remove.
  >
  > **Also corrected: the advertisement is not always honest.** Claude's
  > `configOptions` lists a `fast` entry (`category: "model_config"`) that its
  > own handler rejects with `-32603 Unknown config option: fast`. A client must
  > treat a failed write as "stop offering this control", not assume every
  > advertised entry is settable.

  The original (wrong) reading is kept below for the record:

  | method                      | cursor                                | claude                      |
  | --------------------------- | ------------------------------------- | --------------------------- |
  | `session/set_mode`          | OK, emits `current_mode_update`       | OK                          |
  | `session/set_model`         | OK                                    | **-32601 Method not found** |
  | `session/set_config_option` | ~~-32603 on every param shape tried~~ | ~~(not offered)~~           |

  Either way the panel stays generic (render a `Select` per entry, skip an
  unknown `type` — the same tolerance rule the update stream follows for
  unknown `kind`s), and `current_mode_update` must feed back into
  `currentValue` so the `Select` reflects a mode the _agent_ changed on its own.

  **This also unblocks testing permissions:** the inline permission UI is built
  but has never fired, because Cursor's default `agent` mode auto-approves —
  Claude's **Manual** mode is the one that asks.

- **No way to attach a file.** `AgentPromptBlock` already carries
  `{ type: "resource_link", uri, name? }`, so the SDK supports it and only the
  composer UI is missing — a file picker through `ctx.files`, dropped into the
  prompt as a link chip. The cheapest of the three.

**Done when:** a Chat tab shows the same activity badge and agent icon a
terminal tab does; the composer renders whatever `configOptions` the agent
advertises (so Cursor gets a model picker and Claude does not, with no
per-agent code) and can attach a file; and a permission request has been seen
on screen at least once (Claude in Manual mode).

**Watch for:** `TabActivityBinder.provide` is called synchronously per tab
during render, so anything added on the panel side must be cheap and
allocation-free — see the comment in `silo.agents`' `bindIcon` about
constructing JSX vs. calling the component, which exists because a truthy
element descriptor made the host reserve space for an icon that rendered
nothing.

## Session 4 — persistence and the proof

**Goal:** the three acceptance criteria, demonstrated.

- Persist the session id in panel params; `session/load` on mount; a
  "cannot be restored" state for agents that lack it. (Protocol verified —
  `acp-recon.md` §5d. The panel wiring was written but **never worked**; suspect
  params not carrying `sessionId` back on remount.)
- Reap agent processes on panel close, workspace close, and app quit.
- **The proof:** an `examples/extensions/` extension that drives a session
  end to end through `ctx.agents.sessions` — that is criterion 2.
- Disable `core.acp-chat` on Settings → Extensions, confirm the example
  extension still works — that is criterion 3.

**Done when:** all three criteria demonstrably hold. Only then consider `main`.

## Session 5 — discovery and onboarding

**Goal:** what a new user meets. Lowest priority; skip if the day runs out.

- Unified **Found on this machine** list — one row per agent showing
  `Terminal · Chat` (`acp-recon.md` §5h has the verified table).
- Settings → Agents connection card: Connected · Provider · Account.
- "Sign in" runs the agent's own login command in a real Silo terminal, using
  the argv from `authMethods` (`acp-recon.md` §5f).
- Adapter fetch-on-first-use for `claude`/`codex`/`pi`.

---

## Traps already paid for

Each cost real time in the spike. Do not rediscover them.

- **`messageId` is optional** and Cursor omits it — without the chunk grouper a
  sentence renders one word per line.
- **Unknown methods must be non-fatal.** `claude-acp` calls a non-spec
  `_auth/status_update`; answering `-32601` is correct.
- **`agentInfo` can be `null`** (Cursor). Fall back to the profile label.
- **`authMethods` non-empty ≠ auth required.** The signal is `session/new`
  failing.
- **Switching agents is a teardown**, not a prop change — the library keys state
  by agent id.
- **`--silo-color-border` is `transparent`** in high-contrast themes. Use
  `--silo-color-input-border` for a control boundary.
- **`backdrop-filter` creates a containing block** even at `position: static`.
- **Agent processes orphan freely.** Ten piled up in one afternoon — and
  **69** were found live on 2026-09-08 (all `PPID 1`). `acp_close` does kill
  the child; nothing calls it when the _app_ exits, so every dev restart with a
  live connection leaks one. Reaping on app quit is Session 4 scope.
  Post-mortem: `pgrep -f 'cursor-agent.*index.js acp'`.
- **No boot-time branch may read an index-persisted setting.**
  `activateBuiltins()` runs synchronously before the first render; `hydrate()`
  loads the index afterwards. A flag read at activation time always sees its
  default. Register inactive and reconcile from the hydrate chain instead
  (`chat-panel-gate.ts`).
- **`core.*` extensions are not user-disablable.** `builtinRows()` excludes
  them from the Extensions page by design — a bundled feature meant to be
  replaceable has to be `silo.*`.
- **`app-state.json` on disk is stale** — it holds 3 workspaces while the app
  reports 9. Do not debug persistence from that file.
- **The client is not a safety boundary.** Cursor writes files without asking and
  without calling `fs/write_text_file`. Never imply in UI that Silo gates writes.

## Verifying in the running app

`.claude/skills/verifier-gui` drives the dev app over `127.0.0.1:7878`. Always
work in a throwaway sandbox workspace and delete it after — a previous session
drove Dave's real workspace by mistake because `openPanel` is not a singleton
and `document.querySelector` found the wrong panel.

---

## Handoff log

_Append one paragraph per session: what landed, what is next, what surprised you._

**Session 0 (2026-09-08, Opus):** Spike code committed to `feat/agent-sessions`
(`eacaa14f`); docs landed separately on `main` via PR #512. Nothing is flagged
yet — the panel registers unconditionally in `builtins.ts`, which Session 1 must
fix. Next: Session 1.

**Session 1 (2026-09-08, Sonnet):** The model is no longer terminal-shaped.
`AgentInfo` gained `id` (the Agent Session id; equals `terminalId` for a
Terminal session), `canResume`, an optional `terminalId`, and `kind` repurposed
from the vestigial `TerminalKind` to `"terminal" | "chat"` (`AgentSessionKind`,
barrel-exported). `AgentsService` gained `reveal(id)` (focuses the terminal tab;
Chat panel path is phase 3) and `resume(id)` (no-op for Terminal sessions —
present so a kind-agnostic caller can call it unconditionally); `acknowledge`
doc widened to "any `AgentInfo.id`". `AgentProfile` now carries a `launch`
discriminated union (`terminal` | `chat`); `loadAgentProfiles` migrates every
pre-0038 flat `command`/`configDir` profile into the `terminal` arm, and drops
an entry with no usable launch as before. New catalog field
`AgentDefinition.acpLaunch` filled from recon §5h (cursor/opencode/copilot
built-in; claude/codex/pi adapter; grok/omp none). Two index-persisted flags
`chatAgents` / `bundledChatPanel`, both default `false`, surfaced through the
internal barrel for the composition root. Docs: `domain-language.md` (Agent
Session / Terminal-Chat session / three identity provenances), ADR 0028
amendment (declared identity is accepted, sealing holds), `api/agents/`,
roadmap row, `pnpm docs:api` regenerated. All in-repo consumers updated
(`core.agents-settings` editor/rows, `agent-run-handler`, silo `agents` panel —
which skips terminal-less sessions until Session 2 gives them a row). `pnpm
test` / `tsc --noEmit` / `pnpm lint` / `pnpm docs:build` green. Surprise: the
one flaky failure under full-parallel `pnpm test` is the pre-existing Cursor
setpgrp pgid test in `agent-catalog.test.ts` — passes standalone and in-file,
unrelated to this change. Next: Session 2 (`ctx.agents.sessions`).

**Session 2 (2026-09-08, Sonnet):** `ctx.agents.sessions` exists and a Chat
session shows up in the `silo.agents` navigator with correct status, never
having touched a terminal. New host pieces: `acp-jsonrpc.ts` (a JSON-RPC client
on the _existing_ transport — request/response correlation, `session/update` →
`onUpdate`, `session/request_permission` → a one-shot responder, and every
other agent→client request answered `-32601`: `fs/*` and `terminal/*` declined
in phase 1, unknown vendor methods non-fatal per Finding 2); `chat-agent-registry.ts`
(the small shared store where live Chat sessions meet `agents-service.ts` —
kept separate to avoid an import cycle, and `resetChatAgentRegistry()`
deliberately does **not** clear listeners or it severs `notify`);
`acp-sessions-service.ts` (`connect(profileId)` → handshake → an
`AgentSessionHandle` with `prompt`/`cancel`/`onUpdate`/`onPermission`/`dispose`;
sourced from `chat` profiles only, gated on `store.chatAgents` at call time).
Activity derivation lives in the sessions service: `prompt()` → `working`,
stop reason → `idle` (+ `needsAttention` off the active workspace, always on
`refusal`), `session/request_permission` → `working` + `needsAttention`
(there is no `"blocked"` in `AgentActivity`), abnormal close → `error`.
`agents-service.ts` merges `chatAgentInfos()` into both snapshots, subscribes
`onChatAgentsChanged(notify)`, and `acknowledge`/`reveal`/`resume` all branch
to the chat registry first — `reveal` only activates the workspace (transcript
panel is Session 3), `resume` runs a `session/load` control when `canResume`
(set from the agent's `session/load` capability). `AgentRow` gained an `id`
(the Agent Session id); `buildAgentRows` now renders a terminal-less Chat row
titled by the agent's declared name, and the panel routes clicks through
`ctx.agents.reveal(row.id)` instead of `ctx.terminals.focus`. SDK: eight new
`@public @beta` types + `AgentsService.sessions`, barrel-exported, hand-authored
`/api/agents/sessions` page, roadmap row, `pnpm docs:api` regenerated, domain
glossary gained **Chat Session Connection** / **Prompt Turn**. `pnpm test`
(570 across 11 pkgs) / `tsc --noEmit` / `pnpm lint` / `pnpm docs:build` green.
Traps hit: Session 1 left the silo agent-panel test helpers type-broken
(`kind: "claude"`, no `id`/`canResume`) — vitest doesn't typecheck so they ran;
fixed the ones the `id` change touched. Next: Session 3 — delete the
`createAcpTransport` import from `AcpChatPanel.tsx`, rebuild it on
`ctx.agents.sessions` alone, and register it only behind `bundledChatPanel`.

**Session 3 (2026-09-08, Opus):** The panel is on the real surface and the SDK
held. `packages/extensions-core/src/acp-chat/` has **no**
`@silo-code/extension-host/internal` import — `AcpChatPanel.tsx` is rebuilt on
`ctx.agents.sessions` plus `@silo-code/sdk` types and kit components, and
`@acp-components` is gone from the repo (dependency, lockfile and
`acp-theme.css`). Dropping the library was forced rather than chosen: it owns
the protocol client and wants a **transport**, which the SDK deliberately does
not hand out — feeding it would have meant re-encoding the SDK's stream back
into JSON-RPC frames for a second client to re-parse. What it provided is now
`transcript-model.ts`, a pure reducer over `AgentSessionUpdate` (messageId
grouping, thought asides, tool-call rows patched in place by `toolCallId`, the
plan replaced in place because the agent reissues it whole, Silo's own notice
lines), plus `profile-selection.ts` (requested id → default → first, falling
through a deleted or re-armed profile) and `permission-options.ts`. All three
are unit-tested; a reject is deliberately **not** `variant="danger"`, since
declining is the safe answer. The panel binds to a user-authored Chat profile
(picker in the composer, id persisted in panel params), connects on mount,
disposes on unmount **and** on a profile switch — a switch is a teardown, and
the `cancelled`-flag branch disposes a handle that lands mid-handshake, so
nothing orphans. Permissions render inline in the transcript flow with the
"Silo does not gate this" note (Finding 1), never a modal.

**Two SDK additions, both needed and both documented** (`@beta`, TSDoc,
`@public`/`@category`, barrel already covering them, hand-authored pages,
`pnpm docs:api`): `AgentProfileSummary.interface: AgentSessionKind`, without
which a picker cannot tell a Chat profile from a Terminal one and would offer
profiles that `connect()` rejects; and `AgentSessionConnectOptions.reveal`, the
extension's own "come to the front", which `acp-sessions-service.ts` registers
as the session's `ChatSessionControls.reveal` (wrapped so a throwing callback
cannot break a navigator click). `ctx.agents.reveal(id)` now activates the
workspace **and then** focuses this panel via `api.setActive()` — ordering
asserted in `agents-service.test.ts`, because a background workspace's panel
cannot focus before its workspace is live. Registration is a
_registration-time_ choice: `builtins.ts` splices `acpChat` in right after
`core.terminal` only when `getBundledChatPanelEnabled()`, so with the flag off
the panel kind, its `+` menu entry and `core.acpChat.new` do not exist at all —
`builtinList()` is exported and tested for exactly that.

**Surprise worth keeping:** the panel needed no new channel for "the agent
died". It reads `activity === "error"` off its own `AgentInfo` through
`ctx.agents.subscribe` and disables the composer, offering Reconnect — the
observation-parity promise paying for itself inside the first consumer. **Not
verified in the running app:** `pnpm test` (3389 across 11 packages) /
`tsc --noEmit` / `pnpm lint` / `pnpm docs:build` are green, but nobody has
driven a real agent through this panel yet, so "a Chat session shows correct
status in the navigator" is verified by unit tests and the Session 2 wiring
rather than by eye — turn both flags on, author a Chat profile, and watch the
`silo.agents` view. Next: Session 4 — persist the session id in panel params,
`session/load` on mount with a "cannot be restored" state, reap on workspace
close and app quit, and the `examples/extensions/` proof that criterion 2 holds
outside this repo's own packages.

**Session 3.1 (2026-09-08, Opus) — the missing switch.** Session 3 shipped a
panel nobody could reach. Two gaps: nothing flipped either flag (the setters
existed, the only callers were the barrel), and — worse — **nothing could
author a Chat profile.** `ProfileEditorModal.tsx` hardcoded
`interface: "terminal"` on every path, so `connect(profileId)`, which takes a
user-authored Chat profile and nothing else, had no possible input. Both are
now closed.

**One gate, not two.** `bundledChatPanel` is retired; `chatAgents` gates the
whole capability, including whether `core.acp-chat` registers. The reasoning is
Dave's: once the capability is on, "use a different Chat UI" is already a
solved gesture — disable the built-in on Settings → Extensions and install the
one you want — so a dedicated toggle was a second, weaker switch over
`disabledBuiltins`. Criterion 3 is now demonstrated that way rather than by a
flag. Removed from `store`/`types`/`persistence`/`persistence-model` and the
internal barrel; `builtinList()` reads `getChatAgentsEnabled()`.

**The profile editor learned the launch union.** An **Interface** RadioGroup
(Terminal / Chat) shown only while the gate is on — an _existing_ Chat profile
still edits as one either way, because silently re-authoring someone's saved
profile because a flag moved is worse than showing fields they cannot currently
create. Chat adds an **Arguments** field and drops **Config directory** (the
arm carries `env`, not `configDir`); the preview line switches from "Silo will
type" to "Silo will run". Two new pure modules carry the logic:
`chat-launch-model.ts` in the host (`parseArgs`/`formatArgs` — a
round-trip-safe argv ↔ text field that is deliberately **not** shell parsing:
no expansion, no globbing, `$HOME` is four literal characters; plus
`chatExecPreview` and `suggestChatLaunch`) and
`profile-editor-model.ts` in core (`editorStateFromProfile` /
`launchFromEditorState` — which arm gets written, tested for round-trip
fidelity). 31 new tests.

**`suggestChatLaunch` prefills only what recon verified.** A `builtin` agent
gets its real command and args (`cursor-agent acp`) — expecting a user to know
that is expecting them to have read the RFC. An `adapter` agent gets **no
guessed command**: the catalog records the adapter's short name
(`claude-agent-acp`), not a resolvable npm spec (the real one is
`@agentclientprotocol/claude-agent-acp`), so a prefill would fail at spawn.
It names the adapter in a Callout and lets the user write the line. `grok`
(`acpLaunch: undefined`) gets an honest "no verified Chat mode" warning that
still permits saving. Fixing the adapter coordinates and fetching them belongs
to Session 5 / RFC open question 5.

**Also:** a `Chat` badge on the profile row, the row's command line now shows
`command + args` rather than hiding half the launch, and "Best-effort resume"
is suppressed for a Chat profile (hook/session-file readiness says nothing
about `session/load`). The Settings → Agents → Profiles gate carries a
work-in-progress hint and a restart Callout, since registration is read once
before first render.

**Still not done:** **Found on this machine** only ever adds Terminal profiles
— the unified `Terminal · Chat` list is Session 5. And the runtime check is
still outstanding: `pnpm test` / `tsc --noEmit` / `pnpm lint` /
`pnpm docs:build` are green, but no real agent has been driven through the
panel. The path is now walkable end to end: Settings → Agents → Profiles →
**Enable Chat agents**, restart, add a profile with **Interface: Chat** (pick
Cursor or OpenCode for a zero-install path — both prefill correctly), then
**New Agent Chat** from a dock's **+** menu. Next: Session 4.

**Session 3.2 (2026-09-08, Opus) — the dead menu row.** Dave enabled the gate,
authored a Claude Chat profile, clicked it in a dock's **+** menu, and nothing
happened. Cause: the profile list in `GroupAddMenu.tsx` (and
`core.newAgent.<id>`) calls `launchAgentProfile`, which Session 1 taught to
**refuse** a non-terminal arm by returning `undefined` — and both call sites
do `if (!rec) return`. So a correctly-authored Chat profile was a silent no-op
in the one place a user starts an agent. The guard was right; nothing had been
taught what to do instead.

A Chat profile now opens a **transcript panel**. Which panel is not something
host chrome may name, so the panel kind claims the job: new SDK field
`DockPanelKind.chatProfileHost` (`@beta`, documented on
`/api/registration/register-dock-panel-kind` and the sessions page), resolved
by `chat-profile-host.ts` and opened with `params.profileId` +
`params.title`. `core.acp-chat` declares it; a third-party Chat panel declares
it the same way — which is what makes criterion 3 real at the **+** menu too,
not just in a dock the user has to find another way into. First registered
wins; the tiebreak is Settings → Extensions, not a preference Silo invents.
When nothing claims it (gate off, or the bundled panel disabled with no
replacement) both paths now say so — a toast from the menu, `ctx.ui.notify`
from the command — because the silence is what sent Dave hunting.

Two knock-ons. `params.title` became a **seed**: the panel prefers the agent's
declared name once `initialize` returns, so opening from the profile list
labels the tab with the profile until the agent names itself. And
`profile-commands.test.ts` still built pre-0038 flat `command` fixtures (the
type-broken-test-helper trap from Session 1 — vitest does not typecheck), which
my `profile.launch.interface` read turned into a crash; fixtures now use the
launch union, and the read is `?.`-guarded so a stray unmigrated record falls
through to the terminal path exactly as before.

`pnpm test` / `tsc --noEmit` / `pnpm lint` / `pnpm docs:build` green.
Still unverified at runtime, and note that Claude needs the
`claude-agent-acp` adapter — the editor deliberately does not prefill a command
for an adapter agent, so that profile's Command/Arguments must point at an
adapter already on the machine (the spike used
`npx -y @agentclientprotocol/claude-agent-acp@0.75.1`). Cursor or OpenCode are
the zero-install path and prefill correctly. Next: Session 4.

**Session 3.3 (2026-09-08, Opus) — the gate that never fired.** Dave restarted
and got the new toast: _"cursor chat" is a Chat profile and no Chat panel is
installed to open it._ The message was correct and the cause was mine.
`activateBuiltins()` runs **synchronously before the first render** (the dock
needs every panel kind present to deserialize its saved layout), but
`chatAgents` lives in the persisted index, which `hydrate()` loads
**asynchronously afterwards** — `main.tsx` line 47 vs. line 74. So
`getChatAgentsEnabled()` inside `builtinList()` read the `false` default on
every single boot. The gate I added in Session 3.1 was **dead code that never
once evaluated true**, and no amount of restarting could have helped. Worth
recording as a trap: _any_ boot-time branch on an index-persisted setting is
wrong for the same reason.

The fix uses the machinery built-ins already had. `activateExtensions` takes a
`disabledBuiltins` set whose ids are "recorded but not activated, so a disabled
built-in never contributes to the first frame" — exactly the state wanted. So
`acpChat` is now permanently in the `builtins` list, handed over as initially
disabled, and `applyChatAgentsGate(CHAT_PANEL_EXTENSION_ID)`
(`chat-panel-gate.ts`, injectable deps, 4 tests) activates it from the hydrate
chain once the real value is known. The same call runs when the user flips the
switch, so **Chat agents now takes effect immediately** — the restart Callout
is gone, replaced by a pointer at the profile editor. Nothing is registered
while the gate is off, so the "ships inert" premise still holds.

**One discovery that reshapes criterion 3.** `builtinRows()` excludes `core.*`
from the Extensions settings list on purpose — "`core.*` is the immutable shell
and is excluded here so it never reaches the UI". So `core.acp-chat` **cannot
be disabled by the user**, and the criterion-3 story I wrote in 3.1 ("disable
it on Settings → Extensions and install the one you want") is not true today.
The right answer is that the Chat panel is a _replaceable feature_, not
immutable shell, so it belongs in `extensions-silo` (`silo.*`) — which would
also prove the boundary harder, since that package depends on
`@silo-code/sdk` alone and _physically cannot_ reach the privileged surface.
The one blocker is its `../editor/Breadcrumb` import, an intra-`extensions-core`
dependency that would need replacing or promoting to the SDK. **Session 4
should move it** before claiming criterion 3.

`pnpm test` / `tsc --noEmit` / `pnpm lint` green.

**Session 3.4 (2026-09-08, Opus) — verified in the running app.** Dave hit two
different failures, both now understood, and the whole path is confirmed
working end to end with `verifier-gui` against the live dev app.

**The diagnostics bug was mine and mattered most.** The panel said _"ACP
connection closed"_ while the sentence explaining why — `agent exited with code
1: Error: No Cursor IDE installation found…`, straight from the agent's stderr
ring — went only to a `debug` log. `acp-jsonrpc.ts` now keeps the transport's
last diagnostic (it arrives _before_ the close event, which is what makes this
work) and fails pending requests with it, so the panel shows the agent's own
words. This is what stderr capture was built for; it was plumbed to the wrong
place.

**Neither failure was in the code.** Both of Dave's profiles were saved with
the wrong launch: `cursor` + no args (that is the _IDE launcher_, hence its
error) and `claude-work` + no args (a shell alias, which `exec` cannot resolve
— `No such file or directory`). Two editor flaws let that happen, both fixed:

1. **`command` was one field across both arms**, so switching Interface to Chat
   carried a shell string into an argv[0]. `ProfileEditorState` now holds
   `terminalCommand` and `chatCommand` separately — switching arms is
   non-destructive in both directions.
2. **Typing in Command permanently disabled the catalog prefill**
   (`chatLaunchEdited`), so a later agent pick could not correct it. Picking an
   agent now re-arms it, and there is a visible **"Use it"** Callout offering
   the verified invocation (`matchesChatSuggestion`) whenever the current line
   differs — a suggestion you can see and take beats one that silently does not
   fire.

**Verified live** (sandbox workspace + throwaway profile, both removed
afterwards): Cursor and Claude each connect (`Chat session chat:… connected`),
a prompt turn round-trips with streaming text and a rendered THINKING aside,
the `silo.agents` navigator shows the session with its workspace and status
dot, and — the criterion-1 payoff — the **third-party `silo.agent-inspector`
extension** reads `ctx.agents` and reports `idle · isAgent: true · agent: …
(cursor) · Session: 6473a9ef…` without knowing it is a Chat session at all.
Claude declares its own name (`Claude Agent`) and reuses the existing
Enterprise login through `claude-agent-acp`, confirming the recon finding that
an installed, logged-in CLI carries its adapter. High-contrast theme renders
correctly, which is what `--silo-color-input-border` is for.

**Two new dev-only bridge ops** (`apps/desktop/src/automation/bridge.ts`), added
because this was undiagnosable without them and Session 4 needs them:
`agentProfiles` (the live list with each launch arm — the persisted
`app-state.json` is stale, exactly as this file's trap list says) and
`addAgentProfile` / `updateAgentProfile` / `removeAgentProfile` for a throwaway
profile.

**Not verified:** `reveal` focusing the transcript. The unit tests cover the
ordering, but the manual check was inconclusive in a live multi-workspace
session and was not worth further poking at Dave's real app. **Newly
evidenced:** 69 orphaned `cursor-agent` processes, all `PPID 1` — `acp_close`
kills the child, but nothing calls it when the app exits, so every dev restart
with a live connection leaks one. Reaped by hand; the fix is Session 4 scope
and now has a number attached to it.

**Session 3.5 (2026-09-08, Opus) — markdown, and scoping what the spike had
that this does not.** Agents write markdown and the protocol carries it as
plain text, so the transcript was rendering `**What it shows**` verbatim. Agent
prose now goes through `react-markdown` + GFM in `TranscriptMarkdown.tsx`,
styled for a _message_ rather than a document (tight margins, headings near
body size so an agent's `##` cannot shout over the panel, code blocks and
tables scrolling inside their own box). Deliberately **no `rehype-raw`**: the
text is untrusted model output, and not parsing HTML at all beats sanitizing it
afterwards. A **user** message stays literal — it is what they typed, and
reinterpreting their asterisks would be wrong. Verified live (STRONG / UL / LI
/ CODE elements, and the agent's `>` line as a blockquote).

Dave then asked the right question: the panel looks different from the spike's
and has no mode/model selector, no file attach, and no permission UI in sight.
The answer is that it is **hand-built on purpose** — `@acp-components` provided
`SessionConfigPanel` and `PermissionDialog`, and it went when the privileged
transport did. The permission UI _is_ built and simply has never fired (Cursor's
default `agent` mode auto-approves); the other two are genuine gaps, and both
turn out to be **SDK** gaps rather than panel gaps, which is what phase 3 was
supposed to surface. Written up as **Session 3.1 — parity at the edges** above,
together with the tab-badge gap, because all three are the same shape: the
panel cannot express something the host has not exposed. Session 3.1 is
deliberately its own session rather than folded into 4 — persistence and
`session/load` are unrelated work, and mixing them would blur two clean
verification stories.

**Session 3.6 note (2026-09-08, Opus) — recon before design, again.** Asked
which session settles model selection, the honest first answer was "unknown,
possibly per-agent and not expressible in a shared surface" — Cursor announces
its model in _prose_ ("Auto routed to Cursor Grok 4.6"), which looked like
evidence against a standard field. Spawning both agents and reading
`session/new` properly said otherwise: `models` is standard protocol data
(Cursor: 7 entries; Claude: `null`), and **`configOptions` is a generic,
self-describing list that subsumes both `modes` and `models`.** The design
therefore is _one_ member and a `setConfigOption`, not two narrow ones — which
is what Session 3.1 above now says. Without the probe this sprint would have
shipped `handle.modes` + `handle.models`, then had to collapse them the first
time an agent advertised a third option. The rule this file already states for
the catalog holds for the SDK too: **the check is a run, not a read of the
docs.**

**Session 3.1 (2026-09-08, Sonnet) — parity at the edges, built.** All four
scoped items landed as SDK/host work, not panel patches; process reaping pulled
forward from Session 4. Green: `pnpm test` (per-package: sdk 119, extension-host
1819, extensions-core 529; `cargo test commands::acp` 6), `tsc --noEmit`,
`pnpm lint`, `pnpm docs:build`, `docs:api` regenerated, `silo-docs-sync` run.

- **Tab adornments.** `DockPanelApi` gained `setTabActivity` /
  `setTabIcon` (`@public`, `TabActivityContribution | null` /
  `TabIconContribution | null` — pass `null` to clear; cleared on unmount). The
  plumbing: `TabAdornmentKind` gained a third arm `"panel"`; a new host wrapper
  `makeDockPanelApi` / `toHostComponent` in `dock-panel-kinds.ts` adapts every
  dockview panel into the SDK `DockPanelApi` (the two were structurally
  compatible so `getDockComponents` used to cast straight through — that free
  ride is over now that the SDK surface is wider than dockview's) and records
  the two verbs into the tab-adornment registry keyed by the dockview panel id;
  `DockTab` reads `"panel"` adornments for any tab that is not `editor:` /
  `terminal:`. Wrapper identity is cached per `kind.component` so a kinds-list
  change does not remount every panel. The panel drives it from one
  `ctx.agents.subscribe` effect (`chatTabActivity`, extracted + tested) plus a
  theme-subscribed icon effect that _calls_ `AgentIconGlyph` (not JSX) so a
  null render sets no icon — the reserve-space trap from `silo.agents`.
- **Session config options.** `session/new`'s `configOptions` is parsed
  (`parseConfigOptions`, defensive) and carried on `AgentSessionHandle` as
  `configOptions` (live snapshot) + `setConfigOption(id, value)` +
  `onConfigOptionsChanged`. Generic read, typed write: the host dispatches on
  `category` — `"mode"` → `session/set_mode`, `"model"` → `session/set_model` —
  and **rejects** an unknown id, a bad value, or a category with no verified
  method (no blind `session/set_config_option`). A `current_mode_update` the
  agent sends itself is folded back into the `mode` entry's `currentValue`. The
  composer renders one `Select` per `type: "select"` entry, skipping the rest.
  New SDK types `AgentSessionConfigOption` / `AgentSessionConfigChoice`
  (barrel-exported, `/api/agents/sessions` page updated). The composer also
  **drops a control the agent rejected a write for** (`deadConfigIds`) — see
  the Claude finding below.
- **File attach.** `attachments.ts` (`fileUri` / `basename` / `toAttachment`,
  pure + tested) + an **Attach** button wired to `ctx.ui.pickFile`; staged
  files render as removable chips above the composer and go out as
  `resource_link` blocks ahead of the text. `appendUserMessage` gained an
  optional `attachments` arg; sent files show as chips under the user bubble.
- **Reap on quit.** `commands::acp::close_all()` drains the connection registry
  and kills every child; `lib.rs` switched from `.run(context)` to
  `.build(context)?.run(|_, e| if RunEvent::Exit { close_all() })`. Rust test
  `close_all_reaps_every_connection`. **Covers a graceful quit only** (Cmd-Q,
  the app menu, `app.exit()`). A signal kill does **not** run `RunEvent::Exit`
  — verified live: `SIGTERM` to the app left the `cursor-agent` child on
  `PPID 1`. So `tauri dev`'s own watch-rebuild restart (it `SIGKILL`s the app)
  still leaks, and so does `Ctrl-C` on the `pnpm dev` terminal. Catching
  `SIGINT`/`SIGTERM` with a `libc::signal` handler would close that, but a std
  `Mutex` lock inside a signal handler is not async-signal-safe — left for
  Session 4 to decide (`signal-hook`, or a `sigwait` thread).

**GUI-verified live** (`verifier-gui`, my rebuilt dev app on `:7878`, throwaway
sandbox workspace + `verify-cursor` / `verify-claude` profiles, all removed
after):

- **Tab chrome.** Both Chat tabs carry a brand icon — Claude terracotta
  (`rgb(217,119,87)`), Cursor black — exactly like a terminal tab. Sending a
  prompt puts `activity: "Agent working"` on that tab and nothing on the
  others; it clears when the turn ends.
- **Config options, no per-agent code.** Cursor's composer renders **Mode**
  (Agent / Plan / Ask) **and Model** (38 entries — Auto Balance, Cursor Grok
  4.6, Claude Opus 5, …). `set_mode` and `set_model` both land and update
  `currentValue`.
- **Claude finding — the "honest advertisement" assumption is false now.** The
  current `claude-agent-acp` (`0.75.1`) advertises `configOptions` with a
  `model` entry (`default/sonnet/opus/haiku/…`) **and** an "Effort" entry
  (`category: "thought_level"`), not `models: null` as the 2026-09-08 recon
  found. `session/set_model` still answers `-32601`, and there is no setter for
  `thought_level`. The typed-write design handles it: the model write surfaces
  the agent's own `"Method not found": session/set_model` as a notice with no
  optimistic update, and the effort write is refused before any RPC
  (`Silo has no verified way to set "Effort" (category "thought_level")`).
  Added: the composer **drops** a control after its first failed write, so the
  Claude panel settles to **Mode only** — which is the criterion-2 outcome,
  just reached reactively rather than from the advertisement.
- **Permissions — fired for the first time in the sprint.** Claude in `default`
  (Manual) mode, asked to write a file: the inline permission row rendered with
  the "Silo does not gate this" note and `Yes / Yes, allow all edits… / No`
  (No is not danger-styled). Clicking **No** cleared the row and the agent
  replied "Didn't create it — the write permission was denied."
- **Attach** button present and enabled; the native picker itself is not
  driveable from automation, so the `pickFile → resource_link` path rests on
  its unit tests.
- The third-party `silo.agent-inspector` reads both Chat sessions as
  `idle · isAgent: true · agent: … · Session: <id>` — criterion 1 for an
  outside consumer.

**Session 3.1a (2026-09-08, Opus) — two corrections from Dave's own testing.**
He drove the panel by hand and found the badge never reached "needs attention",
and asked the obvious question about Claude advertising options it refuses.
Both turned out to be real, and the second inverted a design decision.

- **Attention parity.** A Chat turn raised `needsAttention` only when the whole
  _workspace_ was in the background (`acp-sessions-service.ts`), where a
  Terminal session raises whenever the finish happened outside the focused
  _tab_ (`agent-activity-model.ts`: `needsAttention = isAgent &&
!ev.isActiveTerminal`). So a Chat turn finishing in a background tab of the
  active workspace badged nothing. Now the host raises on every finish except
  `cancelled` — the terminal rule — and the panel clears it via
  `ctx.agents.acknowledge` whenever it is visible, which is the terminal's
  "focus clears it" half. The existing visibility effect only fires on a
  visibility _change_, so the clear also had to go in the `ctx.agents`
  subscription. Verified both ways live: panel on screen → no badge; panel
  behind another tab → **`Agent finished`**.
- **`session/set_config_option` works — the earlier probe used the wrong field
  name.** See the corrected table in Session 3.1's scope above. The parameter is
  `configId`, not `optionId`; printing `error.data` names it outright (the
  adapter validates with zod and says so). Both agents implement it, for every
  category they advertise. So the write path is now **generic first, typed
  fallback**: `set_config_option`, and `set_mode` / `set_model` only on a
  `-32601`. The snapshot is replaced from the agent's own echoed
  `configOptions` rather than patched locally — verified worth doing, since
  setting Claude's model made its `fast` entry disappear from the list. Claude's
  model **and** Effort (`thought_level`, which has no typed method anywhere in
  the protocol) both set correctly now, where the shipped code refused them.

**The lesson worth keeping:** an error code is not a verdict. `-32601`
("method not found") and `-32602` ("invalid params") mean opposite things, and
the original probe recorded the second as if it were the first. Print
`error.data` before concluding a method is missing.

**New, unresolved:** after a long verification session the app held **15 live
ACP children** (`PPID` = the app, not orphans — so registered sessions that were
never disposed), against ~2 open Chat panels. Either a Vite HMR remount
reconnects without disposing the old handle, or closing a tab / deleting a
workspace does not always reach `handle.dispose()`. A graceful quit reaps them
all via `close_all`, so it is bounded, but Session 4 should find out which.

**Note — not folded in:** moving `core.acp-chat` → `silo.*` (the Breadcrumb
dependency) stayed a Session 4 trap, per the brief's own call.

Next: Session 4 — persistence / `session/load` on mount, the `examples/`
extension proof, the `silo.*` move, and (small) the signal-kill reap above.
