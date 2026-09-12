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

## Session 3.2 — one agent, one code path

**Goal:** the agent monitor stops knowing what an agent runs on.

Session 3.1 shipped a Chat tab badge and Dave immediately found the next hole:
the Chat session is missing from the **workspace status rows**. It is not a
Chat bug. `silo.agents` opens with `if (!a.terminalId) continue;` and its status
provider iterates `ws.terminals`, so every Chat session is dropped at the door —
along with the chime, done-since, the icon-mode setting and the focus-behaviour
setting, all of which live inside that extension.

**This is one design gap surfacing repeatedly, not a run of unrelated bugs.**
`ctx.agents` unified the _data_ in Session 1–2 — `getState()` is genuinely
`[...trackedAgents, ...chatAgentInfos()]` — but every _consumer_ was written
against `terminalId`, and the SDK still only hands out terminal-shaped
affordances. `ctx.terminals.bindActivity(binder)` takes a **terminal id**, so an
extension literally _cannot_ badge a Chat session. That is what pushed Session
3.1 into adding `DockPanelApi.setTabActivity` / `setTabIcon` and having the panel
adorn itself — which closed the visible gap and widened the architectural one:
chat tab chrome now bypasses `silo.agents` entirely and cannot see its settings.

The inversion to fix: a terminal is a **subject** — it draws a terminal and has
no idea an agent badge exists; `silo.agents` observes `ctx.agents` and paints
onto it. The Chat panel became an **author**, both observed and painting. It
must become a subject too. Its _contents_ stay its own (that is what
`ctx.agents.sessions` is for); its _tab chrome_ is not its business.

### The rule

> Observing an agent uses `AgentInfo.id` and never branches on `kind`. Reaching
> for `terminalId` means deliberately leaving agent-land for terminal-land.

Observation parity, not capability parity (RFC 0038). Renaming a PTY stays
terminal-only, and says so.

### The keystone

**`DockPanelApi.setAgentSession(id | null)`** — a panel declares _what it is
showing_. That single fact is all the host lacks: it already owns the dock, so
from it it can route tab adornments to the panel's tab, decide whether the user
is looking at that session, and clear on unmount. Four of the five SDK additions
below exist only because this one does.

Replaces `setTabActivity` / `setTabIcon`, which are **removed, not deprecated** —
committed but unpublished, and behind `chatAgents`.

### The nine terminal-shaped touchpoints in `silo.agents`

Of 27 `ctx.*` calls, 18 are already kind-agnostic and do not move. These nine do:

| Today                                           | For                       | Becomes                                            |
| ----------------------------------------------- | ------------------------- | -------------------------------------------------- |
| `ctx.workspaces.get(id)` → `ws.terminals` loop  | status rows **+ labels**  | iterate `getState()`; label from `AgentInfo.title` |
| `ctx.terminals.bindActivity({provide(termId)})` | tab badge                 | `ctx.agents.bindActivity({provide(agentId)})`      |
| `ctx.terminals.bindIcon({provide(termId)})`     | tab brand icon            | `ctx.agents.bindIcon({provide(agentId)})`          |
| `ctx.terminals.invalidateTabAdornments()` ×3    | re-query binders          | `ctx.agents.invalidateAdornments()`                |
| `ctx.terminals.invalidateTabDecorations()`      | legacy shim               | dropped                                            |
| `ctx.terminals.subscribeActive()` ×2            | acknowledge; hide-focused | `ctx.agents.subscribeActive()`                     |
| `ctx.terminals.getActive()` ×2                  | seed for the above        | `ctx.agents.getActive()`                           |
| `ctx.terminals.close(termId)`                   | row → Close               | `ctx.agents.close(id)`                             |
| `ctx.terminals.getTabMenuItems(termId)`         | row → right-click         | kept, **gated on `terminalId`** — honest           |

### SDK additions

```ts
AgentInfo.title: string                  // host-computed label, either kind —
                                         //   see "The title, and where it comes from"
ctx.agents.bindActivity(binder)          // provide(agentSessionId); host routes to
ctx.agents.bindIcon(binder)              //   the owning terminal tab or panel tab
ctx.agents.invalidateAdornments()
ctx.agents.getActive() / subscribeActive()   // the session the user is looking at
ctx.agents.close(id)                     // end it, either kind
DockPanelApi.setAgentSession(id | null)  // ← the keystone
```

### The title, and where it comes from

Dave: _"the agent tab title does not update with a summary like we get with OSC
and the terminal."_ Correct, and the protocol does carry one — probed
2026-09-08, driving a real turn on both agents and logging every notification:

| signal                             | cursor                                    | claude         |
| ---------------------------------- | ----------------------------------------- | -------------- |
| `session_info_update` → `title`    | **yes** — a generated summary of the turn | **never sent** |
| `session/set_title` (client→agent) | `-32601`                                  | `-32601`       |

So the agent volunteers a title, optionally — exactly like an OSC title, which
not every CLI writes either. **Silo drops it on the floor today**:
`session_info_update` is not a kind `acp-sessions-service.ts` looks at, and
`transcript-model.ts` lists it under "not rendered, not an error". That is the
whole reason the tab never retitles.

`AgentInfo.title` is therefore a three-step fallback, and the parallel with the
terminal is exact:

| step                 | Terminal      | Chat                                |
| -------------------- | ------------- | ----------------------------------- |
| 1. the agent's words | OSC title     | `session_info_update.title`         |
| 2. the user's name   | `customName`  | _(none yet — a later session)_      |
| 3. fallback          | terminal name | declared agent name → profile label |

Feed it in beside the existing `current_mode_update` fold in
`acp-sessions-service.ts` — a few lines, same place, same shape.

