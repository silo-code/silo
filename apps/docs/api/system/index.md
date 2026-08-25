# ctx.system <Badge type="tip" text="stable" />

Static host-platform metadata — the OS, CPU architecture, and running Silo
version. All values are baked into the binary at build time and never change
during a session. Use at activation time to make platform-specific decisions
without branching on runtime strings.

```ts
ctx.system: SystemService
```

## Example

### hello-extension — notify with OS, arch, and version

The [`hello-extension`](https://github.com/silo-code/silo/tree/main/examples/extensions/hello-extension)
starter shows the simplest use: read `ctx.system` in a command and surface the
result as a toast.

```ts
ctx.registerCommand({
  id: "silo.hello.greet",
  label: "Hello: Say hello",
  async run() {
    const { os, arch, siloVersion } = await ctx.system.getInfo();
    ctx.ui.notify(
      "info",
      `👋 Hello, from ${os} ${arch} with Silo v${siloVersion}`,
    );
  },
});
```

Produces a notification like: **👋 Hello, from macos aarch64 with Silo v0.15.0**

### Conditionally register a platform-specific command

```ts
export const extension: Extension = {
  id: "my.platform-aware",
  async activate(ctx) {
    const { os, arch, siloVersion } = await ctx.system.getInfo();

    if (os === "macos") {
      ctx.subscriptions.push(
        ctx.registerCommand({
          id: "my.reveal-in-finder",
          title: "Reveal in Finder",
          run() {
            /* ... */
          },
        }),
      );
    }

    ctx.ui.notify({ title: `Silo ${siloVersion} · ${os}/${arch}` });
  },
};
```

### Show system info in a settings page

```tsx
export const extension: Extension = {
  id: "my.system-info-page",
  activate(ctx) {
    ctx.subscriptions.push(
      ctx.registerSettingsPage({
        id: "my.system-info",
        title: "System",
        render() {
          const [info, setInfo] = useState<SystemInfo | null>(null);
          useEffect(() => {
            ctx.system.getInfo().then(setInfo);
          }, []);
          if (!info) return null;
          return (
            <dl>
              <dt>OS</dt>
              <dd>{info.os}</dd>
              <dt>Arch</dt>
              <dd>{info.arch}</dd>
              <dt>Silo</dt>
              <dd>{info.siloVersion}</dd>
            </dl>
          );
        },
      }),
    );
  },
};
```

### homeDir — resolve the user's home directory

```ts
const home = await ctx.system.homeDir();
```

Absolute path of the current user's home directory (`$HOME` /
`%USERPROFILE%`), host-mediated since extensions have no Node/`os` access.
Cached after the first call, like `getInfo()`. Returning the path string isn't
itself a file read — reading or watching anything under it still goes through
[`ctx.files`](/api/files/) and its normal permission rules.

```ts
const home = await ctx.system.homeDir();
const skillsDir = path.join(home, ".claude", "skills");
if (await ctx.files.pathExists(skillsDir)) {
  const entries = await ctx.files.readDir(skillsDir);
}
```

## API

```ts
interface SystemService {
  getInfo(): Promise<SystemInfo>;
  homeDir(): Promise<string>;
}
```

| Method      | Returns               | Description                                                                     |
| ----------- | --------------------- | ------------------------------------------------------------------------------- |
| `getInfo()` | `Promise<SystemInfo>` | Resolve the host-platform snapshot. Cached after the first call.                |
| `homeDir()` | `Promise<string>`     | Resolve the user's home directory (absolute path). Cached after the first call. |

## Types

- [`SystemService`](/api/types/interfaces/SystemService)
- [`SystemInfo`](/api/types/interfaces/SystemInfo)
