import type { ExtensionContext } from "@silo-code/sdk";
import {
  parseIostatOutput,
  parseVmStatOutput,
  pushCpuSample,
  POLL_MS,
} from "./metrics";
import { sysmonStore } from "./store";

export function startPolling(ctx: ExtensionContext): () => void {
  let cancelled = false;

  async function poll() {
    try {
      const [ioResult, memResult] = await Promise.all([
        ctx.process.exec("iostat", ["-c", "2", "-w", "1"]),
        ctx.process.exec("sh", ["-c", "vm_stat && sysctl -n hw.memsize"]),
      ]);
      if (cancelled) return;
      const cpu = parseIostatOutput(ioResult.stdout);
      const mem = parseVmStatOutput(memResult.stdout);
      if (!cpu || !mem) {
        sysmonStore.updateLive({
          error:
            "Could not parse system stats.\nThis extension requires macOS.",
        });
        return;
      }
      sysmonStore.updateLive({
        snapshot: { cpuUserPct: cpu.user, cpuSysPct: cpu.sys, ...mem },
        cpuHistory: pushCpuSample(
          sysmonStore.live.cpuHistory,
          cpu.user,
          cpu.sys,
        ),
        error: null,
      });
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