**And the panel reads it back.** `AcpChatPanel`'s `api.setTitle(agentName ??
params.title ?? …)` chain is replaced by `AgentInfo.title`, so the dock tab and
the monitor's row are the same string from the same source. Same "one signal,
many consumers" move as the rest of this session.

The asymmetry is honest and will be visible: Cursor tabs retitle themselves as
the conversation moves, Claude tabs sit on "Claude Agent". That is the agent's
choice, not a Silo gap — do not paper over it by synthesising a title from the
first prompt.

> **Corrected 2026-09-08 (Session 3.2a).** The design call above holds; the
> fact underneath it does not. `claude-agent-acp` **0.75.1 does send
> `session_info_update`** — a Claude tab retitled itself to "Pineapple"
> mid-verification. The probe that recorded "never sent" was reading an
> earlier adapter. So "which agents volunteer a title" is a fact about the
> agent _and its adapter version_, and never something to branch on. Nothing
> in the code changed — it already just renders whatever arrives — only the
> prose that asserted an asymmetry.

### One attention rule, not two

Terminal activity is derived in `agent-activity-model.ts`; Chat activity is
derived inline in `acp-sessions-service.ts`. Two reducers for one concept, which
is exactly why the attention predicate drifted (Session 3.1a had to hand-copy the
terminal rule across).

**Do not route Chat through the whole terminal reducer.** Most of its event
vocabulary — `exited` vs `process-gone`, `blockDemotion`, shell demotion,
`source: shell | agent | timer` — exists _because terminal detection is
ambiguous_. A Chat session is told, not inferred, and dragging that machinery
across would be the opposite of this session's point.

Extract the **kind-agnostic core** instead: the turn lifecycle plus the
viewer-dependent attention rule, which is really this one line —

```ts
needsAttention = isAgent && !ev.isActiveTerminal;
```

— generalised to `witnessed` (from `getActive()`, either kind). Terminal resolves
its OSC ambiguity first and _then_ calls the shared core; Chat calls it directly
on turn start/end. Terminal-only demotion logic stays where it is.

**Done when:** a Chat session appears in the workspace status rows, chimes on
finish, honours the icon-mode and focus-behaviour settings, and a Cursor tab
**retitles itself from `session_info_update`** as the conversation moves — with
`silo.agents` containing no reference to `terminalId` outside the one gated
context-menu call; `chatTabActivity`, `DockPanelApi.setTabActivity` /
`setTabIcon` and the Chat panel's acknowledge-on-visible are all deleted; and
the attention rule exists in exactly one place.

**Watch for:** `provide` is called synchronously per tab during render — the
host now resolves `agentId → tab`, so that lookup must be a map read, not a
scan. And `AgentInfo.title` must track a terminal rename live, or status rows go
stale where they used to be correct — `ctx.workspaces.subscribe` already exists
in `silo.agents` for exactly this reason.

## Sessions 3.7 / 3.8 / 3.6 — the running order

An external architecture review (2026-09-08) found three things worth doing
before Session 4. They run in this document's order — **3.7, then 3.8, then
3.6** — which is not numeric order: 3.6 was scoped first but runs last because
it is blocked on catalog recon. The review's own verdicts are recorded in each
section, including the four places verifying it against the code changed the
answer.

## Session 3.7 — two seams, before they set

**Goal:** remove a dead privileged export and collapse a dispatch that is
about to be duplicated a fourth time. Neither is architecture; both get more
expensive with every consumer.

### `createAcpTransport` comes off the privileged barrel

`sdk-internal.ts` exports it and **nothing imports it from there** — verified;
`acp-sessions-service.ts`, the one real consumer, imports it by relative path.
So the export is dead _and_ it hands any `core.*` extension exactly the thing
Session 3 deleted from the Chat panel, contradicting the constraint
`ctx.agents.sessions` was designed around (the connection is host-owned; the
SDK deliberately does not hand out a transport). Five minutes.

### One `startAgentProfile(profile)`, not a branch per caller

"Start this profile" branches on `launch.interface` in **three** places today:

| site                                     | what it does with a Chat profile            |
| ---------------------------------------- | ------------------------------------------- |
| `panels/GroupAddMenu.tsx:138`            | opens the `chatProfileHost` panel           |
| `agents-settings/profile-commands.ts:45` | opens the `chatProfileHost` panel           |
| `control/agent-run-handler.ts:188`       | refuses — `silo agent run` is terminal-only |

(The review counted two and predicted `silo agent run` making it four; it is
already a site, so the fourth is Start Task.) Collapse the dispatch into the
agents module. That also removes the reason `resolveChatProfileHost` /
`chatProfileHostParams` are on the privileged barrel at all — host chrome
should ask "start this profile", not "which panel claims Chat profiles".

**This is a prerequisite for 3.6**, not just tidying: 3.6 changes how a Chat
profile is authored, and this dispatch is what opens one.

### Considered and declined

- **Move `setActiveDockPanel` out of the agents module.** The review called
  this internal placement and said skip; agreed, but the reason is the
  **name**, not the location. `setActiveDockPanel` is not an agent concept, yet
  it lives in `agents/agent-surface-registry.ts` and `WorkspaceDock` now
  imports the agents module to publish a general dock fact. Harmless with one
  consumer. When a second wants "which panel is active", the _fact_ moves
  beside `active-terminal-registry.ts` and the agents module derives from it.
- **Generalize `applyChatAgentsGate` for a second flag.** The review withdrew
  this citing this repo's own principles, and that is right: the deps object is
  a test seam, not a generalization, and the extension id comes from the caller
  precisely so the host never learns what the bundled panel is called. Correct
  as written.

## Session 3.8 — the update stream is not the wire format

**Goal:** stop `AgentSessionUpdate.raw` being the only way to render a
transcript. This is the one real architectural item the review found, and
the sprint is actively recruiting extensions onto this surface.

### Criterion 2 is passing on a technicality

`AgentSessionUpdate` models `kind`, `text`, `messageId` and `raw`. Everything
else comes off `raw` — verified in Silo's own panel
(`transcript-model.ts:239-276`): `raw.toolCallId`, `raw.title`, `raw.status`,
`raw.kind`, `raw.content`, and `raw.entries` for the plan. Tool calls and the
plan are not garnish; they are most of what a transcript shows.

So "an extension can build its own Chat UI using only `@silo-code/sdk`" is
**true in letter and false in spirit**: it can, by reading undocumented ACP
wire fields — and the bundled panel, the reference implementation a third party
will copy, is what teaches them to. That is exactly the finding phase 3 existed
to surface. The panel found it and worked around it instead of reporting it,
which is the mistake to name: a workaround inside the reference implementation
looks like a feature to everyone downstream.

`@beta` does not save this. Re-typing the surface later burns precisely the
early adopters the criterion exists to attract.

### Scope

- Model `tool_call` / `tool_call_update` as real SDK fields — id, title,
  status, kind, content — since **every** Chat UI must render them.
- Model `plan` too. The review omits it; `planRows` reads `raw.entries` and it
  is the same shape of problem.
- Keep `raw` as the documented escape hatch, and say in its TSDoc that it
  **tracks the protocol, not semver** — an unmodelled field may change under a
  consumer without an SDK major.
- Rewrite `transcript-model.ts` against the modelled fields. It is the proof:
  if the bundled panel still needs `raw` for anything a Chat UI must show, the
  modelling is not finished.
- Tolerance is unchanged — an unknown `kind` is skipped, never an error.

**Done when:** `transcript-model.ts` reads no `raw` field for tool calls or the
plan, and the `/api/agents/sessions` page documents what is modelled versus
what `raw` is for.

**Watch for:** model what the protocol _carries_, not what this panel happens
to render. The temptation is to shape the fields around
`transcript-model.ts`'s current output, which would bake one UI's choices into
the SDK.

**Done (2026-09-08) — see the handoff log.**

## Session 3.6 — a Chat profile you cannot author wrongly

**Goal:** picking the agent replaces typing its launch line. Silo already knows
how each catalog agent runs in Chat; stop asking the user.

Dave authored a Chat profile from his `claude-personal` shell alias and got
`failed to spawn claude-personal: No such file or directory (os error 2)`. The
profile was wrong, and the editor had every chance to prevent it.

### Why the current field is the wrong control, not a badly-labelled one

**Free text is right for Terminal and wrong for Chat**, and the asymmetry is
structural rather than cosmetic:

|                           | Terminal                                           | Chat                          |
| ------------------------- | -------------------------------------------------- | ----------------------------- |
| how Silo starts it        | typed into an interactive login shell              | `exec`, no shell              |
| so `command` may be       | an alias, a shell function, a version-manager shim | only a resolvable file        |
| who knows the right value | **the user** — it is their shell                   | **Silo** — it came from recon |

A terminal command _must_ be free text: only the user knows that
`claude-personal` is their alias for
`CLAUDE_CONFIG_DIR=~/.claude-personal claude --dangerously-skip-permissions`.
The Chat arm has the opposite property in both rows. Nobody guesses
`@agentclientprotocol/claude-agent-acp`, and nothing a user can type is more
correct than what `AgentDefinition.acpLaunch` already records. The editor today
transplants the Terminal control onto that case and tries to rescue it with a
"Use it" suggestion (Session 3.4) the user is free to wander away from — which
is exactly what happened.

So: **`acpLaunch` becomes the source, not a hint.** Same "one signal, many
consumers" move as Session 3.2, applied to authoring instead of chrome.

### The shape

With **Interface: Chat**, the Command / Arguments fields are replaced by an
**Agent** picker listing only catalog agents with a verified `acpLaunch`, plus
a **Custom…** entry:

- **`kind: "builtin"`** (cursor, opencode, copilot) — nothing more to ask.
  Silo composes `cursor-agent acp`.
- **`kind: "adapter"`** (claude, codex, pi) — Silo composes the npx invocation
  from the catalog, and the only thing left to ask is the **config
  directory**, for a second account.
- **`acpLaunch: undefined`** (grok) — **not offered.** It stays in the Terminal
  list. Today the editor shows an honest warning and still lets you save a
  profile that cannot work; not offering it is strictly better than explaining
  why it will fail.
- **Custom…** — reveals today's command/args fields unchanged. This is not a
  second-class escape hatch: acceptance criterion 2 says a third party can
  drive a session, and a locally-built ACP binary is that same case. One
  choice, not two parallel worlds.

**Config directory comes back for Chat**, which Session 3.1 dropped on the
grounds that the arm carries `env` rather than `configDir` — and then never
surfaced `env` at all. So a Chat profile for a second Claude account is
currently **unauthorable**: `claude-work-ui` is implicitly the work account only
because `~/.claude` is the default. The same field the Terminal arm has, writing
into `launch.env` keyed by `configDirEnvVarForAgent(agentId)`. **Verified**
2026-09-08 — the adapter spawned with `CLAUDE_CONFIG_DIR=~/.claude-personal`
answered `session/new` OK under that directory.

### The blocker: the catalog does not hold a resolvable adapter spec

`acpLaunch: { kind: "adapter", package: "claude-agent-acp" }` is a **short
name**, not something npx can resolve — the real spec is
`@agentclientprotocol/claude-agent-acp`. Session 3.1 recorded the short name
and **deliberately refused to guess** the rest, which is why it prefills
nothing for an adapter agent today. Nothing in this session can compose an npx
line until that data exists.

Only Claude's is verified (`@agentclientprotocol/claude-agent-acp@0.75.1`);
**`codex-acp` and `pi-acp` are unprobed** and must not be filled in from a
guess. **Do the recon first** — spawn each, run `initialize` + `session/new`,
record the version — and drop the arm to `undefined` for any that does not
work. This is the sprint's own rule: the check is a run, not a read of the docs.

**Resolved 2026-09-08** — all three probed over piped stdio; the catalog now
holds `@agentclientprotocol/claude-agent-acp@0.75.1`,
`@agentclientprotocol/codex-acp@1.10.0` and `pi-acp@0.0.33` (unscoped — it
needs no vendor prefix, and same-named third-party forks exist, which is why
the spec is pinned rather than resolved by short name). Neither was dropped to
`undefined`: `pi-acp` passed `initialize` **and** `session/new`, and `codex-acp`
passed `initialize` and failed `session/new` with `Authentication required`
only because this machine has no codex login at all. See the handoff log for
why that distinction is the one that decides the arm.

**Pin the version; do not float `@latest`.** The adapter has already moved
under a recorded probe twice in this sprint — `session/set_config_option`
(3.1a) and `session_info_update` appearing for Claude (3.2a). A float turns the
next such move into a silent breakage instead of a deliberate bump, and a bump
is then a recon run with a `lastVerified` date, like every other catalog fact.

### Scope

**Runs after 3.7** — its `startAgentProfile` collapse is what opens a Chat
profile, and 3.6 changes how one is authored.

- Catalog: a resolvable adapter spec + pinned version, reconned per agent.
  This is RFC 0038 open question 5's "vendor vs. name-only" arriving early: the
  review judged it a phase-5 question on the grounds that the user types the
  command today, which 3.6 is precisely what stops being true.
- `ProfileEditorModal` + `profile-editor-model.ts`: the Chat arm's Agent picker,
  Custom…, and Config directory → `launch.env`.
- Keep the composed launch **visible** — the "Silo will run" preview line
  already exists and is how the user sees what the picker chose for them.
- Migration: an existing Chat profile keeps editing as one. A saved profile
  whose command matches a catalog agent's composed launch may present as that
  agent; anything else presents as **Custom…** rather than being silently
  rewritten. Re-authoring someone's saved profile because a model changed is
  the mistake Session 3.1 already declined to make once.

**Done when:** a Chat profile for a second Claude account can be authored
without typing a command, `grok` is absent from the Chat picker, a
locally-built ACP binary is still authorable through Custom…, and an existing
profile survives a round-trip through the editor unchanged.

**Watch for:** this does **not** attempt the "redo the whole profile editor"
job — the editor is carrying two arms, a launch union, prompt delivery and
resume readiness in one modal, and that is a real design debt worth its own
proposal. Fix the arm whose control is structurally wrong; leave the rest.

**Done (2026-09-08) — see the handoff log.**

## Session 3.9 — the panel moves out (RFC 0039)

**Goal:** the Chat panel stops being bundled and becomes
`examples/extensions/acp-chat`, so it can be iterated without shipping a Silo
release. Full design: [RFC 0039](proposals/0039-panel-toolbar-sdk.md).

### Why this is sprint work and not a follow-up

Session 4's acceptance proof is already "an `examples/extensions/` extension
that drives a session end to end" plus "disable the bundled panel and confirm
the example still works". This session is that proof, done properly: rather than
a throwaway extension written beside the real panel, **the real panel becomes
the example**. A second, simpler extension proves less — the bundled panel is
the one with the demanding UI, so it is the one whose gaps are worth finding.

### The blocker it removes

`AcpChatPanel.tsx` imports `../editor/Breadcrumb`. That is legal inside
`extensions-core` and unavailable to anything else — `@silo-code/extensions-silo`
already depends on `@silo-code/sdk` alone, so a `silo.*` panel physically cannot
resolve it, let alone an example. An editor never hits this because
`EditorPanel` draws chrome _around_ it; a dock panel gets a bare frame and has to
build its own.

So: put a dock panel on the same seam an editor is on. A kind declares
`toolbar: { breadcrumb: true }`, publishes its path via
`DockPanelApi.setBreadcrumb(...)` — the shape `setAgentSession` already
established — and the host frames it. `"panel"` joins `ToolbarSurface` with a
`{ panelId, kindId }` target so contributed items land there too.

**Nothing new goes in the design-system kit.** `Breadcrumb` and
`ContributedToolbar` move into `extension-host` and stay private; the public
additions are a declaration, a setter, and a surface name. That matters because
a `<PanelToolbar>` component would have needed a `children` prop, and a
`children` prop is a private door past the contribution point — the bundled
panel's own controls have to arrive the way a third party's do, or the
contribution API never gets tested.

### The bundled copy is deleted, not kept

Not `silo.acp-chat` alongside the example: two copies of a large panel is two
things to keep in step, and the bundled one wins `chatProfileHost` by
registration order anyway. A default install therefore ships **no** Chat UI for
the duration — acceptable because the feature is behind the `chatAgents` gate
and marked work in progress. It moves back in-tree when it is good enough to be
a default.

### The `chatAgents` setting goes away with it

Once nothing Chat-related is bundled, the setting has nothing left to hide: a
default install exposes no Chat UI because none is installed, which is what the
flag was faking. But it gates **five** things, not one, and only the first
disappears for free:

1. **Bundled panel activation** (`chat-panel-gate.ts`, the inactive registration
   in `builtins.ts`, `applyChatAgentsGate` in `main.tsx`). All of it deleted.
   This mechanism exists _only_ because a bundled panel had to be conditionally
   activated, and it is the sole reason for the "No boot-time branch may read an
   index-persisted setting" trap below. That trap goes with it.
2. **`connect()` rejecting when off** (`acp-sessions-service.ts`). Becomes a
   permission — see below.
3. **The Interface: Terminal / Chat radio** in the profile editor. Must be
   re-gated, not simply un-gated — see below.
4. **The toggle row** on Settings → Agents. Deleted.
5. **`startAgentProfile`'s refusal** when no panel claims `chatProfileHost`.
   Already correct and already derived from the registry; unchanged.

**Re-gate the Interface radio on `resolveChatProfileHost() !== undefined`,** not
on nothing. Un-gating it outright would let a user with no Chat panel installed
author a Chat profile, save it, and meet "no Chat panel is installed to open it"
at launch — an authorable-but-unusable profile, which is the exact state Session
3.6 spent itself eliminating for `grok`. Deriving the offer from the registry is
strictly better than the boolean was: it is a fact rather than a preference, it
self-heals when a panel is installed or removed, and it makes the editor and the
launch path resolve through the same function so they cannot disagree.

Keep 3.6's other rule intact: an **existing** Chat profile still edits as one
even with no panel installed. Silently re-authoring someone's saved profile into
the other arm because their extension list changed is the mistake 3.1 and 3.6
both declined to make.

### `ctx.agents.sessions` becomes a declared permission

Removing the flag makes the surface unconditionally live for **any** installed
extension, not just a Chat panel — and it is currently the only capability with
a global off switch. Two things still bound it (a user-authored Chat profile must
exist, and the user must have installed the extension), but "spawn a process and
speak a protocol to it" is a capability, so it gets the mechanism that exists for
capabilities rather than losing its gate by side effect.

Add `"agents"` to `Permission` (`packages/sdk/src/permissions.ts`, today
`fs:read` / `fs:write` / `process` / `network` / `webview`). `connect()` throws
without it, the way `FileService` throws `PathDeniedError` without `fs:read`, and
the grant is shown at install like every other. The example extension declares it
in its `silo.permissions` — which is also the first real exercise of that
manifest field by something in this repo.

Note the shape this settles: **`process` does not cover it.** An ACP child is
spawned by the _host_ from a user-authored profile, not by the extension through
`ctx.process`, so the existing permission does not apply and stretching it to
would blur what `process` means.

### Scope

1. Move `Breadcrumb` + `ContributedToolbar` into the host. Pure move.
2. `DockPanelKind.toolbar` + `DockPanelApi.setBreadcrumb`; the dock frame draws
   the strip for kinds that declare it.
3. `"panel"` surface + `ToolbarItemContext.panel`.
4. `core.acp-chat` adopts it and deletes its own toolbar.
5. The panel moves to `examples/extensions/acp-chat`; `core.acp-chat` is
   deleted.
6. Retire `chatAgents`: delete the gate machinery and the settings row, re-gate
   the Interface radio on `resolveChatProfileHost()`, add the `"agents"`
   permission. Drop the persisted key defensively — an index carrying
   `chatAgents: false` must not resurrect anything.
7. `core.terminal` migrates — the second consumer, which is what stops the
   design being shaped around one caller.

**Done when:** `examples/extensions/acp-chat` builds and runs resolving
`@silo-code/sdk` alone, claims `chatProfileHost` through the public path, and is
visually indistinguishable from what shipped bundled. `chatAgents` no longer
exists anywhere in the tree; with the example uninstalled the profile editor
offers **no** Interface choice and an existing Chat profile still edits as one.

**Watch for:** phase 5 is where a gap surfaces if there is one. Anything the
panel still needs from `extension-host/internal` **is the finding** — fix the
surface, do not reach around it. Package visibility, not review, is what
enforces this: an example simply cannot resolve the privileged barrel.

**Done (2026-09-09) — see the handoff log.** All seven phases; no SDK gap in
phase 5. One judgement call: `"terminal"` `ToolbarSurface` was kept (stable
API), so folding it into `"panel"` is a follow-up in the collapsed RFC.

## Session 3.10 — commands, skills, and context (RFC 0040)

**Goal:** a Chat UI can offer a command palette and an attachment affordance
without reading `raw`. Full design:
[RFC 0040](proposals/0040-agent-commands-and-context.md).

### Recon is already done (2026-09-09)

`available_commands_update` arrives as a `session/update` **before any prompt is
sent** — 70 commands from `claude-agent-acp@0.75.1` at ~2.3s, 13 from
`pi-acp@0.0.33` at ~12.5s (behind its startup banner). Shape is
`{ name, description?, input? }` in both. Silo drops the notification on the
floor today.

**Skills are commands, and the agents disagree about how to say so.** ACP has no
separate skills concept. pi prefixes the name (`skill:code-review`, 5 of 13);
Claude does not mark them at all outside a `(user)` / `(project)` marker in the
description prose. So the surface is **one list**, and separating skills would be
vendor-sniffing — the exact thing the trap list forbids.

`promptCapabilities` (from `initialize`) is the context half: pi is
`embeddedContext: false`, codex and Claude are `true`, and `audio` is _absent_
rather than `false` in two of three. A real branch, not a formality.

### Scope

- `session.commands` + `onCommandsChanged`, shaped exactly like the existing
  `configOptions` + `onConfigOptionsChanged`. One pattern for "things the agent
  told us about itself".
- Normalise `input`: Claude sends `input: null`, pi omits the key.
- `session.promptCapabilities`, and the `AgentPromptBlock` members it unlocks.
- **No `runCommand()`.** Invocation is already `prompt([{ type: "text", text:
"/compact" }])`; a second door would imply a validation Silo does not do. The
  gap is discovery, not invocation.
- Fix `onUpdate`'s TSDoc: it claims updates fire "only between `prompt` and its
  resolution", and pi emits an `agent_message_chunk` at connect (its banner). A
  consumer trusting the current wording drops it.

**Done when:** the example panel renders a `/` palette from `session.commands`
and gates its attachment affordance on `promptCapabilities`, with no `raw` read
for either.

**Watch for:** `usage_update` (`{ used, size }`) came from Claude only. One agent
is not a pattern — leave it on `raw` and note it for the next probe.

## Session 3.11 — the dock panel record (RFC 0041 Phase 1)

**Goal:** give a dock panel the same persisted footing an editor / terminal has,
so Session 4's restore has a real structure to write into instead of the
params-in-`dockLayout` round-trip that never worked. Full design:
[RFC 0041](proposals/0041-dock-panel-record.md) (accepted this session).

### What landed

- **`DockPanelRecord`** in the SDK (`packages/sdk/src/domain-types.ts`):
  `id` / `kindId` / `workspaceId` / `state` (free-form
  `Readonly<Record<string, unknown>>`) / `createdAt` / `lastActiveAt`.
  `@public`, barrel-exported, `pnpm docs:api` regenerated, hand-authored page
  updated, roadmap row added as **experimental**.
- **`Workspace.panels: readonly DockPanelRecord[]`** — public projection of the
  new `WorkspaceInternal.panels`. Editors and terminals keep their own lists
  and shape (Decision 1: no fold now).
- **`DockPanelKind.persistence: "recorded"`** — a kind opts in; a transient
  panel (picker, preview) stays layout-only.
- **Persistence + restore.** The record list is the source of truth for which
  recorded panels exist; `dockLayout` stays geometry-only. `WorkspaceDock`
  reconciles the two on restore exactly as it does editors/terminals:
  `reconcileRecordedPanels` (pure, tested) computes the set difference;
  `onDidAddPanel` creates the record for a panel opened after restore,
  `onDidRemovePanel` deletes it, and each recorded panel's
  `onDidParametersChange` writes back into `record.state` so a panel that
  persists itself through `DockPanelApi.updateParameters` round-trips.
  **Adopt, don't cull:** a recorded-kind panel found in the saved layout with
  no record (opened before this build, or a record write that lagged the
  layout) is adopted — a record is created from its params — never dropped, so
  the release that adds `persistence: "recorded"` to a kind can't silently
  close a user's open panel. A record with no geometry is floated back in.
  Load-time normalization (`normalizeLoadedWorkspace`) fills `panels` on a
  pre-0041 workspace file.
- **`workspaceId` on the RFC 0039 `"panel"` toolbar target**
  (`ToolbarItemContext["panel"]`). Threaded host-side: `WorkspaceDock.onReady`
  registers its dock api → workspace id (`registerDockApiWorkspace`, covers
  background docks too), `dock-panel-kinds.ts` reads it back and passes it to
  `DockPanelChrome`, which puts it in the target. Additive.
- **`acp-chat` example declares `persistence: "recorded"`** — the Phase 1 test
  consumer. `sessionId` restore is **not** wired here; that is Session 4.

### Explicit non-goals held

No `ctx.panels` service, no panel tab adornments, no enumeration API (Phase 2).
`EditorRecord` / `TerminalRecord` untouched — not made to extend the base
(Phase 3). No session/load, no transcript journal (Session 4 / RFC 0042).

`pnpm test` / `tsc --noEmit` / `pnpm lint` / `pnpm docs:build` green;
`pnpm docs:api` regenerated. **Verified in the running dev app** (sandbox
workspace, both after a webview reload and after Dave's full process restart):
open the acp-chat panel → `listPanels` shows one `DockPanelRecord`; it persists
to the workspace file; after a reload the record is unchanged (`id` preserved,
`lastActiveAt` re-stamped) and the panel reopens with the editor and terminal
beside it — no regression. **Float path proven distinctly:** hand-editing the
`acp-chat:<id>` entry out of the saved `dockLayout` while keeping the record,
then reloading, still brought the panel back — geometry could not have, so the
record is genuinely load-bearing. A new `listPanels` automation-bridge op backs
this (mirrors `listTerminals` / `listEditors`). Housekeeping commits also
landed: the `acp-chat` "New chat" panel toolbar item, the two RFC drafts, and
(in `silo-extensions`) the `follow-ups` RFC 0039 `"panel"`-surface migration.

## Session 4 — persistence and the proof

**Goal:** the three acceptance criteria, demonstrated.

Session 4 now builds on the **`DockPanelRecord`** from Session 3.11 and
[RFC 0042](proposals/0042-chat-session-resurrection.md): the Chat panel's
`{ sessionId, profileId, cwd }` is persisted in `DockPanelRecord.state` (a
structured field on a real record, not a value smuggled through dockview's
layout serialization), and `WorkspaceDock` hands that state back as the panel's
params when it recreates the tab on restart. The params round-trip that "never
worked" is gone — the remaining work is the reload behaviour, the journal, and
reaping.

- Persist the session id in `DockPanelRecord.state`; `session/load` on mount; a
  "cannot be restored" state for agents that lack it. (Protocol verified —
  `acp-recon.md` §5d. The old panel wiring persisted `sessionId` through
  `api.updateParameters` → `ws.dockLayout` and it did not carry back on
  remount; RFC 0041's record removes the round-trip.)
- Reap agent processes on panel close, workspace close, and app quit.
- **`acp_close` kills the child, not the grandchild.** Observed 2026-09-08
  (Session 3.7 verification): deleting a workspace with two live Cursor Chat
  panels left **one `PPID 1`** process — and it was not `cursor-agent` itself
  but `~/.local/share/cursor-agent/versions/<v>/node`, the interpreter
  `cursor-agent` re-execs. So the wrapper died and its own child was adopted by
  init. A kill that targets only the direct pid cannot reap an agent that
  shells out to a real runtime, which is every `adapter`-kind agent (`npx` →
  node) and Cursor too. Kill the **process group**, not the pid. This is a
  third leak shape, distinct from the two below.
- **Reap the previous page generation on a webview page load.** Measured
  2026-09-08: **45 → 47** live ACP children across a single webview reload,
  with **zero** `disposed.` lines logged and every child still `PPID` = the
  app. A full page load has no unmount for cleanup to run in, while the Rust
  connection registry keeps holding the children — so this, not orphan
  reaping, is the common leak. (The architecture review proposed a boot-time
  orphaned-pid sweep; it would have caught none of these, because the app
  never restarted. A sweep is still worth having for the `SIGKILL` case from
  3.1, but it is the rarer half.)
- **ADR: agents die with the app, and the conversation does not.** Do _not_
  build daemon-owned ACP children — the RFC's reasoning holds and
  `session/load` is far cheaper. But write the decision down here, because this
  session encodes it into the restore path. The honest shape of it: inside a
  running app a background Chat agent _does_ stay alive, so the product's
  "projects stay alive, agents intact" promise holds; across a restart a
  terminal agent's PTY survives via the session-host daemon and a Chat agent's
  process does not. That is an asymmetry **between kinds**, which RFC 0038
  already places out of scope ("observation parity, not capability parity") —
  so it is a documented limit rather than a contradiction. It still needs the
  ADR, because a user who has learned that terminals survive a restart will
  reasonably expect agents to.
- **The proof, now carried by Session 3.9.** Criterion 2 was scoped as "an
  `examples/extensions/` extension that drives a session end to end"; after 3.9
  the real panel _is_ that extension, resolving `@silo-code/sdk` alone, so the
  criterion is met by the shipping UI rather than by a demo written beside it.
  Criterion 3 ("disable the bundled panel, confirm a replacement still works")
  becomes stronger and simpler: there is no bundled panel, so every Chat session
  in the product already runs through the public surface.
- What remains here is the part 3.9 does not touch: **restore across a
  restart**, and reaping. Verify criterion 1 against the moved example.

**Done when:** all three criteria demonstrably hold. Only then consider `main`.

## Session 5 — discovery and onboarding

**Goal:** what a new user meets. Lowest priority; skip if the day runs out.

- Unified **Found on this machine** list — one row per agent showing
  `Terminal · Chat` (`acp-recon.md` §5h has the verified table).
- Settings → Agents connection card: Connected · Provider · Account.
- "Sign in" runs the agent's own login command in a real Silo terminal, using
  the argv from `authMethods` (`acp-recon.md` §5f).
- Adapter fetch-on-first-use for `claude`/`codex`/`pi`.

## The Chat UI we are aiming at

Dave named **Paseo**'s chat UI as the model to shoot for (2026-09-09). That
target is **not yet characterised in this plan, and must not be guessed at** —
nobody on this branch has written down what specifically it does better, so any
session that starts building toward it is building toward an assumption.

Before it drives any work, capture the specifics: what the transcript shows per
turn, how commands and skills are surfaced, how context is attached and
displayed, and what the composer does. Then it belongs in a proposal, not here.

What is already true and load-bearing for it: after Session 3.9 the panel lives
in `examples/extensions/acp-chat`, so iterating toward that target no longer
costs a Silo release — which is the whole reason 3.9 is sprint work rather than
cleanup.

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
  (`chat-panel-gate.ts`). _Session 3.9 deletes `chat-panel-gate.ts` along with
  the `chatAgents` flag — but the trap is about boot order, not that flag, so it
  stays here for the next feature tempted to branch at activation time._
- **`core.*` extensions are not user-disablable.** `builtinRows()` excludes
  them from the Extensions page by design — a bundled feature meant to be
  replaceable has to be `silo.*`.
- **`app-state.json` on disk is stale** — it holds 3 workspaces while the app
  reports 9. Do not debug persistence from that file. Worse than "stale",
  measured 2026-09-08: the dev file was **four months old** and had no
  `agentProfiles` key at all. To read live host state from an automation
  session, dynamic-`import()` the internal barrel by its `/@fs/…` path in an
  `eval` and call the getter (`getAgentProfiles()`) — vite hands back the same
  module instance the app is using, so the valtio store is the live one.
- **The client is not a safety boundary.** Cursor writes files without asking and
  without calling `fs/write_text_file`. Never imply in UI that Silo gates writes.
- **A Chat profile's `command` is `exec`'d — a shell alias can never work.**
  There is no shell, so `claude-personal` (an alias) gives
  `No such file or directory (os error 2)`, and a shell function or a
  version-manager shim fails the same way. This has now cost time three
  separate times (Session 3.4 twice, Session 3.6 once), which is why 3.6 stops
  asking the user for the line at all. The Terminal arm is the opposite and
  free text is correct there.
- **An adapter's advertised behaviour moves between versions.** `claude-agent-acp`
  changed twice inside this sprint: `session/set_config_option` (3.1a) and
  `session_info_update` appearing where the recon found none (3.2a). Never
  branch on "agent X does/doesn't do Y" — render what arrives, and treat any
  recorded probe as true only for the version beside it.

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
**New Agent Chat** from a dock's **+** menu. **Next:** written up as **Session 3.6 — a Chat profile you cannot author
wrongly** above, after Dave hit `failed to spawn claude-personal` authoring a
Chat profile from a shell alias. Two findings behind it: the Chat arm's
free-text Command is the Terminal control transplanted onto a case where its
premise (a shell resolves it) does not hold, and a second-account Chat profile
is **unauthorable** today because Session 3.1 dropped Config directory for Chat
without ever surfacing `launch.env`. Blocked on catalog recon: the adapter spec
is a short name, not something npx can resolve.

**Architecture review (2026-09-08, external agent) — checked against the code,
four answers changed.** Dave had a separate agent review the architecture. Most
of it held; verifying each claim against the source is what made it useful, and
is recorded here because "an agent said so" is not evidence.

- **Held, and understated: the raw passthrough.** Now Session 3.8. The review
  argued that recruiting extensions onto `update.raw` makes ACP's wire format
  the public contract. True, and the sharper version is that **Silo's own panel
  already proves criterion 2 only passes on a technicality** — every tool-call
  and plan field it renders comes off `raw`. A workaround inside the reference
  implementation looks like a feature to everyone downstream. The review also
  omitted `plan`, which is the same problem.
- **Held: `createAcpTransport` on the privileged barrel.** Verified dead — the
  one real consumer imports it by relative path. Now Session 3.7.
- **Held but undercounted: the launch dispatch.** The review said two sites and
  predicted `silo agent run` making it four; `agent-run-handler.ts:188` is
  already a site, so it is three today. Its causal claim was right:
  a single `startAgentProfile` removes the reason `resolveChatProfileHost`
  is on the privileged barrel. Now Session 3.7, and a **prerequisite** for 3.6.
- **Right conclusion, wrong reason: moving `setActiveDockPanel`.** Skip, yes —
  but because the _name_ is not an agent concept, not because placement is
  internal. Recorded under 3.7's declined items so the real trigger (a second
  consumer of "which panel is active") is written down.
- **Withdrawn, correctly: generalizing `applyChatAgentsGate`.** The review
  withdrew its own item citing this repo's principles. Confirmed correct as
  written.
- **Materially wrong: the orphan sweep.** It proposed a boot-time orphaned-pid
  sweep for leaked children. Measurement says otherwise — 45 → 47 children
  across one webview reload, zero dispose lines, every child `PPID` = the app.
  Those are not orphans and the app never restarted, so a boot sweep catches
  none of them. Folded into Session 4 as the page-generation reap, with the
  sweep kept for the rarer `SIGKILL` half. **The review could not have known
  this** — the measurement is hours old — which is the useful lesson: a review
  reasons from the code, and the code did not say which failure mode was
  common.
- **Overtaken: adapter provenance.** Judged low-risk "while phase 5 is
  unbuilt, since the user writes the command themselves today" — which Session
  3.6 stops being true. Now a 3.6 blocker rather than a phase-5 question.
- **Held: the process-ownership ADR.** Agreed, and folded into Session 4 with
  the tagline question answered rather than left rhetorical (see there).

**Session 3.7 (2026-09-08, Opus) — two seams, closed.** Both landed as scoped.
`createAcpTransport` is off `sdk-internal.ts` — it was dead there (the one real
consumer imports it by relative path) _and_ it offered any `core.*` extension
exactly what Session 3 deleted from the panel. And "start this profile" is now
one function, `agents/agent-profile-start.ts`, returning a discriminated
`AgentProfileStart` the caller places.

**Placement stayed with the callers, deliberately.** They genuinely differ —
the `+` menu has the dock group the user clicked **+** in, a keybinding has
none — so the dispatch resolves _what to start_ and hands back
`terminal | panel | refused | cancelled`. Taking a placement callback instead
would have made one shape pretend to be two. `resolveChatProfileHost` /
`chatProfileHostParams` came off the privileged barrel with it: host chrome now
asks "start this profile", never "which panel claims Chat profiles".

**`silo agent run` deliberately does not use it**, and now says why in a
comment. It is a headless control-API verb with no window to open a transcript
in, so it keeps its own refusal; routing it through the dispatch would have
turned `silo agent run --profile my-chat` into a panel appearing on someone's
screen. This was the one trap in the collapse and it is the reason the review's
"one startAgentProfile" framing needed a caveat.

Tests moved to where the behaviour moved: `profile-commands.test.ts` had been
mocking `pickWorkspaceFolder` / `launchAgentProfile` / `resolveChatProfileHost`
off the barrel, which the command no longer touches — it now stubs
`startAgentProfile` and asserts only _placement_ (4 cases), while the dispatch
itself gets `agent-profile-start.test.ts` (9 cases, including that a Chat
profile never reaches the folder chooser and that a pre-launch-union record
still falls through to the terminal path).

**Verified live**, all four gestures in a sandbox workspace with throwaway
`s37-cursor` / `s37-term` profiles (both removed): `core.newAgent.<id>` opened
a connected Chat panel and, for the Terminal profile, created a terminal with
no panel of its own; the **+** menu did both and placed each into the clicked
group. Trap for the next session driving menus: `silo-menu-item` handles
**`onMouseDown`**, not `onClick` — a `.click()` is a silent no-op.

**One new finding, folded into Session 4.** Tearing the sandbox down left a
single `PPID 1` process, and it was not `cursor-agent` but the
`versions/<v>/node` interpreter it re-execs — so `acp_close` killed the wrapper
and init adopted its child. Killing the pid cannot reap an agent that shells
out to a real runtime, which is every adapter-kind agent (`npx` → node) and
Cursor as well: it needs the process group. That is a **third** leak shape,
independent of the reload leak and the `SIGKILL` one.

`pnpm test` / `tsc --noEmit` / `pnpm lint` / `pnpm docs:build` green.

Next: Session 3.8 (the update stream), then 3.6, then Session 4.

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

**Session 3.2 (2026-09-08, Opus) — one agent, one code path.** The inversion
landed and `silo.agents` no longer knows what an agent runs on. Order was
keystone-first, green at each step.

**The keystone did the work the write-up predicted.** `DockPanelApi
.setAgentSession(id | null)` plus a host **agent-surface registry**
(`agents/agent-surface-registry.ts`) is the whole of it: `panelId → sessionId`
is the primary index (a `provide` call must be a map read), `sessionId →
panelId` the reverse, and the panel's own dockview api supplies a `close`
control, so `ctx.agents.close(id)` needed no new SDK option. `getActive()`
resolves the active terminal tab first — a Terminal session's id _is_ its
terminal record id, so `active-terminal-registry.ts` already answered for one
kind — else the active panel's declaration; `WorkspaceDock` publishes the
active panel id from the same effect that already published the active
terminal. Six SDK additions, all `@beta`, documented, `docs:api` regenerated,
`silo-docs-sync` run: `AgentInfo.title`, `bindActivity`, `bindIcon`,
`invalidateAdornments`, `getActive` / `subscribeActive`, `close`, and the
keystone.

**A latent bug fell out of the agent-keyed binders.** They register _one_
provider under both the `terminal` and `panel` adornment kinds, and
`tab-adornment-registry.ts` tracked icon-binder kind in a `Map` keyed by
`binder.id` — so the second registration silently retagged the first and one
dispose deleted both. `bindIcon` now uses the `{kind, binder}` entry shape the
other three verbs already used. Regression test included.

**The attention rule is now in exactly one place**, `agents/agent-turn-model
.ts`: `beginTurn` / `endTurn` / `witnessTurn` over a four-field `TurnPhase`,
with `needsAttention = isAgent && !witnessed` and a `TurnOutcome` of
`finished | cancelled | failed`. The terminal reducer resolves its ambiguity
(source gating, demotion blocking) and _then_ calls in; Chat calls in directly
with `witnessed = getActiveAgentSession() === infoId`. None of `exited` /
`process-gone` / `blockDemotion` / `workingSource` moved — that vocabulary
exists because detection is ambiguous, and Chat is told. `agent-activity-model
.test.ts`'s 28 existing cases passed unmodified, which was the point of
extracting rather than rewriting. Two Chat behaviours changed to match
terminal: a `failed` outcome (a dead process) no longer _also_ raises
attention — `activity: "error"` is loud on its own — and a permission request
raises only when unwitnessed.

**Removals, as specified.** `DockPanelApi.setTabActivity` / `setTabIcon`,
`acp-chat/tab-adornment.ts` + its test, and the panel's acknowledge-on-visible
effect are gone. The panel's three tab-chrome effects collapsed to one
`setAgentSession` declaration plus one subscription that reads `AgentInfo
.title` and `activity === "error"` back. `stripStatusMarker` went too — the
host's `stripAgentStatusMarkers` (strictly better: OMP separators, Cursor's
derived status table) now feeds `AgentInfo.title`, so the extension's
duplicate was dead. The `"panel"` `TabAdornmentKind` and the
`dock-panel-kinds.ts` wrapper stayed, as instructed.

**Title tracks a rename live** via a `refreshTerminalTitles()` pass in
`syncSessions`, which already runs off `subscribe(store, …)`. This is the trap
the write-up flagged: a rename changes no _activity_, so it fires no activity
event, and a status row keyed on the field would have sat on the old name
forever. `silo.agents`' own `ctx.workspaces.subscribe` was dropped as
redundant once the host owns this.

**Verified live** (`verifier-gui`, the dev app on `:7878` confirmed as this
worktree's binary; throwaway `v32-cursor` / `v32-claude` profiles and a sandbox
workspace, all removed afterwards). Driving a real Cursor turn produced, in one
snapshot: the tab retitling itself from **"v32 cursor" → "Explain WeakMap
Caching"** (`session_info_update` → `AgentInfo.title`), `aria-label: "Agent
working"` on that tab, a brand icon on it, and a status row reading **"Explain
WeakMap Caching | 2s"** — the same string in both places from the same field.
Then, each in turn: a finish with the panel active raised **no** badge and the
row went neutral grey (witnessed); a finish with an editor tab active raised
**"Finished"** and a green counting row (unwitnessed) — with the panel doing no
acknowledging at all; activating the tab cleared it via
`ctx.agents.subscribeActive`; the **chime fired** (patched `window
.AudioContext` and watched the count go 0 → 1 exactly at the finish, which a
Chat session had never done); **icon-mode** `none` removed the icon from the
Chat tab and `color` restored it (the panel used to hard-code `"color"`); and
**focus-behaviour** `hide` removed the Chat session's status row while its tab
was active and brought it back on switching away. Closing the tab withdrew the
declaration, dropped the row, and logged `Chat session chat:… disposed.`
Dave's settings were restored to their original values.

