# ctx.agents <Badge type="warning" text="beta" />

Host-computed coding-agent activity and resume-identity observability — a
live, read-only view of what each **Agent Session** is doing, plus an honest
resume hint when a session's backend dies uncleanly. The companion to
[`ctx.processes`](/api/processes/) (foreground process facts); this surface
is for _agent_ activity and resume identity. Detection is sealed in the host
— there is no `registerAgent` / detector API.

An Agent Session is either a **Terminal session** (an agent drawing its own
TUI in a PTY; Silo infers activity from OSC/output) or a **Chat session** (an
Agent Client Protocol child that reports activity directly). `ctx.agents`
reports the **same `AgentInfo` shape for both** — see
[`AgentSessionKind`](/api/types/type-aliases/AgentSessionKind). Use
`reveal(id)` to bring a session into view (its terminal tab or its transcript
panel) without branching on which kind it is.

```ts
ctx.agents: AgentsService
```

## Example

### Notify when a session dies with a resume command

```ts
export const extension: Extension = {
  id: "my.agent-resume-toast",
  activate(ctx) {
    const sub = ctx.agents.subscribe((agents) => {
      const dead = agents.find((a) => a.activity === "dead" && a.resumeCommand);
      if (dead) ctx.ui.notify("info", dead.resumeCommand!);
    });
    ctx.subscriptions.push(sub);
  },
};
```

### Acknowledge finished runs when the user looks at the session

`needsAttention` is separate from `activity === "idle"`. The host never
auto-clears attention on focus — that is a per-consumer policy. Use
`subscribeActive`, which reports whichever Agent Session the user is looking
at, terminal tab or Chat transcript alike:

```ts
ctx.subscriptions.push(
  ctx.agents.subscribeActive((agentSessionId) => {
    if (agentSessionId) ctx.agents.acknowledge(agentSessionId);
  }),
);
```

### Badge a session's tab, whichever kind it is

`bindActivity` / `bindIcon` take an **Agent Session id**, so one provider
paints a terminal tab and a Chat transcript tab identically. The host resolves
which tab a session is showing on — a terminal tab, or a `DockPanelKind` panel
that declared `api.setAgentSession(id)`.

`provide` runs synchronously for every visible tab during render, so keep it a
lookup. Use `activityFromAgent` to map `AgentInfo.activity`
(`AgentActivity`) onto the UI `Activity` a tab badge takes — it already knows
`"blocked"` (a Chat session stalled on a permission question) should paint,
unconditionally, the same as `"working"`:

```ts
import { activityFromAgent } from "@silo-code/sdk";

const agents = new Map<string, AgentInfo>();
ctx.subscriptions.push(
  ctx.agents.subscribe(
    (state) => {
      agents.clear();
      for (const a of state) agents.set(a.id, a);
      // Something outside the snapshot (a setting, the theme) can also change
      // what a provider returns — say so explicitly.
      ctx.agents.invalidateAdornments();
    },
    { allWorkspaces: true },
  ),
);

ctx.subscriptions.push(
  ctx.agents.bindActivity({
    id: "my-ext.agent-badge",
    provide(agentSessionId) {
      const info = agents.get(agentSessionId);
      const activity = info && activityFromAgent(info.activity);
      if (!activity) return null;
      return { activity, tooltip: "Agent working" };
    },
  }),
);
```

Return `null` for "no adornment" — `activityFromAgent` already does, for
`"none"` and `"dead"`. With `bindIcon`, be careful that a component which
renders nothing produces `null` rather than a truthy element descriptor, or
the host reserves tab space for an icon that never appears.

### Look up one session directly

`getState()` returns every tracked session in the active workspace as a plain
snapshot — reach for it outside a render loop, where `subscribe` would be
overkill. `getByTerminalId` only ever resolves a `kind: "terminal"` session;
for a Chat session, match `AgentInfo.id` from `getState()` instead:

```ts
const allAgents = ctx.agents.getState({ allWorkspaces: true });
const forThisTerminal = ctx.agents.getByTerminalId(terminalId);
```

### Reveal or resume a session from elsewhere in your UI

`reveal(id)` activates the session's workspace and brings its surface to the
front — the terminal tab, or (via `api.setAgentSession`) the Chat panel
showing it — without branching on `kind`. `resume(id)` is a no-op unless
`AgentInfo.canResume` is `true`; for a Chat session it reconnects in place
(`session/resume`/`session/load`), for a Terminal session it currently just
flags the intent (`resumeCommand` is still what the user runs themselves):

```ts
ctx.agents.reveal(info.id);
if (info.canResume) ctx.agents.resume(info.id);
```

### Read the agent catalog (icons + display names)

`ctx.agents.catalog()` returns every coding agent Silo knows about as read-only
`CatalogAgentSummary` records. The list is **memoized and deeply frozen** —
safe to call inside a tab-render callback like `ctx.agents.bindIcon`.
Render an agent's brand mark with the SDK's `AgentIconGlyph`:

