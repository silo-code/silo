# Interface: LaunchAgentProfileOptions

Defined in: [packages/sdk/src/agents-service.ts:386](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L386)

**`Beta`**

Options for [AgentProfilesService.launch](AgentProfilesService.md#launch). Every field is optional —
a bare `launch()` starts the default profile in the active workspace.

## Properties

### profileId?

```ts
optional profileId?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:389](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L389)

**`Beta`**

Which profile to start. Defaults to the one marked default, else the
 first — the same profile the built-in "New Agent" command uses.

***

### workspaceId?

```ts
optional workspaceId?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:393](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L393)

**`Beta`**

Which workspace to start it in. Defaults to the active one. A
 background workspace works: the session is spawned eagerly, since no
 panel will mount to do it.

***

### cwd?

```ts
optional cwd?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:395](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L395)

**`Beta`**

Working directory for the new terminal. Defaults to the workspace folder.

***

### prompt?

```ts
optional prompt?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:413](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L413)

**`Beta`**

An opening prompt to hand the agent on its launch line.

The text is delivered as a literal — it is never interpreted by the
shell, so `$HOME`, backticks, quotes, and newlines are all safe. If Silo
cannot deliver it exactly, the launch is **refused** rather than mangled
or silently dropped: nothing is typed, no terminal is created, and
`launch()` returns the reason.

Keep it to an opening instruction. The limit is **2 KiB** — about a page —
and anything longer is refused with `"too-large"`; see that member for
why the ceiling is where it is.

The composed line is typed into the user's own interactive shell, so it
appears in scrollback and in shell history exactly as if they had typed
it. Don't put a secret in one.

***

### activate?

```ts
optional activate?: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:418](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L418)

**`Beta`**

Activate the target workspace and focus the new terminal. Defaults to
`true`. Pass `false` to start an agent without stealing the user's place.
