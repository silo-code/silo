# Keyboard navigation in a panel

We'll build a **Task list** side panel — a search box, an arrowable list of
tasks, and a button to add one — and make the whole thing keyboard-navigable.
It's a realistic panel (and a good basis for an example extension), and it shows
the part that matters: how a navigable list **composes** with the other focusable
controls around it.

## The model: who owns what

Keyboard focus in Silo splits cleanly in two, and **you only own half**:

- **The host gets focus _into_ your panel.** Clicking the dock background,
  `Cmd+Alt+.` / `Cmd+Alt+,` region cycling, and Tab-ing in from another region all
  target your panel's first _tabbable_ element. You don't write any of that.
- **You own navigation _within_ your panel** — which arrow keys do what, what
  Enter activates, what the context-menu key opens. This differs between a list,
  a tree, and a form, so it stays yours.

`useFocusGroup` is the headless hook that makes the list part a few lines and gets
the fiddly bits right (one tab stop, a keyboard-only focus ring that paints
correctly in the app's WebView, the context-menu key).

## When do you need this hook?

Reach for `useFocusGroup` when you have a **group of equivalent items that should
act as one tab stop** and move with the arrow keys — the pattern behind:

- lists / listboxes (vertical),
- toolbars and button groups (horizontal),
- menus, tablists, radio groups,
- 2-D grids (`orientation: "grid"`) like a file or emoji picker.

**Don't** use it for controls that are naturally their own tab stops — a search
field, a few standalone buttons, the fields of a form. Those are ordinary
focusable elements; plain Tab moves between them and the host already handles
getting focus in and out. In this very panel, the **search box and _+ Add task_
button use nothing special** — only the task list, a group of peers, uses the hook.

> **Rule of thumb:** many interchangeable items navigated with arrows → the hook.
> A handful of distinct controls navigated with Tab → leave them as normal elements.

Two edges: a **tree** uses the same core (one tab stop, ↑/↓, Home/End) but layers
its own ArrowRight/Left expand-collapse on top; **editors and terminals** (Monaco,
xterm) own their internal keyboarding entirely and aren't focus groups.

## What you get for free

| Behavior                                                                     | Who handles it                 |
| ---------------------------------------------------------------------------- | ------------------------------ |
| Click the dock background → focus your panel                                 | Host                           |
| `Cmd+Alt+.` / `Cmd+Alt+,` into your panel                                    | Host                           |
| Tab in from another region; Tab back out to the next region                  | Host                           |
| Focus ring that shows for keyboard, not mouse                                | Hook (host ships the ring CSS) |
| ↑/↓, Home/End between list items                                             | Hook                           |
| Enter/Space to activate, Menu key for a per-row context menu                 | Hook → your callbacks          |
| One tab stop for the whole list (Tab moves _past_ it, not through every row) | Hook                           |

## The panel

The **highlighted lines are the only keyboarding-specific code** — everything else
is an ordinary panel:

```tsx{2,32-46,58,66,75,83}
import { useMemo, useState } from "react";
import { useFocusGroup } from "@silo-code/sdk";
import type { ExtensionContext } from "@silo-code/sdk";
import "./TaskListPanel.css";

interface Task {
  id: string;
  title: string;
  done: boolean;
}

export function TaskListPanel({ ctx }: { ctx: ExtensionContext }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [query, setQuery] = useState("");

  const visible = useMemo(
    () =>
      tasks.filter((t) => t.title.toLowerCase().includes(query.trim().toLowerCase())),
    [tasks, query],
  );

  function addTask() {
    const title = query.trim();
    if (!title) return;
    setTasks((ts) => [...ts, { id: crypto.randomUUID(), title, done: false }]);
    setQuery("");
  }
  const toggle = (id: string) =>
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const remove = (id: string) => setTasks((ts) => ts.filter((t) => t.id !== id));

  const group = useFocusGroup({
    count: visible.length,
    orientation: "vertical", // ↑/↓ navigate; Home/End jump to the ends
    wrap: true,
    onActivate: (i) => toggle(visible[i].id), // Enter / Space toggles done
    onMenu: (i, anchor) =>
      void ctx.ui.showMenu({
        anchor,
        toggle: false,
        items: [
          { label: visible[i].done ? "Mark not done" : "Mark done", run: () => toggle(visible[i].id) },
          { label: "Delete", danger: true, run: () => remove(visible[i].id) },
        ],
      }),
  });

  return (
    <div className="panel-body tasks-body">
      <input
        className="tasks-search"
        type="search"
        placeholder="Search or add a task…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") addTask();
          else if (e.key === "ArrowDown" && visible.length) group.focusItem(0);
        }}
      />

      <ul
        className="tasks-list"
        role="listbox"
        aria-label="Tasks"
        {...group.containerProps}
      >
        {visible.map((task, i) => (
          <li
            key={task.id}
            role="option"
            aria-selected={task.done}
            className={`task-item${task.done ? " done" : ""}`}
            onClick={() => toggle(task.id)}
            {...group.getItemProps(i)}
          >
            <span className="task-check" aria-hidden="true">
              {task.done ? "✓" : ""}
            </span>
            <span className="task-title">{task.title}</span>
            <button
              className="task-remove"
              tabIndex={-1}
              title="Delete task"
              onClick={(e) => {
                e.stopPropagation();
                remove(task.id);
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <button className="tasks-add" type="button" onClick={addTask}>
        + Add task
      </button>
    </div>
  );
}
```

Compared to doing it by hand, the highlighted lines replace: `tabIndex`
bookkeeping that makes the list one tab stop, `onFocus`/`onBlur`/`onKeyDown`
wiring, the arrow/Home/End index math, context-menu-key detection, and — the easy
one to miss — the state-driven focus ring the WebView needs (a plain `:focus` rule
silently won't paint for the programmatic focus the region cycle performs).

## How focus flows through the panel

The panel has **three** tab stops, in DOM order:

```
search box  →  task list (one stop)  →  + Add task  →  (out to the next region)
```

- **Tab in / click / region cycle** lands on the **first tabbable — the search
  box** — so you arrive ready to filter or add. Type and the list filters live;
  press **Enter** to add the typed text as a task; press **↓** to drop into the
  list.
- **Tab** from the search box moves to the **list**, which is a _single_ stop:
  ↑/↓ move the highlighted row, Enter toggles it, the Menu key opens its context
  menu. Tab again moves **past** the list (not through every row) to **+ Add
  task**.
- **Tab** from the add button leaves the panel for the next region (e.g. the
  editor) — the host handles that handoff.

::: tip Steering the entry point
By default the host focuses your first tabbable (here, the search box). If a panel
would rather _start_ in the list, mark its entry element with the standard
`autofocus` attribute and the host honors it as the entry hint — e.g. the
workspaces panel starts on the selected row that way.
:::

### What the spreads do

- **`group.containerProps`** — marks the list as the focus group and tracks
  whether focus is inside it (for the keyboard-only ring). Spread on the element
  wrapping the rows.
- **`group.getItemProps(i)`** — per row: the `tabIndex` that keeps the list a
  single tab stop, the key handler, focus tracking, and a `data-focus-visible`
  marker the host's CSS styles into a ring. It also syncs the highlight when you
  click a row.
- **`group.activeIndex`** / **`group.focusItem(i)`** — the current index, and an
  imperative move (used above so **↓** in the search box jumps into the list).

The hook clamps its index when `count` changes, so live-filtering the list is
safe. You still bring the **semantics** — `role`, `aria-selected`, your `onClick` —
because those differ per widget; the hook owns _behavior_, not your markup.

## Styling

You do **not** style the focus ring — the host ships it, keyed on the marker the
hook sets, so every panel's keyboard ring is identical and theme-correct:

```css
/* Provided by the host — shown for reference, you don't write this. The hook
   marks every item with data-focus-item (the host resets the native outline on
   it) and flags the active one with data-focus-visible while focus is
   keyboard-driven: */
[data-focus-item] {
  outline: none;
}
[data-focus-item][data-focus-visible] {
  outline: 1.5px solid var(--silo-color-accent);
  outline-offset: -1.5px;
}
```

Everything else is ordinary [design-token](/api/theming) CSS:

```css
.tasks-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
}

.tasks-search {
  background: var(--silo-color-button-bg);
  border: 1px solid var(--silo-color-border);
  border-radius: var(--silo-radius-sm);
  color: var(--silo-color-text-hi);
  font: inherit;
  padding: 5px 8px;
}
.tasks-search:focus {
  outline: none;
  border-color: var(--silo-color-accent);
}

.tasks-list {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
  overflow-y: auto;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: var(--silo-radius-sm);
  cursor: pointer;
}
.task-item:hover {
  background: var(--silo-color-bg-hover);
}
.task-item.done .task-title {
  color: var(--silo-color-text-lo);
  text-decoration: line-through;
}
.task-check {
  width: 14px;
  color: var(--silo-color-accent);
}
.task-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Per-row delete: hidden until hover, and out of the tab order (see below). */
.task-remove {
  border: none;
  background: transparent;
  color: var(--silo-color-text-lo);
  cursor: pointer;
  opacity: 0;
}
.task-item:hover .task-remove {
  opacity: 1;
}

.tasks-add {
  align-self: flex-start;
  background: transparent;
  border: 1px dashed var(--silo-color-border);
  border-radius: var(--silo-radius-sm);
  color: var(--silo-color-text);
  cursor: pointer;
  padding: 5px 10px;
}
.tasks-add:hover {
  background: var(--silo-color-bg-hover);
  border-color: transparent;
}
```

## Secondary controls inside a row

The per-row delete button has `tabIndex={-1}`, keeping it **out** of the tab
order — so Tab goes from the list straight to **+ Add task**, not through every
row's delete button. It stays clickable, and keyboard users reach it through the
row's context menu (the Menu key → **Delete**). The same rule applies to any
inline row control.

## Skipping non-navigable rows

If your list mixes interactive rows with separators, headers, or disabled rows,
tell the hook which indices to skip with `isNavigable`; arrows, Home/End, and the
entry point all hop over them:

```tsx
const group = useFocusGroup({
  count: rows.length,
  isNavigable: (i) => rows[i].type === "task" && !rows[i].archived,
  onActivate: (i) => toggle(rows[i].id),
});
```

(This is the same machinery that backs the app's menus, so a menu and a list use
one implementation.)

## Wiring it up as an extension

The panel is a normal side-panel contribution — nothing about it changes between a
built-in and a published extension:

```tsx
import type { Extension } from "@silo-code/sdk";
import { TaskListPanel } from "./TaskListPanel";

export const extension: Extension = {
  id: "example.tasks",
  activate(ctx) {
    ctx.registerSidePanel({
      id: "tasks",
      location: "left",
      title: "Tasks",
      component: () => <TaskListPanel ctx={ctx} />,
      order: 5,
    });
  },
};
```

A real extension would persist tasks (e.g. via `ctx.storage`) instead of local
`useState`, but the keyboard behavior is identical either way.

## The `useFocusGroup` API

```ts
interface FocusGroupOptions {
  /** Number of items. */
  count: number;
  /** Index focus enters on within the group. Default 0. */
  start?: number;
  /** Arrow-key axis. Default "vertical". */
  orientation?: "vertical" | "horizontal" | "grid";
  /** Wrap at the ends (default true) vs. stop. */
  wrap?: boolean;
  /** Which indices accept focus; others are skipped. Default: all. */
  isNavigable?: (index: number) => boolean;
  /** Enter / Space on an item. */
  onActivate?: (index: number) => void;
  /** Context-menu key / Shift+F10 on an item; `anchor` is the item element. */
  onMenu?: (index: number, anchor: HTMLElement) => void;
}

interface FocusGroup {
  /** Spread on the group container. */
  containerProps: FocusGroupContainerProps;
  /** Spread on item `index`. */
  getItemProps(index: number): FocusGroupItemProps;
  /** The item that currently holds (or would receive) focus. */
  activeIndex: number;
  /** Imperatively move focus to an item (e.g. ↓ from a search box). */
  focusItem(index: number): void;
}
```

See the [`useFocusGroup` reference](/api/other/use-focus-group) for the full
type links.

## See also

- [Your first extension](/guide/getting-started) — the registration basics this
  builds on (`ctx.registerSidePanel`).
- [Styling your extension](/guide/styling) and [Design tokens](/api/theming) —
  the token rules your CSS must follow.
- RFC 0012 (this hook + the focus-region model) for the architecture behind it.
