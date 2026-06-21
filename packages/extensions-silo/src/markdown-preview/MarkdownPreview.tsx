import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { EditorProps, ExtensionContext } from "@silo-code/sdk";
import { buildPreviewMenuItems } from "./menu";
import { classifyMarkdownLink } from "./links";
import { parseFrontmatter, formatFrontmatterValue } from "./frontmatter";
import "./MarkdownPreview.css";

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
  filePath,
  ctx,
}: EditorProps & { ctx: ExtensionContext }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLElement>(null);

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
      tabIndex={0}
      onClick={onClick}
      onContextMenu={onContextMenu}
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
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
