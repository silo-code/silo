/**
 * Resolve a file-path span from the transcript to an absolute path.
 * Relative paths resolve against the panel's workspace folder. Same
 * `:LINE` / `:LINE:COL` strip as the terminal — the editor does not yet
 * expose a goto-line API.
 */

import { path } from "@silo-code/sdk";

export function resolveChatFilePath(
  matched: string,
  baseDir: string,
  homeDir?: string,
): string {
  const lineColMatch = matched.match(/^(.+?)(?::(\d+))?(?::(\d+))?$/);
  let p = lineColMatch?.[1] ?? matched;

  if (p.startsWith("~/")) {
    const home = homeDir?.replace(/\/$/, "") ?? "";
    return home ? path.join(home, p.slice(2)) : p;
  }
  if (path.isAbsolute(p)) return p;

  const rel = p.replace(/^\.\//, "");
  return path.join(baseDir.replace(/\/$/, ""), rel);
}