```tsx
import { AgentIconGlyph } from "@silo-code/sdk";

const icon = ctx.agents.catalog().find((a) => a.id === "claude")?.icon;

// `mode`: "none" | "color" (brand hex) | "monotone" (inherits currentColor)
<AgentIconGlyph icon={icon} mode="color" colorScheme="dark" />;
```

`AgentIconGlyph` returns `null` when `mode` is `"none"` or `icon` is absent, so
gate any tab chrome on the return value rather than rendering it blind.

Detection stays sealed (ADR 0028) — `catalog()` is read-only, with no way to
register into the list.

### End a session, either kind

`close(id)` closes a Terminal session's terminal tab or a Chat session's
transcript panel — reaping the agent either way — with no branch on `kind`:

```ts
ctx.agents.close(info.id);
```

### Start an agent

This surface observes agents that are already running. To **start** one, use
[`ctx.agents.profiles`](/api/agents/profiles) — the user's own named launch
recipes, which can also carry an opening prompt.

## What you get

| Field                               | Meaning                                                                                                                                                                                                                                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                | Stable Agent Session id — the key `reveal` / `resume` / `acknowledge` / `close` take. Equals `terminalId` for a Terminal session.                                                                                                                                                            |
| `title`                             | The session's display label, host-computed for either kind: the agent's own words (an OSC title, or a Chat `session_info_update`) with status markers stripped, else the user's name, else a fallback. Render this rather than deriving your own.                                            |
| `kind`                              | `terminal` \| `chat` — see [`AgentSessionKind`](/api/types/type-aliases/AgentSessionKind). Same fields for both.                                                                                                                                                                             |
| `workspaceId`                       | The workspace this session belongs to.                                                                                                                                                                                                                                                       |
| `terminalId`                        | The backing terminal record id — present for a Terminal session, absent for a Chat session.                                                                                                                                                                                                  |
| `isAgent`                           | Whether this terminal currently hosts an agent at all (vs. a plain shell). Always `true` for a Chat session.                                                                                                                                                                                 |
| `activity`                          | `none` \| `working` \| `blocked` \| `idle` \| `error` \| `dead`. `blocked` is Chat-only — stalled on a permission question — and paints unconditionally, unlike `needsAttention`. See [`AgentActivity`](/api/types/type-aliases/AgentActivity).                                              |
| `needsAttention` / `attentionSince` | Sticky "finished while you weren't looking" — cleared only by `acknowledge`. `attentionSince` is the ISO timestamp it was set, undefined when nothing is pending.                                                                                                                            |
| `workingSince`                      | ISO timestamp the current `working` phase started; undefined otherwise.                                                                                                                                                                                                                      |
| `stale`                             | A soft, self-clearing "this restored duration might not be trusted" signal — distinct from `activity === "dead"`, which is a hard, confirmed, non-self-resolving fact.                                                                                                                       |
| `sessionId` / `resumeCommand`       | Exact resume when a Settings → Agents hook (or native session file) resolved an id; otherwise an honest session-id-less note. Silo **never** infers an id from cwd/recency.                                                                                                                  |
| `canResume`                         | Whether `resume(id)` will do something. A Terminal session's is `true` only with an exact `sessionId`, and `resume()` is still a no-op for it — run `resumeCommand`. A Chat session's is `true` when the agent advertises `session/resume` or `session/load`.                                |
| `chatResumeState`                   | `kind: "chat"` only — where the session stands in [Chat session resurrection](/api/agents/sessions#resume-—-chat-session-resurrection): `dormant` \| `live` \| `resuming` \| `resumed` \| `journal-only` \| `unavailable`. See [`ChatResumeState`](/api/types/type-aliases/ChatResumeState). |
| `agentId` / `agentName`             | Catalog key + display name once a known agent leader is detected                                                                                                                                                                                                                             |

## See also

- [`AgentsService`](/api/types/interfaces/AgentsService)
- [`AgentInfo`](/api/types/interfaces/AgentInfo)
- [`AgentSessionKind`](/api/types/type-aliases/AgentSessionKind)
- [`AgentActivity`](/api/types/type-aliases/AgentActivity)
- [`CatalogAgentSummary`](/api/types/interfaces/CatalogAgentSummary)
- [`AgentIcon`](/api/types/interfaces/AgentIcon)
- [`AgentIconMode`](/api/types/type-aliases/AgentIconMode)
- [`TabActivityBinder`](/api/types/interfaces/TabActivityBinder) / [`TabIconBinder`](/api/types/interfaces/TabIconBinder)
- [`DockPanelApi.setAgentSession`](/api/registration/register-dock-panel-kind) — how a panel declares the session it is showing
- [`ctx.agents.profiles`](/api/agents/profiles) — start an agent from a user-defined profile
- [Using agents with Silo](/guide/agent-sessions) — install hooks, platform notes
- [Agent system architecture](/roadmap/agent-system)
- ADR 0028 — sealed detection, no cwd inference
