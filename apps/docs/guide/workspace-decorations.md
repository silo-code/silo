# Workspace decorations, sections, and badges

The Workspaces panel is extensible. Three independent APIs let you add
information to any workspace row — without reaching into the host's internals.

| API             | Where it appears           | What you provide                                          |
| --------------- | -------------------------- | --------------------------------------------------------- |
| **Decorations** | Below the path line        | Status rows with a dot, label, and optional elapsed time  |
| **Sections**    | Below decorations          | Arbitrary React component, mounted once per workspace row |
| **Badges**      | Next to the workspace name | Short inline text labels with an optional color           |

All three APIs are on [`ctx.workspaces`](/api/state/workspaces) and follow the
same provider pattern: register a provider, call an invalidate method when your
data changes, and the panel re-renders.

## Decorations

Decorations add status rows below the path line. Each row has a semantic dot
(`ok`, `warn`, `busy`, `error`), a short label, and an optional `startedAt`
timestamp rendered as elapsed time ("6h", "2d", "just now").

Use decorations for running background tasks, agent sessions, long-running
processes, or any status that has a natural age.

```ts
import type { WorkspaceDecorationProvider } from "@silo-code/sdk";

function activate(ctx) {
  const provider: WorkspaceDecorationProvider = {
    id: "my-ext.decoration",
    provide(workspaceId) {
      const tasks = getRunningTasks(workspaceId);
      return tasks.map((t) => ({
        id: t.id,
        status: "busy",
        label: t.name,
        startedAt: t.startedAt, // ISO timestamp
      }));
    },
  };

  ctx.subscriptions.push(
    ctx.workspaces.registerDecoration(provider),
    // re-render whenever your underlying data changes
    myTaskStore.onChange(() => ctx.workspaces.invalidateDecorations()),
  );
}
```

**How invalidation works.** The panel doesn't poll — it waits for
`invalidateDecorations()`. Call it after any mutation to the state your
`provide` function reads. `subscribeDecorations` lets you observe invalidations
from outside the panel if you need to coordinate.

**Performance.** `provide` is called synchronously during render for every
visible workspace. Keep it fast and side-effect-free — read from an in-memory
store, not from disk or the network.

## Sections

Sections mount a React component inside each workspace row, below the path line
and any decoration rows. The component receives the workspace id and can render
anything — interactive cards, agent status, call indicators, etc.

Return `null` for workspaces where the section should not appear. This produces
no DOM node and no visual gap.

```tsx
import type {
  WorkspaceSectionProvider,
  WorkspaceSectionProps,
} from "@silo-code/sdk";

function TerminalSummary({ workspaceId }: WorkspaceSectionProps) {
  const ws = ctx.workspaces.get(workspaceId);
  if (!ws?.terminals.length) return null;
  return (
    <div className="my-ext-summary">
      {ws.terminals.length} terminal{ws.terminals.length !== 1 ? "s" : ""}
    </div>
  );
}

function activate(ctx) {
  const provider: WorkspaceSectionProvider = {
    id: "my-ext.section",
    component: TerminalSummary,
    order: 0, // lower = higher in the stack; default 0
  };

  ctx.subscriptions.push(ctx.workspaces.registerSection(provider));
}
```

**Stacking order.** Multiple extensions can each register a section. They stack
vertically in ascending `order`. Within one extension, use distinct order values
to control which of your own sections appears first.

**Styling.** Your component lives in the same document as the host. Scope all
selectors to your own root class and style only against `--silo-*` design
tokens — see [Styling your extension](/guide/styling).

## Badges

Badges appear inline next to the workspace name, before the workspace's other
header controls. Use them for short, high-salience labels: environment names,
mode flags, CI state, agent status.

Each badge has a `text` field and an optional `color` (any CSS color). When
`color` is omitted the badge uses the muted text color (`--silo-color-text-lo`).

```ts
import type { WorkspaceBadgeProvider } from "@silo-code/sdk";

function activate(ctx) {
  const provider: WorkspaceBadgeProvider = {
    id: "my-ext.badges",
    provide(workspaceId) {
      const env = getEnvironment(workspaceId);
      if (!env) return [];
      return [{ id: "env", text: env.label, color: env.color }];
    },
  };

  ctx.subscriptions.push(
    ctx.workspaces.registerBadge(provider),
    myEnvStore.onChange(() => ctx.workspaces.invalidateBadges()),
  );
}
```

Multiple providers are concatenated in registration order. Keep badge text
short — the host does not truncate badge text, so long labels will expand the
row.

## Choosing the right API

| Scenario                                                   | Use                               |
| ---------------------------------------------------------- | --------------------------------- |
| "Is a task running? What is it called?"                    | Decoration — semantic dot + label |
| "How long has this agent been running?"                    | Decoration with `startedAt`       |
| "Show a call card with mute/hold controls"                 | Section — full React component    |
| "Show agent-state details with action buttons"             | Section                           |
| "Label this workspace with its environment (prod/staging)" | Badge                             |
| "Flag this workspace as read-only"                         | Badge                             |

Decorations and badges are read-only — they show state, they don't take input.
Sections can be fully interactive.

## See also

- [`ctx.workspaces`](/api/state/workspaces) — full method reference
- [`WorkspaceDecorationProvider`](/api/types/interfaces/WorkspaceDecorationProvider) · [`WorkspaceStatusRow`](/api/types/interfaces/WorkspaceStatusRow)
- [`WorkspaceSectionProvider`](/api/types/interfaces/WorkspaceSectionProvider) · [`WorkspaceSectionProps`](/api/types/interfaces/WorkspaceSectionProps)
- [`WorkspaceBadgeProvider`](/api/types/interfaces/WorkspaceBadgeProvider) · [`WorkspaceBadge`](/api/types/interfaces/WorkspaceBadge)
- [Styling your extension](/guide/styling) — design tokens and scoping rules
