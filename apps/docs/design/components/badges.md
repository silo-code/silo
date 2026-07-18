# Badges

A small pill for status or identity — on a `ListRow`'s trailing slot, in a
`SettingRow`'s control slot, next to a title. Text at chrome−1/600; the
background is always a derived tint of the text color, never picked
separately.

<div class="silo-demo">
  <span class="silo-badge silo-badge-neutral">primary</span>
  <span class="silo-badge silo-badge-accent">current</span>
  <span class="silo-badge silo-badge-ok">Installed</span>
  <span class="silo-badge silo-badge-warn">Update available</span>
  <span class="silo-badge silo-badge-err">error</span>
  <span class="silo-badge silo-badge-outline">Silo</span>
  <span style="width:14px"></span>
  <span class="silo-badge silo-badge-custom" style="--badge-color:#e06c75">Frontend</span>
  <span class="silo-badge silo-badge-custom" style="--badge-color:#61afef">Backend</span>
  <span class="silo-badge silo-badge-custom" style="--badge-color:#98c379">Infra</span>
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
| `color` | `string?`                                                       | overrides `tone` with an arbitrary CSS color |

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
for _identity_, not status:

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
