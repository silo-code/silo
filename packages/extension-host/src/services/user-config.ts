import { homeDir } from "@tauri-apps/api/path";
import { getIdentifier } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { fsCreateDir } from "./tauri-fs";

// The silo user-config root, home for all hand-editable / user-owned config:
// workspaces, themes, keybindings, installed extensions.
//
// **Identity-keyed** (ADR 0022): each build is a fully isolated install, so the
// production identity (com.silo.desktop) uses ~/.config/silo and any other build
// — e.g. "Silo Dev" (com.silo.desktop.dev) — uses ~/.config/silo-<suffix>
// (~/.config/silo-dev). Everything beneath this root splits with it, which keeps
// a dev build from sharing workspaces (and their per-identity terminal sessions),
// themes, or extensions with a production install. Mirrors the app-data
// (SILO_DATA_DIR) and PTY-socket (SILO_PTY_NS) identity splits.
//
// Uses the Rust-backed fs commands rather than plugin-fs: the plugin-fs scope
// glob ("$HOME/**") does not match the hidden ".config" directory, so plugin-fs
// would silently deny access here. The std::fs-backed commands have no scope.

const STABLE_IDENTIFIER = "com.silo.desktop";

/** Map a bundle identifier to its config-root folder name under ~/.config. */
export function configRootName(identifier: string): string {
  if (identifier === STABLE_IDENTIFIER) return "silo";
  const suffix = identifier.startsWith(`${STABLE_IDENTIFIER}.`)
    ? identifier.slice(STABLE_IDENTIFIER.length + 1)
    : identifier;
  return `silo-${suffix}`;
}

let cached: string | null = null;

export async function userConfigDir(): Promise<string> {
  if (cached) return cached;
  // SILO_CONFIG_DIR lets users point the nightly channel at the stable config
  // root to share workspaces across channels without duplication.
  const override = await invoke<string | null>("app_config_dir_override");
  if (override) {
    await fsCreateDir(override);
    cached = override;
    return cached;
  }
  const home = (await homeDir()).replace(/\/+$/, "");
  const dir = `${home}/.config/${configRootName(await getIdentifier())}`;
  await fsCreateDir(dir);
  cached = dir;
  return dir;
}

export async function userConfigPath(name: string): Promise<string> {
  return `${await userConfigDir()}/${name}`;
}
