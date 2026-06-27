# System Resources Panel — Extension Plan

A side panel extension that displays live CPU, memory, and other system metrics
with simple historical sparkline graphs. This will be published to a separate
`silo-extensions` repo so other users can install it — meaning it must use
**only the public `ctx` API** and `@silo-code/sdk` types. It cannot use shell
exec hacks or raw Tauri APIs.

This requires adding a new `ctx.system` service to the SDK first.

---

## Architecture overview

```
Third-party extension (silo-extensions repo)
  └─ ctx.system.getMetrics()          ← public SDK surface
       └─ @silo-code/sdk SystemService interface
            └─ extension-host: system-service.ts  (invoke → Rust)
                 └─ src-tauri/src/commands/system.rs
                      └─ sysinfo crate  (cross-platform)
```

The pattern is identical to `ctx.net` / `NetworkService` — the only precedent
to follow.

---

## Part 1 — SDK changes (in this repo)

### 1a. Rust command

**New file:** `apps/desktop/src-tauri/src/commands/system.rs`

Use the [`sysinfo`](https://crates.io/crates/sysinfo) crate (already
widely used in the Tauri ecosystem, cross-platform: macOS/Linux/Windows).

```rust
use serde::Serialize;
use sysinfo::System;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemMetrics {
    pub cpu_usage_pct: f32,      // 0.0–100.0, average across all cores
    pub mem_used_bytes: u64,
    pub mem_total_bytes: u64,
    pub cpu_core_count: usize,
}

#[tauri::command]
pub fn system_get_metrics() -> SystemMetrics {
    let mut sys = System::new_all();
    sys.refresh_all();
    SystemMetrics {
        cpu_usage_pct: sys.global_cpu_usage(),
        mem_used_bytes: sys.used_memory(),
        mem_total_bytes: sys.total_memory(),
        cpu_core_count: sys.cpus().len(),
    }
}
```

Add `sysinfo` to `apps/desktop/src-tauri/Cargo.toml` and register
`commands::system::system_get_metrics` in `lib.rs`'s invoke handler.

> **Note:** `sysinfo` requires two calls for accurate CPU (the first sample is
> always 0). The host service should either keep a long-lived `System` instance
> (via Tauri managed state) or accept the first-sample limitation. Managed state
> is cleaner.

### 1b. Host service

**New file:** `packages/extension-host/src/extension-host/system-service.ts`

Mirrors `network-service.ts` exactly:

```ts
import { invoke } from "@tauri-apps/api/core";
import type { SystemService, SystemMetrics } from "@silo-code/sdk";

let service: SystemService | null = null;

export function getSystemService(): SystemService {
  if (service) return service;
  service = {
    getMetrics(): Promise<SystemMetrics> {
      return invoke<SystemMetrics>("system_get_metrics");
    },
  };
  return service;
}
```

Wire into `context.ts`:

```ts
import { getSystemService } from "./system-service";
// ...
system: getSystemService(),
```

### 1c. SDK interface

**New file:** `packages/sdk/src/system-service.ts`

````ts
/**
 * A point-in-time snapshot of host system resource usage, returned by
 * {@link SystemService.getMetrics}.
 *
 * @category Core Types
 * @public
 */
export interface SystemMetrics {
  /** Average CPU usage across all cores, 0–100. */
  cpuUsagePct: number;
  /** Bytes of RAM currently in use. */
  memUsedBytes: number;
  /** Total installed RAM in bytes. */
  memTotalBytes: number;
  /** Number of logical CPU cores. */
  cpuCoreCount: number;
}

/**
 * Host system resource metrics — CPU and memory. Poll via
 * {@link SystemService.getMetrics} on a timer; pause polling when your panel
 * is not `active` to avoid unnecessary overhead.
 *
 * Exposed as {@link ExtensionContext.system}.
 *
 * @category Consumer Services
 * @public
 */
export interface SystemService {
  /**
   * Fetch a current snapshot of CPU and memory usage. Runs in the Rust
   * backend (via `sysinfo`) so it is cross-platform and non-blocking.
   *
   * @example
   * ```ts
   * const metrics = await ctx.system.getMetrics();
   * const memPct = metrics.memUsedBytes / metrics.memTotalBytes * 100;
   * ```
   */
  getMetrics(): Promise<SystemMetrics>;
}
````