**The open thread is diagnosed, and the first hypothesis was wrong.** It is not
an HMR remount reconnecting without disposing. The children arrive in matched
`cursor-agent` + `claude-agent-acp` **pairs** — one per open Chat panel — and a
deliberate test settled it: 45 children before a webview reload, **47** after,
with **zero** `disposed.` lines logged. A full page load has _no unmount for
cleanup to run in_, so every reload strands one child per panel while the Rust
connection registry keeps holding it. Same root cause as the `tauri dev`
`SIGKILL` leak from 3.1 — the JS-side cleanup is simply never reached. The fix
belongs host-side (reap the previous page generation's connections when a new
page load registers, rather than trusting a `beforeunload` a webview may not
deliver), and is Session 4's. Bounded by `close_all` on a graceful quit; Dave's
app was carrying ~23 stale pairs, left in place because `close_all` cannot tell
them from the two live ones.

**Also:** `silo.agents`' user-facing prose said "terminal" throughout — the
focus-behaviour cards, the sound hint, the workspace-rows hint — which stopped
being true the moment a Chat session honoured those settings. Reworded to name
the _session_. Glossary gained **Agent Surface**, **Session Title** and
**Witnessed** (`docs/domain-language.md`); the roadmap's `ctx.agents` row names
the new verbs.

