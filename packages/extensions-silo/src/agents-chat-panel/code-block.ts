/**
 * What a fenced code block in a transcript is, and whether it wraps.
 *
 * Read off the **hast node** react-markdown hands every custom component
 * rather than off the rendered children: by the time a `<pre>`'s children
 * reach us they have been through `linkifyNodes`, which replaces raw strings
 * with `<LinkifiedText>` elements and so no longer carries the text to copy.
 * The node is the source the renderer itself worked from.
 */

/** The shape of a hast element/text node, narrowed to what's read here. */
interface HastNodeLike {
  readonly type?: string;
  readonly value?: string;
  readonly tagName?: string;
  readonly properties?: { readonly className?: unknown };
  readonly children?: readonly unknown[];
}

function asNode(value: unknown): HastNodeLike | undefined {
  return typeof value === "object" && value !== null
    ? (value as HastNodeLike)
    : undefined;
}

/** Concatenated text of a hast subtree — the fence's literal content. */
function nodeText(value: unknown): string {
  const node = asNode(value);
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(nodeText).join("");
}

/**
 * The fence's info string, as markdown carries it: ```` ```ts ```` arrives as
 * a `language-ts` class on the inner `<code>`. `undefined` for a bare fence.
 */
function nodeLanguage(value: unknown): string | undefined {
  const node = asNode(value);
  if (!node) return undefined;
  if (node.tagName === "code") {
    const raw = node.properties?.className;
    const classes = Array.isArray(raw)
      ? raw
      : typeof raw === "string"
        ? raw.split(/\s+/)
        : [];
    for (const cls of classes) {
      if (typeof cls === "string" && cls.startsWith("language-")) {
        const lang = cls.slice("language-".length).toLowerCase();
        if (lang.length > 0) return lang;
      }
    }
    return undefined;
  }
  for (const child of node.children ?? []) {
    const found = nodeLanguage(child);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Info strings that mean "this fence holds prose, not code". Agents reach for
 * a fence to quote a drafted message or a block of plain text as often as
 * they do to show code, and those tag it this way when they tag it at all.
 */
const PROSE_LANGUAGES = new Set([
  "text",
  "txt",
  "plain",
  "plaintext",
  "markdown",
  "md",
]);

/**
 * Whether a fence wraps before the user touches anything.
 *
 * Wrapping is right for prose and wrong for code: indentation and column
 * alignment are how a shell command or a diff stays readable, and a soft
 * wrap destroys both. An untagged (or prose-tagged) fence is the one an
 * agent used to quote text, so it wraps; anything claiming a language
 * scrolls, and the toolbar's toggle is there for when that guess is wrong.
 */
export function wrapsByDefault(language: string | undefined): boolean {
  return language === undefined || PROSE_LANGUAGES.has(language);
}

export interface CodeBlockFacts {
  /** Lowercased info string, or `undefined` for a bare fence. */
  readonly language: string | undefined;
  /** The fence's literal content, for the copy button. */
  readonly text: string;
  /** Initial state of the wrap toggle — see {@link wrapsByDefault}. */
  readonly wrapped: boolean;
}

/** Everything the code-block chrome needs, read off one `<pre>`'s hast node. */
export function codeBlockFacts(node: unknown): CodeBlockFacts {
  const language = nodeLanguage(node);
  return {
    language,
    // Markdown always terminates a fence's last line; the trailing newline is
    // an artifact of the syntax, not content the user asked to copy.
    text: nodeText(node).replace(/\n$/, ""),
    wrapped: wrapsByDefault(language),
  };
}
