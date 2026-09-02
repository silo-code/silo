# Activity

Host-owned activity dots — the same language as workspace status rows and
CenterDock tabs. Use [`ActivityGlyph`](/api/types/functions/ActivityGlyph) in
your own panel / modal content when you want that signal; use
[`setActivity` / `bindActivity`](/api/state/tab-adornments#activity-host-owned)
(or workspace status `activity`) when pinning it onto Silo chrome.

Extensions pick a **kind** only. Color and motion are fixed per kind (pinned
light/dark palette — not `--silo-color-*` theme accents). Never invent a
spinner or recolor the glyph.

<div class="silo-demo" style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
  <span style="display:inline-flex;align-items:center;gap:8px;">
    <span class="silo-activity silo-activity-working silo-activity-md"></span>
    <span>working</span>
  </span>
  <span style="display:inline-flex;align-items:center;gap:8px;">
    <span class="silo-activity silo-activity-ready silo-activity-md"></span>
    <span>ready</span>
  </span>
  <span style="display:inline-flex;align-items:center;gap:8px;">
    <span class="silo-activity silo-activity-warn silo-activity-md"></span>
    <span>warn</span>
  </span>
  <span style="display:inline-flex;align-items:center;gap:8px;">
    <span class="silo-activity silo-activity-error silo-activity-md"></span>
    <span>error</span>
  </span>
  <span style="display:inline-flex;align-items:center;gap:8px;">
    <span class="silo-activity silo-activity-none silo-activity-md"></span>
    <span>omit (neutral)</span>
  </span>
</div>

```tsx
import { ActivityGlyph, type Activity } from "@silo-code/sdk";

<ActivityGlyph activity="working" size="md" />
<ActivityGlyph activity="ready" />
<ActivityGlyph activity="warn" />
<ActivityGlyph activity="error" />
<ActivityGlyph size="sm" />  // omit activity → gray neutral
```

| Prop       | Type                                         | Default | Notes                                                                                                                                                                                                                            |
| ---------- | -------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activity` | `"working" \| "ready" \| "warn" \| "error"`? | —       | Omit only for the gray neutral fallback                                                                                                                                                                                          |
| `size`     | `"sm" \| "md"`                               | `"sm"`  | `sm` (8px at default) is the workbench size — workspace status rows and tabs; `md` (10px) is for a list that leads with the dot. Both track `uiFontSize` — a proportion of the base size rounded to an even pixel, not fixed px. |

## Kinds

| Kind      | Means                         | Look                                                                          |
| --------- | ----------------------------- | ----------------------------------------------------------------------------- |
| `working` | In progress                   | Blue dot + expanding rings                                                    |
| `ready`   | Available / waiting for input | Green subtle throb                                                            |
| `warn`    | Needs caution                 | Amber static                                                                  |
| `error`   | Failed                        | Red static                                                                    |
| _(omit)_  | Neutral / unconfirmed         | Gray static — workspace status rows only; in panels prefer omitting the glyph |

These four are the whole vocabulary — **never invent a fifth activity tint**.
For text pills (Installed, Update available), use [`Badge`](/design/components/badges)
instead.

## vs Badge

|             | Activity              | Badge                              |
| ----------- | --------------------- | ---------------------------------- |
| Shape       | Dot (+ motion)        | Text pill                          |
| Color       | Host-fixed per kind   | Tone or arbitrary identity `color` |
| Typical use | Process / agent state | Labels, counts, provenance         |

## Projecting agent state

```tsx
import { ActivityGlyph, activityFromAgent } from "@silo-code/sdk";

const activity = activityFromAgent(agent.activity); // null for none / dead
{
  activity && <ActivityGlyph activity={activity} size="sm" />;
}
```

| `AgentActivity` | UI `Activity` |
| --------------- | ------------- |
| `working`       | `working`     |
| `idle`          | `ready`       |
| `error`         | `error`       |
| `none` / `dead` | no glyph      |

## See also

- [Tab adornments](/api/state/tab-adornments) — `setActivity` / `bindActivity` on editor & terminal tabs
- [`ctx.workspaces` status](/api/state/workspaces#workspace-status) — `activity` on status rows
- [ADR 0030](https://github.com/silo-code/silo/blob/main/docs/decisions/0030-activity-chrome.md)
