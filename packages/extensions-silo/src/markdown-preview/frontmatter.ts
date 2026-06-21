// Pure frontmatter parsing — kept out of the React component so the logic is
// unit-testable. Same pattern as links.ts / match.ts.
import { parse } from "yaml";

export interface FrontmatterResult {
  /** Parsed key/value pairs from the YAML block. */
  fields: Record<string, unknown>;
  /** The markdown body with the frontmatter block removed. */
  body: string;
}

// Matches the opening `---`, a YAML block, and the closing `---` (with optional
// trailing newline). The YAML content is capture group 1.
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/**
 * If `content` opens with a YAML frontmatter block (`---…---`), parse it and
 * return the fields plus the remaining body. Returns `null` when there is no
 * frontmatter or the YAML fails to parse as a plain object.
 */
export function parseFrontmatter(content: string): FrontmatterResult | null {
  const match = FRONTMATTER_RE.exec(content);
  if (!match) return null;

  let parsed: unknown;
  try {
    parsed = parse(match[1]);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  return {
    fields: parsed as Record<string, unknown>,
    body: content.slice(match[0].length),
  };
}

/**
 * Format a single frontmatter value for display:
 * - Arrays → comma-separated string of their string representations
 * - Objects → compact JSON
 * - Everything else → String()
 */
export function formatFrontmatterValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).join(", ");
  }
  if (value !== null && typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value ?? "");
}
