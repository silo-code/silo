# Building modals

How to put a dialog in front of the user, from a one-line confirm to a full
custom form — using the [design system](/design/) so the result is
indistinguishable from Silo's own modals.

First, know which of the [three modal surfaces](/design/surfaces) you're
building: a **standalone modal** (this page's main subject), a **settings
page**, or a **workspace properties tab**. The last two have their own
recipes [below](#recipe-a-settings-page) — and different rules: they persist
immediately and have no footer.

## Start with the built-ins

Most "modals" don't need custom content. Escalate only when the simpler tier
can't express what you need:

```tsx
// 1. A yes/no question — host renders everything
const ok = await ctx.ui.confirm({
  title: "Force-delete branch?",
  body: "This branch isn't merged. Deleting it discards those commits.",
  confirmLabel: "Delete",
  danger: true,
});

// 2. One text value
const name = await ctx.ui.prompt({
  title: "New branch",
  placeholder: "feature/…",
});
if (name === null) return; // cancelled

// 3. Custom content — you render the inside, the host renders the shell
const result = await ctx.ui.showModal<string>(
  (close) => <MyPicker onPick={(id) => close(id)} />,
  { title: "Branches", size: "md", dismissible: true },
);
```

## What the shell gives you (so don't rebuild it)

`showModal`'s options control the host-owned shell:

- `title` — rendered by the host at the title role (base+2/600). Don't add
  your own heading inside.
- `size` — `"sm"` 400px · `"md"` 560px (default) · `"lg"` 800px.
- `dismissible` — opt-in Escape/backdrop/✕ closing. Leave it off when open
  edits could be lost; the default protects staged input.
- Focus trap, z-stacking, restore-focus-on-close, the ✕ button (mouse-only;
  Esc is the keyboard path) — all host-owned.

Your render function receives `close(result?)` — wire it to your buttons.
Resolving with `undefined` means "cancelled."

## Recipe: a form modal

```tsx
import {
  Section,
  Input,
  CheckboxRow,
  Button,
  ModalActions,
} from "@silo-code/sdk";

function NewGroupModal({ close }: { close: (name?: string) => void }) {
  const [name, setName] = useState("");
  return (
    <>
      <Section label="Name">
        <Input
          block
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Section>
      <ModalActions>
        <Button onClick={() => close()}>Cancel</Button>
        <Button
          variant="primary"
          disabled={!name.trim()}
          onClick={() => close(name.trim())}
        >
          Create
        </Button>
      </ModalActions>
    </>
  );
}
```

That renders as:

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

Rules embodied above: primary action rightmost and disabled until valid;
`Section` labels the field group; no hand-rolled footer.

## Recipe: a picker modal {#recipe-a-picker-modal}

Filter-above-list — the pattern behind Branches. There's no combined
component on purpose; the composition is the API:

```tsx
import {
  SearchInput,
  List,
  ListRow,
  Badge,
  Button,
  ModalActions,
} from "@silo-code/sdk";

function BranchPicker({ close }: { close: (branch?: string) => void }) {
  const [query, setQuery] = useState("");
  const branches = useBranches();
  const visible = branches.filter((b) => b.name.includes(query));
  return (
    <>
      <SearchInput
        autoFocus
        value={query}
        onValueChange={setQuery}
        placeholder="Filter branches…"
      />
      <div className="silo-scroll" style={{ maxHeight: 340 }}>
        <List aria-label="Branches">
          {visible.length === 0 && (
            <EmptyState icon={<SearchIcon />} title="No matching branches" />
          )}
          {visible.map((b) => (
            <ListRow
              key={b.name}
              selected={b.current}
              trailing={b.current && <Badge tone="accent">current</Badge>}
              onSelect={() => close(b.name)}
            >
              {b.name}
            </ListRow>
          ))}
        </List>
      </div>
      <ModalActions
        start={
          <Button size="sm" onClick={createBranch}>
            + Create branch
          </Button>
        }
      >
        <Button onClick={fetchAll}>Fetch</Button>
      </ModalActions>
    </>
  );
}
```

That renders as:

<div class="silo-demo silo-demo-block">
  <div class="silo-demo-modal" style="max-width:460px;">
    <div class="modal-title">Branches</div>
    <div class="silo-search-input" style="margin-bottom:10px;">
      <svg class="icon" width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5.2" stroke="currentColor" stroke-width="1.4"/><path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
      <input placeholder="Filter branches…" readonly>
    </div>
    <div class="silo-scroll" style="max-height:160px;">
      <div class="silo-list">
        <div class="silo-list-row" data-selected="true">
          <span class="name">main</span>
          <span class="silo-badge silo-badge-accent">current</span>
        </div>
        <div class="silo-list-row"><span class="name">feature/theme-picker</span></div>
        <div class="silo-list-row"><span class="name">fix/list-truncation</span></div>
      </div>
    </div>
    <div class="silo-modal-actions">
      <div class="silo-modal-actions-start"><button class="silo-button silo-button-sm">+ Create branch</button></div>
      <button class="silo-button">Fetch</button>
    </div>
  </div>
</div>

What you got for free: keyboard navigation (Tab to the list, ↑/↓, Space),
full-width rows that truncate instead of overflowing, themed scrollbar, and a
footer that matches every other modal.

## Recipe: a settings page {#recipe-a-settings-page}

Settings pages render inside the host's Settings modal — you register a
component; the host provides the rail and page chrome, your page provides
sections. **No footer, no Save button**: every control persists the moment it
changes.

```tsx
ctx.registerSettingsPage({
  id: "my-ext-settings",
  title: "My Extension",
  component: () => {
    const [auto, setAuto] = useStoredSetting("autoRefresh"); // backed by ctx.storage
    return (
      <Section label="Behavior">
        <SettingRow label="Auto-refresh" hint="Poll the API in the background.">
          <Switch checked={auto} onChange={setAuto} aria-label="Auto-refresh" />
        </SettingRow>
      </Section>
    );
  },
});
```

The host draws the pane title from `title` — don't render your own `<h2>`. That renders as:

<div class="silo-demo silo-demo-block">
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
        <div class="silo-setting-row" style="padding-top:0;">
          <div class="text">
            <div class="row-label">Auto-refresh</div>
            <div class="row-hint">Poll the API in the background.</div>
          </div>
          <div class="control"><button class="silo-switch-track" data-checked="true" aria-label="Auto-refresh"></button></div>
        </div>
      </div>
    </div>
  </div>
</div>

You never build the left rail — it's host chrome. See
[Settings pages](/design/surfaces#settings-pages) for the full rules.

## Recipe: a workspace properties tab

Property pages appear as tabs in the Workspace Properties modal, scoped to
one workspace. Same immediate-persistence grammar as a settings page, but
stored per-workspace:

```tsx
ctx.workspaces.registerPropertyPage({
  id: "gha",
  title: "GitHub Actions",
  icon: <GithubIcon />,
  visible: (ws) => hasGitRepo(ws), // hide where it's meaningless
  component: ({ ws }) => {
    const [monitor, setMonitor] = useWorkspaceSetting(ws.id, "monitor");
    return (
      <SettingRow
        label="Monitor this workspace"
        hint="Watch workflow runs for repos in this workspace."
      >
        <Switch
          checked={monitor}
          onChange={setMonitor}
          aria-label="Monitor this workspace"
        />
      </SettingRow>
    );
  },
});
```

That renders as:

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

Keep the tab about _this workspace_ — global settings belong on your settings
page. See [Workspace property tabs](/design/surfaces#workspace-property-tabs).

## Best practices, condensed

The full rules live in [Principles](/design/principles); the ones violated
most often:

1. Don't restyle kit components — you'd freeze today's look and break the
   automatic-restyle contract.
2. Don't invent colors, font sizes, focus rings, or scrollbars — every one of
   those is provided.
3. Don't intercept Escape or add key handlers to lists — keyboard behavior is
   built in and coordinated with the shell.
4. `dismissible: true` only when closing can't lose user input.
5. One primary action per modal, rightmost.

## See also

- [Design system overview](/design/) · [Modal surfaces](/design/surfaces) ·
  [Principles](/design/principles) · [Typography](/design/typography)
- [`ctx.ui`](/api/ui/) — the full shell API (toasts, menus, pickers too)
- [Extension checklist](/guide/extension-checklist) — pre-flight for shipping
