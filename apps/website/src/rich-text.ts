export type RichToken = { text: string; className?: string };

const RICH_RE =
  /(\*\*[^*]+\*\*)|(`[^`]+`)|(\b[\w./-]+\.\w+:\d+(?:[-–]\d+)?\b)/g;

/**
 * A deliberately minimal inline-markup tokenizer for scripted terminal text —
 * `**bold**`, `` `code` ``, and bare `file.ts:12` references — so the demo's
 * agent prose and tool summaries can read like real Claude Code output
 * without pulling in a markdown renderer. Same spirit as `highlight.ts`'s
 * line tokenizer, just for prose instead of source lines.
 */
export function parseRichText(text: string): RichToken[] {
  const tokens: RichToken[] = [];
  let lastIndex = 0;
  RICH_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RICH_RE.exec(text))) {
    if (match.index > lastIndex)
      tokens.push({ text: text.slice(lastIndex, match.index) });
    const [full, bold, code, fileRef] = match;
    if (bold) tokens.push({ text: bold.slice(2, -2), className: "rich-bold" });
    else if (code)
      tokens.push({ text: code.slice(1, -1), className: "rich-code" });
    else if (fileRef)
      tokens.push({ text: fileRef, className: "rich-file-ref" });
    lastIndex = match.index + full.length;
  }
  if (lastIndex < text.length) tokens.push({ text: text.slice(lastIndex) });
  return tokens;
}
