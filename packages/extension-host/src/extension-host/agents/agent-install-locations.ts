// Where agent CLIs actually land on disk (RFC 0033 R12) — the candidate
// directories "Found on this machine" probes, and the filenames to look for in
// each. Pure string math; the probe itself lives in `agent-installed-scan.ts`.
//
// **Why not `PATH`.** A macOS `.app` launched from Finder/Dock inherits
// launchd's minimal `PATH` (`/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin`) —
// not the one your shell builds. Measured on a developer machine, that made
// every one of the seven catalog agents invisible to `command -v`, because they
// live in `~/.local/bin`, `/opt/homebrew/bin`, and an nvm version dir. Silo's
// terminals never hit this: they run `$SHELL -l` (see `main.rs`), which
// re-derives `PATH`. This scan runs in the app process, which does not.
//
// **Why not resolve the login shell's `PATH` instead.** That is what VS Code
// does, and it works, but it costs a full interactive shell startup — measured
// at ~9s with nvm in `.zshrc` — runs the user's rc files unprompted (which RFC
// 0033 rejected under "Alternatives considered"), and still reports an
// alias-only agent as its alias text rather than a binary. Probing these
// directories took ~40ms and found one *more* agent.
//
// The cost is that this list is curated rather than derived: an agent installed
// under an unusual prefix won't be detected. That is what the hand-typed "Add an
// agent profile…" row is for — detection is a convenience, not the only way in.

/** Platform vocabulary shared with `SystemInfo["os"]`. */
export type OsName = "macos" | "linux" | "windows";

export interface CandidateBinDirsInput {
  os: OsName;
  /** Absolute home directory, as `ctx.system.homeDir()` reports it. */
  home: string;
  /**
   * Concrete `<home>/.nvm/versions/node/<version>/bin` directories found on
   * disk. Version-managed installs can't be named statically, so the caller
   * enumerates them and passes them in; probed last so a stable install wins.
   */
  nvmBinDirs?: readonly string[];
}

/** The directory nvm keeps its per-version installs under. */
export function nvmVersionsDir(home: string): string {
  return `${trimTrailingSlash(home)}/.nvm/versions/node`;
}

/**
 * Ordered, de-duplicated directories to probe for an agent binary. Order is
 * precedence: the first hit wins, so official per-user installers come before
 * package managers, and version-manager shims come last.
 *
 * Paths are joined with `/` on every platform — the Rust fs commands normalize
 * separators to POSIX for the TypeScript layer (see `normalize_path`), and
 * Windows accepts forward slashes.
 */
export function candidateBinDirs({
  os,
  home,
  nvmBinDirs = [],
}: CandidateBinDirsInput): string[] {
  const h = trimTrailingSlash(home);
  const dirs =
    os === "windows"
      ? [
          `${h}/AppData/Roaming/npm`,
          `${h}/.local/bin`,
          `${h}/.bun/bin`,
          `${h}/.cargo/bin`,
          `${h}/scoop/shims`,
          `${h}/AppData/Local/Microsoft/WindowsApps`,
          "C:/ProgramData/chocolatey/bin",
        ]
      : [
          // Official per-user install scripts (Claude Code, cursor-agent, grok,
          // `uv tool install`) all target this one.
          `${h}/.local/bin`,
          "/opt/homebrew/bin",
          "/opt/homebrew/sbin",
          "/usr/local/bin",
          `${h}/.bun/bin`,
          `${h}/.deno/bin`,
          `${h}/.cargo/bin`,
          `${h}/.volta/bin`,
          `${h}/.npm-global/bin`,
          // Grok's installer keeps its own prefix as well as `~/.local/bin`.
          `${h}/.grok/bin`,
          "/usr/bin",
          ...(os === "macos"
            ? ["/opt/local/bin"]
            : ["/home/linuxbrew/.linuxbrew/bin", `${h}/.linuxbrew/bin`]),
          // Shims resolve to whatever version is selected, so they answer
          // "installed?" correctly even though the real binary sits elsewhere.
          `${h}/.asdf/shims`,
        ];
  return dedupe([...dirs, ...nvmBinDirs]);
}

/**
 * Filenames that would constitute an install of `name` in a candidate
 * directory. POSIX has exactly one; Windows npm shims arrive as `.cmd` next to
 * an extensionless shell script, and native builds as `.exe`.
 */
export function executableFileNames(name: string, os: OsName): string[] {
  return os === "windows"
    ? [`${name}.cmd`, `${name}.exe`, `${name}.bat`, name]
    : [name];
}

function trimTrailingSlash(path: string): string {
  return path.replace(/[/\\]+$/, "");
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}
