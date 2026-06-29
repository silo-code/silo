# Interface: SystemInfo

Defined in: [packages/sdk/src/system-service.ts:13](https://github.com/silo-code/silo/blob/main/packages/sdk/src/system-service.ts#L13)

A point-in-time snapshot of the host machine and application version.
Returned by [SystemService.getInfo](SystemService.md#getinfo). All fields are static for the
lifetime of the app — cache freely.

## Properties

### os

```ts
os: "macos" | "linux" | "windows";
```

Defined in: [packages/sdk/src/system-service.ts:21](https://github.com/silo-code/silo/blob/main/packages/sdk/src/system-service.ts#L21)

The host operating system.

- `"macos"` — macOS (Apple Silicon or Intel)
- `"linux"` — Linux
- `"windows"` — Windows

***

### arch

```ts
arch: string;
```

Defined in: [packages/sdk/src/system-service.ts:28](https://github.com/silo-code/silo/blob/main/packages/sdk/src/system-service.ts#L28)

The CPU architecture the app binary was compiled for, e.g. `"aarch64"` or
`"x86_64"`. Uses Rust's `std::env::consts::ARCH` vocabulary — common values
on Silo's targets are `"aarch64"` (Apple Silicon, ARM) and `"x86_64"` (Intel
/ AMD64).

***

### siloVersion

```ts
siloVersion: string;
```

Defined in: [packages/sdk/src/system-service.ts:33](https://github.com/silo-code/silo/blob/main/packages/sdk/src/system-service.ts#L33)

The running Silo application version from the bundle manifest, e.g.
`"0.15.0"`.
