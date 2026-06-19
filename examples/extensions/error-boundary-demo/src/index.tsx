import { useState } from "react";
import type { Extension } from "@silo-code/sdk";

const STYLE_ID = "silo-error-boundary-demo-styles";
const STYLES = `
.eb-demo {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--silo-color-text);
  font-size: var(--silo-font-size-sm);
}
.eb-demo__title {
  margin: 0;
  font-size: var(--silo-font-size-base);
  font-weight: 600;
}
.eb-demo__desc {
  margin: 0;
  line-height: 1.5;
  opacity: 0.8;
}
.eb-demo__btn {
  align-self: flex-start;
  padding: 4px 12px;
  background: var(--silo-color-err);
  color: #fff;
  border: none;
  border-radius: var(--silo-radius-sm);
  font-size: var(--silo-font-size-sm);
  cursor: pointer;
  opacity: 1;
}
.eb-demo__btn:hover { opacity: 0.85; }
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

function Crasher(): null {
  throw new Error("Intentional render crash from Error Boundary Demo");
}

function ErrorBoundaryDemoPanel() {
  const [crashed, setCrashed] = useState(false);

  return (
    <div className="eb-demo">
      <h2 className="eb-demo__title">Error Boundary Demo</h2>
      <p className="eb-demo__desc">
        Click the button below to simulate a render crash inside this side
        panel. The per-panel error boundary will catch it and show a fallback —
        other panels stay unaffected. Use the Retry button in the fallback to
        reset.
      </p>
      <button className="eb-demo__btn" onClick={() => setCrashed(true)}>
        Crash this panel
      </button>
      {crashed && <Crasher />}
    </div>
  );
}

export const extension: Extension = {
  id: "silo.error-boundary-demo",
  manifest: {
    name: "Error Boundary Demo",
    description:
      "Interactively trigger render crashes to test Silo's error boundaries.",
  },
  activate(ctx) {
    injectStyles();
    ctx.registerSidePanel({
      id: "silo.error-boundary-demo",
      location: "left",
      title: "EB Demo",
      order: 99,
      component: ErrorBoundaryDemoPanel,
    });
  },
  deactivate() {
    removeStyles();
  },
};
