/**
 * Build the text to paste into the terminal for one or more file paths.
 * Each path is wrapped in POSIX single-quotes; embedded single-quotes are
 * escaped with the '\'' sequence. Multiple paths are space-separated.
 */
export function buildTerminalPaste(paths: string[]): string {
  return paths.map((p) => `'${p.replace(/'/g, "'\\''")}'`).join(" ");
}
