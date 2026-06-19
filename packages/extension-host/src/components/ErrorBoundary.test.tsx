import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ErrorBoundary } from "./ErrorBoundary";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function Thrower({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("test render error");
  return <span>ok</span>;
}

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    act(() => {
      root!.render(
        <ErrorBoundary name="test">
          <span>hello</span>
        </ErrorBoundary>,
      );
    });
    expect(host!.textContent).toContain("hello");
  });

  it("renders fallback when child throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    act(() => {
      root!.render(
        <ErrorBoundary name="test">
          <Thrower shouldThrow />
        </ErrorBoundary>,
      );
    });
    expect(host!.textContent).toContain("test render error");
    spy.mockRestore();
  });

  it("renders custom fallback prop when provided", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    act(() => {
      root!.render(
        <ErrorBoundary fallback={<span>custom</span>}>
          <Thrower shouldThrow />
        </ErrorBoundary>,
      );
    });
    expect(host!.textContent).toBe("custom");
    spy.mockRestore();
  });

  it("renders null fallback prop without crashing", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    act(() => {
      root!.render(
        <ErrorBoundary fallback={null}>
          <Thrower shouldThrow />
        </ErrorBoundary>,
      );
    });
    expect(host!.textContent).toBe("");
    spy.mockRestore();
  });

  it("retrying resets the boundary and re-renders children", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    act(() => {
      root!.render(
        <ErrorBoundary name="test">
          <Thrower shouldThrow />
        </ErrorBoundary>,
      );
    });

    const retryBtn = host!.querySelector<HTMLButtonElement>(
      ".error-boundary-fallback__retry",
    );
    expect(retryBtn).not.toBeNull();

    act(() => {
      root!.render(
        <ErrorBoundary name="test">
          <Thrower shouldThrow={false} />
        </ErrorBoundary>,
      );
      retryBtn!.click();
    });

    expect(host!.textContent).toContain("ok");
    spy.mockRestore();
  });

  it("logs to console with the boundary name", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    act(() => {
      root!.render(
        <ErrorBoundary name="my-panel">
          <Thrower shouldThrow />
        </ErrorBoundary>,
      );
    });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("[ErrorBoundary:my-panel]"),
      expect.any(Error),
      expect.anything(),
    );
    spy.mockRestore();
  });
});
