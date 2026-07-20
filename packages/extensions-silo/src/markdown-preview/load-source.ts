// Where Markdown Preview gets its source text. Pure async helper so the
// live-buffer-vs-disk preference is unit-testable without mounting React.

export type LoadMarkdownSourceResult =
  | { ok: true; content: string }
  | { ok: false; error: string };

/**
 * Resolve the markdown source for a preview tab.
 *
 * Prefers the live / retained editor buffer (`getText`) so unsaved edits are
 * visible after a Text → Preview view switch. Falls back to disk when there is
 * no buffer text (clean file opened directly as Preview, or never mounted).
 */
export async function loadMarkdownSource(opts: {
  editorId: string;
  filePath: string | null;
  getText: (editorId: string) => Promise<string | undefined>;
  readText: (path: string) => Promise<string>;
}): Promise<LoadMarkdownSourceResult> {
  const live = await opts.getText(opts.editorId);
  if (live !== undefined) return { ok: true, content: live };
  if (!opts.filePath) {
    return { ok: false, error: "Markdown preview requires a file path." };
  }
  try {
    const content = await opts.readText(opts.filePath);
    return { ok: true, content };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