`pnpm test` (all 11 packages) / `tsc --noEmit` / `pnpm lint` / `pnpm docs:build`
green; `docs:api` regenerated.

**Session 3.2a (2026-09-08, Opus) — the dropdown that ate the conversation.**
Dave looked at the composer's profile picker and asked the right question:
what happens if you switch mid-chat, and should you be allowed to? What
happened was a silent teardown — the handle disposed (reaping the agent), the
transcript wiped, a new session connected, no confirmation, and mid-turn the
in-flight prompt abandoned. Nothing broke or leaked; you just lost the
conversation with one click on a control that reads like a filter. The
behaviour was right and the gesture was wrong.

Switching now confirms first, with the rule in a pure `profile-switch.ts`
(`confirmProfileSwitch` / `hasConversation`, 7 tests) rather than inline in the
component. Two cases stop, and deliberately nothing else: **a turn in flight**
("Stop this turn and switch agents?" — cancelling someone's running turn from a
dropdown is never what they meant, whatever else is on screen), and **a
transcript with something in it**. Emptiness is judged on the agent's and the
user's own words — Silo's own `NoticeEntry` lines do not count, so a panel that
only ever managed "ACP connection closed" switches freely; making the user
confirm past a failed connect to try a different agent would be the opposite of
helpful. The message names the agent being _left_, since that is the half the
dropdown stops showing them once they have chosen. Declining touches no state
and the `Select` is controlled off `profileId`, so it snaps back on its own.

