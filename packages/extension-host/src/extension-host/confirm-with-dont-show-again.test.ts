import { describe, it, expect } from "vitest";
import type { ExtensionStorage, UiService } from "@silo-code/sdk";
import {
  confirmWithDontShowAgain,
  resolveDialogOutcome,
} from "./confirm-with-dont-show-again";

// `ConfirmDontShowAgainMode`/`Options` (the types `opts` below satisfies) are
// public SDK types now (RFC 0029); this file only exercises the pure/host
// logic, so the fake UiService/ExtensionStorage below stay unchanged.

// `resolveDialogOutcome` is the pure decision behind the dialog's buttons
// (cancel never persists, proceed persists iff checked) — covered directly,
// no rendering needed. `confirmWithDontShowAgain`'s own logic (the
// suppression short-circuit, and threading `ui.showModal`'s result through)
// is covered against a fake `UiService`/`ExtensionStorage`; the checkbox UI
// itself lives in the component and is exercised via the `verify` skill.

function fakeStorage(initial: Record<string, unknown> = {}): ExtensionStorage {
  const bag = { ...initial };
  return {
    get: <T>(key: string, fallback?: T) =>
      (key in bag ? (bag[key] as T) : fallback) as T | undefined,
    set: (key, value) => {
      if (value === undefined) delete bag[key];
      else bag[key] = value;
    },
    keys: () => Object.keys(bag),
    subscribe: () => ({ dispose: () => {} }),
  };
}

describe("resolveDialogOutcome", () => {
  it("cancel never proceeds and never persists, even if checked", () => {
    expect(resolveDialogOutcome("cancel", true)).toEqual({
      proceed: false,
      persist: false,
    });
    expect(resolveDialogOutcome("cancel", false)).toEqual({
      proceed: false,
      persist: false,
    });
  });

  it("proceeding persists iff the checkbox was checked", () => {
    expect(resolveDialogOutcome("proceed", true)).toEqual({
      proceed: true,
      persist: true,
    });
    expect(resolveDialogOutcome("proceed", false)).toEqual({
      proceed: true,
      persist: false,
    });
  });
});

describe("confirmWithDontShowAgain", () => {
  const opts = {
    storageKey: "test.dontShowAgain",
    title: "Close workspace",
    body: "It keeps running in the background.",
    confirmLabel: "Close",
    mode: { kind: "info" as const },
  };

  it("short-circuits to true without opening a dialog once suppressed", async () => {
    const storage = fakeStorage({ [opts.storageKey]: true });
    const ui = {
      showModal: () => {
        throw new Error("should not be called once suppressed");
      },
    } as unknown as UiService;

    await expect(confirmWithDontShowAgain(ui, storage, opts)).resolves.toBe(
      true,
    );
  });

  it("opens the dialog and resolves with the user's choice when not suppressed", async () => {
    const storage = fakeStorage();
    const ui = {
      showModal: () => Promise.resolve(true),
    } as unknown as UiService;

    await expect(confirmWithDontShowAgain(ui, storage, opts)).resolves.toBe(
      true,
    );
  });

  it("treats a dismissed (undefined) result as not proceeding", async () => {
    const storage = fakeStorage();
    const ui = {
      showModal: () => Promise.resolve(undefined),
    } as unknown as UiService;

    await expect(confirmWithDontShowAgain(ui, storage, opts)).resolves.toBe(
      false,
    );
  });

  it("passes dismissible: true for confirm mode and false for info mode", async () => {
    const storage = fakeStorage();
    const seen: boolean[] = [];
    const ui = {
      showModal: (_render: unknown, options?: { dismissible?: boolean }) => {
        seen.push(Boolean(options?.dismissible));
        return Promise.resolve(true);
      },
    } as unknown as UiService;

    await confirmWithDontShowAgain(ui, storage, {
      ...opts,
      mode: { kind: "info" },
    });
    await confirmWithDontShowAgain(ui, storage, {
      ...opts,
      storageKey: "test.other",
      mode: { kind: "confirm", danger: true },
    });

    expect(seen).toEqual([false, true]);
  });
});
