/**
 * Resolve a file-path span from terminal output to an absolute path.
 * Relative paths are resolved against the terminal's working directory
 * (which may be a git worktree or extra workspace folder), not the
 * workspace's primary folder.
 */
export function resolveTerminalFilePath(
  matched: string,
  baseDir: string,
  homeDir?: string,
): string {
  // Pull off the optional :LINE:COL suffix. We don't currently honor it
  // (editor doesn't expose a goto-line API), but stripping it ensures the
  // path resolves to a real file.
  const lineColMatch = matched.match(/^(.+?)(?::(\d+))?(?::(\d+))?$/);
  let path = lineColMatch?.[1] ?? matched;

  if (path.startsWith("~/")) {
    const home = homeDir?.replace(/\/$/, "") ?? "";
    return home ? `${home}/${path.slice(2)}` : path;
  }
  if (path.startsWith("/")) return path;

  const rel = path.replace(/^\.\//, "");
  return joinPosixPath(baseDir.replace(/\/$/, ""), rel);
}

/** Join `base` and `rel`, normalizing `.` / `..` segments (POSIX). */
function joinPosixPath(base: string, rel: string): string {
  const parts = base.split("/").filter(Boolean);
  for (const segment of rel.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return `/${parts.join("/")}`;
}
