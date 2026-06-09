# Interface: UiService

Defined in: [packages/sdk/src/ui-service.ts:291](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L291)

The user-interaction domain, exposed as [ExtensionContext.ui](ExtensionContext.md#ui). The host
renders the chrome; an extension only asks. Interactions today:

- **Native OS dialogs** — [pickFolder](#pickfolder),
  [pickFile](#pickfile), [savePath](#savepath).
  Thin wrappers over the platform dialogs the host owns; each resolves to an
  absolute path or `null` when the user cancels.
- **Notifications** — [notify](#notify) shows a transient
  toast, optionally with a title and action buttons (see [NotifyOptions](NotifyOptions.md)).
  The only way an extension can proactively message the user.
- **Menus** — [showMenu](#showmenu) pops a context menu or
  button dropdown, themed to match the rest of the app.
- **Modal dialogs** — [confirm](#confirm) and
  [prompt](#prompt) pop a host-owned modal and resolve on the
  user's choice; [showModal](#showmodal) pops one around your
  own custom content (a form or bespoke layout).
- **External links** — [openExternal](#openexternal) hands a
  URL to the OS (browser / mail client), the host's gateway to the world
  outside the app.

Mirrors VS Code's `window.show*`. More host-rendered chrome (quick-pick,
progress) is planned — see the roadmap.

## Methods

### pickFolder()

```ts
pickFolder(opts?): Promise<string | null>;
```

Defined in: [packages/sdk/src/ui-service.ts:298](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L298)

Show the native folder picker. Resolves to the chosen absolute path, or
`null` if the user cancelled.

#### Parameters

##### opts?

###### defaultPath?

`string`

Absolute path to open the dialog at.

#### Returns

`Promise`\<`string` \| `null`\>

***

### pickFile()

```ts
pickFile(opts?): Promise<string | null>;
```

Defined in: [packages/sdk/src/ui-service.ts:306](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L306)

Show the native open-file picker (single selection). Resolves to the chosen
absolute path, or `null` if the user cancelled.

#### Parameters

##### opts?

###### defaultPath?

`string`

Absolute path to open the dialog at.

###### filters?

[`FileFilter`](FileFilter.md)[]

Restrict the selectable file types (see [FileFilter](FileFilter.md)).

#### Returns

`Promise`\<`string` \| `null`\>

***

### savePath()

```ts
savePath(opts?): Promise<string | null>;
```

Defined in: [packages/sdk/src/ui-service.ts:317](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L317)

Show the native save dialog. Resolves to the chosen destination's absolute
path, or `null` if the user cancelled.

#### Parameters

##### opts?

###### defaultPath?

`string`

Seeds the dialog's location and suggested filename.

###### filters?

[`FileFilter`](FileFilter.md)[]

Restrict the file-type dropdown (see [FileFilter](FileFilter.md)).

#### Returns

`Promise`\<`string` \| `null`\>

***

### notify()

```ts
notify(
   level, 
   message, 
   options?): void;
```

Defined in: [packages/sdk/src/ui-service.ts:352](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L352)

Show a transient toast notification to the user. Fire-and-forget — the host
renders it (and, for `info` / `warn` without actions, auto-dismisses it).
`level` drives the icon and accent.

Pass [NotifyOptions](NotifyOptions.md) for a bold `title`, footer `actions`, or an
explicit `durationMs`. Errors and toasts with actions stay until dismissed
(so a "View details" action isn't lost to the timer); everything else
auto-dismisses after ~4s.

#### Parameters

##### level

`"info"` \| `"warn"` \| `"error"`

##### message

`string`

##### options?

[`NotifyOptions`](NotifyOptions.md)

#### Returns

`void`

#### Example

```ts
// a plain info toast (auto-dismisses)
ctx.ui.notify("info", "Theme exported.");

// an error with a title and an action that opens the full detail in a modal
ctx.ui.notify("error", String(err), {
  title: "Commit failed",
  actions: [
    {
      label: "View details",
      run: () =>
        ctx.ui.showModal((close) => <pre>{String(err)}</pre>, {
          title: "Commit failed",
          dismissible: true,
        }),
    },
  ],
});
```

***

### showMenu()

```ts
showMenu(opts): Promise<void>;
```

Defined in: [packages/sdk/src/ui-service.ts:387](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L387)

Pop a menu — the same themed primitive behind every context menu and
dropdown in Silo. Supply the [rows](../type-aliases/MenuEntry.md) and where to place it
(see [ShowMenuOptions](ShowMenuOptions.md)); the host renders it, runs the chosen item's
[run](MenuItem.md#run), and dismisses on outside-click or Escape.

Only one menu is open at a time — calling `showMenu` again replaces it,
except that re-opening with the same [anchor](ShowMenuOptions.md#anchor)
toggles it closed (a second click on a dropdown button dismisses it); opt
out with [toggle: false](ShowMenuOptions.md#toggle). Resolves once an
item runs or the menu is dismissed.

#### Parameters

##### opts

[`ShowMenuOptions`](ShowMenuOptions.md)

#### Returns

`Promise`\<`void`\>

#### Example

```ts
// A right-click context menu at the cursor.
element.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  ctx.ui.showMenu({
    items: [
      { label: "Rename", run: rename },
      { type: "separator" },
      { label: "Delete", danger: true, run: del },
    ],
  });
});

// A dropdown anchored under a button.
ctx.ui.showMenu({ items, anchor: buttonEl });
```

***

### confirm()

```ts
confirm(opts): Promise<boolean>;
```

Defined in: [packages/sdk/src/ui-service.ts:406](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L406)

Pop a host-rendered confirm dialog and resolve to the user's choice —
`true` for confirm, `false` for cancel. Always dismissible: `Escape` and
backdrop-click both resolve `false`. The dialog stacks above all host
chrome via the modal manager, so it works from anywhere.

#### Parameters

##### opts

[`ConfirmOptions`](ConfirmOptions.md)

#### Returns

`Promise`\<`boolean`\>

#### Example

```ts
if (await ctx.ui.confirm({
  title: "Delete workspace?",
  body: `"${name}" and its saved terminals will be permanently removed.`,
  confirmLabel: "Delete",
  danger: true,
})) {
  service.delete(id);
}
```

***

### prompt()

```ts
prompt(opts): Promise<string | null>;
```

Defined in: [packages/sdk/src/ui-service.ts:417](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L417)

Pop a host-rendered single-line input dialog and resolve to the entered
string, or `null` if the user cancelled (`Escape` / backdrop / Cancel).

#### Parameters

##### opts

[`PromptOptions`](PromptOptions.md)

#### Returns

`Promise`\<`string` \| `null`\>

#### Example

```ts
const name = await ctx.ui.prompt({ title: "Rename", initialValue: current });
if (name !== null) rename(name);
```

***

### showModal()

```ts
showModal<T>(render, options?): Promise<T | undefined>;
```

Defined in: [packages/sdk/src/ui-service.ts:454](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L454)

Pop a host-rendered modal around your **own custom content** — the escape
hatch beyond [confirm](#confirm) / [UiService.prompt \| prompt](#prompt) when you need a form or bespoke layout. The host owns the hard parts
(backdrop, central z-stacking above all chrome, focus trap,
restore-focus-on-close); you own the content.

Supply a `render` callback that receives a `close` function and returns the
modal's content; wire your own buttons to `close(result)` (or `close()` to
cancel). The returned promise resolves with the value passed to `close`, or
`undefined` if the modal was dismissed (only possible when
[ModalOptions.dismissible](ModalOptions.md#dismissible) is set) or `close()` was called with no
argument — paralleling `confirm`→`false` / `prompt`→`null`. If you must tell
"dismissed" from "closed with no result" apart, pass a distinct sentinel.

**Not dismissible by default:** unless you set
[ModalOptions.dismissible](ModalOptions.md#dismissible), `Escape` and backdrop-click do nothing and
the modal stays open until your content calls `close`. A non-dismissible
modal whose content never calls `close` leaves the promise pending forever —
by design, so staged edits can't be lost to an accidental click-away.

#### Type Parameters

##### T

`T` = `void`

The result type your content resolves with via `close`.

#### Parameters

##### render

(`close`) => `ReactNode`

Returns the modal content; receives `close` to settle it.

##### options?

[`ModalOptions`](ModalOptions.md)

Presentation options (see [ModalOptions](ModalOptions.md)).

#### Returns

`Promise`\<`T` \| `undefined`\>

#### Example

```tsx
const changes = await ctx.ui.showModal<Changes>(
  (close) => (
    <MyForm onCancel={() => close()} onSave={(c) => close(c)} />
  ),
  { title: "Properties", size: "md" },
);
if (changes) apply(changes);
```

***

### openExternal()

```ts
openExternal(url): Promise<void>;
```

Defined in: [packages/sdk/src/ui-service.ts:486](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L486)

Hand a URL to the operating system — open an `http`/`https` link in the
user's default browser, or a `mailto:` link in their mail client. The host
owns the privileged platform access; this is an extension's only sanctioned
way to send the user out of the app.

**Scheme-guarded.** Only `http:`, `https:`, and `mailto:` URLs are opened;
any other scheme (notably `file:` and `javascript:`) is rejected — the
returned promise rejects, nothing is opened. This makes it safe to pass
untrusted URLs (e.g. links inside a rendered Markdown document) straight
through without first vetting the scheme yourself.

#### Parameters

##### url

`string`

The URL to open. Must be `http:`, `https:`, or `mailto:`.

#### Returns

`Promise`\<`void`\>

#### Throws

If `url` has any other scheme (or is unparseable).

#### Example

```ts
// open a docs link in the browser
await ctx.ui.openExternal("https://silo.dev/docs");

// route a clicked Markdown link safely — bad schemes just reject
try {
  await ctx.ui.openExternal(href);
} catch {
  ctx.ui.notify("warn", "That link can't be opened.");
}
```