Verified live across all four paths (sandbox workspace + `sw-cursor` /
`sw-claude`, both removed): an empty transcript switched silently; a transcript
with a message raised the conversation confirm naming "Claude Agent";
**Cancel** snapped the picker back with the transcript intact; mid-turn raised
the stop confirm (`busy=true` captured at the click); and **Stop and switch**
completed the switch, wiped the transcript, logged the old session disposed,
and connected Cursor.

**One factual correction to Session 3.2, no code change.**
`claude-agent-acp` 0.75.1 **does** send `session_info_update` — a Claude tab
retitled itself to "Pineapple" during this verification, where 3.2 (following
the recon) asserted Claude never sends one. The design call was always "render
what the agent volunteers, never synthesise", so the implementation needed
nothing; only the prose claiming a permanent Cursor/Claude asymmetry did. Now
worded as a fact about the agent _and its adapter version_, in the SDK TSDoc,
the host, the glossary and the Session 3.2 spec above. Worth keeping as a
pattern: this is the third time in the sprint an adapter's behaviour moved
under a recorded probe.

Next: Session 4.

**Session 3.8 (2026-09-08, Opus) — the update stream is no longer the wire
format.** `transcript-model.ts` reads **no `raw` field at all** (grep-verified:
the only occurrence in `packages/extensions-core/src/acp-chat/` is the doc
comment saying not to). Six new `@public @beta` types carry what a transcript
must draw: `AgentToolCall`, `AgentToolCallContent`, `AgentToolCallLocation`,
`AgentPlanEntry`, `AgentContentBlock`, plus `AgentSessionUpdate.toolCall` /
`.plan` / `.content` and `AgentPermissionRequest.toolCall`. Parsing lives in one
host module, `agents/acp-update-model.ts` (`parseToolCall` / `parsePlanEntries` /
`parseContentBlock`, 20 tests).

