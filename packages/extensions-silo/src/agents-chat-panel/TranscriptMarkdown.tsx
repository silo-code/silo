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
 * Agent prose and fenced tool-call output go through here. A **user**
 * message is rendered literally: it is what they typed, and silently
 * reinterpreting their asterisks would be wrong.
 */

import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { kindFromHref } from "./link-match";
import { LinkifiedText } from "./LinkifiedText";

function linkifyNodes(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === "string") return <LinkifiedText text={child} />;
    if (!isValidElement<{ children?: ReactNode; className?: string }>(child)) {
      return child;
    }
    if (child.props.className?.includes("acp-chat__link")) return child;
    if (child.props.children == null) return child;
    return cloneElement(child, {
      children: linkifyNodes(child.props.children),
    });
  });
}

export function TranscriptMarkdown({ text }: { text: string }) {
  return (
    <div className="acp-chat__md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Marked-up like terminal links: dashed underline, ⌘/Ctrl-click
          // to open. A real <a> would navigate the webview on a plain click.
          a: ({ href, children }) =>
            href ? (
              <span
                className="acp-chat__link"
                data-acp-link={kindFromHref(href)}
                data-href={href}
              >
                {children}
              </span>
            ) : (
              <>{children}</>
            ),
          p: ({ children }) => <p>{linkifyNodes(children)}</p>,
          li: ({ children }) => <li>{linkifyNodes(children)}</li>,
          td: ({ children }) => <td>{linkifyNodes(children)}</td>,
          th: ({ children }) => <th>{linkifyNodes(children)}</th>,
          code: ({ children, className }) => (
            <code className={className}>{linkifyNodes(children)}</code>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
