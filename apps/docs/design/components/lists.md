# Lists

`List`/`ListRow` is the rows-of-selectable-things primitive behind every
picker in Silo — branch switcher, worktrees, workspace folders, the Extensions
page. It stretches to fill its parent, truncates long content instead of
overflowing, and ships its keyboard behavior built in.

<div class="silo-demo silo-demo-block">
  <div style="max-width:420px;">
    <div class="silo-list">
      <div class="silo-list-row" data-selected="true">
        <span class="leading"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 4a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z" stroke="currentColor" stroke-width="1.2"/></svg></span>
        <span class="name">servicetitan-contactcenter</span>
        <span class="silo-badge silo-badge-accent">main</span>
      </div>
      <div class="silo-list-row">
        <span class="leading"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 4a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z" stroke="currentColor" stroke-width="1.2"/></svg></span>
        <span class="name">limit-console-logs-to-kibana</span>
      </div>
      <div class="silo-list-row">
        <span class="leading"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 4a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z" stroke="currentColor" stroke-width="1.2"/></svg></span>
        <span class="name" data-truncate="start">/Users/dweaver/Projects/ai/xerro-agent/projects/xerro-edit</span>
      </div>
    </div>
    <button class="silo-add-row"><span class="plus"><svg width="12" height="12" viewBox="0 0 16 16"><path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>Add Folder…</button>
  </div>
</div>

_(Third row shows `truncate="start"` on a long path; the last row is an
`AddRow`.)_

```tsx
import { List, ListRow, Badge } from "@silo-code/sdk";

<List aria-label="Workspace folders">
  <ListRow
    selected={folder.primary}
    leading={<FolderIcon />}
    trailing={<Badge tone="accent">primary</Badge>}
    onSelect={() => choose(folder)}
  >
    {folder.path}
  </ListRow>
</List>;
```

## List

| Prop         | Type                         | Notes                     |
| ------------ | ---------------------------- | ------------------------- |
| `aria-label` | `string`                     | required — it's a listbox |
| `onActivate` | `((index: number) => void)?` | Enter / double-click      |

## ListRow

| Prop                      | Type               | Notes                                                                         |
| ------------------------- | ------------------ | ----------------------------------------------------------------------------- |
| `selected`                | `boolean?`         | the selected row gets the active fill                                         |
| `leading`                 | `ReactNode?`       | icon slot (dimmed, fixed)                                                     |
| `trailing`                | `ReactNode?`       | badge(s) and/or `IconButton size="sm"`(s) — several are fine side by side     |
| `truncate`                | `"end" \| "start"` | default `"end"`. Use `"start"` for paths, where the filename end matters most |
| `onSelect` / `onActivate` | `(() => void)?`    | click / Enter-or-double-click                                                 |

## Layout behavior — guaranteed, don't fight it

- The list and its rows are **full-width**: they fill the parent and never
  push past its edge, however long the content. Row text truncates with an
  ellipsis; `trailing` content (badges, icon buttons) never shrinks or gets
  pushed offscreen.
- `truncate="start"` ellipsizes the _front_ (`…agent/projects/xerro-edit`) —
  the right choice for file paths.
- When a row's content is genuinely likely to truncate, wrap it in
  [`Tooltip`](/design/components/feedback#tooltip) with `disabled={!isTruncated}` so a hover
  reveals the full value — see the pattern in
  [`Tooltip`'s docs](/api/other/tooltip#example).

## Keyboard — built in, one tab stop

The whole list is a single tab stop. Once focused: **↑/↓** move a focus ring
row to row, **Space/Enter** selects the focused row, and focus survives the
re-render a selection triggers — a user can Space → arrow → Space indefinitely
without the list dropping focus. Don't attach your own key handlers to rows.

## AddRow

The ghost "＋ Add Folder…" action that sits flush under a list — visually a
row, semantically a button. No fill at rest, `bg-hover` on hover, pressed
feedback like every other button.

```tsx
<List aria-label="Folders">…</List>
<AddRow onClick={addFolder}>Add Folder…</AddRow>
```

| Color                     | Token                                            |
| ------------------------- | ------------------------------------------------ |
| Row hover / selected fill | `--silo-list-hover-bg` / `--silo-list-active-bg` |
| Row text / leading icon   | `--silo-color-text-hi` / `--silo-color-text-lo`  |
| Focus ring                | `--silo-color-accent`                            |

Filter-above-list (the picker pattern) is a composition with
[`SearchInput`](/design/components/text-inputs#searchinput) — see
[Building modals](/guide/building-modals#recipe-a-picker-modal).
