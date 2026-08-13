# ctx.getExtension <Badge type="tip" text="stable" />

Consume another extension's **published API** — the mechanism that lets features
live _outside_ core (git, terminal, themes) yet expose capabilities to other
extensions. This is how "first-party = third-party" works in practice.

```ts
ctx.getExtension<API>(id: string): ExtensionHandle<API> | undefined
```

## Example

```tsx
// consume the git extension's API, tolerating its absence
const git = ctx.getExtension<GitAPI>("silo.git");
if (git?.active && git.api) {
  const status = await git.api.status(cwd);
}
```

Returns `undefined` if no extension with that id is known. Even when known, its
[`api`](/api/types/interfaces/ExtensionHandle#api) is `undefined` until that
extension has activated — so **always handle absence**: the provider may be
disabled or activate after you. Call `getExtension` at use time, not inside your
own `activate`.

## Publishing an API

The other side of the mechanism: return an object from your `activate` and it
becomes your published API. Nothing else about the extension is required —
`activate` can register zero UI and still be a complete, useful extension;
see [Extension-to-extension APIs](/guide/extension-apis#extensions-can-be-headless)
for a worked headless example.

```ts
export const extension: Extension<GitAPI> = {
  id: "silo.git",
  activate(ctx): GitAPI {
    return { status: (cwd) => /* … */ };
  },
};
```

The `<API>` generic here is compile-time only — `getExtension` resolves by a
plain string id at runtime, so a consumer's type safety depends entirely on
_you_ publishing real types for them to import. Ship your API's types as
their own npm package — [`@silo-code/git-api`](https://github.com/silo-code/silo/tree/main/packages/git-api)
is the reference example — rather than bundling them into the extension
itself; see [Extension-to-extension APIs](/guide/extension-apis#publishing-an-api-others-can-depend-on)
for the full pattern (package shape, `devDependency` + `external`, why a
hand-copied interface isn't enough).

## Types

[`ExtensionHandle`](/api/types/interfaces/ExtensionHandle) ·
[`Extension`](/api/types/interfaces/Extension) (its `activate` return is the API).
