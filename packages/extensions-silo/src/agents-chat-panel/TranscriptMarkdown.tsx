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
 * A **fenced block** gets chrome the rest of the markdown doesn't: a gutter
 * with copy and a per-block wrap toggle. See {@link CodeBlock}.
 *
 * Agent prose and fenced tool-call output go through here. A **user**
 * message is rendered literally: it is what they typed, and silently
 * reinterpreting their asterisks would be wrong.
 */

import {
  Children,
  cloneElement,
  isValidElement,
  memo,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowElbowDownLeft } from "@phosphor-icons/react";
import { IconButton, Tooltip } from "@silo-code/sdk";
import { codeBlockFacts } from "./code-block";
import { CopyButton } from "./CopyButton";
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

/**
 * A fenced block, with the two things the transcript was missing: a way to
 * read a long line without dragging a scrollbar, and a way to take the
 * content. Both live in a gutter down the block's right edge.
 *
 * Wrapping is a per-block toggle rather than a global setting, seeded from
 * {@link codeBlockFacts} — prose wraps, code scrolls, and one click fixes
 * either guess. The state is deliberately local and unpersisted: it is a way
 * of looking at one block in one turn, not a preference.
 */
function CodeBlock({
  node,
  children,
  ...rest
}: ComponentPropsWithoutRef<"pre"> & { node?: unknown }) {
  const { language, text, wrapped: initiallyWrapped } = codeBlockFacts(node);
  const [wrapped, setWrapped] = useState(initiallyWrapped);

  const wrapLabel = wrapped ? "Don't wrap lines" : "Wrap lines";
  return (
    <div
      className="acp-chat__code"
      data-wrap={wrapped ? "on" : "off"}
      data-language={language}
    >
      <pre {...rest}>{children}</pre>
      {/* A stacked gutter down the block's right edge, always visible — see
          the CSS. After the `<pre>` in both source and flex order: it reads
          right, and it puts the code ahead of its actions in the tab order.
          Wrap sits above copy — the toggle changes what you're looking at. */}
      <div className="acp-chat__code-actions">
        <Tooltip content={wrapLabel}>
          <IconButton
            size="sm"
            variant="toolbar"
            aria-label={wrapLabel}
            aria-pressed={wrapped}
            onClick={() => setWrapped((on) => !on)}
          >
            <ArrowElbowDownLeft size="1em" aria-hidden="true" />
          </IconButton>
        </Tooltip>
        <CopyButton
          text={text}
          label="Copy code"
          tooltip="Copy"
          variant="toolbar"
        />
      </div>
    </div>
  );
}

/**
 * Memoized on `text` alone, which is the whole of its input. Parsing markdown
 * is a full remark/rehype pipeline run per message, and the panel re-renders
 * for reasons that have nothing to do with any message's text — a workspace
 * switch flipping `onScreen`, a tool row expanding, a chunk landing at the
 * bottom of a long transcript. Without this, every one of those re-parses the
 * entire transcript, and the cost grows with the session.
 */
export const TranscriptMarkdown = memo(function TranscriptMarkdown({
  text,
}: {
  text: string;
}) {
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
          pre: CodeBlock,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
