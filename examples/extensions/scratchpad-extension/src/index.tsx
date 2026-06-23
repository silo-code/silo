import { useEffect, useState } from "react";
import type { Extension, SidePanelProps } from "@silo-code/sdk";

/* -------------------------------------------------------------------------- */
/* Styles. A runtime-loaded extension's CSS isn't auto-injected (the host only  */
/* imports the JS bundle), so we inject our own <style> on activate and remove  */
/* it on deactivate. Consume only `--silo-*` design tokens so the panel themes  */
/* correctly and scales with uiFontSize.                                        */
/* -------------------------------------------------------------------------- */

const STYLE_ID = "silo-scratchpad-styles";
const STYLES = `
.scratchpad { height: 100%; padding: 8px; box-sizing: border-box; }
.scratchpad-area {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  resize: none;
  border: 1px solid var(--silo-color-border);
  border-radius: var(--silo-radius-md);
  background: var(--silo-color-input-bg);
  color: var(--silo-color-input-text);
  font-family: var(--silo-font-mono);
  font-size: var(--silo-font-size-sm);
  padding: 8px;
}
`;

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = STYLES;
  document.head.appendChild(el);
}

function removeStyles(): void {
  document.getElementById(STYLE_ID)?.remove();
}

/* -------------------------------------------------------------------------- */
/* Contribution: a notes side panel whose text persists via the panel storage.  */
/* -------------------------------------------------------------------------- */

function Scratchpad({ storage, hydrated }: SidePanelProps) {
  const [text, setText] = useState("");
  // Restore once persisted state has hydrated, and re-read if it flips.
  useEffect(() => {
    setText(storage.get<string>("text", ""));
    return storage.subscribe(() => setText(storage.get<string>("text", "")));
  }, [storage, hydrated]);
  return (
    <div className="scratchpad">
      <textarea
        className="scratchpad-area"
        value={text}
        placeholder="Jot something… (saved automatically)"
        onChange={(e) => {
          setText(e.currentTarget.value);
          storage.set("text", e.currentTarget.value);
        }}
      />
    </div>
  );
}

export const extension: Extension = {
  id: "silo.scratchpad",
  activate(ctx) {
    injectStyles();
    ctx.registerSidePanel({
      id: "scratchpad",
      location: "right",
      title: "Scratchpad",
      order: 50,
      component: Scratchpad,
    });
  },
  deactivate() {
    removeStyles();
  },
};
