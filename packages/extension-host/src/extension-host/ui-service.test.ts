import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The pickers wrap the native Tauri dialogs; mock the plugin so we can unit-test
// the option mapping (and the toast logic) without a real OS dialog.
const openDialog = vi.fn();
const saveDialog = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openDialog(...args),
  save: (...args: unknown[]) => saveDialog(...args),
}));

// openExternal wraps the shell plugin's `open`; mock it to assert the scheme
// guard decides what reaches the OS opener.
const shellOpen = vi.fn();
vi.mock("@tauri-apps/plugin-shell", () => ({
  open: (...args: unknown[]) => shellOpen(...args),
}));

import {
  getUiService,
  isOpenableExternalUrl,
  toastStore,
  pushToast,
  dismissToast,
  runToastAction,
} from "./ui-service";

beforeEach(() => {
  openDialog.mockReset();
  saveDialog.mockReset();
  shellOpen.mockReset();
  toastStore.toasts.splice(0, toastStore.toasts.length);
});

describe("toast store", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("notify pushes a toast with the given level + message", () => {
    getUiService().notify("error", "boom");
    expect(toastStore.toasts).toEqual([
      { id: expect.any(Number), level: "error", message: "boom" },
    ]);
  });

  it("auto-dismisses after the TTL", () => {
    pushToast("info", "hi");
    expect(toastStore.toasts).toHaveLength(1);
    vi.advanceTimersByTime(4000);
    expect(toastStore.toasts).toHaveLength(0);
  });

  it("dismissToast removes only the matching toast", () => {
    pushToast("info", "a");
    pushToast("warn", "b");
    const firstId = toastStore.toasts[0].id;
    dismissToast(firstId);
    expect(toastStore.toasts.map((t) => t.message)).toEqual(["b"]);
  });

  it("assigns unique ids to stacked toasts", () => {
    pushToast("info", "a");
    pushToast("info", "b");
    const [a, b] = toastStore.toasts;
    expect(a.id).not.toBe(b.id);
  });

  it("stores a title and serializable action metadata, not the run callback", () => {
    const run = vi.fn();
    getUiService().notify("info", "msg", {
      title: "Heads up",
      actions: [{ label: "Undo", run }],
    });
    const [t] = toastStore.toasts;
    expect(t.title).toBe("Heads up");
    // Only { label, keepOpen } is persisted — the run callback stays off the proxy.
    expect(t.actions).toEqual([{ label: "Undo" }]);
    expect("run" in (t.actions![0] as object)).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("keeps an error toast up until dismissed (no auto-dismiss)", () => {
    getUiService().notify("error", "boom");
    vi.advanceTimersByTime(10_000);
    expect(toastStore.toasts).toHaveLength(1);
  });

  it("keeps a toast with actions up until dismissed", () => {
    getUiService().notify("info", "msg", {
      actions: [{ label: "Go", run: vi.fn() }],
    });
    vi.advanceTimersByTime(10_000);
    expect(toastStore.toasts).toHaveLength(1);
  });

  it("auto-dismisses a warn toast after the default TTL", () => {
    getUiService().notify("warn", "heads up");
    expect(toastStore.toasts).toHaveLength(1);
    vi.advanceTimersByTime(4000);
    expect(toastStore.toasts).toHaveLength(0);
  });

  it("treats durationMs: 0 as sticky, even for info", () => {
    getUiService().notify("info", "stay", { durationMs: 0 });
    vi.advanceTimersByTime(10_000);
    expect(toastStore.toasts).toHaveLength(1);
  });

  it("honors a positive durationMs override, even for an error", () => {
    getUiService().notify("error", "brief", { durationMs: 2000 });
    vi.advanceTimersByTime(1999);
    expect(toastStore.toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toastStore.toasts).toHaveLength(0);
  });

  it("runToastAction runs the action, then dismisses by default", () => {
    const run = vi.fn();
    getUiService().notify("error", "x", { actions: [{ label: "Retry", run }] });
    const { id } = toastStore.toasts[0];
    runToastAction(id, 0);
    expect(run).toHaveBeenCalledTimes(1);
    expect(toastStore.toasts).toHaveLength(0);
  });

  it("runToastAction keeps the toast when the action sets keepOpen", () => {
    const run = vi.fn();
    getUiService().notify("info", "x", {
      actions: [{ label: "Mark read", keepOpen: true, run }],
    });
    const { id } = toastStore.toasts[0];
    runToastAction(id, 0);
    expect(run).toHaveBeenCalledTimes(1);
    expect(toastStore.toasts).toHaveLength(1);
  });

  it("runToastAction is a no-op for an unknown toast or out-of-range index", () => {
    const run = vi.fn();
    getUiService().notify("error", "x", { actions: [{ label: "A", run }] });
    const { id } = toastStore.toasts[0];
    expect(() => runToastAction(999, 0)).not.toThrow();
    runToastAction(id, 5);
    expect(run).not.toHaveBeenCalled();
    expect(toastStore.toasts).toHaveLength(1);
  });

  it("dismissToast clears the action map so a later run is a no-op", () => {
    const run = vi.fn();
    getUiService().notify("error", "x", { actions: [{ label: "A", run }] });
    const { id } = toastStore.toasts[0];
    dismissToast(id);
    runToastAction(id, 0);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("native pickers", () => {
  it("pickFolder requests a directory and returns the chosen path", async () => {
    openDialog.mockResolvedValue("/picked/dir");
    const result = await getUiService().pickFolder({ defaultPath: "/start" });
    expect(openDialog).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      defaultPath: "/start",
    });
    expect(result).toBe("/picked/dir");
  });

  it("pickFile passes filters and returns null on cancel", async () => {
    openDialog.mockResolvedValue(null);
    const filters = [{ name: "JSON", extensions: ["json"] }];
    const result = await getUiService().pickFile({ filters });
    expect(openDialog).toHaveBeenCalledWith({
      multiple: false,
      defaultPath: undefined,
      filters,
    });
    expect(result).toBeNull();
  });

  it("savePath forwards defaultPath + filters", async () => {
    saveDialog.mockResolvedValue("/out/theme.json");
    const filters = [{ name: "JSON", extensions: ["json"] }];
    const result = await getUiService().savePath({
      defaultPath: "theme.json",
      filters,
    });
    expect(saveDialog).toHaveBeenCalledWith({
      defaultPath: "theme.json",
      filters,
    });
    expect(result).toBe("/out/theme.json");
  });

  it("coerces a non-string dialog result to null", async () => {
    saveDialog.mockResolvedValue(undefined);
    expect(await getUiService().savePath()).toBeNull();
  });
});

describe("openExternal", () => {
  it("opens http(s) and mailto URLs via the shell plugin", async () => {
    shellOpen.mockResolvedValue(undefined);
    for (const url of [
      "https://silo.dev",
      "http://example.com/x",
      "mailto:a@b.com",
    ]) {
      await getUiService().openExternal(url);
      expect(shellOpen).toHaveBeenLastCalledWith(url);
    }
    expect(shellOpen).toHaveBeenCalledTimes(3);
  });

  it("rejects other schemes without touching the opener", async () => {
    for (const url of [
      "file:///etc/passwd",
      "javascript:alert(1)",
      "tel:+15551234",
      "not a url",
    ]) {
      await expect(getUiService().openExternal(url)).rejects.toThrow();
    }
    expect(shellOpen).not.toHaveBeenCalled();
  });
});

describe("isOpenableExternalUrl", () => {
  it("allows http(s)/mailto and refuses everything else", () => {
    expect(isOpenableExternalUrl("https://x.dev")).toBe(true);
    expect(isOpenableExternalUrl("http://x.dev")).toBe(true);
    expect(isOpenableExternalUrl("mailto:a@b.com")).toBe(true);
    expect(isOpenableExternalUrl("file:///x")).toBe(false);
    expect(isOpenableExternalUrl("javascript:1")).toBe(false);
    expect(isOpenableExternalUrl("tel:+1")).toBe(false);
    expect(isOpenableExternalUrl("nonsense")).toBe(false);
  });
});
