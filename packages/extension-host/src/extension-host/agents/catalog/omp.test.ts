import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildOmpAgentDefinition } from "./omp";
import { buildPiAgentDefinition } from "./pi";

const MARKER = "silo-managed-agent-hook";
const TRACK_SCRIPT_REL = ".silo/agent-hooks/track-session.sh";

const deps = {
  marker: MARKER,
  trackScriptRel: TRACK_SCRIPT_REL,
  buildHookCommand: (agentId: string) => `sh "$HOME/track.sh" ${agentId}`,
};

const omp = buildOmpAgentDefinition(deps);
const pi = buildPiAgentDefinition(deps);

const ompHook = omp.resume.kind === "hook" ? omp.resume : undefined;
if (!ompHook) throw new Error("omp must resume via a hook");

describe("OMP's resume", () => {
  it("uses --resume, which is the OPPOSITE of pi's flag", () => {
    // pi's `-r`/`--resume` only opens the interactive picker and its exact
    // form is `--session <id>`; OMP's `--resume <id>` is the exact one and it
    // prints that very line on exit. Getting these backwards silently offers
    // a command that drops the user into a picker instead of their session.
    expect(ompHook.buildResumeCommand("abc123")).toBe("omp --resume abc123");
    const piHook = pi.resume.kind === "hook" ? pi.resume : undefined;
    expect(piHook?.buildResumeCommand("abc123")).toBe("pi --session abc123");
  });

  it("installs into OMP's own config home, never pi's", () => {
    expect(ompHook.configPath).toBe(
      ".omp/agent/extensions/silo-track-session.ts",
    );
    expect(ompHook.configPath).not.toContain(".pi/");
    expect(ompHook.installStrategy).toBe("pi-extension");
  });
});

describe("OMP's generated extension", () => {
  const src = ompHook.buildFileContents?.() ?? "";

  it("is produced at all — the pi-extension strategy needs file contents", () => {
    expect(src.length).toBeGreaterThan(0);
  });

  it("tags the capture script as omp, not pi", () => {
    expect(src).toContain('[script, "omp"]');
    expect(src).not.toContain('[script, "pi"]');
  });

  it("runs the one shared capture script and hands it OMP's own pid", () => {
    expect(src).toContain(TRACK_SCRIPT_REL);
    expect(src).toContain('spawn("sh"');
    expect(src).toContain("SILO_AGENT_PID: String(process.pid)");
    expect(src).toContain("session_id: sessionId");
    expect(src).toMatch(/pi\.on\("session_start"/);
  });

  it("carries the marker and a plain-language header naming OMP", () => {
    expect(src).toContain(MARKER);
    expect(src.split("\n")[0]).toMatch(
      /Silo session tracking \(getsilo\.dev\)/,
    );
    // The user reads this file in ~/.omp/agent/extensions/ — it must not tell
    // them it is tracking a pi session.
    expect(src).toContain("records which OMP session is running");
    expect(src).not.toContain("which pi session is running");
    // …and it reads as English: "an OMP session", not "a OMP session".
    expect(src).toContain("break an OMP session");
  });

  it("imports types from the package OMP actually ships", () => {
    // OMP's own bundled examples/extensions/*.ts import this specifier, and it
    // is what is installed on disk for an OMP user. The import is type-only
    // and erased before jiti runs, so this only affects an editor — but a
    // specifier that resolves to nothing is still the wrong one to write.
    expect(src).toContain('from "@oh-my-pi/pi-coding-agent"');
    expect(src).not.toContain("@earendil-works/");
  });

  it("adds no dependency, no network, and no obfuscation", () => {
    expect(src).not.toMatch(/base64|atob|eval\(|Function\(|require\(/i);
    const imports = [...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    for (const spec of imports) {
      expect(
        spec.startsWith("node:") || spec === "@oh-my-pi/pi-coding-agent",
      ).toBe(true);
    }
    expect(src).not.toMatch(/fetch\(|https?:\/\/[^\s"]*\/|writeFile/);
  });

  it("passes TypeScript syntax validation", () => {
    const dir = mkdtempSync(join(tmpdir(), "silo-omp-ext-syntax-"));
    try {
      const p = join(dir, "silo-track-session.ts");
      writeFileSync(p, src);
      execFileSync("node", ["--experimental-strip-types", "--check", p], {
        stdio: "pipe",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("differs from pi's only where it must", () => {
    const piSrc =
      pi.resume.kind === "hook" ? (pi.resume.buildFileContents?.() ?? "") : "";
    expect(src).not.toBe(piSrc);
    // Same template, same line count — the two can only drift in the
    // parameterized spots, never in structure.
    expect(src.split("\n").length).toBe(piSrc.split("\n").length);
  });
});

describe("OMP's catalog metadata", () => {
  it("declares no extraSettingsToggle", () => {
    // pi declares one because its only activity signal is off by default.
    // OMP's title state is ON by default, and its settings are YAML while
    // that mechanism reads and writes JSON — so a row would be both redundant
    // and unwritable. See the entry's contract.
    expect(omp.extraSettingsToggle).toBeUndefined();
    expect(pi.extraSettingsToggle).toBeDefined();
  });

  it("points configDirEnvVar at the variable OMP actually reads", () => {
    expect(omp.configDirEnvVar).toBe("PI_CODING_AGENT_DIR");
  });

  it("records provenance against the version it was verified on", () => {
    expect(omp.verifiedAgainstVersion).toBe("omp@18.1.10");
    expect(omp.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("takes an opening prompt positionally", () => {
    expect(omp.promptDelivery).toEqual({ kind: "argv" });
  });

  it("names the YAML settings trap in its contract", () => {
    // settings.json is a legacy path OMP migrates once and renames to .bak, so
    // anything written there is silently undone. Whoever next reaches for an
    // extraSettingsToggle needs to find that written down.
    expect(omp.contract).toContain("config.yml");
    expect(omp.contract).toContain("settings.json.bak");
  });
});
