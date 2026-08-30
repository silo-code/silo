# Permissions & access

Your extension can read and write files and run commands — but by default only
**inside the folder the user has open**. Reaching beyond that is something you
**ask for**, and the user approves when they install. This page is the rulebook:
what you get for free, how to request more, and what happens when you overstep.

## The default: the workspace is your sandbox

When your extension calls [`ctx.files`](/api/files/) or
[`ctx.process`](/api/process/), it operates inside the user's open
**workspace** — the project folder (and any extra folders) they're working in.
You can read, write, list, watch, and run commands there with no setup and no
permission prompt.

```ts
// all of this just works — it's inside the workspace
const pkg = await ctx.files.readText("package.json");
await ctx.files.writeText("out/report.md", report);
const status = await ctx.process.exec("git", ["status"]);
```

That covers most extensions: a linter, a formatter, a notes panel, a task
runner — they all live in the project the user opened.

## Paths are relative to the workspace

Pass **workspace-relative paths** and they resolve against the open folder:

```ts
await ctx.files.readText("src/index.ts"); // → <workspace>/src/index.ts
await ctx.files.readText("./notes.md"); // → <workspace>/notes.md
```

Absolute paths work too **as long as they point inside the workspace**. A path
that lands outside every open folder is refused unless you've requested the
matching permission (below):

```ts
// ✅ absolute, but inside the open folder
await ctx.files.writeText(`${root}/dist/bundle.js`, code);

// ❌ outside the workspace — refused without a permission
await ctx.files.readText("/etc/hosts");
await ctx.files.readText("~/.ssh/id_rsa");
```

Commands run the same way: a process you spawn or `exec` defaults its working
directory to the workspace, and a `cwd` you pass has to resolve inside it.

```ts
// ✅ runs in the workspace
await ctx.process.exec("npm", ["test"]);

// ❌ escaping the workspace — refused without a permission
await ctx.process.exec("ls", ["/"], { cwd: "/" });
```

::: tip Prefer relative paths
Relative paths are portable — they work the same on every user's machine, no
matter where they cloned the project. Reach for an absolute path only when you
genuinely need one, and expect it to be checked against the workspace.
:::

## Your own storage directory needs no permission

Every extension gets a **directory of its own** from
[`ctx.storage`](/api/storage/) — the place for a data file that isn't part of the
user's project. Paths inside it are readable and writable through `ctx.files`
with **no `fs:read` or `fs:write` declared**: it's your storage, so it's inside
your sandbox, just like the open workspace folder.

```ts
const dir = await ctx.storage.globalDir(); // created on first call
await ctx.files.writeText(`${dir}/tasks.jsonl`, body); // ✅ no permission needed
```

So don't invent a path under the user's home directory and declare `fs:write` to
reach it — that asks for access to the entire filesystem when all you needed was
one folder. See [`ctx.storage`](/api/storage/#storage-directories) for the
details (including that relative paths still resolve against the workspace).

The exemption covers `ctx.files` only: running a command _in_ that directory
still needs `process`.

## Asking for more

Need to go beyond the workspace — read a file in the user's home directory, run a
tool anywhere, make a network request? **Declare it** in your `package.json`. The
user sees exactly what you're asking for when they install, and approves it once.

```jsonc
{
  "silo": {
    "id": "acme.hello",
    "engine": "^0.1",
    "main": "dist/index.js",
    "permissions": [
      "fs:read", // read files outside the workspace
      "fs:write", // write files outside the workspace
      "process", // run commands outside the workspace
      "network", // make outbound network requests
    ],
  },
}
```

| Permission | Lets you…                                                                         |
| ---------- | --------------------------------------------------------------------------------- |
| _(none)_   | read / write / run **inside the workspace**, plus read/write your own storage dir |
| `fs:read`  | read files anywhere on disk                                                       |
| `fs:write` | write files anywhere on disk                                                      |
| `process`  | run commands with any working directory                                           |
| `network`  | make outbound network requests                                                    |

**Ask for the least you need.** An extension with no `permissions` installs with
no prompt at all — the smoothest experience for your users. Every permission you
add is one more thing the user has to agree to, so request a capability only when
a feature truly requires it.

## When a call is refused

If your extension touches something it isn't allowed to — a path outside the
workspace without `fs:read`, say — the call **throws** rather than silently doing
nothing. Catch it and degrade gracefully:

```ts
try {
  const text = await ctx.files.readText(somePath);
  render(text);
} catch (err) {
  // out-of-scope path, or a permission the user declined
  showMessage("Can't read that file — it's outside the workspace.");
}
```

Don't assume every path resolves. Handle the refusal the same way you'd handle a
missing file, and your extension stays robust whatever folder the user opens.

## A note on trust

Silo extensions run in the same process as the app, so today these boundaries
protect against honest **mistakes** — they keep a well-behaved extension from
wandering off the workspace by accident — more than they contain hostile code.
**Sandboxed execution**, which turns them into a hard wall around untrusted
extensions, is on the way. Either way, the rules above are the contract: build to
them and your extension behaves correctly now and after sandboxing lands. For
users, the guidance is the usual one — install extensions you trust.

## See it in action

The [`permissions-demo-extension`](https://github.com/silo-code/silo/tree/main/examples/extensions/permissions-demo-extension)
example declares `fs:read`, so installing it shows the consent prompt, then its
status-bar button runs a read inside the workspace (allowed), a read outside
(allowed by the grant), and a write outside (still blocked) — the whole model in
one click.

## See also

- [`ctx.files`](/api/files/) — read, write, list, and watch files.
- [`ctx.process`](/api/process/) — run commands and long-lived processes.
- [Publishing an extension](/guide/publishing-an-extension) — the `package.json`
  manifest the `permissions` key lives in.
