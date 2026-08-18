# @silo-code/git-api

Published types for [Silo](https://github.com/silo-code/silo)'s `silo.git`
provider: the one-shot `GitAPI` (status, diff, commit, branches, remotes,
worktrees, …)
and the live `GitRepoStore` watch session (`GitAPI.watchRepo`). Import types
from this package at build time; retrieve the live implementation at runtime
through `@silo-code/sdk`'s `ctx.getExtension`.

## Install

```sh
npm i -D @silo-code/git-api
```

Install it as a **devDependency** — you need it to compile, not to ship.

**Do not mark it external.** Unlike `@silo-code/sdk` and `react`, this package
is _not_ one of the modules the Silo host hands to a loaded extension
(`SHARED_DEPS` is `react`, `react/jsx-runtime`, `@silo-code/sdk` — nothing
else). An external bare `import … from "@silo-code/git-api"` survives into
your bundle with nothing to resolve it, and the extension fails to load. Leave
it bundled: the type-only imports erase to nothing, and the one runtime export
(`NULL_GIT_REPO_STORE`, a small null-object literal) inlines. The real
implementation still arrives at runtime through `ctx.getExtension("silo.git")`
— that's unaffected either way.

`@silo-code/sdk` is a **peer** dependency (`>=0.34.0`, a floor only — the same
additive-only shape `silo.engine` uses), not a hard one: the only thing this
package takes from the SDK is two types (`Disposable`, `Event`). Depending on
it directly would pin an exact SDK version into every consumer's tree and give
them a second, older nested copy to resolve those types out of. You already
depend on the SDK yourself, and that copy is the one that gets used.

## Usage

```ts
import type { GitAPI } from "@silo-code/git-api";
import { NULL_GIT_REPO_STORE } from "@silo-code/git-api";
import { useServiceState } from "@silo-code/sdk";

const git = ctx.getExtension<GitAPI>("silo.git")?.api;
const repo = git?.watchRepo(folder) ?? NULL_GIT_REPO_STORE;
const { status, worktrees } = useServiceState(repo);
```

## Which Silo version ships which member

`GitAPI` is implemented by `silo.git`, which is **bundled into the Silo app** —
so the version that matters at runtime is the _host's_, not this package's. A
newer `@silo-code/git-api` in your `devDependencies` will happily typecheck
against a member the running host has never heard of; the failure lands at
runtime as `api.newThing is not a function`.

Declare the floor in your extension's manifest so Silo can warn the user:

```json
{ "silo": { "id": "you.your-extension", "engine": "^0.49.0" } }
```

| `@silo-code/git-api` | First Silo release | Added                                              |
| -------------------- | ------------------ | -------------------------------------------------- |
| 0.4.0                | 0.49.0             | `remotes`, `GitRemote`                             |
| 0.3.0                | 0.49.0             | `lockWorktree`, `unlockWorktree`                   |
| 0.2.0                | 0.47.0             | `watchRepo`, `GitRepoStore`, `NULL_GIT_REPO_STORE` |

This package releases independently of the app, so a version can sit on npm
for a while before any Silo release implements it — 0.3.0 published ahead of
0.49.0 exactly that way. Check this table, not npm's "latest", when picking
your `engine` floor.

Note what `silo.engine` does and doesn't do: it's **advisory**. An
incompatible extension shows a warning at install and in the extensions list,
but the user can still install it, and the host still loads it. If you want a
newer member without hard-breaking users on an older host, feature-detect it
and keep a fallback:

```ts
const git = ctx.getExtension<GitAPI>("silo.git")?.api;
const remotes =
  typeof git?.remotes === "function"
    ? await git.remotes(folder)
    : await legacyRemotesViaExec(folder);
```

See ADR 0009 and ADR 0037 in `silo-code/silo` for the rationale.
