import { describe, it, expect, vi } from "vitest";
import type { ExtensionContext } from "@silo-code/sdk";
import {
  hookInstallableAgents,
  buildTrackSessionScript,
  TRACK_SCRIPT_REL,
} from "@silo-code/extension-host/internal";
import { installerFor } from "./install-strategy";
import {
  resolveHomeDir,
  ensureTrackScript,
  selfHealInstalledHooks,
  type HookAgent,
} from "./hook-self-heal";

const HOME = "/home/test";
const catalog = hookInstallableAgents();
const claude = catalog.find((a) => a.id === "claude") as HookAgent;
const cursor = catalog.find((a) => a.id === "cursor") as HookAgent;
const claudeConfigPath = `${HOME}/${claude.resume.configPath}`;

/** In-memory `FileService` — every install strategy in this package only
 * ever calls pathExists/readText/writeText/createDir. */
function makeFileService(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  return {
    files,
    async pathExists(path: string) {
      return files.has(path);
    },
    async readText(path: string) {
      const v = files.get(path);
      if (v === undefined) throw new Error(`ENOENT: ${path}`);
      return v;
    },
    async writeText(path: string, content: string) {
      files.set(path, content);
    },
    async createDir() {
      // no-op — the in-memory map has no real directory concept
    },
  };
}

function makeCtx(
  opts: {
    os?: "macos" | "windows" | "linux";
    home?: string | null;
    files?: Record<string, string>;
  } = {},
) {
  const fileService = makeFileService(opts.files);
  const log = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    show: vi.fn(),
    clear: vi.fn(),
  };
  const homeDir =
    opts.home === null
      ? vi.fn().mockRejectedValue(new Error("no $HOME"))
      : vi.fn().mockResolvedValue(opts.home ?? HOME);
  const ctx = {
    files: fileService,
    system: {
      getInfo: vi.fn().mockResolvedValue({ os: opts.os ?? "macos" }),
      homeDir,
    },
    log,
  };
  return { ctx: ctx as unknown as ExtensionContext, fileService, log };
}

describe("resolveHomeDir", () => {
  it("resolves ctx.system.homeDir()", async () => {
    const { ctx } = makeCtx({ home: HOME });
    expect(await resolveHomeDir(ctx)).toBe(HOME);
  });

  it("resolves null rather than throwing when homeDir() rejects", async () => {
    const { ctx } = makeCtx({ home: null });
    expect(await resolveHomeDir(ctx)).toBeNull();
  });
});

describe("ensureTrackScript", () => {
  it("writes the script when the file is absent", async () => {
    const { ctx, fileService } = makeCtx();
    const wrote = await ensureTrackScript(ctx, HOME);
    expect(wrote).toBe(true);
    expect(fileService.files.get(`${HOME}/${TRACK_SCRIPT_REL}`)).toBe(
      buildTrackSessionScript(),
    );
  });

  it("writes when the existing content differs", async () => {
    const { ctx, fileService } = makeCtx({
      files: { [`${HOME}/${TRACK_SCRIPT_REL}`]: "#!/bin/sh\n# stale\n" },
    });
    const wrote = await ensureTrackScript(ctx, HOME);
    expect(wrote).toBe(true);
    expect(fileService.files.get(`${HOME}/${TRACK_SCRIPT_REL}`)).toBe(
      buildTrackSessionScript(),
    );
  });

  it("is a silent no-op when the content already matches", async () => {
    const { ctx, fileService } = makeCtx({
      files: { [`${HOME}/${TRACK_SCRIPT_REL}`]: buildTrackSessionScript() },
    });
    const writeSpy = vi.spyOn(fileService, "writeText");
    const wrote = await ensureTrackScript(ctx, HOME);
    expect(wrote).toBe(false);
    expect(writeSpy).not.toHaveBeenCalled();
  });
});

