# Type Alias: LaunchAgentProfileResult

```ts
type LaunchAgentProfileResult = 
  | {
  ok: true;
  terminalId: string;
}
  | {
  ok: false;
  refusal: PromptRefusal | "no-profile" | "no-workspace";
};
```

Defined in: [packages/sdk/src/agents-service.ts:290](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L290)

**`Beta`**

What [AgentProfilesService.launch](../interfaces/AgentProfilesService.md#launch) did. A **result**, never a throw:
every foreseeable reason a launch cannot happen is a value you can branch
on and report to your own user.

## Union Members

### Type Literal

```ts
{
  ok: true;
  terminalId: string;
}
```

#### ok

```ts
readonly ok: true;
```

#### terminalId

```ts
readonly terminalId: string;
```

The created terminal's record id — the same id
 [AgentsService.getByTerminalId](../interfaces/AgentsService.md#getbyterminalid) and `ctx.terminals` take.

***

### Type Literal

```ts
{
  ok: false;
  refusal: PromptRefusal | "no-profile" | "no-workspace";
}
```

#### ok

```ts
readonly ok: false;
```

#### refusal

```ts
readonly refusal: PromptRefusal | "no-profile" | "no-workspace";
```

Why nothing was launched. `"no-profile"` — the named profile does
 not exist, or there are no profiles at all. `"no-workspace"` — the
 named workspace does not exist, or none is open. Otherwise one of the
 [PromptRefusal](PromptRefusal.md) reasons.