**Recon first, then modelling — and it changed the shape.** Rather than reading
the spec, I ran four real turns straight against the agents over stdio (script
kept out of the repo) and modelled what actually arrived. What that bought:

- **`tool_call_update` carries only what changed** — most frames were
  `{ toolCallId, status }` alone. So one type serves both kinds and **only
  `toolCallId` is required**; every other field is optional and absent means
  _unchanged_, never _empty_. Modelling `title` as required (the obvious read of
  the spec) would have been wrong on the majority of frames.
- **`locations` and `rawInput` / `rawOutput` exist and the panel ignores them.**
  Modelled anyway, per the brief: `locations` is how an agent says which file a
  call is about (Cursor sends `path` only, `claude-agent-acp` 0.75.1 sometimes
  `line` too), and the two `raw*` fields are protocol-carried but vendor-shaped,
  so they are typed `unknown` with the caveat in their TSDoc.
- **A `"diff"` block's `oldText` is `null` for a file being created** — collapsed
  to `undefined` at the boundary rather than pushed onto consumers.
- **Content-block and tool-content `type` are `string`, not unions**, following
  the house pattern already set by `AgentSessionConfigOption.type`: tolerate the
  unknown and let a UI _name_ a block it cannot expand rather than drop it.

**`raw` stays, with its contract written down**: it is the escape hatch for what
is deliberately unmodelled (`available_commands_update`, `usage_update`,
`current_mode_update` and `session_info_update` — the last two already surfaced
as `configOptions` / `AgentInfo.title` — and vendor `_meta`), and its TSDoc,
`/api/agents/sessions` and the glossary all now say the thing that matters:
**`raw` tracks the protocol, not semver.** A field inside it can change under a
consumer with no SDK major. Also folded in: `AgentPermissionRequest.toolCall`,
because the permission row is exactly where a UI wants to show the diff it is
being asked to approve, and that was `raw`-only too.

