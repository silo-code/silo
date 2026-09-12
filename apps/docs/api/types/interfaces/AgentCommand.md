# Interface: AgentCommand

Defined in: [packages/sdk/src/agents-service.ts:952](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L952)

**`Beta`**

One command the agent advertises (Agent Client Protocol
`available_commands_update`, RFC 0040). **Skills arrive in this list too**
— the protocol has no separate skills concept, and the two agents probed
mark them differently: pi prefixes the name (`skill:code-review`), Claude
does not mark them at all outside a `(user)` / `(project)` suffix in
[description](#description)'s prose. Splitting them back out would mean
vendor-sniffing a label neither agent is contractually bound to keep, so
this surface deliberately does not try.

## Properties

### name

```ts
readonly name: string;
```

Defined in: [packages/sdk/src/agents-service.ts:955](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L955)

**`Beta`**

What to send after `/` to invoke it — `prompt([{ type: "text", text:
 "/" + name }])`. There is no separate invocation method.

***

### description?

```ts
readonly optional description?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:957](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L957)

**`Beta`**

One-line summary for a palette row.

***

### input?

```ts
readonly optional input?: object;
```

Defined in: [packages/sdk/src/agents-service.ts:964](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L964)

**`Beta`**

Present when the command takes a free-text argument; `hint` is the
agent's own placeholder, when it gave one. Absent means the command takes
none — normalised at the host boundary, since Claude sends `input: null`
where pi omits the key entirely; this type only ever sees one spelling.

#### hint?

```ts
readonly optional hint?: string;
```
