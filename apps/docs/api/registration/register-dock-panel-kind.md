# ctx.registerDockPanelKind

Register a kind of center-dock tab (like the terminal) that workspaces can open by id. Register these early in `activate`, before anything opens a panel of the kind.

```ts
ctx.registerDockPanelKind<T extends object>(kind: DockPanelKind<T>): Disposable
```

## Example

```tsx
ctx.registerDockPanelKind({
  id: "acme.repl",
  component: ReplPanel, // receives DockPanelProps
});
```

The params generic `T` is inferred from the component's
[`DockPanelProps<T>`](/api/types/interfaces/DockPanelProps) annotation, so a
kind whose panels are opened with typed params registers without casts.

### Render Chat sessions for an Agent Profile <Badge type="warning" text="beta" />

A **Chat**-armed [Agent Profile](/api/agents/profiles) has no terminal to
launch, so Silo needs somewhere to open it. Declare `chatProfileHost` and your
panel becomes that somewhere:

```tsx
ctx.registerDockPanelKind({
  id: "acme.chat",
  component: AcmeChatPanel,
  chatProfileHost: true,
});
```

Picking a Chat profile from a dock's **+** menu — or running its
`core.newAgent.<id>` command — then opens your kind with `params.profileId` set
to that profile's id, which you hand to
[`ctx.agents.sessions.connect()`](/api/agents/sessions). Terminal profiles are
unaffected and still launch a terminal.

This is a declaration, not a privilege: the bundled Chat panel claims it the
same way, so a third-party panel is a first-class way to start an agent rather
than something reached by a separate route. With several kinds declaring it the
first registered wins — disable the one you don't want on
**Settings → Extensions**.

### Declare the Agent Session your panel is showing <Badge type="warning" text="beta" />

A panel that renders an Agent Session should say so, once it has one:

```tsx
function AcmeChatPanel({ api }: DockPanelProps<{ profileId?: string }>) {
  const [sessionId, setSessionId] = useState<string>();
  // …connect() and setSessionId(handle.id)

  useEffect(() => {
    if (!sessionId) return;
    api.setAgentSession(sessionId);
    return () => api.setAgentSession(null);
  }, [api, sessionId]);
}
```

