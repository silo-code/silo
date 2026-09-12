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

### Acknowledge finished runs when the user looks at the terminal

`needsAttention` is separate from `activity === "idle"`. The host never
auto-clears attention on focus — that is a per-consumer policy:

```ts
ctx.subscriptions.push(
  ctx.terminals.subscribeActive((terminalId) => {
    if (terminalId) ctx.agents.acknowledge(terminalId);
  }),
);
```

### Read the agent catalog (icons + display names)

`ctx.agents.catalog()` returns every coding agent Silo knows about as read-only
`CatalogAgentSummary` records. The list is **memoized and deeply frozen** —
safe to call inside a tab-render callback like `ctx.terminals.bindIcon`.
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

### Start an agent

This surface observes agents that are already running. To **start** one, use
[`ctx.agents.profiles`](/api/agents/profiles) — the user's own named launch
recipes, which can also carry an opening prompt.

## What you get

| Field                         | Meaning                                                                                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                          | Stable Agent Session id — the key `reveal` / `resume` / `acknowledge` take. Equals `terminalId` for a Terminal session.                                                     |
| `kind`                        | `terminal` \| `chat` — see [`AgentSessionKind`](/api/types/type-aliases/AgentSessionKind). Same fields for both.                                                            |
| `terminalId`                  | The backing terminal record id — present for a Terminal session, absent for a Chat session.                                                                                 |
| `activity`                    | `none` \| `working` \| `idle` \| `error` \| `dead`                                                                                                                          |
| `needsAttention`              | Sticky "finished while you weren't looking" — cleared only by `acknowledge`                                                                                                 |
| `sessionId` / `resumeCommand` | Exact resume when a Settings → Agents hook (or native session file) resolved an id; otherwise an honest session-id-less note. Silo **never** infers an id from cwd/recency. |
| `canResume`                   | Whether `resume(id)` will do something. A Terminal session's is `true` only with an exact `sessionId`, and `resume()` is still a no-op for it — run `resumeCommand`.        |
| `agentId` / `agentName`       | Catalog key + display name once a known agent leader is detected                                                                                                            |

## See also

- [`AgentsService`](/api/types/interfaces/AgentsService)
- [`AgentInfo`](/api/types/interfaces/AgentInfo)
- [`AgentSessionKind`](/api/types/type-aliases/AgentSessionKind)
- [`AgentActivity`](/api/types/type-aliases/AgentActivity)
- [`CatalogAgentSummary`](/api/types/interfaces/CatalogAgentSummary)
- [`AgentIcon`](/api/types/interfaces/AgentIcon)
- [`AgentIconMode`](/api/types/type-aliases/AgentIconMode)
- [`ctx.agents.profiles`](/api/agents/profiles) — start an agent from a user-defined profile
- [Using agents with Silo](/guide/agent-sessions) — install hooks, platform notes
- [Agent system architecture](/roadmap/agent-system)
- ADR 0028 — sealed detection, no cwd inference
