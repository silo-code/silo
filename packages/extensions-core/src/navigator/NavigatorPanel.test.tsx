import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ExtensionContext, NavigatorViewProps } from "@silo-code/sdk";
import { navigatorViewRegistry } from "@silo-code/extension-host/internal";
import { NavigatorPanel } from "./NavigatorPanel";
import { NAVIGATOR_PANEL_ID } from "./navigator-views";
import {
  clearNavigatorPrefsListeners,
  navigatorPrefsService,
} from "./navigator-prefs";

// Renders through react-dom/client like StatusBar.test.tsx / ErrorBoundary.test.tsx
// (no @testing-library/react in this repo) so this exercises the real render tree
// rather than a pure-logic helper — the thing under test *is* which props a JSX
// call site passes, and both NavigatorPanel arrangements build that call site.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// A stand-in NavigatorView body that paints the two props it was given onto
// the DOM, so a test can read what NavigatorPanel actually passed down.
function ProbeView({ active, panelId }: NavigatorViewProps) {
  return (
    <span
      data-testid="probe"
      data-panel-id={panelId}
      data-active={String(active)}
    />
  );
}

function fakeCtx(): ExtensionContext {
  const store = new Map<string, unknown>();
  return {
    storage: {
      global: {
        get: <T,>(key: string, fallback?: T) =>
          store.has(key) ? (store.get(key) as T) : fallback,
        set: (key: string, value: unknown) => store.set(key, value),
        keys: () => [...store.keys()],
        subscribe: () => ({ dispose() {} }),
      },
    },
    // No toolbar items are registered below, so ContributedToolbar renders
    // null and never calls this — it only needs to satisfy the prop type.
    ui: { showMenu: async () => {} },
  } as unknown as ExtensionContext;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const disposers: Array<() => void> = [];

beforeEach(() => {
  clearNavigatorPrefsListeners();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  for (const d of disposers.splice(0)) d();
  clearNavigatorPrefsListeners();
});

describe("NavigatorPanel panelId", () => {
  it("passes the Navigator's own panel id in the one-at-a-time arrangement", () => {
    disposers.push(
      navigatorViewRegistry.register({
        id: "test.probe",
        title: "Probe",
        component: ProbeView,
      }).dispose,
    );

    act(() => {
      root!.render(<NavigatorPanel ctx={fakeCtx()} />);
    });

    const probe = host!.querySelector('[data-testid="probe"]');
    expect(probe?.getAttribute("data-panel-id")).toBe(NAVIGATOR_PANEL_ID);
    expect(probe?.getAttribute("data-active")).toBe("true");
  });

  it("passes the Navigator's own panel id to every section in the stacked arrangement", () => {
    disposers.push(
      navigatorViewRegistry.register({
        id: "test.probe-a",
        title: "A",
        component: ProbeView,
      }).dispose,
      navigatorViewRegistry.register({
        id: "test.probe-b",
        title: "B",
        component: ProbeView,
      }).dispose,
    );
    navigatorPrefsService.set({ arrangement: "stacked" });

    act(() => {
      root!.render(<NavigatorPanel ctx={fakeCtx()} />);
    });

    const probes = host!.querySelectorAll('[data-testid="probe"]');
    expect(probes.length).toBe(2);
    for (const probe of probes) {
      expect(probe.getAttribute("data-panel-id")).toBe(NAVIGATOR_PANEL_ID);
      // Stacked mode has no Active View — every mounted section gets `active`.
      expect(probe.getAttribute("data-active")).toBe("true");
    }
  });
});
