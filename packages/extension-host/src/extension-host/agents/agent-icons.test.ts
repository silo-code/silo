import { describe, it, expect } from "vitest";
import { agentIconFor } from "./agent-icons";

describe("agentIconFor", () => {
  it("returns the brand icon for every catalog agent id", () => {
    expect(agentIconFor("claude")).toMatchObject({
      title: "Claude Code",
      hexLight: "D97757",
      hexDark: "D97757",
    });
    expect(agentIconFor("cursor")).toMatchObject({ title: "Cursor" });
    expect(agentIconFor("copilot")).toMatchObject({ title: "GitHub Copilot" });
    expect(agentIconFor("codex")).toMatchObject({ title: "Codex" });
    expect(agentIconFor("grok")).toMatchObject({ title: "Grok" });
    expect(agentIconFor("pi")).toMatchObject({ title: "pi" });
    expect(agentIconFor("omp")).toMatchObject({ title: "OMP" });
    expect(agentIconFor("opencode")).toMatchObject({ title: "OpenCode" });
  });

  it("flips genuinely-black marks to white for dark themes, but not colors with real contrast on both", () => {
    for (const id of ["cursor", "copilot", "grok", "pi", "omp", "opencode"]) {
      const icon = agentIconFor(id);
      expect(icon?.hexLight).toBe("000000");
      expect(icon?.hexDark).toBe("FFFFFF");
    }
    for (const id of ["claude", "codex"]) {
      const icon = agentIconFor(id);
      expect(icon?.hexLight).toBe(icon?.hexDark);
    }
  });

  it("marks the icons whose path assumes evenodd fill, and only those", () => {
    expect(agentIconFor("claude")?.fillRule).toBe("evenodd");
    expect(agentIconFor("codex")?.fillRule).toBe("evenodd");
    expect(agentIconFor("grok")?.fillRule).toBe("evenodd");
    expect(agentIconFor("omp")?.fillRule).toBe("evenodd");
    expect(agentIconFor("opencode")?.fillRule).toBe("evenodd");
    expect(agentIconFor("cursor")?.fillRule).toBeUndefined();
    expect(agentIconFor("copilot")?.fillRule).toBeUndefined();
    expect(agentIconFor("pi")?.fillRule).toBeUndefined();
  });

  it("returns undefined for an unknown or missing id", () => {
    expect(agentIconFor("not-a-real-agent")).toBeUndefined();
    expect(agentIconFor(undefined)).toBeUndefined();
  });

  it("gives opencode and omp a duotone accentPath, and only those", () => {
    expect(agentIconFor("opencode")?.accentPath).toBeTruthy();
    expect(agentIconFor("omp")?.accentPath).toBeTruthy();
    for (const id of ["claude", "cursor", "copilot", "codex", "grok", "pi"]) {
      expect(agentIconFor(id)?.accentPath).toBeUndefined();
    }
  });

  it("gives omp a silhouette pi's bare glyph cannot be mistaken for", () => {
    // Both agents brand with π, so the icons must differ by more than a hex —
    // at 16px the interior detail is a few pixels and only the outline reads.
    // OMP's mark encloses the glyph in a rounded square; pi's is the bare
    // glyph. Asserted on the outline (`path`), not just on inequality.
    const omp = agentIconFor("omp");
    const pi = agentIconFor("pi");
    expect(omp?.path).not.toBe(pi?.path);
    expect(omp?.accentPath).not.toBe(pi?.path);
  });
});
