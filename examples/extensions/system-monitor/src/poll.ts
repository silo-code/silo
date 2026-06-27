import type { ExtensionContext } from "@silo-code/sdk";
import {
  parseIostatOutput,
  parseVmStatOutput,
  pushCpuSample,
  POLL_MS,
} from "./metrics";
import { sysmonStore } from "./store";
import type { LiveData, PanelId, Settings } from "./store";

// Returns the set of metric ids that are currently visible (enabled in panel
// or status bar). The poll skips fetching a metric when it is not in this set.
export function neededMetrics(settings: Settings): Set<PanelId> {
  const needed = new Set<PanelId>();
  for (const item of [...settings.panels, ...settings.statusBar]) {
    if (item.enabled) needed.add(item.id);
  }
  return needed;
}

export function startPolling(ctx: ExtensionContext): () => void {
  let cancelled = false;

  async function poll() {
    const needed = neededMetrics(sysmonStore.settings);
    if (needed.size === 0) return;

    try {
      const [ioResult, memResult] = await Promise.all([
        needed.has("cpu")
          ? ctx.process.exec("iostat", ["-c", "2", "-w", "1"])
          : Promise.resolve(null),
        needed.has("memory")
          ? ctx.process.exec("sh", ["-c", "vm_stat && sysctl -n hw.memsize"])
          : Promise.resolve(null),
      ]);
      if (cancelled) return;

      const patch: Partial<LiveData> = { error: null };

      if (ioResult !== null) {
        const cpu = parseIostatOutput(ioResult.stdout);
        if (!cpu) {
          patch.error =
            "Could not parse CPU stats.\nThis extension requires macOS.";
        } else {
          patch.cpu = {
            userPct: cpu.user,
            sysPct: cpu.sys,
            history: pushCpuSample(
              sysmonStore.live.cpu?.history ?? [],
              cpu.user,
              cpu.sys,
            ),
          };
        }
      }

      if (memResult !== null) {
        const mem = parseVmStatOutput(memResult.stdout);
        if (!mem) {
          patch.error =
            "Could not parse memory stats.\nThis extension requires macOS.";
        } else {
          patch.memory = {
            totalBytes: mem.totalBytes,
            usedBytes: mem.usedBytes,
            activeBytes: mem.activeBytes,
            wiredBytes: mem.wiredBytes,
            compBytes: mem.compBytes,
            freeBytes: mem.freeBytes,
          };
        }
      }

      sysmonStore.updateLive(patch);
    } catch (e) {
      if (!cancelled) sysmonStore.updateLive({ error: String(e) });
    }
  }

  poll();
  const id = setInterval(poll, POLL_MS);
  return () => {
    cancelled = true;
    clearInterval(id);
  };
}
