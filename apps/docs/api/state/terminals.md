# ctx.terminals

Open and manage terminal tabs through `TerminalService`. The terminal is a core
feature — a built-in DockKind like the editor — so this mirrors
[`ctx.editors`](/api/editors/): `create` opens a terminal in a workspace, and
`closeWorkspace` reaps a workspace's terminals. The tab renders from the
workspace's terminal records; the PTY session lives on
[`ctx.process`](/api/process/).

```ts
ctx.terminals: TerminalService
```

## Example

```tsx
// open a shell terminal in the active workspace, rooted at a folder
ctx.terminals.create({ cwd: "/path/to/project" });

// open a specific kind in a specific workspace
ctx.terminals.create({ kind: "claude", workspaceId });
```

## Methods

On [`ctx.terminals`](/api/types/interfaces/TerminalService). Method names link to
the full signature.

| Method                                                                       | What it does                                                                         |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [`create(input?)`](/api/types/interfaces/TerminalService#create)             | Open a new terminal in a workspace (defaults to the active one). Returns its record. |
| [`closeWorkspace(id)`](/api/types/interfaces/TerminalService#closeworkspace) | Close and kill every terminal in a workspace (e.g. on workspace delete).             |

## Types

Pass [`TerminalService`](/api/types/interfaces/TerminalService).

Related: [`CreateTerminalInput`](/api/types/interfaces/CreateTerminalInput) · [`TerminalRecord`](/api/types/interfaces/TerminalRecord) · [`TerminalKind`](/api/types/type-aliases/TerminalKind).

## See also

Persistent sessions live on [`ctx.process`](/api/process/). Other
[State](/api/#state) members on `ctx`.
