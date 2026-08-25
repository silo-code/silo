#!/usr/bin/env node
// Unblock `cargo build` on Windows when session-host daemons still hold the
// dev binary open.
//
// Silo's Windows terminal backend has no separate helper binary: it re-execs
// its own `silo.exe` as a headless ConPTY daemon (`spawn_daemon` in
// `src-tauri/src/commands/session_windows.rs`). That IS the persistence
// promise — terminals outlive the app window — but it means every live daemon
// keeps `target\debug\silo.exe` mapped as its running image. Windows refuses
// to delete a mapped image ("Access is denied. (os error 5)"), so cargo's
// uplift step — which removes the old `silo.exe` before hardlinking the newly
// linked one out of `deps\` — fails, and the next `pnpm dev` can't build at
// all until someone hunts down and kills the orphaned daemons.
//
// Windows does allow *renaming* a running image; only delete/overwrite is
// blocked (this is how Chrome self-updates). So move the locked artifacts
// aside before cargo runs: the daemons keep running from the renamed file,
// their terminals stay alive, and cargo gets a clean path to write. Nothing
// is killed, so the persistence promise is preserved.
//
// Both artifacts are handled, because cargo hardlinks
// `deps\silo-<hash>.exe` to `target\debug\silo.exe` — one file under two
// names, so renaming only the second leaves the first still locked.
//
// Safe in both directions of misdetection: a false "not locked" leaves cargo
// to fail exactly as it does today (no worse), and a false "locked" just
// renames a file cargo was about to replace anyway.
//
// Scope: dev loop only. This touches `target\debug\` build artifacts, which
// are never bundled and never shipped — release builds write to
// `target\release\` and are not considered here. It is a no-op on macOS and
// Linux, where a rebuild simply replaces the inode out from under a running
// daemon and no lock exists to break.
//
// Usage (wired into the `app:dev` script):
//   node scripts/unlock-dev-binary.mjs
//   node scripts/unlock-dev-binary.mjs --dry-run   # report, change nothing

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DRY_RUN = process.argv.includes("--dry-run");
const PREFIX = "[unlock-dev-binary]";

// Suffix marking an artifact we moved aside. Kept globbable so a later run
// can sweep the ones whose daemon has since exited.
const LOCKED_SUFFIX_RE = /\.locked-\d+$/;

/** The cargo target root, honoring `CARGO_TARGET_DIR` the way cargo does. */
function targetRoot() {
  const override = process.env.CARGO_TARGET_DIR;
  if (override) return path.resolve(override);
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "src-tauri", "target");
}

/**
 * The artifacts a running daemon can pin: the uplifted `silo.exe` and the
 * `deps\silo-<hash>.exe` it is hardlinked from. The hash is cargo's stable
 * metadata hash (crate + version + features + profile), not a content hash,
 * so the deps path persists across rebuilds and can stay locked too.
 */
function candidates(debugDir) {
  const found = [path.join(debugDir, "silo.exe")];
  const depsDir = path.join(debugDir, "deps");
  let entries = [];
  try {
    entries = fs.readdirSync(depsDir);
  } catch {
    return found;
  }
  for (const name of entries) {
    if (/^silo-[0-9a-f]+\.exe$/.test(name))
      found.push(path.join(depsDir, name));
  }
  return found;
}

/**
 * Is this file held open as a running image? Probes with a write-mode open,
 * which Windows refuses with a sharing violation while any process has the
 * file mapped — non-destructive, unlike attempting the delete itself.
 * Returns null when the file simply is not there.
 */
function isLocked(file) {
  let fd;
  try {
    fd = fs.openSync(file, "r+");
    return false;
  } catch (err) {
    if (err.code === "ENOENT") return null;
    return (
      err.code === "EBUSY" || err.code === "EPERM" || err.code === "EACCES"
    );
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * Delete artifacts moved aside by earlier runs. One stays behind for as long
 * as its daemon lives, so failures here are expected and ignored — the next
 * run tries again. Returns how many were actually removed.
 */
function sweepPrevious(dirs) {
  let removed = 0;
  for (const dir of dirs) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!LOCKED_SUFFIX_RE.test(name)) continue;
      const file = path.join(dir, name);
      if (DRY_RUN) {
        console.log(`${PREFIX} would try to remove stale ${file}`);
        continue;
      }
      try {
        fs.unlinkSync(file);
        removed += 1;
      } catch {
        // Still pinned by a live daemon — leave it for a later run.
      }
    }
  }
  return removed;
}

function main() {
  if (process.platform !== "win32") return;

  const debugDir = path.join(targetRoot(), "debug");
  if (!fs.existsSync(debugDir)) return;

  const swept = sweepPrevious([debugDir, path.join(debugDir, "deps")]);
  if (swept > 0) {
    console.log(
      `${PREFIX} removed ${swept} artifact(s) whose daemon has exited`,
    );
  }

  const stamp = Date.now();
  let moved = 0;
  for (const file of candidates(debugDir)) {
    if (isLocked(file) !== true) continue;

    const aside = `${file}.locked-${stamp}`;
    if (DRY_RUN) {
      console.log(`${PREFIX} would move ${file} -> ${path.basename(aside)}`);
      moved += 1;
      continue;
    }
    try {
      fs.renameSync(file, aside);
      moved += 1;
      console.log(
        `${PREFIX} moved locked ${path.basename(file)} aside as ${path.basename(aside)}`,
      );
    } catch (err) {
      // Renaming a running image is supposed to be allowed, so this means
      // something else is wrong. Fail loudly here rather than letting cargo
      // report it as an opaque "Access is denied. (os error 5)".
      console.error(
        `${PREFIX} could not move ${file} aside: ${err.message}\n` +
          `${PREFIX} the build will fail while this file is held open. ` +
          `Check for leftover 'silo.exe --win-session-host' processes.`,
      );
      process.exit(1);
    }
  }

  if (moved > 0) {
    console.log(
      `${PREFIX} ${moved} artifact(s) still in use by session-host daemons; ` +
        `their terminals keep running and the build can proceed`,
    );
  }
}

main();
