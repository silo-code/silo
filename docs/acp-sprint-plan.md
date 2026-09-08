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

| Piece                 | Where                                                                | State                                              |
| --------------------- | -------------------------------------------------------------------- | -------------------------------------------------- |
| Piped-stdio transport | `apps/desktop/src-tauri/src/commands/acp.rs`                         | 6 tests green, incl. a real-agent `#[ignore]` test |
| Chunk grouper         | `packages/extension-host/src/extension-host/agents/acp-transport.ts` | 7 tests green                                      |
| Chat panel            | `packages/extensions-core/src/acp-chat/`                             | works end to end                                   |
| Debug op              | `acpProbe` in `apps/desktop/src/automation/bridge.ts`                | dev-only; keep for testing                         |

**Known debts, deliberately carried:** the panel is built on `@acp-components`
(v0.1.0, one author) and imports `createAcpTransport` from the **privileged**
host barrel. Session 3 removes that import. The library stays for now — it is
not going to users.

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
