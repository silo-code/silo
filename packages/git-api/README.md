# @silo-code/git-api

Published types for [Silo](https://github.com/silo-code/silo)'s `silo.git`
provider: the one-shot `GitAPI` (status, diff, commit, branches, worktrees, …)
and the live `GitRepoStore` watch session (`GitAPI.watchRepo`). Import types
from this package at build time; retrieve the live implementation at runtime
through `@silo-code/sdk`'s `ctx.getExtension`.

## Install

```sh
npm i -D @silo-code/git-api
```

Install it as a **devDependency**: an extension never bundles this package.
Mark `@silo-code/git-api` (alongside `@silo-code/sdk` and `react`) as
**external** at build time — the Silo host provides the real `silo.git`
extension at runtime, this package is types only (plus one small runtime
fallback, `NULL_GIT_REPO_STORE`).

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

See ADR 0009 and ADR 0037 in `silo-code/silo` for the rationale.
