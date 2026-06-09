import { homeDir } from "@tauri-apps/api/path";
import { fsCreateDir } from "./tauri-fs";

// The silo user-config root: ~/.config/silo. Home for all hand-editable config
// (keybindings.json, and anything else users are meant to edit directly).
// Deliberately independent of the Tauri app identifier / appConfigDir, so it
// stays stable across renames and is easy to find.
//
// Uses the Rust-backed fs commands rather than plugin-fs: the plugin-fs scope
// glob ("$HOME/**") does not match the hidden ".config" directory, so plugin-fs
// would silently deny access here. The std::fs-backed commands have no scope.

let cached: string | null = null;

export async function userConfigDir(): Promise<string> {
  if (cached) return cached;
  const home = (await homeDir()).replace(/\/+$/, "");
  const dir = `${home}/.config/silo`;
  await fsCreateDir(dir);
  cached = dir;
  return dir;
}

export async function userConfigPath(name: string): Promise<string> {
  return `${await userConfigDir()}/${name}`;
}
