import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, UIEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import type { EditorProps, ExtensionContext } from "@silo-code/sdk";
import { buildPreviewMenuItems } from "./menu";
import { classifyMarkdownLink } from "./links";
import { parseFrontmatter, formatFrontmatterValue } from "./frontmatter";
import { GITHUB_SANITIZE_SCHEMA } from "./sanitize-schema";
import { isExternalImageUrl, resolveLocalImagePath } from "./resolveImageSrc";
import { isValidScrollTop, scrollStorageKey } from "./scroll";
import { codeBlockLanguage, codeBlockText } from "./mermaid-block";
import { MermaidDiagram } from "./MermaidDiagram";
import "./MarkdownPreview.css";

// Matches TextViewer's Monaco scroll-save debounce.
const SCROLL_SAVE_DEBOUNCE_MS = 300;

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
  ico: "image/x-icon",
};

function mimeFromPath(p: string): string {
  return (
    MIME_BY_EXT[p.split(".").pop()?.toLowerCase() ?? ""] ??
    "application/octet-stream"
  );
}

interface MarkdownImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  ctx: ExtensionContext;
  filePath: string | null;
}

function MarkdownImage({
  src,
  alt,
  ctx,
  filePath,
  ...rest
}: MarkdownImageProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    setBlobUrl(null);
    if (!src || isExternalImageUrl(src)) return;
    const absolutePath = resolveLocalImagePath(src, filePath);
    if (!absolutePath) return;

    let cancelled = false;
    let createdUrl: string | null = null;

    ctx.files
      .readBytes(absolutePath)
      .then((bytes) => {
        if (cancelled) return;
        const blob = new Blob([bytes], { type: mimeFromPath(absolutePath) });
        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
      })
      .catch(() => {
        // Broken image indicator renders naturally when src is undefined.
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [src, filePath, ctx]);

  const effectiveSrc = isExternalImageUrl(src ?? "")
    ? src
    : (blobUrl ?? undefined);
  return <img src={effectiveSrc} alt={alt} {...rest} />;
}

function FrontmatterBlock({ fields }: { fields: Record<string, unknown> }) {
  const entries = Object.entries(fields);
  if (entries.length === 0) return null;
  return (
    <table className="markdown-preview__frontmatter">
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key}>
            <td className="markdown-preview__frontmatter-key">{key}</td>
            <td className="markdown-preview__frontmatter-value">
              {formatFrontmatterValue(value)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Read-only rendered-Markdown view of a `.md` file. Reads the file's text
 * through `ctx.files` (the public primitive — same as the text editor and image
 * viewer), re-reading when the file changes on disk, and renders it with
 * GitHub-flavored Markdown. Text is selectable with a Copy / Select All context
 * menu (Cut/Paste are inert — the preview is read-only). Registers no save
 * handler — it's a presenter.
 */
export function MarkdownPreview({
  editorId,
  filePath,
  ctx,
}: EditorProps & { ctx: ExtensionContext }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasRestoredScrollRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const scrollSaveTimerRef = useRef<number | null>(null);

  const components = useMemo(
    () => ({
      img({
        node: _node,
        src,
        alt,
        ...rest
      }: React.ImgHTMLAttributes<HTMLImageElement> & { node?: unknown }) {
        return (
          <MarkdownImage
            src={src}
            alt={alt}
            ctx={ctx}
            filePath={filePath}
            {...rest}
          />
        );
      },
      // Fenced ```mermaid blocks render as an actual diagram instead of a
      // code block. Every other language falls through to the default <pre>.
      pre({
        node: _node,
        children,
        ...rest
      }: React.HTMLAttributes<HTMLPreElement> & { node?: unknown }) {
        const codeEl = Array.isArray(children) ? children[0] : children;
        const codeProps = (
          codeEl as {
            props?: { className?: string; children?: React.ReactNode };
          }
        )?.props;
        if (codeBlockLanguage(codeProps?.className) === "mermaid") {
          return (
            <MermaidDiagram
              code={codeBlockText(codeProps?.children).replace(/\n$/, "")}
              ctx={ctx}
            />
          );
        }
        return <pre {...rest}>{children}</pre>;
      },
    }),
    [ctx, filePath],
  );

  useEffect(() => {
    if (!filePath) {
      setError("Markdown preview requires a file path.");
      return;
    }
    let cancelled = false;
    const load = () => {
      ctx.files
        .readText(filePath)
        .then((text) => {
          if (cancelled) return;
          setContent(text);
          setError(null);
        })
        .catch((err) => {
          if (!cancelled) setError(String(err));
        });
    };
    load();
    // Re-render when the file changes underneath us (external edits, the text
    // editor saving in another tab).
    const sub = ctx.files.watch(filePath, () => load());
    return () => {
      cancelled = true;
      sub.dispose();
    };
  }, [filePath]);

  // Restore the saved scroll position once, the first time content lands (the
  // article's height needs to be present before a scrollTop assignment sticks).
  // Later reloads (file-watch re-renders) don't re-trigger this.
  useEffect(() => {
    if (content === null || hasRestoredScrollRef.current) return;
    hasRestoredScrollRef.current = true;
    const saved = ctx.storage.workspace.get<number>(scrollStorageKey(editorId));
    if (!isValidScrollTop(saved)) return;
    lastScrollTopRef.current = saved;
    requestAnimationFrame(() => {
      if (containerRef.current) containerRef.current.scrollTop = saved;
    });
  }, [content, editorId, ctx]);

  // Persist the final scroll position on unmount (tab close, app quit) in case
  // a debounced save hasn't fired yet. Reads from the live-updated ref rather
  // than the DOM node, since React may have already cleared the element ref.
  useEffect(() => {
    return () => {
      if (scrollSaveTimerRef.current !== null) {
        window.clearTimeout(scrollSaveTimerRef.current);
      }
      ctx.storage.workspace.set(
        scrollStorageKey(editorId),
        lastScrollTopRef.current,
      );
    };
  }, [editorId, ctx]);

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    lastScrollTopRef.current = top;
    if (scrollSaveTimerRef.current !== null) {
      window.clearTimeout(scrollSaveTimerRef.current);
    }
    scrollSaveTimerRef.current = window.setTimeout(() => {
      ctx.storage.workspace.set(scrollStorageKey(editorId), top);
    }, SCROLL_SAVE_DEBOUNCE_MS);
  };

  const selectAll = () => {
    const el = bodyRef.current;
    const sel = window.getSelection();
    if (!el || !sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  // Route clicked links: file paths into the editor, http(s)/mailto out to the
  // OS, and `#anchors` to a scroll within the preview. `classifyMarkdownLink`
  // holds the (tested) rules; this handler is glue. Default <a> navigation
  // (which would try to load the URL into the webview) is always prevented for
  // links we recognize.
  const onClick = (e: MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest("a[href]");
    if (!anchor) return;
    const link = classifyMarkdownLink(
      anchor.getAttribute("href") ?? "",
      filePath,
    );
    // Prevent the webview from navigating for any recognized link — including
    // `ignore` (an unsupported scheme like `file:`/`javascript:`), which we
    // swallow rather than route anywhere.
    e.preventDefault();
    switch (link.kind) {
      case "anchor": {
        const target = bodyRef.current?.querySelector(
          `#${CSS.escape(link.id)}`,
        );
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
        break;
      }
      case "external":
        ctx.ui.openExternal(link.url).catch(() => {
          ctx.ui.notify("warn", "That link can't be opened.");
        });
        break;
      case "file":
        ctx.editors.open(link.path);
        break;
    }
  };

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    const selection = window.getSelection()?.toString() ?? "";
    const items = buildPreviewMenuItems({
      selection,
      onCopy: () => void navigator.clipboard.writeText(selection),
      onSelectAll: selectAll,
    });
    void ctx.ui.showMenu({ items, at: { x: e.clientX, y: e.clientY } });
  };

  return (
    <div
      className="markdown-preview"
      ref={containerRef}
      tabIndex={0}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onScroll={onScroll}
    >
      {error ? (
        <div className="placeholder error">Failed: {error}</div>
      ) : content === null ? (
        <div className="placeholder">Loading…</div>
      ) : (
        <article className="markdown-preview__body" ref={bodyRef}>
          {(() => {
            const parsed = parseFrontmatter(content);
            const body = parsed ? parsed.body : content;
            return (
              <>
                {parsed && <FrontmatterBlock fields={parsed.fields} />}
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[
                    rehypeRaw,
                    [rehypeSanitize, GITHUB_SANITIZE_SCHEMA],
                  ]}
                  components={components}
                >
                  {body}
                </ReactMarkdown>
              </>
            );
          })()}
        </article>
      )}
    </div>
  );
}
