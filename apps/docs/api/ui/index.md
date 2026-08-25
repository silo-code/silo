# ctx.ui <Badge type="tip" text="stable" />

User-interaction — the **only** sanctioned way to talk to the user. The host
renders the chrome; your extension just asks. Five kinds of interaction ship
today: native OS dialogs (folder / open-file / save pickers), transient toast
notifications, menus (context menus and button dropdowns), modal dialogs
(`confirm` / `prompt`, plus `showModal` for your own custom content), and
`openExternal` to send a URL out to the browser / mail client, and
`getActiveSelectionText` to read the user's current selection. Mirrors VS
Code's `window.show*`.

```ts
ctx.ui: UiService
```

## Example

```tsx
// ask the user to pick a folder
const dir = await ctx.ui.pickFolder();
if (dir) addFolder(dir);

// pick a JSON file to import
const file = await ctx.ui.pickFile({
  filters: [{ name: "JSON", extensions: ["json"] }],
});

// pick a save destination (seed it with a suggested name)
const dest = await ctx.ui.savePath({
  defaultPath: "my-theme.json",
  filters: [{ name: "JSON", extensions: ["json"] }],
});
if (dest) await ctx.files.writeText(dest, json);

// tell the user something happened
ctx.ui.notify("info", "Theme exported.");
ctx.ui.notify("error", "Couldn't read that file.");

// an error toast with a title and an action that opens the full detail in a
// modal (the toast stays up until dismissed, so the action isn't lost)
ctx.ui.notify("error", summary, {
  title: "Commit failed",
  actions: [
    {
      label: "View details",
      run: () =>
        ctx.ui.showModal((close) => <pre>{fullError}</pre>, {
          title: "Commit failed",
          dismissible: true,
        }),
    },
  ],
});

// a right-click context menu at the cursor
element.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  ctx.ui.showMenu({
    items: [
      { label: "Rename", accelerator: "↵", run: rename },
      { type: "separator" },
      { label: "Delete", danger: true, run: del },
    ],
  });
});

// a dropdown anchored under a button, with a checked (current) row
ctx.ui.showMenu({
  items: [
    { type: "header", label: "Theme" },
    { label: "Dark", checked: true, run: () => setTheme("dark") },
    { label: "Light", run: () => setTheme("light") },
  ],
  anchor: buttonEl,
});

// a row that cascades a submenu (give it `submenu` instead of `run`)
ctx.ui.showMenu({
  items: [
    { label: "Switch to…", run: switchWorkspace },
    { type: "separator" },
    {
      label: "Add",
      submenu: [
        { label: "Existing…", run: addExisting },
        { label: "New…", run: addNew },
      ],
    },
  ],
  anchor: buttonEl,
});

// confirm before a destructive action (resolves true/false)
if (
  await ctx.ui.confirm({
    title: "Delete workspace?",
    body: `"${name}" and its saved terminals will be permanently removed.`,
    confirmLabel: "Delete",
    danger: true,
  })
) {
  service.delete(id);
}

// prompt for a string (resolves the text, or null on cancel)
const renamed = await ctx.ui.prompt({ title: "Rename", initialValue: current });
if (renamed !== null) rename(renamed);

// a modal around your own content (resolves whatever you pass to `close`)
const changes = await ctx.ui.showModal<Changes>(
  (close) => <MyForm onCancel={() => close()} onSave={(c) => close(c)} />,
  { title: "Properties", size: "md" },
);
if (changes) apply(changes);

// confirm with a persisted "don't show this again" checkbox — resolves true
// immediately, no dialog, once the user has already suppressed this key
const ok = await ctx.ui.confirmWithDontShowAgain({
  storageKey: "installSkill.dontShowAgain",
  title: "Install skill?",
  body: `This runs ${cmd} in a new terminal.`,
  confirmLabel: "Install",
  mode: { kind: "confirm" },
});
if (ok) runInstall();

// open a link out in the browser / mail client (scheme-guarded to http(s)/mailto)
await ctx.ui.openExternal("https://getsilo.dev/docs");

// read whatever the user has selected in the focused editor or terminal
const selected = ctx.ui.getActiveSelectionText();
if (selected) runSearch(selected);
```

## Methods

**`UiService`** (`ctx.ui`):

