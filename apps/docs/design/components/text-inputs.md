# Text inputs

One input treatment across the whole app: `--silo-color-input-bg` background,
6×8px padding, small radius, the shared focus ring. Four components cover the
text-entry patterns modals use.

<div class="silo-demo silo-demo-block">
  <div style="display:flex; flex-direction:column; gap:12px; max-width:360px;">
    <input class="silo-input" value="Silo Development" readonly>
    <div class="silo-search-input"><svg class="icon" width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5.2" stroke="currentColor" stroke-width="1.4"/><path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg><input value="web" readonly><span class="clear"><svg width="12" height="12" viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span></div>
    <textarea class="silo-textarea" readonly>Working the webphone reliability fixes. Kibana access via the staging VPN only.</textarea>
  </div>
</div>

## Input

```tsx
import { Input } from "@silo-code/sdk";

<Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workspace name" />
<Input block />  {/* width: 100% */}
```

| Prop    | Type                            | Default | Notes                          |
| ------- | ------------------------------- | ------- | ------------------------------ |
| `block` | `boolean`                       | `false` | stretch to the container width |
| …rest   | `React.ComponentProps<"input">` |         | controlled like any input      |

## Textarea

Same tokens as `Input`, plus comfortable line-height, vertical resize, and a
sensible minimum height.

```tsx
<Textarea
  value={notes}
  onChange={(e) => setNotes(e.target.value)}
  placeholder="Notes…"
/>
```

## SearchInput

The filter-as-you-type field: leading search icon, and a clear ✕ that appears
once there's a value. Pair it with a [`List`](/design/components/lists) for
the standard picker pattern (there's no combined component on purpose — the
composition is four lines; see [Building modals](/guide/building-modals)).

```tsx
<SearchInput
  value={query}
  onValueChange={setQuery}
  placeholder="Filter branches…"
/>
```

| Prop                      | Type                             | Notes                     |
| ------------------------- | -------------------------------- | ------------------------- |
| `value` / `onValueChange` | `string` / `(v: string) => void` | controlled value          |
| `placeholder`             | `string?`                        |                           |
| `autoFocus`               | `boolean?`                       | pickers usually want this |
| `onClear`                 | `(() => void)?`                  | extra hook when ✕ clears  |

## InlineEdit

Click-to-edit a value in place — a static display with a pencil affordance
that swaps to a field with explicit **✓ Save / ✗ Cancel** buttons. Use it for
values where committing an empty/invalid value would be visibly broken
elsewhere (the canonical case: the workspace name, which renders in tabs, the
sidebar, and the window title) — everything else in a modal should save as you
type instead.

<div class="silo-demo silo-demo-block">
  <div style="max-width:360px; display:flex; flex-direction:column; gap:18px;">
    <div class="silo-inline-edit">
      <div class="silo-section-header"><span class="silo-section-label">Name — display mode</span></div>
      <div class="sie-display">
        <span class="sie-text">Silo Development</span>
        <span class="silo-icon-button silo-icon-button-sm"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11.1 2.4a1.4 1.4 0 0 1 2 2L5.5 12l-2.8.8.8-2.8 7.6-7.6z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg></span>
      </div>
    </div>
    <div class="silo-inline-edit">
      <div class="silo-section-header"><span class="silo-section-label">Name — edit mode</span></div>
      <div class="sie-edit-row">
        <input class="silo-input" value="Silo Development" readonly>
        <span class="silo-icon-button silo-icon-button-sm"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3 3 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        <span class="silo-icon-button silo-icon-button-sm"><svg width="13" height="13" viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>
      </div>
      <span class="sie-error">Name is required.</span>
    </div>
  </div>
</div>

```tsx
<InlineEdit
  value={ws.name}
  onSave={(name) => ctx.workspaces.rename(ws.id, name)}
  validate={validateWorkspaceName}   // optional — invalid ⇒ inline error, no save
  aria-label="Rename workspace"
/>

<InlineEdit multiline value={description} onSave={setDescription} aria-label="Edit description" />
```

| Prop         | Type                                                                            | Notes                                                             |
| ------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `value`      | `string`                                                                        | the committed value                                               |
| `onSave`     | `(value: string) => void`                                                       | called with the trimmed, validated value; not called if unchanged |
| `validate`   | `((v: string) => { ok: true; value: string } \| { ok: false; error: string })?` | failure shows the error inline and blocks the save                |
| `multiline`  | `boolean?`                                                                      | textarea-based editing                                            |
| `aria-label` | `string`                                                                        | required                                                          |

**Keyboard** (built in): entering edit focuses and selects the field. Enter
saves — except in `multiline`, where plain Enter is a newline and
**⌘/Ctrl+Enter** saves. **Escape is two-stage**: the first Esc cancels the
edit; the next Esc closes the modal (the host coordinates this — don't add
your own Escape handling).

| Color                            | Token                                                                       |
| -------------------------------- | --------------------------------------------------------------------------- |
| Field background / text / border | `--silo-color-input-bg` / `--silo-color-input-text` / `--silo-color-border` |
| Display value                    | `--silo-color-text-hi`                                                      |
| Inline error                     | `--silo-color-err`                                                          |
| Pencil / ✓ / ✗                   | stock [`IconButton size="sm"`](/design/components/buttons#iconbutton)       |
