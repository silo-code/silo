// Unit test for the host UpdateService: the Tauri seam (services/updater) and
// the native-dialog plugin are mocked, so this stays a fast, app-free unit. The
// service is a module singleton, so each test re-imports it fresh
// (`vi.resetModules`) to get clean state.

import { describe, it, expect, beforeEach, vi } from "vitest";

const seam = vi.hoisted(() => ({
  isStableApp: vi.fn(),
  checkForUpdate: vi.fn(),
  installUpdate: vi.fn(),
}));

// update-service.ts imports these for its interactive (menu) path. Hoisted +
// stable so assertions survive `vi.resetModules()`.
const dialog = vi.hoisted(() => ({
  ask: vi.fn(),
  message: vi.fn(),
}));

vi.mock("../services/updater", () => seam);
vi.mock("@tauri-apps/plugin-dialog", () => dialog);

beforeEach(() => {
  vi.resetModules();
  seam.isStableApp.mockReset();
  seam.checkForUpdate.mockReset();
  seam.installUpdate.mockReset();
  dialog.ask.mockReset();
  dialog.message.mockReset();
});

async function freshService() {
  const mod = await import("./update-service");
  return mod.getUpdateService();
}

async function freshModule() {
  return import("./update-service");
}

describe("UpdateService.check", () => {
  it("no-ops (stays idle) outside the packaged stable app", async () => {
    seam.isStableApp.mockResolvedValue(false);
    const svc = await freshService();

    await svc.check();

    expect(svc.getState()).toEqual({ phase: "idle", version: null });
    expect(seam.checkForUpdate).not.toHaveBeenCalled();
  });

  it("transitions to 'available' and records the version when a release exists", async () => {
    seam.isStableApp.mockResolvedValue(true);
    seam.checkForUpdate.mockResolvedValue({ version: "9.9.9" });
    const svc = await freshService();

    await svc.check();

    expect(svc.getState()).toEqual({ phase: "available", version: "9.9.9" });
  });

  it("transitions to 'upToDate' when there is no release", async () => {
    seam.isStableApp.mockResolvedValue(true);
    seam.checkForUpdate.mockResolvedValue(null);
    const svc = await freshService();

    await svc.check();

    expect(svc.getState()).toEqual({ phase: "upToDate", version: null });
  });

  it("transitions to 'error' when the check throws", async () => {
    seam.isStableApp.mockResolvedValue(true);
    seam.checkForUpdate.mockRejectedValue(new Error("network"));
    const svc = await freshService();

    await svc.check();

    expect(svc.getState().phase).toBe("error");
  });

  it("notifies subscribers on state change", async () => {
    seam.isStableApp.mockResolvedValue(true);
    seam.checkForUpdate.mockResolvedValue({ version: "2.0.0" });
    const svc = await freshService();
    const seen: string[] = [];
    svc.subscribe((s) => seen.push(s.phase));

    await svc.check();

    expect(seen).toContain("available");
  });
});

describe("UpdateService.installAndRelaunch", () => {
  it("installs the release found by the last check", async () => {
    const update = { version: "9.9.9" };
    seam.isStableApp.mockResolvedValue(true);
    seam.checkForUpdate.mockResolvedValue(update);
    seam.installUpdate.mockResolvedValue(undefined);
    const svc = await freshService();

    await svc.check();
    await svc.installAndRelaunch();

    expect(seam.installUpdate).toHaveBeenCalledWith(update);
  });

  it("is a no-op when no update is pending", async () => {
    const svc = await freshService();

    await svc.installAndRelaunch();

    expect(seam.installUpdate).not.toHaveBeenCalled();
  });

  it("marks the phase 'installing' while the install runs", async () => {
    const update = { version: "9.9.9" };
    seam.isStableApp.mockResolvedValue(true);
    seam.checkForUpdate.mockResolvedValue(update);
    let phaseDuringInstall: string | undefined;
    const svc = await freshService();
    seam.installUpdate.mockImplementation(async () => {
      phaseDuringInstall = svc.getState().phase;
    });

    await svc.check();
    await svc.installAndRelaunch();

    expect(phaseDuringInstall).toBe("installing");
  });

  it("does not start a second install while one is in flight (re-entry guard)", async () => {
    const update = { version: "9.9.9" };
    seam.isStableApp.mockResolvedValue(true);
    seam.checkForUpdate.mockResolvedValue(update);
    // Never resolves — keeps the first install "in flight".
    seam.installUpdate.mockReturnValue(new Promise(() => {}));
    const svc = await freshService();

    await svc.check();
    void svc.installAndRelaunch();
    await svc.installAndRelaunch(); // second click

    expect(seam.installUpdate).toHaveBeenCalledTimes(1);
  });

  it("reverts to 'available' and re-throws when the install fails", async () => {
    const update = { version: "9.9.9" };
    seam.isStableApp.mockResolvedValue(true);
    seam.checkForUpdate.mockResolvedValue(update);
    seam.installUpdate.mockRejectedValue(new Error("download failed"));
    const svc = await freshService();

    await svc.check();
    await expect(svc.installAndRelaunch()).rejects.toThrow("download failed");
    expect(svc.getState().phase).toBe("available");

    // The release is still pending, so a retry attempts the install again.
    seam.installUpdate.mockResolvedValue(undefined);
    await svc.installAndRelaunch();
    expect(seam.installUpdate).toHaveBeenCalledTimes(2);
  });
});

describe("checkForUpdatesInteractive (menu path)", () => {
  it("reports 'latest version' in dev / non-stable builds (no silent no-op)", async () => {
    seam.isStableApp.mockResolvedValue(false);
    const { checkForUpdatesInteractive } = await freshModule();

    await checkForUpdatesInteractive();

    expect(dialog.message).toHaveBeenCalledWith(
      "You're on the latest version.",
      expect.anything(),
    );
  });

  it("reports 'latest version' when up to date", async () => {
    seam.isStableApp.mockResolvedValue(true);
    seam.checkForUpdate.mockResolvedValue(null);
    const { checkForUpdatesInteractive } = await freshModule();

    await checkForUpdatesInteractive();

    expect(dialog.message).toHaveBeenCalledWith(
      "You're on the latest version.",
      expect.anything(),
    );
  });

  it("surfaces the underlying error detail when the check fails", async () => {
    seam.isStableApp.mockResolvedValue(true);
    seam.checkForUpdate.mockRejectedValue(new Error("network down"));
    const { checkForUpdatesInteractive } = await freshModule();

    await checkForUpdatesInteractive();

    const [text] = dialog.message.mock.calls[0];
    expect(text).toContain("Couldn't check for updates.");
    expect(text).toContain("network down");
  });

  it("prompts to install when a release is available", async () => {
    seam.isStableApp.mockResolvedValue(true);
    seam.checkForUpdate.mockResolvedValue({ version: "9.9.9" });
    dialog.ask.mockResolvedValue(false); // user declines
    const { checkForUpdatesInteractive } = await freshModule();

    await checkForUpdatesInteractive();

    const [text] = dialog.ask.mock.calls[0];
    expect(text).toContain("Silo 9.9.9");
    expect(seam.installUpdate).not.toHaveBeenCalled();
  });
});
