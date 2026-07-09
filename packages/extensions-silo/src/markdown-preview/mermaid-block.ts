// Pure logic for detecting and reading a Mermaid fenced code block out of
// react-markdown's rendered `pre > code` tree — kept out of React so it's
// unit-testable.
import type { ReactNode } from "react";

/** Extract the language tag from a code element's className (e.g. "language-mermaid" -> "mermaid"). */
export function codeBlockLanguage(
  className: string | undefined,
): string | null {
  const match = /language-(\S+)/.exec(className ?? "");
  return match?.[1] ?? null;
}

/** Flatten a code element's children (string, or nested array of strings) into raw text. */
export function codeBlockText(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(codeBlockText).join("");
  return "";
}
