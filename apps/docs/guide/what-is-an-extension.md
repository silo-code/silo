# What is an extension?

A Silo extension is a small object with an `id` and an `activate` function. The
host calls `activate` once at startup and hands it an
[`ExtensionContext`](/api/) — usually called `ctx`. Everything
your extension adds to the app, it adds through `ctx`.

```ts
import type { Extension } from "@silo-code/sdk";

export const extension: Extension = {
  id: "acme.hello",
  activate(ctx) {
    // register viewers, commands, panels… against ctx here
  },
};
```

That's the whole contract ([`Extension`](/api/types/interfaces/Extension)). There's an optional
`deactivate()` for cleanup, reserved for when dynamic load/unload lands.

## The one rule

> An extension touches the running app **only** through `ctx` and the
> [`@silo-code/sdk`](/api/) **types**. It never imports app internals.

This isn't a style preference — it's enforced (a lint rule fails the build if an
extension reaches into the app's state, services, or UI directly). The payoff is
that extensions stay decoupled from the app's internals, so the app can evolve
without breaking them. The status-bar toggle below — a complete extension —
imports nothing but SDK types.

```ts
import type { Extension } from "@silo-code/sdk";
import { useServiceState } from "@silo-code/sdk";

export const extension: Extension = {
  id: "acme.panel-toggle",
  activate(ctx) {
    const { layout } = ctx;

    function PanelToggles() {
      const state = useServiceState(layout);       // read state via a typed service
      return (
        <button
          className={state.left.collapsed ? "" : "active"}
          onClick={() => ctx.executeCommand("view.toggleLeftPanel")}  // act via a command
        >
          ▢
        </button>
      );
    }

    ctx.registerStatusItem({ id: "panel-toggles", alignment: "right", component: PanelToggles });
  },
};
```

It **reads** state through a typed service (`ctx.layout`) and **acts** by
invoking a command (`ctx.executeCommand`) — never by importing the app's store.

## How `ctx` is organized

Everything `ctx` offers falls into three groups:

| Group            | What it's for                                                                                                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Registration** | `register*` methods that add things to the app — viewers, side panels, status items, commands, keybindings, menu items, file types, dock panels, settings pages. Each returns a [`Disposable`](/api/types/interfaces/Disposable). |
| **State**        | typed services that read & drive app state — [`ctx.workspaces`](/api/state/workspaces) (workspaces and editor tabs) and [`ctx.layout`](/api/state/layout) (side-panel collapse) — so you never reach into the store.              |
| **Other**        | [`ctx.executeCommand(id)`](/api/other/execute-command) to invoke any registered command, plus `ctx.extensionId` and `ctx.subscriptions`.                                                                                          |

The **[API Reference](/api/)** walks through every member of each group, with
signatures, examples, and links to the type definitions.

## Next

**Build one** — [Your first extension](/guide/getting-started) walks through a
complete, working status-bar clock step by step. Prefer to describe what you
want and let an AI do the scaffolding? See [Build with Claude Code](/guide/claude-skill).

**Polish the UI** — [Styling your extension](/guide/styling),
[Workspace status, sections & badges](/guide/workspace-status),
[Keyboard navigation](/guide/keyboard-navigation), and
[Building a theme](/guide/theming) cover the visual surface.

**Ship it** — [Permissions & access](/guide/permissions),
[Publishing an extension](/guide/publishing-an-extension), and
[Sharing extensions](/guide/sharing-extensions) cover the packaging and
distribution side.

**Explore `ctx`** — the [API Reference](/api/) documents every member with
signatures, examples, and generated type definitions.
