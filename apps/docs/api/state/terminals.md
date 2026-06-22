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

| Method                                                                       | What it does                                                                                                      |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [`create(input?)`](/api/types/interfaces/TerminalService#create)             | Open a new terminal in a workspace (defaults to the active one). Returns its record.                              |
| [`closeWorkspace(id)`](/api/types/interfaces/TerminalService#closeworkspace) | Close and kill every terminal in a workspace (e.g. on workspace delete).                                          |
| [`focus(terminalId)`](/api/types/interfaces/TerminalService#focus)           | Switch to the workspace containing this terminal and activate its tab in the center dock. No-ops for unknown ids. |

## Tab decoration

Extensions can attach a small icon badge — with an optional tooltip and semantic
color — to terminal tabs. The first registered provider that returns a non-null
decoration for a given terminal wins; subsequent providers are not consulted.

```ts
ctx.subscriptions.push(
  ctx.terminals.registerTabDecoration({
    id: "my-ext.tab",
    provide(terminalId) {
      const status = getStatus(terminalId);
      if (!status) return null;
      return { icon: <StatusIcon />, color: "accent", tooltip: "Working" };
    },
  }),
);

// after your data changes, trigger a re-render:
ctx.terminals.invalidateTabDecorations();
```

| Method                                                                                               | What it does                                                                                                                             |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [`registerTabDecoration(provider)`](/api/types/interfaces/TerminalService#registertabdecoration)     | Register a decoration provider. First non-null result across providers wins. Returns a [`Disposable`](/api/types/interfaces/Disposable). |
| [`getTabDecoration(terminalId)`](/api/types/interfaces/TerminalService#gettabdecoration)             | Get the winning decoration for a terminal (null if none apply).                                                                          |
| [`invalidateTabDecorations()`](/api/types/interfaces/TerminalService#invalidatetabdecorations)       | Signal that decoration data changed — triggers a tab re-render.                                                                          |
| [`subscribeTabDecorations(listener)`](/api/types/interfaces/TerminalService#subscribetabdecorations) | Subscribe to decoration invalidations. Returns a [`Disposable`](/api/types/interfaces/Disposable).                                       |

Each decoration is a [`TerminalTabDecoration`](/api/types/interfaces/TerminalTabDecoration).

## Types

Pass [`TerminalService`](/api/types/interfaces/TerminalService).

Related: [`CreateTerminalInput`](/api/types/interfaces/CreateTerminalInput) · [`TerminalRecord`](/api/types/interfaces/TerminalRecord) · [`TerminalKind`](/api/types/type-aliases/TerminalKind) · [`TerminalTabDecoration`](/api/types/interfaces/TerminalTabDecoration) · [`TerminalTabDecorationProvider`](/api/types/interfaces/TerminalTabDecorationProvider).

## See also

Persistent sessions live on [`ctx.process`](/api/process/). Other
[State](/api/#state) members on `ctx`.
