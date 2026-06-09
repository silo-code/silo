// Which file extensions the Markdown preview claims. Kept separate from the
// extension entry so it's unit-testable without importing the React/lazy graph.

export const MARKDOWN_EXTS = new Set(["md", "markdown", "mdown", "mkd"]);

/** True if `path` is a Markdown file the preview can render. */
export function matchMarkdown(path: string | null): boolean {
  if (!path) return false;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MARKDOWN_EXTS.has(ext);
}
