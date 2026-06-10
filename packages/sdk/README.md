# @silo-code/sdk

The public, **types-first** SDK for building [Silo](https://github.com/silo-code/silo)
extensions. It is the single curated entry point an extension author imports
from — everything re-exported here is a blessed, permanently supported part of
the extension contract. Anything not exported is host-internal and may change
without notice.

## Install

```sh
npm i -D @silo-code/sdk
```

Install it as a **devDependency**: an extension never bundles the SDK. At build
time you mark `@silo-code/sdk` (and `react`) as **external**, and the Silo host
resolves them to its own instances at load time — so there is a single React and
a single SDK across the host↔extension boundary.

## Usage

An extension is an [`Extension`](https://github.com/silo-code/silo) object
with an `activate(ctx)` method. Everything you contribute goes through `ctx`:

```tsx
import type { Extension } from "@silo-code/sdk";

export const extension: Extension = {
  id: "acme.hello",
  activate(ctx) {
    ctx.registerCommand({
      id: "hello.greet",
      label: "Hello: Greet",
      run: () => ctx.ui.notify({ message: "Hello from an extension!" }),
    });
  },
};
```

Read a reactive `ctx` service's state in a React component with
`useServiceState` — the one blessed way to subscribe, replacing hand-rolled
`useSyncExternalStore`:

```tsx
import { useServiceState } from "@silo-code/sdk";

function Panel({ ctx }: { ctx: ExtensionContext }) {
  const ws = useServiceState(ctx.workspaces);
  return <span>{ws.open.length} open workspaces</span>;
}
```

## Stability

Every exported symbol is marked `@public` and documented. The published API
reference is generated directly from this package's source, so the docs are
exactly this surface — no more, no less.

## Docs

- **Guide:** [Your first extension](https://silo.dev/guide/getting-started)
  · [Publishing an extension](https://silo.dev/guide/publishing-an-extension)
- **API reference:** generated from this package — see the
  [docs site](https://silo.dev/).
- **Examples:** [`examples/extensions`](https://github.com/silo-code/silo/tree/main/examples/extensions).

## License

MIT
