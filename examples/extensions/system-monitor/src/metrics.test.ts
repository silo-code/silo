import { describe, it, expect } from "vitest";
import {
  parseIostatOutput,
  parseVmStatOutput,
  pushCpuSample,
  formatBytes,
  MAX_SAMPLES,
} from "./metrics";

// ── iostat fixtures ───────────────────────────────────────────────────────────

const IOSTAT_SAMPLE = `
              disk0       cpu    load average
    KB/t  tps  MB/s  us sy id   1m   5m   15m
   25.69  944 23.68  20 11 70  6.96 6.78 7.05
    9.88 1753 16.91  38 21 42  6.96 6.78 7.05
`.trim();

describe("parseIostatOutput", () => {
  it("reads user and sys from the last data row", () => {
    const r = parseIostatOutput(IOSTAT_SAMPLE);
    expect(r?.user).toBe(38);
    expect(r?.sys).toBe(21);
  });

  it("caps user at 100, leaves sys unchanged if under 100", () => {
    const mangled = IOSTAT_SAMPLE.replace(/38 21 42/, "120 90 0");
    const r = parseIostatOutput(mangled);
    expect(r?.user).toBe(100); // 120 → capped
    expect(r?.sys).toBe(90); // 90 → unchanged
  });

  it("returns null for empty / unrecognised output", () => {
    expect(parseIostatOutput("")).toBeNull();
    expect(parseIostatOutput("hello world")).toBeNull();
  });
});

// ── vm_stat fixtures ──────────────────────────────────────────────────────────

// 32 GiB machine, 16 384 byte pages (Apple Silicon)
const VM_STAT_SAMPLE = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                     3763.
Pages active:                                 386314.
Pages inactive:                               383047.
Pages speculative:                              1870.
Pages throttled:                                   0.
Pages wired down:                             266484.
Pages purgeable:                                 226.
"Translation faults":                     5174295619.
Pages copy-on-write:                      1348688691.
Pages zero filled:                        2551763394.
Pages reactivated:                         603652994.
Pages purged:                              120702353.
File-backed pages:                            261298.
Anonymous pages:                              509933.
Pages stored in compressor:                  4527274.
Pages occupied by compressor:                1015753.
Decompressions:                            523236597.
Compressions:                              603164805.
Pageins:                                   200958310.
Pageouts:                                    2459611.
Swapins:                                     9223720.
Swapouts:                                   11713270.
34359738368`;

const PAGE = 16384;
const TOTAL_RAM = 34359738368;

// From the fixture:
//   Anonymous pages = 509933   → Activity Monitor "App Memory" (all non-file-backed, active+inactive)
//   Pages active    = 386314   → only recently-used pages, NOT what Activity Monitor uses
//   Pages wired down = 266484
//   Pages occupied by compressor = 1015753 (physical; "stored" = 4527274 is the logical/virtual count)
const ANON_PAGES = 509933;
const WIRED_PAGES = 266484;
const COMP_PAGES = 1015753;
const COMMITTED = (ANON_PAGES + WIRED_PAGES + COMP_PAGES) * PAGE;

describe("parseVmStatOutput", () => {
  it("reads total RAM from the last line", () => {
    const r = parseVmStatOutput(VM_STAT_SAMPLE);
    expect(r?.totalBytes).toBe(TOTAL_RAM);
  });

  it("reads anonymous pages for App segment (not Pages active)", () => {
    const r = parseVmStatOutput(VM_STAT_SAMPLE);
    expect(r?.activeBytes).toBe(ANON_PAGES * PAGE);
  });

  it("reads wired pages", () => {
    const r = parseVmStatOutput(VM_STAT_SAMPLE);
    expect(r?.wiredBytes).toBe(WIRED_PAGES * PAGE);
  });

  it("reads physical compressor pages (Pages occupied by compressor, not stored)", () => {
    const r = parseVmStatOutput(VM_STAT_SAMPLE);
    expect(r?.compBytes).toBe(COMP_PAGES * PAGE);
  });

  it("free is residual: total - wired - active - compressed", () => {
    const r = parseVmStatOutput(VM_STAT_SAMPLE);
    expect(r?.freeBytes).toBe(TOTAL_RAM - COMMITTED);
  });

  it("used = wired + active + compressed (segments sum to total)", () => {
    const r = parseVmStatOutput(VM_STAT_SAMPLE);
    expect(r?.usedBytes).toBe(COMMITTED);
    // Sanity: used + free === total
    expect((r?.usedBytes ?? 0) + (r?.freeBytes ?? 0)).toBe(TOTAL_RAM);
  });

  it("returns null when sysctl line is missing", () => {
    const noSysctl = VM_STAT_SAMPLE.split("\n").slice(0, -1).join("\n");
    expect(parseVmStatOutput(noSysctl)).toBeNull();
  });
});

// ── pushCpuSample ─────────────────────────────────────────────────────────────

describe("pushCpuSample", () => {
  it("appends a sample", () => {
    const h = pushCpuSample([{ user: 10, sys: 5 }], 20, 8);
    expect(h).toHaveLength(2);
    expect(h[1]).toEqual({ user: 20, sys: 8 });
  });

  it("drops the oldest when at MAX_SAMPLES", () => {
    const full = Array.from({ length: MAX_SAMPLES }, (_, i) => ({
      user: i,
      sys: 0,
    }));
    const next = pushCpuSample(full, 999, 1);
    expect(next).toHaveLength(MAX_SAMPLES);
    expect(next[0].user).toBe(1);
    expect(next[next.length - 1]).toEqual({ user: 999, sys: 1 });
  });

  it("does not mutate the input array", () => {
    const orig = [{ user: 1, sys: 1 }];
    pushCpuSample(orig, 2, 2);
    expect(orig).toHaveLength(1);
  });
});

// ── formatBytes ───────────────────────────────────────────────────────────────

describe("formatBytes", () => {
  it("formats GB values", () => {
    expect(formatBytes(16 * 1024 ** 3)).toBe("16.0 GB");
    expect(formatBytes(1.5 * 1024 ** 3)).toBe("1.5 GB");
  });

  it("formats MB values", () => {
    expect(formatBytes(512 * 1024 ** 2)).toBe("512 MB");
    expect(formatBytes(648 * 1024 ** 2)).toBe("648 MB");
  });
});
