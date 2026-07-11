# Type Alias: Permission

```ts
type Permission = "fs:read" | "fs:write" | "process" | "network" | "webview";
```

Defined in: [packages/sdk/src/permissions.ts:28](https://github.com/silo-code/silo/blob/main/packages/sdk/src/permissions.ts#L28)

A capability an extension declares in its manifest (`silo.permissions`) to
request access **beyond the open workspace**. With none declared, an
extension's [FileService](../interfaces/FileService.md) / [ProcessService](../interfaces/ProcessService.md) access is confined to
the workspace folder(s); each permission lifts one part of that confinement,
and the user consents to the set at install.

- `fs:read` — read files outside the workspace.
- `fs:write` — write files outside the workspace.
- `process` — run commands with a working directory outside the workspace.
- `network` — make outbound network requests. Declarative consent only until
  sandboxed execution lands (in-process code can reach the network directly);
  declare it so the capability is reviewable and shown at install.
- `webview` — use [ExtensionContext.webview](../interfaces/ExtensionContext.md#webview) to get real DOM access,
  script execution, and native pixel capture inside an iframe you own,
  including cross-origin content. Declare it because this reaches into
  arbitrary embedded pages, not because it touches the filesystem/network
  directly.
