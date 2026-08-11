export type HighlightToken = { text: string; className?: string };

const KEYWORDS = new Set([
  "import",
  "export",
  "from",
  "const",
  "let",
  "var",
  "function",
  "return",
  "interface",
  "type",
  "class",
  "extends",
  "implements",
  "if",
  "else",
  "for",
  "while",
  "new",
  "async",
  "await",
  "default",
  "as",
  "of",
  "in",
  "public",
  "private",
  "readonly",
  "static",
  "void",
  "true",
  "false",
  "null",
  "undefined",
]);

const TOKEN_RE =
  /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;

/**
 * A deliberately minimal, single-line tokenizer for the hero demo's editor
 * pane — comments, strings, numbers, and a fixed keyword list. Not a real
 * grammar (no multi-line comments, no JSX-aware parsing); good enough to
 * make small illustrative TS/TSX/JS snippets look plausible without pulling
 * in a full highlighter dependency.
 */
export function highlightLine(line: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  let lastIndex = 0;
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(line))) {
    if (match.index > lastIndex)
      tokens.push({ text: line.slice(lastIndex, match.index) });
    const [full, comment, string, number, word] = match;
    if (comment) tokens.push({ text: comment, className: "syntax-comment" });
    else if (string) tokens.push({ text: string, className: "syntax-string" });
    else if (number) tokens.push({ text: number, className: "syntax-number" });
    else if (word)
      tokens.push({
        text: word,
        className: KEYWORDS.has(word) ? "syntax-keyword" : undefined,
      });
    lastIndex = match.index + full.length;
  }
  if (lastIndex < line.length) tokens.push({ text: line.slice(lastIndex) });
  return tokens;
}

const HIGHLIGHTABLE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

/** Whether `highlightLine` should be applied — plain files (README.md, manifest.json) render as-is. */
export function isHighlightable(filename: string): boolean {
  return HIGHLIGHTABLE_EXTENSIONS.some((ext) => filename.endsWith(ext));
}
