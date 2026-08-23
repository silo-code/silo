// Integration test (Layer 2): the keyboard-shortcut chain end-to-end in the
// REAL running app — keybindings.json on disk → the file watcher → the keymap →
// `dispatchKey` → the command. Three independent layers, each of which can
// break without any unit test noticing, and whose failure is silent by nature:
// a shortcut that stops firing looks exactly like a shortcut nobody pressed.
//
// The regression this pins: a user-assigned key on a command that shipped NO
// default (no `ctx.registerKeybinding`, no menu item) — the shape of every
// third-party extension command — used to be saved and displayed by the
// Keyboard Shortcuts page but never dispatched, because `dispatchKey` only
// iterated the keybinding registry.
//
// Everything is aimed at the synthetic `automation.probe` command (armProbe /
// probeRuns ops), so the suite asserts on the shortcut chain alone and leaves
// no UI side effects. Chords use the hyper modifier set so they cannot collide
// with a real Silo binding.
//
// Requires the dev app (`pnpm dev`); SKIPS otherwise, so `pnpm test` and CI stay
// green without one. `pnpm --filter silo test:it` is the command that expects a
// live app.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { readFile, writeFile, rm } from "node:fs/promises";
import { SiloAutomation } from "./client";

const silo = new SiloAutomation();
const available = await silo.available();

if (!available) {
  // eslint-disable-next-line no-console
  console.warn(
    "[keybindings.it] no dev app reachable on :7878 — skipping. " +
      "Run `pnpm dev` to exercise this suite.",
  );
}

const PROBE = "automation.probe";

/** Two chords nothing in Silo binds — hyper + a letter. */
const CHORD_J = { metaKey: true, ctrlKey: true, altKey: true, shiftKey: true };
const KEY_J = "j";
const KEY_K = "k";
const SPEC_J = "cmd+ctrl+alt+shift+j";
const SPEC_K = "cmd+ctrl+alt+shift+k";

describe.skipIf(!available)("keyboard shortcuts", () => {
  let path: string;
  /** The user's real keybindings.json, restored verbatim in afterAll. */
  let original: string | null = null;

  /** Wait for the app's file watcher to reload keybindings.json. */
  async function waitForOverride(expected: string | null): Promise<void> {
    for (let i = 0; i < 50; i++) {
      const state = await silo.keybindingState(PROBE);
      if ((state.overrideKey ?? null) === expected) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    const state = await silo.keybindingState(PROBE);
    throw new Error(
      `keybindings.json never reloaded: expected override ${expected}, ` +
        `keymap still reports ${state.overrideKey} (${path})`,
    );
  }

  /** Replace keybindings.json and wait for the keymap to catch up. */
  async function setUserBindings(
    bindings: Array<{ command: string; key: string }>,
    expected: string | null,
  ): Promise<void> {
    await writeFile(path, `${JSON.stringify(bindings, null, 2)}\n`);
    await waitForOverride(expected);
  }

  beforeAll(async () => {
    path = (await silo.keybindingState(PROBE)).keybindingsPath;
    original = await readFile(path, "utf8").catch(() => null);
    // The suite rewrites the running identity's real keybindings.json and puts
    // it back in afterAll. Leave a copy on disk too, so an interrupted run is
    // recoverable by hand rather than having silently dropped the user's
    // shortcuts. (This is the dev identity's config root, not production.)
    if (original !== null) await writeFile(`${path}.it-backup`, original);
  });

  beforeEach(async () => {
    await silo.disarmProbeCommand();
  });

  afterAll(async () => {
    await silo.disarmProbeCommand();
    if (original === null) await rm(path, { force: true });
    else await writeFile(path, original);
    await waitForOverride(null);
    await rm(`${path}.it-backup`, { force: true });
  });

  it("fires a registry default (ctx.registerKeybinding), no user config", async () => {
    await setUserBindings([], null);
    await silo.armProbeCommand(SPEC_J);

    const state = await silo.keybindingState(PROBE);
    expect(state.registryKey).toBe(SPEC_J);
    expect(state.menuHomed).toBe(false);
    expect(state.effectiveKey).toBe(SPEC_J);

    await silo.key(KEY_J, CHORD_J);
    expect((await silo.probeCommandRuns()).runs).toBe(1);
  });

  it("fires a user override on a command that shipped NO default", async () => {
    // The regression: the Keyboard Shortcuts page binds ANY command, including
    // one with no registry default and no menu item — keybindings.json is then
    // the only record of the chord, and nothing else can dispatch it.
    await silo.armProbeCommand();
    await setUserBindings([{ command: PROBE, key: SPEC_J }], SPEC_J);

    const state = await silo.keybindingState(PROBE);
    expect(state.registryKey).toBeNull();
    expect(state.defaultKey).toBeNull();
    expect(state.menuHomed).toBe(false);
    expect(state.effectiveKey).toBe(SPEC_J);

    await silo.key(KEY_J, CHORD_J);
    expect((await silo.probeCommandRuns()).runs).toBe(1);
  });

  it("prefers a user override over the registry default", async () => {
    await silo.armProbeCommand(SPEC_J);
    await setUserBindings([{ command: PROBE, key: SPEC_K }], SPEC_K);

    await silo.key(KEY_K, CHORD_J);
    expect((await silo.probeCommandRuns()).runs).toBe(1);

    // The superseded default must go quiet, not double-bind.
    await silo.key(KEY_J, CHORD_J);
    expect((await silo.probeCommandRuns()).runs).toBe(1);
  });

  it("fires exactly once — never double-dispatches", async () => {
    await silo.armProbeCommand(SPEC_J);
    await setUserBindings([{ command: PROBE, key: SPEC_J }], SPEC_J);

    await silo.key(KEY_J, CHORD_J);
    expect((await silo.probeCommandRuns()).runs).toBe(1);
  });

  it('honors an unbind entry ("-command")', async () => {
    await silo.armProbeCommand(SPEC_J);
    await setUserBindings([{ command: `-${PROBE}`, key: "" }], null);

    expect((await silo.keybindingState(PROBE)).effectiveKey).toBeNull();
    await silo.key(KEY_J, CHORD_J);
    expect((await silo.probeCommandRuns()).runs).toBe(0);
  });

  it("does not fire on a near-miss chord (modifiers must match exactly)", async () => {
    await silo.armProbeCommand(SPEC_J);
    await setUserBindings([], null);

    await silo.key(KEY_J, { ...CHORD_J, shiftKey: false });
    await silo.key(KEY_J, { metaKey: true });
    expect((await silo.probeCommandRuns()).runs).toBe(0);
  });
});
