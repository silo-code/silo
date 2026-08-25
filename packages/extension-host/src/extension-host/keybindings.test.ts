import { describe, it, expect, beforeEach, vi } from "vitest";
import { dispatchKey, keybindingRegistry, parseKeySpec } from "./keybindings";
import { commandRegistry } from "./commands";
import { menuItemRegistry } from "./menu-items";
import { setUserBindings } from "./keymap";
import { setContextKey } from "./context-keys";

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

describe("parseKeySpec", () => {
  // The stored `cmd` token means CmdOrCtrl — Cmd on macOS, Ctrl elsewhere —
  // matching what displayKey renders and what the native menu accelerator
  // resolves to. Parsing it as a literal metaKey off-Mac made every
  // JS-dispatched default (tab cycling, Cmd+`, Cmd+Shift+F) require the
  // physical Windows key, so none of them could fire on Windows or Linux.
  it("maps the primary modifier to Cmd on macOS", () => {
    const p = parseKeySpec("cmd+alt+right", true);
    expect(p).toMatchObject({ meta: true, ctrl: false, alt: true });
  });

  it("maps the primary modifier to Ctrl off macOS", () => {
    const p = parseKeySpec("cmd+alt+right", false);
    expect(p).toMatchObject({ meta: false, ctrl: true, alt: true });
  });

  it("treats every primary spelling alike", () => {
    for (const spec of [
      "cmd+k",
      "command+k",
      "cmdorctrl+k",
      "meta+k",
      "super+k",
    ]) {
      expect(parseKeySpec(spec, true)).toMatchObject({
        meta: true,
        ctrl: false,
      });
      expect(parseKeySpec(spec, false)).toMatchObject({
        meta: false,
        ctrl: true,
      });
    }
  });

  it("keeps ctrl literal on both platforms", () => {
    // A macOS user who binds Ctrl+K means Ctrl, not Cmd — and the Shortcuts
    // page records exactly what was pressed.
    expect(parseKeySpec("ctrl+k", true)).toMatchObject({
      meta: false,
      ctrl: true,
    });
    expect(parseKeySpec("ctrl+k", false)).toMatchObject({
      meta: false,
      ctrl: true,
    });
  });
});

// jsdom reports `navigator.platform === ""`, so these run the off-Mac branch:
// a `cmd+…` binding is pressed as Ctrl.
describe("dispatchKey", () => {
  let run: ReturnType<typeof vi.fn>;
  const disposables: Array<{ dispose: () => void }> = [];

  beforeEach(() => {
    for (const d of disposables.splice(0)) d.dispose();
    setUserBindings([]);
    setContextKey("terminalFocused", false);
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
    const e = keyEvent({ code: "KeyG", ctrl: true, alt: true });

    expect(dispatchKey(e)).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("fires a user override on a command that declared no default key", () => {
    // The Keyboard Shortcuts page can bind ANY command, including one that
    // never called registerKeybinding and has no menu item — keybindings.json
    // is then the only record of the chord.
    setUserBindings([{ command: "ext.toggle", key: "cmd+alt+g" }]);
    const e = keyEvent({ code: "KeyG", ctrl: true, alt: true });

    expect(dispatchKey(e)).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.stopPropagation).toHaveBeenCalled();
  });

  it("ignores an override whose chord does not match", () => {
    setUserBindings([{ command: "ext.toggle", key: "cmd+alt+g" }]);

    expect(dispatchKey(keyEvent({ code: "KeyG", ctrl: true }))).toBe(false);
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

    expect(dispatchKey(keyEvent({ code: "KeyG", ctrl: true, alt: true }))).toBe(
      false,
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("fires an override-only command exactly once", () => {
    setUserBindings([{ command: "ext.toggle", key: "cmd+alt+g" }]);
    dispatchKey(keyEvent({ code: "KeyG", ctrl: true, alt: true }));

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

    expect(dispatchKey(keyEvent({ code: "KeyG", ctrl: true, alt: true }))).toBe(
      false,
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("honors a when clause on the binding", () => {
    disposables.push(
      keybindingRegistry.register({
        id: "ext.terminal.clear.key",
        command: "ext.toggle",
        key: "cmd+k",
        when: (keys) => keys.terminalFocused,
      }),
    );
    const e = keyEvent({ code: "KeyK", ctrl: true });

    expect(dispatchKey(e)).toBe(false);
    expect(run).not.toHaveBeenCalled();

    setContextKey("terminalFocused", true);
    expect(dispatchKey(e)).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