| Method                                                                                       | What it does                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`pickFolder(opts?)`](/api/types/interfaces/UiService#pickfolder)                            | Show the native folder picker. Resolves to an absolute path, or `null` if cancelled.                                                                                                                      |
| [`pickFile(opts?)`](/api/types/interfaces/UiService#pickfile)                                | Show the native open-file picker (single selection), optionally filtered. Resolves to an absolute path, or `null` if cancelled.                                                                           |
| [`savePath(opts?)`](/api/types/interfaces/UiService#savepath)                                | Show the native save dialog, optionally filtered. Resolves to the chosen absolute path, or `null` if cancelled.                                                                                           |
| [`notify(level, message, opts?)`](/api/types/interfaces/UiService#notify)                    | Show a transient toast (`"info"` / `"warn"` / `"error"`). Fire-and-forget; `info`/`warn` auto-dismiss. Pass [`NotifyOptions`](/api/types/interfaces/NotifyOptions) for a `title` and action buttons.      |
| [`showMenu(opts)`](/api/types/interfaces/UiService#showmenu)                                 | Pop a menu — the same themed primitive behind every context menu and dropdown in Silo. Resolves when an item runs or it's dismissed.                                                                      |
| [`confirm(opts)`](/api/types/interfaces/UiService#confirm)                                   | Pop a host-rendered confirm dialog. Resolves `true` (confirm) / `false` (cancel). Always dismissible; set `danger` for destructive actions.                                                               |
| [`prompt(opts)`](/api/types/interfaces/UiService#prompt)                                     | Pop a single-line input dialog. Resolves the entered string, or `null` if cancelled.                                                                                                                      |
| [`showModal(render, opts?)`](/api/types/interfaces/UiService#showmodal)                      | Pop a modal around your own custom content (a form / bespoke layout). Resolves the value your content passes to `close`, or `undefined`. Not dismissible by default.                                      |
| [`confirmWithDontShowAgain(opts)`](/api/types/interfaces/UiService#confirmwithdontshowagain) | Confirm/info dialog with a persisted "Don't show this again" checkbox. Resolves `true` immediately (no dialog) once the user has suppressed `opts.storageKey`; cancel never persists the checkbox.        |
| [`openExternal(url)`](/api/types/interfaces/UiService#openexternal)                          | Hand a URL to the OS — `http(s)` opens the browser, `mailto:` the mail client. Scheme-guarded: any other scheme (`file:`, `javascript:`, …) rejects, so untrusted URLs are safe to pass straight in.      |
| [`getActiveSelectionText()`](/api/types/interfaces/UiService#getactiveselectiontext)         | The text selected in the focused surface — the active editor **or** a focused terminal — or `null` when nothing is selected. Lets a command (e.g. "Find in Files") seed itself from the user's selection. |

Each picker accepts an options object: `defaultPath` seeds the dialog's
location (and, for `savePath`, the suggested filename); `filters` is a list of
[`FileFilter`](/api/types/interfaces/FileFilter) (`pickFile` / `savePath` only)
that restricts the file-type dropdown.

`showMenu` takes a [`ShowMenuOptions`](/api/types/interfaces/ShowMenuOptions):
an `items` list of [`MenuEntry`](/api/types/type-aliases/MenuEntry) (each a
[`MenuItem`](/api/types/interfaces/MenuItem), `{ type: "separator" }`, or
`{ type: "header", label }`) plus where to place it. Position resolves
`anchor` → `at` → the current cursor, so calling it with just `items` from a
right-click handler opens at the mouse. Only one menu is open at a time, and
re-opening with the same `anchor` toggles it closed — so a second click on a
dropdown button dismisses it (pass `toggle: false` to keep the always-open
behaviour). An
item's `run` fires when it's chosen (the menu closes first); set `danger` for
destructive rows, `checked` for the current selection, `disabled` to dim a row,
and `trailing` for a secondary per-row control (see
[`MenuItemTrailing`](/api/types/interfaces/MenuItemTrailing)). Give a row a
`submenu` (a nested `MenuEntry` list) instead of a `run` to make it a parent
that cascades that menu to its side on hover.

`notify` takes a `level`, a `message`, and an optional
[`NotifyOptions`](/api/types/interfaces/NotifyOptions): a bold `title`, an
`actions` list of [`NotifyAction`](/api/types/interfaces/NotifyAction) buttons,
and a `durationMs` override. By default `info` / `warn` toasts auto-dismiss after
~4s, while **errors and any toast with actions stay until dismissed** — so a
"View details" action (typically pairing with
[`showModal`](/api/types/interfaces/UiService#showmodal)) isn't lost to the
timer. An action's `run` fires on click and the toast then closes, unless the
action sets `keepOpen`.

`confirm` takes a [`ConfirmOptions`](/api/types/interfaces/ConfirmOptions)
(`title`, optional `body`, `confirmLabel` / `cancelLabel`, `danger`) and `prompt`
a [`PromptOptions`](/api/types/interfaces/PromptOptions) (`title`, plus `label`,
`initialValue`, `placeholder`, and the button labels). Both are always
dismissible — `Escape` and a backdrop-click resolve the safe choice (`false` /
`null`).

For anything beyond a yes/no or single field, reach for
[`showModal`](/api/types/interfaces/UiService#showmodal): pass a `render`
callback that receives a `close` function and returns your content, plus a
[`ModalOptions`](/api/types/interfaces/ModalOptions) (`title`, `size`, `bare`,
`dismissible`, …). Wire your buttons to `close(result)` (or `close()` to
cancel); the returned promise resolves with that result, or `undefined` on
dismiss. Unlike `confirm`/`prompt`, `showModal` is **not** dismissible by
default — so a stray click-away can't discard staged edits. (The flip side:
because it settles only on `close`, a non-dismissible modal whose content never
calls `close` leaves the promise pending forever — make sure every path out
calls it.) Lay the footer buttons out in a `.silo-modal-actions` row, and style
them with the global [button classes](/api/theming). All of these ride the same
host-arbitrated stacking and focus trap.

`confirmWithDontShowAgain(opts)` is `confirm`/`showModal` plus one thing
neither offers: a persisted "Don't show this again" checkbox, for a
confirmation the user shouldn't have to answer twice. Pass a
[`ConfirmDontShowAgainOptions`](/api/types/interfaces/ConfirmDontShowAgainOptions)
— `storageKey` (a key in **your own** extension's `ctx.storage.global`; the
host binds storage automatically, you never pass a handle), `title`, `body`,
`confirmLabel`, and `mode` (a
[`ConfirmDontShowAgainMode`](/api/types/type-aliases/ConfirmDontShowAgainMode):
`{ kind: "confirm", danger? }` pairs Cancel with a primary/danger button,
dismissible like `confirm`; `{ kind: "info" }` is a single acknowledgement
button, not dismissible, since there's nothing to cancel). If `storageKey` is
already set, the promise resolves `true` with no dialog at all. **Cancelling
never persists the checkbox**, even if it was checked — so an accidental
cancel can't silently suppress a safety warning for good; only proceeding with
the box checked persists it.

`openExternal(url)` is the host's gateway to the world outside the app — it hands
the URL to the OS, opening `http(s)` links in the default browser and `mailto:`
links in the mail client. It's **scheme-guarded**: only `http:`, `https:`, and
`mailto:` are opened; anything else (notably `file:` and `javascript:`) rejects
the returned promise without opening. That guard makes it safe to pass URLs you
didn't author — e.g. a link clicked inside a rendered Markdown document — straight
through, catching the rejection to warn the user about an unopenable link.

## Types

[`UiService`](/api/types/interfaces/UiService) ·
[`FileFilter`](/api/types/interfaces/FileFilter) ·
[`ShowMenuOptions`](/api/types/interfaces/ShowMenuOptions) ·
[`MenuEntry`](/api/types/type-aliases/MenuEntry) ·
[`MenuItem`](/api/types/interfaces/MenuItem) ·
[`MenuItemTrailing`](/api/types/interfaces/MenuItemTrailing) ·
[`MenuSeparator`](/api/types/interfaces/MenuSeparator) ·
[`MenuHeader`](/api/types/interfaces/MenuHeader) ·
[`ConfirmOptions`](/api/types/interfaces/ConfirmOptions) ·
[`PromptOptions`](/api/types/interfaces/PromptOptions) ·
[`ModalOptions`](/api/types/interfaces/ModalOptions) ·
[`ConfirmDontShowAgainOptions`](/api/types/interfaces/ConfirmDontShowAgainOptions) ·
[`ConfirmDontShowAgainMode`](/api/types/type-aliases/ConfirmDontShowAgainMode) ·
[`NotifyOptions`](/api/types/interfaces/NotifyOptions) ·
[`NotifyAction`](/api/types/interfaces/NotifyAction).

`getActiveSelectionText()` reads the **most-recently-focused** surface's
selection — the active editor or a focused terminal — so a command works
regardless of which one has focus. It returns `null` (never throws) when nothing
is focused or selected. Pairs naturally with [`ctx.search`](/api/search/) and
[`ctx.editors.open`](/api/editors/)'s `selection` to build a "search for the
selected text, then jump to a hit" flow.

## Notes

Pickers are **user-interaction**, so they live here rather than on
[`ctx.files`](/api/files/) — `files` stays pure host-mediated I/O. The dialogs
are the platform's native ones; the host owns the privileged platform access.

`notify` is the only way an extension can proactively message the user. Keep
messages short — they're toasts, not modals. For long or structured output
(stderr, a log), put a short summary in the toast and offer a **"View details"**
action that opens the full text via `showModal`.

`confirm` and `prompt` are modal — they block on the user's choice. Reach for a
toast (`notify`) when you just need to inform, and `confirm`/`prompt` when you
need an answer before continuing.

## Planned

More host-rendered chrome is designed but not yet shipped — `quickPick` and
`progress`. See the [roadmap](/roadmap#ctx-ui).
