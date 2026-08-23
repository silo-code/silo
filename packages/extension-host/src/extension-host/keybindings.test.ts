import { describe, it, expect, beforeEach, vi } from "vitest";
import { dispatchKey, keybindingRegistry } from "./keybindings";
import { commandRegistry } from "./commands";
import { menuItemRegistry } from "./menu-items";
import { setUserBindings } from "./keymap";

// Registering a menu item / changing user bindings rebuilds the native menu;
// stub the Tauri menu API so that stays inert under the test environment.
vi.mock("@tauri-apps/api/menu", () => {
  const stub = { new: async () => ({ setAsAppMenu: async () => {} }) };
  return {
    Menu: stub,
    MenuItem: stub,
    PredefinedMenuItem: stub,
    Submenu: stub,
  };
});

/** Minimal stand-in for a keydown event on the capture phase. */
function keyEvent(init: {
  code: string;
  meta?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
}) {
  return {
    code: init.code,
    metaKey: init.meta ?? false,
    ctrlKey: init.ctrl ?? false,
    altKey: init.alt ?? false,
    shiftKey: init.shift ?? false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as KeyboardEvent;
}

describe("dispatchKey", () => {
  let run: ReturnType<typeof vi.fn>;
  const disposables: Array<{ dispose: () => void }> = [];

  beforeEach(() => {
    for (const d of disposables.splice(0)) d.dispose();
    setUserBindings([]);
    run = vi.fn();
    disposables.push(
      commandRegistry.register({ id: "ext.toggle", label: "Toggle", run }),
    );
  });

  it("fires a registry binding on its default key", () => {
    disposables.push(
      keybindingRegistry.register({
        id: "ext.toggle.key",
        command: "ext.toggle",
        key: "cmd+alt+g",
      }),
    );
    const e = keyEvent({ code: "KeyG", meta: true, alt: true });

    expect(dispatchKey(e)).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("fires a user override on a command that declared no default key", () => {
    // The Keyboard Shortcuts page can bind ANY command, including one that
    // never called registerKeybinding and has no menu item — keybindings.json
    // is then the only record of the chord.
    setUserBindings([{ command: "ext.toggle", key: "cmd+alt+g" }]);
    const e = keyEvent({ code: "KeyG", meta: true, alt: true });

    expect(dispatchKey(e)).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.stopPropagation).toHaveBeenCalled();
  });

  it("ignores an override whose chord does not match", () => {
    setUserBindings([{ command: "ext.toggle", key: "cmd+alt+g" }]);

    expect(dispatchKey(keyEvent({ code: "KeyG", meta: true }))).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("does not double-fire a menu-homed command bound by the user", () => {
    // Menu-homed commands run via their native accelerator; dispatching here
    // too would fire them twice.
    disposables.push(
      menuItemRegistry.register({
        id: "ext.toggle.menu",
        menu: "view",
        command: "ext.toggle",
        label: "Toggle",
      }),
    );
    setUserBindings([{ command: "ext.toggle", key: "cmd+alt+g" }]);

    expect(dispatchKey(keyEvent({ code: "KeyG", meta: true, alt: true }))).toBe(
      false,
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("fires an override-only command exactly once", () => {
    setUserBindings([{ command: "ext.toggle", key: "cmd+alt+g" }]);
    dispatchKey(keyEvent({ code: "KeyG", meta: true, alt: true }));

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("matches a function key (spec is lowercased; the event code is not)", () => {
    setUserBindings([{ command: "ext.toggle", key: "f9" }]);

    expect(dispatchKey(keyEvent({ code: "F9" }))).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("skips a command the user also unbound", () => {
    setUserBindings([
      { command: "ext.toggle", key: "cmd+alt+g" },
      { command: "-ext.toggle", key: "" },
    ]);

    expect(dispatchKey(keyEvent({ code: "KeyG", meta: true, alt: true }))).toBe(
      false,
    );
    expect(run).not.toHaveBeenCalled();
  });
});
