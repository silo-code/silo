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

## OSC events

Subscribe to raw OSC (Operating System Command) escape sequences emitted by a
terminal's PTY. Unlike the title that appears on the tab, this fires from the
raw output stream regardless of whether the terminal's panel is mounted —
making it reliable for background workspace monitoring.

Common OSC codes:

| Code  | Meaning                                   |
| ----- | ----------------------------------------- |
| `0`   | Set window/tab title                      |
| `7`   | Working directory (`file://…`)            |
| `9`   | iTerm2 notification (attention, progress) |
| `133` | Shell prompt marker (semantic shell)      |

```ts
const BRAILLE_START = 0x2800;
const BRAILLE_END = 0x28ff;
const IDLE_CHAR = "\u2733"; // ✳ — Claude Code idle/waiting signal

ctx.subscriptions.push(
  ctx.terminals.subscribeOsc(terminalId, ({ code, payload }) => {
    if (code !== 0) return;
    const first = payload.charCodeAt(0);
    if (first >= BRAILLE_START && first <= BRAILLE_END) {
      setStatus(terminalId, "busy"); // agent is running
    } else if (payload.startsWith(IDLE_CHAR)) {
      setStatus(terminalId, "idle"); // agent is waiting for input
    }
  }),
);
```

| Method                                                                                    | What it does                                                                                                                |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [`subscribeOsc(terminalId, handler)`](/api/types/interfaces/TerminalService#subscribeosc) | Subscribe to parsed OSC sequences from a terminal's PTY stream. Returns a [`Disposable`](/api/types/interfaces/Disposable). |

Each event is an [`OscEvent`](/api/types/interfaces/OscEvent).

## Active terminal

Track which terminal tab the user is looking at. "Active" is the center dock's
single active panel of the active workspace — `null` when an editor tab (or
nothing) is active, and transiently during workspace switches before the
incoming workspace's active tab is published. A terminal that is merely visible
in a non-active split does not count.

```ts
// clear a "needs attention" marker once the user views the terminal
ctx.subscriptions.push(
  ctx.terminals.subscribeActive((terminalId) => {
    if (terminalId) attention.delete(terminalId);
  }),
);
```

| Method                                                                               | What it does                                                                                                                                           |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`getActive()`](/api/types/interfaces/TerminalService#getactive)                     | The record id of the active center-dock terminal tab, or `null`.                                                                                       |
| [`subscribeActive(listener)`](/api/types/interfaces/TerminalService#subscribeactive) | Subscribe to active-terminal changes (tab activation, group activation, workspace switch). Returns a [`Disposable`](/api/types/interfaces/Disposable). |

## Types

Pass [`TerminalService`](/api/types/interfaces/TerminalService).

Related: [`CreateTerminalInput`](/api/types/interfaces/CreateTerminalInput) · [`TerminalRecord`](/api/types/interfaces/TerminalRecord) · [`TerminalKind`](/api/types/type-aliases/TerminalKind) · [`TerminalTabDecoration`](/api/types/interfaces/TerminalTabDecoration) · [`TerminalTabDecorationProvider`](/api/types/interfaces/TerminalTabDecorationProvider) · [`OscEvent`](/api/types/interfaces/OscEvent).

## See also

Persistent sessions live on [`ctx.process`](/api/process/). Other
[State](/api/#state) members on `ctx`.
