# Feedback

Two components for "there's nothing to show" and "here's what this means."
Neither is an alert box.

<div class="silo-demo">
  <div class="silo-empty-state">
    <div class="icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3 3 7-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
    <div class="title">All workflows passing</div>
    <div class="desc">No failures or active runs on this repo.</div>
  </div>
  <div class="silo-empty-state" style="border-left:1px solid var(--silo-color-border-strong);">
    <div class="icon neutral"><svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.4"/><path d="M11 11l3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></div>
    <div class="title">No matching branches</div>
    <div class="desc">Try a different filter.</div>
  </div>
</div>

<div class="silo-demo silo-demo-block">
  <div class="silo-callout" style="max-width:520px;">
    Opening a worktree adds it as another folder in this workspace — its files,
    terminals, and Git panel appear alongside your current ones. Closing a view
    leaves the worktree untouched on disk.
  </div>
</div>

## EmptyState

The big-icon + title + dim-description block a modal shows when a list is
empty or everything is fine ("All workflows passing"). It renders flat in the
modal body — no card, no shadow of its own.

```tsx
import { EmptyState } from "@silo-code/sdk";

<EmptyState
  tone="ok"
  icon={<CheckIcon />}
  title="All workflows passing"
  description="No failures or active runs on this repo."
/>

<EmptyState
  icon={<SearchIcon />}
  title="No matching branches"
  description="Try a different filter."
/>
```

| Prop          | Type                | Default     | Notes                                                         |
| ------------- | ------------------- | ----------- | ------------------------------------------------------------- |
| `tone`        | `"ok" \| "neutral"` | `"neutral"` | colors the circled icon; `ok` = green ring for positive-empty |
| `icon`        | `ReactNode?`        |             | rendered inside the ring                                      |
| `title`       | `string`            | —           | base/600/`text-hi`                                            |
| `description` | `string?`           |             | sm/`text-lo`                                                  |
| `action`      | `ReactNode?`        |             | e.g. a `Button` ("Clear filter")                              |

Use the `neutral` tone for "nothing matched"; `ok` for "empty because
everything is good." A _failure_ state is not an EmptyState tone — show the
error content itself.

## Callout

A quiet set-off box for explanatory copy — a hairline border around body text,
no fill, no tone. The canonical case: the Worktrees modal's closing paragraph
explaining what opening a worktree does.

```tsx
import { Callout } from "@silo-code/sdk";

<Callout>
  Opening a worktree adds it as another folder in this workspace — its files,
  terminals, and Git panel appear alongside your current ones. Closing a view
  leaves the worktree untouched on disk.
</Callout>;
```

No props beyond `children` — that's the point. **A Callout is not a warning,
error, or info-alert box** (there is deliberately no `tone`): status belongs
to [`Badge`](/design/components/badges) tones and
[`EmptyState`](#emptystate). If you're tempted to make a Callout yellow,
you're building the wrong thing.

| Color  | Token                               |
| ------ | ----------------------------------- |
| Border | `--silo-color-border-strong`        |
| Text   | `--silo-color-text` (sm, body role) |