describe("selfHealInstalledHooks", () => {
  it("does nothing on Windows — no POSIX hook/config drift to heal there", async () => {
    const { ctx, fileService, log } = makeCtx({ os: "windows" });
    await selfHealInstalledHooks(ctx);
    expect(fileService.files.size).toBe(0);
    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("does nothing when $HOME can't be resolved", async () => {
    const { ctx, fileService, log } = makeCtx({ home: null });
    await selfHealInstalledHooks(ctx);
    expect(fileService.files.size).toBe(0);
    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("does nothing when no agent is installed — never installs anything new", async () => {
    const { ctx, fileService, log } = makeCtx();
    await selfHealInstalledHooks(ctx);
    expect(fileService.files.size).toBe(0);
    expect(log.info).not.toHaveBeenCalled();
  });

  it("is a silent no-op when an installed agent's hook and the shared script are both already current", async () => {
    const { ctx, log } = makeCtx();
    // Install for real, through the actual strategy, so the fixture is
    // exactly what a genuine install produces.
    await installerFor(claude.resume).write(
      ctx,
      claude.resume,
      claudeConfigPath,
      true,
    );
    await ensureTrackScript(ctx, HOME);
    log.info.mockClear();

    await selfHealInstalledHooks(ctx);
    expect(log.info).not.toHaveBeenCalled();
  });

  it("rewrites a stale shared script for an installed agent and logs it", async () => {
    const { ctx, fileService, log } = makeCtx();
    await installerFor(claude.resume).write(
      ctx,
      claude.resume,
      claudeConfigPath,
      true,
    );
    fileService.files.set(
      `${HOME}/${TRACK_SCRIPT_REL}`,
      "#!/bin/sh\n# stale\n",
    );

    await selfHealInstalledHooks(ctx);

    expect(fileService.files.get(`${HOME}/${TRACK_SCRIPT_REL}`)).toBe(
      buildTrackSessionScript(),
    );
    expect(log.info).toHaveBeenCalledTimes(1);
    expect(log.info.mock.calls[0][0]).toContain("wrote track-session.sh");
    expect(log.info.mock.calls[0][0]).not.toContain("config:");
  });

  it("repairs a drifted config entry for an installed agent and names it in the log", async () => {
    const { ctx, fileService, log } = makeCtx();
    await installerFor(claude.resume).write(
      ctx,
      claude.resume,
      claudeConfigPath,
      true,
    );
    await ensureTrackScript(ctx, HOME);
    // Simulate drift: the marker is still there (so it still reads as
    // Silo's own entry), but the command body is an older one.
    const settings = JSON.parse(
      fileService.files.get(claudeConfigPath) ?? "{}",
    );
    settings.hooks.SessionStart[0].hooks[0].command = `echo old-command # ${claude.resume.marker}`;
    fileService.files.set(claudeConfigPath, JSON.stringify(settings));

    await selfHealInstalledHooks(ctx);

    const healed = JSON.parse(fileService.files.get(claudeConfigPath) ?? "{}");
    expect(healed.hooks.SessionStart[0].hooks[0].command).toBe(
      claude.resume.buildCommand(),
    );
    expect(log.info).toHaveBeenCalledTimes(1);
    expect(log.info.mock.calls[0][0]).toContain("config: Claude Code");
    expect(log.info.mock.calls[0][0]).not.toContain("wrote track-session.sh");
  });

  it("skips an agent whose config can't even be read, without blocking the others", async () => {
    const { ctx, fileService, log } = makeCtx();
    await installerFor(claude.resume).write(
      ctx,
      claude.resume,
      claudeConfigPath,
      true,
    );
    const cursorConfigPath = `${HOME}/${cursor.resume.configPath}`;
    await installerFor(cursor.resume).write(
      ctx,
      cursor.resume,
      cursorConfigPath,
      true,
    );
    // Corrupt Claude's config; Cursor's stays healthy.
    fileService.files.set(claudeConfigPath, "{ not valid json");
    fileService.files.set(
      `${HOME}/${TRACK_SCRIPT_REL}`,
      "#!/bin/sh\n# stale\n",
    );

    await selfHealInstalledHooks(ctx);

    // The shared script still gets rewritten — Cursor's install is enough
    // to put at least one agent in the "installed" set.
    expect(fileService.files.get(`${HOME}/${TRACK_SCRIPT_REL}`)).toBe(
      buildTrackSessionScript(),
    );
    // Claude's corrupt file is left exactly as it was — never overwritten
    // just because it couldn't be parsed.
    expect(fileService.files.get(claudeConfigPath)).toBe("{ not valid json");
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("never throws — an unexpected failure is logged as a warning instead", async () => {
    const { ctx, log } = makeCtx();
    await installerFor(claude.resume).write(
      ctx,
      claude.resume,
      claudeConfigPath,
      true,
    );
    (ctx.files.writeText as ReturnType<typeof vi.fn>) = vi
      .fn()
      .mockRejectedValue(new Error("disk full"));

    await expect(selfHealInstalledHooks(ctx)).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn.mock.calls[0][0]).toContain("disk full");
  });
});
