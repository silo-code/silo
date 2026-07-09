import { useEffect, useId, useRef, useState } from "react";
import mermaid from "mermaid";
import { ArrowsOut } from "@phosphor-icons/react";
import type { ExtensionContext } from "@silo-code/sdk";
import "./MermaidDiagram.css";

// The design tokens a rendered diagram borrows from the active theme. Mermaid's
// "base" theme feeds these into khroma (its internal color library) to derive
// shades/tints, so they must be literal colors — khroma can't parse a raw
// `var(...)` reference. We resolve each one via getComputedStyle right before
// rendering instead (see resolveThemeColors).
const THEME_TOKENS = {
  background: "--silo-color-bg",
  primaryColor: "--silo-color-bg-hover",
  primaryTextColor: "--silo-color-text-hi",
  primaryBorderColor: "--silo-color-border-strong",
  lineColor: "--silo-color-accent",
  textColor: "--silo-color-text-hi",
  secondaryColor: "--silo-color-bg-hover",
  tertiaryColor: "--silo-color-bg-hover",
  clusterBkg: "--silo-color-bg-hover",
  clusterBorder: "--silo-color-border-strong",
  edgeLabelBackground: "--silo-color-bg",
} as const;

function resolveThemeColors(): Record<string, string> {
  const computed = getComputedStyle(document.documentElement);
  const vars: Record<string, string> = {};
  for (const [mermaidKey, cssVar] of Object.entries(THEME_TOKENS)) {
    const value = computed.getPropertyValue(cssVar).trim();
    if (value) vars[mermaidKey] = value;
  }
  return vars;
}

interface MermaidDiagramProps {
  code: string;
  ctx: ExtensionContext;
}

/**
 * Renders a ```mermaid fenced code block as an actual diagram (flowchart,
 * sequence, etc.) instead of raw text. Scales to fit the preview pane width by
 * default (see MermaidDiagram.css) — an expand button opens the same diagram
 * at full size in a scrollable modal for when the shrunk labels get too small
 * to read.
 */
export function MermaidDiagram({ code, ctx }: MermaidDiagramProps) {
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const renderSeq = useRef(0);
  const [themeVersion, setThemeVersion] = useState(0);

  // Re-render with fresh colors when the user switches themes.
  useEffect(() => {
    const sub = ctx.theme.subscribe(() => {
      // Wait a frame so ThemeInjector has applied the new CSS vars to the DOM
      // before we read them back via getComputedStyle.
      requestAnimationFrame(() => setThemeVersion((v) => v + 1));
    });
    return () => sub.dispose();
  }, [ctx]);

  useEffect(() => {
    const seq = ++renderSeq.current;
    setError(null);
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      theme: "base",
      themeVariables: {
        ...resolveThemeColors(),
        fontFamily: "var(--silo-font-ui)",
      },
    });
    mermaid
      .render(`mermaid-${reactId}-${seq}`, code)
      .then(({ svg: rendered }) => {
        if (renderSeq.current !== seq) return;
        setSvg(rendered);
      })
      .catch((err: unknown) => {
        if (renderSeq.current !== seq) return;
        setSvg(null);
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [code, reactId, themeVersion]);

  const expand = () => {
    if (!svg) return;
    void ctx.ui.showModal(
      () => (
        <div
          className="mermaid-diagram__modal-svg"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ),
      { title: "Diagram", dismissible: true, size: "lg" },
    );
  };

  if (error) {
    return (
      <div className="mermaid-diagram mermaid-diagram--error">
        <div className="mermaid-diagram__error-label">
          Mermaid diagram failed to render
        </div>
        <pre className="mermaid-diagram__error-message">{error}</pre>
        <pre className="mermaid-diagram__source">{code}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="mermaid-diagram mermaid-diagram--loading">
        Rendering diagram…
      </div>
    );
  }

  return (
    <div className="mermaid-diagram">
      <button
        type="button"
        className="mermaid-diagram__expand"
        title="Open larger"
        onClick={expand}
      >
        <ArrowsOut size={14} />
      </button>
      {/* mermaid's own SVG output — securityLevel: "strict" sanitizes label content */}
      <div
        className="mermaid-diagram__svg"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
