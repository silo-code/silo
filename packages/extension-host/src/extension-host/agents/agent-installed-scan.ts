// "Found on this machine" detection for the Profiles tab (RFC 0033 R12). A
// direct probe of known install directories (`agent-install-locations.ts`) — no
// subprocess, no shell, so it never runs the user's rc file and never depends on
// the `PATH` the app happened to inherit. See that module for why `command -v`
// can't do this job from inside a GUI-launched app.
//
// Run on tab mount and explicit refresh only.

import { fsReadDir, fsStat } from "../../services/tauri-fs";
import { systemInfo } from "../../services/tauri-system";
import { homeDir } from "../platform";
import { AGENT_CATALOG } from "./agent-catalog";
import {
  candidateBinDirs,
  executableFileNames,
  nvmVersionsDir,
  type OsName,
} from "./agent-install-locations";

export interface InstalledAgent {
  /** Catalog agent id (also the profile's `assumedAgentId`). */
  id: string;
  /** Catalog display name — the created profile's `label`. */
  displayName: string;
  /** The leader name that resolved — the created profile's `command`. */
  command: string;
  /** Absolute path the probe found, for the card's subtitle. */
  resolvedPath: string;
}

/**
 * For each catalog agent, the first `leaderNames` entry found in a known
 * install directory. Agents already covered by a profile are still returned —
 * the caller filters those out so the list can update as profiles are added.
 *
 * The profile this seeds stores the bare command name, not `resolvedPath`: the
 * command is typed into a Silo terminal, which is an interactive login shell
 * with the user's real `PATH` (and their aliases). The absolute path is for
 * display only.
 */
export async function scanInstalledAgents(): Promise<InstalledAgent[]> {
  const probe = await resolveProbe();
  if (!probe) return [];

  const found = await Promise.all(
    AGENT_CATALOG.map(async (agent) => {
      for (const name of agent.leaderNames) {
        const resolvedPath = await findInDirs(name, probe);
        if (resolvedPath) {
          return {
            id: agent.id,
            displayName: agent.displayName,
            command: name,
            resolvedPath,
          } satisfies InstalledAgent;
        }
      }
      return null;
    }),
  );
  return found.filter((f): f is InstalledAgent => f !== null);
}

/** What one scan needs to look anything up: the platform and its probe list. */
interface Probe {
  os: OsName;
  dirs: string[];
}

/** The probe list for this machine, or `null` if the platform is unknowable. */
async function resolveProbe(): Promise<Probe | null> {
  let os: OsName;
  let home: string;
  try {
    const [info, resolvedHome] = await Promise.all([systemInfo(), homeDir()]);
    // `system_info` reports Rust's compile-time `OS` constant, so this is the
    // same narrowing `system-service.ts` does on the public `SystemInfo`.
    os = info.os as OsName;
    home = resolvedHome;
  } catch {
    // Without a home directory there is no per-user install location to probe,
    // and a wrong guess would report agents the user doesn't have.
    return null;
  }
  const dirs = candidateBinDirs({
    os,
    home,
    nvmBinDirs: await nvmBinDirs(home, os),
  });
  return { os, dirs };
}

/** `<home>/.nvm/versions/node/<version>/bin` for every installed version. */
async function nvmBinDirs(home: string, os: OsName): Promise<string[]> {
  if (os === "windows") return [];
  try {
    const versions = await fsReadDir(nvmVersionsDir(home));
    return versions.filter((v) => v.isDir).map((v) => `${v.path}/bin`);
  } catch {
    // nvm isn't installed — the common case, not an error.
    return [];
  }
}

/** First directory holding an executable file for `name`, in probe order. */
async function findInDirs(
  name: string,
  { os, dirs }: Probe,
): Promise<string | null> {
  for (const dir of dirs) {
    for (const filename of executableFileNames(name, os)) {
      try {
        const meta = await fsStat(`${dir}/${filename}`);
        // A directory named `claude` is not an install of `claude`.
        if (meta && !meta.isDir) return meta.path;
      } catch {
        // Unreadable directory (permissions, a dead symlink) — keep looking.
      }
    }
  }
  return null;
}
