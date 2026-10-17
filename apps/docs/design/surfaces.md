# Surfaces

Every place an extension can put UI, and the rules specific to each — a
settings page built like a standalone modal (or vice versa) reads as foreign
immediately, so know which surface you're building for before you pick
components.

## Modals

An extension can create three kinds of modal UI. They share the same
components and tokens, but each has its own layout conventions, persistence
pattern, and best practices.

### Standalone modals {#standalone-modals}

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

### Settings pages {#settings-pages}

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

### Workspace property tabs {#workspace-property-tabs}

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

### Choosing between the three, in one line each

- Transient task the user completes and leaves → **standalone modal**.
- How the extension behaves everywhere → **settings page**.
- How the extension behaves _for this workspace_ → **workspace property tab**.

## Navigator {#navigator}

Registered with [`ctx.registerNavigatorView`](/api/registration/register-navigator-view)
— your view appears in the Navigator's view list, alongside the built-in
**Workspaces** view and (if installed) **Agents**, **Tasks**, and other
first-party views.

A Navigator panel is three stacked layers, top to bottom, and it's worth
knowing which you're touching before you build:

1. **The view list** — every registered view, one row each, always on screen.
   Entirely host chrome.
2. **The view header** — the active view's title (or nothing, in the compact
   "list" layout) plus your [header actions](#header-actions). Host-drawn
   bar; you populate it, you don't paint it.
3. **The view body** — everything below the header. 100% yours; see
   [What a view owns](/api/registration/register-navigator-view#what-a-view-owns).

Most of a view's body is a flat or grouped list of navigable rows, so that's
what this guide covers in depth: [section headers](#section-headers) for
grouping, [row anatomy](#row-anatomy) for the rows themselves, and
[header actions](#header-actions) for the toolbar cluster. None of it is
mandatory chrome — a view that isn't a list (a chart, a form) owns its body
just as completely — but match it when you _are_ building a list, so the
Navigator reads as one surface instead of a different one per installed view.

The leading icon varies row to row below on purpose — it's whatever identifies
_that row's own content_ (a session, a file, a flagged tab), not a fixed glyph
tied to the row shape itself. Don't read any one of these as "the" row icon.

<div class="silo-demo">
<div class="sd-nav-list">
  <div class="sd-nav-section-title">
    <span>silo-extensions</span>
    <span class="silo-badge silo-badge-neutral silo-badge-sm sd-nav-section-count">1</span>
  </div>
  <div class="sd-nav-row">
    <div class="sd-nav-row-text">
      <div class="sd-nav-row-title-line">
        <svg class="sd-nav-row-icon" viewBox="0 0 256 256" fill="currentColor"><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM92.8,145.6a8,8,0,1,1-9.6,12.8l-32-24a8,8,0,0,1,0-12.8l32-24a8,8,0,0,1,9.6,12.8L69.33,128Zm58.89-71.4-32,112a8,8,0,1,1-15.38-4.4l32-112a8,8,0,0,1,15.38,4.4Zm53.11,60.2-32,24a8,8,0,0,1-9.6-12.8L186.67,128,163.2,110.4a8,8,0,1,1,9.6-12.8l32,24a8,8,0,0,1,0,12.8Z"/></svg>
        <span class="sd-nav-row-title">Generic types file editing</span>
      </div>
      <div class="sd-nav-row-subtitle">
        <span>Idle · 36m</span>
      </div>
    </div>
    <span class="sd-nav-row-dot" data-tone="idle"></span>
  </div>
  <div class="sd-nav-section-title">
    <svg class="sd-nav-section-caret" data-expanded="true" viewBox="0 0 256 256" fill="currentColor"><path d="M184.49,136.49l-80,80a12,12,0,0,1-17-17L159,128,87.51,56.49a12,12,0,1,1,17-17l80,80A12,12,0,0,1,184.49,136.49Z"/></svg>
    <span>4+ hours old</span>
    <span class="silo-badge silo-badge-neutral silo-badge-sm sd-nav-section-count">3</span>
  </div>
  <div class="sd-nav-row" data-active="true">
    <div class="sd-nav-row-text">
      <div class="sd-nav-row-title-line">
        <svg class="sd-nav-row-icon" viewBox="0 0 256 256" fill="currentColor"><path d="M232,64a32,32,0,1,0-40,31v17a8,8,0,0,1-8,8H96a23.84,23.84,0,0,0-8,1.38V95a32,32,0,1,0-16,0v66a32,32,0,1,0,16,0V144a8,8,0,0,1,8-8h88a24,24,0,0,0,24-24V95A32.06,32.06,0,0,0,232,64ZM64,64A16,16,0,1,1,80,80,16,16,0,0,1,64,64ZM96,192a16,16,0,1,1-16-16A16,16,0,0,1,96,192Z"/></svg>
        <span class="sd-nav-row-title">Bugfix worktree</span>
      </div>
      <div class="sd-nav-row-subtitle">
        <svg class="sd-nav-row-ws-icon" viewBox="0 0 256 256" fill="currentColor"><path d="M120,56v48a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V56A16,16,0,0,1,56,40h48A16,16,0,0,1,120,56Zm80-16H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Zm-96,96H56a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,104,136Zm96,0H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,200,136Z"/></svg>
        <span>chalk</span>
        <span>·</span>
        <span>9d</span>
      </div>
    </div>
    <span class="sd-nav-row-dot" data-tone="active"></span>
  </div>
  <div class="sd-nav-row">
    <div class="sd-nav-row-text">
      <div class="sd-nav-row-title-line">
        <svg class="sd-nav-row-icon" viewBox="0 0 256 256" fill="currentColor"><path d="M208,144a15.78,15.78,0,0,1-10.42,14.94L146,178l-19,51.62a15.92,15.92,0,0,1-29.88,0L78,178l-51.62-19a15.92,15.92,0,0,1,0-29.88L78,110l19-51.62a15.92,15.92,0,0,1,29.88,0L146,110l51.62,19A15.78,15.78,0,0,1,208,144ZM152,48h16V64a8,8,0,0,0,16,0V48h16a8,8,0,0,0,0-16H184V16a8,8,0,0,0-16,0V32H152a8,8,0,0,0,0,16Zm88,32h-8V72a8,8,0,0,0-16,0v8h-8a8,8,0,0,0,0,16h8v8a8,8,0,0,0,16,0V96h8a8,8,0,0,0,0-16Z"/></svg>
        <span class="sd-nav-row-title">Untitled</span>
      </div>
      <div class="sd-nav-row-subtitle">
        <svg class="sd-nav-row-ws-icon" viewBox="0 0 256 256" fill="currentColor"><path d="M120,56v48a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V56A16,16,0,0,1,56,40h48A16,16,0,0,1,120,56Zm80-16H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Zm-96,96H56a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,104,136Zm96,0H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,200,136Z"/></svg>
        <span>Silo Dev</span>
        <span>·</span>
        <span>16h</span>
      </div>
    </div>
    <span class="sd-nav-row-dot" data-tone="idle"></span>
  </div>
  <div class="sd-nav-row">
    <div class="sd-nav-row-text">
      <div class="sd-nav-row-title-line">
        <svg class="sd-nav-row-icon" viewBox="0 0 256 256" fill="currentColor"><path d="M232,56V176a8,8,0,0,1-2.76,6c-15.28,13.23-29.89,18-43.82,18-18.91,0-36.57-8.74-53-16.85C105.87,170,82.79,158.61,56,179.77V224a8,8,0,0,1-16,0V56a8,8,0,0,1,2.77-6h0c36-31.18,68.31-15.21,96.79-1.12C167,62.46,190.79,74.2,218.76,50A8,8,0,0,1,232,56Z"/></svg>
        <span class="sd-nav-row-title">Flaky test investigation</span>
      </div>
      <div class="sd-nav-row-subtitle">
        <svg class="sd-nav-row-ws-icon" viewBox="0 0 256 256" fill="currentColor"><path d="M120,56v48a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V56A16,16,0,0,1,56,40h48A16,16,0,0,1,120,56Zm80-16H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Zm-96,96H56a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,104,136Zm96,0H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,200,136Z"/></svg>
        <span>paseo</span>
        <span>·</span>
        <span>2d</span>
      </div>
      <div class="sd-nav-row-note">waiting on CI to confirm the fix before closing this out</div>
    </div>
    <span class="sd-nav-row-dot" data-tone="idle"></span>
  </div>
</div>
</div>

**The host provides** the view list and the view header bar (title + toolbar
slot) described above.

**You provide** everything inside the panel body — there is no shared row,
section, drag-reorder, or context-menu machinery to inherit. Each view
(including the built-in ones) renders its own rows and headings from scratch;
see [What a view owns](/api/registration/register-navigator-view#what-a-view-owns).

::: warning Interim — row values, not a row component
The row shape documented below is transcribed from the Agents panel's own CSS
(`packages/extensions-silo/src/agents/styles.css`) so a view listing
navigable rows — the common case — doesn't have to reverse-engineer pixel
values from a screenshot. It is **not yet a public class or component**:
there's no `silo-nav-row` you can drop onto a `<div>` the way `silo-section`
works for modals, so copying these values freezes today's look rather than
riding Silo's automatic restyle lane (see
[the two-lane contract](/design/#the-two-lane-update-contract)). Promoting it
to a real kit component is tracked as
[silo-code/silo#632](https://github.com/silo-code/silo/issues/632) — check
there before assuming this is still open. The **section heading** pattern
right below it is _not_ interim — it's already the shared, canonical
treatment across every first-party view (git-explorer, skills-manager,
`silo.tasks`, Agents), not one view's private choice.
:::

### Section headers {#section-headers}

Group rows under an uppercase, chrome-tier heading — `SILO-EXTENSIONS`,
`4+ HOURS OLD` in the preview above — exactly like a file explorer's section
or a settings page's `Section`. This one _is_ safe to copy directly: it's the
same markup/token recipe every first-party Navigator view already converged
on independently.

`--silo-font-size-chrome` is relative to the app's base font size
(`uiFontSize`, default **13px**), not a fixed number — `base - 2px`, so
**11px** by default. The one place this is easy to get wrong: inside a modal,
`--silo-font-size-base` is itself bumped by 1px for the modal's own content
scale, which makes `--silo-font-size-chrome` resolve to 12px there instead.
A Navigator view is never inside a modal, so if you're spot-checking the
resolved pixel value against a modal screenshot or another doc's modal demo,
you're comparing against the wrong scope.

| Part                      | Value                                                                                                                                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heading row               | `display: flex; align-items: center; gap: 4px; padding: 4px 12px;`                                                                                                                                                    |
| Label                     | `font-size: var(--silo-font-size-chrome); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--silo-color-text-lo);` — resolves to 11px by default (see above), not scaled with the pane |
| Collapse caret (optional) | A rotating `CaretRight` (`size="0.7em" weight="bold"`), `transform: rotate(90deg)` when expanded — not a `CaretDown`/`CaretRight` swap                                                                                |
| Count (optional)          | `<Badge size="sm">` pushed to the trailing edge with `margin-left: auto`, so counts line up down the panel's right edge across every section                                                                          |
| Section spacing           | `20px` margin between consecutive sections; no heading row at all when a view has exactly one (unlabeled) group — an "Agents" heading on the one-and-only group would just restate the view's own title               |

```tsx
<div className="my-section">
  <div
    className={
      collapsible
        ? "my-section-title my-section-title-clickable"
        : "my-section-title"
    }
    onClick={collapsible ? onToggle : undefined}
  >
    {collapsible && (
      <CaretRight
        size="0.7em"
        weight="bold"
        className={expanded ? "my-section-caret expanded" : "my-section-caret"}
      />
    )}
    {header}
    <Badge size="sm" className="my-section-count">
      {rows.length}
    </Badge>
  </div>
  {expanded && rows.map((row) => <MyRow key={row.id} {...row} />)}
</div>
```

```css
.my-section + .my-section {
  margin-top: 20px;
}
.my-section-title {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  font-size: var(--silo-font-size-chrome);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--silo-color-text-lo);
}
.my-section-title-clickable {
  cursor: pointer;
}
.my-section-caret {
  flex-shrink: 0;
  transition: transform 0.1s ease-out;
}
.my-section-caret.expanded {
  transform: rotate(90deg);
}
.my-section-count {
  margin-left: auto;
}
```

### Row anatomy {#row-anatomy}

A navigable row (one clickable "go here" item — a workspace, an agent
session, a flagged tab) follows a two-line shape: a leading icon, a title
line, and a muted subtitle line carrying secondary context. Values below are
the Agents panel's; the built-in Workspaces view uses the same chassis (inset
margin, radius, hover/active fill) with slightly different padding and icon
sizing (`8px 10px` padding, a `22px` icon column vs. the Agents panel's
`7px 12px` / `16px`) — close enough to read as one family, not yet reconciled
to one shared value. Until that reconciliation ships as a real component,
match the Agents panel's numbers below; they're the more recently settled of
the two.

Row text isn't pinned to a fixed size either — it inherits the Navigator's
side-panel font scale (`uiFontSize` base, default 13px, **+2px = 15px** by
default), so the title/subtitle sizes below track the user's font-size
setting rather than a number you hardcode. Only the section heading above is
pinned absolute (11px, independent of `uiFontSize`) — that asymmetry, chrome
fixed while content scales, is what keeps a heading reading as chrome no
matter how large someone's set their font.

| Part                                         | Value                                                                                                                                                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Row chassis                                  | `display: flex; align-items: center; gap: 9px; padding: 7px 12px; margin: 0 4px 2px; border-radius: var(--silo-radius-sm);`                                                                                                                                   |
| Hover fill                                   | `background: var(--silo-color-bg-hover)`                                                                                                                                                                                                                      |
| Active/selected fill                         | `background: var(--silo-color-bg-active)`                                                                                                                                                                                                                     |
| Text block                                   | `display: flex; flex-direction: column; flex: 1; min-width: 0;` — the title line and subtitle line are both full-width rows _inside_ this column, which is what puts them on the same left edge (see below), not a separate indent per line                   |
| Title line                                   | `display: flex; align-items: center; gap: 4px;` — the leading icon is its **first child**, not a sibling of the text block                                                                                                                                    |
| Leading identity icon                        | `16×16px`, `color: var(--silo-color-text)` — lives inside the title line, flush with the row's own left edge                                                                                                                                                  |
| Title text                                   | `color: var(--silo-color-text-hi)`, single line, `text-overflow: ellipsis`                                                                                                                                                                                    |
| Subtitle line                                | `display: flex; align-items: center; gap: 4px;`, `color: var(--silo-color-text-lo)` — a second full-width row in the same text-block column, so its own first child lands on **the same left edge as the title-line icon**, not indented under the title text |
| Subtitle icon                                | `12×12px`, `opacity: 0.75`, inherits `currentColor` from the subtitle line — shown only when the subtitle needs one for context (the workspace mark is the common case; omit it otherwise, don't pad with a blank icon)                                       |
| Subtitle meta text (separator, elapsed time) | `font-size: calc(1em - 1px)`, `color: var(--silo-color-text-lo)` — one step below the pane's base size, not the absolute `--silo-font-size-sm` token                                                                                                          |
| Trailing content (status dot, badge)         | Order **after** the text block (`flex: 1` on the text block pushes trailing content to the row's far edge)                                                                                                                                                    |

**The leading icon and the subtitle icon are deliberately different sizes —
16px vs. 12px, not the same icon reused at one size.** This is the single
easiest detail to lose copying this pattern: set each one's size explicitly
in CSS (below), never via a relative prop like `size="1em"` on the icon
component itself — relative sizing on the subtitle icon is what actually
produced an oversized workspace mark the one time this went wrong, and a
`size` prop with no matching CSS rule is what let a leading icon default to
whatever Phosphor's own fallback size is instead of 16px.

```tsx
<div className="my-row" onClick={onOpen}>
  <div className="my-row-text">
    <div className="my-row-title-line">
      <SessionIcon className="my-row-icon" />
      <span className="my-row-title">{title}</span>
    </div>
    {workspaceName && (
      <div className="my-row-subtitle">
        <SquaresFour className="my-row-ws-icon" weight="fill" />
        <span>{workspaceName}</span>
        <span>·</span>
        <span>{elapsed}</span>
      </div>
    )}
    {!workspaceName && (
      <div className="my-row-subtitle">
        <span>{elapsed}</span>
      </div>
    )}
  </div>
  {statusDot}
</div>
```

```css
.my-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 12px;
  margin: 0 4px 2px;
  border-radius: var(--silo-radius-sm);
  cursor: pointer;
}
.my-row:hover {
  background: var(--silo-color-bg-hover);
}
.my-row-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.my-row-title-line {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
/* Set the size here — never via a `size` prop on the icon component — so it
   can never silently drift from 16px, and never accidentally inherit the
   12px rule meant for the subtitle icon below. */
.my-row-icon {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  color: var(--silo-color-text);
}
.my-row-title {
  color: var(--silo-color-text-hi);
}
.my-row-subtitle {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--silo-color-text-lo);
  font-size: calc(1em - 1px);
}
/* 12px, not 16px — smaller than `.my-row-icon` on purpose. Opacity (not a
   lighter color) so it still inherits `currentColor` from the subtitle
   line's own `--silo-color-text-lo` rather than needing its own color. */
.my-row-ws-icon {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  opacity: 0.75;
}
```

### An optional third line

The two-line shape above is what every first-party view currently ships, but
it isn't a hard ceiling — a view whose rows carry a short "why" (a note, a
blocking reason) can add a third line below the subtitle. There's no
host-canonical example of this yet, so treat the values below as a reasonable
default sourced from a real third-party Navigator view that already built
one (`follow-ups`'s `.fu-row-note`, flagged "why" text under each row),
**not** a settled host pattern the way the two lines above are:

```css
.my-row-note {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--silo-color-text-lo);
  font-size: calc(1em - 2px);
  line-height: 1.4;
}
```

Clamp it to two lines — an unbounded note line defeats the fixed row height
every other view in the panel assumes, the same reasoning behind "the
subtitle line is for identity context, not prose" below. Keep it muted
(`text-lo`) and a touch smaller than the subtitle (`calc(1em - 2px)` vs. the
subtitle's `calc(1em - 1px)`), so the visual hierarchy stays title → subtitle
→ note, not three lines competing at the same weight.

### Header actions {#header-actions}

A view's buttons are **toolbar items** on the `"navigator"`
[surface](/api/registration/register-toolbar-item) — see
[Header actions](/api/registration/register-navigator-view#header-actions)
for the registration API. This section is the rendering rule, not the API:

- **Right-aligned, trailing cluster.** The view header lays out
  `justify-content: flex-end`, so every contributed item stacks from the
  right edge inward — the view title (when shown) is the only thing that
  pushes left.
- **Icon-only by default, labeled when it earns the room.** `ContributedToolbar`
  renders icon-only (an `IconButton`) when an item has an `icon` and no
  `title`, and a labeled button — icon, text, and (for a `menu` item) a
  trailing chevron — when `title` is set. Reach for icon-only for a dense
  cluster of peers (filter, add, layout — the three in the first screenshot
  above); give one item a `title` when it's the view's primary control and
  there's a dedicated row of space for it (a "Workspace ▾" filter sitting
  alone in its own strip, not jammed beside three other icons).
- **A `menu`-backed item is how a view offers display options** (group-by,
  sort, filter) without spending a second Navigator view on it — see the
  example in
  [Header actions](/api/registration/register-navigator-view#header-actions).

### Rules specific to this surface

- **Don't claim a group header, drag handle, or row context menu "for free."**
  None of it is shared chrome — if your view wants them, build them with the
  [section header](#section-headers) and [row](#row-anatomy) patterns above,
  the same way the Workspaces/Agents views did.
- **A row's trailing edge is for status, not actions.** A busy/done dot or a
  count badge reads naturally there; buttons belong in the row's own
  [context menu](/api/registration/register-context-menu-item) or a
  [header action](#header-actions), not inline controls competing with the
  click target.
- **Reuse the workspace mark, don't invent your own "this belongs to a
  workspace" glyph.** `SquaresFour` at `weight="fill"` is what every built-in
  view uses next to a workspace name — a different icon for the same meaning
  reads as a second vocabulary the user has to learn.
- **The subtitle line is for identity/location context, not prose.** Keep it
  to short fields joined by `·` — elapsed time, owning workspace, a status
  word. A sentence here crowds the fixed row height every other view assumes.
- **Section headings use the canonical pattern verbatim** — don't restyle the
  label, caret, or count placement per view. A heading that looks different
  in your view reads as a different kind of grouping, not a stylistic choice.
- **Toolbar buttons go through `registerToolbarItem`, never a hand-rolled
  `<button>` in your view body.** That's what gets you the host's hover,
  tooltip, and ordering chrome for free, and keeps every view's actions in
  the one place a user learns to look.

## Side panels {#side-panels}

Registered with [`ctx.registerSidePanel`](/api/registration/register-side-panel)
— a persistent panel docked in Silo's side column, alongside the file
explorer and git panel.

Agent-facing decision table (typography, toolbars, drill-in paging, sheets):
[`docs/side-panel-design.md`](https://github.com/silo-code/silo/blob/main/docs/side-panel-design.md).
Kit components are the same as the [modal kit](/design/#the-component-inventory);
the chrome and navigation rules differ.

::: tip Draft
This surface guide is still being filled in from real panel builds (Skills,
Git commits takeover, Extensions detail). Prefer the decision table linked
above until the patterns here are complete.
:::

## Status bar items {#status-bar-items}

Registered with [`ctx.registerStatusItem`](/api/registration/register-status-item)
— a compact item in Silo's status bar, alongside the branch indicator and
process monitor.

::: info Coming soon
Status bar item patterns — icon + label conventions, click/hover behavior,
badge and color usage at that scale — aren't documented yet.
:::

## Dock panels & editors {#dock-panels-and-editors}

Registered with [`ctx.registerEditor`](/api/registration/register-editor) or
[`ctx.registerDockPanelKind`](/api/registration/register-dock-panel-kind) —
content that lives in Silo's center dock alongside the code editor and
terminal.

::: info Coming soon
Dock panel and editor UI patterns — toolbars, breadcrumbs, and how much of
the modal kit (if any) is the right fit for a content viewport — aren't
documented yet.
:::
