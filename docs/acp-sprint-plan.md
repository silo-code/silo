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
- **Both flags default `false`.** Nothing user-visible changes until they are on.
- Leave a one-paragraph handoff at the bottom of this file when you stop.

## What already exists on this branch

Working and tested — do not rebuild:

| Piece                 | Where                                                                | State                                                     |
| --------------------- | -------------------------------------------------------------------- | --------------------------------------------------------- |
| Piped-stdio transport | `apps/desktop/src-tauri/src/commands/acp.rs`                         | 6 tests green, incl. a real-agent `#[ignore]` test        |
| Chunk grouper         | `packages/extension-host/src/extension-host/agents/acp-transport.ts` | 7 tests green                                             |
| Chat panel            | `packages/extensions-core/src/acp-chat/`                             | on `ctx.agents.sessions` alone; behind `bundledChatPanel` |
| Debug op              | `acpProbe` in `apps/desktop/src/automation/bridge.ts`                | dev-only; keep for testing                                |

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
- Register it only when `bundledChatPanel` is on.
- Keep `@acp-components` for rendering if it helps — but its data must come
  through the SDK, not the host.

**Done when:** the panel works with **no** `@silo-code/extension-host/internal`
import anywhere in `packages/extensions-core/src/acp-chat/`.

**A panel that only works via the privileged import is a FAIL, not a pass.** If
the SDK is missing something, add it to `ctx.agents.sessions` — do not reach
around it.

## Session 4 — persistence and the proof

**Goal:** the three acceptance criteria, demonstrated.

- Persist the session id in panel params; `session/load` on mount; a
  "cannot be restored" state for agents that lack it. (Protocol verified —
  `acp-recon.md` §5d. The panel wiring was written but **never worked**; suspect
  params not carrying `sessionId` back on remount.)
- Reap agent processes on panel close, workspace close, and app quit.
- **The proof:** an `examples/extensions/` extension that drives a session
  end to end through `ctx.agents.sessions` — that is criterion 2.
- Turn `bundledChatPanel` off, confirm the example extension still works — that
  is criterion 3.

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
- **Agent processes orphan freely.** Ten piled up in one afternoon.
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
