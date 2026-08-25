# Badges

A small pill for status or identity — on a `ListRow`'s trailing slot, in a
`SettingRow`'s control slot, next to a title. Text at chrome−1/600; a
chromatic tone's background is always a derived tint of its text color, never
picked separately. `neutral` has no hue to tint from, so it mixes the button
ink into the page background instead — which lightens on a dark theme and
darkens on a light one without either being hard-coded, so custom themes track
their own palette.

<div class="silo-demo">
  <span class="silo-badge silo-badge-ok">Installed</span>
  <span class="silo-badge silo-badge-warn">Update available</span>
  <span class="silo-badge silo-badge-accent">current</span>
  <span class="silo-badge silo-badge-neutral">primary</span>
  <span class="silo-badge silo-badge-outline">Silo</span>
  <span class="silo-badge silo-badge-custom" style="--badge-color:#e06c75">Frontend</span>
</div>

```tsx
import { Badge } from "@silo-code/sdk";

<Badge tone="ok">Installed</Badge>
<Badge tone="warn">Update available</Badge>
<Badge tone="accent">current</Badge>
<Badge>primary</Badge>                      {/* neutral */}
<Badge tone="outline">Silo</Badge>
<Badge color="#e06c75">Frontend</Badge>     {/* arbitrary identity color */}
```

| Prop    | Type                                                            | Default                                      |
| ------- | --------------------------------------------------------------- | -------------------------------------------- |
| `tone`  | `"neutral" \| "accent" \| "ok" \| "warn" \| "err" \| "outline"` | `"neutral"`                                  |
| `size`  | `"sm" \| "md"`                                                  | `"md"`                                       |
| `color` | `string?`                                                       | overrides `tone` with an arbitrary CSS color |

## Sizes

`md` is the default **text** chip (chrome−1, roomier pad) — status words like
`Installed`. `sm` is the **counter** chip (chrome, `padding: 0 5px`) — section
counts and workspace `+N`. Both pin `--silo-font-size-chrome` (no parent
`em`). Comparing two single digits side-by-side is a bad test: `sm`'s type is
one px larger than `md`, and the real difference is pad + role.

This demo uses **app** chrome scale (`13 / 12 / 11`), not the default
`.silo-demo` modal scale (`14 / 13 / 12`) — otherwise every chip is inflated
vs workspaces.

<div class="silo-demo silo-demo--app-scale">
  <div class="silo-badge-size-context" style="border-top: none; padding-top: 0; margin-top: 0">
    <div class="silo-badge-size-row">
      <span class="silo-badge-size-row-label">md</span>
      <span class="silo-badge silo-badge-ok">Installed</span>
      <span class="silo-badge silo-badge-warn">Update available</span>
      <span class="silo-badge silo-badge-neutral">6</span>
    </div>
    <div class="silo-badge-size-row">
      <span class="silo-badge-size-row-label">sm</span>
      <span class="silo-badge-size-context-path">…/Projects/ai/nt-inbox</span>
      <span class="silo-badge silo-badge-neutral silo-badge-sm">+1</span>
      <span class="silo-badge silo-badge-neutral silo-badge-sm">6</span>
    </div>
  </div>
</div>

```tsx
<Badge tone="ok">Installed</Badge>              {/* md — status text */}
<Badge>6</Badge>                                {/* md — numeric */}
<Badge size="sm">+{extraFolders.length}</Badge> {/* sm — counter */}
```

Reach for `sm` when the chip is _part of_ another line of text, `md` when it
stands alone as a status word.

## Choosing a tone

| Tone      | Means                          | Example                            |
| --------- | ------------------------------ | ---------------------------------- |
| `neutral` | identity/metadata, no judgment | `primary`, a count                 |
| `accent`  | "the current/active one"       | `current` branch, `active` session |
| `ok`      | good state                     | `Installed`, `Authenticated`       |
| `warn`    | needs attention, not broken    | `Update available`, `idle`         |
| `err`     | broken                         | `error`, `failed`                  |
| `outline` | quiet provenance label         | publisher tag                      |

These six are the whole vocabulary — **never invent a new status tint**. If no
tone fits a _status_, that's a design-system conversation. The escape hatch is
for _identity_, not status. For busy/ready process dots, use
[Activity](/design/components/activity) instead of a Badge.

## Arbitrary colors (`color`)

For things that have their own color by nature — a user-chosen workspace-group
color, a language color. The text takes the given color and the background is
derived from it (a ~20% tint), same as the preset tones, so any color you pass
stays coherent with the system.

| Color           | Source                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| Tone text       | the matching design token (`--silo-color-ok`, `--silo-color-warn`, `--silo-color-err`, `--silo-color-accent`) |
| Tone background | derived — `color-mix(tone 18–20%, transparent)`                                                               |
| Neutral         | `--silo-color-button-bg` / `--silo-color-text`                                                                |
| Outline         | `--silo-color-border-strong` border, `--silo-color-text`                                                      |
