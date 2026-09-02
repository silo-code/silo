# Function: activityFromAgent()

```ts
function activityFromAgent(a): Activity | null;
```

Defined in: [packages/sdk/src/activity.ts:33](https://github.com/silo-code/silo/blob/main/packages/sdk/src/activity.ts#L33)

Map [AgentActivity](../type-aliases/AgentActivity.md) onto UI [Activity](../type-aliases/Activity.md). Returns `null` when there
is nothing to paint (`none` / `dead` — callers may map `dead` → `"error"`
themselves if they want chrome).

## Parameters

### a

[`AgentActivity`](../type-aliases/AgentActivity.md)

## Returns

[`Activity`](../type-aliases/Activity.md) \| `null`
