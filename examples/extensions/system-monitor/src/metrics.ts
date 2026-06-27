export const POLL_MS = 2000;
export const MAX_SAMPLES = 150; // ~5 min at 2 s

// ---------------------------------------------------------------------------
// CPU — macOS `iostat -c 2 -w 1`
// Takes exactly 1 second (one sample delta) at near-zero CPU overhead.
// Output has a header + two data rows; we want the LAST row (the delta).
//
//               disk0       cpu    load average
//     KB/t  tps  MB/s  us sy id   1m   5m   15m
//    25.69  944 23.67  20 10 70  6.05 6.89 7.15   ← since boot (discard)
//    52.27 4076 208.04  41 22 38  6.05 6.89 7.15   ← last 1 s  (use this)
// ---------------------------------------------------------------------------

export function parseIostatOutput(
  out: string,
): { user: number; sys: number } | null {
  const dataLines = out
    .trim()
    .split("\n")
    .filter((l) => /^\s*[\d.]/.test(l));
  const last = dataLines[dataLines.length - 1];
  if (!last) return null;
  const cols = last.trim().split(/\s+/);
  // Columns: KB/t tps MB/s us sy id 1m 5m 15m
  const user = parseFloat(cols[3]);
  const sys = parseFloat(cols[4]);
  if (isNaN(user) || isNaN(sys)) return null;
  return { user: Math.min(user, 100), sys: Math.min(sys, 100) };
}

// ---------------------------------------------------------------------------
// Memory — macOS `vm_stat` combined with `sysctl -n hw.memsize`
//
// Run as a single exec:
//   sh -c "vm_stat && sysctl -n hw.memsize"
//
// The last line of stdout is the total RAM in bytes from sysctl.
// Everything before it is vm_stat page counts.
//
// Note: page size on Apple Silicon is 16 384 bytes (not 4 096).
// The page size is declared in the vm_stat header line.
// ---------------------------------------------------------------------------

export interface MemStats {
  totalBytes: number;
  usedBytes: number;
  activeBytes: number; // Anonymous pages × page_size ("App" — matches Activity Monitor)
  wiredBytes: number;
  compBytes: number; // Physical pages in compressor (not logical)
  freeBytes: number; // Residual: total - wired - active - compressed
}

export function parseVmStatOutput(out: string): MemStats | null {
  const lines = out.trim().split("\n");
  const totalRam = parseInt(lines[lines.length - 1], 10);
  if (isNaN(totalRam) || totalRam === 0) return null;

  const vmPart = lines.slice(0, -1).join("\n");

  const pageSizeMatch = vmPart.match(/page size of (\d+) bytes/i);
  const pageSize = pageSizeMatch ? parseInt(pageSizeMatch[1], 10) : 4096;

  function pages(key: string): number {
    const m = vmPart.match(new RegExp(`${key}:\\s+(\\d+)`));
    return m ? parseInt(m[1], 10) * pageSize : 0;
  }

  // "Anonymous pages" = all non-file-backed pages (active + inactive anonymous).
  // This matches Activity Monitor's "App Memory". "Pages active" is a subset and
  // undercounts by the inactive-anonymous pages still sitting in RAM.
  const active = pages("Anonymous pages");
  const wired = pages("Pages wired down");
  // "Pages occupied by compressor" is physical RAM holding compressed data.
  // "Pages stored in compressor" is the logical (pre-compression) count — much larger, wrong for display.
  const comp = pages("Pages occupied by compressor");
  // Free = everything not actively committed: includes inactive, speculative, purgeable.
  const free = totalRam - wired - active - comp;
  const used = totalRam - free;

  if (used <= 0 || free < 0) return null;

  return {
    totalBytes: totalRam,
    usedBytes: used,
    activeBytes: active,
    wiredBytes: wired,
    compBytes: comp,
    freeBytes: free,
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export type CpuSample = { user: number; sys: number };

export function pushCpuSample(
  history: CpuSample[],
  user: number,
  sys: number,
): CpuSample[] {
  const trimmed = history.length >= MAX_SAMPLES ? history.slice(1) : history;
  return [...trimmed, { user, sys }];
}

export function formatBytes(bytes: number): string {
  const GiB = 1024 ** 3;
  const MiB = 1024 ** 2;
  if (bytes >= GiB) return `${(bytes / GiB).toFixed(1)} GB`;
  if (bytes >= MiB) return `${Math.round(bytes / MiB)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
