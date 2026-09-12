/**
 * Markdown rendering for the Chat panel's transcript (RFC 0038 phase 3).
 *
 * Agents write **markdown** — bold, lists, inline code, fenced blocks — and
 * the protocol carries it as plain text in a content block. Rendering it as
 * literal characters puts `**What it shows**` on screen verbatim, which is
 * what a transcript is least able to get away with: the agent's answer *is*
 * the product.
 *
 * Deliberately narrower than `silo.markdown-preview`:
 *
 * - **No raw HTML.** No `rehype-raw`, so an agent cannot inject markup into
 *   Silo's own UI — the text is untrusted model output, and the sanitizing
 *   dance a full document preview needs is avoided by never parsing HTML at
 *   all.
 * - **No images, no mermaid, no frontmatter.** A turn is a message, not a
 *   document.
 * - **GFM on**, for tables, strikethrough and task lists, which agents use.
 *
 * Only the agent's own prose goes through here. A **user** message is rendered
 * literally: it is what they typed, and silently reinterpreting their
 * asterisks would be wrong.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function TranscriptMarkdown({ text }: { text: string }) {
  return (
    <div className="acp-chat__md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Links open in the user's browser, not inside the webview — a
          // navigated-away webview would take the whole workbench with it.
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
