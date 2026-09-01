import { describe, it, expect } from "vitest";
import {
  candidateBinDirs,
  executableFileNames,
  nvmVersionsDir,
} from "./agent-install-locations";

const HOME = "/Users/x";

describe("candidateBinDirs (RFC 0033 R12)", () => {
  it("covers the locations real agent installers use on macOS", () => {
    const dirs = candidateBinDirs({ os: "macos", home: HOME });
    // The three that between them held every agent on the machine this was
    // measured against — official install scripts, Homebrew arm64, Homebrew
    // Intel / npm's default prefix.
    expect(dirs).toContain(`${HOME}/.local/bin`);
    expect(dirs).toContain("/opt/homebrew/bin");
    expect(dirs).toContain("/usr/local/bin");
  });

  it("probes per-user install scripts before package managers", () => {
    const dirs = candidateBinDirs({ os: "macos", home: HOME });
    expect(dirs.indexOf(`${HOME}/.local/bin`)).toBeLessThan(
      dirs.indexOf("/opt/homebrew/bin"),
    );
  });

  it("appends nvm version dirs last so a stable install wins", () => {
    const nvm = `${HOME}/.nvm/versions/node/v24.19.0/bin`;
    const dirs = candidateBinDirs({
      os: "macos",
      home: HOME,
      nvmBinDirs: [nvm],
    });
    expect(dirs).toContain(nvm);
    expect(dirs.indexOf(nvm)).toBeGreaterThan(
      dirs.indexOf(`${HOME}/.local/bin`),
    );
  });

  it("de-duplicates, so a repeated nvm dir can't double the probe", () => {
    const dirs = candidateBinDirs({
      os: "macos",
      home: HOME,
      nvmBinDirs: [`${HOME}/.local/bin`],
    });
    expect(dirs.filter((d) => d === `${HOME}/.local/bin`)).toHaveLength(1);
    expect(new Set(dirs).size).toBe(dirs.length);
  });

  it("swaps MacPorts for linuxbrew off macOS", () => {
    const mac = candidateBinDirs({ os: "macos", home: HOME });
    const linux = candidateBinDirs({ os: "linux", home: HOME });
    expect(mac).toContain("/opt/local/bin");
    expect(mac).not.toContain("/home/linuxbrew/.linuxbrew/bin");
    expect(linux).toContain("/home/linuxbrew/.linuxbrew/bin");
    expect(linux).not.toContain("/opt/local/bin");
  });

  it("uses the npm prefix Windows actually installs into", () => {
    const dirs = candidateBinDirs({ os: "windows", home: "C:/Users/x" });
    expect(dirs).toContain("C:/Users/x/AppData/Roaming/npm");
    expect(dirs).not.toContain("/opt/homebrew/bin");
  });

  it("tolerates a home directory with a trailing separator", () => {
    for (const home of [`${HOME}/`, `${HOME}\\`]) {
      expect(candidateBinDirs({ os: "macos", home })).toContain(
        `${HOME}/.local/bin`,
      );
    }
  });

  it("joins with forward slashes on every platform", () => {
    const dirs = candidateBinDirs({ os: "windows", home: "C:/Users/x" });
    expect(dirs.some((d) => d.includes("\\"))).toBe(false);
  });
});

describe("executableFileNames", () => {
  it("is just the bare name on POSIX", () => {
    expect(executableFileNames("claude", "macos")).toEqual(["claude"]);
    expect(executableFileNames("claude", "linux")).toEqual(["claude"]);
  });

  it("checks the npm `.cmd` shim before the extensionless script on Windows", () => {
    const names = executableFileNames("claude", "windows");
    expect(names).toContain("claude.cmd");
    expect(names).toContain("claude.exe");
    expect(names.indexOf("claude.cmd")).toBeLessThan(names.indexOf("claude"));
  });
});

describe("nvmVersionsDir", () => {
  it("points at nvm's per-version root", () => {
    expect(nvmVersionsDir(HOME)).toBe(`${HOME}/.nvm/versions/node`);
    expect(nvmVersionsDir(`${HOME}/`)).toBe(`${HOME}/.nvm/versions/node`);
  });
});
