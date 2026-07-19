# Typography

Every named text role in Silo's UI — modal content today, the full set as
more surfaces adopt the design system. Sizes are relative to the app's base
font size
(`--silo-font-size-base`, default 13px, user-scalable with `Cmd/Ctrl +/-`).
**Modal content rides a +1 scale**: the host rebinds the size tokens inside a
modal, so "base" below already means base+1px (14px at defaults). You inherit
this — never compensate for it, and never set a px font size.

Every role at once, in a composite modal:

<div class="silo-demo">
  <div class="silo-demo-modal">
    <div class="modal-title">Workspace Properties</div>
    <div class="modal-body-text">Changes save automatically as you type — there's no separate Save step for these fields.</div>
    <div class="silo-section" style="margin-bottom:14px;">
      <div class="silo-section-header"><span class="silo-section-label">Folders</span></div>
      <div class="silo-list">
        <div class="silo-list-row" data-selected="true">
          <span class="leading"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 4a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z" stroke="currentColor" stroke-width="1.2"/></svg></span>
          <span class="name">/Users/dweaver/Projects/ai/xerro-agent/projects/xerro-edit</span>
          <span class="silo-badge silo-badge-neutral">primary</span>
        </div>
      </div>
      <button class="silo-add-row"><span class="plus"><svg width="12" height="12" viewBox="0 0 16 16"><path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>Add Folder…</button>
    </div>
    <div class="silo-setting-row" style="border-top:1px solid var(--silo-color-border-strong); padding-top:10px;">
      <div class="text">
        <div class="row-label">Auto-save</div>
        <div class="row-hint">Save this workspace's layout as you work, not just on close.</div>
      </div>
      <div class="control"><button class="silo-switch-track" data-checked="true" aria-label="Auto-save"></button></div>
    </div>
    <div class="silo-modal-actions">
      <span class="silo-modal-actions-start">Silo Development</span>
      <button class="silo-button">Cancel</button>
      <button class="silo-button-primary">Save</button>
    </div>
  </div>
</div>

| Role                                  | Rendered by                      | Size                               | Weight | Color token            |
| ------------------------------------- | -------------------------------- | ---------------------------------- | ------ | ---------------------- |
| **Title**                             | the modal shell (`title` option) | base+2                             | 600    | `--silo-color-text-hi` |
| **Body**                              | your prose / `Callout`           | sm                                 | 400    | `--silo-color-text`    |
| **Section label** (`NAME`, `FOLDERS`) | `Section`                        | chrome−1, UPPERCASE, letter-spaced | 400    | `--silo-color-text-lo` |
| **Setting label**                     | `SettingRow`                     | base                               | 400    | `--silo-color-text-hi` |
| **Setting hint**                      | `SettingRow`                     | sm                                 | 400    | `--silo-color-text-lo` |
| **List row text**                     | `ListRow`                        | sm                                 | 400    | `--silo-color-text-hi` |
| **Badge text**                        | `Badge`                          | chrome−1                           | 600    | tone color             |
| **Footer meta**                       | `ModalActions` `start` slot      | sm                                 | 400    | `--silo-color-text-lo` |
| **Button text**                       | `Button`                         | base (sm buttons: chrome)          | 400    | variant text token     |
| **Inline error**                      | `InlineEdit`                     | sm                                 | 400    | `--silo-color-err`     |

Where `sm` = base−1 and `chrome` = base−2, both derived tokens
(`--silo-font-size-sm`, `--silo-font-size-chrome`).

## The rules

- **600 is the only "bold."** Titles, badges, and active states use weight
  600; everything else is 400. There is no 500 or 700 in modal content.
- **Titles outrank by size.** The title is the single largest text in a modal
  (base+2). Nothing in your content should match or exceed it.
- **Hierarchy comes from color as much as size.** `text-hi` → `text` →
  `text-lo` is the emphasis ladder; two roles at the same size are still
  distinct if their colors differ.
- **Uppercase is reserved** for Section labels (and the host's rail header) —
  don't uppercase anything else.
- If a piece of text doesn't fit any role above, you're probably building
  something the kit should provide — check [the inventory](/design/#the-component-inventory)
  or raise it, rather than improvising a style.
