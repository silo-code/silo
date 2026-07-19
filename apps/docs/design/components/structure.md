# Structure

The pieces that give a modal its skeleton: grouped settings, footers, and
scroll areas. (The modal _shell_ — title, backdrop, sizing, close — comes from
[`ctx.ui.showModal`](/api/ui/) and is not yours to build.)

<div class="silo-demo silo-demo-block">
  <div class="silo-section" style="max-width:520px;">
    <div class="silo-section-header"><span class="silo-section-label">Formatting</span></div>
    <div>
      <div class="silo-setting-row" style="padding-top:0;">
        <div class="text">
          <div class="row-label">Format on save</div>
          <div class="row-hint">Run Format Document before writing to disk.</div>
        </div>
        <div class="control"><button class="silo-switch-track" data-checked="true" aria-label="Format on save"></button></div>
      </div>
      <div class="silo-setting-row">
        <div class="text">
          <div class="row-label">Tab size</div>
          <div class="row-hint">Spaces per indentation level.</div>
        </div>
        <div class="control"><input class="silo-number" value="2" readonly></div>
      </div>
      <div class="silo-setting-row">
        <div class="text">
          <div class="row-label">GitHub CLI status</div>
          <div class="row-hint">Authentication is detected from the gh CLI.</div>
        </div>
        <div class="control"><span class="status-ok"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3 3 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Authenticated</span></div>
      </div>
    </div>
  </div>
</div>

## Section

A labeled group — the uppercase `NAME` / `FOLDERS` / `FORMATTING` headers seen
throughout Silo's modals and settings pages.

```tsx
import { Section, SettingRow, Switch } from "@silo-code/sdk";

<Section label="Formatting">
  <SettingRow
    label="Format on save"
    hint="Run Format Document before writing to disk."
  >
    <Switch
      checked={formatOnSave}
      onChange={setFormatOnSave}
      aria-label="Format on save"
    />
  </SettingRow>
</Section>;
```

| Prop        | Type         | Notes                                                  |
| ----------- | ------------ | ------------------------------------------------------ |
| `label`     | `string`     | rendered uppercase, letter-spaced, chrome−1, `text-lo` |
| `accessory` | `ReactNode?` | right-aligned — a count badge, an add affordance       |

## SettingRow

The label + hint + control row every settings surface uses: title and dim
description on the left, the control pinned right. Rows in a group are
separated by hairline dividers.

| Prop     | Type        | Notes                                                                               |
| -------- | ----------- | ----------------------------------------------------------------------------------- |
| `label`  | `string`    | base / `text-hi`                                                                    |
| `hint`   | `string?`   | sm / `text-lo`, wraps under the label                                               |
| children | `ReactNode` | the control — `Switch`, `Select`, `Input`, a number field, or a small status recipe |

::: tip Inline status is a recipe, not a component
The "✓ Authenticated" pattern is an icon + `--silo-color-ok` text dropped into
a SettingRow's control slot — deliberately not its own component.
:::

## ModalActions

The footer: actions right-aligned, with an optional `start` slot pinned left
for meta text or a secondary action. Every modal footer is a `ModalActions` —
never hand-roll a flex footer.

<div class="silo-demo silo-demo-block">
  <div class="silo-demo-modal" style="max-width:420px; margin-bottom:14px;">
    <div class="modal-title">Group Properties</div>
    <input class="silo-input silo-input-block" value="Frontend" readonly>
    <div class="silo-modal-actions">
      <button class="silo-button">Cancel</button>
      <button class="silo-button-primary">Create</button>
    </div>
  </div>
  <div class="silo-demo-modal" style="max-width:520px;">
    <div class="modal-title">Processes — All Workspaces</div>
    <div class="silo-modal-actions">
      <span class="silo-modal-actions-start">6 sessions · 6 procs</span>
      <button class="silo-button">Go to Terminal</button>
      <button class="silo-button-danger">End Task</button>
    </div>
  </div>
</div>

```tsx
// standard form footer
<ModalActions>
  <Button onClick={close}>Cancel</Button>
  <Button variant="primary" onClick={save}>Create</Button>
</ModalActions>

// with the start slot (meta text…)
<ModalActions start="6 sessions · 6 procs">
  <Button>Go to Terminal</Button>
  <Button variant="danger">End Task</Button>
</ModalActions>

// …or a secondary action
<ModalActions start={<Button size="sm" onClick={create}>+ Create branch</Button>}>
  <Button onClick={fetch}>Fetch</Button>
</ModalActions>
```

Ordering rule: the primary action is rightmost; neutral actions sit to its
left; `start` holds anything that belongs to the modal rather than to
confirming/cancelling it.

## Scroll areas (`.silo-scroll`)

Any scrollable region inside a modal gets the `silo-scroll` class — an 8px
overlay-style scrollbar with a transparent track and a pill thumb derived from
the theme's text color (28% opacity, 45% on hover), so it stays visible in
every theme. Never style scrollbars yourself.

<div class="silo-demo silo-demo-block">
  <div class="silo-scroll" style="max-height:150px; max-width:380px;">
    <div class="silo-list">
      <div class="silo-list-row" data-selected="true"><span class="name">master</span><span class="silo-badge silo-badge-accent">current</span></div>
      <div class="silo-list-row"><span class="name">feat/workspace-status-badges</span></div>
      <div class="silo-list-row"><span class="name">fix/terminal-scrollback-restore</span></div>
      <div class="silo-list-row"><span class="name">fix/windows-caption-color</span></div>
      <div class="silo-list-row"><span class="name">feat/context-menu-contributions</span></div>
      <div class="silo-list-row"><span class="name">chore/upgrade-esbuild-0-21</span></div>
      <div class="silo-list-row"><span class="name">fix/double-focus-ring-inputs</span></div>
      <div class="silo-list-row"><span class="name">feat/registry-install-channel</span></div>
    </div>
  </div>
</div>

```tsx
<div className="silo-scroll" style={{ maxHeight: 300 }}>
  <List aria-label="Branches">…</List>
</div>
```