**The regression proof is a replay, not an eyeball.** A live agent turn is not
reproducible — re-running the same prompt gets different prose and a different
number of tool calls — so "renders the same transcript" was settled by folding
the **four captured frame sets** (Cursor 2026.09.02, `claude-agent-acp` 0.75.1
×2, `@zed-industries/claude-code-acp` 0.16.2) through the old `raw`-reading
reducer and the new one, and asserting the entry arrays are equal. They are,
including `seq`. That harness lived in the scratchpad and is gone with the old
code it compared against; what survives in the repo is `acp-update-model.test.ts`,
whose fixtures are lifted from those real frames. The existing
`transcript-model.test.ts` assertions all survived — only fixture _shape_
changed — with two deliberate exceptions, both because the behaviour moved
upstream rather than away: wire-level garbage is now rejected by the parser, so
the panel's "all the wrong type" case is now "a `tool_call` the SDK could not
model" (still a row, still not a crash), and `planRows` is fed entries rather
than a `raw` object.

**Verified live** (`verifier-gui`, this worktree's app on `:7878`, sandbox
workspace + throwaway `s38-cursor` / `s38-claude` / `s38-plan` profiles, all
removed): a Cursor turn that read two files, wrote two and ran `ls` rendered
title/kind/status/diff rows identically before and after; a Claude turn raised
the inline permission row and completed through it; and the plan path rendered
**live plan rows moving `pending` → `in_progress` → `completed`** and being
replaced in place.

**One finding worth keeping: no agent on this machine emits `plan` by default.**
Cursor 2026.09.02 writes its plan as _prose_, and `claude-agent-acp` 0.75.1 does
not map Claude's todo list onto the protocol's `plan` update at all. The one
that does is the older `@zed-industries/claude-code-acp` (0.16.2, since renamed
to `@agentclientprotocol/claude-agent-acp`), which is what the plan modelling and
the live plan verification are built on. So the plan row in Silo's panel had, up
to this session, **never rendered from a real agent**. Two consequences: use the
Zed-named adapter when you need a plan to test against, and note that it refuses
to start inside a Claude Code session (`Claude Code cannot be launched inside
another Claude Code session` — `unset CLAUDECODE` to probe it from a terminal;
the app spawns it fine).

`pnpm test` (11 packages, 1900 in extension-host alone) / `tsc --noEmit` /
`pnpm lint` / `pnpm docs:build` green; `docs:api` regenerated; `silo-docs-sync`
run for all six new symbols (TSDoc, `@public`/`@beta` + `@category`, barrel, the
`/api/agents/sessions` page rewritten to say what is modelled versus what `raw`
is for, roadmap row). Glossary gained **Update stream**.

Next: Session 3.6 (blocked on catalog recon), then Session 4.

