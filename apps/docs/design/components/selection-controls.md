# Selection controls

Pick the control by what the user is deciding:

| Deciding…                                                                     | Use                        |
| ----------------------------------------------------------------------------- | -------------------------- |
| On or off, applies immediately                                                | `Switch`                   |
| One of a few short values                                                     | `Select`                   |
| An option attached to a nearby action ("Only monitor the checked-out branch") | `CheckboxRow`              |
| One of 2–4 options that each need a sentence of explanation                   | `RadioGroup` + `RadioCard` |

<div class="silo-demo">
  <button class="silo-switch-track" data-checked="true" aria-label="On"></button>
  <button class="silo-switch-track" data-checked="false" aria-label="Off"></button>
  <select class="silo-select"><option>Block</option><option>Bar</option></select>
  <label class="silo-checkbox-row"><input type="checkbox" checked> Only monitor the checked-out branch</label>
</div>

<div class="silo-demo silo-demo-block">
  <div style="max-width:460px;">
    <button class="silo-radio-card" data-selected="true">
      <span class="dot"></span>
      <span><span class="rc-title">Clear the finished indicator</span><span class="rc-desc">Viewing the terminal acknowledges the run — the green check disappears.</span></span>
    </button>
    <button class="silo-radio-card">
      <span class="dot"></span>
      <span><span class="rc-title">Keep it until the next run</span><span class="rc-desc">Viewing changes nothing.</span></span>
    </button>
  </div>
</div>

## Switch

The iOS-style toggle used throughout settings. Off = recessed `bg-active`
track with a hairline border; on = accent fill.

```tsx
<Switch
  checked={formatOnSave}
  onChange={setFormatOnSave}
  aria-label="Format on save"
/>
```

| Prop                   | Type                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `checked` / `onChange` | `boolean` / `(checked: boolean) => void`                                                                |
| `disabled`             | `boolean?`                                                                                              |
| `aria-label`           | `string` — required unless wrapped by a labeled [`SettingRow`](/design/components/structure#settingrow) |

| Color                | Token                                                   |
| -------------------- | ------------------------------------------------------- |
| Track (off) / border | `--silo-color-bg-active` / `--silo-color-border-strong` |
| Track (on)           | `--silo-color-accent`                                   |
| Thumb                | white (deliberate constant, both themes)                |

## Select

A native `<select>` wearing the Input treatment — keep it for short enumerable
values ("Block / Bar / Underline").

```tsx
<Select value={cursorStyle} onChange={(e) => setCursorStyle(e.target.value)}>
  <option value="block">Block</option>
  <option value="bar">Bar</option>
</Select>
```

## CheckboxRow

A labeled checkbox row (15px box, accent check). The whole label is the click
target.

```tsx
<CheckboxRow
  label="Only monitor the checked-out branch"
  checked={onlyCheckedOut}
  onChange={setOnlyCheckedOut}
/>
```

## RadioGroup / RadioCard

Stacked option cards — each a full-width click target with a radio dot, a bold
title, and a dim description. The selected card gets an accent border and a
faint accent tint; unselected cards are borderless.

```tsx
<RadioGroup value={mode} onChange={setMode}>
  <RadioCard
    value="clear"
    title="Clear the finished indicator"
    description="Viewing the terminal acknowledges the run — the green check disappears."
  />
  <RadioCard
    value="keep"
    title="Keep it until the next run"
    description="Viewing changes nothing."
  />
</RadioGroup>
```

Use it when options need explaining; for more than ~4 options or one-word
options, use `Select` instead.

**Keyboard:** every control here is a plain tab stop — no arrow-key roving.
Space/Enter activates the focused control.
