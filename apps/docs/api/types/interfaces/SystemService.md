# Interface: SystemService

Defined in: [packages/sdk/src/system-service.ts:70](https://github.com/silo-code/silo/blob/main/packages/sdk/src/system-service.ts#L70)

Read-only snapshot of the host machine and Silo version. Exposed as
[ExtensionContext.system](ExtensionContext.md#system).

All values are static — they are baked into the binary at compile time and
do not change during a session. `getInfo()` resolves on the first call and
returns the cached result on every subsequent call.

## Example

```ts
export const extension: Extension = {
  id: "my.platform-aware",
  async activate(ctx) {
    const { os, arch, siloVersion } = await ctx.system.getInfo();

    if (os === "macos") {
      // Register a macOS-specific command.
      ctx.subscriptions.push(
        ctx.registerCommand({
          id: "my.reveal-in-finder",
          label: "Reveal in Finder",
          run() { ... },
        }),
      );
    }

    ctx.ui.notify("info", `Running Silo ${siloVersion} on ${os}/${arch}`);
  },
};
```

## Methods

### getInfo()

```ts
getInfo(): Promise<SystemInfo>;
```

Defined in: [packages/sdk/src/system-service.ts:75](https://github.com/silo-code/silo/blob/main/packages/sdk/src/system-service.ts#L75)

Resolve the host-platform snapshot. Resolves immediately after the first
call (the result is cached) — safe to `await` in `activate`.

#### Returns

`Promise`\<[`SystemInfo`](SystemInfo.md)\>
