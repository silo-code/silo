import Markdown from "react-markdown";
import type { ExtensionContext } from "@silo-code/sdk";

/**
 * Renders an untrusted markdown string (a registry README, a changelog
 * entry) inline, with no plugins: raw HTML is already not rendered by
 * react-markdown; links route through `ctx.ui.openExternal` instead of
 * navigating the webview; images are allowlisted to `https://` only. Shared
 * by `ExtensionDetail` (registry README) and the update-available modal
 * (changelog, ADR 0036).
 */
export function TrustedExternalMarkdown({
  ctx,
  children,
}: {
  ctx: Pick<ExtensionContext, "ui">;
  children: string;
}) {
  return (
    <Markdown
      components={{
        a: ({ href, children }) => (
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              if (href) void ctx.ui.openExternal(href);
            }}
          >
            {children}
          </a>
        ),
        img: ({ src, alt }) =>
          typeof src === "string" && /^https?:\/\//.test(src) ? (
            <img src={src} alt={alt ?? ""} />
          ) : null,
      }}
    >
      {children}
    </Markdown>
  );
}
