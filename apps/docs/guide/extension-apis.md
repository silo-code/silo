# Extension-to-extension APIs

Extensions don't just talk to Silo — they can talk to **each other**. An
extension can publish a typed API that other extensions call directly, the
same way `silo.git` publishes `GitAPI` for the Git panel, the diff editor, and
any third-party extension to consume identically. This page covers both
sides: consuming another extension's API, and publishing your own.

## Extensions can be headless

A **provider extension** needs no UI at all. The whole contract is `id` +
`activate` ([What is an extension?](/guide/what-is-an-extension)) — if
`activate` returns a value, that value becomes the extension's published API,
whether or not it registered a single panel, command, or status item:

```ts
import type { Extension } from "@silo-code/sdk";

export interface RandomAPI {
  pick<T>(items: T[]): T;
}

export const extension: Extension<RandomAPI> = {
  id: "acme.random",
  activate(ctx): RandomAPI {
    return {
      pick: (items) => items[Math.floor(Math.random() * items.length)]!,
    };
  },
};
```

That's a complete, valid extension — nothing registered against `ctx`, just a
capability other extensions can build on. This is the pattern behind
`silo.git` itself: it registers a diff content provider (so diffs render even
with the Git panel disabled) and publishes `GitAPI` — the panel UI is a
_separate_ extension, `silo.git-explorer`, that consumes `GitAPI` the same
way a third party would. If you're building something another extension
author might want to build _on_ — not just a feature for end users — consider
shipping it as a provider rather than folding it into a single monolithic
extension.

## Consuming another extension's API

[`ctx.getExtension<API>(id)`](/api/other/get-extension) resolves a handle to
another extension by id:

```ts
const git = ctx.getExtension<GitAPI>("silo.git");
if (git?.active && git.api) {
  const status = await git.api.status(cwd);
}
```

The `<API>` type parameter is what makes `git.api` come back typed instead of
`unknown` — but it's **only a compile-time assertion**. `getExtension` looks
extensions up by a plain string id at runtime; nothing checks that the
extension behind `"silo.git"` actually returns something shaped like
`GitAPI`. That gap is exactly why the next section matters.

Always handle absence: the provider might be disabled, not installed, or
simply not activated yet (extension activation order isn't guaranteed) — call
`getExtension` at the point you need it, not once inside your own `activate`.

## Publishing an API others can depend on

Returning a typed object from `activate` is only half the story. A consumer
in a _different_ npm package can't `import type` something that only exists
inside your extension's own source — they need your types to exist somewhere
they can install.

**Ship your API's types as their own npm package**, separate from the
extension itself. `@silo-code/git-api` is the real, worked example: it holds
nothing but `GitAPI` and its supporting types (plus one tiny runtime
null-object, `NULL_GIT_REPO_STORE`) — no UI, no `git` process code, no
dependency on anything except `@silo-code/sdk` for shared types like
`Disposable`. The actual implementation (`silo.git`'s `activate`) lives in a
completely different package and depends on this types package the same way
any consumer would.

```
your-extension/        ← the runtime: activate() returns the API
your-api/               ← published to npm: just the types (+ maybe a tiny helper)
  package.json          ← name: "@you/your-api", depends only on @silo-code/sdk
  src/index.ts           export interface YourAPI { ... }
```

A consumer adds your types package as a **devDependency** — never a regular
dependency, since they only need it for compile-time types; the real
implementation arrives at runtime via `getExtension`, not a bundled import:

```sh
npm i -D @you/your-api
```

**Do not mark it `external`**, even though that's what an extension does for
`@silo-code/sdk` and `react`. Those two work as externals because the host
hands them to every loaded extension; your API package isn't on that list, so
an external bare specifier survives into the consumer's bundle with nothing to
resolve it and their extension fails to load. Leaving it bundled costs nothing
— `import type` erases entirely, and a small runtime helper (like
`@silo-code/git-api`'s `NULL_GIT_REPO_STORE`) inlines. The live implementation
still comes from `getExtension` either way.

```ts
import type { YourAPI } from "@you/your-api";

const yours = ctx.getExtension<YourAPI>("you.your-extension-id");
```

Why a whole separate package instead of just documenting the shape in a
README? Because `import type { YourAPI } from "@you/your-api"` gives
consumers real compiler errors the moment your API changes shape — a hand-copied
interface silently drifts from what your `activate` actually returns.

See [`@silo-code/git-api`](https://github.com/silo-code/silo/tree/main/packages/git-api)
for the complete pattern end to end, and
[ADR 0009](https://github.com/silo-code/silo/blob/main/docs/decisions/0009-extension-communication-and-events.md)
for the architectural reasoning (published APIs over a global event bus).

## Next

**The mechanism, in full** — [`ctx.getExtension`](/api/other/get-extension)
covers the exact signatures and the `ExtensionHandle` type.

**Events, not just calls** — a provider can also expose typed
[`Event<T>`](/api/other/event) members (`onDidChangeX`) for consumers who want
to react to changes rather than poll — the domain-owned-events half of ADR 0009.
