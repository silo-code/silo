/**
 * Strategy → installer registry for Settings → Agents hook Install/Uninstall.
 *
 * Each {@link HookInstallStrategy} owns one set of I/O ops. Adding a new
 * on-disk schema means a pure installer module + one entry here — not new
 * `if (strategy === …)` arms in the settings page.
 */
import type { ExtensionContext } from "@silo-code/sdk";
import type {
  AgentHookResume,
  HookInstallStrategy,
} from "@silo-code/extension-host/internal";
import {
  hasHookInstalled,
  withHookInstalled,
  withHookUninstalled,
  type ClaudeSettings,
} from "./hook-installer";
import {
  hasCursorHookInstalled,
  withCursorHookInstalled,
  withCursorHookUninstalled,
  type CursorHooksFile,
} from "./cursor-hook-installer";
import {
  buildCopilotHookFile,
  hasCopilotHookInstalled,
  type CopilotHooksFile,
} from "./copilot-hook-installer";
import {
  isForeignPiExtension,
  isPiExtensionInstalled,
  needsPiExtensionRefresh,
} from "./pi-extension-installer";
import {
  parseSettingsJsonText,
  writableSettingsOrThrow,
  type SettingsJsonRead,
} from "./settings-json";

async function readSettingsJson<T extends object>(
  ctx: ExtensionContext,
  path: string,
): Promise<SettingsJsonRead<T>> {
  if (!(await ctx.files.pathExists(path))) return { kind: "missing" };
  let text: string;
  try {
    text = await ctx.files.readText(path);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      kind: "invalid",
      message: `Could not read settings file (${detail}): ${path}`,
    };
  }
  return parseSettingsJsonText<T>(text, path);
}

async function ensureParentDir(ctx: ExtensionContext, path: string) {
  const dir = path.slice(0, path.lastIndexOf("/"));
  if (dir) await ctx.files.createDir(dir);
}

/** Per-strategy Install / Uninstall / refresh / isInstalled operations. */
export interface HookInstallOps {
  isInstalled(
    ctx: ExtensionContext,
    resume: AgentHookResume,
    path: string,
  ): Promise<boolean>;
  /** Returns whether a self-heal write occurred. */
  refreshIfDrifted(
    ctx: ExtensionContext,
    resume: AgentHookResume,
    path: string,
  ): Promise<boolean>;
  write(
    ctx: ExtensionContext,
    resume: AgentHookResume,
    path: string,
    install: boolean,
  ): Promise<void>;
}

const claudeSettingsOps: HookInstallOps = {
  async isInstalled(ctx, resume, path) {
    const read = await readSettingsJson<ClaudeSettings>(ctx, path);
    if (read.kind === "invalid") throw new Error(read.message);
    if (read.kind === "missing") return false;
    return hasHookInstalled(read.value, resume);
  },
  async refreshIfDrifted(ctx, resume, path) {
    const current = writableSettingsOrThrow(
      await readSettingsJson<ClaudeSettings>(ctx, path),
      path,
    );
    const next = withHookInstalled(current, resume);
    if (next === current) return false;
    await ctx.files.writeText(path, JSON.stringify(next, null, 2) + "\n");
    return true;
  },
  async write(ctx, resume, path, install) {
    await ensureParentDir(ctx, path);
    const current = writableSettingsOrThrow(
      await readSettingsJson<ClaudeSettings>(ctx, path),
      path,
    );
    const next = install
      ? withHookInstalled(current, resume)
      : withHookUninstalled(current, resume);
    await ctx.files.writeText(path, JSON.stringify(next, null, 2) + "\n");
  },
};

const cursorHooksJsonOps: HookInstallOps = {
  async isInstalled(ctx, resume, path) {
    const read = await readSettingsJson<CursorHooksFile>(ctx, path);
    if (read.kind === "invalid") throw new Error(read.message);
    if (read.kind === "missing") return false;
    return hasCursorHookInstalled(read.value, resume);
  },
  async refreshIfDrifted(ctx, resume, path) {
    const current = writableSettingsOrThrow(
      await readSettingsJson<CursorHooksFile>(ctx, path),
      path,
    );
    const next = withCursorHookInstalled(current, resume);
    if (next === current) return false;
    await ctx.files.writeText(path, JSON.stringify(next, null, 2) + "\n");
    return true;
  },
  async write(ctx, resume, path, install) {
    await ensureParentDir(ctx, path);
    const current = writableSettingsOrThrow(
      await readSettingsJson<CursorHooksFile>(ctx, path),
      path,
    );
    const next = install
      ? withCursorHookInstalled(current, resume)
      : withCursorHookUninstalled(current, resume);
    await ctx.files.writeText(path, JSON.stringify(next, null, 2) + "\n");
  },
};

