# Type Alias: AgentPromptBlock

```ts
type AgentPromptBlock = 
  | {
  type: "text";
  text: string;
}
  | {
  type: "resource_link";
  uri: string;
  name?: string;
};
```

Defined in: [packages/sdk/src/agents-service.ts:441](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L441)

**`Beta`**

One block of an outgoing prompt turn for a **Chat session**
([AgentSessionHandle.prompt](../interfaces/AgentSessionHandle.md#prompt)). Structured content, never a shell
string — the entire quoting/escaping risk surface of a Terminal session's
opening prompt (RFC 0033 phase 3) does not exist here.

- `"text"` — a run of plain text. `$HOME`, backticks, quotes and newlines
  are all literal.
- `"resource_link"` — a pointer to a file (or other URI) the agent may read
  if it chooses. `uri` is typically a `file://` path inside the workspace.

Images and embedded binary context are deferred — the agent advertises what
it accepts at connect time, and this union grows behind that.

## Union Members

### Type Literal

```ts
{
  type: "text";
  text: string;
}
```

***

### Type Literal

```ts
{
  type: "resource_link";
  uri: string;
  name?: string;
}
```

#### type

```ts
readonly type: "resource_link";
```

#### uri

```ts
readonly uri: string;
```

#### name?

```ts
readonly optional name?: string;
```

A short display name for the link; defaults to the last path segment.