That one declaration is all the host lacks. From it, your tab gets the same
activity badge and brand icon a terminal tab running the same agent gets
(painted by whoever observes [`ctx.agents`](/api/agents/), so it honours their
settings); [`ctx.agents.getActive()`](/api/agents/) reports your session while
your tab is the active one, so a turn the user watched raises no unread badge;
and `ctx.agents.close(id)` closes your panel. Your panel implements none of
that — see
[tab adornments](/api/state/tab-adornments#a-dock-panel-tab-is-adorned-by-what-it-is-not-by-itself).

The declaration is withdrawn automatically when the panel unmounts.

### Host-drawn chrome: a breadcrumb + a contribution point

By default a dock panel gets a bare frame. Declare `toolbar` and the host draws
the same strip an editor gets — a path breadcrumb, and a place other extensions
can contribute toolbar buttons:

```tsx
ctx.registerDockPanelKind({
  id: "acme.chat",
  component: AcmeChatPanel,
  toolbar: { breadcrumb: true },
});

function AcmeChatPanel({ api }: DockPanelProps) {
  useEffect(() => {
    api.setBreadcrumb({
      filePath: cwd,
      workspaceFolder: cwd,
      leafIcon: "folder",
    });
    return () => api.setBreadcrumb(null);
  }, [api, cwd]);
}
```

`api.setBreadcrumb(crumb | null)` fills in the crumbs — same shape as
`setAgentSession`: your panel states the path, the host draws it. `null` shows no
crumbs (a "hide breadcrumbs" setting of your own, say). `toolbar: {}` still
reserves the strip for contributed items only.

Trailing buttons arrive through
[`ctx.registerToolbarItem({ surface: "panel" })`](/api/registration/register-toolbar-item)
— the same door your _own_ controls use. Scope an item to your kind with
`when: (_keys, t) => t.kindId === "acme.chat"`, read instance data off
`t.params` (your `DockPanelProps["params"]`), and act on the owning workspace
via `t.workspaceId`. The built-in terminal declares `toolbar` too, so its
toolbar items are ordinary `"panel"` items.

### Your panel is never remounted — restore on `onScreen`

A dock panel mounts **once**, when its tab is created, and stays mounted until
the tab closes. Deselecting its tab does not unmount it: the host detaches your
panel's element from the document and re-attaches it when the tab comes back, so
your React state and refs survive untouched. Backgrounding the whole workspace
does not even detach — that dock simply stops being shown.

The catch is that a detached element loses everything the browser keeps on a
layout box, **scroll offsets first among them**. So a panel that restores a
scroll position, re-measures a canvas, or refits a terminal on mount will do it
exactly once, when there is nothing yet to restore, and never again.

Do that work on `onScreen` instead. It is `true` only when your tab is the
selected one in its group _and_ its workspace is the one on screen — the host
resolves both halves, so don't recombine
[`DockPanelApi.isVisible`](/api/types/interfaces/DockPanelApi) (the tab half
only: a panel in a backgrounded workspace still reports `true`) with
[`ctx.workspaces`](/api/state/workspaces) yourself.

```ts
function AcmeChatPanel({ params, onScreen }: DockPanelProps<{ scrollTop?: number }>) {
  const scroller = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!onScreen || !scroller.current) return;
    scroller.current.scrollTop = params.scrollTop ?? 0;
  }, [onScreen, params.scrollTop]);

  return <div ref={scroller} />;
}
```

Read the position back only while `onScreen` is `true` — the element is already
detached by the time the flag flips to `false`, and reads `0` there.

### Entry focus: use `usePanelEntryFocus`

If your panel puts the cursor somewhere on entry — a chat composer, a search
box, an editor — reach for
[`usePanelEntryFocus`](/api/other/use-panel-entry-focus). It is the whole job in
one call, and hand-rolling it is where panels go wrong:

```tsx
import { usePanelEntryFocus, type DockPanelProps } from "@silo-code/sdk";

function AcmeChatPanel({ api }: DockPanelProps) {
  const input = useRef<HTMLTextAreaElement | null>(null);

  usePanelEntryFocus(api, {
    focus: () => input.current?.focus(),
    isFocused: () => document.activeElement === input.current,
  });

  return <textarea ref={input} />;
}
```

Three things have to be right, and the hook does all three:

**Both entry signals.** Clicking a panel's tab when that tab is **already
active** changes nothing about which panel is active, so dockview fires no
active-change event at all. But that click is exactly the "put my cursor back
here" gesture: the user was typing in a side panel or clicked the status bar,
focus left your panel, and they clicked your tab to get it back. Driving entry
focus from [`onDidActiveChange`](/api/types/interfaces/DockPanelApi) alone
misses it entirely. [`onDidRequestFocus`](/api/types/interfaces/DockPanelApi)
fires on every click of your tab, already-active included — and stays quiet for
`setActive()`, a keybinding, a command-palette jump and a layout restore, which
all arrive as `onDidActiveChange`. That's why both are needed, and why the hook
subscribes to both.

**A guard.** Focus may only be taken while your panel is the active one. Mount
is not "the user just created this panel" — re-entering a workspace re-mounts
every panel in its dock — and DOM focus landing inside a panel makes dockview
activate that panel's group, so an unguarded grab silently changes which tab the
user is looking at.

**A retry.** A single `focus()` loses dockview's focus shuffle, and rich content
(a code editor, a terminal) only accepts focus once its internal textarea has
been laid out. The hook retries across animation frames until `isFocused()`
reports focus landed, standing down early if your panel stops being active or
if focus moves into an open context menu.

If your content becomes focusable at some other moment — a session finishing its
connect, an editor finishing its own mount — call the function the hook returns.
It runs the same guarded retry on demand and is referentially stable:

```tsx
const focusComposer = usePanelEntryFocus(api, { focus, isFocused });

useEffect(() => {
  if (ready) focusComposer();
}, [ready, focusComposer]);
```

### Recorded panels: reopen on restart <Badge type="warning" text="experimental" />

By default a dock panel persists only as geometry in the saved dock layout — it
comes back where you left it _for the current session_, but a **transient**
panel (a picker, a preview) is fine with that. Declare `persistence: "recorded"`
and every open panel of your kind becomes a
[`DockPanelRecord`](/api/types/interfaces/DockPanelRecord) on its workspace
([`Workspace.panels`](/api/types/interfaces/Workspace)): workspace-scoped,
enumerable, and **reopened from its record after a restart** — the same footing
an editor or terminal tab has.

```ts
ctx.registerDockPanelKind({
  id: "acme.chat",
  component: ChatPanel,
  persistence: "recorded",
});
```

On restore the host recreates your panel and hands
[`DockPanelRecord.state`](/api/types/interfaces/DockPanelRecord) back as its
`params`. To restore _content_ (a chat session, a scroll position), write that
state through `api.updateParameters({ … })` as it changes and read it back from
`props.params` on the next launch — `state` is a serializable bag whose shape is
your panel's own contract, not something the host inspects.

## Types

Pass [`DockPanelKind`](/api/types/interfaces/DockPanelKind).

Related: [`DockPanelApi`](/api/types/interfaces/DockPanelApi),
[`DockPanelRecord`](/api/types/interfaces/DockPanelRecord).

## See also

Other [Registration](/api/#registration) members on `ctx`.
