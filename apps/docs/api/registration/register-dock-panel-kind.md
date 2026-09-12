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

## Types

Pass [`DockPanelKind`](/api/types/interfaces/DockPanelKind).

Related: [`DockPanelApi`](/api/types/interfaces/DockPanelApi).

## See also

Other [Registration](/api/#registration) members on `ctx`.