**Session 3.6 (2026-09-08, Opus):** Picking the agent now _is_ authoring the
Chat launch. `AgentAcpLaunch`'s adapter arm carries a resolvable `package` plus
a pinned `version`; `chatLaunchForAgent` composes `npx -y <package>@<version>`
(or the builtin's own argv) and the editor writes that, so the Chat arm has an
**Agent** picker where Terminal has a Command field — the asymmetry is the
point, since only the user knows their shell and only Silo knows the ACP
invocation. Session 3.4's rescue machinery is gone rather than left inert beside
it: `suggestChatLaunch`, `matchesChatSuggestion`, the "Use it" Callout, the
adapter/none Callouts and the `chatLaunchEdited` flag are deleted, replaced by
`chatChoice` (an agent id, `custom`, or unset) derived from the saved launch via
the new `chatAgentForLaunch`. Config directory came back for Chat, writing
`launch.env[configDirEnvVarForAgent(id)]` — the same control as Terminal, only
the destination differs.

**The recon changed one catalog answer and nearly changed two.** `pi-acp@0.0.33`
is **unscoped** (svkozak/pi-acp) — the short name was already correct, but
several third-party forks share it on npm, so the spec is pinned rather than
resolved by name. `codex-acp` needed the `@agentclientprotocol/` prefix and
pinned at 1.10.0. **Judgement call worth reviewing:** codex passed `initialize`
(agentInfo "Codex" 1.10.0, protocolVersion 1) but `session/new` returned
`Authentication required` — and I kept the arm rather than dropping it to
`undefined`. The reason is that the two failures the rule exists to catch are "the
package doesn't resolve" and "the launch line is wrong", and this is neither:
the same shape came back from `pi-acp` pointed at an empty `PI_CODING_AGENT_DIR`,
where it is unambiguously an auth state, and the trap list's own rule says the
auth signal _is_ `session/new` failing. This machine has no codex login at all
(`codex login status` → "Not logged in", no `~/.codex/auth.json`), so it is a
fact about the machine, not the catalog. Codex's `contract` records it as
PARTIALLY VERIFIED with the re-probe named; **if you disagree, that entry is the
one line to change.** Whether the adapter honours `CODEX_HOME` is blocked on the
same step and is called out too — Claude's `CLAUDE_CONFIG_DIR` and pi's
`PI_CODING_AGENT_DIR` were both observed working.

Verified live in the dev app, all four picker shapes: Cursor (builtin — picker
plus preview `cursor-agent acp`, nothing else asked), Claude (adapter — Config
directory offered, preview the pinned npx line), `grok` **absent from the Chat
picker while still listed for Terminal** (with OMP, same), and Custom… revealing
Command/Arguments for `/Users/dweaver/.local/bin/cursor-agent acp --local`. A
second-account Claude Chat profile authored **without typing a command** saved
`env.CLAUDE_CONFIG_DIR=/Users/dweaver/.claude-personal`, started, and the
transcript header read **"Claude Code (personal)"** — the account override
reaching the adapter end to end. Round-trips are byte-identical: that profile,
and a deliberately unrunnable `command: "claude-personal"` one that presents as
**Custom…** and saves back unchanged rather than being re-authored.

Two things for whoever is next. `app-state.json` is not merely stale, it is
**four months old** (June) and contains no `agentProfiles` key at all — read
live profiles by dynamic-`import()`ing the internal barrel's `getAgentProfiles`
from the page, which shares the module instance. And `fallbackAgentForCommand`
does not match an absolute path (`/…/bin/cursor-agent` resolved to no agent), so
a **Custom…** Chat profile pointed at a path gets no `assumedAgentId` and
therefore no Config directory field — pre-existing, small, and the one gap left
in "authorable without typing".

`pnpm test` (11 packages) / `tsc --noEmit` / `pnpm lint` / `pnpm docs:build`
green; `docs:api` regenerated with no diff — no public SDK symbol changed, as
scoped. `apps/docs/guide/` describes only Terminal profiles and never mentions
the Chat arm (it is behind `chatAgents` and marked work-in-progress), so nothing
there needed updating.

Next: Session 4.

**Session 3.9 (2026-09-09, Sonnet) — the panel moved out, and `chatAgents` is
gone.** All seven phases landed. The chat panel is now
`examples/extensions/acp-chat` — the real ~1,350-line panel plus its co-located
Vitest, moved verbatim, resolving `@silo-code/sdk` alone; `core.acp-chat` is
deleted and out of `builtins.ts`. `turbo run test` picks the example up (it has
a `test` script — modelled on `terminal-monitor`), so its 57 tests, including
the 376-line `transcript-model.test.ts`, still run in CI. **No SDK gap surfaced
in phase 5** — the example's `tsc --noEmit` passes, which is only possible if
nothing resolves `@silo-code/extension-host/internal`; the panel was already
clean from Session 3.

The SDK grew four additions, all onto existing `@public` types (TSDoc,
`docs:api`, roadmap row, hand-authored `/api/registration/*` + `/api/agents/
sessions` pages all updated): `DockPanelKind.toolbar?: { breadcrumb?: boolean }`,
`DockPanelApi.setBreadcrumb(crumb | null)` (shaped exactly like `setAgentSession`
— three-state: crumb / `null` = no crumbs / undefined = placeholder), `"panel"`
on `ToolbarSurface` with `ToolbarItemContext.panel = { panelId, kindId }`, and
`"agents"` on `Permission`. `Breadcrumb` + `ContributedToolbar` moved into
`packages/extension-host/src/panels/` (still private, re-exported from the
internal barrel for the two `core.*` panels that compose them by hand); a new
`panel-chrome-registry.ts` + `DockPanelChrome` + the `dock-panel-kinds.ts` frame
draw the strip for any kind that declares `toolbar`.

**`chatAgents` retired.** `chat-panel-gate.ts` + `applyChatAgentsGate` +
`CHAT_PANEL_EXTENSION_ID` deleted; the store field / persisted key / getters
gone (an index carrying `chatAgents` is ignored, resurrects nothing). `connect()`
now checks a `() => boolean` predicate `context.ts` binds to the extension's
`"agents"` permission — `getAgentsService()` returns `Omit<AgentsService,
"sessions">` and `context.ts` composes `sessions` on. **Two enforcement points
beyond the `Permission` type had to change and only one was obvious**:
`KNOWN_PERMISSIONS` in `extension-manager.ts` (a runtime allowlist — the example
failed to load with "unknown permission agents" until this was added) and
`PermissionConsent`'s `PERMISSION_META` (`Record<Permission, …>`, so `tsc`
caught it). The profile editor's Interface radio is re-gated on
`resolveChatProfileHost() !== undefined` (re-added to the internal barrel) — an
existing Chat profile still edits as one via the `|| isChat` at the call site.

**`core.terminal` migrated** — declares `toolbar: { breadcrumb: true }`,
publishes its cwd via `setBreadcrumb`, `terminalSettings.breadcrumbs` off is
`setBreadcrumb(null)`. **Judgement call, flagged loudly:** `"terminal"` stayed
in `ToolbarSurface` (it is a _stable_ API and `decoration-demo` uses it), so the
terminal panel still renders its own `<ContributedToolbar surface="terminal">`
below the host strip — which draws nothing for a normal install. Folding
`"terminal"` into `"panel"` + `kindId` and migrating `decoration-demo` is a
clean follow-up but breaks a stable enum member, and RFC 0039 did not scope it.
It is listed under Follow-ups in the collapsed RFC.

**Verified live** (`verifier-gui`, this worktree's dev app on :7878, sandbox
workspace + example installed then removed, all cleaned up): terminal breadcrumb
host-drawn and the toggle works; the installed `acp-chat` example renders a
strip with **one** border (`.dock-panel-chrome` has none, `.breadcrumb` inside
has `1px`) visually identical to the bundled panel; `silo.agent-inspector`
(third party) reads its session through `ctx.agents`; a contributed
`surface: "panel"` item with `when: t => t.kindId === "acp-chat"` appears and one
scoped to a different kind does not; with the example disabled
`resolveChatProfileHost()` is `undefined` (new profile gets no Interface choice)
while an existing Chat profile still reports `interface: "chat"`.

RFC 0039 collapsed to `status: implemented`. `docs/domain-language.md` gained
**Panel Chrome**. Gaps recorded in the RFC's Follow-ups: the `"terminal"`
surface fold-in, and `examples/extensions/*/src/**/*.css` is outside
`pnpm lint:css`'s glob (the moved `acp-chat.css` passes stylelint by hand).
Known outstanding from 3.6 (`fallbackAgentForCommand` not matching an absolute
path) is unchanged — not caused here.

`pnpm test` / `tsc --noEmit` / `pnpm lint` / `pnpm docs:build` green; `docs:api`
regenerated. Do not merge to `main`. Next: Session 3.10 (RFC 0040) or Session 4.

**Session 3.9a (2026-09-09, Sonnet) — one strip, `"terminal"` folded in.** Dave's
testing caught the terminal drawing a **second row**: its breadcrumb was
host-drawn but its `surface: "terminal"` contributed items still rendered in the
panel's own `<ContributedToolbar>`, so a `silo.follow-ups` flag sat below the
breadcrumb. The deferred follow-up became the fix: `ToolbarSurface` drops
`"terminal"` (the terminal is a dock-panel kind — items are `surface: "panel"`,
`when: t => t.kindId === "terminal"`); `ToolbarItemContext.panel` gains
`params: Readonly<Record<string, unknown>>` so a terminal item reads
`t.params.terminalId` (RFC 0039 open question 1, now answered);
`DockPanelChrome` threads `props.params`; `TerminalPanel` renders no toolbar
markup at all. `decoration-demo` migrated in-repo. `silo.follow-ups`
(silo-extensions, published-SDK lag) still uses `surface: "terminal"` — its
terminal items stop rendering until it is republished; noted in the RFC.
Verified live: every `.dock-panel-frame` has exactly one `.dock-panel-chrome`,
no stray body toolbar. Gates green.
