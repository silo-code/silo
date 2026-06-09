import { appConfigDir } from "@tauri-apps/api/path";
import {
  fsReadDir,
  fsReadText,
  fsWriteText,
  fsDelete,
  fsCreateDir,
  fsPathExists,
} from "../services/tauri-fs";
import { userConfigDir } from "../services/user-config";
import type { CustomTheme, ThemeExport } from "../state/types";
import { store } from "../state/store";

async function getThemesDir(): Promise<string> {
  return `${await userConfigDir()}/themes`;
}

// One-time, non-destructive move from the legacy appConfigDir/themes location
// to ~/.config/silo/themes. Copies any file not already present in the new
// dir; leaves the originals untouched.
let migrated = false;
async function migrateLegacyThemes(newDir: string): Promise<void> {
  if (migrated) return;
  migrated = true;
  try {
    const oldDir = `${await appConfigDir()}/themes`;
    if (oldDir === newDir) return;
    let entries: { name?: string }[];
    try {
      entries = await fsReadDir(oldDir);
    } catch {
      return; // no legacy themes dir
    }
    for (const entry of entries) {
      const name = entry.name;
      if (!name?.endsWith(".json")) continue;
      const dest = `${newDir}/${name}`;
      if (await fsPathExists(dest)) continue; // don't clobber
      try {
        await fsWriteText(dest, await fsReadText(`${oldDir}/${name}`));
      } catch {
        // Skip a file that won't copy.
      }
    }
  } catch {
    // Best-effort migration; never block theme loading.
  }
}

export async function loadCustomThemes(): Promise<CustomTheme[]> {
  const dir = await getThemesDir();
  await fsCreateDir(dir);
  await migrateLegacyThemes(dir);

  let entries: { name?: string }[];
  try {
    entries = await fsReadDir(dir);
  } catch {
    return [];
  }

  const themes: CustomTheme[] = [];
  for (const entry of entries) {
    const name = entry.name;
    if (!name?.endsWith(".json")) continue;
    try {
      const text = await fsReadText(`${dir}/${name}`);
      const data = JSON.parse(text) as unknown;
      const theme = validateAndHydrate(data, name.replace(/\.json$/, ""));
      if (theme) themes.push(theme);
    } catch {
      // Skip invalid files
    }
  }
  return themes;
}

/** Load themes from disk and update the Valtio store atomically. */
export async function reloadCustomThemes(): Promise<void> {
  const themes = await loadCustomThemes();
  store.customThemes = themes;
}

export async function saveCustomTheme(theme: CustomTheme): Promise<void> {
  const dir = await getThemesDir();
  await fsCreateDir(dir);
  const exported = exportTheme(theme);
  await fsWriteText(
    `${dir}/${theme.id}.json`,
    JSON.stringify(exported, null, 2),
  );
}

export async function deleteCustomTheme(id: string): Promise<void> {
  const dir = await getThemesDir();
  await fsDelete(`${dir}/${id}.json`);
}

export function exportTheme(theme: CustomTheme): ThemeExport {
  const { id: _id, ...rest } = theme;
  return rest;
}

export function importTheme(data: unknown): CustomTheme {
  if (!data || typeof data !== "object") throw new Error("Invalid theme data");
  const d = data as Record<string, unknown>;
  if (!d.name || typeof d.name !== "string")
    throw new Error("Theme missing name");
  if (d.base !== "dark" && d.base !== "light")
    throw new Error("Theme missing valid base");
  if (!d.vars || typeof d.vars !== "object")
    throw new Error("Theme missing vars");
  return {
    id: crypto.randomUUID(),
    version: 2,
    name: d.name,
    base: d.base,
    colorScheme:
      d.colorScheme === "dark" || d.colorScheme === "light"
        ? d.colorScheme
        : d.base,
    vars: d.vars as CustomTheme["vars"],
  };
}

function validateAndHydrate(data: unknown, fileId: string): CustomTheme | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (!d.name || typeof d.name !== "string") return null;
  if (d.base !== "dark" && d.base !== "light") return null;
  if (!d.vars || typeof d.vars !== "object") return null;
  return {
    id: fileId,
    version: 2,
    name: d.name,
    base: d.base,
    colorScheme:
      d.colorScheme === "dark" || d.colorScheme === "light"
        ? d.colorScheme
        : d.base,
    vars: d.vars as CustomTheme["vars"],
  };
}