const copilotHooksDirOps: HookInstallOps = {
  async isInstalled(ctx, resume, path) {
    const read = await readSettingsJson<CopilotHooksFile>(ctx, path);
    if (read.kind === "invalid") throw new Error(read.message);
    if (read.kind === "missing") return false;
    return hasCopilotHookInstalled(read.value, resume);
  },
  async refreshIfDrifted(ctx, resume, path) {
    const exists = await ctx.files.pathExists(path);
    const existing = exists
      ? await ctx.files.readText(path).catch(() => null)
      : null;
    if (exists && existing != null) {
      const read = parseSettingsJsonText<CopilotHooksFile>(existing, path);
      if (read.kind === "invalid") throw new Error(read.message);
    }
    const next = JSON.stringify(buildCopilotHookFile(resume), null, 2) + "\n";
    if (existing === next) return false;
    await ensureParentDir(ctx, path);
    await ctx.files.writeText(path, next);
    return true;
  },
  async write(ctx, resume, path, install) {
    await ensureParentDir(ctx, path);
    if (install) {
      if (await ctx.files.pathExists(path)) {
        const text = await ctx.files.readText(path).catch(() => null);
        if (text != null) {
          writableSettingsOrThrow(
            parseSettingsJsonText<CopilotHooksFile>(text, path),
            path,
          );
        }
      }
      const next = buildCopilotHookFile(resume);
      await ctx.files.writeText(path, JSON.stringify(next, null, 2) + "\n");
    } else if (await ctx.files.pathExists(path)) {
      await ctx.files.delete(path);
    }
  },
};

/**
 * The pi extension's source comes off the catalog descriptor, not an import of
 * the catalog itself — these installers stay pure modules driven by a
 * structural spec. A `pi-extension` entry without it is a catalog bug.
 */
function piSourceOrThrow(resume: AgentHookResume): string {
  const source = resume.buildFileContents?.();
  if (!source) {
    throw new Error(
      "pi-extension install strategy requires buildFileContents on the agent's resume descriptor",
    );
  }
  return source;
}

/**
 * Pi (ADR 0041): the "config" is a Silo-owned TypeScript extension file that
 * pi auto-loads, so install/uninstall is write-file / delete-file with no
 * schema to merge — but, because it is *code* landing in the user's agent
 * config, install refuses rather than overwrites when a file we don't own
 * already occupies the path.
 */
const piExtensionOps: HookInstallOps = {
  async isInstalled(ctx, _resume, path) {
    if (!(await ctx.files.pathExists(path))) return false;
    const text = await ctx.files.readText(path).catch(() => null);
    return isPiExtensionInstalled(text, { marker: _resume.marker });
  },
  async refreshIfDrifted(ctx, resume, path) {
    if (!(await ctx.files.pathExists(path))) return false;
    const existing = await ctx.files.readText(path).catch(() => null);
    const next = piSourceOrThrow(resume);
    if (!needsPiExtensionRefresh(existing, next, { marker: resume.marker })) {
      return false;
    }
    await ctx.files.writeText(path, next);
    return true;
  },
  async write(ctx, resume, path, install) {
    const exists = await ctx.files.pathExists(path);
    const existing = exists
      ? await ctx.files.readText(path).catch(() => null)
      : null;
    if (install) {
      if (isForeignPiExtension(existing, { marker: resume.marker })) {
        throw new Error(
          `A file Silo doesn't manage already exists at ${path}. ` +
            "Move or delete it, then install again.",
        );
      }
      await ensureParentDir(ctx, path);
      await ctx.files.writeText(path, piSourceOrThrow(resume));
    } else if (
      exists &&
      isPiExtensionInstalled(existing, { marker: resume.marker })
    ) {
      await ctx.files.delete(path);
    }
  },
};

/** Catalog `installStrategy` → I/O ops. Exhaustive over {@link HookInstallStrategy}. */
export const HOOK_INSTALLERS: Record<HookInstallStrategy, HookInstallOps> = {
  "claude-settings": claudeSettingsOps,
  "cursor-hooks-json": cursorHooksJsonOps,
  "copilot-hooks-dir": copilotHooksDirOps,
  "pi-extension": piExtensionOps,
};

export function installerFor(resume: AgentHookResume): HookInstallOps {
  return HOOK_INSTALLERS[resume.installStrategy];
}
