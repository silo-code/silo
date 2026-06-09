import { useState } from "react";
import type { Extension, ExtensionContext } from "@silo-code/sdk";

/**
 * Permissions Demo — a small, honest demonstration of Silo's workspace
 * path-scoping (ADR 0015) and the `fs:read` capability.
 *
 * It declares `"permissions": ["fs:read"]` in its manifest, so **installing it
 * shows the consent prompt**. Once granted, clicking its status-bar button runs
 * three filesystem operations and reports what the scope allowed:
 *
 *   1. read INSIDE the workspace        → allowed for any extension
 *   2. read OUTSIDE the workspace       → allowed *because* it holds `fs:read`
 *   3. write OUTSIDE the workspace      → still blocked (it never asked for `fs:write`)
 *
 * The operations are deliberately benign (listing the workspace root and /tmp,
 * a throwaway write to /tmp) — the point is to show the boundary, not to probe
 * around it. This is a teaching example, not the starter template.
 */

const STYLE_ID = "permissions-demo-styles";
const STYLES = `
.permdemo-status {
  font: inherit;
  cursor: pointer;
  background: transparent;
  border: 0;
  padding: 0 4px;
  color: inherit;
}
.permdemo-status:hover { color: var(--silo-color-text-hi); }
.permdemo-status:disabled { opacity: 0.6; cursor: default; }
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

interface CheckResult {
  /** What was attempted. */
  label: string;
  /** What happened. */
  outcome: string;
  /** True when the result matched the scope's intent (allowed or correctly blocked). */
  asExpected: boolean;
}

/**
 * Run the three scope checks against `ctx.files`. A `PathDeniedError` (thrown by
 * the host when a path is out of scope without the matching grant) surfaces as
 * the caught error's `name`.
 */
async function runScopeChecks(ctx: ExtensionContext): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 1) Read inside the workspace — allowed for any extension, no grant needed.
  try {
    const entries = await ctx.files.readDir(".");
    results.push({
      label: "Read inside workspace (.)",
      outcome: `allowed — ${entries.length} entries`,
      asExpected: true,
    });
  } catch (err) {
    results.push({
      label: "Read inside workspace (.)",
      outcome: `blocked — ${(err as Error).name} (open a folder first?)`,
      asExpected: false,
    });
  }

  // 2) Read outside the workspace — allowed *because* we declared `fs:read`.
  try {
    const entries = await ctx.files.readDir("/tmp");
    results.push({
      label: "Read outside workspace (/tmp)",
      outcome: `allowed by fs:read — ${entries.length} entries`,
      asExpected: true,
    });
  } catch (err) {
    results.push({
      label: "Read outside workspace (/tmp)",
      outcome: `blocked — ${(err as Error).name}`,
      asExpected: false,
    });
  }

  // 3) Write outside the workspace — still blocked: we never requested `fs:write`.
  try {
    await ctx.files.writeText("/tmp/silo-permissions-demo.probe", "demo");
    results.push({
      label: "Write outside workspace (/tmp)",
      outcome: "UNEXPECTEDLY allowed — fs:read should not grant writes",
      asExpected: false,
    });
  } catch (err) {
    results.push({
      label: "Write outside workspace (/tmp)",
      outcome: `correctly blocked — ${(err as Error).name}`,
      asExpected: true,
    });
  }

  return results;
}

function summarize(results: CheckResult[]): string {
  return results
    .map((r) => `${r.asExpected ? "✅" : "⚠️"} ${r.label}: ${r.outcome}`)
    .join("\n");
}

/** The status-bar button: click it to run the checks and toast the results. */
function makeStatusButton(ctx: ExtensionContext) {
  return function PermissionsDemoStatus() {
    const [busy, setBusy] = useState(false);
    return (
      <button
        className="permdemo-status"
        disabled={busy}
        title="Run the workspace-scope permission checks"
        onClick={() => {
          setBusy(true);
          void runScopeChecks(ctx)
            .then((results) => {
              const allExpected = results.every((r) => r.asExpected);
              ctx.ui.notify(allExpected ? "info" : "warn", summarize(results));
            })
            .finally(() => setBusy(false));
        }}
      >
        🔐 Permissions Demo
      </button>
    );
  };
}

export const extension: Extension = {
  id: "acme.permissions-demo",
  activate(ctx) {
    injectStyles();

    ctx.registerStatusItem({
      id: "permissions-demo.status",
      alignment: "left",
      priority: 50,
      component: makeStatusButton(ctx),
    });

    // Same action from the command surface, for parity with the button.
    ctx.registerCommand({
      id: "acme.permissions-demo.run",
      label: "Permissions Demo: Run scope checks",
      run: () => {
        void runScopeChecks(ctx).then((results) => {
          const allExpected = results.every((r) => r.asExpected);
          ctx.ui.notify(allExpected ? "info" : "warn", summarize(results));
        });
      },
    });
  },
  deactivate() {
    removeStyles();
  },
};