Add `readonly system: SystemService` to `ExtensionContext` in `types.ts`.

Re-export both types from `packages/sdk/src/index.ts`.

### 1d. Docs

- TSDoc on all new symbols: `@public`, `@category Consumer Services` /
  `@category Core Types`
- Hand-authored page: `apps/docs/api/other/system.md`
  (blurb → signature → polling example → type links → see-also)
- Add to `apiSidebar` in `apps/docs/.vitepress/config.ts`
- Link from overview table in `apps/docs/api/index.md`
- Run `pnpm docs:api` to regenerate `apps/docs/api/types/`
- Add roadmap entry as `stable` in `apps/docs/roadmap.md`

### 1e. Tests

- `packages/extension-host/src/extension-host/system-service.test.ts` —
  mock `invoke`, assert `getMetrics` maps the response correctly

---

## Part 2 — The extension (separate `silo-extensions` repo)

A self-contained package that depends only on `@silo-code/sdk` and React.

### Extension skeleton

```ts
// src/system-resources/index.tsx
import type { Extension } from "@silo-code/sdk";
import { SystemResourcesPanel } from "./SystemResourcesPanel";

export const extension: Extension = {
  id: "silo.system-resources",
  manifest: {
    name: "System Resources",
    description: "Live CPU and memory usage with historical sparkline graphs.",
  },
  activate(ctx) {
    ctx.registerSidePanel({
      id: "system-resources",
      location: "right",
      title: "Resources",
      component: (props) => <SystemResourcesPanel ctx={ctx} {...props} />,
      order: 5,
      lazyMount: true,
    });
  },
};
```

### Data fetching

Poll `ctx.system.getMetrics()` on a 2 s interval; pause when `active` is false
(same pattern as `GitView.tsx`):

```ts
useEffect(() => {
  if (!active) return;
  const id = setInterval(async () => {
    const m = await ctx.system.getMetrics();
    addSample({
      ts: Date.now(),
      cpuPct: m.cpuUsagePct,
      memPct: (m.memUsedBytes / m.memTotalBytes) * 100,
    });
  }, 2000);
  return () => clearInterval(id);
}, [active]);
```

No `process` permission needed — `ctx.system` is unrestricted.

### Historical data model

Fixed-length ring buffer in component state:

```ts
interface Sample {
  ts: number;
  cpuPct: number;
  memPct: number;
}
const MAX_SAMPLES = 60; // ~2 min at 2 s

function addSample(prev: Sample[], s: Sample): Sample[] {
  return prev.length >= MAX_SAMPLES ? [...prev.slice(1), s] : [...prev, s];
}
```

Extract `ring-buffer.ts` as a pure helper and unit-test it with Vitest.

### Graphs

Hand-rolled SVG sparklines — zero new deps, sufficient for v1:

```tsx
function Sparkline({ data, width, height, color }: SparklineProps) {
  const max = Math.max(...data, 1);
  const pts = data
    .map(
      (v, i) =>
        `${(i / (data.length - 1)) * width},${height - (v / max) * height}`,
    )
    .join(" ");
  return (
    <svg width={width} height={height}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}
```

If richer charts are needed later (axes, tooltips), consider `uplot` — it's
tiny (~40 kB) compared to `recharts`.

### CSS / theming

Use only design tokens — `--silo-color-*`, `--silo-font*`, `--silo-radius-*`.
No hard-coded colors or px sizes. The `silo/extension-design-tokens-only`
stylelint rule enforces this for any extension targeting the Silo extension SDK.

---

## Phased approach

| Phase | Scope                                                                                                     |
| ----- | --------------------------------------------------------------------------------------------------------- |
| **1** | Add `ctx.system` + `SystemService` to SDK (Rust + host + types + docs)                                    |
| **2** | Build extension in `silo-extensions` repo: panel, polling, sparklines                                     |
| **3** | Publish extension to registry / marketplace                                                               |
| **4** | Richer metrics: per-core CPU breakdown, disk I/O, network throughput (requires expanding `SystemMetrics`) |
