# Modal surfaces

An extension can create three kinds of modal UI. They share the same
components and tokens, but each has its own layout conventions, persistence
pattern, and best practices — a settings page built like a standalone modal
(or vice versa) reads as foreign immediately.

## Standalone modals {#standalone-modals}

Opened with [`ctx.ui.showModal`](/api/ui/) — a dialog your extension owns
end to end: pickers, forms, confirmations richer than `ctx.ui.confirm`,
detail views.

<div class="silo-demo">
  <div class="silo-demo-modal" style="max-width:420px;">
    <div class="modal-title">New Group</div>
    <div class="silo-section" style="margin-bottom:4px;">
      <div class="silo-section-header"><span class="silo-section-label">Name</span></div>
      <input class="silo-input silo-input-block" value="Frontend" readonly>
    </div>
    <div class="silo-modal-actions">
      <button class="silo-button">Cancel</button>
      <button class="silo-button-primary">Create</button>
    </div>
  </div>
</div>

**The host provides** the shell: backdrop, the title (pass `title` — never
render your own heading), sizing (`sm` 400px / `md` 560px / `lg` 800px), the
close ✕, Escape handling, the focus trap, and stacking.

**You provide** everything inside, ending in a
[`ModalActions`](/design/components/structure#modalactions) footer.

Rules specific to this surface:

- **Persistence is explicit.** The user edits, then commits or abandons:
  one primary action (rightmost), a neutral Cancel beside it. Wire both to
  the `close` callback `showModal` hands you.
- Set `dismissible: true` only when closing can't lose user input; the
  default (non-dismissible) protects staged edits.
- Pick the smallest `size` that fits; don't design content that needs the
  modal to grow.
- Scrollable middles (long lists) get `.silo-scroll` with a max height, so
  the title and footer stay pinned.

## Settings pages {#settings-pages}

Registered with [`ctx.registerSettingsPage`](/api/registration/register-settings-page)
— your page appears in Silo's Settings modal, alongside the built-in Editor
and Terminal pages.

<div class="silo-demo">
  <div class="sd-frame">
    <div class="sd-rail">
      <div class="sd-rail-label">Settings</div>
      <div class="sd-rail-item">Editor</div>
      <div class="sd-rail-item">Terminal</div>
      <div class="sd-rail-item" data-active="true">My Extension</div>
    </div>
    <div class="sd-pane">
      <div class="modal-title">My Extension</div>
      <div class="silo-section">
        <div class="silo-section-header"><span class="silo-section-label">Behavior</span></div>
        <div>
          <div class="silo-setting-row" style="padding-top:0;">
            <div class="text">
              <div class="row-label">Auto-refresh</div>
              <div class="row-hint">Poll the API in the background.</div>
            </div>
            <div class="control"><button class="silo-switch-track" data-checked="true" aria-label="Auto-refresh"></button></div>
          </div>
          <div class="silo-setting-row">
            <div class="text">
              <div class="row-label">Poll interval</div>
              <div class="row-hint">Minutes between checks.</div>
            </div>
            <div class="control"><input class="silo-number" value="5" readonly></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

**The host provides** the whole Settings chrome: the left rail (your page's
entry appears under Extensions), the page title, scrolling, and search.

**You provide** the page body: [`Section`](/design/components/structure#section)s
of [`SettingRow`](/design/components/structure#settingrow)s.

Rules specific to this surface:

- **Persistence is immediate.** Every control applies the moment it changes —
  there is **no footer, no Save button, no Cancel** on a settings page.
  Persist with [`ctx.storage`](/api/storage/) as the change happens.
- Structure is `Section` → `SettingRow` → one control per row (`Switch`,
  `Select`, a number `Input`, …). Prose-heavy layouts don't belong here.
- Use `RadioGroup`/`RadioCard` when one choice needs a sentence of
  explanation per option.
- Don't build a rail, tabs, or your own page title — the rail is host chrome,
  and pages that need internal grouping use `Tabs` _within_ the page body
  sparingly.

## Workspace property tabs {#workspace-property-tabs}

Registered with [`ctx.workspaces.registerPropertyPage`](/api/state/workspaces#workspace-property-pages)
— your page appears as a tab in the Workspace Properties modal, next to the
built-in General tab, scoped to one workspace.

<div class="silo-demo">
  <div class="silo-demo-modal" style="max-width:460px;">
    <div class="modal-title">Workspace Properties</div>
    <div class="silo-tabs">
      <button class="silo-tab">General</button>
      <button class="silo-tab" data-active="true">GitHub Actions</button>
    </div>
    <div class="silo-tab-panel">
      <div class="silo-setting-row" style="padding-top:0;">
        <div class="text">
          <div class="row-label">Monitor this workspace</div>
          <div class="row-hint">Watch workflow runs for repos in this workspace.</div>
        </div>
        <div class="control"><button class="silo-switch-track" data-checked="true" aria-label="Monitor this workspace"></button></div>
      </div>
    </div>
  </div>
</div>

**The host provides** the modal, the tab strip, and your tab's placement;
your page receives the workspace it's scoped to.

**You provide** the tab body — typically `SettingRow`s and small forms, same
grammar as a settings page.

Rules specific to this surface:

- **Persistence is immediate**, like settings pages — values save as the user
  edits (use workspace-scoped [`ctx.storage.workspace`](/api/storage/)).
  No footer.
- Everything on the tab should be **about this workspace**. Global extension
  settings belong on a settings page; don't duplicate them here.
- Use `visible` to hide the tab for workspaces where it's meaningless
  (e.g. no matching repo), rather than showing an empty tab.
- Don't render your own tab strip — you're _in_ one. If your tab needs
  sub-navigation, it's probably two property pages.

## Choosing, in one line each

- Transient task the user completes and leaves → **standalone modal**.
- How the extension behaves everywhere → **settings page**.
- How the extension behaves _for this workspace_ → **workspace property tab**.
