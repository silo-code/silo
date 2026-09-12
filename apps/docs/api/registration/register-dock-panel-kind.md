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
`when: (_keys, t) => t.kindId === "acme.chat"`, and read instance data off
`t.params` (your `DockPanelProps["params"]`). The built-in terminal declares
`toolbar` too, so its toolbar items are ordinary `"panel"` items.

## Types

Pass [`DockPanelKind`](/api/types/interfaces/DockPanelKind).

Related: [`DockPanelApi`](/api/types/interfaces/DockPanelApi).

## See also

Other [Registration](/api/#registration) members on `ctx`.
