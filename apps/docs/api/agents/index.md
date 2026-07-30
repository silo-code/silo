# ctx.agents <Badge type="warning" text="beta" />

Host-computed coding-agent activity and resume-identity observability — a
live, read-only view of what each terminal's agent is doing, plus an honest
resume hint when a session's backend dies uncleanly. The companion to
[`ctx.processes`](/api/processes/) (foreground process facts); this surface
is for _agent_ activity and resume identity. Detection is sealed in the host
— there is no `registerAgent` / detector API.

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

## What you get

| Field                         | Meaning                                                                                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activity`                    | `none` \| `working` \| `idle` \| `error` \| `dead`                                                                                                                          |
| `needsAttention`              | Sticky "finished while you weren't looking" — cleared only by `acknowledge`                                                                                                 |
| `sessionId` / `resumeCommand` | Exact resume when a Settings → Agents hook (or native session file) resolved an id; otherwise an honest session-id-less note. Silo **never** infers an id from cwd/recency. |
| `agentId` / `agentName`       | Catalog key + display name once a known agent leader is detected                                                                                                            |

## See also

- [`AgentsService`](/api/types/interfaces/AgentsService)
- [`AgentInfo`](/api/types/interfaces/AgentInfo)
- [`AgentActivity`](/api/types/type-aliases/AgentActivity)
- [Using agents with Silo](/guide/agent-sessions) — install hooks, platform notes
- [Agent system architecture](/roadmap/agent-system)
- ADR 0028 — sealed detection, no cwd inference
