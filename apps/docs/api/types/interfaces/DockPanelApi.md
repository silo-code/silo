# Interface: DockPanelApi

Defined in: [packages/sdk/src/types.ts:76](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L76)

The panel API handed to a [DockPanelKind](DockPanelKind.md) component. Use these methods
to drive the panel's own tab (title, close, focus) and update its stored
parameters. The host provides the implementation; extensions never construct
this object directly.

## Properties

### isActive

```ts
readonly isActive: boolean;
```

Defined in: [packages/sdk/src/types.ts:84](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L84)

`true` while this panel is the active one in its dock group.

***

### isVisible

```ts
readonly isVisible: boolean;
```

Defined in: [packages/sdk/src/types.ts:130](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L130)

`true` while this panel is visible — its tab is the selected one in its
group. Distinct from [isActive](#isactive): with split
groups, every group's selected tab is visible but only one panel in the
whole dock is active.

## Methods

### setTitle()

```ts
setTitle(title): void;
```

Defined in: [packages/sdk/src/types.ts:78](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L78)

Update the title shown in the panel's tab.

#### Parameters

##### title

`string`

#### Returns

`void`

***

### close()

```ts
close(): void;
```

Defined in: [packages/sdk/src/types.ts:80](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L80)

Programmatically close this panel.

#### Returns

`void`

***

### setActive()

```ts
setActive(): void;
```

Defined in: [packages/sdk/src/types.ts:82](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L82)

Bring this panel to focus (make it the active panel in its group).

#### Returns

`void`

***

### onDidActiveChange()

```ts
onDidActiveChange(listener): Disposable;
```

Defined in: [packages/sdk/src/types.ts:90](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L90)

Subscribe to active-state transitions. The listener is called whenever
the panel gains or loses active status, with an event carrying the new
state. Returns a [Disposable](Disposable.md) that cancels the subscription.

#### Parameters

##### listener

(`event`) => `void`

#### Returns

[`Disposable`](Disposable.md)

***

### onDidRequestFocus()

```ts
onDidRequestFocus(listener): Disposable;
```

Defined in: [packages/sdk/src/types.ts:123](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L123)

Subscribe to the user asking, by gesture, for keyboard focus in this
panel — fired on every click of its tab, including one that leaves
[isActive](#isactive) unchanged because the tab was
already active.

That already-active case is why the event exists: it has no other signal.
[onDidActiveChange](#ondidactivechange) only fires on a
real transition, so clicking back into an already-active tab from
elsewhere (a side panel, the status bar) is otherwise silent even though
the user's intent — "put keyboard focus here" — is identical to a genuine
activation. A panel that drives its own entry focus from
`onDidActiveChange` should drive it from this event too, guarded on
`isActive`, so both paths land focus the same way.

The name is the intent, but today exactly one gesture carries it:

- **Fires** on a primary click of this panel's tab, whether or not the
  panel was already the active one.
- **Does not fire** for activation from anywhere else —
  [setActive](#setactive), a keybinding, a command or
  command-palette jump, or the host restoring a saved layout. Those change
  which panel is active, so they surface as `onDidActiveChange` instead;
  none of them reaches this event.
- **Does not fire** for a click inside the panel's own content (focus
  there is yours to manage), the tab's close button, or a middle-click
  close.

Returns a [Disposable](Disposable.md) that cancels the subscription.

#### Parameters

##### listener

() => `void`

#### Returns

[`Disposable`](Disposable.md)

***

### onDidVisibilityChange()

```ts
onDidVisibilityChange(listener): Disposable;
```

Defined in: [packages/sdk/src/types.ts:137](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L137)

Subscribe to visibility transitions (the panel's tab being selected or
deselected in its group). Use to pause expensive work while hidden, or to
re-measure on reveal (e.g. the terminal refits xterm when its tab becomes
visible again). Returns a [Disposable](Disposable.md) that cancels the subscription.

#### Parameters

##### listener

(`event`) => `void`

#### Returns

[`Disposable`](Disposable.md)

***

### updateParameters()

```ts
updateParameters(params): void;
```

Defined in: [packages/sdk/src/types.ts:145](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L145)

Shallow-merge `params` into this panel's stored parameters. Keys absent
from `params` are left unchanged. Useful for keeping tabs-serializable
state (e.g. the open URL in a web-viewer panel) consistent with the UI.

#### Parameters

##### params

`object`

#### Returns

`void`

***

### setAgentSession()

```ts
setAgentSession(agentSessionId): void;
```

Defined in: [packages/sdk/src/types.ts:165](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L165)

Declare — or, with `null`, withdraw — the **Agent Session** this panel is
showing (an `AgentInfo.id` — the `id` on the handle
`ctx.agents.sessions.connect()` returned).

This is the only thing the host lacks about a Chat panel, and declaring it
is what makes the panel an ordinary *subject* of agent chrome rather than
an author of it. Once declared, the host routes this panel's tab through
the same path a terminal tab takes: an [AgentsService.bindActivity](AgentsService.md#bindactivity) /
[AgentsService.bindIcon](AgentsService.md#bindicon) binder's `provide(agentSessionId)` reaches
this tab, [AgentsService.getActive](AgentsService.md#getactive) reports the session while the tab
is the active one (so a finish the user watched raises no badge), and
[AgentsService.close](AgentsService.md#close) closes this panel. None of that requires the
panel to know a badge exists.

Call it once the session is connected, and again with `null` on a teardown
that outlives the panel (switching to a different agent). The host
withdraws it automatically when the panel unmounts.

#### Parameters

##### agentSessionId

`string` \| `null`

#### Returns

`void`

***

### setBreadcrumb()

```ts
setBreadcrumb(crumb): void;
```

Defined in: [packages/sdk/src/types.ts:182](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L182)

Publish the path this panel is showing, for the host-drawn breadcrumb
strip — or, with `null`, show no path crumbs.

Only meaningful for a [DockPanelKind](DockPanelKind.md) that declares
`toolbar: { breadcrumb: true }`; the host draws the strip and this fills in
its crumbs. `null` leaves a strip that carries only contributed
`registerToolbarItem({ surface: "panel" })` items — which is also how a
panel honours a "hide breadcrumbs" setting of its own.

This is the shape of [DockPanelApi.setAgentSession](#setagentsession): the panel states
a fact about itself and the host routes on it. The path is *not* part of
the panel's persisted identity, so it goes here rather than through
[DockPanelApi.updateParameters](#updateparameters). The host withdraws it automatically
when the panel unmounts.

#### Parameters

##### crumb

  \| \{
  `filePath`: `string`;
  `workspaceFolder?`: `string`;
  `leafIcon?`: `"file"` \| `"folder"`;
\}
  \| `null`

###### Type Literal

\{
  `filePath`: `string`;
  `workspaceFolder?`: `string`;
  `leafIcon?`: `"file"` \| `"folder"`;
\}

###### filePath

`string`

Absolute path shown as workspace-relative crumbs.

###### workspaceFolder?

`string`

Workspace folder the path is relativised against, when it is inside one.

###### leafIcon?

`"file"` \| `"folder"`

Glyph on the trailing crumb. Defaults to `"file"`.

***

`null`

#### Returns

`void`
